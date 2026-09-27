'use strict';
// Uses only isolated test-profile dialogs and real keyboard input. Never writes
// grant records or substitutes SDK calls/results.
async function approve(port,H,activateClosingButton,timeout=20000){
 const until=Date.now()+timeout;
 while(Date.now()<until){
   const targets=await fetch(`http://127.0.0.1:${port}/json`).then(r=>r.json());
   for(const page of targets.filter(p=>p.url.includes('/dialog.html'))){
     const suitable=await H.evalIn(page,'document.body.textContent.includes("请求桌宠能力") && [...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="允许")').catch(()=>false);
     if(suitable){
       await H.evalIn(page,'[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="允许").setAttribute("data-duel-allow","");true');
       await activateClosingButton(port,page,'[data-duel-allow]');return;
     }
   }
   await H.sleep(80);
 }
 throw Error('SDK permission dialog did not appear');
}
async function current(port,page,H,activateClosingButton){
 const state=await H.evalIn(page,'pet.capabilities.query("character.getCurrent")');
 if(state.status!=='available')await approve(port,H,activateClosingButton);
}
async function replacement(port,previous,H){
 const until=Date.now()+20000;
 while(Date.now()<until){
   const targets=await fetch(`http://127.0.0.1:${port}/json`).then(r=>r.json());
   const next=targets.find(t=>t.url===previous.url&&t.id!==previous.id);
   if(next&&await H.evalIn(next,'typeof DuelClient==="object"').catch(()=>false))return next;
   await H.sleep(80);
 }
 throw Error('Authorized SDK game did not reload');
}
module.exports={approve,current,replacement};
