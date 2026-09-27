const test=require('node:test'),assert=require('node:assert/strict');
const {Match}=require('../game/match.cjs');
const G=require('../game/geometry'),W=require('../game/wall');
const rules={hp:100,damage:34,shots:3,prepareMs:3000,turnMs:20000,poseMs:1000,shotMs:300,disconnectMs:2000,reconnectMs:30000,matchMs:360000,speed:260};
function frame(){const size=192,rgba=new Uint8Array(size*size*4);for(let y=8;y<184;y++)for(let x=60;x<132;x++)rgba.set([100,180,130,255],(y*size+x)*4);return {size,rgba};}
function setup(){let now=0;const m=new Match(rules,()=>now,0);m.add('甲',[frame()]);m.add('乙',[frame()]);m.ready(0);m.ready(1);return {m,advance(n){now+=n;m.touch(0);m.touch(1);m.tick();},time(n){now+=n;m.tick();}};}
test('two ready players prepare, then a shot penetrates intact wall and body once',()=>{
  const {m,advance}=setup();assert.equal(m.phase,'prepare');advance(3001);assert.equal(m.phase,'active');
  const p=m.players[1],point=G.raster(p.frames[0],p.pose,W).find(([x,y])=>G.brickAt(W.bricks,p.wall,x+.5,y+.5)>=0);
  const intent={generation:1,type:'shoot',turn:1,id:'one',x:point[0]+.5,y:point[1]+.5};
  const old=p.wall.size;const result=m.command(0,intent);
  assert.equal(result.hit,true);assert.equal(p.hp,66);assert.equal(p.wall.size,old-1);assert.equal(m.shooter,1);
  assert.deepEqual(m.command(0,intent),result);assert.equal(p.hp,66);
});
test('three misses switch once, preserve both walls and reject stale commands',()=>{
  const {m,advance}=setup();advance(3001);for(let i=0;i<3;i++){m.command(0,{generation:1,type:'shoot',turn:1,id:'m'+i,x:1,y:1});advance(301);}
  assert.equal(m.turn,2);assert.equal(m.phase,'prepare');
  assert.throws(()=>m.command(0,{generation:1,type:'shoot',turn:1,id:'old',x:1,y:1}),/stale_turn/);
  advance(3001);const old=m.players[1].wall.size;advance(20001);assert.equal(m.turn,3);assert.equal(m.players[1].wall.size,old);
});
test('only hiding player moves; frame and angle changes share a cooldown',()=>{
  const {m,advance}=setup();advance(3001);
  assert.throws(()=>m.command(0,{generation:1,type:'move',turn:1,x:50,y:50}),/not_hiding/);
  m.command(1,{generation:1,type:'pose',turn:1,frame:0,angle:15});
  assert.throws(()=>m.command(1,{generation:1,type:'pose',turn:1,frame:0,angle:30}),/pose_cooldown/);
  assert(G.raster(m.players[1].frames[0],m.players[1].pose,W).length>0);
});
test('opponent snapshot has no hidden position, frame or pixels behind bricks',()=>{
  const {m,advance}=setup();advance(3001);const s=m.snapshot(0);
  assert.equal(s.opponent.pose,undefined);assert.equal(s.opponent.frames,undefined);assert.equal(s.opponent.frame,undefined);
  assert(s.pixels.every(([x,y])=>G.brickAt(W.bricks,m.players[1].wall,x+.5,y+.5)===-1));
  assert.equal(m.snapshot(1).pixels.length,G.raster(m.players[1].frames[0],m.players[1].pose,W).length);
});
test('disconnect freezes turn, reconnect restores remaining time, timeout ends match',()=>{
  const {m,advance,time}=setup();advance(3001);time(2100);assert.equal(m.phase,'paused');
  assert.throws(()=>m.command(0,{generation:1,type:'shoot',turn:1,id:'p',x:1,y:1}),/paused/);
  const left=m.remaining;advance(1000);assert.equal(m.phase,'active');assert.equal(m.deadline-m.now(),left);
  time(2100);time(30001);assert.equal(m.phase,'ended');assert.equal(m.reason,'both_disconnected');
});
test('one lost peer forfeits; leaving resolves immediately; rematch resets walls and HP',()=>{
  const {m,advance,time}=setup();advance(3001);time(2100);m.touch(0);time(29000);m.touch(0);time(1001);assert.equal(m.winner,0);
  m.touch(0);m.touch(1);m.ready(0);m.ready(1);assert.equal(m.phase,'prepare');assert.equal(m.players[1].hp,100);assert.equal(m.players[0].wall.size,928);
  m.leave(1);assert.equal(m.phase,'ended');assert.equal(m.reason,'left');assert.equal(m.winner,0);
});
test('commands from a previous match cannot spend the next match ammo',()=>{
 const {m,advance}=setup();advance(3001);m.end(0,'knockout');m.ready(0);m.ready(1);advance(3001);
 assert.throws(()=>m.command(m.shooter,{generation:1,type:'shoot',id:'delayed',turn:1,x:1,y:1}),/stale_match/);
 assert.equal(m.ammo,3);
});
test('a match cannot be held open indefinitely by repeated disconnects',()=>{
 const {m,advance,time}=setup();advance(3001);
 for(let i=0;i<15&&m.phase!=='ended';i++){time(2100);advance(29000);}
 assert.equal(m.phase,'ended');assert.equal(m.reason,'time_limit');
});
test('malformed command is rejected without internal exceptions or state changes',()=>{
 const {m}=setup();
 for(const value of [null,undefined,[],5,'shoot'])assert.throws(()=>m.command(0,value),/^Error: invalid_command$/);
 assert.equal(m.turn,1);assert.equal(m.ammo,3);
});
test('paused preparation never reveals even currently uncovered opponent pixels',()=>{
 const {m,time}=setup();m.players[1].wall.clear();time(2100);
 assert.equal(m.phase,'paused');assert.equal(m.resumePhase,'prepare');
 assert.equal(m.snapshot(0).pixels.length,0);
 assert(m.snapshot(1).pixels.length>0);
});
test('a zero-based test clock reports the real match deadline',()=>{
 const {m,advance}=setup();advance(3001);
 assert.equal(m.snapshot(0).matchRemainingMs,rules.matchMs-3001);
});
test('cooldown, bounds and forged damage fields never bypass server collision',()=>{
 const {m,advance}=setup();advance(3001);
 const shoot={generation:1,type:'shoot',turn:1,id:'empty',x:1,y:1,hit:true,hp:0,damage:100};
 assert.equal(m.command(0,shoot).hit,false);assert.equal(m.players[1].hp,100);
 assert.throws(()=>m.command(0,{...shoot,id:'too-fast'}),/shot_cooldown/);
 advance(301);assert.throws(()=>m.command(0,{...shoot,id:'outside',x:-1}),/outside_wall/);
 assert.equal(m.ammo,2);
 const p=m.players[1],before={...p.pose};
 m.command(1,{generation:1,type:'move',turn:1,x:W.width,y:W.height});
 assert(Math.hypot(p.pose.x-before.x,p.pose.y-before.y)<=rules.speed*.25+.001);
});
test('ready players enter a match when the temporarily absent lobby peer returns',()=>{
 let now=0;const m=new Match(rules,()=>now,0);m.add('甲',[frame()]);m.add('乙',[frame()]);m.ready(0);
 now=rules.disconnectMs+1;m.ready(1);assert.equal(m.phase,'lobby');assert(m.players.every(p=>p.ready));
 m.touch(0);assert.equal(m.phase,'prepare');assert.equal(m.generation,1);
});
