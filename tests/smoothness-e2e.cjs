'use strict';
// Actual production UDP discovery, real file-send control and byte delivery,
// first-use invitation consent + matching TLS pairing codes, hosted game/SDK.
// No invitation fixture, trust seeding, mock broker or synthesized game results.
// Hidden windows/real CDP keys prove business behavior, not native OS focus or
// physical two-computer networking. Only OS keystore is a disposable AES fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const hostRoot=process.env.PET_DUEL_HOST_REPO||path.resolve(__dirname,'../../..');
const H = require(path.join(hostRoot,'tests/e2e-helpers'));
const F = require(path.join(hostRoot,'tests/helpers/lan-appearance-fixture'));
const { activateButton, activateClosingButton } = require(path.join(hostRoot,'tests/e2e/html-card-input'));
const gameRoot = path.resolve(__dirname,'..'),baseline=process.argv.includes('--baseline');
const artifactIndex=process.argv.indexOf('--artifact'),doll=process.argv.includes('--doll');
const source = (artifactIndex>=0?path.resolve(process.argv[artifactIndex+1]):process.env.PET_PEER_GAME_HTML) || path.join(gameRoot, '躲猫猫对决.html');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-plugin-appearance-peer-delivery-'));
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const evidence = path.join(gameRoot, 'artifacts/smoothness-e2e', runId);
const bootstrap = path.join(H.REPO, 'tests/helpers/peer-session-delivery-bootstrap.js');
const report = { runId, root, scope: 'Actual two hidden production hosts over loopback UDP/TCP/TLS. OS keystore is test AES-GCM only; native Keychain and two physical machines are not covered.', checks: [], failures: [], screenshots: [], dialogs: [], exceptions: [] };
const apps = [], sockets = [],compositors=new Set();
let runtime;
const json = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function check(label, detail) { report.checks.push({ label, pass: true, ...(detail === undefined ? {} : { detail }) }); console.log('PASS', label); }
async function wait(fn, label, ms = 30000) { const until = Date.now() + ms; let last; while (Date.now() < until) { try { const value = await fn(); if (value) return value; last = value; } catch (e) { last = e.message; } await H.sleep(100); } throw Error('Timeout: ' + label + '; last=' + JSON.stringify(last)); }
const targets = app => fetch(`http://127.0.0.1:${app.cdp}/json`).then(r => r.json());
const activity = app => { const file = path.join(app.profile, 'activity-hub.json'); return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)) : { records: [] }; };
const state = app => H.evalIn(app.game, 'DuelClient.getState()');
const snapshot = async app => (await state(app)).snapshot;
async function screenshot(page, name) { await H.cdp(page, 'Page.captureScreenshot', {format:'png'}); await H.evalIn(page, 'document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))'); const result = await H.cdp(page, 'Page.captureScreenshot', { format: 'png' }); const file = path.join(evidence, name + '.png'); fs.writeFileSync(file, Buffer.from(result.data, 'base64')); report.screenshots.push(file); }
async function watch(page, label) { const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }); ws.onmessage = e => { const m = JSON.parse(e.data); if (m.method === 'Runtime.exceptionThrown') report.exceptions.push({ label, details: m.params.exceptionDetails }); }; ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' })); sockets.push(ws); }
async function key(page, code, type = 'keyDown') { const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code === 'Space' ? ' ' : code; await H.cdp(page, 'Input.dispatchKeyEvent', { type, key, code, ...(code === 'Space' ? { windowsVirtualKeyCode: 32 } : code === 'Enter' ? { text: '\r', windowsVirtualKeyCode: 13 } : {}) }); }
async function focus(page, selector) { await H.cdp(page, 'Emulation.setFocusEmulationEnabled', { enabled: true }); assert.equal(await H.evalIn(page, `document.querySelector(${JSON.stringify(selector)}).focus();document.activeElement.matches(${JSON.stringify(selector)})`), true); }
async function input(page, selector, text) { await focus(page, selector); await H.cdp(page, 'Input.insertText', { text }); assert.equal(await H.evalIn(page, `document.querySelector(${JSON.stringify(selector)}).value`), text); }
async function boot(label, discovery, peerDiscovery) {
  const app = { label, profile: path.join(root, label), deviceId: crypto.randomUUID(), name: 'Peer delivery ' + label, cdp: await F.freePort() };
  apps.push(app); fs.mkdirSync(app.profile);
  json(path.join(app.profile, 'device.json'), { deviceId: app.deviceId, name: app.name });
  json(path.join(app.profile, 'friends.json'), { friends: [], pending: [], outgoing: [] });
  json(path.join(app.profile, 'settings-privacy.json'), { version: 1, usageStatsEnabled: false, doNotDisturb: false, verboseLogging: false });
  json(path.join(app.profile, 'config.json'), { character: label === 'a' ? 'qiqi' : 'nienie', petName: app.name,
    me: { petId: 'peer_delivery_' + label }, onboarding: { completed: true },
    behavior: { idleStroll: false, autoSleep: false, edgeSnap: false, petSize: 220 },
    crossScreen: { allowDirectVisits: true, requireVisitConfirmation: false },
    relay: { url: 'ws://127.0.0.1:1', paired: {} }, general: { autoCheckUpdates: false }, tts: { enabled: false },
    plugins: { developerMode: false, registrySources: ['http://127.0.0.1:1/registry.json'] } });
  app.env = { ...process.env, ELECTRON_RUN_AS_NODE: undefined, PET_USERDATA_DIR: app.profile,
    PET_E2E_TEST: '1', PET_E2E_HIDDEN: '1', PET_E2E_BACKGROUND: '1', PET_DND_TRIGGER_COUNT: '999',
    PET_ACCOUNT_API_BASE: 'http://127.0.0.1:1', PET_ACTIVITY_BRIDGE_PORT: '0',
    PET_LAN_DISCOVERY_PORT: String(discovery), PET_LAN_DISCOVERY_TARGETS: `127.0.0.1:${peerDiscovery}`,
    PET_E2E_LAN_TCP_PORT: String(await F.freePort()), PET_E2E_TF_PORT: String(await F.freePort()) };
  return launch(app);
}
async function launch(app) {
  app.run = { label: app.label + '-run-' + ((app.runs?.length || 0) + 1) }; (app.runs ||= []).push(app.run);
  app.run.native = path.join(evidence, app.run.label + '-native.jsonl'); fs.writeFileSync(app.run.native, '');
  app.child = spawn(require(path.join(H.REPO,'demo/node_modules/electron')), ['--require', bootstrap, runtime.demo, `--remote-debugging-port=${app.cdp}`, '--use-mock-keychain', '--mute-audio'], { cwd: runtime.demo, env: { ...app.env, PET_PUBLIC_NATIVE_LOG: app.run.native }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  app.run.pid = app.child.pid; app.child.log = ''; app.child.stdout.on('data', x => { app.child.log += x; }); app.child.stderr.on('data', x => { app.child.log += x; });
  app.pet = await H.findTarget(app.cdp, '/index.html');
  await wait(() => H.evalIn(app.pet, 'typeof currentCharKey==="string" && !!frames.idle?.[0]?.[0]?.naturalWidth'), 'real pet decoded ' + app.label);
  await wait(async () => (await H.evalIn(app.pet, H.CANVAS_PIXELS)) > 100, 'real pet painted ' + app.label);
  await watch(app.pet, app.run.label + '-pet');
  app.overlay = await H.findTarget(app.cdp, '/pet-overlay.html'); await wait(() => H.evalIn(app.overlay, 'typeof petOverlayAPI === "object"'), 'overlay preload ready');
  await screenshot(app.pet, app.run.label + '-pet'); return app;
}
async function stop(app) {
  if (!app.child) return;
  const child = app.child; H.kill(child);
  await wait(() => { try { process.kill(child.pid, 0); return false; } catch (e) { return e.code === 'ESRCH'; } }, 'owned host stopped ' + app.label, 10000);
  fs.writeFileSync(path.join(evidence, app.run.label + '-host.log'), child.log); app.run.exited = true; app.child = null;
}
async function nearby(a, b) { return wait(async () => { const rows = await H.evalIn(a.pet, 'petAPI.lanGetDevices()'); return rows.find(r => r.deviceId === b.deviceId); }, 'actual UDP discovered receiver'); }
async function sendGame(a, b, {share = false} = {}) {
  const previous = new Set(activity(b).records.map(r => r.id));
  const peer = await nearby(a, b); report.discovery = peer;
  await H.evalIn(a.pet, 'petAPI.openDashboard();true'); a.dashboard = await H.findReadyTarget(a.cdp, '/dashboard.html', 'dashboard');
  await wait(() => H.evalIn(a.dashboard, '!!document.querySelector("[data-action=resident-errand], .lan-row[data-via=lan] .lan-errand:not([disabled])")'), 'real discovered device send control');
  if (await H.evalIn(a.dashboard, '!!document.querySelector("[data-action=resident-errand]")')) await activateButton(a.dashboard, '[data-action=resident-errand]');
  else await activateClosingButton(a.cdp, a.dashboard, '.lan-row[data-via="lan"] .lan-errand');
  await wait(() => H.evalIn(a.overlay, '!!document.querySelector("#errand-card")'), 'real send card');
  await activateButton(a.overlay, '#errand-card [data-tab="file"]');
  // The resident entry opens an unaddressed composer; select the discovered peer
  // through the same real recipient control used by the rooms acceptance path.
  const recipient = `[data-friend="${b.deviceId}"]`;
  await wait(() => H.evalIn(a.overlay, `!!document.querySelector(${JSON.stringify(recipient)})`), 'real discovered recipient chip');
  if (!await H.evalIn(a.overlay, `document.querySelector(${JSON.stringify(recipient)}).getAttribute("aria-pressed")==="true"`)) await activateButton(a.overlay, recipient);
  const point = await wait(() => H.evalIn(a.overlay, '(()=>{const e=document.querySelector("#ec-dropzone");if(!e)return null;const r=e.getBoundingClientRect();return r.width&&r.height?{x:r.left+r.width/2,y:r.top+r.height/2}:null;})()'), 'file tab dropzone painted');
  // CDP drag uses actual OS file paths. These are drag target coordinates, never
  // synthesized mouse clicks or pet-window hit-testing.
  const data = { items: [{ mimeType: 'text/html', data: '', title: path.basename(source), baseURL: '' }], files: [source], dragOperationsMask: 1 };
  for (const type of ['dragEnter', 'dragOver', 'drop']) await H.cdp(a.overlay, 'Input.dispatchDragEvent', { type, ...point, data });
  await wait(() => H.evalIn(a.overlay, `document.querySelector('#ec-dropzone .ec-attachment strong')?.textContent===${JSON.stringify(path.basename(source))}`), 'real file selected');
  await input(a.overlay, '#ec-input', '一起玩躲猫猫'); await activateButton(a.overlay, '#ec-go');
  const sendDialog = await wait(async () => { for(const page of (await targets(a)).filter(t=>t.url.includes('/dialog.html'))){const init=await H.evalIn(page,'dialogAPI.getInit()',3000).catch(()=>null);if(init?.peerSessionKind==='send'&&await H.evalIn(page,'!!document.querySelector(".btn-primary") && document.body.innerText.length>10'))return page;}return null; }, 'real send versus share choice');
  await screenshot(sendDialog, share?'send-share-only':'send-and-play'); await activateClosingButton(a.cdp,sendDialog,share?'.btn-secondary':'.btn-primary');
  const incoming = await wait(() => activity(b).records.find(r => !previous.has(r.id) && r.direction === 'incoming' && r.file?.name === path.basename(source) && r.file.savedPath && fs.existsSync(r.file.savedPath)), 'real received HTML saved', 45000);
  assert.equal(hash(incoming.file.savedPath), hash(source)); assert(incoming.file.htmlWork?.id); report.incoming = incoming;
  check('real send controls deliver identical HTML bytes and persist the received work', { id: incoming.id, artifactHash: incoming.file.htmlWork.id });
  const receipt = await wait(async () => { for (const page of (await targets(b)).filter(t => t.url.includes('/dialog.html'))) if (await H.evalIn(page, '!!document.querySelector("[data-work-open]")').catch(() => false)) return page; return null; }, 'real work receipt');
  assert(!(await targets(b)).some(t => t.url.startsWith('pet-work:') && !t.url.includes('thumbnail=1')), 'receipt must not execute before opening');
  await screenshot(receipt, 'received-game-before-open');
  await activateClosingButton(b.cdp, receipt, '[data-work-open]');
}
async function verifyShareOnly(a,b){
  await wait(async()=>{
    for(const page of (await targets(b)).filter(t=>t.url.includes('/dialog.html'))){
      const init=await H.evalIn(page,'dialogAPI.getInit()',3000).catch(()=>null);if(!init)continue;
      assert(!init.peerSessionKind,'share-only must not create pairing or invitation');
      const text=await H.evalIn(page,'document.body.innerText');if(text.includes('请求桌宠能力')&&await H.evalIn(page,'!!document.querySelector(".btn-primary")'))await activateClosingButton(b.cdp,page,'.btn-primary');
    }
    const page=(await targets(b)).find(t=>t.url.startsWith('pet-work:')&&!t.url.includes('thumbnail=1'));if(!page)return false;
    if(b.game?.id!==page.id){b.game=page;await H.cdp(page,'Emulation.setFocusEmulationEnabled',{enabled:true});await H.cdp(page,'Page.captureScreenshot',{format:'png'});await watch(page,'b-shared-game');}
    if(await H.evalIn(page,'!!window.DuelClient?.getState().pet',3000).catch(()=>false)){b.game=page;return true;}return false;
  },'shared file opens without invitation');
  assert.equal(await H.evalIn(b.game,'pet.sessions.getContext()'),null);
  assert(!(await targets(a)).some(t=>t.url.startsWith('pet-work:')&&!t.url.includes('thumbnail=1')));
  const controls=await H.findTarget(b.cdp,'/work-player.html');await activateClosingButton(b.cdp,controls,'[data-work-exit]');
  // The receipt clears phase/errand before the visitor-departed handshake starts
  // the return animation. That gap is not a completed return to this screen.
  await wait(()=>H.evalIn(a.pet,'!homecomingPending && !pet.lanPhase && !pet._errand'),'sender returned after share-only receipt',45000);
  check('explicit share-only delivers a runnable file without pairing, invitation or sender game window');
}
function classifyDialog(init, text) {
  if (['pair', 'accept'].includes(init.peerSessionKind)) return init.peerSessionKind;
  if (text.includes('请求桌宠能力')) return 'sdk';
  if (/(?:[0-9A-F]{4}[ -]){3}[0-9A-F]{4}/i.test(text)) return 'pair';
  if (/加入.*(?:对局|游戏)|接受.*邀请|邀请.*联机|一起.*玩|联机邀请/.test(init.title || text)) return 'accept';
  return null;
}
async function approvals(a, b, expectPair = true) {
  const seen = new Set(), pairing = new Map(); let accepted = 0, sdk = 0, paired = false;
  await wait(async () => {
    for (const app of [a, b]) for (const page of (await targets(app)).filter(t => t.url.includes('/dialog.html') && !seen.has(t.id))) {
      const init = await H.evalIn(page, 'dialogAPI.getInit()', 3000).catch(() => null); if (!init) continue;
      const text = await H.evalIn(page, 'document.body.innerText'); if(!text.trim())continue; const kind = classifyDialog(init, text); if (!kind || kind==='pair'&&!/(?:[0-9A-F]{4}[ -]){3}[0-9A-F]{4}/i.test(text)) continue;
      seen.add(page.id); report.dialogs.push({ app: app.label, kind, title: init.title, text }); await screenshot(page, app.label + '-' + kind + '-' + seen.size);
      if (kind === 'pair') { assert(expectPair, 'trusted peers must not pair again'); pairing.set(app.label, { app, page, code: text.match(/(?:[0-9A-F]{4}[ -]){3}[0-9A-F]{4}/i)[0].replaceAll(' ', '').replaceAll('-', '').toLowerCase() }); }
      else { if (kind === 'sdk') sdk++; else accepted++; await activateClosingButton(app.cdp, page, '.btn-primary'); }
    }
    if (pairing.size === 2 && !paired) { const [left, right] = [...pairing.values()]; assert.equal(left.code, right.code); assert.equal(left.code.length, 16); await activateClosingButton(left.app.cdp, left.page, '.btn-primary'); await activateClosingButton(right.app.cdp, right.page, '.btn-primary'); paired = true; check('both independently presented TLS pairing codes match before explicit confirmations'); }
    const pages = await Promise.all([a, b].map(async app => { const page = (await targets(app)).find(t => t.url.startsWith('pet-work:') && !t.url.includes('thumbnail=1')); if (!page) return null; if(app.game?.id!==page.id){app.game=page;await compositor(page);await H.cdp(page,'Emulation.setFocusEmulationEnabled',{enabled:true});await H.cdp(page,'Page.captureScreenshot',{format:'png'});} if(doll&&app===a&&await H.evalIn(page,'!!window.DuelClient?.getState().editor?.handles?.length && !DuelClient.getState().editor.confirmed && !document.querySelector("#confirm-pose").disabled').catch(()=>false))await activateButton(page,'#confirm-pose'); const ready = await H.evalIn(page, '!!window.DuelClient?.getState().pet && !document.querySelector("#create").disabled', 3000).catch(() => false); if (ready) { app.game = page; return page; } return null; }));
    return pages.every(Boolean);
  }, 'invitation, first pairing, SDK permission and current pets', 65000);
  assert(accepted >= 1, 'recipient must accept each game invitation'); assert(!expectPair || paired); if(expectPair)assert(sdk >= 1, 'fresh work requires explicit SDK consent');
  for (const app of [a, b]) { await watch(app.game, app.label + '-game'); assert.equal(await H.evalIn(app.game, 'document.querySelector("#upload").files.length'), 0); const context = await H.evalIn(app.game, 'pet.sessions.getContext()'); assert.equal(context.role, app === a ? 'host' : 'guest'); assert.equal(context.artifactHash, hash(source)); app.context = context; }
  assert.equal(a.context.invitationId, b.context.invitationId);
  check('real invite binds both current pets and exact artifact to sender referee and receiver guest');
}
async function waitActive(app) { return wait(async () => { const s = await snapshot(app); return s?.phase === 'active' && s; }, 'active game turn', 12000); }
async function shootAt(app, point) {
  // Real keyboard sliders. Batch CDP messages on one connection to keep a high
  // x-coordinate from consuming a 20-second turn while retaining real input.
  const ws = new WebSocket(app.game.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }); let id = 0; const pending = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
  const send = (method, params) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
  try { await send('Emulation.setFocusEmulationEnabled', { enabled: true }); await send('Runtime.evaluate', { expression: 'document.querySelector("#precision").open=true;true' });
    for (const [selector, value] of [['#aim-x', point[0]], ['#aim-y', point[1]]]) {
      await send('Runtime.evaluate', { expression: `document.querySelector(${JSON.stringify(selector)}).focus();true` });
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Home', code: 'Home', windowsVirtualKeyCode: 36 }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Home', code: 'Home', windowsVirtualKeyCode: 36 });
      const keys = []; for (let i = 0; i < value; i++) { keys.push(send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })); keys.push(send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 })); } await Promise.all(keys);
    }
  } finally { ws.close(); }
  assert.deepEqual((await state(app)).aim, { x: point[0] + .5, y: point[1] + .5 }); await activateButton(app.game, '#fire');
}
async function prepareDoll(app){
  const archive=path.join(process.env.PET_DUEL_PACKS_DIR||path.resolve(gameRoot,'../rat-doll-lab/dist'),'rat-doll-male.zip');assert(fs.existsSync(archive),'required private 3D fixture: '+archive);
  await H.evalIn(app.pet,'petAPI.openSettings("plugins");true');const settings=await H.findTarget(app.cdp,'/settings.html');await wait(()=>H.evalIn(settings,'typeof window.settings?.pluginsInstallZip === "function"'),'actual settings installer');
  await H.evalIn(settings,`window.__motionInstall=null;settings.pluginsInstallZip(${JSON.stringify(archive)}).then(r=>window.__motionInstall=r);true`);
  await wait(async()=>{const result=await H.evalIn(settings,'window.__motionInstall');if(result){assert.equal(result.ok,true,JSON.stringify(result));return true;}for(const page of (await targets(app)).filter(t=>t.url.includes('/dialog.html')))if(await H.evalIn(page,'!!document.querySelector(".btn-primary")').catch(()=>false))await activateClosingButton(app.cdp,page,'.btn-primary');return false;},'real 3D package installation',45000);
  await H.evalIn(settings,'settings.save({characterAppearances:{qiqi:"rat-doll-male"}})');await wait(()=>H.evalIn(app.pet,'currentCharKey === "rat-doll-male"'),'3D doll is actual current appearance');check('real private doll installed and selected through production settings API');
}
async function compositor(page) {
  if(compositors.has(page.id))return;compositors.add(page.id);
  const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});sockets.push(ws);let id=0;
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Page.screencastFrame')ws.send(JSON.stringify({id:++id,method:'Page.screencastFrameAck',params:{sessionId:m.params.sessionId}}));};
  ws.send(JSON.stringify({id:++id,method:'Page.startScreencast',params:{format:'jpeg',quality:1,maxWidth:160,maxHeight:100,everyNthFrame:1}}));
}
function motionMetrics(rows,kind='body') {
  const samples=rows.filter(r=>kind==='body'?r.pixels>0:!!r[kind]);const ds=samples.slice(1).map((p,i)=>{const q=samples[i],a=kind==='body'?p:p[kind],b=kind==='body'?q:q[kind];return {dt:p.t-q.t,d:Math.hypot(a.x-b.x,a.y-b.y)};});
  const sorted=ds.map(p=>p.dt).sort((a,b)=>a-b);return {frames:ds.length,meanFrameMs:ds.reduce((s,p)=>s+p.dt,0)/ds.length,p95FrameMs:sorted[Math.floor(sorted.length*.95)],movingRatio:ds.filter(p=>p.d>.01).length/ds.length,maxStep:Math.max(...ds.map(p=>p.d)),maxSpeed:Math.max(...ds.map(p=>p.d/p.dt*1000))};
}
async function motionRun(a,b) {
  for(const app of [a,b]){await compositor(app.game);await H.evalIn(app.game,fs.readFileSync(path.join(__dirname,'motion-probe.js'),'utf8'));}
  await activateButton(a.game,'#create');await activateButton(b.game,'#create');
  await wait(async()=>(await snapshot(a))?.opponent&&(await snapshot(b))?.opponent,'both pets transferred');
  await activateButton(a.game,'#ready');await activateButton(b.game,'#ready');await waitActive(a);
  report.measurements={};
  async function hold(app,code,kind,label,peer){if(peer)await H.evalIn(peer.game,'__motionProbe.reset()');await focus(app.game,'#board');await H.evalIn(app.game,'__motionProbe.reset()');await key(app.game,code);await H.sleep(1700);await key(app.game,code,'keyUp');const moving=await H.evalIn(app.game,'({frames:__motionProbe.frames,updates:__motionProbe.updates})');if(peer){const raw=await H.evalIn(peer.game,'({frames:__motionProbe.frames,updates:__motionProbe.updates})');const elapsed=(raw.frames.at(-1).t-raw.frames[0].t)/1000;assert(raw.frames.every(r=>r.offsetX===0&&r.offsetY===0));json(path.join(evidence,label+'-shooter-frames.json'),raw);report.measurements[label+'-shooter']={durationSeconds:elapsed,updates:raw.updates.length,effectiveSnapshotHz:raw.updates.length/elapsed,nonemptyUpdates:raw.updates.filter(r=>r.n>0).length,...motionMetrics(raw.frames)};}await H.sleep(650);const all=await H.evalIn(app.game,'({frames:__motionProbe.frames,updates:__motionProbe.updates})');json(path.join(evidence,label+'-frames.json'),all);const first=moving.frames[0]?.t||0,rows=moving.frames.filter(r=>r.t>first+300),m=motionMetrics(rows,kind);assert(m.frames>60&&m.meanFrameMs<30,'natural native frame cadence must support motion assertion');if(baseline){assert(m.movingRatio<.35&&m.maxStep>(kind==='aim'?3:15),'baseline must reproduce cadence steps');}else{assert(m.movingRatio>.85,'held movement must change on almost every native frame');assert(m.maxSpeed<(kind==='aim'?85:450),'no cadence-sized jumps');}if(kind==='body'){const marker=motionMetrics(rows,'marker');assert(Math.abs(m.movingRatio-marker.movingRatio)<.04,'body and marker move together');}const stop=all.frames.filter(r=>r.t>moving.frames.at(-1).t+100);const stopped=motionMetrics(stop,kind);if(!baseline)assert(stopped.maxStep<2,'release must stop without pulling back on stale snapshots');let convergence=null;if(kind==='body'&&!baseline){const authority=(await snapshot(app)).self.pose,presented=all.frames.at(-1).marker;convergence=Math.hypot(authority.x-presented.x,authority.y-presented.y);assert(convergence<.1,'stopped presentation must converge to acknowledged authority');}report.measurements[label]={...m,stopped,convergence,updates:moving.updates.length};await screenshot(app.game,label);}
  await hold(a,'KeyD','aim','host-aim');
  // Open a real wall hole ahead of the hider without granting hidden-pixel data.
  await shootAt(a,[650,106]);await H.sleep(400);
  await hold(b,'KeyA','body','guest-hider',a);
  const shooterProbe=await H.evalIn(a.game,'({frames:__motionProbe.frames,updates:__motionProbe.updates})');assert(shooterProbe.frames.every(r=>r.offsetX===0&&r.offsetY===0),'shooter masked pixels must never be translated');report.shooter={hostUpdates:shooterProbe.updates.length,hostNonemptyUpdates:shooterProbe.updates.filter(r=>r.n>0).length};json(path.join(evidence,'host-shooter-frames.json'),shooterProbe);
  for(let i=0;i<2;i++){await shootAt(a,[1,1]);await H.sleep(400);}await wait(async()=>(await snapshot(a))?.hiding,'roles swapped');await waitActive(b);
  await hold(b,'KeyD','aim','guest-aim');await hold(a,'KeyD','body','host-hider',b);
  const guestProbe=await H.evalIn(b.game,'({frames:__motionProbe.frames,updates:__motionProbe.updates})');assert(guestProbe.frames.every(r=>r.offsetX===0&&r.offsetY===0));report.shooter.guestUpdates=guestProbe.updates.length;report.shooter.guestNonemptyUpdates=guestProbe.updates.filter(r=>r.n>0).length;json(path.join(evidence,'guest-shooter-frames.json'),guestProbe);
  await activateButton(b.game,'#leave');await activateButton(b.game,'#confirm-leave');await wait(()=>H.evalIn(b.game,'!document.querySelector("#lobby").hidden'),'leaver returns to lobby');await wait(async()=>(await state(a)).sessionEnded,'peer sees invitation ended');await focus(a.game,'#board');await H.evalIn(a.game,'__motionProbe.reset()');await key(a.game,'KeyD');await H.sleep(500);await key(a.game,'KeyD','keyUp');const ended=await H.evalIn(a.game,'__motionProbe.frames');assert(motionMetrics(ended).maxStep<.01,'ended peer must not keep predicting');await screenshot(a.game,'peer-after-leave');check('real leave confirmation ends peer session and stops movement');
  report.status=baseline?'reproduced':'fixed-local-presentation';check(baseline?'real inputs reproduce snapshot-cadence body and aim steps':'real inputs produce smooth own body and aim, stop on release, preserve shooter masking');
}
(async () => {
  fs.mkdirSync(evidence, { recursive: true });
  try {
    H.requireNode22(); assert(fs.existsSync(source), 'build final game HTML first'); report.gameSha256 = hash(source); report.bootstrapSha256 = hash(bootstrap); report.testSha256 = hash(__filename);
    runtime = F.freeze(H.REPO, root, false); if(fs.existsSync(path.join(H.REPO,'node_modules')))fs.symlinkSync(path.join(H.REPO,'node_modules'),path.join(runtime.root,'node_modules')); report.source = runtime.source;
    const ap = await F.freePort(), bp = await F.freePort(); const a = await boot('a', ap, bp), b = await boot('b', bp, ap);
    if(doll)await prepareDoll(a);await sendGame(a,b);await approvals(a,b);if(doll){assert((await state(a)).editor?.confirmed);await screenshot(a.game,'confirmed-3d-pose');report.characterCoverage='actual current 3D doll host + 2D guest';}else report.characterCoverage='actual current 2D pets on both hosts';await motionRun(a,b);
  } catch (error) { report.failures.push(error.message); report.error = error.stack; console.error(error); for (const app of apps) for (const page of await targets(app).catch(() => [])) if (page.type === 'page') {const dom=await H.evalIn(page,'({url:location.href,ready:document.readyState,text:document.body?.innerText?.slice(0,6000),game:typeof DuelClient==="object"?DuelClient.getState():null})',3000).catch(e=>({error:e.message}));json(path.join(evidence,app.label+'-failure-'+page.id+'.json'),dom);await screenshot(page, app.label + '-failure-' + page.id).catch(() => {});} }
  finally {
    for (const ws of sockets) ws.close();
    for (const app of apps) { await stop(app).catch(e => report.failures.push('cleanup: ' + e.message)); for (const run of app.runs || []) { try { const rows = fs.readFileSync(run.native, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse); assert(rows.some(r => r.event === 'loaded' && r.page === 'index.html')); assert(rows.every(r => !r.isVisible && !r.isFocused && r.backgroundThrottling === false)); assert(run.exited); check(run.label + ' hidden before first paint and owned process exited', { nativeLog: run.native, pid: run.pid }); } catch (e) { report.failures.push('native isolation: ' + e.message); } } }
    if (runtime && !isDeepStrictEqual(F.hashes(runtime.root), runtime.files)) report.failures.push('frozen runtime changed');
    if (report.testSha256 && hash(__filename) !== report.testSha256) report.failures.push('test source changed during run');
    if (report.bootstrapSha256 && hash(bootstrap) !== report.bootstrapSha256) report.failures.push('bootstrap source changed during run');
    if (report.exceptions.length) report.failures.push('uncaught renderer exceptions');
    report.ok = !report.failures.length; json(path.join(evidence, 'report.json'), report); console.log('REPORT', path.join(evidence, 'report.json')); process.exitCode = report.ok ? 0 : 1;
  }
})().then(() => process.exit(process.exitCode || 0));
