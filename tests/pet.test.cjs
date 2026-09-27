const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../game/pet');
// Test limits describe the fixture, not approved production balance values.
const limits={minArea:100,maxArea:2000,minSpan:8,minDensity:.25,minConnected:.98,minPoseRatio:.65};
function frame(draw){const rgba=new Uint8Array(32*32*4);for(let y=0;y<32;y++)for(let x=0;x<32;x++)if(draw(x,y))rgba.set([70,180,140,255],(y*32+x)*4);return {size:32,rgba};}
test('a complete silhouette is accepted and its effective area is measured',()=>{
  const f=frame((x,y)=>x>=8&&x<24&&y>=3&&y<29);
  assert.equal(P.inspect(f,limits).area,416);
});
test('blank, line, sparse disconnected and non-binary alpha are rejected',()=>{
  assert.throws(()=>P.inspect(frame(()=>false),limits),/area_small/);
  assert.throws(()=>P.inspect(frame((x)=>x===10),{...limits,minArea:1}),/span_small/);
  assert.throws(()=>P.inspect(frame((x,y)=>(x+y)%2===0),limits),/disconnected/);
  const f=frame(()=>true);f.rgba[3]=127;
  assert.throws(()=>P.inspect(f,limits),/invalid_alpha/);
});
test('pose groups reject a materially smaller alternate silhouette',()=>{
  const a=frame((x,y)=>x>=8&&x<24&&y>=3&&y<29),b=frame((x,y)=>x>=10&&x<22&&y>=10&&y<22);
  assert.throws(()=>P.inspectGroup([a,b],limits),/pose_area_difference/);
  assert.equal(P.inspectGroup([a,a],limits).length,2);
});
