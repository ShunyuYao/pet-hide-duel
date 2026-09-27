'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {create}=require('../game/host');
test('realtime uses the same declared character permission and old hosts explicitly lack it',async()=>{
 const asset={renderer:'rat-doll-renderer',dataVersion:2,assets:{}};
 const sdk={character:{getCurrent:async()=>({}),getRealtime:async()=>asset},capabilities:{query:async()=>({status:'available'}),request:async()=>{throw Error('unexpected permission request');}}};
 assert.equal(await create(()=>sdk).readRealtime(),asset);
 delete sdk.character.getRealtime;assert.equal(await create(()=>sdk).readRealtime(),null);
});
test('current image requests minimal SDK permission once per document even after denial',async()=>{
 let requests=0;
 const host=create(()=>({character:{getCurrent:async()=>{}},capabilities:{query:async()=>({status:'not_authorized'}),request:async()=>{requests++;return {status:'unknown'};}}}));
 for(let i=0;i<3;i++)await assert.rejects(host.read(),/permission_denied/);
 assert.equal(requests,1);
});
test('authorized reader requests actual three animations and LAN grants use exact origin',async()=>{
 const calls=[];
 const sdk={character:{getCurrent:async opts=>{calls.push(opts);return {key:'skin',poses:[]};}},capabilities:{query:async()=>({status:'available'}),request:async opts=>{calls.push(opts);return {status:'granted',origins:[opts.origin]};}}};
 const host=create(()=>sdk);assert.equal((await host.read()).key,'skin');
 await host.network('http://192.168.1.2:18765');
 assert.deepEqual(calls,[{states:['idle','walk','greet']},{origin:'http://192.168.1.2:18765'}]);
 await assert.rejects(host.network('http://user@192.168.1.2:18765'),/network/);
});
test('missing optional states use genuine available states and old hosts keep upload fallback',async()=>{
 const sdk={character:{getCurrent:async({states})=>{if(states.includes('walk'))throw Error('CHARACTER_STATE_UNAVAILABLE');return {key:'skin',name:'Skin',signature:states[0],poses:states.map(id=>({id}))};}},capabilities:{query:async()=>({status:'available'}),request:async()=>{}}};
 assert.deepEqual((await create(()=>sdk).read()).poses,[{id:'idle'},{id:'greet'}]);
 const old=create(()=>null);assert.equal(old.supported(),false);await assert.rejects(old.read(),/no_bridge/);await old.network('http://localhost:18765');
});
