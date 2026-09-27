#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createService}=require('./server.cjs');
function parseArgs(args){
  const options={port:18765,host:'0.0.0.0',help:false};
  for(let i=0;i<args.length;i++){
    const arg=args[i];
    if(arg==='--help'||arg==='-h')options.help=true;
    else if(arg==='--port'){
      const value=args[++i];if(!/^\d+$/.test(value||'')||Number(value)>65535)throw Error('invalid_port');options.port=Number(value);
    }else if(arg==='--host'){
      const value=args[++i];if(!value||value.startsWith('-'))throw Error('invalid_host');options.host=value;
    }else throw Error('unknown_option');
  }return options;
}
function explain(error,port){
  if(error.code==='EADDRINUSE')return `端口 ${port} 已被占用。已有游戏服务时直接使用它，或改用 --port 18766。`;
  if(error.code==='EACCES'||error.code==='EPERM')return '系统未允许开启局域网服务，请检查本机的网络或防火墙权限。';
  if(error.code==='EADDRNOTAVAIL'||error.code==='ENOTFOUND')return '监听地址不可用，请去掉 --host 参数后重试。';
  if(error.message==='build_required')return '未找到完整游戏文件「躲猫猫对决.html」。请保持游戏文件与启动器在同一文件夹，或先运行 npm run build。';
  if(error.message==='invalid_port')return '端口需为 0 到 65535 的整数，常用端口为 18765。';
  if(error.message==='invalid_host')return '--host 后需要填写本机监听地址。';
  if(error.message==='unknown_option')return '无法识别启动参数；运行 node launch-server.cjs --help 查看用法。';
  if(error.message==='node_version')return '房主电脑需要 Node.js 22 或更新版本。加入房间的电脑只需浏览器。';
  return '服务启动失败：'+(error.code||error.message);
}
async function start({port=18765,host='0.0.0.0',htmlPath=path.join(__dirname,'躲猫猫对决.html')}={}){
  if(Number(process.versions.node.split('.')[0])<22)throw Error('node_version');
  if(!fs.existsSync(htmlPath)||!fs.statSync(htmlPath).isFile())throw Error('build_required');
  const app=createService({htmlPath});
  try{const info=await app.listen(port,host);return{...app,info};}catch(error){await app.close();throw error;}
}
async function main({argv=process.argv.slice(2),htmlPath,output=console.log,errorOutput=console.error}={}){
  let options,app;
  try{
    options=parseArgs(argv);
    if(options.help){output('躲猫猫对决 · 局域网版\n用法：node launch-server.cjs [--port 18765] [--host 0.0.0.0]\n默认允许同一网络访问。仅自己测试时可用 --host 127.0.0.1。\n服务运行期间保持此窗口打开，按 Ctrl+C 结束。');return;}
    app=await start({...options,...(htmlPath?{htmlPath}:{})});
  }catch(error){errorOutput(explain(error,options?.port??18765));process.exitCode=1;return;}
  output('\n躲猫猫对决 · 2D 局域网版已启动');
  output('房主打开：'+app.info.localUrl);
  if(app.info.lanUrls.length){
    output('把下列同网地址发给朋友：');for(const url of app.info.lanUrls)output('  '+url);
    output('双方打开同一个地址，房主创建房间，再把 6 位房间码给朋友。');
  }else output('当前没有可分享的局域网地址。连接 Wi-Fi/网线后重新启动，或使用 0.0.0.0 监听。');
  output('也可以把「躲猫猫对决.html」导入桌宠，再填写以上服务地址。');
  output('请保持此窗口打开。按 Ctrl+C 关闭服务；结束后未完成的房间会清空。\n');
  let stopping=false;
  const stop=async()=>{if(stopping)return;stopping=true;output('正在关闭游戏服务…');await app.close();process.off('SIGINT',stop);process.off('SIGTERM',stop);output('游戏服务已关闭。');};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
  return app;
}
if(require.main===module)main().catch(error=>{console.error(explain(error,18765));process.exitCode=1;});
module.exports={parseArgs,start,main,explain};
