import { climateAt, mix, shade, lift, rgb2int, TERMS } from './season.js';
import { hash, makeRng, lerp, clamp, fbm1 } from './rng.js';
import { groundAt, TERM_LEN, YEAR_LEN, BASE_Y, SEG, limb, limbTop } from './world.js';
import { loadStamps, pick, makeSoftDisc, makeLeaf, makePetal, makeStreak, makeGradient, makeRay } from './assets.js';
import { Layer, CW, tree, canopy, treeline, vines, moss, plants, limbs, waterfall, vegColor } from './layers.js';
import { FX, makeRays } from './fx.js';
import { Banana, Cat } from './entities.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { Eggs } from './eggs.js';

function showFatal(msg){ const el=document.getElementById('title'); if(el){ el.className=''; el.innerHTML='<div class="t1">Banana的岁时漫游</div><div class="t3">'+msg+'</div>'; } }
(async function boot(){
let audio=null;
const W=1280, H=720;
// let big polylines/polygons (limbs, moss edges) ride the sprite batcher instead of one draw call each
PIXI.GraphicsGeometry.BATCHABLE_SIZE=6000;
let app;
try { app=new PIXI.Application({ width:W, height:H, antialias:true, backgroundColor:0x0a2a22, resolution:Math.min(1.25,window.devicePixelRatio||1), autoDensity:true, powerPreference:'high-performance' }); }
catch(e){ showFatal('这台设备暂时打不开森林（不支持 WebGL）。换一台设备或浏览器再来吧。'); return; }
document.getElementById('stage').appendChild(app.view);
app.view.addEventListener('webglcontextlost',e=>{ e.preventDefault(); app.ticker.stop(); showFatal('画面暂时离开了。请重新打开再试。'); });
// Landscape stage: on a portrait phone the whole stage (canvas + overlay) is rotated 90° to fill the screen.
function fit(){ const portrait=innerHeight>innerWidth*1.15; const vw=portrait?innerHeight:innerWidth, vh=portrait?innerWidth:innerHeight; const s=Math.min(vw/W, vh/H); const ui=document.getElementById('ui');
  app.view.style.width=W*s+'px'; app.view.style.height=H*s+'px'; app.view.style.position='absolute'; app.view.style.left='0'; app.view.style.top='0'; app.view.style.transformOrigin='0 0';
  if(portrait){ const ox=(innerWidth-H*s)/2, oy=(innerHeight-W*s)/2; app.view.style.transform=`translate(${ox+H*s}px,${oy}px) rotate(90deg)`; ui.style.transform=`translate(${ox+H*s}px,${oy}px) rotate(90deg) scale(${s})`; }
  else { const ox=(innerWidth-W*s)/2, oy=(innerHeight-H*s)/2; app.view.style.transform=`translate(${ox}px,${oy}px)`; ui.style.transform=`translate(${ox}px,${oy}px) scale(${s})`; } }
addEventListener('resize',fit); fit();
document.addEventListener('visibilitychange',()=>{ if(document.hidden){ app.ticker.stop(); if(audio&&audio.suspend) audio.suspend(); } else { app.ticker.start(); if(audio&&audio.resume) audio.resume(); } });

const SAVE_KEY='banana-seasons-v1';
let stored={}; try{ stored=JSON.parse(localStorage.getItem(SAVE_KEY)||'{}'); }catch(e){ stored={}; }
const state=Object.assign({ x:300, far:300, age:0, years:[{seen:[]}], eggs:{}, muted:false }, stored);
if(!state.years[state.age]) state.years[state.age]={seen:[]};
let saveT=0; function save(){ state.x=banana.x; state.far=Math.max(state.far,banana.x); try{ localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }catch(e){} }

const tex={ disc:makeSoftDisc(PIXI,128), leaf:makeLeaf(PIXI), petal:makePetal(PIXI), streak:makeStreak(PIXI), ray:makeRay(PIXI),
  vgrad:makeGradient(PIXI,8,256,[[0,'rgba(255,255,255,0)'],[0.25,'rgba(255,255,255,1)'],[1,'rgba(255,255,255,0.9)']]),
  sky:makeGradient(PIXI,8,512,[[0,'rgba(255,255,255,1)'],[0.55,'rgba(255,255,255,0.55)'],[1,'rgba(255,255,255,0)']]),
  vignette:(()=>{ const c=document.createElement('canvas'); c.width=256; c.height=144; const g=c.getContext('2d'); const gr=g.createRadialGradient(128,72,40,128,72,150); gr.addColorStop(0,'rgba(0,0,0,0)'); gr.addColorStop(1,'rgba(0,0,0,0.75)'); g.fillStyle=gr; g.fillRect(0,0,256,144); return PIXI.Texture.from(c); })(),
};

const stamps=await loadStamps(PIXI, {
  foliage:{src:'assets/sprites/foliage.png', mode:'lum', blurs:[0,2,5]},
  blossom:{src:'assets/sprites/blossom.png', mode:'color', blurs:[0,2,5]},
  twigs:{src:'assets/sprites/twigs.png', mode:'lum', blurs:[0,2,5]},
  vines:{src:'assets/sprites/vines.png', mode:'lum', blurs:[0,2]},
  ferns:{src:'assets/sprites/ferns.png', mode:'lum', blurs:[0,2,4]},
  trunks:{src:'assets/sprites/trunks.png', mode:'lum', blurs:[0,2,5], minArea:3000},
  moss:{src:'assets/sprites/moss.png', mode:'lum', blurs:[0,2]},
  cat:{src:'assets/sprites/cat.png', mode:'color', blurs:[0], scale:0.35},
  banana:{src:'assets/sprites/banana_walk.png', mode:'color', blurs:[0], minArea:2000, scale:0.35},
});
// upload every texture to the GPU now instead of the first time it appears on screen
for(const k in stamps){ if(stamps[k]&&stamps[k].atlas) app.renderer.texture.bind(stamps[k].atlas); }
// fallbacks so a missing sheet never breaks the world
for(const k of ['twigs','vines','ferns']) if(!stamps[k]) stamps[k]=stamps.foliage;

// ---------------------------------------------------------------- layers
const world=new PIXI.Container(); app.stage.addChild(world);
const sky=new PIXI.Container(); world.addChild(sky);
const skyBase=new PIXI.Sprite(PIXI.Texture.WHITE); skyBase.width=W; skyBase.height=H; sky.addChild(skyBase);
const skyTop=new PIXI.Sprite(tex.sky); skyTop.width=W; skyTop.height=H*0.9; sky.addChild(skyTop);
// night sky: moon and a few stars that only show when the climate turns dark
const moon=new PIXI.Sprite(tex.disc); moon.anchor.set(.5); moon.width=moon.height=180; moon.tint=0xfff3d0; moon.alpha=0; sky.addChild(moon);
const moonCore=new PIXI.Sprite(tex.disc); moonCore.anchor.set(.5); moonCore.width=moonCore.height=46; moonCore.tint=0xfffbea; moonCore.alpha=0; sky.addChild(moonCore);
const stars=[]; for(let i=0;i<60;i++){ const st=new PIXI.Sprite(tex.disc); st.anchor.set(.5); st.width=st.height=2+Math.random()*3; st.x=Math.random()*W; st.y=Math.random()*H*0.55; st.ph=Math.random()*6; st.alpha=0; sky.addChild(st); stars.push(st); }
const skyGlow=new PIXI.Sprite(tex.disc); skyGlow.anchor.set(.5); skyGlow.blendMode=PIXI.BLEND_MODES.ADD; skyGlow.width=1400; skyGlow.height=900; skyGlow.x=760; skyGlow.y=120; sky.addChild(skyGlow);

const L={};
const specs=[
  { name:'far',  d:0.92, p:0.10, py:0.05, blur:5, fog:0.78, seed:1.1, build(ctx){ const {rng,clim}=ctx; treeline(L.far,ctx,0.92,BASE_Y+40,12,1.1); const n=3+Math.floor(rng()*3); for(let k=0;k<n;k++){ const x=ctx.x0+rng()*CW; tree(L.far,ctx,x,BASE_Y+230+rng()*90,520+rng()*460,0.92,{width:9+rng()*10,canopy:70+rng()*60,branches:1}); } canopy(L.far,ctx,3,0.92,-60,0.6); } },
  { name:'mid2', d:0.74, p:0.24, py:0.12, blur:2, fog:0.45, seed:2.2, build(ctx){ const {rng,clim}=ctx; treeline(L.mid2,ctx,0.74,BASE_Y+130,6,0.9); const n=1+Math.floor(rng()*3); for(let k=0;k<n;k++){ const x=ctx.x0+rng()*CW; tree(L.mid2,ctx,x,BASE_Y+220+rng()*140,520+rng()*420,0.74,{width:13+rng()*14,canopy:80+rng()*70}); } canopy(L.mid2,ctx,3,0.74,-90,0.8); if(rng()<0.5) vines(L.mid2,ctx,2,0.74,-160); } },
  { name:'mid',  d:0.52, p:0.45, py:0.3, blur:0, fog:0.30, seed:3.3, margin:2, build(ctx){ const {rng,clim}=ctx; const n=1+Math.floor(rng()*2); for(let k=0;k<n;k++){ const x=ctx.x0+rng()*CW; tree(L.mid,ctx,x,BASE_Y+240+rng()*170,600+rng()*400,0.52,{width:22+rng()*26,canopy:95+rng()*70}); }
      if(hash(ctx.i,9.1)<0.22 && clim.water>0.35 && clim.snow<0.6){ const x=ctx.x0+200+rng()*(CW-400); waterfall(L.mid,ctx,x,-220,BASE_Y+140+rng()*100,34+rng()*30); }
      canopy(L.mid,ctx,2,0.52,-120,0.8); vines(L.mid,ctx,1+Math.floor(rng()*2),0.52,-140); moss(L.mid,ctx,1+Math.floor(rng()*2),0.52,-100); } },
  { name:'back', d:0.34, p:0.70, py:0.6, blur:0, fog:0.16, seed:4.4, margin:2, build(ctx){ const {rng,clim}=ctx; limbs(L.back,ctx,0.34,false,170,1.3); if(rng()<0.6){ const x=ctx.x0+rng()*CW; tree(L.back,ctx,x,BASE_Y+400+rng()*100,700+rng()*300,0.34,{width:34+rng()*40,canopy:120+rng()*90,branches:2}); } } },
  { name:'walk', d:0.18, p:1.0, py:1.0, blur:0, fog:0.06, seed:5.5, margin:2, build(ctx){ const {rng,clim}=ctx; limbs(L.walk,ctx,0.18,true); } },
  { name:'near', d:0.08, p:1.28, py:1.15, blur:2, fog:0.0, seed:6.6, build(ctx){ const {rng,clim}=ctx; if(hash(ctx.i,7.7)<0.36){ const x=ctx.x0+rng()*CW; tree(L.near,ctx,x,BASE_Y+560,1500,0.05,{width:60+rng()*50,canopy:160+rng()*100,branches:1,scaleMul:1.2,widthMul:0.8}); } if(rng()<0.5) canopy(L.near,ctx,1,0.05,-170,0.7); if(rng()<0.3) vines(L.near,ctx,1,0.06,-80); if(rng()<0.35) moss(L.near,ctx,1,0.06,-120); } },
  { name:'fore', d:0.0, p:1.55, py:1.3, blur:4, fog:0.0, seed:8.8, build(ctx){ const {rng,clim}=ctx; plants(L.fore,ctx,3+Math.floor(rng()*3),BASE_Y+330,0.0,[0.22,0.48],0.3); } },
];
for(const s of specs){ L[s.name]=new Layer(PIXI,s,stamps,tex); }
world.addChild(L.far.c, L.mid2.c, L.mid.c);
const rays=makeRays(PIXI,tex); world.addChild(rays);
world.addChild(L.back.c);
// water plane lives between back limbs and the walkable limb
const water=new PIXI.Container(); world.addChild(water);
const waterBody=new PIXI.Sprite(PIXI.Texture.WHITE); waterBody.width=W; waterBody.height=H; water.addChild(waterBody);
const waterSheen=new PIXI.Sprite(tex.sky); waterSheen.width=W; waterSheen.height=200; waterSheen.alpha=0.35; water.addChild(waterSheen);
const shimmer=[]; for(let i=0;i<26;i++){ const s=new PIXI.Sprite(tex.streak); s.anchor.set(.5); s.rotation=Math.PI/2; s.scale.set(0.5,1+Math.random()*3); s.blendMode=PIXI.BLEND_MODES.ADD; s.alpha=0.12; s.ph=Math.random()*6; s.y0=Math.random(); water.addChild(s); shimmer.push(s); }
world.addChild(L.walk.c);
const entities=new PIXI.Container(); L.walk.c.addChild(entities);
world.addChild(L.near.c, L.fore.c);
const fx=new FX(PIXI,tex); fx.density=1; world.addChild(fx.c);
const night=new PIXI.Sprite(PIXI.Texture.WHITE); night.width=W; night.height=H; night.blendMode=PIXI.BLEND_MODES.MULTIPLY; night.tint=0x1b2f4f; night.alpha=0; world.addChild(night);
const vignette=new PIXI.Sprite(tex.vignette); vignette.width=W; vignette.height=H; vignette.alpha=0.5; world.addChild(vignette);

// ---------------------------------------------------------------- actors
const bananaFrames=stamps.banana.frames[0]; const catFrames=stamps.cat.frames[0];
const banana=new Banana(PIXI,bananaFrames,tex); const cat=new Cat(PIXI,catFrames,tex);
banana.x=Math.max(120,state.x); banana.y=groundAt(banana.x).y; cat.x=banana.x-64; cat.y=groundAt(cat.x).y;
entities.addChild(cat.c, banana.c);

const ui=new UI(); ui.q('#title .t3 span').textContent='按任意键，出发'; audio=new Audio(); const eggs=new Eggs(ui,state,tex,PIXI,L,entities);
const input={left:false,right:false,run:false,jump:false};
let started=false, journalOpen=false, journalYear=state.age, autoWalk=false;
const keymap={ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ShiftLeft:'run',ShiftRight:'run'};
addEventListener('keydown',e=>{
  if(!started){ started=true; ui.hideTitle(); audio.start(); ui.say(TERMS[curTerm][3][0],6); return; }
  if(e.repeat) return;
  if(e.code==='KeyJ'||(journalOpen&&e.code==='Escape')){ journalOpen=!journalOpen; if(journalOpen){ journalYear=state.age; ui.showJournal(state,journalYear); } else ui.hideJournal(); return; }
  if(journalOpen){ if(e.code==='ArrowLeft'){ journalYear=Math.max(0,journalYear-1); ui.showJournal(state,journalYear);} if(e.code==='ArrowRight'){ journalYear=Math.min(state.age,journalYear+1); ui.showJournal(state,journalYear);} return; }
  if(keymap[e.code]){ input[keymap[e.code]]=true; autoWalk=false; }
  if(e.code==='Space'){ input.jump=true; if(banana.sitting) banana.sitting=false; }
  if(e.code==='KeyE'||e.code==='ArrowDown'||e.code==='KeyS'){ if(banana.onGround){ banana.sitting=!banana.sitting; autoWalk=false; if(banana.sitting) ui.say(pickLine(), 6); } }
  if(e.code==='KeyR'){ autoWalk=!autoWalk; banana.sitting=false; ui.toast(autoWalk?'自动漫游 · 按任意方向键接管':'手动'); }
  if(e.code==='KeyN'){ state.muted=!state.muted; audio.setMuted(state.muted); ui.toast(state.muted?'声音 · 关':'声音 · 开'); }
  if(e.code==='F2'){ document.getElementById('ui').style.opacity=document.getElementById('ui').style.opacity==='0'?'1':'0'; }
});
addEventListener('keyup',e=>{ if(keymap[e.code]) input[keymap[e.code]]=false; });
const touches=new Map();
app.view.addEventListener('pointerdown',e=>{ if(!started){ started=true; ui.hideTitle(); audio.start(); ui.say(TERMS[curTerm][3][0],6); return; } if(journalOpen) return;
  const fx=e.offsetX/app.view.clientWidth; let zone='mid'; if(fx<0.35) zone='left'; else if(fx>0.65) zone='right';
  touches.set(e.pointerId,zone); autoWalk=false;
  if(zone==='mid'){ if(banana.onGround){ banana.sitting=!banana.sitting; if(banana.sitting) ui.say(pickLine(),6); } } else { banana.sitting=false; input[zone]=true; } });
const endTouch=e=>{ const z=touches.get(e.pointerId); if(z&&z!=='mid') input[z]=false; touches.delete(e.pointerId); };
app.view.addEventListener('pointerup',endTouch); app.view.addEventListener('pointercancel',endTouch); app.view.addEventListener('pointerleave',endTouch);

function pickLine(){ const lines=TERMS[curTerm][3]; return lines[Math.floor(Math.random()*lines.length)]; }

// ---------------------------------------------------------------- loop
let camX=banana.x-420, camY=groundAt(banana.x).y-BASE_Y, t=0, curTerm=-1, lastCamX=camX;
let clim=climateAt(banana.x/TERM_LEN);
ui.setTerm(Math.floor((banana.x/TERM_LEN)%24), state.age);
let waterK=0, lastSayT=0;
let slowFrames=0, quality=1;
app.ticker.add(()=>{
  const dt=Math.min(0.05, app.ticker.deltaMS/1000); t+=dt;
  // runtime degradation: if frames stay slow, drop to DPR 1 and thin the weather
  if(app.ticker.deltaMS>45){ if(++slowFrames>90 && quality>0){ quality=0; slowFrames=0; app.renderer.resolution=1; app.renderer.resize(W,H); fx.density=0.4; } } else slowFrames=Math.max(0,slowFrames-1);
  if(started&&!journalOpen){
    if(autoWalk){ input.right=true; }
    banana.update(dt,input); input.jump=false;
    if(autoWalk){ input.right=false; }
  }
  cat.update(dt,banana,t);
  // climate follows the traveller
  const phase=banana.x/TERM_LEN; clim=climateAt(phase);
  const term=Math.floor(phase)%24; const year=Math.floor(banana.x/YEAR_LEN);
  if(year>state.age){ state.age=year; state.years[year]=state.years[year]||{seen:[]}; ui.toast(`又一阵春风。Banana ${state.age} 岁了。`); }
  if(term!==curTerm){ curTerm=term; ui.setTerm(term,state.age); const yr=state.years[state.age]; if(!yr.seen.includes(term)) yr.seen.push(term); if(started && t>2) ui.say(TERMS[term][3][Math.floor(Math.random()*2)],6); eggs.onTerm(term); save(); }
  // camera
  const lead=banana.facing>0?420:760; const tx=banana.x-lead;
  camX=lerp(camX,tx,1-Math.exp(-dt*(banana.sitting?0.8:2.2)));
  const gy=groundAt(banana.x).y; camY=lerp(camY, gy-BASE_Y + (banana.sitting?30:0), 1-Math.exp(-dt*1.6));
  const camDx=camX-lastCamX; lastCamX=camX;
  for(const k in L) L[k].update(camX,camY,clim,t,dt);
  // newly built chunks are appended after the actors; keep Banana and the cat on top of the limb plants
  if(L.walk.c.children[L.walk.c.children.length-1]!==entities) L.walk.c.setChildIndex(entities, L.walk.c.children.length-1);
  // sky
  const nightMul=(1-clim.night*0.35)*(0.88+0.2*clim.light);
  skyBase.tint=rgb2int(shade(clim.fog,nightMul)); skyTop.tint=rgb2int(shade(clim.sky,nightMul)); skyGlow.tint=rgb2int(lift(clim.hi,0.6)); skyGlow.alpha=0.28*clim.light*(1-clim.night)+0.05; skyGlow.x=760-camX*0.02; skyGlow.y=90-camY*0.05;
  moon.alpha=clim.night*0.55; moonCore.alpha=clim.night*0.95; moon.x=moonCore.x=980-camX*0.01; moon.y=moonCore.y=120-camY*0.03;
  for(const st of stars){ st.alpha=clim.night*(0.35+0.4*Math.sin(t*1.5+st.ph)); st.x=((st.ph*200-camX*0.015)%(W+40)+W+40)%(W+40)-20; }
  rays.update(t,clim,camX);
  // water: fades in where the stream runs beside the path
  const wantWater=clim.water*(0.25+0.75*fbm1(banana.x*0.0006,4.2,2))>0.5?1:0; waterK=lerp(waterK,wantWater,1-Math.exp(-dt*0.9));
  water.visible=waterK>0.02; water.alpha=waterK; const wy=BASE_Y+250-camY*0.85; waterBody.y=wy; waterBody.height=H-wy+50; waterBody.tint=rgb2int(shade(mix(clim.fog,clim.mid,0.55),0.62*nightMul)); waterSheen.y=wy; waterSheen.tint=rgb2int(lift(clim.fog,0.35)); waterSheen.alpha=0.3;
  for(const s of shimmer){ s.x=((s.ph*400 - camX*0.9 + Math.sin(t*0.4+s.ph)*30)%(W+200)+W+200)%(W+200)-100; s.y=wy+20+s.y0*(H-wy); s.alpha=0.06+0.05*Math.sin(t*1.3+s.ph*3); s.tint=rgb2int(lift(clim.fog,0.6)); }
  fx.update(dt,clim,camDx,Math.sin(t*0.3)*0.5+0.2);
  night.alpha=clim.night*0.55; vignette.alpha=0.45+clim.night*0.25;
  // actors are inside the walk layer so they inherit its parallax; tint them by depth/night
  const actorTint=rgb2int([255*(1-clim.night*0.45), 255*(1-clim.night*0.4), 255*(1-clim.night*0.2)]);
  banana.spr.tint=actorTint; cat.spr.tint=actorTint; cat.glow.alpha=0.2+0.06*Math.sin(t*2)+clim.night*0.35;
  // ui + hints
  ui.update(dt);
  if(started){ if(!journalOpen){ if(banana.sitting) ui.hint(banana.sitT>3?'E 起身，继续走':'坐一会儿'); else if(Math.abs(banana.speed)<5 && t-lastSayT>4) ui.hint(''); else ui.hint(''); } }
  eggs.update(dt,t,clim,banana,cat,camX,camY);
  audio.update(dt,clim,banana,cat,waterK);
  saveT+=dt; if(saveT>4){ saveT=0; save(); }
});
addEventListener('beforeunload',save);
window.__game={banana,cat,state,L,app,climate:()=>clim,setX:(x)=>{ banana.x=x; banana.y=groundAt(x).y; cat.x=x-64; camX=x-420; camY=groundAt(x).y-BASE_Y; lastCamX=camX; }, start:()=>{ if(!started){ started=true; ui.hideTitle(); } }};

})();
