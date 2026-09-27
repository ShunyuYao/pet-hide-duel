'use strict';
// Dedicated hidden rendering shell. Real host SDK/import/network acceptance
// lives in pose-lock-e2e; this shell measures the actual WebGL model boundaries.
const {app,BrowserWindow}=require('electron');
const path=require('node:path');
const profile=process.env.PET_DOLL_RENDER_PROFILE,file=process.env.PET_DOLL_RENDER_HTML;
if(!profile||!path.basename(profile).startsWith('pet-duel-doll-render-')||!file)throw Error('isolated_doll_test_required');
app.setPath('userData',profile);
app.whenReady().then(()=>{
  const window=new BrowserWindow({show:false,width:900,height:700,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  window.loadFile(file);
});
app.on('window-all-closed',()=>app.quit());
