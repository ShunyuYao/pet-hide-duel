// Read-only Canvas observation installed after loading the unmodified built HTML.
// It records the actual body's pixel centroid plus drawImage offset, not a model
// of the proposed motion algorithm. Native rAF and real inputs remain untouched.
(() => {
  const board=document.querySelector('#board'), proto=CanvasRenderingContext2D.prototype;
  const draw=proto.drawImage,put=proto.putImageData,arc=proto.arc,centroids=new WeakMap();
  const probe=window.__motionProbe={frames:[],updates:[],reset(){this.frames=[];this.updates=[];}};
  function centroid(img){let sx=0,sy=0,n=0;for(let i=3;i<img.data.length;i+=4)if(img.data[i]){const p=(i-3)/4;sx+=p%img.width;sy+=Math.floor(p/img.width);n++;}return {x:n?sx/n:0,y:n?sy/n:0,n};}
  proto.putImageData=function(img,...args){if(this.canvas.width===Math.ceil(DuelWall.width)){const c=centroid(img);centroids.set(this.canvas,c);probe.updates.push({t:performance.now(),...c});}return put.call(this,img,...args);};
  proto.drawImage=function(image,x,y,...rest){if(this.canvas===board&&image.width===Math.ceil(DuelWall.width)){let c=centroids.get(image);if(!c){c=centroid(image.getContext('2d').getImageData(0,0,image.width,image.height));centroids.set(image,c);}probe.frames.push({t:performance.now(),x:c.x+x,y:c.y+y,offsetX:x,offsetY:y,pixels:c.n});}return draw.call(this,image,x,y,...rest);};
  proto.arc=function(x,y,r,...rest){if(this.canvas===board&&probe.frames.length&&(r===7||r===9))probe.frames.at(-1)[r===7?'marker':'aim']={x,y};return arc.call(this,x,y,r,...rest);};
})();
