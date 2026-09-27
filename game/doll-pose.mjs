// Native ragdoll coordinates: Z up, face toward -Y. These are the only editable
// degrees of freedom: four planar upper angles and four relative hinge bends.
// No physics integration, root translation, camera rotation, yaw or pitch.
export const POSE_LIMITS=Object.freeze({
  arm:Object.freeze({upper:Object.freeze([-1.30,1.48]),lower:Object.freeze([-2.05,.18])}),
  leg:Object.freeze({upper:Object.freeze([-.08,.82]),lower:Object.freeze([-.95,.12])})
});
const LIMBS=['armL','armR','legL','legR'];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const point=(x=0,y=0,z=0)=>({x,y,z});
const add=(a,b)=>point(a.x+b.x,a.y+b.y,a.z+b.z);
const midpoint=(a,b)=>point((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
const quaternion=angle=>({x:0,y:Math.sin(angle/2),z:0,w:Math.cos(angle/2)});
export function defaultPose(){return {version:1,armL:{upper:1.15,lower:-.15},armR:{upper:1.15,lower:-.15},legL:{upper:.10,lower:0},legR:{upper:.10,lower:0}};}
export function normalizePose(value){
  const pose=defaultPose();
  for(const limb of LIMBS)for(const angle of ['upper','lower']){
    const v=value?.[limb]?.[angle];
    if(Number.isFinite(v))pose[limb][angle]=clamp(v,...POSE_LIMITS[limb.slice(0,3)][angle]);
  }
  return pose;
}

export function forwardPose(value){
  const pose=normalizePose(value),parts={},handles=[],chains={};
  const place=(name,position,angle=0)=>{parts[name]={position,quaternion:quaternion(angle)};};
  place('pelvis',point(0,0,1.86));place('upperBody',point(0,0,2.35));place('head',point(0,0,3.05));
  for(const [side,sign,suffix,label] of [['Left',1,'L','左'],['Right',-1,'R','右']]){
    for(const kind of ['arm','leg']){
      const limb=kind+suffix,{upper,lower}=pose[limb],arm=kind==='arm';
      const root=arm?point(sign*.36,-.10,2.70):point(sign*.18,0,1.72);
      const vector=(a,length)=>arm?point(sign*Math.cos(a)*length,0,-Math.sin(a)*length):point(sign*Math.sin(a)*length,0,-Math.cos(a)*length);
      const joint=add(root,vector(upper,arm?.62:.84)),end=add(joint,vector(upper+lower,arm?.58:.78));
      place('upper'+side+(arm?'Arm':'Leg'),midpoint(root,joint),(arm?sign:-sign)*upper);
      place('lower'+side+(arm?'Arm':'Leg'),midpoint(joint,end),(arm?sign:-sign)*(upper+lower));
      chains[limb]={root,joint,end};
      handles.push({id:(arm?'elbow':'knee')+suffix,label:label+(arm?'肘':'膝'),...joint},
        {id:(arm?'hand':'foot')+suffix,label:label+(arm?'手':'脚'),...end});
    }
  }
  return {parts,handles,chains};
}

const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
// One bounded dimension search with an exact optimal second-link angle for
// each sample. Unlike unconstrained IK + a final clamp this still reaches the
// nearest valid pose when the pointer is outside the hinge range.
function solveEnd(arm,target,current){
  const limit=POSE_LIMITS[arm?'arm':'leg'],l1=arm?.62:.84,l2=arm?.58:.78;
  const direction=a=>arm?[Math.cos(a),Math.sin(a)]:[Math.sin(a),Math.cos(a)];
  const evaluate=upper=>{
    const d=direction(upper),dx=target.x-l1*d[0],dy=target.y-l1*d[1];
    const angle=arm?Math.atan2(dy,dx):Math.atan2(dx,dy);
    const lower=clamp(wrap(angle-upper),...limit.lower),e=direction(upper+lower);
    const error=(l1*d[0]+l2*e[0]-target.x)**2+(l1*d[1]+l2*e[1]-target.y)**2;
    // Resolve equivalent IK branches continuously, without changing reach.
    return {upper,lower,error:error+1e-8*((upper-current.upper)**2+(lower-current.lower)**2)};
  };
  let best=evaluate(current.upper);const steps=80,step=(limit.upper[1]-limit.upper[0])/steps;
  for(let i=0;i<=steps;i++){const next=evaluate(limit.upper[0]+step*i);if(next.error<best.error)best=next;}
  let lo=clamp(best.upper-step,...limit.upper),hi=clamp(best.upper+step,...limit.upper);
  for(let i=0;i<32;i++){
    const a=evaluate(lo+(hi-lo)/3),b=evaluate(hi-(hi-lo)/3);
    if(a.error<b.error){hi=b.upper;if(a.error<best.error)best=a;}else{lo=a.upper;if(b.error<best.error)best=b;}
  }
  return {upper:best.upper,lower:best.lower};
}

export function dragHandle(value,id,target){
  const pose=normalizePose(value),match=/^(hand|elbow|foot|knee)(L|R)$/.exec(id);
  if(!match||!Number.isFinite(target?.x)||!Number.isFinite(target?.z))return pose;
  const arm=['hand','elbow'].includes(match[1]),limb=(arm?'arm':'leg')+match[2],sign=match[2]==='L'?1:-1;
  const root=forwardPose(pose).chains[limb].root;
  const local={x:clamp(sign*(target.x-root.x),-8,8),y:clamp(root.z-target.z,-8,8)};
  if(['elbow','knee'].includes(match[1])){
    if(Math.hypot(local.x,local.y)<1e-8)return pose;
    pose[limb].upper=clamp(arm?Math.atan2(local.y,local.x):Math.atan2(local.x,local.y),...POSE_LIMITS[arm?'arm':'leg'].upper);
  }else pose[limb]=solveEnd(arm,local,pose[limb]);
  return normalizePose(pose);
}
