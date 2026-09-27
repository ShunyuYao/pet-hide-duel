'use strict';
// Reuse the host's named production delivery gate with this exact built work.
// Missing host/build must fail; never silently test the old default game.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const game=path.resolve(__dirname,'..'),host=path.resolve(process.env.PET_DUEL_HOST_REPO||path.join(game,'../..'));
const html=path.join(game,'躲猫猫对决.html'),test=path.join(host,'tests/e2e/peer-session-delivery-e2e.js');
for(const file of [html,test])if(!fs.existsSync(file))throw Error('Missing delivery dependency: '+file);
const result=spawnSync(process.execPath,[test],{cwd:path.join(host,'demo'),stdio:'inherit',env:{...process.env,PET_PEER_GAME_HTML:html}});
if(result.error)throw result.error;process.exitCode=result.status??1;
