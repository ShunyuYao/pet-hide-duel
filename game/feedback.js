/* Server verdicts only; notifications contain no hidden target position. */
(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.DuelFeedback=api;})(globalThis,function(){
  function tracker(){let prior=null,last=0;return{update(s){const out=[],first=!prior;if(first)last=Math.max(0,...s.events.map(e=>e.shot));
    if(prior&&s.generation!==prior.generation)last=0;
    for(const e of s.events){if(e.shot<=last)continue;last=e.shot;if(s.serverTime-e.at>1800)continue;const mine=e.shooter===s.me;
      const kind=e.hit?(mine?'hit':'hurt'):e.brick>=0?'brick':'miss';
      out.push({kind,text:e.hit?(mine?'命中！':'被击中！')+' −'+s.rules.damage:mine?(e.brick>=0?'纸砖击碎 · 未命中':'穿过空隙 · 未命中'):'对方这一枪没有打中',detail:e.hit?(mine?'对方':'你的')+'生命剩余 '+e.hp:'留意墙上新出现的缺口'});
    }
    if(['prepare','active'].includes(s.phase)&&(!prior||s.turn!==prior.turn||s.generation!==prior.generation))out.push({kind:'role',text:s.hiding?'换你躲藏':'换你寻找',detail:s.hiding?'调整左右位置和旋转角度':'准备好 3 发子弹'});
    if(s.phase==='ended'&&(!prior||prior.phase!=='ended'||prior.generation!==s.generation))out.push({kind:s.winner===null?'draw':s.winner===s.me?'win':'loss'});
    prior={generation:s.generation,turn:s.turn,phase:s.phase};return out;}};}
  function create(){
    const $=id=>document.getElementById(id);let track=tracker(),ctx=null,sfx=null,music=null,timer=null,toastTimer=null,phase='lobby',generation=null,step=0,played=0,musicNotes=0,disposed=false;
    let prefs={sfx:.4,music:0};try{const p=JSON.parse(localStorage.getItem('duel-audio'));for(const k of ['sfx','music'])if(Number.isFinite(p?.[k]))prefs[k]=Math.max(0,Math.min(1,p[k]));}catch{}
    function store(){try{localStorage.setItem('duel-audio',JSON.stringify(prefs));}catch{}}
    function tone(freq,time,length,gain,bus,type='sine'){if(!ctx||ctx.state!=='running'||document.hidden)return;const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.setValueAtTime(freq,time);g.gain.setValueAtTime(0,time);g.gain.linearRampToValueAtTime(gain,time+.012);g.gain.exponentialRampToValueAtTime(.0001,time+length);o.connect(g);g.connect(bus);o.start(time);o.stop(time+length+.02);o.onended=()=>{o.disconnect();g.disconnect();};}
    function sound(kind){if(!ctx||ctx.state!=='running'||prefs.sfx===0||document.hidden)return;played++;const t=ctx.currentTime;
      if(['hit','hurt','brick','miss'].includes(kind)){tone(95,t,.11,.55,sfx,'triangle');tone(48,t+.025,.14,.3,sfx,'sawtooth');}
      const notes={hit:[880,1175],hurt:[220,147],brick:[340,270],miss:[170],role:[440,660],win:[523,659,784,1047],loss:[392,330,262],draw:[440,440]}[kind]||[];
      notes.forEach((n,i)=>tone(n,t+.10+i*.11,.25,.18,sfx,kind==='brick'?'triangle':'sine'));
    }
    function syncMusic(){clearInterval(timer);timer=null;if(!ctx||ctx.state!=='running'||!prefs.music||document.hidden||!['prepare','active'].includes(phase))return;
      const play=()=>{musicNotes++;const notes=[262,330,392,330,294,349,440,349];tone(notes[step++%notes.length],ctx.currentTime,.65,.13,music);};play();timer=setInterval(play,600);
    }
    async function unlock(){if(disposed)return;try{if(!ctx){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;ctx=new C();sfx=ctx.createGain();music=ctx.createGain();sfx.connect(ctx.destination);music.connect(ctx.destination);sfx.gain.value=prefs.sfx;music.gain.value=prefs.music;}if(ctx.state==='suspended')await ctx.resume();syncMusic();}catch{$('audio-status').textContent='声音暂不可用，画面提示正常';}}
    for(const k of ['sfx','music']){const el=$('audio-'+k);el.value=Math.round(prefs[k]*100);el.oninput=()=>{prefs[k]=Number(el.value)/100;store();if(ctx)(k==='sfx'?sfx:music).gain.setValueAtTime(prefs[k],ctx.currentTime);void unlock();$('audio-status').textContent=prefs.sfx||prefs.music?'声音设置已保存':'已静音 · 画面提示正常';};}
    function gesture(){if(!ctx||ctx.state==='suspended')void unlock();}
    document.addEventListener('pointerdown',gesture);document.addEventListener('keydown',gesture);
    function visibility(){if(document.hidden){clearInterval(timer);timer=null;if(ctx?.state==='running')void ctx.suspend();}else if(ctx)void unlock();}
    document.addEventListener('visibilitychange',visibility);
    function reset(){track=tracker();generation=null;phase='lobby';syncMusic();clearTimeout(toastTimer);$('combat-toast').hidden=true;$('role-cue').hidden=true;$('shot-feedback').textContent='';}
    function update(s){if(generation!==null&&generation!==s.generation)reset();generation=s.generation;const changed=phase!==s.phase;phase=s.phase;if(changed)syncMusic();for(const m of track.update(s)){sound(m.kind);if(m.kind==='role'){const el=$('role-cue');el.hidden=false;el.textContent=m.text+' · '+m.detail;el.dataset.turn=s.turn;}
      else if(['win','loss','draw'].includes(m.kind)){$('result').dataset.outcome=m.kind;$('result-badge').textContent={win:'胜利',loss:'失败',draw:'平局'}[m.kind];$('role-cue').hidden=true;}
      else{const el=$('combat-toast');el.dataset.kind=m.kind;el.hidden=false;el.querySelector('strong').textContent=m.text;el.querySelector('span').textContent=m.detail;$('shot-feedback').textContent=m.text+' · '+m.detail;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{el.hidden=true;},2200);}}
    }
    window.addEventListener('pagehide',()=>{disposed=true;clearInterval(timer);clearTimeout(toastTimer);document.removeEventListener('pointerdown',gesture);document.removeEventListener('keydown',gesture);document.removeEventListener('visibilitychange',visibility);if(ctx)void ctx.close();},{once:true});
    return{update,reset,diagnostics:()=>({state:ctx?.state||'locked',played,musicNotes,preferences:{...prefs}})};
  }
  return{tracker,create};
});
