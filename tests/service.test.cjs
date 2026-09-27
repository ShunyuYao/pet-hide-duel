'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {spawn}=require('node:child_process');
const {addressInfo,createService}=require('../server.cjs');
const {parseArgs,start,explain}=require('../launch-server.cjs');
const defaults=require('../game/rules');
const root=path.resolve(__dirname,'..');
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pet-duel-lan-'));const htmlPath=path.join(dir,'game.html');fs.writeFileSync(htmlPath,'<!doctype html><meta charset="utf-8"><title>LAN test</title><h1>Ready</h1>');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return htmlPath;}
test('production defaults are identical in browser and service, with no mutable shared tuning',()=>{
 const sandbox={};vm.runInNewContext(fs.readFileSync(path.join(root,'game/rules.js'),'utf8'),sandbox);
 assert.deepEqual(JSON.parse(JSON.stringify(sandbox.DuelRules)),defaults);assert.equal(defaults.rules.hp,100);assert.equal(defaults.rules.damage,34);assert.equal(defaults.rules.disconnectMs,2500);assert(Object.isFrozen(defaults.rules));assert(Object.isFrozen(defaults.limits));
});
test('address listing deduplicates IPv4 interfaces and never advertises loopback as a peer address',()=>{
 const interfaces={lo:[{address:'127.0.0.1',family:'IPv4',internal:true}],en:[{address:'192.168.1.8',family:'IPv4',internal:false},{address:'fe80::1',family:'IPv6',internal:false}],bridge:[{address:'192.168.1.8',family:4,internal:false}]};
 assert.deepEqual(addressInfo(18765,'0.0.0.0',interfaces),{version:1,port:18765,localUrl:'http://127.0.0.1:18765',lanUrls:['http://192.168.1.8:18765'],shareUrls:['http://192.168.1.8:18765']});
 assert.deepEqual(addressInfo(18765,'127.0.0.1',interfaces).lanUrls,[]);
});
test('launcher validates options and explains occupied ports',()=>{
 assert.deepEqual(parseArgs([]),{host:'0.0.0.0',port:18765,help:false});assert.equal(parseArgs(['--port','18766']).port,18766);
 for(const args of [['--port'],['--port','no'],['--port','65536'],['--host'],['--unknown']])assert.throws(()=>parseArgs(args));
 assert.match(explain({code:'EADDRINUSE'},18765),/18765.*占用/);
});
test('actual launcher serves HTML, reports its chosen port and releases the port when closed',async t=>{
 const app=await start({port:0,host:'127.0.0.1',htmlPath:fixture(t)});t.after(()=>app.close());
 const response=await fetch(app.info.localUrl);assert.equal(response.status,200);assert.match(await response.text(),/<h1>Ready<\/h1>/);
 const config=await(await fetch(app.info.localUrl+'/api/rules')).json();assert.deepEqual(config.rules,defaults.rules);
 const info=await(await fetch(app.info.localUrl+'/api/info')).json();assert.deepEqual(info,app.info);
 await assert.rejects(start({port:info.port,host:'127.0.0.1',htmlPath:fixture(t)}),e=>e.code==='EADDRINUSE');
 await app.close();await app.close();const again=createService();await again.listen(info.port,'127.0.0.1');await again.close();
});
test('launcher failure on missing game file does not leave a listener',async()=>{
 await assert.rejects(start({port:0,htmlPath:path.join(os.tmpdir(),'does-not-exist-duel-game.html')}),/build_required/);
});
test('wildcard listener serves the game through an actual local network interface',async t=>{
 const app=await start({port:0,htmlPath:fixture(t)});t.after(()=>app.close());
 assert.equal(app.server.address().address,'0.0.0.0');
 const info=await(await fetch(app.info.localUrl+'/api/info')).json();
 assert.equal(info.port,app.server.address().port);
 for(const url of info.lanUrls){const response=await fetch(url+'/health',{signal:AbortSignal.timeout(2000)});assert.deepEqual(await response.json(),{ok:true,version:1});}
 t.diagnostic(info.lanUrls.length?'Real local network interface requests passed; this is not a second physical device test.':'No non-loopback interface is available; wildcard binding was verified only.');
});
test('real launcher process handles SIGTERM and closes without opening UI',async t=>{
 const htmlPath=fixture(t),script=`require(${JSON.stringify(path.join(root,'launch-server.cjs'))}).main({argv:['--port','0','--host','127.0.0.1'],htmlPath:${JSON.stringify(htmlPath)}})`;
 const child=spawn(process.execPath,['-e',script],{cwd:root,stdio:['ignore','pipe','pipe']});let output='',errors='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>errors+=d);t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
 const exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
 const deadline=Date.now()+5000;while(!output.includes('房主打开：')&&child.exitCode===null&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));
 assert.match(output,/房主打开：http:\/\/127\.0\.0\.1:\d+/);assert.equal(errors,'');
 child.kill('SIGTERM');const result=await exit;assert.equal(result.code,0);assert.match(output,/游戏服务已关闭/);
});
