'use strict';
const http=require('node:http'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Match}=require('./game/match.cjs'),P=require('./game/pet'),G=require('./game/geometry'),W=require('./game/wall'),defaults=require('./game/rules');
const MAX_BODY_BYTES=700000;
function decodePet(value,limits){
  if(!value||!Array.isArray(value.frames)||value.frames.length<1||value.frames.length>3)throw Error('pose_count');
  const frames=value.frames.map(f=>{
    if(!f||typeof f!=='object'||typeof f.pixels!=='string'||f.pixels.length!==192*192*4/3*4||!/^[A-Za-z0-9+/]+$/.test(f.pixels))throw Error('invalid_frame');
    const rgba=Buffer.from(f.pixels,'base64');if(rgba.length!==192*192*4)throw Error('invalid_frame');
    return {size:192,rgba};
  });
  P.inspectGroup(frames,limits);
  for(const f of frames)for(let angle=0;angle<360;angle+=15)G.clampPose(f,{x:W.width/2,y:W.height/2,angle},W);
  return frames;
}
function addressInfo(port,host,interfaces=os.networkInterfaces()){
  const wildcard=host==='0.0.0.0'||host==='::';
  const lan=[...new Set(Object.values(interfaces).flatMap(v=>v||[]).filter(v=>(v.family==='IPv4'||v.family===4)&&!v.internal&&!v.address.startsWith('127.')).map(v=>v.address))].sort();
  const asUrl=address=>`http://${address.includes(':')?'['+address+']':address}:${port}`;
  const localUrl=asUrl(wildcard?'127.0.0.1':host),lanUrls=(wildcard?lan:lan.includes(host)?[host]:[]).map(asUrl);
  return {version:1,port,localUrl,lanUrls,shareUrls:lanUrls};
}
function createService({rules=defaults.rules,limits=defaults.limits,htmlPath=path.join(__dirname,'躲猫猫对决.html'),now=Date.now}={}){
  // Snapshot tuning before any room can use it; a caller cannot change an active match's limits.
  new Match(rules,now);
  for(const k of ['minArea','maxArea','minSpan','minDensity','minConnected','minPoseRatio'])if(!Number.isFinite(limits?.[k])||limits[k]<=0)throw Error('invalid_limits');
  if(limits.maxArea<limits.minArea||limits.maxArea>192*192||limits.minSpan>192||limits.minDensity>1||limits.minConnected>1||limits.minPoseRatio>1)throw Error('invalid_limits');
  rules=Object.freeze({...rules});limits=Object.freeze({...limits});
  const rooms=new Map(),sessions=new Map(),rates=new Map();let info=null,closing=null;
  function reply(res,status,body){if(!res.writableEnded&&!res.destroyed){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body));}}
  function limiter(req,kind,max){const key=req.socket.remoteAddress+':'+kind,t=now();let rate=rates.get(key);if(!rate||t-rate.at>60000){rate={at:t,count:0};rates.set(key,rate);}if(++rate.count>max)throw Error('rate_limited');}
  function identity(req){
    const auth=req.headers.authorization||'',token=/^Bearer [a-f0-9]{64}$/.test(auth)?auth.slice(7):'',s=sessions.get(token);
    if(!s||s.match.players[s.i].left)throw Error('unauthorized');
    // Expired grace periods settle before the incoming heartbeat refreshes online state.
    s.match.tick();s.match.touch(s.i);return s;
  }
  function name(v){if(typeof v!=='string'||!v.trim()||[...v.trim()].length>12||/[\p{Cc}\p{Cf}]/u.test(v))throw Error('invalid_name');return v.trim();}
  function body(req){
    if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw Error('invalid_content_type');
    if(Number(req.headers['content-length'])>MAX_BODY_BYTES)throw Error('request_too_large');
    return new Promise((resolve,reject)=>{
      let n=0,chunks=[],settled=false;
      const fail=code=>{if(settled)return;settled=true;chunks=[];reject(Error(code));};
      req.on('data',part=>{if(settled)return;n+=part.length;if(n>MAX_BODY_BYTES)fail('request_too_large');else chunks.push(part);});
      req.once('end',()=>{if(settled)return;settled=true;try{resolve(JSON.parse(Buffer.concat(chunks)));}catch{reject(Error('invalid_json'));}});
      req.once('error',()=>fail('invalid_request'));req.once('aborted',()=>fail('invalid_request'));
    });
  }
  function register(room,match,i){const token=crypto.randomBytes(32).toString('hex');sessions.set(token,{room,match,i});return {room,token,me:i};}
  const server=http.createServer(async(req,res)=>{
    // This standalone capability grants game actions only; it never exposes host files or accounts.
    res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Private-Network','true');res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    try{
      const url=new URL(req.url,'http://localhost');
      if(req.method==='GET'&&url.pathname==='/'){
        const stream=fs.createReadStream(htmlPath);
        stream.once('error',()=>{if(res.headersSent)res.destroy();else reply(res,503,{error:'build_required'});});
        stream.once('open',()=>{res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});stream.pipe(res);});
        res.once('close',()=>stream.destroy());return;
      }
      if(req.method==='GET'&&url.pathname==='/health'){reply(res,200,{ok:true,version:1});return;}
      if(req.method==='GET'&&url.pathname==='/api/info'){reply(res,200,info);return;}
      if(req.method==='GET'&&url.pathname==='/api/rules'){reply(res,200,{version:2,rules,limits});return;}
      if(req.method==='GET'&&url.pathname==='/api/state'){limiter(req,'state',2400);const s=identity(req);reply(res,200,{...s.match.snapshot(s.i),room:s.room});return;}
      if(req.method!=='POST'||!['/api/create','/api/join','/api/ready','/api/command','/api/leave'].includes(url.pathname)){reply(res,404,{error:'not_found'});return;}
      limiter(req,'action',6000);const data=await body(req);
      if(!data||typeof data!=='object'||Array.isArray(data))throw Error('invalid_json');
      if(url.pathname==='/api/create'||url.pathname==='/api/join'){
        limiter(req,'join',20);const display=name(data.name),frames=decodePet(data.pet,limits);
        if(url.pathname==='/api/create'){
          if(rooms.size>=32)throw Error('server_full');let room;
          do{room=crypto.randomBytes(4).toString('hex').slice(0,6).toUpperCase();}while(rooms.has(room));
          const match=new Match(rules,now,crypto.randomInt(2));match.created=now();const i=match.add(display,frames);rooms.set(room,match);reply(res,200,register(room,match,i));
        }else{
          const room=String(data.room||'').trim().toUpperCase(),match=rooms.get(room);if(!match)throw Error('room_not_found');const i=match.add(display,frames);reply(res,200,register(room,match,i));
        }return;
      }
      const s=identity(req);let result={ok:true};
      if(url.pathname==='/api/ready')s.match.ready(s.i);
      else if(url.pathname==='/api/leave'){s.match.leave(s.i);sessions.delete((req.headers.authorization||'').slice(7));}
      else result=s.match.command(s.i,data);
      reply(res,200,result);
    }catch(error){
      const e=/^[a-z_]+$/.test(error.message)?error.message:'internal_error';
      if(e==='request_too_large'||e==='invalid_content_type'){res.setHeader('Connection','close');req.resume();}
      const status=e==='unauthorized'?401:e==='rate_limited'?429:e==='request_too_large'?413:e==='invalid_content_type'?415:e==='internal_error'?500:400;
      reply(res,status,{error:e});
    }
  });
  server.requestTimeout=10000;server.headersTimeout=10000;
  const timer=setInterval(()=>{
    const t=now();for(const [code,m]of rooms){m.tick();if(t-Math.max(m.created,...m.players.map(p=>p.lastSeen))>600000){rooms.delete(code);for(const[token,s]of sessions)if(s.room===code)sessions.delete(token);}}
    for(const[k,v]of rates)if(t-v.at>60000)rates.delete(k);
  },200);timer.unref();
  function listen(port=18765,host='0.0.0.0'){
    return new Promise((resolve,reject)=>{
      server.once('error',reject);server.listen(port,host,()=>{server.removeListener('error',reject);info=addressInfo(server.address().port,server.address().address);resolve(info);});
    });
  }
  function close(){
    if(closing)return closing;
    clearInterval(timer);
    closing=new Promise(resolve=>{
      const force=setTimeout(()=>server.closeAllConnections(),1000);force.unref();
      server.close(()=>{clearTimeout(force);sessions.clear();rooms.clear();rates.clear();resolve();});
    });return closing;
  }
  return {server,listen,close};
}
module.exports={createService,decodePet,addressInfo,MAX_BODY_BYTES};
