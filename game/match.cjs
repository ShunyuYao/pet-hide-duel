(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./geometry'),require('./wall'));else root.DuelMatch=factory(root.DuelGeometry,root.DuelWall);})(globalThis,function(G,W){
'use strict';
class Match {
  constructor(rules,now=Date.now,first=0){
    if(!rules||typeof rules!=='object')throw Error('invalid_rules');
    for(const k of ['hp','damage','shots','prepareMs','turnMs','poseMs','shotMs','disconnectMs','reconnectMs','matchMs','speed'])if(!Number.isFinite(rules[k])||rules[k]<=0)throw Error('invalid_rules');
    if(!Number.isInteger(rules.shots)||!Number.isInteger(first)||first<0||first>1)throw Error('invalid_rules');
    this.rules=Object.freeze({...rules});this.now=now;this.first=first;this.players=[];this.phase='lobby';this.turn=0;this.generation=0;this.events=[];this.serial=0;
  }
  add(name,frames){if(this.players.length>=2||this.phase!=='lobby')throw Error('room_full');
    this.players.push({name,frames,ready:false,lastSeen:this.now(),left:false,commands:new Map()});return this.players.length-1;
  }
  touch(i){const p=this.player(i);if(p.left)throw Error('left_room');p.lastSeen=this.now();this.tryStart();}
  player(i){if(!Number.isInteger(i)||!this.players[i])throw Error('invalid_player');return this.players[i];}
  ready(i){const p=this.player(i);if(!['lobby','ended'].includes(this.phase))throw Error('already_started');if(this.players.some(p=>p.left))throw Error('peer_left');p.ready=true;p.lastSeen=this.now();
    this.tryStart();
  }
  tryStart(){if(['lobby','ended'].includes(this.phase)&&this.players.length===2&&this.players.every(p=>p.ready&&!p.left&&this.now()-p.lastSeen<=this.rules.disconnectMs))this.start();}
  start(){this.generation++;this.turn=1;this.shooter=(this.first+this.generation-1)%2;this.started=this.now();this.winner=null;this.reason=null;this.lastShot=null;this.events=[];
    for(let i=0;i<2;i++){const p=this.players[i];p.hp=this.rules.hp;p.ready=false;p.wall=new Set(W.bricks.map((_,i)=>i));p.frame=0;p.pose=G.clampPose(p.frames[0],{x:W.width*(i?.7:.3),y:W.height/2,angle:0},W);p.poseAt=-Infinity;p.moveAt=this.now();p.shotAt=-Infinity;p.commands.clear();}
    this.prepare();
  }
  prepare(){this.phase='prepare';this.deadline=this.now()+this.rules.prepareMs;this.ammo=this.rules.shots;}
  next(){this.turn++;this.shooter=1-this.shooter;this.prepare();}
  end(winner,reason){if(this.phase==='ended')return;this.phase='ended';this.winner=winner;this.reason=reason;this.players.forEach(p=>p.ready=false);}
  leave(i){this.player(i).left=true;if(this.players.length===2)this.end(1-i,'left');else this.end(null,'left');}
  tick(){
    if(['lobby','ended'].includes(this.phase))return;
    const now=this.now(),lost=this.players.map(p=>p.left||now-p.lastSeen>this.rules.disconnectMs);
    if(now-this.started>=this.rules.matchMs){const [a,b]=this.players.map(p=>p.hp);this.end(a===b?null:a>b?0:1,'time_limit');return;}
    if(this.phase!=='paused'&&lost.some(Boolean)){this.resumePhase=this.phase;this.remaining=Math.max(0,this.deadline-now);this.pauseAt=now;this.phase='paused';}
    if(this.phase==='paused'){
      if(!lost.some(Boolean)){this.phase=this.resumePhase;this.deadline=now+this.remaining;}
      else if(now-this.pauseAt>=this.rules.reconnectMs)this.end(lost.every(Boolean)?null:lost[0]?1:0,lost.every(Boolean)?'both_disconnected':'disconnect');
      return;
    }
    if(now>=this.deadline){if(this.phase==='prepare'){this.phase='active';this.deadline=now+this.rules.turnMs;}else this.next();}
  }
  command(i,msg){
    const p=this.player(i);
    if(p.left)throw Error('left_room');
    if(!msg||typeof msg!=='object'||Array.isArray(msg))throw Error('invalid_command');
    if(msg.generation!==this.generation)throw Error('stale_match');
    if(msg.type==='shoot'&&typeof msg.id==='string'&&p.commands.has(msg.id))return p.commands.get(msg.id);
    this.tick();
    if(msg.turn!==this.turn)throw Error('stale_turn');
    if(!['prepare','active'].includes(this.phase))throw Error(this.phase);
    if(msg.type==='move'||msg.type==='pose'){
      if(i===this.shooter)throw Error('not_hiding');
      if(msg.type==='pose'){
        if(msg.frame!==0)throw Error('pose_locked');
        if(this.now()-p.poseAt<this.rules.poseMs)throw Error('pose_cooldown');
        if(!Number.isInteger(msg.frame)||!p.frames[msg.frame]||!Number.isFinite(msg.angle)||msg.angle%15!==0)throw Error('invalid_pose');
        const pose=G.clampPose(p.frames[msg.frame],{...p.pose,angle:msg.angle},W);
        p.frame=msg.frame;p.pose=pose;p.poseAt=this.now();
      }else{
        if(!Number.isFinite(msg.x)||!Number.isFinite(msg.y))throw Error('invalid_position');
        // The confirmed frontal silhouette is fixed; only horizontal travel is legal.
        let x=msg.x,y=p.pose.y;
        {
          const dx=x-p.pose.x,dy=y-p.pose.y,d=Math.hypot(dx,dy),max=this.rules.speed*Math.min(.25,Math.max(0,(this.now()-p.moveAt)/1000));
          if(d>max){x=p.pose.x+dx*max/d;y=p.pose.y+dy*max/d;}
        }
        p.pose=G.clampPose(p.frames[p.frame],{...p.pose,x,y},W);p.moveAt=this.now();
      }
      return {ok:true};
    }
    if(msg.type!=='shoot')throw Error('invalid_command');
    if(this.phase!=='active')throw Error('preparing');
    if(this.shooter!==i)throw Error('not_shooting');
    if(typeof msg.id!=='string'||msg.id.length<1||msg.id.length>80)throw Error('invalid_shot_id');
    if(!Number.isFinite(msg.x)||!Number.isFinite(msg.y)||msg.x<0||msg.y<0||msg.x>=W.width||msg.y>=W.height)throw Error('outside_wall');
    if(this.now()-p.shotAt<this.rules.shotMs)throw Error('shot_cooldown');
    if(this.ammo<=0)throw Error('no_ammo');
    const other=this.players[1-i],brick=G.brickAt(W.bricks,other.wall,msg.x,msg.y);
    // Body collision is independent of wall opacity, including the first shot.
    const hit=G.hit(G.raster(other.frames[other.frame],other.pose,W),msg.x,msg.y);
    if(brick>=0)other.wall.delete(brick);
    p.shotAt=this.now();this.ammo--;if(hit)other.hp=Math.max(0,other.hp-this.rules.damage);
    const result={ok:true,hit,brick,hp:other.hp,shot:++this.serial,x:msg.x,y:msg.y,shooter:i,turn:this.turn,at:this.now()};
    this.lastShot=result;this.events.push(result);if(this.events.length>12)this.events.shift();
    p.commands.set(msg.id,result);if(p.commands.size>256)p.commands.delete(p.commands.keys().next().value);
    if(other.hp<=0)this.end(i,'knockout');else if(hit||this.ammo===0)this.next();
    return result;
  }
  snapshot(i){
    this.tick();const p=this.player(i),other=this.players[1-i],hiding=i!==this.shooter,target=hiding?p:other;
    const publicPlayer=(a)=>a?{name:a.name,hp:a.hp??this.rules.hp,ready:a.ready,online:!a.left&&this.now()-a.lastSeen<=this.rules.disconnectMs,left:a.left}:null;
    let pixels=[];
    if(target?.wall){
      const all=G.raster(target.frames[target.frame],target.pose,W);
      if(hiding||this.phase==='ended')pixels=all;
      else if(this.phase==='active'||(this.phase==='paused'&&this.resumePhase==='active'))pixels=G.visible(all,W.bricks,target.wall,W);
    }
    return {version:1,generation:this.generation,serverTime:this.now(),phase:this.phase,turn:this.turn,shooter:this.shooter,me:i,ammo:this.ammo??0,
      remainingMs:this.phase==='paused'?Math.max(0,this.rules.reconnectMs-(this.now()-this.pauseAt)):Math.max(0,(this.deadline||0)-this.now()),
      matchRemainingMs:this.started!==undefined?Math.max(0,this.rules.matchMs-(this.now()-this.started)):this.rules.matchMs,
      self:{...publicPlayer(p),pose:p.pose,frame:p.frame??0,poseRemainingMs:Math.max(0,this.rules.poseMs-(this.now()-(p.poseAt??-Infinity)))},
      opponent:publicPlayer(other),wall:target?.wall?[...target.wall]:[],pixels,hiding,events:this.events,winner:this.winner,reason:this.reason,rules:this.rules};
  }
}
return {Match};
});
