/* Validates the canonical pixels, not a client-provided hitbox or area claim. */
(function(root){
  'use strict';
  function inspect(frame,limits){
    const {size,rgba}=frame;
    if(!Number.isInteger(size)||size<1||size>256||rgba.length!==size*size*4)throw Error('invalid_frame');
    const mask=new Uint8Array(size*size);let area=0,minX=size,minY=size,maxX=-1,maxY=-1;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const i=y*size+x,a=rgba[i*4+3];
      if(a!==0&&a!==255)throw Error('invalid_alpha');
      if(a){mask[i]=1;area++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
    }
    if(area<limits.minArea)throw Error('area_small');
    if(area>limits.maxArea)throw Error('area_large');
    const width=maxX-minX+1,height=maxY-minY+1;
    if(Math.min(width,height)<limits.minSpan)throw Error('span_small');
    if(area/(width*height)<limits.minDensity)throw Error('sparse_pet');
    let biggest=0;const queue=new Int32Array(size*size);
    for(let i=0;i<mask.length;i++)if(mask[i]){
      let head=0,tail=1;queue[0]=i;mask[i]=0;
      while(head<tail){const p=queue[head++],x=p%size,y=Math.floor(p/size);
        for(const next of [x>0?p-1:-1,x<size-1?p+1:-1,y>0?p-size:-1,y<size-1?p+size:-1])if(next>=0&&mask[next]){mask[next]=0;queue[tail++]=next;}
      }
      biggest=Math.max(biggest,tail);
    }
    if(biggest/area<limits.minConnected)throw Error('disconnected_pet');
    return {area,width,height,minX,minY,maxX,maxY,density:area/(width*height),connected:biggest/area};
  }
  function inspectGroup(frames,limits){
    if(!Array.isArray(frames)||frames.length<1||frames.length>3)throw Error('pose_count');
    if(frames.some(f=>f.size!==frames[0].size))throw Error('frame_sizes_differ');
    const stats=frames.map(f=>inspect(f,limits)),areas=stats.map(s=>s.area);
    if(Math.min(...areas)/Math.max(...areas)<limits.minPoseRatio)throw Error('pose_area_difference');
    return stats;
  }
  const api={inspect,inspectGroup};if(typeof module!=='undefined')module.exports=api;else root.DuelPet=api;
})(globalThis);
