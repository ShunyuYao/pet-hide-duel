'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process'),assert=require('node:assert/strict');
const source=path.join(__dirname,'../躲猫猫对决.html'),html=fs.readFileSync(source,'utf8'),batch=process.argv.includes('--batched')?180:0;
let out=source;
if(batch){const needle='const batch=await sdk.poll({cursor,waitMs:1000});';assert.equal(html.split(needle).length,2);const temp=fs.mkdtempSync(path.join(os.tmpdir(),'duel-motion-'));out=path.join(temp,path.basename(source));fs.writeFileSync(out,html.replace(needle,'await new Promise(r=>setTimeout(r,180));'+needle));}
const run=spawnSync(process.execPath,[path.join(__dirname,'smoothness-e2e.cjs'),'--artifact',out],{stdio:'inherit',env:{...process.env,DUEL_AUDIT:'1',DUEL_BATCH_MS:String(batch),DUEL_BASELINE_SHA:crypto.createHash('sha256').update(html).digest('hex')}});process.exit(run.status??1);
