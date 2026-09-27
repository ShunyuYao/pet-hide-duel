/* Frontal-pose acceptance, Node 22+. Two real hidden Electron hosts import
 * the built standalone HTML through real CDP file drag and approve actual SDK
 * permission dialogs. A real installed rat-doll appearance supplies SDK assets.
 * Game mutation uses native CDP keyboard/pointer input; state APIs are read-only.
 * --baseline runs the archived pre-change HTML/server from evidence/before.
 * PET_DUEL_PACKS_DIR points to local rat-doll distribution fixtures; no photos or
 * character data are bundled by this test. Registered as test:pose-lock-e2e.
 * This covers loopback networking, not physical devices or native OS focus.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(process.env.PET_DUEL_HOST_REPO || path.join(ROOT, '../..'));
const H = require(path.join(REPO, 'tests/e2e-helpers'));
const { activateClosingButton } = require(path.join(REPO, 'tests/e2e/html-card-input'));
const sdkAuth=require('./sdk-authorization.cjs');
const { createService } = require(process.argv.includes('--baseline') ? '../evidence/before/runtime/server.cjs' : '../server.cjs');
const G = require('../game/geometry');
const W = require('../game/wall');
const baseline = process.argv.includes('--baseline');
const source = path.resolve(process.env.PET_DUEL_SOURCE || path.join(ROOT, baseline ? 'evidence/before/legacy-game.html' : '躲猫猫对决.html'));
const evidence = path.join(ROOT, 'evidence', baseline ? 'before' : 'pose-lock');
const packs = process.env.PET_DUEL_PACKS_DIR || path.resolve(ROOT, '../rat-doll-lab/dist');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-plugin-appearance-peer-delivery-duel-'));
const bootstrap = path.join(REPO, 'tests/helpers/peer-session-delivery-bootstrap.js');
const apps = [], clients = [], checks = [], errors = [], diagnostics = [];
let service, passed = false;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function until(fn, label, timeout = 20000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { const value = await fn(); if (value) return value; } catch (error) { last = error.message; }
    await sleep(90);
  }
  throw Error('Timeout: ' + label + (last ? ' (' + last + ')' : ''));
}
async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl), pending = new Map(), runtimeErrors = [];
  let sequence = 0;const loadedFrames=new Set();
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if(message.method==='Page.lifecycleEvent'&&['DOMContentLoaded','load'].includes(message.params.name))loadedFrames.add(message.params.frameId);
    if (message.method === 'Runtime.exceptionThrown') runtimeErrors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') runtimeErrors.push(message.params.args.map(a => a.value || a.description || '').join(' '));
    const rec = pending.get(message.id);
    if (rec) { pending.delete(message.id); clearTimeout(rec.timer); message.error ? rec.reject(Error(JSON.stringify(message.error))) : rec.resolve(message.result); }
  };
  ws.onclose = () => { for (const rec of pending.values()) { clearTimeout(rec.timer); rec.reject(Error('CDP target closed')); } pending.clear(); };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 10000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  // Page-domain observation avoids creating a JS context while Electron is still
  // committing a restored document's sandbox/preload initialization.
  await send('Page.enable');await send('Page.setLifecycleEventsEnabled',{enabled:true});
  const frame=(await send('Page.getFrameTree')).frameTree.frame;
  await until(()=>loadedFrames.has(frame.id),'document commit before Runtime instrumentation');
  await send('Runtime.enable');
  return { send, evaluate, runtimeErrors, close: () => ws.close() };
}
async function key(c, keyName, code = keyName, virtual = 0) {
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, windowsVirtualKeyCode: virtual, ...(keyName === 'Enter' ? { text: '\r' } : {}) });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, windowsVirtualKeyCode: virtual });
}
async function focus(c, selector) {
  const yes = await c.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e || e.disabled || !e.getClientRects().length) return false; e.scrollIntoView({block:'nearest'}); e.focus(); return document.activeElement === e; })()`);
  assert.equal(yes, true, selector + ' is visible, enabled and focused for native input');
}
async function button(c, selector) { await focus(c, selector); await key(c, 'Enter', 'Enter', 13); }
async function input(c, selector, value) {
  await focus(c, selector);
  await c.evaluate(`document.querySelector(${JSON.stringify(selector)}).select();true`);
  await c.send('Input.insertText', { text: String(value) });
}
async function range(c, selector, value) {
  await focus(c, selector); await key(c, 'Home', 'Home', 36);
  // Ordered native key messages on one CDP socket. Batching bounds protocol work
  // while retaining real range input/change semantics for every key press.
  for (let start = 0; start < value; start += 48) {
    const pending = [];
    for (let i = start; i < Math.min(value, start + 48); i++) {
      pending.push(c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 }));
      pending.push(c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 }));
    }
    await Promise.all(pending);
  }
  assert.equal(await c.evaluate(`Number(document.querySelector(${JSON.stringify(selector)}).value)`), value, selector + ' native keyboard value');
}
async function aim(c, point) {
  if (!(await c.evaluate('document.querySelector("#precision").open'))) await button(c, '#precision summary');
  await range(c, '#aim-x', point[0]); await range(c, '#aim-y', point[1]);
}
const snapshot = c => c.evaluate('window.DuelClient.getState().snapshot');
const check = (name, data = {}) => { checks.push({ name, ...data }); console.log('PASS ' + name); };
async function screenshot(c, name, keepScroll = false) {
  if (!keepScroll) await c.evaluate('window.scrollTo(0,0);true');
  await sleep(120);
  const image = await c.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(evidence, name + '.png'), Buffer.from(image.data, 'base64'));
}
async function open(index) {
  const port = 19811 + index * 10, userData = path.join(temp, 'user-' + index), character = index ? 'nienie' : 'qiqi';
  fs.mkdirSync(userData, { recursive: true });
  if (!fs.existsSync(path.join(userData, 'config.json'))) fs.writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ character, onboarding: { completed: true }, relay: { url: '', paired: {} }, tts: { enabled: false }, me: { petId: 'duel-game-e2e-' + index } }));
  const nativeLog = path.join(evidence, 'native-' + apps.length + '.jsonl');
  const app = H.launch({ userData, cdpPort: port, bootstrap, args: ['--mute-audio'], env: { PET_E2E_TEST: '1', PET_PUBLIC_NATIVE_LOG: nativeLog } }); apps.push(app); app.nativeLog = nativeLog;
  const kernelTarget = await H.findTarget(port, '/index.html'), kernel = await connect(kernelTarget);
  try {
    await until(() => kernel.evaluate('typeof runCommand === "function"'), 'pet kernel');
    if (index === 0) await prepareDoll(port, kernel);
    await kernel.evaluate('runCommand("voice");true');
    const pos = await kernel.evaluate('({x:LX+SIZE/2,y:LY+SIZE/2})');
    const data = { items: [{ mimeType: 'text/html', data: '', title: path.basename(source), baseURL: '' }], files: [source], dragOperationsMask: 1 };
    for (const type of ['dragEnter', 'dragOver', 'drop']) await kernel.send('Input.dispatchDragEvent', { type, ...pos, data });
  } finally { kernel.close(); }
  const chatTarget = await H.findTarget(port, '/chat.html'), chat = await connect(chatTarget);
  await until(() => chat.evaluate('window.chatAPI.getCarriedFile().then(c => !!c?.htmlWork)'), 'final game HTML imported through real file drag');
  // Existing host test hook changes received-work ownership only. It does not
  // replace the HTML, upload a pet, or mutate the game's match state.
  assert.equal((await chat.evaluate('window.chatAPI.e2eOpenReceivedHtmlWork("fixture-sender-a")')).ok, true);
  const page = await until(async () => (await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json())).find(t => t.url.startsWith('pet-work:') && !t.url.includes('thumbnail=1')), 'final hosted game content');
  const c = await connect(page); Object.assign(c, { app, page, chat, port, character, index }); clients.push(c);
  await c.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await c.send('Page.captureScreenshot', { format: 'png' });
  await until(() => c.evaluate('typeof window.DuelClient?.getState === "function"'), 'finished game client API');
  await sdkAuth.current(port,page,H,activateClosingButton);
  assert.equal((await chat.evaluate('window.chatAPI.e2eInspectHtmlWork()'))[0].visible, false, 'game window hidden from first paint');
  return c;
}
async function appearance(c, key) {
  if (!c.settings) {
    const kernel=await connect(await H.findTarget(c.port,'/demo/index.html'));
    try { await kernel.evaluate('window.petAPI.openSettings("my-pet");true'); } finally { kernel.close(); }
    c.settings=await connect(await H.findTarget(c.port,'/settings.html'));
    await until(() => c.settings.evaluate('typeof window.settings?.save === "function"'),'production settings bridge');
  }
  await c.settings.evaluate(`window.settings.save(${JSON.stringify({characterAppearances:{qiqi:key}})})`);
  await until(() => c.evaluate(`pet.character.getCurrent({states:["idle"]}).then(p=>p.key===${JSON.stringify(key||'qiqi')})`),'actual host appearance '+(key||'qiqi'));
}
async function petFingerprint(c) {
  const pet=await c.evaluate('window.DuelClient.getState().pet');
  return {name:pet.name,hash:crypto.createHash('sha256').update(JSON.stringify(pet.frames.map(f=>f.pixels))).digest('hex')};
}
async function resultVisible(c) {
  await until(() => c.evaluate(`['#result-title','#rematch'].every(selector=>{ const e=document.querySelector(selector),r=e.getBoundingClientRect(); return r.width>0 && r.height>0 && r.top>=0 && r.bottom<=innerHeight && r.left>=0 && r.right<=innerWidth; })`),'result title and rematch automatically visible',4000);
}
async function waitActive(c, turn) {
  return until(async () => { const s = await snapshot(c); return s?.phase === 'active' && (!turn || s.turn === turn) && s; }, 'active turn ' + (turn || ''), 13000);
}
async function waitBothTurn(a, b, turn) {
  await until(async () => { const states = await Promise.all([snapshot(a), snapshot(b)]); return states.every(s => s?.turn === turn && ['prepare', 'active'].includes(s.phase)); }, 'both peers see turn ' + turn);
}
async function missTurn(shooter, hider) {
  const s = await waitActive(shooter), own = await snapshot(hider);
  const occupied = new Set(own.pixels.map(([x,y]) => x + ',' + y));
  let point;
  for (let y = 3; y < 30 && !point; y++) for (let x = 3; x < 30; x++) if (!occupied.has(x + ',' + y)) { point = [x,y]; break; }
  assert(point, 'safe miss point exists outside real body');
  await aim(shooter, point);
  for (let i = 0; i < 3; i++) {
    await until(() => shooter.evaluate('!document.querySelector("#fire").disabled'), 'fire enabled');
    await button(shooter, '#fire');
    await until(async () => { const next = await snapshot(shooter); return i < 2 ? next.turn === s.turn && next.ammo === 2-i : next.turn === s.turn+1; }, 'miss ' + (i+1) + ' updates ammo/turn');
    if (i < 2) await sleep(360);
  }
  await waitBothTurn(shooter, hider, s.turn + 1);
  assert.equal((await snapshot(hider)).self.hp, own.self.hp, 'three misses do not hurt');
  check('three misses consume exactly three bullets and switch sides', { fromTurn: s.turn, toTurn: s.turn + 1 });
}
async function hitTurn(shooter, hider, expectedHp, label) {
  const before = await waitActive(shooter), hidden = await snapshot(hider), live = new Set(hidden.wall);
  const target = hidden.pixels.find(([x,y]) => x > 1 && y > 1 && G.brickAt(W.bricks, live, x, y) >= 0 && G.brickAt(W.bricks, live, x, y) === G.brickAt(W.bricks, live, x + .5, y + .5));
  assert(target, 'body pixel behind an intact brick');
  assert.equal(before.pixels.some(([x,y]) => x === target[0] && y === target[1]), false, 'shooter cannot see chosen occluded pixel');
  assert.equal(Object.hasOwn(before.opponent, 'pose'), false, 'no opponent pose in shooter packet');
  assert.equal(Object.hasOwn(before.opponent, 'frames'), false, 'no opponent source pixels in shooter packet');
  const brick = G.brickAt(W.bricks, live, target[0], target[1]);
  await aim(shooter, target);
  await button(shooter, '#fire');
  await until(async () => (await snapshot(hider))?.self.hp === expectedHp, label + ' HP');
  await until(async () => (await snapshot(shooter))?.opponent.hp === expectedHp, label + ' remote HP');
  const after = await snapshot(shooter), event = after.events.at(-1);
  assert.equal(event.hit, true); assert.equal(event.brick, brick); assert.equal(event.hp, expectedHp);
  assert.equal(event.turn, before.turn); assert.equal(event.shooter, before.me);
  assert.equal(after.turn, expectedHp === 0 ? before.turn : before.turn + 1, 'hit switches immediately unless match ends');
  if (expectedHp > 0) assert.equal(after.phase, 'prepare', 'hit begins the next 3-second preparation');
  await until(()=>shooter.evaluate('!document.querySelector("#combat-toast").hidden && document.querySelector("#combat-toast").dataset.kind === "hit"'),'visible hit after turn changes');
  await until(()=>hider.evaluate('!document.querySelector("#combat-toast").hidden && document.querySelector("#combat-toast").dataset.kind === "hurt"'),'visible hurt after turn changes');
  await sleep(600);
  assert.equal(await shooter.evaluate('document.querySelector("#combat-toast").hidden'),false,'feedback persists across role switch');
  if(expectedHp>0)assert.equal(await shooter.evaluate('document.querySelector("#role-cue").hidden'),false);
  check(label, { hpBefore: hidden.self.hp, hpAfter: expectedHp, brick, shot: event.shot, turn: before.turn });
  return { brick, initialWall: hidden.wall.length };
}


async function prepareDoll(port, kernel) {
  await kernel.evaluate('petAPI.openSettings("plugins");true');
  const target=await H.findTarget(port,'/settings.html'), settings=await connect(target);
  try {
    await until(()=>settings.evaluate('typeof settings.pluginsInstallZip === "function"'),'appearance install bridge');
    const installed=await settings.evaluate('settings.pluginsList()');
    if(!installed.some(p=>p.id==='rat-doll-male')) {
      const archive=path.join(packs,'rat-doll-male.zip'); assert(fs.existsSync(archive),'3D fixture package: '+archive);
      await settings.evaluate(`window.__posePackInstall=null;settings.pluginsInstallZip(${JSON.stringify(archive)}).then(r=>window.__posePackInstall=r);true`);
      await until(async()=>{
        const result=await settings.evaluate('window.__posePackInstall');
        if(result){assert.equal(result.ok,true,JSON.stringify(result));return true;}
        const targets=await fetch(`http://127.0.0.1:${port}/json`).then(r=>r.json());
        for(const page of targets.filter(t=>t.url.includes('/dialog.html'))){if(await H.evalIn(page,'!!document.querySelector(".btn-primary")').catch(()=>false))await activateClosingButton(port,page,'.btn-primary');}
        return false;
      },'real 3D package install',45000);
    }
    await settings.evaluate('settings.save({characterAppearances:{qiqi:"rat-doll-male"}})');
    await until(()=>kernel.evaluate('currentCharKey === "rat-doll-male"'),'3D doll is actual current host appearance',20000);
  } finally { settings.close(); }
}
async function connectService(c, base, name) {
  await input(c,'#player-name',name); await input(c,'#server-address',base); await button(c,'#connect');
  await sdkAuth.approve(c.port,H,activateClosingButton);
  const fresh=await sdkAuth.replacement(c.port,c.page,H); c.close(); Object.assign(c,await connect(fresh),{page:fresh});
  await c.send('Emulation.setFocusEmulationEnabled',{enabled:true});
  await until(()=>c.evaluate('!!DuelClient.getState().pet || !!DuelClient.getState().editor?.handles?.length'),'pet after network authorization',45000);
  await button(c,'#connect');
  await until(()=>c.evaluate('document.querySelector("#connection-status").dataset.status === "online"'),'service connected');
}
async function hold(c, code, virtual, ms=480) {
  await focus(c,'#board');
  await c.send('Input.dispatchKeyEvent',{type:'keyDown',key:code.startsWith('Key')?code.slice(3).toLowerCase():code,code,windowsVirtualKeyCode:virtual});
  await sleep(ms);
  await c.send('Input.dispatchKeyEvent',{type:'keyUp',key:code.startsWith('Key')?code.slice(3).toLowerCase():code,code,windowsVirtualKeyCode:virtual});
  await sleep(300);
}
async function dragHandle(c, name, dx, dy) {
  await c.evaluate('document.querySelector("#pose-editor-canvas").scrollIntoView({block:"center"});true');
  const point=await c.evaluate(`(()=>{const e=DuelClient.getState().editor,h=e.handles.find(h=>h.id===${JSON.stringify(name)}||h.name===${JSON.stringify(name)}),canvas=document.querySelector('#pose-editor-canvas'),r=canvas.getBoundingClientRect();if(!h)throw Error('missing handle '+${JSON.stringify(name)});return {x:r.left+h.x*r.width,y:r.top+h.y*r.height};})()`);
  // Handle locations come from the live editor's projected geometry. The work
  // content window is interactive; this is native CDP drag, never a pet-window
  // coordinate click or synthetic DOM PointerEvent.
  await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
  await c.send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
  for(let step=1;step<=8;step++){await c.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+dx*step/8,y:point.y+dy*step/8,button:'left',buttons:1});await sleep(25);}
  await c.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+dx,y:point.y+dy,button:'left',buttons:0,clickCount:1});
  await sleep(250);
}
async function enterRoom(a,b) {
  await button(a,'#create'); const room=await until(()=>a.evaluate('DuelClient.getState().session?.room'),'created room');
  await input(b,'#room-code',room); await button(b,'#join');
  await until(async()=>!!(await snapshot(a))?.opponent,'joined both players');
  await button(a,'#ready'); await button(b,'#ready');
  const s=await waitActive(a,1); const shooter=s.shooter===s.me?a:b, hider=shooter===a?b:a;return {shooter,hider};
}
async function closeAndStop(c) {
  const controls=await H.findTarget(c.port,'/work-player.html'); c.close();c.chat.close();c.settings?.close();
  await activateClosingButton(c.port,controls,'[data-work-exit]');await sleep(700);H.kill(c.app);await sleep(1400);
}

(async()=>{
  fs.mkdirSync(evidence,{recursive:true});
  try {
    H.requireNode22();assert(fs.existsSync(source),'build self-contained HTML first');
    service=createService();await service.listen(0,'127.0.0.1'); const base='http://127.0.0.1:'+service.server.address().port;
    let a=await open(0);const b=await open(1);
    for(const c of [a,b])await until(()=>c.evaluate('!!DuelClient.getState().pet || !!DuelClient.getState().editor?.handles?.length'),'actual current pet ready',45000);
    await connectService(a,base,'甲方老鼠干');await connectService(b,base,'乙方捏捏');
    if(baseline) {
      const data=await a.evaluate('({editor:!!document.querySelector("#pose-editor-canvas"),pet:DuelClient.getState().pet.name,frames:DuelClient.getState().pet.frames.length,editorState:DuelClient.getState().editor||null})');
      assert.equal(data.editor,false,'old game has no 3D pose editor');assert(data.pet.includes('老鼠干'));
      check('REPRO: current 3D doll is flattened to old image poses; no editable frontal 3D lobby',data);
      await screenshot(a,'old-3d-lobby');
      const {hider}=await enterRoom(a,b);
      const count=await hider.evaluate('document.querySelectorAll("#game-poses button").length');assert(count>1);
      await button(hider,'#game-poses button:nth-child(2)');await until(async()=>(await snapshot(hider)).self.frame===1,'old game can change pose');
      const before=(await snapshot(hider)).self.pose.y;await hold(hider,'ArrowUp',38);
      assert((await snapshot(hider)).self.pose.y<before,'old game can move vertically');
      check('REPRO: a running match permits a second pose and ArrowUp vertical movement',{poseCount:count,yBefore:before,yAfter:(await snapshot(hider)).self.pose.y});
      await screenshot(hider,'old-in-game-pose-vertical');passed=true;return;
    }
    await until(()=>a.evaluate('!!DuelClient.getState().editor?.handles?.length'),'actual 3D frontal editor',45000);
    assert.equal(await a.evaluate('document.querySelector("#create").disabled'),true,'unconfirmed 3D cannot enter room');
    const initialEditor=await a.evaluate('DuelClient.getState().editor');
    assert.equal(initialEditor.confirmed,false);assert(initialEditor.handles.length>=4,'four limb controls');
    await screenshot(a,'01-3d-frontal-editor');
    for(const [handle,limb,dx,dy] of [['handL','armL',25,-40],['handR','armR',-25,-40],['footL','legL',20,-25],['footR','legR',-20,-25]]) {
      await button(a,'#reset-pose');
      assert.deepEqual(await a.evaluate('DuelClient.getState().editor.pose'),initialEditor.pose,'reset restores initial standing pose');
      await dragHandle(a,handle,dx,dy);
      const dragged=await a.evaluate('DuelClient.getState().editor');
      assert.notDeepEqual(dragged.pose[limb],initialEditor.pose[limb],'real native drag changes '+limb);
      assert.deepEqual(Object.keys(dragged.pose).sort(),['armL','armR','legL','legR','version'],'only planar limb angles are editable');
      for(const other of ['armL','armR','legL','legR'].filter(x=>x!==limb))assert.deepEqual(dragged.pose[other],initialEditor.pose[other],'drag preserves '+other);
      assert.equal(dragged.confirmed,false);assert.equal(await a.evaluate('document.querySelector("#create").disabled'),true,'every new drag invalidates confirmation');
      await screenshot(a,'02-dragged-'+handle);
      await button(a,'#confirm-pose');
      await until(()=>a.evaluate('DuelClient.getState().editor.confirmed && !document.querySelector("#create").disabled'),'confirmed 3D '+handle+' admitted');
    }
    await button(a,'#reset-pose');await dragHandle(a,'handL',-45,-35);
    const extreme=await a.evaluate('DuelClient.getState().editor.pose.armL');
    assert.deepEqual(extreme,{upper:1.48,lower:.18},'native drag reproduces the original wrist-gap extreme');
    await button(a,'#confirm-pose');await until(()=>a.evaluate('DuelClient.getState().editor.confirmed'),'former disconnected limb extreme now confirms');
    assert((await a.evaluate('DuelClient.getState().pet.frames[0].stats.connected'))>=.98,'exported and normalized extreme body remains connected');
    await screenshot(a,'02-former-disconnected-extreme');
    const confirmedBeforeDrag=await a.evaluate('DuelClient.getState().editor');
    await dragHandle(a,'handL',25,-40);
    const finalDraft=await a.evaluate('DuelClient.getState().editor');
    assert.equal(finalDraft.confirmed,false,'dragging an already confirmed pose cancels confirmation');
    assert.notDeepEqual(finalDraft.pose,confirmedBeforeDrag.pose,'confirmed pose really changed by native drag');
    assert.equal(await a.evaluate('document.querySelector("#create").disabled'),true,'changed confirmed pose cannot enter room');
    for(const limb of ['armL','armR','legL','legR'])for(const angle of ['upper','lower'])assert(Number.isFinite(finalDraft.pose[limb][angle]),'finite planar limb angle');
    await sleep(4600);
    assert.deepEqual(await a.evaluate('DuelClient.getState().editor.pose'),finalDraft.pose,'host current-pet polls never overwrite active pose draft');
    assert.equal(await a.evaluate('DuelClient.getState().editor.confirmed'),false,'polling cannot reconfirm an edited draft');
    await button(a,'#confirm-pose');await until(()=>a.evaluate('DuelClient.getState().editor.confirmed && !document.querySelector("#create").disabled'),'final edited pose confirmed');
    const frozen=await petFingerprint(a), frozenPose=await a.evaluate('DuelClient.getState().editor.pose');
    check('real current 3D doll: all four limbs drag independently, reset and reconfirm; each exports a valid frozen body',{frames:await a.evaluate('DuelClient.getState().pet.frames.length')});
    await closeAndStop(a);a=await open(0);
    await until(()=>a.evaluate('DuelClient.getState().editor?.confirmed && !!DuelClient.getState().pet'),'fresh host restores confirmed pose',45000);
    assert.deepEqual(await a.evaluate('DuelClient.getState().editor.pose'),frozenPose,'fresh host exact limb pose');
    assert.deepEqual(await petFingerprint(a),frozen,'fresh host exact normalized body');
    await button(a,'#connect');await until(()=>a.evaluate('!document.querySelector("#create").disabled'),'fresh host reconnects granted service');
    await screenshot(a,'02-fresh-confirmed-pose');check('confirmed frontal pose and exact body pixels survive normal close and fresh host before entering match');
    assert.equal(await a.evaluate('DuelClient.getState().pet.frames.length'),1,'single silhouette admitted');
    assert((await b.evaluate('DuelClient.getState().pet.name')).includes('捏捏'),'2D still auto-loads');
    const bCount=await b.evaluate('document.querySelectorAll("#lobby-poses button").length');
    if(bCount>1)await button(b,'#lobby-poses button:nth-child(2)');
    if(await b.evaluate('!!document.querySelector("#confirm-pose") && document.querySelector("#confirm-pose").getClientRects().length>0 && !document.querySelector("#confirm-pose").disabled'))await button(b,'#confirm-pose');
    await screenshot(b,'03-2d-lobby');
    const {shooter,hider}=await enterRoom(a,b);
    for(const c of [a,b])assert.equal(await c.evaluate('DuelClient.getState().matchPet.frames.length'),1,'each room admits only selected pose');
    assert.equal(await hider.evaluate('[...document.querySelectorAll("#game-poses button")].some(e=>!e.disabled)'),false,'game pose changes unavailable');
    const original=(await snapshot(hider)).self.pose;
    for(const [code,vk] of [['ArrowUp',38],['ArrowDown',40],['KeyW',87],['KeyS',83]])await hold(hider,code,vk,250);
    assert.equal((await snapshot(hider)).self.pose.y,original.y,'all vertical inputs preserve Y');
    await hold(hider,'ArrowRight',39);assert((await snapshot(hider)).self.pose.x>original.x,'horizontal movement works');
    await button(hider,'#rotate-right');await until(async()=>(await snapshot(hider)).self.pose.angle===15,'plane rotation works');
    assert.equal((await snapshot(hider)).self.frame,0,'rotation never changes frozen frame');
    assert.equal((await snapshot(hider)).self.pose.y,original.y,'rotation never shifts vertical location');
    await screenshot(hider,'04-locked-body-moving');check('in-game body frozen: vertical input ignored, horizontal movement and planar rotation work');
    const hit=await hitTurn(shooter,hider,66,'first hit inflicts 34 HP through wall');
    if(shooter===a) {
      await waitActive(a);assert.equal((await snapshot(a)).hiding,true,'3D player is hiding after side switch');
      const before3d=(await snapshot(a)).self.pose;
      await hold(a,'ArrowUp',38,300);assert.equal((await snapshot(a)).self.pose.y,before3d.y,'3D body cannot move vertically');
      await hold(a,'ArrowRight',39,300);assert((await snapshot(a)).self.pose.x>before3d.x,'3D body moves horizontally');
      await button(a,'#rotate-right');await until(async()=>(await snapshot(a)).self.pose.angle===15,'3D body rotates in screen plane');
      assert.equal((await snapshot(a)).self.frame,0);assert.deepEqual(await petFingerprint(a),frozen,'moving and rotating preserve the 3D frozen pixels');
      await screenshot(a,'04-3d-hider-after-switch');
    }
    check('3D player personally hides with the same admitted silhouette, horizontal movement and planar rotation');
    await missTurn(hider,shooter);assert.equal((await snapshot(hider)).wall.includes(hit.brick),false);
    await hitTurn(shooter,hider,32,'second hit leaves 32 HP');await missTurn(hider,shooter);
    await hitTurn(shooter,hider,0,'third hit produces shared knockout');
    await until(async()=>(await snapshot(shooter)).phase==='ended'&&(await snapshot(hider)).phase==='ended','both final results');
    assert.equal((await snapshot(shooter)).winner,(await snapshot(shooter)).me);
    await resultVisible(shooter);await resultVisible(hider);await screenshot(shooter,'05-victory',true);await screenshot(hider,'06-defeat',true);
    const generation=(await snapshot(shooter)).generation;await button(shooter,'#rematch');await until(async()=>(await snapshot(shooter)).self.ready,'one rematch ready');
    assert.equal((await snapshot(shooter)).generation,generation);await button(hider,'#rematch');await until(async()=>(await snapshot(shooter)).generation===generation+1,'mutual rematch');
    const reset=await snapshot(shooter);assert.equal(reset.self.hp,100);assert.equal(reset.opponent.hp,100);assert.equal(reset.ammo,3);assert.equal(reset.wall.length,928);
    await Promise.all([waitActive(a,1),waitActive(b,1)]);assert.deepEqual(await petFingerprint(a),frozen,'rematch keeps confirmed silhouette');
    check('two real hosts complete knockout, win/lose results and mutual rematch with the same frozen body');
    const prior=await Promise.all([snapshot(a),snapshot(b)]);await a.send('Network.enable');
    const network=offline=>a.send('Network.emulateNetworkConditions',{offline,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await network(true);
    try {await until(async()=>(await snapshot(b)).phase==='paused','peer pauses on real HTTP drop',10000);await screenshot(b,'07-peer-paused');}finally{await network(false);}
    await until(async()=>(await snapshot(a)).phase==='active'&&(await snapshot(b)).phase==='active','automatic reconnect',15000);
    for(const [i,c] of [a,b].entries()){const s=await snapshot(c);for(const key of ['generation','turn','ammo','shooter'])assert.equal(s[key],prior[i][key]);assert.equal(s.self.hp,prior[i].self.hp);assert.deepEqual(s.wall,prior[i].wall);}
    check('real network loss pauses both hosts and resumes the same match without losing HP/walls/turn');
    await button(hider,'#leave');await until(()=>hider.evaluate('document.querySelector("#leave-dialog").open'),'leave dialog');await button(hider,'#cancel-leave');
    assert.notEqual((await snapshot(hider)).phase,'ended');await button(hider,'#leave');await button(hider,'#confirm-leave');
    await until(()=>hider.evaluate('!document.querySelector("#lobby").hidden'),'leaver back in lobby');await until(async()=>(await snapshot(shooter)).reason==='left','opponent sees forfeit');
    await button(shooter,'#back-lobby');await until(()=>shooter.evaluate('!document.querySelector("#lobby").hidden'),'winner lobby');
    check('cancel exit retains game; explicit exit notifies opponent and returns both to lobby');
    await closeAndStop(a);const fresh=await open(0);await until(()=>fresh.evaluate('!!DuelClient.getState().editor?.handles?.length'),'fresh host current 3D editor',45000);
    assert.deepEqual(await fresh.evaluate('DuelClient.getState().editor.pose'),frozenPose,'fresh host restores exact chosen limb positions');
    assert.equal(await fresh.evaluate('DuelClient.getState().editor.confirmed'),true,'fresh host remembers explicit confirmation');
    assert.deepEqual(await petFingerprint(fresh),frozen,'fresh host recreates identical frozen silhouette');
    assert.equal(await fresh.evaluate('DuelClient.getState().session'),null,'intentional exit never revives room');
    await screenshot(fresh,'08-fresh-pose-restored');check('normal close and fresh Electron process restore exact confirmed pose and frozen pixels');
    for(const c of clients)assert.deepEqual(c.runtimeErrors,[],'no console errors on game client '+c.index);
    check('no unhandled game renderer exceptions or console errors');passed=true;
  } catch(error) {
    errors.push(error.stack);console.error(error);process.exitCode=1;
    for(const [i,c] of clients.entries()) {
      try{diagnostics.push({index:i,state:await c.evaluate('(()=>{const s=DuelClient.getState();if(s.pet)s.pet.frames=s.pet.frames.map(f=>({...f,pixels:"[omitted]"}));if(s.matchPet)s.matchPet.frames=s.matchPet.frames.map(f=>({...f,pixels:"[omitted]"}));if(s.snapshot)s.snapshot.pixels=s.snapshot.pixels?.length;return {text:document.body.innerText,state:s};})()')});}catch{}
      try{await screenshot(c,'failure-'+i);}catch{}
    }
  } finally {
    for(const c of clients){c.close();c.chat.close();c.settings?.close();}
    for(const [i,app] of apps.entries()){
      fs.writeFileSync(path.join(evidence,'host-'+i+'.log'),app.log||'');H.kill(app);
      if(fs.existsSync(app.nativeLog)){
        const events=fs.readFileSync(app.nativeLog,'utf8').split('\n').filter(Boolean).map(x=>JSON.parse(x));
        if(events.some(x=>x.isVisible||x.isFocused)){passed=false;errors.push('a test window became visible/focused');process.exitCode=1;}
      }
    }
    if(service)await service.close();
    fs.writeFileSync(path.join(evidence,'pose-lock-e2e.json'),JSON.stringify({passed,baseline,checks,errors,diagnostics,hidden:true,host:REPO,sourceSha256:crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),scope:'Two isolated real hidden Electron hosts, actual current 3D appearance via SDK, native CDP drag/keys, real HTTP loopback networking. SDK invitation delivery is covered separately. No physical two-machine Wi-Fi, native focus, or OS compositor claims.',runtimeErrors:clients.map(c=>({index:c.index,errors:c.runtimeErrors}))},null,2));
    console.log('REPORT '+path.join(evidence,'pose-lock-e2e.json')+' '+(passed?'PASS':'FAIL'));
  }
})().then(()=>process.exit(process.exitCode||0));
