const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const P=require('../game/pet'),S=require('../game/scale'),G=require('../game/geometry'),W=require('../game/wall'),{limits}=require('../game/rules');
function fresh(){const context=vm.createContext({DuelPet:P,DuelScale:S,DuelGeometry:G,DuelWall:W,Uint8Array,btoa:s=>Buffer.from(s,'binary').toString('base64'),atob:s=>Buffer.from(s,'base64').toString('binary')});vm.runInContext(fs.readFileSync(require.resolve('../game/upload'),'utf8'),context);return context.DuelUpload;}
test('restored custom session keeps original scale basis, rejects mismatched basis',()=>{
 const rgba=Buffer.alloc(192*192*4);for(let y=36;y<156;y++)for(let x=46;x<146;x++)rgba.set([100,150,90,255],(y*192+x)*4);
 const base={name:'custom',scale:1,sourceCanvas:[192,192],frames:[{name:'pose',pixels:rgba.toString('base64')}]};
 const pet={name:'custom',scalePercent:85,frames:[{name:'pose',pixels:Buffer.from(S.resize({size:192,rgba},85).rgba).toString('base64')}]};
 let upload=fresh();assert(upload.restoreBase(pet,base,limits));const saved=JSON.parse(JSON.stringify({pet,base:upload.exportBase(pet)}));upload=fresh();assert(upload.restoreBase(saved.pet,saved.base,limits));
 assert.equal(upload.rescale(saved.pet,100,limits).frames[0].pixels,base.frames[0].pixels);assert.equal(upload.rescale(saved.pet,85,limits).frames[0].pixels,pet.frames[0].pixels);
 saved.base.frames[0].pixels=Buffer.alloc(rgba.length).toString('base64');assert.equal(fresh().restoreBase(saved.pet,saved.base,limits),false);
});
