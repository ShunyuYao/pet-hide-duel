(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DuelHost=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  function create(getSdk){
    let asked=false,pending=null;
    const supported=()=>!!getSdk()?.character?.getCurrent && !!getSdk()?.capabilities?.query && !!getSdk()?.capabilities?.request;
    async function permission(){
      if(!supported())throw Error('no_bridge');
      if(pending)return pending;
      pending=(async()=>{
        let state=await getSdk().capabilities.query('character.getCurrent');
        if(state.status==='available')return;
        if(!['not_authorized','revoked'].includes(state.status))throw Error('no_bridge');
        if(!asked){asked=true;await getSdk().capabilities.request({});state=await getSdk().capabilities.query('character.getCurrent');}
        if(state.status!=='available')throw Error('permission_denied');
      })();
      try{return await pending;}finally{pending=null;}
    }
    async function read(){
      await permission();
      try{return await getSdk().character.getCurrent({states:['idle','walk','greet']});}
      catch(error){
        if(!String(error?.message).includes('CHARACTER_STATE_UNAVAILABLE'))throw error;
        // Idle remains mandatory; absent optional animations are never invented.
        const base=await getSdk().character.getCurrent({states:['idle']});
        const signatures=[base.signature];
        for(const state of ['walk','greet']){
          try{const pose=await getSdk().character.getCurrent({states:[state]});if(pose.key!==base.key)throw Error('current-pet-unavailable');base.poses.push(...pose.poses);signatures.push(pose.signature);}
          catch(optional){if(!String(optional?.message).includes('CHARACTER_STATE_UNAVAILABLE'))throw optional;}
        }
        return {...base,signature:signatures.join(':')};
      }
    }
    async function network(origin){
      if(!supported())return;
      if(pending)await pending.catch(()=>{});
      const url=new URL(origin);
      if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.origin!==origin)throw Error('network');
      const grant=await getSdk().capabilities.request({origin:url.origin});
      if(grant.status!=='granted'||!grant.origins?.includes(url.origin))throw Error('network_permission_denied');
    }
    async function readRealtime(){
      await permission();
      if(!getSdk()?.character?.getRealtime)return null;
      const capability=await getSdk().capabilities.query('character.getRealtime');
      if(capability.status==='available')return getSdk().character.getRealtime();
      if(['not_authorized','revoked'].includes(capability.status))throw Error('permission_denied');
      return null;
    }
    return {supported,read,readRealtime,network};
  }
  return {create};
});
