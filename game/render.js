(function(root){
  'use strict';
  const W=root.DuelWall, origin={x:74,y:160}, colors=['#b69b73','#baa07b','#bca27b','#b49a76','#bda57e'];
  function frameCanvas(frame){const c=document.createElement('canvas');c.width=c.height=192;const raw=atob(frame.pixels),bytes=Uint8ClampedArray.from(raw,v=>v.charCodeAt(0));c.getContext('2d').putImageData(new ImageData(bytes,192,192),0,0);return c;}
  function preview(canvas,frame){const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);if(!frame)return;const size=Math.min(canvas.width,canvas.height)*.92;ctx.drawImage(frameCanvas(frame),(canvas.width-size)/2,(canvas.height-size)/2,size,size);}
  function wallPreview(canvas,frame){const ctx=canvas.getContext('2d'),k=canvas.width/W.width;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.scale(k,k);ctx.fillStyle='#efeadc';ctx.fillRect(0,0,W.width,W.height);ctx.globalAlpha=.6;for(const [x,y,w,h]of W.bricks){ctx.fillStyle='#baa07b';ctx.fillRect(x,y,w-.7,h-.7);}ctx.globalAlpha=1;if(frame){const size=W.petExtent;ctx.drawImage(frameCanvas(frame),(W.width-size)/2,(W.height-size)/2,size,size);}ctx.restore();}
  function create(canvas){
    const ctx=canvas.getContext('2d'),body=document.createElement('canvas');body.width=Math.ceil(W.width);body.height=Math.ceil(W.height);
    const bctx=body.getContext('2d');let state=null,aim={x:W.width/2,y:W.height/2},received=0,localPose=null;
    function update(next){state=next;received=Date.now();const img=bctx.createImageData(body.width,body.height);for(const [x,y,rgb]of next.pixels){const p=(y*body.width+x)*4;img.data[p]=rgb>>16;img.data[p+1]=rgb>>8&255;img.data[p+2]=rgb&255;img.data[p+3]=255;}bctx.putImageData(img,0,0);}
    function text(value,x,y,size=14,color='#8b8e76',align='left'){ctx.font=`${size}px "PingFang SC",system-ui,sans-serif`;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(value,x,y);}
    function draw(){
      ctx.clearRect(0,0,1400,450);ctx.fillStyle='#f7f3e9';ctx.fillRect(0,0,1400,450);
      // Original paper scenery. Collision geometry comes exclusively from W.
      ctx.fillStyle='#efeadc';ctx.beginPath();ctx.ellipse(690,355,661,68,0,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#dfd7c3';ctx.lineWidth=1;for(let i=0;i<12;i++){ctx.beginPath();ctx.moveTo(70+i*113,34);ctx.lineTo(96+i*111,106);ctx.stroke();}
      ctx.fillStyle='#e0e5d1';ctx.save();ctx.translate(153,66);ctx.rotate(-.1);ctx.fillRect(-61,-33,122,64);text('SHH…',0,5,21,'#8f9c76','center');ctx.restore();
      ctx.fillStyle='#e9d8b8';ctx.save();ctx.translate(1218,65);ctx.rotate(.1);ctx.fillRect(-51,-28,102,56);text('HELLO?',0,5,17,'#a08d66','center');ctx.restore();
      ctx.strokeStyle='#b7b597';ctx.beginPath();ctx.moveTo(77,116);ctx.quadraticCurveTo(712,190,1323,116);ctx.stroke();
      for(let i=0;i<10;i++){const x=125+i*125,y=125+26*Math.sin(i/9*Math.PI);ctx.fillStyle=i%2?'#d8bb8d':'#c5ccb0';ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+25,y+3);ctx.lineTo(x+13,y+29);ctx.closePath();ctx.fill();}
      if(!state){text('朋友就在墙的另一边。',700,277,24,'#93957e','center');return;}
      const ownPose=state.hiding&&['prepare','active'].includes(state.phase)&&localPose?localPose:state.self.pose;
      ctx.save();ctx.translate(origin.x,origin.y);ctx.imageSmoothingEnabled=false;
      // Only the owner knows the whole silhouette. Opponent pixels stay at the
      // exact authoritative coordinates; moving them could reveal a wall edge.
      ctx.drawImage(body,state.hiding&&ownPose&&state.self.pose?ownPose.x-state.self.pose.x:0,state.hiding&&ownPose&&state.self.pose?ownPose.y-state.self.pose.y:0);
      const ended=state.phase==='ended';ctx.globalAlpha=(state.hiding||ended) ? .52 : 1;
      for(const id of state.wall){const [x,y,w,h]=W.bricks[id];ctx.fillStyle=colors[id%colors.length];ctx.fillRect(x,y,w,h);ctx.strokeStyle='#9c855f';ctx.lineWidth=.6;ctx.strokeRect(x+.35,y+.35,w-.7,h-.7);ctx.fillStyle='#e1c9a680';ctx.fillRect(x+.8,y+.6,w-1.6,.7);}
      ctx.globalAlpha=1;
      if(state.hiding&&state.self.pose){const p=ownPose;ctx.setLineDash([4,5]);ctx.strokeStyle='#728566';ctx.lineWidth=1;ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
      const last=state.events.at(-1),age=last?state.serverTime+(Date.now()-received)-last.at:9999;
      // An event belongs to the wall fired at; don't draw it on the next player's wall.
      if(last&&age<950&&(state.phase==='ended'||last.turn===state.turn)){
        ctx.strokeStyle=last.hit?'#bd6647':'#6d7861';ctx.lineWidth=2;ctx.beginPath();ctx.arc(last.x,last.y,5+age*.025,0,Math.PI*2);ctx.stroke();
        for(let j=0;j<7;j++){const a=j*Math.PI*2/7,r=age*.03;ctx.fillStyle='#ad936b';ctx.fillRect(last.x+Math.cos(a)*r,last.y+Math.sin(a)*r+age*age*.000018,3,3);}
      }
      if(!state.hiding&&['active','prepare'].includes(state.phase)){ctx.strokeStyle='#bd6347';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(aim.x,aim.y,9,0,Math.PI*2);ctx.moveTo(aim.x-17,aim.y);ctx.lineTo(aim.x-5,aim.y);ctx.moveTo(aim.x+5,aim.y);ctx.lineTo(aim.x+17,aim.y);ctx.moveTo(aim.x,aim.y-17);ctx.lineTo(aim.x,aim.y-5);ctx.moveTo(aim.x,aim.y+5);ctx.lineTo(aim.x,aim.y+17);ctx.stroke();}
      ctx.restore();
      text(state.hiding?'你的纸墙 · 半透明预览帮助你调整藏身位置':'朋友的纸墙 · 看见洞里的线索了吗？',74,406,15);
      text(`${state.wall.length} / ${W.bricks.length} 块纸砖`,1326,406,13,'#9b9983','right');
      text('一发也能穿墙命中。',74,433,12,'#a29e89');
    }
    return {update,draw,setPose(p){localPose=p;},setAim(p){aim=p;},point(event){const r=canvas.getBoundingClientRect();return{x:(event.clientX-r.left)*1400/r.width-origin.x,y:(event.clientY-r.top)*450/r.height-origin.y};}};
  }
  root.DuelRender={wallPreview,create,preview,frameCanvas};
})(globalThis);
