/* Shared world geometry. Rendering and damage consume the very same pixel list. */
(function (root) {
  'use strict';
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  function transform(frame, pose, world) {
    if (![pose.x, pose.y, pose.angle].every(finite)) throw Error('invalid_position');
    const a = pose.angle * Math.PI / 180;
    return { c: Math.cos(a), s: Math.sin(a), scale: world.petExtent / frame.size };
  }
  function bounds(frame, pose, world) {
    const t = transform(frame, pose, world), half = frame.size / 2;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let y=0; y<frame.size; y++) for (let x=0; x<frame.size; x++) {
      if (!frame.rgba[(y*frame.size+x)*4+3]) continue;
      for (const [dx,dy] of [[0,0],[1,0],[0,1],[1,1]]) {
        const u=(x+dx-half)*t.scale, v=(y+dy-half)*t.scale;
        const xx=u*t.c-v*t.s, yy=u*t.s+v*t.c;
        minX=Math.min(minX,xx); maxX=Math.max(maxX,xx);
        minY=Math.min(minY,yy); maxY=Math.max(maxY,yy);
      }
    }
    if (!finite(minX)) throw Error('empty_pet');
    return {minX,minY,maxX,maxY};
  }
  function clampPose(frame, pose, world) {
    const angle=((pose.angle%360)+360)%360;
    const b=bounds(frame,{...pose,angle},world);
    if (b.maxX-b.minX > world.width-2 || b.maxY-b.minY > world.height-2) throw Error('pose_does_not_fit');
    return {x:clamp(pose.x,1-b.minX,world.width-1-b.maxX),y:clamp(pose.y,1-b.minY,world.height-1-b.maxY),angle};
  }
  function raster(frame, pose, world) {
    const t=transform(frame,pose,world), b=bounds(frame,pose,world), out=[], half=frame.size/2;
    const x0=Math.max(0,Math.floor(pose.x+b.minX)), x1=Math.min(Math.ceil(world.width),Math.ceil(pose.x+b.maxX));
    const y0=Math.max(0,Math.floor(pose.y+b.minY)), y1=Math.min(Math.ceil(world.height),Math.ceil(pose.y+b.maxY));
    for (let y=y0;y<y1;y++) for (let x=x0;x<x1;x++) {
      const dx=x+.5-pose.x,dy=y+.5-pose.y;
      const u=Math.floor((dx*t.c+dy*t.s)/t.scale+half),v=Math.floor((-dx*t.s+dy*t.c)/t.scale+half);
      if(u<0||v<0||u>=frame.size||v>=frame.size)continue;
      const i=(v*frame.size+u)*4,p=frame.rgba;
      if(p[i+3])out.push([x,y,((p[i]<<16)|(p[i+1]<<8)|p[i+2])>>>0]);
    }
    return out;
  }
  function brickAt(bricks,live,x,y) {
    for(const i of live){const b=bricks[i]; if(x>=b[0]&&x<b[0]+b[2]&&y>=b[1]&&y<b[1]+b[3])return i;}
    return -1;
  }
  function occlusion(bricks,live,world) {
    const width=Math.ceil(world.width),height=Math.ceil(world.height),mask=new Uint8Array(width*height);
    for(const i of live){const [x,y,w,h]=bricks[i];
      for(let yy=Math.max(0,Math.ceil(y-.5));yy<Math.min(height,Math.ceil(y+h-.5));yy++)
        mask.fill(1,yy*width+Math.max(0,Math.ceil(x-.5)),yy*width+Math.min(width,Math.ceil(x+w-.5)));
    }
    return {mask,width};
  }
  function visible(pixels,bricks,live,world) {
    if(!world)return pixels.filter(p=>brickAt(bricks,live,p[0]+.5,p[1]+.5)===-1);
    const {mask,width}=occlusion(bricks,live,world);
    return pixels.filter(p=>!mask[p[1]*width+p[0]]);
  }
  function hit(pixels,x,y){return finite(x)&&finite(y)&&pixels.some(p=>p[0]===Math.floor(x)&&p[1]===Math.floor(y));}
  const api={bounds,clampPose,raster,brickAt,occlusion,visible,hit};
  if(typeof module!=='undefined')module.exports=api;else root.DuelGeometry=api;
})(globalThis);
