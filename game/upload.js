/* Browser image ingestion. One transform for the complete pose set. */
(function(root){
  'use strict';
  const SIZE=192,bases=new WeakMap();
  function encode(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
  async function decode(file){
    if(!['image/png','image/webp'].includes(file.type))throw Error('image_type');
    if(file.size>8*1024*1024)throw Error('file_large');
    const url=URL.createObjectURL(file),img=new Image();
    try{img.src=url;await img.decode();if(img.naturalWidth>4096||img.naturalHeight>4096||img.naturalWidth<16||img.naturalHeight<16)throw Error('image_dimensions');
      const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
      const data=ctx.getImageData(0,0,c.width,c.height);let minX=c.width,minY=c.height,maxX=-1,maxY=-1;
      for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(data.data[(y*c.width+x)*4+3]>=128){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
      if(maxX<0)throw Error('empty_pet');return {c,minX,minY,maxX,maxY,name:file.name.replace(/\.[^.]+$/,'').slice(0,12)};
    }finally{URL.revokeObjectURL(url);}
  }
  async function normalizeFiles(files,limits,preferred=85){
    if(files.length<1||files.length>3)throw Error('pose_count');
    const sources=[];for(const file of files)sources.push(await decode(file));
    if(sources.some(s=>s.c.width!==sources[0].c.width||s.c.height!==sources[0].c.height))throw Error('source_sizes_differ');
    const x=Math.min(...sources.map(s=>s.minX)),y=Math.min(...sources.map(s=>s.minY)),r=Math.max(...sources.map(s=>s.maxX))+1,b=Math.max(...sources.map(s=>s.maxY))+1;
    const w=r-x,h=b-y;
    // A shared scale leaves enough diagonal room for every 15-degree rotation.
    const scale=Math.min((SIZE-2)/Math.max(w,h),(root.DuelWall.height-4)/root.DuelWall.petExtent*SIZE/Math.hypot(w,h));
    const raw=sources.map(s=>{
      const c=document.createElement('canvas');c.width=c.height=SIZE;const ctx=c.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(s.c,x,y,w,h,(SIZE-w*scale)/2,(SIZE-h*scale)/2,w*scale,h*scale);
      const rgba=ctx.getImageData(0,0,SIZE,SIZE).data;
      for(let i=0;i<rgba.length;i+=4){if(rgba[i+3]<128){rgba[i]=rgba[i+1]=rgba[i+2]=rgba[i+3]=0;}else rgba[i+3]=255;}
      return {size:SIZE,rgba,name:s.name};
    });
    return fromBase({raw,name:sources[0].name,scale,sourceCanvas:[sources[0].c.width,sources[0].c.height]},limits,preferred);
  }
  function fromBase(base,limits,preferred){
    const key=JSON.stringify(limits);
    if(base.limitsKey!==key){base.choices=root.DuelScale.choices(base.raw,limits);base.limitsKey=key;}
    const choices=base.choices;
    if(!choices.length){root.DuelPet.inspectGroup(base.raw,limits);throw Error('invalid_scale');}
    const percent=choices.reduce((a,b)=>Math.abs(b-preferred)<Math.abs(a-preferred)?b:a,choices[0]);
    const raw=base.raw.map(f=>root.DuelScale.resize(f,percent)),stats=root.DuelPet.inspectGroup(raw,limits);
    for(const f of raw)for(let angle=0;angle<360;angle+=15)root.DuelGeometry.clampPose(f,{x:root.DuelWall.width/2,y:root.DuelWall.height/2,angle},root.DuelWall);
    const pet={name:base.name,frames:raw.map((f,i)=>({name:f.name,pixels:encode(f.rgba),stats:stats[i]})),scale:base.scale*percent/100,sourceCanvas:base.sourceCanvas,scalePercent:percent,scaleChoices:choices};
    bases.set(pet,base);return pet;
  }
  function rescale(pet,percent,limits){const base=bases.get(pet);if(!base)throw Error('invalid_scale');const next=fromBase(base,limits,percent);next.name=pet.name;next.omitted=pet.omitted;return next;}

  function exportBase(pet){const b=bases.get(pet);return b?{name:b.name,scale:b.scale,sourceCanvas:b.sourceCanvas,frames:b.raw.map(f=>({name:f.name,pixels:encode(f.rgba)}))}:null;}
  function restoreBase(pet,data,limits){
    if(!data||!Array.isArray(data.frames)||data.frames.length!==pet.frames.length)return false;
    try{const raw=data.frames.map(f=>({name:f.name,size:SIZE,rgba:Uint8Array.from(atob(f.pixels),c=>c.charCodeAt(0))}));const base={raw,name:data.name,scale:data.scale,sourceCanvas:data.sourceCanvas},check=fromBase(base,limits,pet.scalePercent);
      if(check.frames.some((f,i)=>f.pixels!==pet.frames[i].pixels))return false;bases.set(pet,base);return true;
    }catch{return false;}
  }
  root.DuelUpload={normalizeFiles,rescale,exportBase,restoreBase,canRescale:pet=>bases.has(pet)};
})(globalThis);
