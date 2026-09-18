// Screen-space particle systems: leaves, petals, snow, rain, fireflies, motes,
// plus god rays and the night grade. Counts follow the climate continuously.
import { rgb2int, mix, lift } from './season.js';
const W=1280,H=720;
export class FX {
  constructor(PIXI, tex){
    this.PIXI=PIXI; this.tex=tex; this.c=new PIXI.Container();
    this.pools={}; this.t=0;
    for(const k of ['leaf','petal','snow','rain','fire','mote']) this.pools[k]=[];
  }
  spawn(kind, clim, rng, camX){
    const PIXI=this.PIXI; let s;
    const d=Math.random(); // depth 0 near .. 1 far
    if(kind==='leaf'){ s=new PIXI.Sprite(this.tex.leaf); s.anchor.set(.5); const gold=clim.gold; const col=mix(mix([120,160,70],[214,150,60],gold),[150,60,40],Math.random()*0.5*gold); s.tint=rgb2int(mix(col,clim.fog,d*0.5)); s.scale.set((0.35+Math.random()*0.5)*(1-d*0.6)); s.vx=-10+Math.random()*30; s.vy=25+Math.random()*35; s.spin=(Math.random()-0.5)*3; s.ph=Math.random()*6; s.alpha=0.9; }
    else if(kind==='petal'){ s=new PIXI.Sprite(this.tex.petal); s.anchor.set(.5); s.tint=rgb2int(mix([250,205,215],clim.fog,d*0.4)); s.scale.set((0.35+Math.random()*0.4)*(1-d*0.5)); s.vx=10+Math.random()*30; s.vy=18+Math.random()*25; s.spin=(Math.random()-0.5)*2; s.ph=Math.random()*6; s.alpha=0.85; }
    else if(kind==='snow'){ s=new PIXI.Sprite(this.tex.disc); s.anchor.set(.5); s.tint=0xffffff; const sz=(3+Math.random()*5)*(1-d*0.6); s.width=s.height=sz; s.vx=-6+Math.random()*12; s.vy=18+Math.random()*30*(1-d*0.5); s.ph=Math.random()*6; s.alpha=0.55+Math.random()*0.4; s.spin=0; }
    else if(kind==='rain'){ s=new PIXI.Sprite(this.tex.streak); s.anchor.set(.5); s.tint=rgb2int(lift(clim.fog,0.5)); s.scale.set(0.5,0.7+Math.random()*0.8); s.rotation=0.12; s.vx=-40; s.vy=520+Math.random()*200; s.alpha=0.28+Math.random()*0.2; s.ph=0; s.spin=0; }
    else if(kind==='fire'){ s=new PIXI.Sprite(this.tex.disc); s.anchor.set(.5); s.tint=0xd8ff8a; s.blendMode=PIXI.BLEND_MODES.ADD; s.width=s.height=6+Math.random()*8; s.vx=(Math.random()-0.5)*20; s.vy=(Math.random()-0.5)*14; s.ph=Math.random()*6; s.alpha=0; s.spin=0; s.blink=0.6+Math.random()*1.4; }
    else { s=new PIXI.Sprite(this.tex.disc); s.anchor.set(.5); s.tint=rgb2int(lift(clim.hi,0.5)); s.blendMode=PIXI.BLEND_MODES.SCREEN; s.width=s.height=2+Math.random()*4; s.vx=(Math.random()-0.5)*8; s.vy=(Math.random()-0.5)*6; s.ph=Math.random()*6; s.alpha=0.25+Math.random()*0.3; s.spin=0; }
    s.d=d; s.p=0.25+ (1-d)*0.9;  // parallax factor
    s.x=Math.random()*(W+300)-150; s.y=(kind==='fire'||kind==='mote')?Math.random()*H:(-40-Math.random()*200);
    s.kind=kind; this.c.addChild(s); this.pools[kind].push(s); return s;
  }
  update(dt, clim, camDx, wind){
    this.t+=dt; const t=this.t;
    const q=this.density||1;
    const want={ leaf: Math.round(60*clim.leaf*(0.25+clim.gold*1.2)*(clim.twig<0.5?1:0.3)), petal: Math.round(70*clim.blossom), snow: Math.round(160*clim.snow), rain: Math.round(140*clim.rain), fire: Math.round(60*clim.fire), mote: Math.round(28*clim.light) }; for(const k in want) want[k]=Math.round(want[k]*q);
    for(const kind in want){
      const pool=this.pools[kind];
      if(pool.length<want[kind] && Math.random()<0.5) this.spawn(kind,clim);
      for(let i=pool.length-1;i>=0;i--){ const s=pool[i];
        const sway=Math.sin(t*1.1+s.ph)*(kind==='snow'?14:kind==='rain'?0:22);
        s.x+= (s.vx+sway+wind*20*(kind==='rain'?2:1))*dt - camDx*s.p; s.y+=s.vy*dt; s.rotation+=s.spin*dt;
        if(kind==='fire'){ s.alpha=Math.max(0,Math.sin(t*s.blink+s.ph))*0.9; s.x+=Math.sin(t*0.7+s.ph)*30*dt; s.y+=Math.cos(t*0.5+s.ph)*20*dt; if(s.y<80) s.y=H-20; if(s.y>H) s.y=100; }
        if(kind==='mote'){ if(s.y<-10) s.y=H; if(s.y>H+10) s.y=0; }
        let dead=s.y>H+40 || s.x<-200 || s.x>W+200;
        if(pool.length>want[kind]+4 && Math.random()<0.02) dead=true;
        if(dead){ if(pool.length>want[kind]){ s.destroy(); pool.splice(i,1); } else { s.y=(kind==='fire'||kind==='mote')?Math.random()*H:-40-Math.random()*120; s.x=Math.random()*(W+300)-150; } }
      }
    }
  }
}

export function makeRays(PIXI, tex){
  const c=new PIXI.Container(); const rays=[];
  for(let i=0;i<7;i++){ const s=new PIXI.Sprite(tex.ray); s.anchor.set(0.5,0); s.blendMode=PIXI.BLEND_MODES.ADD; s.x=i*230+80; s.y=-40; s.scale.set(1.6+Math.random()*1.4, 1.5); s.rotation=0.32+Math.random()*0.1; s.ph=Math.random()*6; c.addChild(s); rays.push(s); }
  c.update=(t,clim,camX)=>{ const k=clim.light*(1-clim.night*0.9)*(1-clim.rain*0.7)*(1-clim.mist*0.4); c.tint=rgb2int(lift(clim.hi,0.5)); for(const s of rays){ s.alpha=(0.05+0.045*Math.sin(t*0.35+s.ph))*k*1.4; s.x=((s.ph*300 - camX*0.18)%(W+400)+W+400)%(W+400)-200; s.rotation=0.33+Math.sin(t*0.2+s.ph)*0.02; } };
  return c;
}
