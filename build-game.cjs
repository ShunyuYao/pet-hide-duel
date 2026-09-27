'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=__dirname,read=file=>fs.readFileSync(path.join(base,'game',file),'utf8');
const esbuild=require('esbuild');
const doll=esbuild.buildSync({entryPoints:[path.join(base,'game/doll-entry.mjs')],bundle:true,format:'iife',platform:'browser',target:['chrome120'],minify:true,write:false,legalComments:'inline'}).outputFiles[0].text;
const scripts=doll+'\n;\n'+['wall.js','geometry.js','pet.js','rules.js','scale.js','upload.js','render.js','motion.js','host.js','feedback.js','match.cjs','sessions.js','client.js'].map(file=>{const src=read(file);new vm.Script(src,{filename:file});return src;}).join('\n;\n');
let html=read('page.template').replace('__STYLE__',()=>read('style.css')).replace('__SCRIPTS__',()=>scripts.replace(/<\/script/gi,'<\\/script'));
if(/__STYLE__|__SCRIPTS__/.test(html))throw Error('unresolved template placeholder');
if(Buffer.byteLength(html)>10*1024*1024)throw Error('HTML exceeds host limit');
// The distributed HTML carries all notices even when shared without the source tree.
const licenses=['LICENSE','vendor/doll/NOTICE.md','vendor/doll/LICENSE','vendor/lib/LICENSE.three','vendor/lib/LICENSE.cannon-es'];
html+='\n<!--\n'+licenses.map(file=>file+'\n'+fs.readFileSync(path.join(base,file),'utf8')).join('\n').replace(/--/g,'- -')+'\n-->\n';
const target=path.join(base,'躲猫猫对决.html');
if(process.argv.includes('--check')){
  if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==html)throw Error('Built HTML is stale; run npm run build');
  console.log('Single-file HTML matches source and licenses.');
}else{fs.writeFileSync(target,html);console.log('已生成完整游戏：躲猫猫对决.html ('+Buffer.byteLength(html)+' bytes)');}
