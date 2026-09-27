import {validateShape} from '../vendor/doll/data-contract.mjs';

const KINDS={top:['sweater','tee','shirt'],bottom:['denim','shorts','jeans']};
const IMAGE_TYPES=['image/png','image/jpeg','image/webp'];
// Accept the host's byte-bearing getRealtime snapshot only; data cannot inject
// network URLs, plugin paths or arbitrary model/code loaders into the editor.
export function decodeDollRealtime(realtime){
  const fail=()=>{throw Error('invalid_doll_realtime');};
  if(realtime?.renderer!=='rat-doll-renderer'||realtime.dataVersion!==2)fail();
  const data=realtime.data,assets=realtime.assets;
  if(!data||!['female','male'].includes(data.person)||!assets||typeof assets!=='object')fail();
  let total=0;
  const asset=id=>{
    if(typeof id!=='string'||!Object.prototype.hasOwnProperty.call(assets,id))fail();
    const value=assets[id];
    if(!value||typeof value.dataBase64!=='string'||value.dataBase64.length===0||value.dataBase64.length>16*1024*1024||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.dataBase64))fail();
    total+=value.dataBase64.length;if(total>24*1024*1024)fail();
    return value;
  };
  const image=id=>{const value=asset(id);if(!IMAGE_TYPES.includes(value.contentType))fail();return `data:${value.contentType};base64,${value.dataBase64}`;};
  const shape=id=>{
    const value=asset(id);if(value.contentType!=='application/json'||value.dataBase64.length>500000)fail();
    try{return validateShape(JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.dataBase64),c=>c.charCodeAt(0)))));}catch{fail();}
  };
  const headScale=data.headScale??1;
  if(!Number.isFinite(headScale)||headScale<.75||headScale>2)fail();
  const head=image('head'),garments={};
  for(const slot of ['top','bottom']){
    const input=data.garments?.[slot];if(!input||!KINDS[slot].includes(input.kind))fail();
    garments[slot]={kind:input.kind,assets:{}};
    for(const field of ['front','back','frontBump','backBump'])garments[slot].assets[field]=image(input.assets?.[field]);
    garments[slot].assets.shape=shape(input.assets?.shape);
  }
  return {person:data.person,headScale,head,garments};
}
