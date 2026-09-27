import * as THREE from '../vendor/lib/three.module.js';
import {createRagdoll} from '../vendor/doll/ragdoll-adapter.js';
import {createWardrobe,dressPart} from '../vendor/doll/doll-appearance.js';
import {createGarments} from '../vendor/doll/garment-rig.js';
import {decodeDollRealtime} from './doll-assets.mjs';
import {normalizePose,defaultPose,forwardPose,dragHandle} from './doll-pose.mjs';

const EXPORT_WIDTH=640,EXPORT_HEIGHT=800;
const HANDLE_RADIUS=8,HIT_RADIUS=21;

/**
 * canvas is the visible 2D composition. A private WebGL canvas contains only
 * the actual doll, so exportCanvas() never captures the draggable UI handles.
 * onChange(pose) fires for user drags/reset/setPose. Returned pose values are
 * defensive copies, suitable for JSON persistence. No render/animation loop.
 */
export async function createDollEditor({canvas,realtime,pose,onChange=()=>{}}){
  if(!canvas?.getContext)throw Error('doll_canvas_required');
  const appearance=decodeDollRealtime(realtime);
  const context=canvas.getContext('2d');if(!context)throw Error('doll_canvas_unavailable');
  const raw=document.createElement('canvas');
  const renderer=new THREE.WebGLRenderer({canvas:raw,alpha:true,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power'});
  renderer.setPixelRatio(1);renderer.setSize(EXPORT_WIDTH,EXPORT_HEIGHT,false);
  renderer.setClearColor(0,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  const scene=new THREE.Scene(),rig=new THREE.Group();scene.add(rig);
  const light=new THREE.DirectionalLight(0xffffff,2.0);light.position.set(-3,-5,7);scene.add(light);
  scene.add(new THREE.AmbientLight(0xffffff,1.8));
  const fill=new THREE.DirectionalLight(0xdfe9ff,.7);fill.position.set(4,-2,2);scene.add(fill);
  let doll,texture,disposed=false,active=null,current=normalizePose(pose),layout=null;
  const originalTouchAction=canvas.style.touchAction,originalCursor=canvas.style.cursor;
  let camera;

  function releaseResources(){
    const geometries=new Set(),materials=new Set(),textures=new Set();
    rig.traverse(object=>{
      if(object.geometry)geometries.add(object.geometry);
      for(const material of Array.isArray(object.material)?object.material:[object.material])if(material)materials.add(material);
      if(object.skeleton)object.skeleton.dispose();
    });
    for(const material of materials){
      // cloth/bump are shared module textures. Keep those two reusable; other
      // textures belong to this appearance and are released with the editor.
      for(const key of ['map','bumpMap'])if(material[key]?.image?.src)textures.add(material[key]);
      material.dispose();
    }
    for(const geometry of geometries)geometry.dispose();
    for(const t of textures)t.dispose();texture?.dispose();
    renderer.dispose();renderer.forceContextLoss();
  }

  try{
    texture=await new THREE.TextureLoader().loadAsync(appearance.head);texture.colorSpace=THREE.SRGBColorSpace;
    doll={id:appearance.person,x:0,texture,garmentInputs:appearance.garments,wardrobe:createWardrobe(appearance.person),...createRagdoll()};
    // The photo patterns' sleeve centre is Z=2.75, while the source physics
    // example places its arms at Z=2.60. Bind the clothing to the authored
    // sleeve axis so the hand/forearm stays inside its sleeve after rotation.
    for(const body of doll.bodies)if(body.dollPartName.includes('Arm'))body.position.z=2.75;
    const picks=[];
    for(const body of doll.bodies){body.visual=dressPart(body,doll,picks);rig.add(body.visual);}
    // Bind garment skinning in the original rest frame, before applying pose.
    doll.garments=await createGarments(doll,rig,picks);
    // The source renderer hides skin under long garments. Their photo-cut
    // contours can stop just before a wrist/ankle, leaving detached hands or
    // shoes in a front silhouette. Keep the already-authored lower-limb skin
    // cylinders/caps as the real continuous body beneath clothing; do not
    // patch exported alpha pixels or relax the game's connected-body check.
    for(const body of doll.bodies)if(body.dollPartName.startsWith('lower')){
      for(const mesh of body.visual.children)if(mesh.userData.exposedLimb)mesh.visible=true;
    }
    const photo=doll.parts.head.visual.children.find(object=>object.userData.photoHead);
    if(photo&&appearance.headScale!==1){
      const pos=photo.geometry.attributes.position,half=(photo.geometry.boundingBox.max.x-photo.geometry.boundingBox.min.x)*.025;
      let chin=Infinity;for(let i=0;i<pos.count;i++)if(Math.abs(pos.getX(i))<half)chin=Math.min(chin,pos.getY(i));
      if(!Number.isFinite(chin))chin=photo.geometry.boundingBox.min.y;
      const anchor=new THREE.Vector3(0,chin,0).applyQuaternion(photo.quaternion).add(photo.position);
      photo.scale.setScalar(appearance.headScale);
      photo.position.copy(anchor).sub(new THREE.Vector3(0,chin*appearance.headScale,0).applyQuaternion(photo.quaternion));
    }
    applyPose();rig.updateMatrixWorld(true);
    // Fit once to the immutable photo-head size plus the whole reachable limb
    // envelope, never to the selected pose. The -Y front view cannot orbit.
    const headBounds=new THREE.Box3().setFromObject(doll.parts.head.visual);
    const bottom=-.25,height=Math.max(4.7,headBounds.max.z+.25-bottom),width=height*EXPORT_WIDTH/EXPORT_HEIGHT;
    camera=new THREE.OrthographicCamera(-width/2,width/2,height/2,-height/2,.1,30);
    camera.up.set(0,0,1);camera.position.set(0,-10,bottom+height/2);camera.lookAt(0,0,bottom+height/2);camera.updateMatrixWorld(true);
  }catch(error){releaseResources();throw error;}

  function applyPose(){
    if(!doll)return;
    const {parts}=forwardPose(current);
    for(const body of doll.bodies){
      const next=parts[body.dollPartName];body.position.copy(next.position);body.quaternion.copy(next.quaternion);
      body.visual.position.copy(body.position);body.visual.quaternion.copy(body.quaternion);
    }
    doll.garments?.update();
  }
  function measure(){
    const rect=canvas.getBoundingClientRect(),width=rect.width||canvas.width||400,height=rect.height||canvas.height||500;
    const ratio=Math.min(2,Math.max(1,globalThis.devicePixelRatio||1));
    const pxWidth=Math.round(width*ratio),pxHeight=Math.round(height*ratio);
    if(canvas.width!==pxWidth||canvas.height!==pxHeight){canvas.width=pxWidth;canvas.height=pxHeight;}
    const scale=Math.min(width/EXPORT_WIDTH,height/EXPORT_HEIGHT),w=EXPORT_WIDTH*scale,h=EXPORT_HEIGHT*scale;
    layout={width,height,ratio,x:(width-w)/2,y:(height-h)/2,w,h};return layout;
  }
  function getHandles(){
    if(disposed)return [];
    const frame=layout||measure();
    return forwardPose(current).handles.map(handle=>{
      const projected=new THREE.Vector3(handle.x,handle.y,handle.z).project(camera);
      return {id:handle.id,label:handle.label,x:(frame.x+(projected.x+1)/2*frame.w)/frame.width,y:(frame.y+(1-projected.y)/2*frame.h)/frame.height};
    });
  }
  function render(){
    if(disposed)return;
    const frame=measure();renderer.render(scene,camera);
    context.setTransform(frame.ratio,0,0,frame.ratio,0,0);context.clearRect(0,0,frame.width,frame.height);
    context.drawImage(raw,frame.x,frame.y,frame.w,frame.h);
    for(const h of getHandles()){
      const x=h.x*frame.width,y=h.y*frame.height;
      context.beginPath();context.arc(x,y,HANDLE_RADIUS,0,Math.PI*2);
      context.fillStyle=active?.id===h.id?'#e97945':'#ffffff';context.fill();
      context.lineWidth=2;context.strokeStyle='#ae512d';context.stroke();
      context.beginPath();context.arc(x,y,2,0,Math.PI*2);context.fillStyle='#ae512d';context.fill();
    }
  }
  function eventPoint(event){const rect=canvas.getBoundingClientRect();return {x:event.clientX-rect.left,y:event.clientY-rect.top};}
  function nearest(event){
    const p=eventPoint(event),frame=measure();let best=null,distance=HIT_RADIUS;
    for(const h of getHandles()){const d=Math.hypot(p.x-h.x*frame.width,p.y-h.y*frame.height);if(d<distance){distance=d;best=h;}}
    return best;
  }
  function pointerDown(event){
    if(disposed||active||event.button!==0)return;
    const h=nearest(event);if(!h)return;
    event.preventDefault();active={id:h.id,pointerId:event.pointerId};
    canvas.setPointerCapture(event.pointerId);canvas.style.cursor='grabbing';render();
  }
  function pointerMove(event){
    if(disposed)return;
    if(!active){canvas.style.cursor=nearest(event)?'grab':'default';return;}
    if(event.pointerId!==active.pointerId)return;
    event.preventDefault();const frame=measure(),p=eventPoint(event);
    const world=new THREE.Vector3((p.x-frame.x)/frame.w*2-1,1-(p.y-frame.y)/frame.h*2,0).unproject(camera);
    current=dragHandle(current,active.id,world);applyPose();render();onChange(normalizePose(current));
  }
  function pointerEnd(event){
    if(!active||event.pointerId!==active.pointerId)return;
    const pointerId=active.pointerId;active=null;
    if(canvas.hasPointerCapture(pointerId))canvas.releasePointerCapture(pointerId);
    canvas.style.cursor='grab';render();
  }
  function setPose(value){if(disposed)return;current=normalizePose(value);applyPose();render();onChange(normalizePose(current));}
  function exportCanvas(){
    if(disposed)throw Error('doll_editor_disposed');
    renderer.render(scene,camera);
    const snapshot=document.createElement('canvas');snapshot.width=EXPORT_WIDTH;snapshot.height=EXPORT_HEIGHT;
    snapshot.getContext('2d').drawImage(raw,0,0);return snapshot;
  }
  canvas.style.touchAction='none';canvas.style.cursor='grab';
  const listeners={pointerdown:pointerDown,pointermove:pointerMove,pointerup:pointerEnd,pointercancel:pointerEnd,lostpointercapture:pointerEnd};
  for(const [event,listener] of Object.entries(listeners))canvas.addEventListener(event,listener);
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(render):null;observer?.observe(canvas);
  render();
  return {getPose:()=>normalizePose(current),setPose,reset:()=>setPose(defaultPose()),getHandles,exportCanvas,
    dispose(){
      if(disposed)return;disposed=true;observer?.disconnect();
      for(const [event,listener] of Object.entries(listeners))canvas.removeEventListener(event,listener);
      if(active&&canvas.hasPointerCapture(active.pointerId))canvas.releasePointerCapture(active.pointerId);active=null;
      canvas.style.touchAction=originalTouchAction;canvas.style.cursor=originalCursor;releaseResources();
      context.setTransform(1,0,0,1,0,0);context.clearRect(0,0,canvas.width,canvas.height);
    }};
}

export const create=createDollEditor;
