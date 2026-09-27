/* Scaling changes admitted pixels, never just the drawing transform. */
(function(root,factory){const api=factory(typeof module==='object'?require('./pet'):root.DuelPet);if(typeof module==='object')module.exports=api;else root.DuelScale=api;})(globalThis,function(P){
  function resize(frame,percent){
    if(!Number.isInteger(percent)||percent<75||percent>100)throw Error('invalid_scale');
    const {size,rgba}=frame,out=new Uint8Array(rgba.length),half=size/2,k=percent/100;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const sx=Math.floor((x+.5-half)/k+half),sy=Math.floor((y+.5-half)/k+half);
      if(sx>=0&&sy>=0&&sx<size&&sy<size)out.set(rgba.subarray((sy*size+sx)*4,(sy*size+sx)*4+4),(y*size+x)*4);
    }
    return {...frame,rgba:out};
  }
  function choices(frames,limits){const result=[];for(let n=75;n<=100;n++){try{P.inspectGroup(frames.map(f=>resize(f,n)),limits);result.push(n);}catch{}}return result;}
  return {resize,choices};
});
