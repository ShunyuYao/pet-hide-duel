'use strict';
// Uses real HTTP sockets. Fake time controls deadlines only; requests never call Match internals.
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {createService}=require('../server.cjs');
const G=require('../game/geometry'),W=require('../game/wall');
const rules={hp:100,damage:34,shots:3,prepareMs:20,turnMs:20000,poseMs:1000,shotMs:20,disconnectMs:2000,reconnectMs:30000,matchMs:360000,speed:260};
const limits={minArea:5000,maxArea:22000,minSpan:40,minDensity:.25,minConnected:.98,minPoseRatio:.65};
function pet(){const b=Buffer.alloc(192*192*4);for(let y=8;y<184;y++)for(let x=60;x<132;x++){const i=(y*192+x)*4;b[i]=90;b[i+1]=180;b[i+2]=160;b[i+3]=255;}return {name:'测试宠物',frames:[{name:'站立',pixels:b.toString('base64')}]};}
async function session(t,extra={}){
 const app=createService({rules,limits,...extra});await app.listen(0,'127.0.0.1');t.after(()=>app.close());
 const base=`http://127.0.0.1:${app.server.address().port}`;
 const call=async(route,data,token)=>{const post=data!==undefined;const r=await fetch(base+route,{method:post?'POST':'GET',headers:{...(post?{'content-type':'application/json'}:{}),...(token?{authorization:'Bearer '+token}:{})},...(post?{body:JSON.stringify(data)}:{})});return {status:r.status,body:await r.json()};};
 const state=async token=>(await call('/api/state',undefined,token)).body;
 const pair=async()=>{const a=(await call('/api/create',{name:'甲',pet:pet()})).body;const b=(await call('/api/join',{name:'乙',room:a.room,pet:pet()})).body;return[a,b];};
 return {app,base,call,state,pair};
}
test('real HTTP rooms authenticate, limit membership and retain hidden information',async t=>{
 const {call,pair,state,base}=await session(t);const [a,b]=await pair();
 assert(a.token&&a.room);assert.equal((await call('/api/state',undefined,'wrong')).status,401);
 assert.equal((await call('/api/join',{name:'丙',room:a.room,pet:pet()})).body.error,'room_full');
 await call('/api/ready',{},a.token);await call('/api/ready',{},b.token);await new Promise(r=>setTimeout(r,25));
 const sa=await state(a.token),sb=await state(b.token);assert.equal(sa.phase,'active');assert.equal(sb.phase,'active');assert.equal(sa.turn,sb.turn);
 const shooter=sa.shooter===0?sa:sb,hider=sa.shooter===0?sb:sa;
 assert.equal(shooter.opponent.pose,undefined);assert.equal(shooter.opponent.frames,undefined);assert.equal(shooter.opponent.frame,undefined);
 assert(shooter.pixels.every(([x,y])=>G.brickAt(W.bricks,new Set(shooter.wall),x+.5,y+.5)===-1));assert(hider.pixels.length>shooter.pixels.length);
 await call('/api/leave',{},b.token);assert.equal((await state(a.token)).reason,'left');assert.equal((await call('/api/state',undefined,b.token)).status,401);
 assert.equal((await fetch(base+'/server.cjs')).status,404);
});
test('HTTP pet validation rejects malformed frames and forged size claims',async t=>{
 const {call}=await session(t);
 for(const frame of [null,{},'wrong',{pixels:'bad'}])assert.deepEqual((await call('/api/create',{name:'甲',pet:{frames:[frame]}})).body,{error:'invalid_frame'});
 const blank={frames:[{pixels:Buffer.alloc(192*192*4).toString('base64'),area:12000}],stats:[{area:12000}],hitbox:{width:100,height:100}};
 assert.equal((await call('/api/create',{name:'甲',pet:blank})).body.error,'area_small');
 const semi=pet();const bytes=Buffer.from(semi.frames[0].pixels,'base64');bytes[(9*192+61)*4+3]=120;semi.frames[0].pixels=bytes.toString('base64');
 assert.equal((await call('/api/create',{name:'甲',pet:semi})).body.error,'invalid_alpha');
 assert.equal((await call('/api/create',{name:'\u0000',pet:pet()})).body.error,'invalid_name');
});
test('HTTP rejects oversized declared and chunked bodies with explicit bounded responses',async t=>{
 const {base}=await session(t);const tooLarge=JSON.stringify({padding:'x'.repeat(700001)});
 let response=await fetch(base+'/api/create',{method:'POST',headers:{'content-type':'application/json'},body:tooLarge});
 assert.equal(response.status,413);assert.deepEqual(await response.json(),{error:'request_too_large'});
 const chunked=await new Promise((resolve,reject)=>{const req=http.request(base+'/api/create',{method:'POST',headers:{'content-type':'application/json'}},res=>{let text='';res.on('data',part=>text+=part);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}));});req.on('error',reject);req.write(tooLarge.slice(0,350000));req.end(tooLarge.slice(350000));});
 assert.equal(chunked.status,413);assert.equal(chunked.body.error,'request_too_large');
 response=await fetch(base+'/api/create',{method:'POST',body:'{}'});assert.equal(response.status,415);
 response=await fetch(base+'/api/create',{method:'POST',headers:{'content-type':'application/json'},body:'{'});assert.equal((await response.json()).error,'invalid_json');
 assert.equal((await fetch(base+'/health')).status,200);
});
test('HTTP shots are authoritative, idempotent across turn changes, and reject old generations',async t=>{
 let now=100;const {call,pair,state}=await session(t,{now:()=>now});const players=await pair();for(const p of players)await call('/api/ready',{},p.token);now+=21;
 const initial=await state(players[0].token),shooter=players[initial.shooter],hider=players[1-initial.shooter],hidden=await state(hider.token);
 const point=hidden.pixels.find(([x,y])=>G.brickAt(W.bricks,new Set(hidden.wall),x+.5,y+.5)>=0);assert(point);
 const shot={generation:initial.generation,turn:initial.turn,type:'shoot',id:'same-shot',x:point[0]+.5,y:point[1]+.5,hit:false,hp:100};
 assert.equal((await call('/api/command',shot,hider.token)).body.error,'not_shooting');
 const result=await call('/api/command',shot,shooter.token);assert.equal(result.body.hit,true);assert.equal(result.body.hp,66);assert.equal(result.status,200);
 assert.deepEqual(await call('/api/command',shot,shooter.token),result);
 let next=await state(hider.token);assert.equal(next.turn,2);assert.equal(next.self.hp,66);
 assert.equal((await call('/api/command',{...shot,id:'different'},shooter.token)).body.error,'stale_turn');
 assert.equal((await call('/api/command',{...shot,turn:2,generation:0,id:'old'},hider.token)).body.error,'stale_match');
 now+=21;next=await state(hider.token);
 const miss=await call('/api/command',{generation:1,turn:2,type:'shoot',id:'forged',x:1,y:1,hit:true,hp:0,damage:100},hider.token);
 assert.equal(miss.body.hit,false);assert.equal(miss.body.hp,100);
 assert.equal((await call('/api/command',{generation:1,turn:2,type:'move',x:10,y:10},hider.token)).body.error,'not_hiding');
});
test('HTTP reconnect resumes inside grace and settles before a late heartbeat can revive it',async t=>{
 let now=100;const {call,pair,state}=await session(t,{now:()=>now});const [a,b]=await pair();for(const p of[a,b])await call('/api/ready',{},p.token);now+=21;await state(a.token);await state(b.token);
 now+=2100;let s=await state(a.token);assert.equal(s.phase,'paused');const turn=s.turn;
 now+=1000;await state(a.token);s=await state(b.token);assert.equal(s.phase,'active');assert.equal(s.turn,turn);
 now+=2100;assert.equal((await state(a.token)).phase,'paused');
 for(let n=0;n<29;n++){now+=1000;await state(a.token);}now+=1000;
 s=await state(b.token);assert.equal(s.phase,'ended');assert.equal(s.reason,'disconnect');assert.equal(s.winner,0);
 assert.equal((await state(a.token)).winner,0);
});
test('HTTP match timeout and rematch rebuild state and alternate first player',async t=>{
 let now=100;const {call,pair,state}=await session(t,{now:()=>now,rules:{...rules,matchMs:1000,disconnectMs:2000}});const [a,b]=await pair();for(const p of[a,b])await call('/api/ready',{},p.token);
 now+=21;const start=await state(a.token);const shooter=[a,b][start.shooter];
 await call('/api/command',{generation:1,turn:1,type:'shoot',id:'old-id',x:20,y:5},shooter.token);
 now+=1001;const ended=await state(a.token);assert.equal(ended.phase,'ended');assert.equal(ended.reason,'time_limit');
 for(const p of[a,b])await call('/api/ready',{},p.token);const fresh=await state(a.token);assert.equal(fresh.phase,'prepare');assert.equal(fresh.generation,2);assert.equal(fresh.shooter,1-start.shooter);assert.equal(fresh.wall.length,928);assert.equal(fresh.self.hp,100);assert.equal(fresh.opponent.hp,100);
 assert.equal((await call('/api/command',{generation:1,turn:1,type:'shoot',id:'old-id',x:20,y:5},shooter.token)).body.error,'stale_match');
});
test('HTTP info reports actual listening port and loopback-only services do not advertise LAN',async t=>{
 const {call,app}=await session(t);
 const info=await call('/api/info');assert.equal(info.status,200);assert.equal(info.body.port,app.server.address().port);assert.equal(info.body.localUrl,`http://127.0.0.1:${app.server.address().port}`);assert.deepEqual(info.body.lanUrls,[]);
 const config=await call('/api/rules');assert.deepEqual(config.body.rules,rules);assert.deepEqual(config.body.limits,limits);
});
test('HTTP lobby recovers when both players were ready during a brief connection loss',async t=>{
 let now=100;const {call,pair,state}=await session(t,{now:()=>now});const[a,b]=await pair();
 await call('/api/ready',{},a.token);now+=2100;await call('/api/ready',{},b.token);
 assert.equal((await state(b.token)).phase,'lobby');
 const returned=await state(a.token);assert.equal(returned.phase,'prepare');assert.equal((await state(b.token)).generation,returned.generation);
});
test('HTTP rechecks scaled pixels even when scale metadata and area claims are forged',async t=>{
 const {call}=await session(t),rgba=Buffer.alloc(192*192*4);
 for(let y=56;y<136;y++)for(let x=56;x<136;x++)rgba.set([90,140,80,255],(y*192+x)*4);
 const reduced=require('../game/scale').resize({size:192,rgba},75);
 const forged={name:'scale test',scalePercent:100,frames:[{name:'pose',pixels:Buffer.from(reduced.rgba).toString('base64'),stats:{area:12000}}]};
 assert.equal((await call('/api/create',{name:'甲',pet:forged})).body.error,'area_small');
 forged.frames[0].pixels=rgba.toString('base64');
 assert.equal((await call('/api/create',{name:'甲',pet:forged})).status,200);
});
