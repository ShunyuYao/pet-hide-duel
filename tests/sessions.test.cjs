'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {create,encodeView,decodeView,decodePet,vector}=require('../game/sessions');
const {Match}=require('../game/match.cjs'),R=require('../game/rules'),W=require('../game/wall'),G=require('../game/geometry');
function pet(){const rgba=Buffer.alloc(192*192*4);for(let y=30;y<162;y++)for(let x=64;x<128;x++)rgba.set([80,160,120,255],(y*192+x)*4);return {name:'宠物',frames:[{name:'站立',pixels:rgba.toString('base64')}]};}
// Events carry cursors and poll returns everything after the caller's cursor, like the host
// bridge (demo/core/peer-session/manager.js): a caller that does not advance its cursor sees the
// same events again.
function pair(){const queues=[[],[]],assets=[new Map(),new Map()],sent=[[],[]],cursors=[0,0];let online=true,closed=false;const push=(i,e)=>queues[i].push({...e,cursor:++cursors[i]});
 const sdk=[0,1].map(i=>({getContext:async()=>({role:i?'guest':'host',protocol:{id:'pet-hide-duel',version:2},invitationId:'fixture',peer:{displayName:'朋友'}}),join:async()=>({status:'connected',epoch:1}),send:async m=>{if(!online)throw Error('peer_offline');sent[i].push(structuredClone(m));push(1-i,{type:'message',message:structuredClone(m)});return {status:m.lane==='latest'?'queued':'peer_received',seq:1};},poll:async({cursor=0}={})=>{await new Promise(r=>setTimeout(r,15));while(queues[i].length&&queues[i][0].cursor<=cursor-200)queues[i].shift();const events=queues[i].filter(e=>e.cursor>cursor).slice(0,200);return {events,cursor:events.length?events.at(-1).cursor:cursor,transportState:closed?'closed':online?'connected':'reconnecting',epoch:1};},transfer:async a=>{const id='asset-'+i;assets[1-i].set(id,{...a,transferId:id});push(1-i,{type:'transfer',transferId:id,purpose:a.purpose});return {transferId:id};},readTransfer:async({transferId})=>assets[i].get(transferId),leave:async()=>{closed=true;return {released:true,peerAcknowledged:true};}}));
 return {sdk,sent,gap(){push(1,{type:'resync_required',reason:'events_expired'});},offline(){online=false;},online(){online=true;}};
}
async function wait(f,ms=4000){const until=Date.now()+ms;while(!f()){if(Date.now()>until)throw Error('wait_timeout');await new Promise(r=>setTimeout(r,20));}}
test('direction vectors normalize diagonals and referee limits preparation movement too',()=>{
 assert.deepEqual(vector(new Set(['KeyD','KeyW'])),{x:Math.SQRT1_2,y:-Math.SQRT1_2});
 let now=0;const m=new Match(R.rules,()=>now);m.add('甲',decodePet(pet()));m.add('乙',decodePet(pet()));m.ready(0);m.ready(1);const before={...m.players[1].pose};now=100;
 m.command(1,{type:'move',generation:1,turn:1,x:1200,y:200});assert(Math.hypot(m.players[1].pose.x-before.x,m.players[1].pose.y-before.y)<=R.rules.speed*.1+.001);
});
test('full projected snapshots round trip with bounded latest parts and no hidden target metadata',async()=>{
 const m=new Match(R.rules,()=>4000);m.add('甲',decodePet(pet()));m.add('乙',decodePet(pet()));m.ready(0);m.ready(1);m.phase='active';const view=m.snapshot(0),parts=await encodeView(view,1);
 assert(parts.every(p=>JSON.stringify(p).length<60000));const restored=await decodeView(parts,pet());assert.deepEqual(restored,view);
 assert.equal(restored.opponent.pose,undefined);assert.equal(restored.opponent.frames,undefined);assert(view.pixels.every(([x,y])=>G.brickAt(W.bricks,m.players[1].wall,x+.5,y+.5)<0));
 await assert.rejects(decodeView([{...parts[0],data:'!'}],pet()));
});
test('guest assets go only to host, ready/commands use referee, gap and reconnect resync full state',async()=>{
 const p=pair(),states=[null,null],status=[null,null];const a=p.sdk.map((sdk,i)=>create(sdk,{onState:s=>states[i]=s,onConnection:s=>status[i]=s}));
 try{await Promise.all(a.map((v,i)=>v.start({name:i?'乙':'甲',pet:pet()})));await wait(()=>states.every(s=>s?.opponent));
 assert(!p.sent[0].some(m=>JSON.stringify(m).includes('pixels":"')));await a[0].action('ready');await a[1].action('ready');await wait(()=>states.every(s=>s?.generation===1));
 assert.equal(states[1].hiding,true);assert(states[1].pixels.length>0);assert.equal(states[0].pixels.length,0);
 const move={type:'move',generation:1,turn:1,x:1200,y:180};await a[1].action('command',move);await wait(()=>states[1].self.pose.x>870);
 p.gap();await wait(()=>p.sent[1].some(m=>m.type==='duel.sync'));p.offline();await wait(()=>status[1]==='reconnecting');p.online();await wait(()=>status[1]==='connected');
 await a[0].close();await wait(()=>status[1]==='closed');
 }finally{for(const v of a)v.dispose();}
});
test('own pixels are rebuilt locally and maximal noisy projections remain bounded without color loss',async()=>{
 const value=pet(),frames=decodePet(value),m=new Match(R.rules,()=>0);m.add('甲',frames);m.add('乙',frames);m.ready(0);m.ready(1);
 const own=m.snapshot(1),parts=await encodeView(own,2);assert(JSON.stringify(parts).length<10000);assert.deepEqual(await decodeView(parts,value),own);
 const visible={...m.snapshot(0),phase:'active',pixels:Array.from({length:22000},(_,i)=>[i%1253,Math.floor(i/1253),(Math.imul(i,0x9e3779b9)>>>0)%0x1000000])};
 const chunks=await encodeView(visible,3);assert(chunks.length<=6);assert.deepEqual((await decodeView(chunks,value)).pixels,visible.pixels);
 await assert.rejects(decodeView(chunks.slice(1),value),/invalid_snapshot/);
});
test('empty, tiny, translucent and forged image metadata cannot bypass referee asset validation',()=>{
 assert.throws(()=>decodePet({frames:[]}),/pose_count/);const bad=pet(),bytes=Buffer.from(bad.frames[0].pixels,'base64');bytes[3]=128;bad.frames[0].pixels=bytes.toString('base64');assert.throws(()=>decodePet(bad),/invalid_alpha/);
 const tiny=pet();tiny.frames[0].pixels=Buffer.alloc(192*192*4).toString('base64');tiny.frames[0].stats={area:9999};assert.throws(()=>decodePet(tiny),/area_small/);
});
test('browser artifact declares the exact two-player protocol and contains its own referee',()=>{
 const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');const page=fs.readFileSync(path.join(__dirname,'../game/page.template'),'utf8'),build=fs.readFileSync(path.join(__dirname,'../build-game.cjs'),'utf8');
 const manifest=JSON.parse(page.match(/id="pet-sdk">([^<]+)/)[1]);assert.equal(manifest.version,2);assert.deepEqual(manifest.interaction,{players:2,transport:'lan',protocol:{id:'pet-hide-duel',version:2}});assert(manifest.permissions.includes('sessions:connect'));assert(manifest.permissions.includes('character:read'));
 assert(build.includes("'match.cjs'"));assert(build.includes("'sessions.js'"));const sandbox={};sandbox.globalThis=sandbox;vm.createContext(sandbox);for(const file of ['wall.js','geometry.js','pet.js','rules.js','match.cjs','sessions.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../game',file),'utf8'),sandbox);assert.equal(typeof sandbox.DuelMatch.Match,'function');assert.equal(typeof sandbox.DuelSessions.create,'function');
});
test('session referee completes knockout/rematch; replayed command ID cannot damage twice or cross generations',async()=>{
 const p=pair(),states=[null,null];let clock=100;const a=p.sdk.map((sdk,i)=>create(sdk,{now:()=>clock,onState:s=>states[i]=s}));
 const step=async n=>{clock+=n;await new Promise(r=>setTimeout(r,140));};
 try{await Promise.all(a.map((v,i)=>v.start({name:i?'乙':'甲',pet:pet()})));await wait(()=>states.every(s=>s?.opponent));await a[0].action('ready');await a[1].action('ready');await step(400);await wait(()=>states.every(s=>s?.generation===1));
 let guestRequest;
 for(let shot=0;shot<5;shot++){
   while(states[0].phase==='prepare')await step(400);
   const shooter=states[0].shooter,target=1-shooter,point=states[target].pixels.find(([x,y])=>x>0&&y>0);assert(point,'defender sees its own body');
   const command={type:'shoot',id:'shot-'+shot,generation:states[shooter].generation,turn:states[shooter].turn,x:point[0]+.5,y:point[1]+.5};
   await a[shooter].action('command',command);await step(400);await wait(()=>states.every(s=>s.events.some(e=>e.shot===shot+1)));
   assert.equal(states[target].self.hp,Math.max(0,100-Math.ceil((shot+1)/2)*34));
   if(shooter===1){guestRequest=p.sent[1].filter(m=>m.type==='duel.request').at(-1);const hp=states[0].self.hp;await p.sdk[1].send(guestRequest);await step(400);assert.equal(states[0].self.hp,hp,'same business command remains idempotent after role switch');}
 }
 assert(states.every(s=>s.phase==='ended'&&s.winner===0));await a[0].action('ready');await a[1].action('ready');await step(400);await wait(()=>states.every(s=>s.generation===2));assert(states.every(s=>s.self.hp===100));
 await p.sdk[1].send(guestRequest);await step(400);assert(states.every(s=>s.self.hp===100));assert.equal(states[0].ammo,3);
 const old={...guestRequest,payload:{...guestRequest.payload,id:'late-old-generation'}};await p.sdk[1].send(old);await step(400);assert.equal(p.sent[0].filter(m=>m.type==='duel.reply').at(-1).payload.reply.error,'stale_match');assert.equal(states[0].ammo,3);
 }finally{for(const v of a)v.dispose();}
});

// Health check 2026-09-29 (vibe_contents/net-checkup, hide reliable-exhaust): the host's reply
// table stopped at 512 entries and threw command_limit; the poll loop had no per-event guard, so
// that throw kept the cursor where it was and the same events were replayed forever — both
// sides stuck on "reconnecting", the match paused.
test('an event that throws never stalls polling: later events are still handled',async()=>{
 const p=pair(),states=[null,null],status=[null,null],errors=[[],[]];const a=p.sdk.map((sdk,i)=>create(sdk,{onState:s=>states[i]=s,onConnection:s=>status[i]=s,onError:e=>errors[i].push(e.message)}));
 try{await Promise.all(a.map((v,i)=>v.start({name:i?'乙':'甲',pet:pet()})));await wait(()=>states.every(s=>s?.opponent));
  await p.sdk[0].send({lane:'latest',key:'view0',type:'duel.view',payload:{serial:1e9,index:0,total:1,data:'!'}}); // malformed: the guest throws on it
  await a[0].action('ready');
  await wait(()=>states[1].opponent.ready===true,6000);
  assert(errors[1].some(m=>/invalid_snapshot|Invalid|base64|JSON/i.test(m))||errors[1].length>0,'the bad view was reported');
  await new Promise(r=>setTimeout(r,400));assert.equal(status[1],'connected','the guest stays connected');
 }finally{for(const v of a)v.dispose();}
});
test('more than 512 guest requests in one match never lock the referee',{timeout:120000},async()=>{
 const p=pair(),states=[null,null],status=[null,null],errors=[[],[]];const a=p.sdk.map((sdk,i)=>create(sdk,{onState:s=>states[i]=s,onConnection:s=>status[i]=s,onError:e=>errors[i].push(e.message)}));
 try{await Promise.all(a.map((v,i)=>v.start({name:i?'乙':'甲',pet:pet()})));await wait(()=>states.every(s=>s?.opponent));
  await a[0].action('ready');await a[1].action('ready');await wait(()=>states.every(s=>s?.generation===1));
  let answered=0,failed=[];
  for(let n=0;n<560;n++){try{await a[1].action('command',{type:'pose',generation:1,turn:states[1].turn,index:0});answered++;}catch(e){failed.push(e.message);}}
  assert.equal(failed.filter(m=>/command_timeout|command_limit|session_closed/.test(m)).length,0,'no lock-up: '+[...new Set(failed)].join(','));
  assert.equal(answered+failed.length,560);
  assert.deepEqual(errors[0].filter(m=>/command_limit/.test(m)),[],'the host never refuses with command_limit');
  assert.equal(status[0],'connected');assert.equal(status[1],'connected');
 }finally{for(const v of a)v.dispose();}
});
