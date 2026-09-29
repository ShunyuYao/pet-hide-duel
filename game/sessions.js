/* The sender page adjudicates. Only Match.snapshot(receiver) crosses the session. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./match.cjs'),require('./pet'),require('./geometry'),require('./wall'),require('./rules'));else root.DuelSessions=factory(root.DuelMatch,root.DuelPet,root.DuelGeometry,root.DuelWall,root.DuelRules);})(globalThis,function(M,P,G,W,R){
  'use strict';
  const PROTOCOL='pet-hide-duel',FRAME_BYTES=192*192*4,PART=44000,MAX_PARTS=6;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const encode=bytes=>{let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);};
  function unbase64(value){if(typeof value!=='string'||!value.length||value.length>1048576||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))throw Error('invalid_frame');return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
  function decodePet(pet){
    if(!pet||!Array.isArray(pet.frames)||pet.frames.length<1||pet.frames.length>3)throw Error('pose_count');
    const frames=pet.frames.map(f=>{const rgba=unbase64(f.pixels);if(rgba.length!==FRAME_BYTES)throw Error('invalid_frame');return {size:192,rgba};});
    P.inspectGroup(frames,R.limits);for(const f of frames)for(let angle=0;angle<360;angle+=15)G.clampPose(f,{x:W.width/2,y:W.height/2,angle},W);return frames;
  }
  function vector(keys){let x=(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0),y=(keys.has('ArrowDown')||keys.has('KeyS')?1:0)-(keys.has('ArrowUp')||keys.has('KeyW')?1:0);if(x&&y){x*=Math.SQRT1_2;y*=Math.SQRT1_2;}return {x,y};}
  async function bytesThrough(bytes,transform,max){
    const writer=transform.writable.getWriter(),reader=transform.readable.getReader(),chunks=[];let size=0;
    const written=writer.write(bytes).then(()=>writer.close());
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max)throw Error('snapshot_large');chunks.push(value);}await written;}catch(error){await reader.cancel(error).catch(()=>{});await written.catch(()=>{});throw error;}
    const out=new Uint8Array(size);let offset=0;for(const c of chunks){out.set(c,offset);offset+=c.length;}return out;
  }
  async function encodeView(view,serial){
    const wire={...view};if(view.hiding&&view.self.pose){wire.pixels=[];wire.ownPixels=true;}
    const packed=encode(await bytesThrough(new TextEncoder().encode(JSON.stringify(wire)),new CompressionStream('gzip'),192*1024));
    const total=Math.ceil(packed.length/PART);if(total>MAX_PARTS)throw Error('snapshot_large');
    return Array.from({length:total},(_,index)=>({serial,index,total,data:packed.slice(index*PART,(index+1)*PART)}));
  }
  async function decodeView(parts,pet){
    if(!Array.isArray(parts)||!parts.length||parts.length>MAX_PARTS)throw Error('invalid_snapshot');
    const first=parts[0];if(first.total!==parts.length||!Number.isSafeInteger(first.serial)||first.serial<1||parts.some((p,i)=>p.index!==i||p.serial!==first.serial||p.total!==first.total||typeof p.data!=='string'||p.data.length>PART))throw Error('invalid_snapshot');
    const data=await bytesThrough(unbase64(parts.map(p=>p.data).join('')),new DecompressionStream('gzip'),2*1024*1024),view=JSON.parse(new TextDecoder().decode(data));
    if(view.version!==1||![0,1].includes(view.me)||!Number.isInteger(view.generation)||!Number.isInteger(view.turn)||!['lobby','prepare','active','paused','ended'].includes(view.phase)||!view.self||!Array.isArray(view.wall)||!Array.isArray(view.events)||!Array.isArray(view.pixels)||view.pixels.length>40000||view.wall.length>W.bricks.length||view.wall.some(i=>!Number.isInteger(i)||!W.bricks[i]))throw Error('invalid_snapshot');
    if(view.ownPixels){if(!view.hiding||!view.self.pose)throw Error('invalid_snapshot');const frames=decodePet(pet);if(!frames[view.self.frame])throw Error('invalid_snapshot');view.pixels=G.raster(frames[view.self.frame],view.self.pose,W);delete view.ownPixels;}
    if(view.pixels.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isInteger)||p[0]<0||p[0]>=Math.ceil(W.width)||p[1]<0||p[1]>=Math.ceil(W.height)||p[2]<0||p[2]>0xffffff))throw Error('invalid_snapshot');
    return view;
  }
  function create(sdk,{onState=()=>{},onConnection=()=>{},onError=()=>{},now=Date.now}={}){
    let context,pet,match,started=false,disposed=false,cursor=0,connection='waiting',epoch=0,view=null,timer=null,loop=null,initializing=null,uploaded=false;
    let serial=0,applied=0,assembly=null,sending=false,nextView=0,lastHeartbeat=0,remoteMove=0,requestNo=0,moveNo=0,lastStateAt=0,stalled=false;
    const pending=new Map(),results=new Map();
    const uuid=()=>globalThis.crypto.randomUUID();
    function state(value){view=value;lastStateAt=now();if(stalled&&connection==='connected'){stalled=false;onConnection('connected');}onState(value);}
    function status(value){if(connection!==value){connection=value;onConnection(value);}}
    function fail(error){onError(error instanceof Error?error:Error(String(error)));}
    function send(type,payload,lane='reliable',key){if(disposed)throw Error('session_closed');return sdk.send({lane,type,payload,...(lane==='latest'?{key}:{messageId:uuid()})});}
    function setClosed(reason){if(disposed)return;status('closed');if(match?.players.length===2){match.leave(1);state(match.snapshot(0));}for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error(reason||'session_closed'));}pending.clear();clearInterval(timer);}
    async function initialize(){
      if(initializing||uploaded||connection!=='connected'||context.role==='host')return initializing;
      initializing=(async()=>{const payload={version:1,name:pet.playerName,frames:pet.frames.map(f=>({name:f.name,pixels:f.pixels}))};await sdk.transfer({purpose:'duel.pet.v1',contentType:'application/octet-stream',dataBase64:encode(new TextEncoder().encode(JSON.stringify(payload)))});uploaded=true;})().catch(fail).finally(()=>{initializing=null;});return initializing;
    }
    async function publish(force=false){
      if(!match||disposed)return;
      match.tick();if(!match.players[0].left)match.touch(0);const local=match.snapshot(0);state(local);
      if(connection!=='connected'||sending||now()<nextView)return;
      sending=true;
      try{const remote=match.snapshot(1);const parts=await encodeView(remote,++serial);if(disposed||connection!=='connected')return;
        const bytes=parts.reduce((n,p)=>n+JSON.stringify(p).length+150,0);nextView=now()+Math.max(250,Math.ceil(bytes/220000*1000));
        for(const part of parts)await send('duel.view',part,'latest','view'+part.index);
      }catch(error){if(error.message!=='invalid_player')fail(error);}finally{sending=false;}
    }
    async function adjudicate(req){
      if(!match||!req||typeof req.id!=='string'||req.id.length>100||!['ready','command'].includes(req.kind))throw Error('invalid_command');
      const old=results.get(req.id),hash=JSON.stringify(req);
      if(old){if(old.hash!==hash)throw Error('command_conflict');return old.reply;}
      // Keep the last 512 replies (retries of a request come within seconds); never refuse new
      // requests (health check 2026-09-29: refusing at 512 locked the session).
      while(results.size>=512)results.delete(results.keys().next().value);
      let reply;
      try{if(req.generation!==match.generation)throw Error('stale_match');match.tick();match.touch(1);if(req.kind==='ready'){match.ready(1);reply={ok:true};}else reply=match.command(1,req.payload);}catch(error){reply={error:error.message};}
      results.set(req.id,{hash,reply});return reply;
    }
    async function event(e){
      if(e.type==='closed'){setClosed(e.reason);return;}
      if(e.type==='resync_required'){assembly=null;if(context.role==='host')nextView=0;else await send('duel.sync',{},'latest','sync');return;}
      if(e.type==='transfer'){
        if(context.role!=='host'||e.purpose!=='duel.pet.v1')return;
        if(match.players.length===2)return;
        const asset=await sdk.readTransfer({transferId:e.transferId});if(asset.purpose!=='duel.pet.v1'||asset.contentType!=='application/octet-stream')throw Error('invalid_asset');
        const data=JSON.parse(new TextDecoder().decode(unbase64(asset.dataBase64)));if(data.version!==1||typeof data.name!=='string'||!data.name.trim()||[...data.name].length>12||/[\p{Cc}\p{Cf}]/u.test(data.name))throw Error('invalid_name');
        match.add(data.name,decodePet(data));await publish(true);return;
      }
      if(e.type!=='message')return;
      const m=e.message,p=m.payload;
      if(context.role==='host'){
        if(m.type==='duel.heartbeat'){if(match.players[1]){match.tick();match.touch(1);}return;}
        if(m.type==='duel.sync'){nextView=0;return;}
        if(m.type==='duel.move'){
          if(!p||!Number.isSafeInteger(p.seq)||p.seq<=remoteMove)return;remoteMove=p.seq;
          try{match.tick();match.touch(1);match.command(1,p.command);}catch(error){if(!['stale_match','stale_turn','not_hiding','paused','ended','lobby'].includes(error.message))fail(error);}return;
        }
        if(m.type==='duel.request'){const reply=await adjudicate(p);await send('duel.reply',{id:p.id,reply});nextView=0;}return;
      }
      if(m.type==='duel.reply'){
        const item=p&&pending.get(p.id);if(!item)return;clearTimeout(item.timer);pending.delete(p.id);p.reply?.error?item.reject(Error(p.reply.error)):item.resolve(p.reply);return;
      }
      if(m.type!=='duel.view')return;
      if(p&&Number.isSafeInteger(p.serial)&&p.serial<=applied)return;
      if(!p||!Number.isSafeInteger(p.serial)||!Number.isInteger(p.index)||!Number.isInteger(p.total)||p.total<1||p.total>MAX_PARTS||p.index<0||p.index>=p.total||typeof p.data!=='string'||p.data.length>PART)throw Error('invalid_snapshot');
      if(!assembly||p.serial>assembly.serial)assembly={serial:p.serial,total:p.total,parts:new Array(p.total)};
      if(p.serial!==assembly.serial||p.total!==assembly.total)return;
      assembly.parts[p.index]=p;
      if(assembly.parts.filter(Boolean).length===assembly.total){const complete=assembly;assembly=null;const next=await decodeView(complete.parts,pet);if(complete.serial>applied){applied=complete.serial;state(next);}}
    }
    async function poll(){
      while(!disposed&&connection!=='closed'){
        try{const batch=await sdk.poll({cursor,waitMs:1000});if(disposed)break;
          const changed=epoch!==batch.epoch||connection!==batch.transportState;
          if(epoch!==batch.epoch){epoch=batch.epoch;assembly=null;}
          status(batch.transportState);
          if(connection==='closed'){setClosed('session_closed');break;}
          if(connection==='connected'&&changed){void initialize();nextView=0;if(context.role==='guest')await send('duel.sync',{},'latest','sync');}
          // Each event on its own: one that throws is reported and skipped, and the cursor still moves
          // on (a throw here used to replay the same events forever).
          for(const e of batch.events){try{await event(e);}catch(error){fail(error);}}cursor=batch.cursor;
        }catch(error){if(['session_closed','caller_disposed','permission_denied','permission_revoked','account_changed'].some(c=>String(error.message).includes(c))){setClosed(error.message);break;}status('reconnecting');fail(error);await sleep(350);}
        await sleep(40);
      }
    }
    async function start(input){
      if(started)throw Error('already_started');started=true;context=await sdk.getContext();if(!context)throw Error('no_invitation');
      if(context.protocol.id!==PROTOCOL||context.protocol.version!==2)throw Error('protocol_mismatch');
      decodePet(input.pet);const name=(input.name||input.pet.name||'宠物').trim();if(!name||[...name].length>12||/[\p{Cc}\p{Cf}]/u.test(name))throw Error('invalid_name');pet={...input.pet,playerName:name};
      if(context.role==='host'){match=new M.Match(R.rules,now,0);match.add(name,decodePet(pet));state(match.snapshot(0));}
      const joined=await sdk.join();epoch=joined.epoch;status(joined.status==='connected'?'connected':'waiting');loop=poll();void initialize();
      timer=setInterval(()=>{if(disposed||connection==='closed')return;if(context.role==='host')void publish();else if(connection==='connected'){if(view&&now()-lastStateAt>3000&&!stalled){stalled=true;onConnection('reconnecting');}if(now()-lastHeartbeat>500){lastHeartbeat=now();void send('duel.heartbeat',{},'latest','heartbeat').catch(fail);}}},100);
      return {room:context.invitationId.slice(0,8),me:context.role==='host'?0:1,mode:'sdk'};
    }
    async function action(kind,payload){
      if(disposed||connection==='closed')throw Error('session_closed');if(!view)throw Error('waiting_for_peer');
      if(context.role==='host'){match.tick();match.touch(0);const result=kind==='ready'?match.ready(0):match.command(0,payload);await publish(true);return result||{ok:true};}
      if(kind==='command'&&payload.type==='move')return send('duel.move',{seq:++moveNo,command:payload},'latest','move');
      const id='command-'+(++requestNo),req={id,kind,generation:view.generation,payload:payload||{}};
      return new Promise((resolve,reject)=>{
        let tries=0;const item={resolve,reject,timer:null};pending.set(id,item);
        const attempt=async()=>{if(!pending.has(id))return;if(++tries>3){pending.delete(id);reject(Error('command_timeout'));return;}
          try{await send('duel.request',req);}catch(error){if(connection==='closed'){pending.delete(id);reject(error);return;}}
          if(pending.has(id))item.timer=setTimeout(attempt,1500);
        };void attempt();
      });
    }
    function dispose(){disposed=true;clearInterval(timer);for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('session_closed'));}pending.clear();assembly=null;}
    async function close(){try{return await sdk.leave();}finally{setClosed('session_closed');dispose();}}
    return {start,action,close,dispose,diagnostics:()=>({connection,epoch,role:context?.role,pending:pending.size,applied,uploaded})};
  }
  return {create,decodePet,encodeView,decodeView,vector};
});
