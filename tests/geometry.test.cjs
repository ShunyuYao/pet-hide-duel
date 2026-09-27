const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../game/wall');
const G = require('../game/geometry');
const square = { size: 8, rgba: new Uint8Array(8 * 8 * 4) };
for (let y = 1; y < 7; y++) for (let x = 2; x < 6; x++) {
  square.rgba.set([210, 60, 40, 255], (y * 8 + x) * 4);
}
test('selected reference dimensions and all 928 bricks are retained', () => {
  assert.equal(W.bricks.length, 928);
  assert(Math.abs(W.width / W.height - 5.88) < .01);
  assert(Math.abs(W.petExtent / W.height - .860873) < .00001);
});
test('all rotations keep the complete visible body within the wall', () => {
  for (let angle = 0; angle < 360; angle += 15) {
    for (const [x, y] of [[-999,-999],[9999,9999]]) {
      const pose = G.clampPose(square, { x, y, angle }, W);
      const pixels = G.raster(square, pose, W);
      assert(pixels.length > 0);
      assert(pixels.every(p => p[0] >= 0 && p[1] >= 0 && p[0] < W.width && p[1] < W.height));
    }
  }
});
test('hit testing observes the identical raster and transparent space', () => {
  const pose = {x: 100, y: 100, angle: 45};
  const pixels = G.raster(square, pose, W);
  const [x,y] = pixels[Math.floor(pixels.length / 2)];
  assert.equal(G.hit(pixels,x+.5,y+.5),true);
  assert.equal(G.hit(pixels,0,0),false);
});
test('an intact brick masks pixels and removing it reveals only its area', () => {
  const bricks=[[0,0,10,10],[10,0,10,10]], live = new Set([0,1]);
  const pixels=[[5,5,0xffaabbcc],[15,5,0xffaabbcc],[25,5,0xffaabbcc]];
  assert.deepEqual(G.visible(pixels,bricks,live),[pixels[2]]);
  live.delete(0);
  assert.deepEqual(G.visible(pixels,bricks,live),[pixels[0],pixels[2]]);
  assert.equal(G.brickAt(bricks,live,5,5),-1);
  assert.equal(G.brickAt(bricks,live,15,5),1);
});
test('pose transformations never implicitly change frame scale', () => {
  const state=G.clampPose(square,{x:100,y:100,angle:90,scale:.01},W);
  assert.equal(state.scale,undefined);
  assert.deepEqual(G.raster(square,state,W),G.raster(square,{...state,scale:99},W));
});
