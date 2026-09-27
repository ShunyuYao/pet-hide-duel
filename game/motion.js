/* Local hider presentation/input only. Never apply this to opponent pixels. */
(function(root){
  'use strict';
  // Guest snapshots normally arrive every 300ms, after a 100ms input batch.
  // Reserve 100ms for delivery/scheduling jitter; never predict beyond this
  // bounded 500ms position lead, even when the snapshot stream stops.
  const MAX_LEAD_SECONDS=.5;
  function create(){
    let view=null,pose=null,key='',at=null,limits=null,serverTime=-Infinity;
    function reset(){view=pose=limits=null;key='';at=null;serverTime=-Infinity;}
    function update(next,time,bounds){
      if(!next?.hiding||!next.self?.pose||!['prepare','active'].includes(next.phase)){reset();return;}
      const identity=[next.generation,next.turn,next.self.frame,next.self.pose.angle].join(':');
      if(identity===key&&next.serverTime<serverTime)return;
      if(identity!==key){pose={...next.self.pose};at=time;key=identity;}
      view=next;serverTime=next.serverTime;limits=bounds||limits;
      // A long interruption must not leave a speculative avatar far from the
      // referee. Ordinary delayed snapshots never roll back local key motion.
      if(Math.abs(pose.x-next.self.pose.x)>next.rules.speed*MAX_LEAD_SECONDS)pose={...next.self.pose};
    }
    function step(direction,time,allowed){
      const dt=at===null?0:Math.max(0,Math.min(.05,(time-at)/1000));at=time;
      if(!view||!pose)return null;
      if(!allowed){pose={...view.self.pose};return {...pose};}
      const lead=view.rules.speed*MAX_LEAD_SECONDS;
      pose.x=Math.max(limits?.minX??-Infinity,Math.min(limits?.maxX??Infinity,
        Math.max(view.self.pose.x-lead,Math.min(view.self.pose.x+lead,pose.x+Math.sign(direction)*view.rules.speed*dt))));
      return {...pose};
    }
    // A sent latest-lane move is not an acknowledgement. Keep the final target
    // eligible for the existing 10Hz sender until an authoritative view catches
    // it, including when the referee speed-clamped or dropped the release move.
    function needsSend(){return !!view&&!!pose&&Math.abs(view.self.pose.x-pose.x)>=.01;}
    return {update,step,reset,needsSend,current:()=>pose&&({...pose})};
  }
  const api={create};if(typeof module!=='undefined')module.exports=api;else root.DuelMotion=api;
})(globalThis);
