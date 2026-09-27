'use strict';
// Read-only asset compatibility acceptance: each of the eight built-ins flows
// through the real current-pet bridge and Chromium decoder into production
// normalizeFiles. Settings IPC prepares the selected pet; the fixture button
// runs through native keyboard input. No game or host API is extended.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(process.env.PET_DUEL_HOST_REPO || path.join(ROOT, '../..'));
const H = require(path.join(REPO, 'tests/e2e-helpers'));
const sdkAuth=require('./sdk-authorization.cjs');
const { activateButton, activateClosingButton } = require(path.join(REPO, 'tests/e2e/html-card-input'));
const port = 19695;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-duel-current-pets-'));
const profile = path.join(temp, 'profile');
const source = path.join(temp, 'current-pets.html');
const evidence = path.join(ROOT, 'evidence/current-pets');
const keys = ['qiqi', 'nienie', 'nini', 'dundun', 'dongdong', 'xiaoxiong', 'changchang', 'xiaohu'];
const results = []; let child, service; let uploadRace;
async function until(fn, name) {
  const end = Date.now() + 20000; let last;
  while (Date.now() < end) { try { const value = await fn(); if (value) return value; } catch (error) { last = error.message; } await H.sleep(90); }
  throw Error('Timeout: ' + name + (last ? ': ' + last : ''));
}
// A genuine 4096px transparent PNG keeps Chromium's asynchronous image decode
// observable; no production function or clock is patched to create the race.
function makeLargePng(file) {
  const size = 4096, row = size * 4 + 1, pixels = Buffer.alloc(row * size);
  for (let y = 400; y < size - 400; y++) for (let x = 400; x < size - 400; x++) {
    if ((x - size / 2) ** 2 + (y - size / 2) ** 2 > (size / 2 - 400) ** 2) continue;
    const i = y * row + 1 + x * 4; pixels[i] = 100; pixels[i + 1] = 170; pixels[i + 2] = 125; pixels[i + 3] = 255;
  }
  const chunk = (type, data) => {
    const payload = Buffer.concat([Buffer.from(type), data]); let crc = 0xffffffff;
    for (const byte of payload) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    const header = Buffer.alloc(4), checksum = Buffer.alloc(4); header.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([header, payload, checksum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', require('node:zlib').deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]));
}
async function checkUploadRace(kernel, chat) {
  service = require('../server.cjs').createService(); await service.listen(0, '127.0.0.1');
  const base = 'http://127.0.0.1:' + service.server.address().port;
  let createRequests = 0;
  service.server.on('request', req => { if (req.method === 'POST' && ['/api/create', '/api/join'].includes(req.url)) createRequests++; });
  const game = path.join(ROOT, '躲猫猫对决.html');
  const point = await H.evalIn(kernel, '({x:LX+SIZE/2,y:LY+SIZE/2})');
  const data = { items: [{ mimeType: 'text/html', data: '', title: path.basename(game), baseURL: '' }], files: [game], dragOperationsMask: 1 };
  for (const type of ['dragEnter', 'dragOver', 'drop']) await H.cdp(kernel, 'Input.dispatchDragEvent', { type, ...point, data });
  await until(() => H.evalIn(chat, `window.chatAPI.getCarriedFile().then(f=>f?.name===${JSON.stringify(path.basename(game))})`), 'full game carried');
  await activateButton(chat, '[data-html-preview]');
  let page = await until(async () => {
    const targets = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json());
    for (const target of targets.filter(t => t.url.startsWith('pet-work://') && !t.url.includes('thumbnail=1'))) if (await H.evalIn(target, 'typeof DuelClient === "object"').catch(() => false)) return target;
  }, 'full game for upload race');
  await sdkAuth.current(port,page,H,activateClosingButton);
  await H.evalIn(page, 'document.querySelector("#server-address").focus();document.querySelector("#server-address").select();true');
  await H.cdp(page, 'Input.insertText', { text: base }); await activateButton(page, '#connect');
  await sdkAuth.approve(port,H,activateClosingButton);page=await sdkAuth.replacement(port,page,H);
  await H.cdp(page,'Emulation.setFocusEmulationEnabled',{enabled:true});
  await H.cdp(page,'Page.captureScreenshot',{format:'png'});
  await until(()=>H.evalIn(page,'!!DuelClient.getState().pet'),'pet after new origin authorization').catch(async error=>{console.error('POST-GRANT',await H.evalIn(page,'({state:DuelClient.getState(),status:document.querySelector("#pet-status").textContent})'));throw error;});
  await activateButton(page,'#connect');
  await until(() => H.evalIn(page, '!document.querySelector("#create").disabled && !!DuelClient.getState().pet'), 'connected current pet');
  await activateButton(page, '.custom summary');
  const file = path.join(temp, '真实上传竞争.png'); makeLargePng(file);
  // Observe production disabled state after its real onchange listener. Only the
  // probe writes below are test state; S / game handlers remain unmodified.
  await H.evalIn(page, `window.uploadProbe={}; document.querySelector('#upload').addEventListener('change',()=>{window.uploadProbe.change={create:document.querySelector('#create').disabled,join:document.querySelector('#join').disabled,session:DuelClient.getState().session};});document.addEventListener('keydown',e=>{if(e.key==='Enter')window.uploadProbe.key={create:document.querySelector('#create').disabled,join:document.querySelector('#join').disabled,upload:document.querySelector('#upload').disabled};});document.querySelector('#create').focus();true`);
  const socket = new WebSocket(page.webSocketDebuggerUrl), pending = new Map(); let serial = 0;
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => { const m = JSON.parse(event.data); const p = pending.get(m.id); if (p) { pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
  const send = (method, params) => new Promise((resolve, reject) => { const id = ++serial, timer = setTimeout(()=>{pending.delete(id);reject(Error('race CDP timeout'));},20000); pending.set(id,{resolve,reject,timer}); socket.send(JSON.stringify({id,method,params})); });
  try {
    const tree = await send('DOM.getDocument', {});
    const upload = await send('DOM.querySelector', { nodeId: tree.root.nodeId, selector: '#upload' });
    // Queue native input on the same CDP connection immediately after file input.
    await Promise.all([
      send('DOM.setFileInputFiles', { nodeId: upload.nodeId, files: [file] }),
      send('Input.dispatchKeyEvent', { type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13 }),
      send('Input.dispatchKeyEvent', { type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13 }),
    ]);
  } finally { socket.close(); }
  await until(() => H.evalIn(page, 'document.querySelector("#upload-status").textContent.includes("已准备好")'), 'real uploaded image normalized').catch(async error => { throw Error(error.message + ': ' + JSON.stringify(await H.evalIn(page, '({probe:window.uploadProbe,status:document.querySelector("#upload-status").textContent,session:DuelClient.getState().session})'))); });
  await H.sleep(200);
  uploadRace = await H.evalIn(page, `({probe:window.uploadProbe,lobby:!document.querySelector('#lobby').hidden,source:DuelClient.getState().source,petName:DuelClient.getState().pet?.name,session:DuelClient.getState().session,buttonsReady:!document.querySelector('#create').disabled&&!document.querySelector('#join').disabled})`);
  uploadRace.createRequests = createRequests;
  assert.deepEqual(uploadRace.probe.change, { create: true, join: true, session: null }, 'upload change immediately locks creating/joining');
  assert(uploadRace.probe.key?.create && uploadRace.probe.key?.join && uploadRace.probe.key?.upload, 'native Enter was delivered while upload controls remained disabled');
  assert(uploadRace.lobby && !uploadRace.session && uploadRace.source === 'custom' && uploadRace.petName === '真实上传竞争' && uploadRace.buttonsReady, 'completed upload remains in lobby with the selected normalized pet');
  assert.equal(createRequests, 0, 'native input during pending upload did not create or join any room');
  fs.writeFileSync(path.join(evidence, 'upload-race.png'), Buffer.from((await H.cdp(page,'Page.captureScreenshot',{format:'png'})).data,'base64'));
  console.log('PASS real upload locks room actions before decode and keeps the final pet in lobby');
}
(async () => {
  try {
    H.requireNode22(); fs.mkdirSync(profile); fs.mkdirSync(evidence, { recursive: true });
    fs.writeFileSync(path.join(profile, 'config.json'), JSON.stringify({ character: 'qiqi', onboarding: { completed: true }, relay: { url: '' }, general: { autoCheckUpdates: false }, tts: { enabled: false }, behavior: { idleStroll: false, autoSleep: false } }));
    const modules = ['wall.js', 'geometry.js', 'pet.js', 'rules.js', 'scale.js', 'upload.js'].map(name => `<script>${fs.readFileSync(path.join(ROOT, 'game', name), 'utf8').replace(/<\/script/gi, '<\\/script')}</script>`).join('\n');
    fs.writeFileSync(source, `<!doctype html><meta charset="utf-8"><title>当前宠物素材校验</title><script type="application/json" id="pet-sdk">{"version":1,"permissions":["character:read"],"network":[]}</script><style>body{font:15px system-ui;background:#f2ede3;color:#243833;padding:20px}main{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}article{background:white;padding:12px;border-radius:10px}article div{display:flex}canvas{width:31%;height:auto}small{font-size:10px}button{padding:10px;font:inherit}</style><h1>8 个内置伙伴 · 游戏真实轮廓校验</h1><button id="inspect">读取当前伙伴并校验</button><p id="status">等待</p><main></main>${modules}<script>
window.report=null;
document.querySelector('#inspect').onclick=async()=>{
  if((await window.pet.capabilities.query('character.getCurrent')).status!=='available')await window.pet.capabilities.request({});
  const result=await window.pet.character.getCurrent({states:['idle','walk','greet']});
  const files=[];for(const pose of result.poses){const [header,payload]=pose.dataUrl.split(',');const type=header.slice(5,header.indexOf(';'));const bytes=Uint8Array.from(atob(payload),c=>c.charCodeAt(0));files.push(new File([bytes],pose.label+(type==='image/png'?'.png':'.webp'),{type}));}
  const row={key:result.key,name:result.name,individual:[],all:null,fallback:null};
  for(let i=0;i<files.length;i++){try{const p=await DuelUpload.normalizeFiles([files[i]],DuelRules.limits);row.individual.push({id:result.poses[i].id,ok:true,stats:p.frames[0].stats});}catch(e){row.individual.push({id:result.poses[i].id,ok:false,error:e.message});}}
  let accepted,pet;
  try{pet=await DuelUpload.normalizeFiles(files,DuelRules.limits);accepted=files;row.all={ok:true,poses:pet.frames.length,stats:pet.frames.map(f=>f.stats)};}
  catch(e){row.all={ok:false,error:e.message};accepted=[files[0]];try{pet=await DuelUpload.normalizeFiles(accepted,DuelRules.limits);for(const f of files.slice(1)){try{const next=await DuelUpload.normalizeFiles([...accepted,f],DuelRules.limits);accepted.push(f);pet=next;}catch{}}row.fallback={ok:true,poses:accepted.length,stats:pet.frames.map(f=>f.stats)};}catch(err){row.fallback={ok:false,error:err.message};}}
  const card=document.createElement('article'),title=document.createElement('strong'),frames=document.createElement('div'),info=document.createElement('small');title.textContent=row.name+' · '+row.key;card.append(title,frames,info);
  if(pet){for(const frame of pet.frames){const c=document.createElement('canvas');c.width=c.height=192;const bytes=Uint8ClampedArray.from(atob(frame.pixels),s=>s.charCodeAt(0));c.getContext('2d').putImageData(new ImageData(bytes,192,192),0,0);frames.append(c);}info.textContent=pet.frames.length+' 姿势 · 像素 '+pet.frames.map(f=>f.stats.area).join(' / ');}
  else info.textContent='失败 '+JSON.stringify(row);
  document.querySelector('main').append(card);document.querySelector('#status').textContent=row.name+' 校验完成';window.report=row;
};</script>`);
    child = H.launch({ userData: profile, cdpPort: port, args: ['--mute-audio'], env: { PET_E2E_TEST: '1' } });
    const kernel = await H.findTarget(port, '/index.html');
    await until(() => H.evalIn(kernel, 'typeof runCommand === "function"'), 'host kernel');
    await H.evalIn(kernel, 'window.petAPI.openSettings("my-pet"); runCommand("voice"); true');
    const settings = await H.findReadyTarget(port, '/settings.html', 'settings');
    const point = await H.evalIn(kernel, '({x:LX+SIZE/2,y:LY+SIZE/2})');
    const data = { items: [{ mimeType: 'text/html', data: '', title: path.basename(source), baseURL: '' }], files: [source], dragOperationsMask: 1 };
    for (const type of ['dragEnter', 'dragOver', 'drop']) await H.cdp(kernel, 'Input.dispatchDragEvent', { type, ...point, data });
    const chat = await H.findTarget(port, '/chat.html');
    await until(() => H.evalIn(chat, '!!document.querySelector("[data-html-preview]")'), 'preview button');
    let page;
    for (const key of keys) {
      await H.evalIn(settings, `window.settings.save({character:${JSON.stringify(key)}})`);
      await H.sleep(400); // A different companion invalidates the previous SDK scope.
      const previousId=page?.id;
      await activateButton(chat, '[data-html-preview]');
      page = await until(async () => (await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json())).find(t => t.id!==previousId && t.url.startsWith('pet-work://') && !t.url.includes('thumbnail=1')), 'real current pet work');
      await until(() => H.evalIn(page, 'typeof DuelUpload === "object" && typeof pet.character.getCurrent === "function"'), 'modules and SDK');
      await activateButton(page, '#inspect');
      await sdkAuth.current(port,page,H,activateClosingButton);
      const row = await until(() => H.evalIn(page, `window.report?.key===${JSON.stringify(key)} ? window.report : null`), key + ' compatibility');
      results.push(row); console.log(JSON.stringify({ key, individual: row.individual.map(p => ({ id: p.id, ok: p.ok, error: p.error, area: p.stats?.area })), all: row.all.ok ? {ok:true,poses:row.all.poses} : row.all, fallback: row.fallback }));
    }
    assert((await H.evalIn(chat, 'window.chatAPI.e2eInspectHtmlWork()')).every(p => !p.visible), 'all work windows remain hidden');
    fs.writeFileSync(path.join(evidence, 'all-current-pets.png'), Buffer.from((await H.cdp(page, 'Page.captureScreenshot', { format: 'png' })).data, 'base64'));
    for (const row of results) assert.equal(row.individual.find(p => p.id === 'idle')?.ok, true, row.key + ' idle must be playable');
    assert.equal(results.length, 8);
    await checkUploadRace(kernel, chat);
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { if (child) { fs.writeFileSync(path.join(evidence, 'app.log'), child.log || ''); H.kill(child); } if (service) await service.close(); fs.writeFileSync(path.join(evidence, 'compatibility.json'), JSON.stringify({ passed: !process.exitCode, results, uploadRace }, null, 2)); }
})();
