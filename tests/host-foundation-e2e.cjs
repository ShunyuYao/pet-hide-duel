/* Foundation acceptance, not the unreleased final game UI.
 * Two real hidden host processes import a self-contained probe, select real PNG
 * files, join/ready/fire via native keyboard, and observe server HP + brick loss.
 */
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),REPO=path.resolve(process.env.PET_DUEL_HOST_REPO||path.join(ROOT,'../..'));
const H=require(path.join(REPO,'tests/e2e-helpers'));
const {activateButton,activateClosingButton}=require(path.join(REPO,'tests/e2e/html-card-input'));
const {createService}=require('../server.cjs'),G=require('../game/geometry'),W=require('../game/wall');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'pet-duel-e2e-')),evidence=path.join(ROOT,'evidence');
const rules={hp:100,damage:34,shots:3,prepareMs:3000,turnMs:20000,poseMs:1000,shotMs:300,disconnectMs:2500,reconnectMs:30000,matchMs:360000,speed:260};
const limits={minArea:4000,maxArea:25000,minSpan:40,minDensity:.25,minConnected:.98,minPoseRatio:.65};
let service;const apps=[],errors=[];let passed=false;
async function until(fn,label,seconds=25){const end=Date.now()+seconds*1000;while(Date.now()<end){try{const v=await fn();if(v)return v;}catch{}await H.sleep(100);}throw Error('Timeout: '+label);}
function html(base){const scripts=['wall.js','geometry.js','pet.js','upload.js'].map(f=>fs.readFileSync(path.join(ROOT,'game',f),'utf8')).join('\n');return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>宠物对决 · 联机基础验收</title><style>body{font:16px system-ui;padding:24px;background:#f7f4ee;color:#24342e}button,input{font:inherit;margin:6px;padding:8px}canvas{width:90%;display:block;border:1px solid #777}#error{color:#ab3535}</style><h1>联机基础验收</h1><p>此页是自动验收夹具，正式游戏界面待定。</p><input id="name" aria-label="名字" value="测试宠物"><input type="file" id="upload" accept="image/png,image/webp" multiple><output id="upload-state">请选择宠物</output><p><button id="create">创建</button><input id="room" aria-label="房间码"><button id="join">加入</button><button id="ready">准备</button></p><p><input id="aim-x" aria-label="瞄准 X"><input id="aim-y" aria-label="瞄准 Y"><button id="fire">射击</button></p><div id="status"></div><div id="hp"></div><div id="error" role="alert"></div><canvas id="board" width="1253" height="214"></canvas><script>${scripts}</script><script>
const base=${JSON.stringify(base)},limits=${JSON.stringify(limits)},$=id=>document.getElementById(id);let session=null;window.fixturePet=null;window.fixtureState=null;
try{const saved=JSON.parse(localStorage.getItem('duel-probe')||'null');if(saved){$('name').value=saved.name;window.fixturePet=saved.pet;$('upload-state').textContent='已恢复姿势 '+saved.pet.frames.length;}}catch{}
async function api(route,data){const r=await fetch(base+route,{method:data?'POST':'GET',headers:{...(data?{'content-type':'application/json'}:{}),...(session?{authorization:'Bearer '+session.token}:{})},...(data?{body:JSON.stringify(data)}:{})});const j=await r.json();if(!r.ok)throw Error(j.error);return j;}
function fail(e){$('error').textContent=e.message;}
$('upload').onchange=async()=>{try{const pet=await DuelUpload.normalizeFiles([...$('upload').files],limits);window.fixturePet=pet;localStorage.setItem('duel-probe',JSON.stringify({name:$('name').value,pet}));$('upload-state').textContent='合格姿势 '+pet.frames.length;$('error').textContent='';}catch(e){fail(e);}};
$('name').onchange=()=>{if(window.fixturePet)localStorage.setItem('duel-probe',JSON.stringify({name:$('name').value,pet:window.fixturePet}));};
for(const kind of ['create','join'])$(kind).onclick=async()=>{try{session=await api('/api/'+kind,{name:$('name').value,pet:window.fixturePet,room:$('room').value});$('room').value=session.room;await poll();}catch(e){fail(e);}};
$('ready').onclick=()=>api('/api/ready',{}).catch(fail);
$('fire').onclick=()=>api('/api/command',{type:'shoot',id:crypto.randomUUID(),turn:fixtureState.turn,generation:fixtureState.generation,x:Number($('aim-x').value),y:Number($('aim-y').value)}).then(()=>poll()).catch(fail);
async function poll(){if(!session)return;try{const s=await api('/api/state');window.fixtureState=s;$('status').textContent=s.phase+' / 回合 '+s.turn;$('hp').textContent='我方 '+s.self.hp+' / 对方 '+(s.opponent?.hp??'等待');const c=$('board').getContext('2d');c.clearRect(0,0,1253,214);c.fillStyle='#22332f';c.fillRect(0,0,1253,214);for(const [x,y,color]of s.pixels){c.fillStyle='#'+color.toString(16).padStart(6,'0');c.fillRect(x,y,1,1);}c.globalAlpha=s.hiding?.45:1;for(const id of s.wall){const [x,y,w,h]=DuelWall.bricks[id];c.fillStyle=id%2?'#b49470':'#c4a883';c.fillRect(x,y,w,h);}c.globalAlpha=1;}catch(e){fail(e);}}
setInterval(poll,180);
</script></html>`;}
async function input(t,selector,text){await H.evalIn(t,`document.querySelector(${JSON.stringify(selector)}).focus();document.querySelector(${JSON.stringify(selector)}).select();true`);await H.cdp(t,'Input.insertText',{text:String(text)});}
async function file(t,filename){
 const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let seq=0;
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>reject(Error('file input timeout')),5000);ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id===id){clearTimeout(timer);m.error?reject(Error(JSON.stringify(m.error))):resolve(m.result);}};ws.send(JSON.stringify({id,method,params}));});
 try{const d=await send('DOM.getDocument');const q=await send('DOM.querySelector',{nodeId:d.root.nodeId,selector:'#upload'});await send('DOM.setFileInputFiles',{nodeId:q.nodeId,files:[filename]});}finally{ws.close();}
}
async function open(index,source){const port=19671+index*10,userData=path.join(temp,'user-'+index);fs.mkdirSync(userData,{recursive:true});
 if(!fs.existsSync(path.join(userData,'config.json')))fs.writeFileSync(path.join(userData,'config.json'),JSON.stringify({onboarding:{completed:true},relay:{url:'',paired:{}},tts:{enabled:false},me:{petId:'duel-e2e-'+index}}));
 const app=H.launch({userData,cdpPort:port,args:['--mute-audio'],env:{PET_E2E_TEST:'1'}});apps.push(app);
 const kernel=await H.findTarget(port,'/index.html');await until(()=>H.evalIn(kernel,'typeof runCommand === "function"'),'kernel');await H.evalIn(kernel,'runCommand("voice");true');
 const pos=await H.evalIn(kernel,'({x:LX+SIZE/2,y:LY+SIZE/2})'),data={items:[{mimeType:'text/html',data:'',title:path.basename(source),baseURL:''}],files:[source],dragOperationsMask:1};
 for(const type of ['dragEnter','dragOver','drop'])await H.cdp(kernel,'Input.dispatchDragEvent',{type,...pos,data});
 const chat=await H.findTarget(port,'/chat.html');await until(()=>H.evalIn(chat,'window.chatAPI.getCarriedFile().then(c=>!!c?.htmlWork)'),'HTML import');
 // Receive hook only sets the stored-work ownership. File ingestion above is the real drag path.
 assert.equal((await H.evalIn(chat,'window.chatAPI.e2eOpenReceivedHtmlWork("fixture-sender-a")')).ok,true);
 const page=await until(async()=>(await fetch(`http://127.0.0.1:${port}/json`).then(r=>r.json())).find(t=>t.url.startsWith('pet-work:')&&!t.url.includes('thumbnail=1')),'hosted content');
 await until(()=>H.evalIn(page,'!!document.querySelector("#create") && !!window.DuelUpload'),'probe load');
 await H.cdp(page,'Emulation.setFocusEmulationEnabled',{enabled:true});await H.cdp(page,'Page.captureScreenshot',{format:'png'});
 assert.equal((await H.evalIn(chat,'window.chatAPI.e2eInspectHtmlWork()'))[0].visible,false);
 return {app,page,chat,port};
}
async function shot(t,name){fs.writeFileSync(path.join(evidence,name+'.png'),Buffer.from((await H.cdp(t,'Page.captureScreenshot',{format:'png'})).data,'base64'));}
(async()=>{try{
 fs.mkdirSync(evidence,{recursive:true});
 execFileSync('python3',['-c',`from PIL import Image,ImageDraw\nfrom pathlib import Path\np=Path(${JSON.stringify(temp)})\nim=Image.new('RGBA',(256,256));d=ImageDraw.Draw(im);d.ellipse((70,15,185,240),fill=(70,180,140,255));im.save(p/'pet.png');Image.new('RGBA',(256,256)).save(p/'empty.png')`]);
 service=createService({rules,limits});await service.listen(0,'127.0.0.1');const source=path.join(temp,'联机验收.html');fs.writeFileSync(source,html('http://127.0.0.1:'+service.server.address().port));
 const a=await open(0,source),b=await open(1,source);
 for(const [i,client]of[a,b].entries()){await input(client.page,'#name',i?'乙方':'甲方');await file(client.page,path.join(temp,'pet.png'));await until(()=>H.evalIn(client.page,'document.querySelector("#upload-state").textContent.includes("合格")'),'native file upload');}
 await file(a.page,path.join(temp,'empty.png'));await until(()=>H.evalIn(a.page,'document.querySelector("#error").textContent === "empty_pet"'),'empty rejected');assert.equal(await H.evalIn(a.page,'fixturePet.frames.length'),1);
 await activateButton(a.page,'#create');const room=await until(()=>H.evalIn(a.page,'fixtureState?.room'),'room code');await input(b.page,'#room',room);await activateButton(b.page,'#join');
 await until(()=>H.evalIn(a.page,'!!fixtureState?.opponent'),'two players');await activateButton(a.page,'#ready');await activateButton(b.page,'#ready');await until(()=>H.evalIn(a.page,'fixtureState?.phase === "active"'),'active');
 const state=await H.evalIn(a.page,'fixtureState'),shooter=state.shooter===0?a:b,hider=shooter===a?b:a;
 const hidden=await H.evalIn(hider.page,'fixtureState');const target=hidden.pixels.find(([x,y])=>G.brickAt(W.bricks,new Set(hidden.wall),x+.5,y+.5)>=0);assert(target);
 const before=hidden.wall.length;await shot(shooter.page,'foundation-shooter-before');await shot(hider.page,'foundation-hider-before');
 await input(shooter.page,'#aim-x',target[0]+.5);await input(shooter.page,'#aim-y',target[1]+.5);await activateButton(shooter.page,'#fire');
 await until(()=>H.evalIn(hider.page,'fixtureState?.self.hp === 66'),'same shot damage');
 assert.equal(await H.evalIn(shooter.page,'fixtureState.opponent.hp'),66);assert.equal(await H.evalIn(shooter.page,'fixtureState.turn'),2);
 // After role swap the previous hider becomes the shooter, so target wall is the former shooter's.
 // Inspect the newly hiding client's own wall in its next snapshot after a second empty turn.
 assert.equal(await H.evalIn(hider.page,'fixtureState.events.at(-1).brick >= 0'),true);
 assert.equal(await H.evalIn(shooter.page,'fixtureState.events.at(-1).hit'),true);
 await shot(shooter.page,'foundation-after-hit');
 assert.equal(await H.evalIn(a.page,"JSON.parse(localStorage.getItem('duel-probe')).name"),'甲方');
 const controls=await H.findTarget(a.port,'/work-player.html');await activateClosingButton(a.port,controls,'[data-work-exit]');await H.sleep(700);
 H.kill(a.app);await H.sleep(1500);const fresh=await open(0,source);
 assert.equal(await H.evalIn(fresh.page,'document.querySelector("#name").value'),'甲方');
 assert.equal(await H.evalIn(fresh.page,'fixturePet.frames.length'),1);assert.equal(await H.evalIn(fresh.page,'fixtureState'),null);
 await shot(fresh.page,'foundation-fresh-process');
 passed=true;console.log('PASS: two hidden real hosts, native file input, empty rejection, HTTP room/ready/fire, intact-wall same-shot damage, fresh-process draft persistence.');
}catch(e){errors.push(e.stack);console.error(e);process.exitCode=1;}finally{
 for(const [i,app]of apps.entries()){fs.writeFileSync(path.join(evidence,'foundation-host-'+i+'.log'),app.log||'');H.kill(app);}
 if(service)await service.close();fs.writeFileSync(path.join(evidence,'foundation-e2e.json'),JSON.stringify({passed,errors,scope:'Foundation probe only; final game UI is not implemented or accepted.',hidden:true},null,2));
}})();
