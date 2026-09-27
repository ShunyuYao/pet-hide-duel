'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const load=()=>import('../game/doll-pose.mjs');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

test('front-facing pose serializes only eight bounded limb angles',async()=>{
  const {normalizePose,POSE_LIMITS}=await load();
  const pose=normalizePose({version:99,armL:{upper:100,lower:-100},armR:{upper:NaN,lower:Infinity},legL:{upper:-99,lower:99},yaw:2});
  assert.deepEqual(Object.keys(pose),['version','armL','armR','legL','legR']);
  assert.equal(pose.version,1);assert.equal(pose.yaw,undefined);
  for(const limb of ['armL','armR','legL','legR'])for(const angle of ['upper','lower']){
    const [min,max]=POSE_LIMITS[limb.slice(0,3)][angle];
    assert.ok(Number.isFinite(pose[limb][angle])&&pose[limb][angle]>=min&&pose[limb][angle]<=max);
  }
  assert.deepEqual(normalizePose(JSON.parse(JSON.stringify(pose))),pose);
  assert.ok(JSON.stringify(pose).length<350);
});

test('every allowed pose keeps fixed connected limb lengths and torso facing forward',async()=>{
  const {normalizePose,forwardPose}=await load();
  for(let i=0;i<180;i++){
    const input={};for(const limb of ['armL','armR','legL','legR'])input[limb]={upper:Math.sin(i*1.71)*5,lower:Math.cos(i*.77)*5};
    const {parts,handles,chains}=forwardPose(normalizePose(input));
    for(const name of ['head','upperBody','pelvis'])assert.deepEqual(parts[name].quaternion,{x:0,y:0,z:0,w:1});
    for(const part of Object.values(parts)){assert.equal(part.quaternion.x,0);assert.equal(part.quaternion.z,0);near(Math.hypot(part.quaternion.y,part.quaternion.w),1);}
    for(const [name,chain] of Object.entries(chains)){
      near(distance(chain.root,chain.joint),name.startsWith('arm')?.62:.84);
      near(distance(chain.joint,chain.end),name.startsWith('arm')?.58:.78);
      near(chain.root.y,chain.joint.y);near(chain.joint.y,chain.end.y);
    }
    for(const h of handles)assert.ok([h.x,h.y,h.z].every(Number.isFinite));
  }
});

test('hands and feet follow reachable drags without moving torso or opposite limbs',async()=>{
  const {defaultPose,forwardPose,dragHandle}=await load();
  for(const [id,limb] of [['handL','armL'],['handR','armR'],['footL','legL'],['footR','legR']]){
    const start=defaultPose(),targetPose=defaultPose();targetPose[limb]={upper:limb.startsWith('arm')?.4:.4,lower:limb.startsWith('arm')?-.9:-.3};
    const target=forwardPose(targetPose).handles.find(h=>h.id===id);
    const moved=dragHandle(start,id,target);
    const actual=forwardPose(moved).handles.find(h=>h.id===id);
    assert.ok(distance(actual,target)<.006,`${id} missed reachable target`);
    assert.notDeepEqual(moved[limb],start[limb]);
    for(const other of ['armL','armR','legL','legR'])if(other!==limb)assert.deepEqual(moved[other],start[other]);
    assert.deepEqual(forwardPose(start).parts.head,forwardPose(moved).parts.head);
  }
});

test('elbow and knee drags rotate the upper limb and preserve relative bend',async()=>{
  const {defaultPose,dragHandle,forwardPose}=await load();
  for(const [id,limb] of [['elbowL','armL'],['elbowR','armR'],['kneeL','legL'],['kneeR','legR']]){
    const start=defaultPose(),targetPose=defaultPose();targetPose[limb].upper=.6;
    const target=forwardPose(targetPose).handles.find(h=>h.id===id),moved=dragHandle(start,id,target);
    near(moved[limb].upper,.6);near(moved[limb].lower,start[limb].lower);
  }
});

test('extreme, nonfinite and unknown drags cannot stretch, twist or corrupt the pose',async()=>{
  const {defaultPose,normalizePose,dragHandle,forwardPose}=await load();
  for(const id of ['handL','handR','footL','footR','elbowL','elbowR','kneeL','kneeR']){
    for(const target of [{x:1e100,z:-1e100},{x:-1e100,z:1e100},{x:Infinity,z:NaN},{x:0,z:2.7}]){
      const moved=dragHandle(defaultPose(),id,target);
      assert.deepEqual(normalizePose(moved),moved);
      for(const p of Object.values(forwardPose(moved).parts))assert.ok(Object.values(p.position).every(Number.isFinite));
    }
  }
  assert.deepEqual(dragHandle(defaultPose(),'head',{x:10,z:10}),defaultPose());
});

// Byte values here validate the data boundary only; real WebGL rendering uses
// the existing rat-doll fixture in the hidden application E2E.
function realtimeFixture(){
  const snapshot={renderer:'rat-doll-renderer',dataVersion:2,data:{person:'female',headScale:1.5,garments:{}},assets:{head:{contentType:'image/png',dataBase64:'AQID'}}};
  for(const [slot,kind] of [['top','sweater'],['bottom','denim']]){
    const assets={};for(const field of ['front','back','frontBump','backBump']){assets[field]=slot+field;snapshot.assets[slot+field]={contentType:'image/png',dataBase64:'AQID'};}
    assets.shape=slot+'shape';snapshot.assets[assets.shape]={contentType:'application/json',dataBase64:Buffer.from(JSON.stringify({outline:[[0,0],[1,0],[1,1],[0,1]],distance:{size:2,pixels:[0,1,2,3]}})).toString('base64')};
    snapshot.data.garments[slot]={kind,assets};
  }
  return snapshot;
}
test('real doll asset decoder preserves photo, garments, validated contour and headScale',async()=>{
  const {decodeDollRealtime}=await import('../game/doll-assets.mjs');
  const actual=decodeDollRealtime(realtimeFixture());
  assert.equal(actual.person,'female');assert.equal(actual.headScale,1.5);assert.equal(actual.head,'data:image/png;base64,AQID');
  assert.equal(actual.garments.top.kind,'sweater');assert.deepEqual(actual.garments.bottom.assets.shape.distance.pixels,[0,1,2,3]);
});
test('asset decoder rejects unsupported renderers, URL injection and malformed geometry',async()=>{
  const {decodeDollRealtime}=await import('../game/doll-assets.mjs');
  for(const mutate of [
    v=>v.renderer='arbitrary-renderer',v=>v.dataVersion=1,v=>v.data.person='unknown',v=>v.data.headScale=3,
    v=>v.data.garments.top.kind='unknown',v=>v.assets.head.contentType='image/svg+xml',
    v=>v.assets.head.dataBase64='https://invalid.example/head.png',v=>v.data.garments.top.assets.front='https://invalid.example/front.png',
    v=>v.assets.topshape.dataBase64=Buffer.from('{"outline":[]}').toString('base64')
  ]){const input=realtimeFixture();mutate(input);assert.throws(()=>decodeDollRealtime(input),/invalid_doll_realtime/);}
});
