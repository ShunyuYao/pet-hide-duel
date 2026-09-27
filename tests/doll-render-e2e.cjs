'use strict';
// Node 22+. Real hidden Electron + WebGL, original private rat-doll fixtures.
// PET_DUEL_PACKS_DIR must contain rat-doll-male and rat-doll-female. Missing
// dependencies fail explicitly. No personal images are checked into source.
// Pointer behavior is exercised through native CDP Input, not dispatchEvent.
// setPose is used only to arrange/measure mathematical render-boundary cases;
// the separate pose-lock E2E covers actual host SDK import and game admission.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),REPO=path.resolve(process.env.PET_DUEL_HOST_REPO||path.join(ROOT,'../..'));
const evidence=path.join(ROOT,'evidence/doll-render');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const check=(condition,message)=>assert.ok(condition,message);

async function until(fn,label){
  const deadline=Date.now()+30000;let error;
  while(Date.now()<deadline){try{const result=await fn();if(result)return result;}catch(e){error=e;}await sleep(80);}
  throw Error('timeout: '+label+(error?' '+error.message:''));
}
async function connect(target){
  const ws=new WebSocket(target.webSocketDebuggerUrl),pending=new Map(),errors=[];let sequence=0;
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=event=>{
    const message=JSON.parse(event.data),record=pending.get(message.id);
    if(record){pending.delete(message.id);clearTimeout(record.timer);message.error?record.reject(Error(JSON.stringify(message.error))):record.resolve(message.result);}
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);
    if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='error')errors.push(message.params.args.map(a=>a.value||a.description).join(' '));
  };
  ws.onclose=()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('CDP closed'));}pending.clear();};
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},30000);
    pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));
  });
  const evaluate=async expression=>{
    const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
    return result.result.value;
  };
  await send('Runtime.enable');return {send,evaluate,errors,close:()=>ws.close()};
}
function fixture(packs,person){
  const pack=path.join(packs,'rat-doll-'+person),file=path.join(pack,'character.json');
  check(fs.existsSync(file),'real doll fixture missing: '+file);
  const spec=JSON.parse(fs.readFileSync(file)),rt=spec.realtime;
  check(rt?.renderer==='rat-doll-renderer'&&rt.dataVersion===2,'fixture must be a real dataVersion 2 doll');
  const read=relative=>{const file=path.resolve(pack,relative);check(file.startsWith(pack+path.sep),'fixture asset escapes pack');return fs.readFileSync(file);};
  return {...rt,data:JSON.parse(read(rt.data)),assets:Object.fromEntries(Object.entries(rt.assets).map(([id,file])=>[id,{contentType:file.endsWith('.json')?'application/json':file.endsWith('.webp')?'image/webp':file.endsWith('.jpg')?'image/jpeg':'image/png',dataBase64:read(file).toString('base64')}]))};
}
function pageBootstrap(){
  window.changes=0;
  window.inspectAlpha=()=>{
    const canvas=ed.exportCanvas(),w=canvas.width,h=canvas.height,rgba=canvas.getContext('2d').getImageData(0,0,w,h).data,mask=new Uint8Array(w*h);
    let area=0,border=0,biggest=0,headHash=2166136261;
    for(let i=0;i<mask.length;i++){
      if(rgba[i*4+3]>=128){mask[i]=1;area++;const x=i%w,y=Math.floor(i/w);if(x===0||y===0||x===w-1||y===h-1)border++;}
      // A central face patch excludes the shirt shoulders, whose skinned
      // upper vertices legitimately move when the arm rotates.
      if(i%w>=280&&i%w<360&&i>=w*140&&i<w*220)for(let c=0;c<4;c++){headHash^=rgba[i*4+c];headHash=Math.imul(headHash,16777619);}
    }
    const queue=new Int32Array(mask.length);
    for(let i=0;i<mask.length;i++)if(mask[i]){
      let read=0,write=1;queue[0]=i;mask[i]=0;
      while(read<write){const p=queue[read++],x=p%w,y=Math.floor(p/w);
        for(const next of [x?p-1:-1,x<w-1?p+1:-1,y?p-w:-1,y<h-1?p+w:-1])if(next>=0&&mask[next]){mask[next]=0;queue[write++]=next;}
      }biggest=Math.max(biggest,write);
    }
    return {width:w,height:h,area,connected:biggest/area,border,headHash:headHash>>>0};
  };
  window.admit=async pose=>{
    ed.setPose(pose);const canvas=ed.exportCanvas(),blob=await new Promise(resolve=>canvas.toBlob(resolve));
    const pet=await DuelUpload.normalizeFiles([new File([blob],'doll.png',{type:'image/png'})],DuelRules.limits);
    return {pose:ed.getPose(),alpha:inspectAlpha(),stats:pet.frames[0].stats,scalePercent:pet.scalePercent};
  };
  DollEditor.create({canvas:document.querySelector('canvas'),realtime:window.realtime,onChange:()=>window.changes++})
    .then(editor=>{window.ed=editor;window.ready=true;}).catch(error=>{window.bootError=error.stack;});
}
async function screenshot(c,file){
  let last;
  for(let i=0;i<4;i++){try{const {data}=await c.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(file,Buffer.from(data,'base64'));return;}catch(error){last=error;await sleep(150);}}
  throw last;
}
async function runPerson(person,realtime,build,electron){
  const out=path.join(evidence,person);fs.mkdirSync(out,{recursive:true});
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'pet-duel-doll-render-')),file=path.join(profile,'editor.html');
  const dependencies=['wall.js','geometry.js','pet.js','scale.js','upload.js','rules.js'].map(file=>fs.readFileSync(path.join(ROOT,'game',file),'utf8')).join('\n');
  fs.writeFileSync(file,'<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#edf1f4}canvas{width:480px;height:600px}</style><canvas></canvas><script>'+dependencies+'\n'+build.replace(/<\/script/gi,'<\\/script')+'\nwindow.realtime='+JSON.stringify(realtime)+';('+pageBootstrap.toString()+')();</script>');
  const child=spawn(electron,[path.join(__dirname,'helpers/doll-render-shell.cjs'),'--remote-debugging-port=0','--use-mock-keychain','--mute-audio'],{detached:true,stdio:'ignore',env:{...process.env,ELECTRON_RUN_AS_NODE:'',PET_USERDATA_DIR:profile,PET_DOLL_RENDER_PROFILE:profile,PET_DOLL_RENDER_HTML:file}});
  const report={person,fixture:'rat-doll-'+person,checks:[],poses:[],errors:[]};let c;
  const pass=label=>report.checks.push(label);
  try{
    const port=await until(()=>{const p=path.join(profile,'DevToolsActivePort');return fs.existsSync(p)&&Number(fs.readFileSync(p,'utf8').split('\n')[0]);},'dedicated CDP port');
    const target=await until(async()=>(await (await fetch('http://127.0.0.1:'+port+'/json')).json()).find(t=>t.type==='page'&&t.url.includes('editor.html')),'hidden editor');
    c=await connect(target);
    await until(()=>c.evaluate('window.ready||window.bootError'),'doll loaded');check(!await c.evaluate('window.bootError'),'real doll renderer boot failed');
    const start=await c.evaluate('ed.getPose()'),image=await c.evaluate('ed.exportCanvas().toDataURL()'),initialAlpha=await c.evaluate('inspectAlpha()');
    check(initialAlpha.area>15000&&initialAlpha.connected>=.98,'real connected transparent model');
    assert.deepEqual([initialAlpha.width,initialAlpha.height],[640,800]);
    fs.writeFileSync(path.join(out,'export-initial.png'),Buffer.from(image.split(',')[1],'base64'));await screenshot(c,path.join(out,'editor-initial.png'));pass('real photo head and garment render on transparent fixed-size export');
    for(const [id,limb] of [['handL','armL'],['handR','armR'],['footL','legL'],['footR','legR'],['elbowL','armL'],['elbowR','armR'],['kneeL','legL'],['kneeR','legR']]){
      const goal=structuredClone(start);goal[limb]={upper:id.startsWith('hand')||id.startsWith('foot')?.4:.6,lower:id.startsWith('hand')?-.9:id.startsWith('foot')?-.3:start[limb].lower};
      const target=await c.evaluate(`(()=>{ed.setPose(${JSON.stringify(goal)});return ed.getHandles().find(h=>h.id===${JSON.stringify(id)});})()`);
      await c.evaluate('ed.reset()');
      const origin=await c.evaluate(`ed.getHandles().find(h=>h.id===${JSON.stringify(id)})`);
      const x=origin.x*480,y=origin.y*600,tx=target.x*480,ty=target.y*600;
      await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});
      await c.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
      for(let i=1;i<=12;i++)await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+(tx-x)*i/12,y:y+(ty-y)*i/12,button:'left',buttons:1});
      await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:tx,y:ty,button:'left',clickCount:1});
      const moved=await c.evaluate('ed.getPose()');assert.notDeepEqual(moved[limb],start[limb],id+' real pointer drag');
      for(const other of ['armL','armR','legL','legR'])if(other!==limb)assert.deepEqual(moved[other],start[other],id+' leaves other limbs unchanged');
      assert.equal((await c.evaluate('inspectAlpha()')).headHash,initialAlpha.headHash,'camera and head stay fixed during '+id);
      pass('native pointer '+id+' changes only its chain; fixed head pixels');
      if(id==='handL'){await screenshot(c,path.join(out,'editor-dragged.png'));fs.writeFileSync(path.join(out,'export-dragged.png'),Buffer.from((await c.evaluate('ed.exportCanvas().toDataURL()')).split(',')[1],'base64'));}
    }
    const still=await c.evaluate('ed.exportCanvas().toDataURL()');await sleep(300);assert.equal(await c.evaluate('ed.exportCanvas().toDataURL()'),still);pass('no idle animation or physics drift');
    await c.evaluate('ed.reset()');assert.deepEqual(await c.evaluate('ed.getPose()'),start);assert.equal(await c.evaluate('ed.exportCanvas().toDataURL()'),image);pass('reset restores the same pose and exact exported pixels');
    const poses=[{}, {armL:{upper:1.48,lower:.18}}];
    for(const a of [-1.3,1.48])for(const b of [-2.05,.18])for(const u of [-.08,.82])for(const l of [-.95,.12])poses.push({armL:{upper:a,lower:b},armR:{upper:a,lower:b},legL:{upper:u,lower:l},legR:{upper:u,lower:l}});
    for(const pose of poses){
      const measurement=await c.evaluate('admit('+JSON.stringify(pose)+')');
      check(measurement.alpha.border===0,'extreme model must remain fully in frame');
      check(measurement.alpha.connected>=.98&&measurement.stats.connected>=.98,'raw and admitted poses stay connected');
      check(measurement.stats.area>=5000&&measurement.stats.area<=22000,'original area gate unchanged');
      report.poses.push(measurement);
    }
    pass('18 default/regression/extreme poses pass original DuelUpload fairness and stay in frame');
    check(c.errors.length===0,'renderer console errors: '+c.errors.join('\n'));
    report.passed=true;console.log('PASS doll-render '+person+': '+report.checks.length+' checks, '+report.poses.length+' poses');
  }catch(error){report.errors.push(error.stack);if(c)await screenshot(c,path.join(out,'failure.png')).catch(()=>{});throw error;}
  finally{
    report.runtimeErrors=c?.errors||[];fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
    c?.close();try{process.kill(-child.pid,'SIGTERM');}catch{}
    await Promise.race([new Promise(resolve=>child.once('exit',resolve)),sleep(2000)]);
    // Private fixture bytes live only in this test-owned isolated profile.
    fs.rmSync(profile,{recursive:true,force:true});
  }
}
(async()=>{
  const packs=process.env.PET_DUEL_PACKS_DIR;check(packs,'PET_DUEL_PACKS_DIR must point to real local rat-doll distribution fixtures');
  const fixtures={male:fixture(path.resolve(packs),'male'),female:fixture(path.resolve(packs),'female')};
  const esbuild=require(path.join(REPO,'demo/node_modules/esbuild')),electron=require(path.join(REPO,'demo/node_modules/electron'));
  const build=esbuild.buildSync({entryPoints:[path.join(ROOT,'game/doll-editor.mjs')],bundle:true,write:false,format:'iife',globalName:'DollEditor'}).outputFiles[0].text;
  for(const person of ['male','female'])await runPerson(person,fixtures[person],build,electron);
})().catch(error=>{console.error(error);process.exitCode=1;});
