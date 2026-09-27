/* First-release tuning. Both clients and the LAN referee consume this source. */
(function(root){
  'use strict';
  const rules=Object.freeze({hp:100,damage:34,shots:3,prepareMs:3000,turnMs:20000,poseMs:1000,shotMs:300,disconnectMs:2500,reconnectMs:30000,matchMs:360000,speed:260});
  const limits=Object.freeze({minArea:5000,maxArea:22000,minSpan:40,minDensity:.25,minConnected:.98,minPoseRatio:.65});
  const api=Object.freeze({rules,limits});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.DuelRules=api;
})(globalThis);
