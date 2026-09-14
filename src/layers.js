// Parallax layers built from deterministic chunks. Every stamp remembers its
// "base" colour (from the climate at the place it stands) and is fogged per
// frame toward the current horizon colour, so near→far reads as one space.
import { hash, makeRng, lerp, clamp, fbm1 } from './rng.js';
import { climateAt, mix, shade, lift, rgb2int } from './season.js';
import { limb, limbTop, limbThickness, SEG, TERM_LEN, BASE_Y } from './world.js';
import { pick } from './assets.js';

export const CW = 1024;   // chunk width in layer space
const W = 1280, H = 720;

export class Layer {
  constructor(PIXI, spec, stamps, tex){
    this.PIXI=PIXI; this.spec=spec; this.stamps=stamps; this.tex=tex;
    this.c=new PIXI.Container(); this.c.sortableChildren=false;
    this.chunks=new Map(); this.anims=[];
  }
  // climate for a chunk: the camera position that puts this layer-x on screen
  // Near layers map layer-x back to world-x. Far layers cover a huge world span per chunk,
  // so they take the climate of where the traveller stands when the chunk first appears
  // (the distance lags behind the season instead of previewing the next one).
  climateForLayerX(lx){ return this.spec.p<0.5 ? climateAt(this.camX/TERM_LEN) : climateAt((lx/this.spec.p)/TERM_LEN); }
  update(camX, camY, clim, t, dt){
    const p=this.spec.p, py=this.spec.py??p; this.camX=camX;
    const lx=camX*p; this.c.x=-lx; this.c.y=-camY*py + (this.spec.yOff||0);
    const i0=Math.floor((lx-CW*(this.spec.margin||1))/CW), i1=Math.floor((lx+W+CW*(this.spec.margin||1))/CW);
    for(const [i,ch] of this.chunks){ if(i<i0-1||i>i1+1){ ch.c.destroy({children:true}); this.chunks.delete(i); this.anims=this.anims.filter(a=>a.chunk!==i); } }
    for(let i=i0;i<=i1;i++){ if(!this.chunks.has(i)) this.build(i); }
    // fog everything toward the current horizon colour
    const fogK=this.spec.fog*(0.55+0.45*clim.mist), nightK=1-0.55*clim.night*(1-this.spec.d*0.4);
    const fog=clim.fog;
    for(const ch of this.chunks.values()){
      for(const s of ch.tinted){
        const b=s.base; const k=fogK*s.fogMul;
        s.tint=rgb2int([ (b[0]+(fog[0]-b[0])*k)*nightK, (b[1]+(fog[1]-b[1])*k)*nightK, (b[2]+(fog[2]-b[2])*k)*nightK ]);
      }
    }
    for(const a of this.anims) a.fn(t,dt);
  }
  build(i){
    const PIXI=this.PIXI, c=new PIXI.Container(); this.c.addChild(c); // content is authored in layer space
    const glow=new PIXI.Container(); c.addChild(glow);
    const ch={c, glow, tinted:[], i}; this.chunks.set(i,ch);
    const clim=this.climateForLayerX(i*CW+CW/2);
    const rng=makeRng(hash(i, this.spec.seed));
    const ctx={PIXI, c, ch, clim, rng, i, layer:this, x0:i*CW};
    this.spec.build(ctx);
  }
  // helpers used by builders -------------------------------------------
  stamp(ctx, name, x, y, scale, base, opts={}){
    const t=pick(this.stamps, name, this.spec.blur, opts.frame ?? Math.floor(ctx.rng()*99));
    if(!t) return null;
    const s=new this.PIXI.Sprite(t); const k=scale/(t.stampScale||1); s.anchor.set(opts.ax??0.5, opts.ay??0.5); s.x=x; s.y=y; s.scale.set(k*(opts.flip?-1:1), k);
    s.rotation=opts.rot||0; s.base=base; s.fogMul=opts.fogMul??1; s.alpha=opts.alpha??1;
    ctx.c.addChild(s); ctx.ch.tinted.push(s); return s;
  }
  poly(ctx, pts, base, opts={}){
    const g=new this.PIXI.Graphics(); g.beginFill(0xffffff, opts.alpha??1); g.drawPolygon(pts); g.endFill();
    g.base=base; g.fogMul=opts.fogMul??1; ctx.c.addChild(g); ctx.ch.tinted.push(g); return g;
  }
  line(ctx, pts, width, base, opts={}){
    const g=new this.PIXI.Graphics(); g.lineStyle({width, color:0xffffff, alpha:opts.alpha??1, cap:'round', join:'round'});
    g.moveTo(pts[0],pts[1]); for(let k=2;k<pts.length;k+=2) g.lineTo(pts[k],pts[k+1]);
    g.base=base; g.fogMul=opts.fogMul??1; ctx.c.addChild(g); ctx.ch.tinted.push(g); return g;
  }
  glow(ctx, x, y, r, color, alpha){ const s=new this.PIXI.Sprite(this.tex.disc); s.anchor.set(.5); s.x=x; s.y=y; s.width=s.height=r*2; s.tint=rgb2int(color); s.alpha=alpha; s.blendMode=this.PIXI.BLEND_MODES.ADD; ctx.ch.glow.addChild(s); ctx.c.setChildIndex(ctx.ch.glow, ctx.c.children.length-1); return s; }
}

// ---- vegetation colour helpers --------------------------------------------
export function vegColor(clim, d, rng, sunlit){
  // depth d: 0 near .. 1 far. Near foliage is dark, far foliage is lighter.
  const base=mix(clim.near, clim.mid, clamp(d*1.15,0,1));
  const hiK = clamp((sunlit*0.6 + rng()*0.35) * (0.25+0.75*clim.light), 0, 1);
  let col=mix(base, clim.hi, hiK); col=shade(col, 0.82+0.3*clim.light);   // sunny terms glow, dull terms sink
  // autumn gold & winter pallor blend in through the climate table
  if(clim.gold>0){ // autumn: each clump turns its own way — gold, amber, crimson, or stays olive
    const r=rng(); const target = r<0.35?[226,170,58] : r<0.6?[214,120,44] : r<0.78?[176,62,40] : [150,150,60];
    col=mix(col, target, clim.gold*(0.35+0.65*rng()));
  }
  return col;
}
function seasonStampName(clim, rng){
  // choose which stamp family to use for a canopy clump at this climate
  const r=rng();
  if(clim.blossom>0 && r<clim.blossom*0.8) return 'blossom';
  if(clim.twig>0 && r<clim.twig*0.95+0.02) return 'twigs';
  return 'foliage';
}
function clumpColor(clim, name, d, rng, sunlit){
  if(name==='blossom'){ return mix([255,235,238], clim.fog, d*0.45); }
  if(name==='twigs'){ const dark=mix(clim.near,[90,80,70],0.5); return mix(dark, clim.fog, d*0.5+ clim.snow*0.25); }
  return vegColor(clim,d,rng,sunlit);
}

// ---- builders ----------------------------------------------------------------
// A tree = sinuous trunk polygon + a few limbs + many small canopy clumps.
export function tree(L, ctx, x, yBase, height, d, opts={}){
  const {rng, clim}=ctx; const w0=opts.width||(18+rng()*22)*(1+height/900);
  const lean=(rng()-0.5)*0.5; const bend=(rng()-0.5)*0.9; const ph=rng()*6;
  const trunkCol=mix(shade(mix(clim.near, clim.mid, d*0.8),0.42), clim.fog, 0.06+d*0.22);
  const N=14; const pts=[];
  let cx=t=>x+lean*height*t*t+Math.sin(t*3.1+ph)*w0*bend*(1-d*0.5);
  if(L.stamps.trunks && !opts.noSprite){
    // painted trunk: the stamp's own silhouette replaces the polygon (tinted like everything else)
    const frame=Math.floor(rng()*L.stamps.trunks.count); const tex=pick(L.stamps,'trunks',L.spec.blur,frame);
    const sc=height/(tex.height/(tex.stampScale||1)); const flip=rng()<.5;
    const sp=L.stamp(ctx,'trunks',x,yBase+6,sc,trunkCol,{ax:0.5,ay:1.0,frame,flip}); if(sp) sp.scale.x*=clamp(w0/30,0.85,1.35)*(opts.widthMul||1);
    cx=t=>x+(flip?-1:1)*Math.sin(t*2.2)*w0*0.3;
    opts=Object.assign({branchT:[0.78,0.96]},opts);
  } else {
    for(let k=0;k<=N;k++){ const t=k/N; const y=yBase-height*t; const w=w0*(1-0.62*t)*(1+0.22*fbm1(t*6+ph,ph,2)); pts.push([cx(t)-w,y,cx(t)+w,y]); }
    const poly=[]; for(const q of pts) poly.push(q[0],q[1]); for(let k=pts.length-1;k>=0;k--) poly.push(pts[k][2],pts[k][3]);
    L.poly(ctx, poly, trunkCol);
    // buttress roots
    for(const side of [-1,1]){ const rw=w0*(1.2+rng()*1.2); L.poly(ctx,[x+side*rw*1.9, yBase+8, x+side*w0*0.9, yBase-w0*(0.9+rng()*0.9), x+side*w0*0.2, yBase+8], trunkCol); }
  }
  const name=opts.stamp||seasonStampName(clim,rng);
  const canopyR=opts.canopy||(70+rng()*60)*(1+height/1400);
  const clumpScale=(opts.scaleMul||1)*(canopyR/520);   // stamps are ~520px wide
  // leafy clumps thin out as the year turns (twig clumps stay so winter trees read as bare)
  const keep = name==='twigs' ? 1 : (0.25+0.75*clim.leaf);
  const clump=(px,py,sunlit,mul=1)=>{ if(rng()>keep) return; const sc=clumpScale*(0.55+rng()*0.6)*mul; L.stamp(ctx, name, px, py, sc, clumpColor(clim,name,d,rng,sunlit), {flip:rng()<.5, rot:(rng()-0.5)*0.5}); };
  // limbs from the upper trunk, each carrying a cloud of clumps
  const nb=opts.branches??(2+Math.floor(rng()*3));
  for(let b=0;b<nb;b++){
    const [t0,t1]=opts.branchT||[0.5,0.92]; const t=t0+rng()*(t1-t0); const by=yBase-height*t; const bx=cx(t); const dir=rng()<.5?-1:1; const len=canopyR*(0.9+rng()*1.1);
    const ex=bx+dir*len, ey=by-len*(0.25+rng()*0.55);
    const g=new ctx.PIXI.Graphics(); g.lineStyle({width:w0*0.5*(1-t)+3, color:0xffffff, cap:'round'}); g.moveTo(bx,by); g.quadraticCurveTo(bx+dir*len*0.45, by-len*0.02, ex, ey); g.base=trunkCol; g.fogMul=1; ctx.c.addChild(g); ctx.ch.tinted.push(g);
    const n=4+Math.floor(rng()*4);
    for(let k=0;k<n;k++){ const u=0.35+rng()*0.75; clump(bx+dir*len*u+(rng()-0.5)*canopyR*0.5, by-len*(0.25+rng()*0.55)*u+(rng()-0.6)*canopyR*0.35, 1-t*0.4); }
  }
  // crown: a loose cloud of clumps around the top
  const top=yBase-height, topX=cx(1); const n=6+Math.floor(rng()*6);
  for(let k=0;k<n;k++){ const a=rng()*6.28, r=rng()*canopyR; clump(topX+Math.cos(a)*r*1.4, top+Math.sin(a)*r*0.7, 0.7+0.3*(1-r/canopyR)); }
}
// A continuous far treeline: canopy masses sitting on the horizon.
export function treeline(L, ctx, d, yLine, n=14, scaleMul=1){
  const {rng, clim}=ctx; const name=seasonStampName(clim,rng);
  for(let k=0;k<n;k++){ const x=ctx.x0+(k+rng())*(CW/n); const y=yLine+(rng()-0.5)*90; const sc=(0.3+rng()*0.4)*scaleMul; L.stamp(ctx,name,x,y,sc,clumpColor(clim,name,d,rng,0.6+rng()*0.4),{flip:rng()<.5,rot:(rng()-0.5)*0.3, ay:0.75}); }
}
// Overhanging canopy along the top edge of the frame (no trunk visible).
export function canopy(L, ctx, n, d, yTop=-40, scaleMul=1){
  const {rng, clim}=ctx; const name=seasonStampName(clim,rng);
  for(let k=0;k<n;k++){ const x=ctx.x0+rng()*CW; const y=yTop+rng()*160; const sc=(0.22+rng()*0.25)*scaleMul; L.stamp(ctx,name,x,y,sc,clumpColor(clim,name,d,rng,0.35),{flip:rng()<.5,rot:(rng()-0.5)*0.6}); }
}

// Hanging vines from above the frame.
export function vines(L, ctx, n, d, yTop=-120){
  const {rng, clim}=ctx;
  for(let k=0;k<n;k++){
    const x=ctx.x0+rng()*CW, sc=0.35+rng()*0.5; const col=mix(vegColor(clim,d,rng,0.4), clim.fog, d*0.2);
    const s=L.stamp(ctx,'vines',x,yTop+rng()*80,sc,col,{ax:0.5, ay:0.02, flip:rng()<.5});
    if(s){ const ph=rng()*6.28, amp=0.015+rng()*0.02; L.anims.push({chunk:ctx.i, fn:(t)=>{ s.rotation=Math.sin(t*0.6+ph)*amp; }}); }
  }
}

// Hanging moss curtains from an invisible branch above the frame.
export function moss(L, ctx, n, d, yTop=-60){
  const {rng, clim}=ctx; if(!L.stamps.moss) return;
  for(let k=0;k<n;k++){ const x=ctx.x0+rng()*CW, sc=0.4+rng()*0.5; const col=mix(shade(vegColor(clim,d,rng,0.2),0.9), clim.fog, d*0.25+0.1);
    const s=L.stamp(ctx,'moss',x,yTop+rng()*60,sc,col,{ax:0.5, ay:0.02, flip:rng()<.5, alpha:0.9});
    if(s){ const ph=rng()*6.28; L.anims.push({chunk:ctx.i, fn:(t)=>{ s.skew.x=Math.sin(t*0.5+ph)*0.03; }}); } }
}
// Foreground plants sitting on a ground line.
export function plants(L, ctx, n, yBase, d, scaleRange=[0.25,0.5], colMul=0.5){
  const {rng, clim}=ctx;
  for(let k=0;k<n;k++){ const x=ctx.x0+rng()*CW; const sc=lerp(scaleRange[0],scaleRange[1],rng()); const col=shade(vegColor(clim,d,rng,0.3),colMul); L.stamp(ctx,'ferns',x,yBase+ (rng()-0.5)*20,sc,col,{ax:0.5, ay:0.92, flip:rng()<.5}); }
}

// The big organic limbs. walkable=true builds limbs from world.js; otherwise decorative ones.
export function limbs(L, ctx, d, walkable, yShift=0, colorMul=1){
  const {rng, clim}=ctx; const x0=ctx.x0;
  const list=[];
  if(walkable){ for(let k=Math.floor((x0-1600)/SEG); k<=Math.floor((x0+CW+400)/SEG); k++){ const Lb=limb(k); if(Lb.start>=x0-CW*0.5-1 && Lb.start<x0+CW*0.5-1) list.push(Lb); else if(k<0&&x0<=0&&Lb.start<x0+CW&&Lb.start>=x0) list.push(Lb); } }
  else {
    // decorative limbs: one big sweeping limb per ~1.5 chunks, lower than the path
    if(hash(ctx.i,3.3+d)<0.62){ const r=rng(); list.push({ i:ctx.i*7+3, start:x0-200+r*300, end:x0+CW*(1.1+rng()*0.9), yA:BASE_Y+yShift+(rng()-0.5)*140, yB:BASE_Y+yShift+(rng()-0.5)*160, bulge:30+rng()*90, thick:140+rng()*160, wob:rng()*9, len:0, deco:true }); list[list.length-1].len=list[list.length-1].end-list[list.length-1].start; }
  }
  const limbCol=mix(shade(clim.limb,colorMul*0.75), clim.fog, d*0.55);
  const edgeCol=mix(clim.edge, clim.fog, d*0.5);
  for(const Lb of list){
    const top=[], bot=[]; const step=12;
    for(let x=Lb.start; x<=Lb.end+0.01; x+=step){ const xx=Math.min(x,Lb.end); const y=limbTop(Lb,xx); if(y===undefined) continue; const th=limbThickness(Lb,xx)*(1+0.18*(fbm1(xx*0.011+Lb.wob,Lb.i*1.7,2)-0.5)); top.push(xx,y); bot.push(xx,y+th); }
    if(top.length<8) continue;
    const poly=[...top]; for(let k=bot.length-2;k>=0;k-=2) poly.push(bot[k],bot[k+1]);
    L.poly(ctx, poly, limbCol);
    // hanging roots / sub-branches going down out of frame
    const nsub=2+Math.floor(rng()*3);
    for(let s=0;s<nsub;s++){
      const t=0.15+rng()*0.7; const x=Lb.start+Lb.len*t; const y=limbTop(Lb,x)+limbThickness(Lb,x)*0.7; const dir=(rng()-0.5)*2;
      const w=22+rng()*46; const bend=dir*(40+rng()*120); const wob=rng()*6; const pts=[];
      for(let k=0;k<=10;k++){ const u=k/10; const cxp=x+bend*u*u+Math.sin(u*4+wob)*14*u; const cy=y-24+u*560; const ww=w*(1-0.75*u)*(1+0.25*Math.sin(u*7+wob)); pts.push([cxp-ww,cy,cxp+ww,cy]); }
      const poly=[]; for(const q of pts) poly.push(q[0],q[1]); for(let k=pts.length-1;k>=0;k--) poly.push(pts[k][2],pts[k][3]);
      L.poly(ctx, poly, limbCol);
    }
    // mossy lit edge along the top
    const edge=[]; for(let k=0;k<top.length;k+=2){ edge.push(top[k], top[k+1]+1.5); }
    const band=[]; for(let k=0;k<top.length;k+=2){ band.push(top[k], top[k+1]+7); }
    L.line(ctx, band, 12, mix(limbCol,edgeCol,0.22), {alpha:0.9});
    L.line(ctx, edge, 5, mix(edgeCol,limbCol,0.3), {alpha:0.9});
    L.line(ctx, edge, 2, edgeCol, {alpha:0.95});
    if(clim.snow>0.05){ const sn=[]; for(let k=0;k<top.length;k+=2) sn.push(top[k], top[k+1]-2); L.line(ctx, sn, 4+clim.snow*7, lift(clim.fog,0.6), {alpha:clim.snow*0.95, fogMul:0.2}); }
    // tufts, flowers and glowing bells on the walkable limb
    if(walkable){
      for(let x=Lb.start+30; x<Lb.end-30; x+=22+rng()*40){
        const y=limbTop(Lb,x); if(y===undefined) continue; const r=rng();
        if(r<0.55 && clim.leaf>0.15){ L.stamp(ctx,'ferns',x,y+4,(0.06+rng()*0.09)*(0.6+clim.leaf*0.6),shade(mix(edgeCol,clim.hi,rng()*0.4),0.8),{ax:0.5,ay:0.94,flip:rng()<.5, frame:Math.floor(rng()*6)}); }
        else if(r<0.72){ // glowing flowers on thin stems
          const n=2+Math.floor(rng()*4); const fl=clim.blossom>0.2?[255,214,224]:(clim.gold>0.5?[255,220,150]:[236,255,230]);
          const g=new ctx.PIXI.Graphics(); g.lineStyle({width:1.2,color:0xffffff,alpha:0.7}); g.base=mix(edgeCol,[20,40,30],0.3); g.fogMul=1; ctx.c.addChild(g); ctx.ch.tinted.push(g);
          const glows=[];
          for(let f=0;f<n;f++){ const fx=x+(rng()-0.5)*26, h=10+rng()*18; const tipx=fx+(rng()-0.5)*6; g.moveTo(fx,y+2); g.quadraticCurveTo(fx+3,y-h*0.5,tipx,y-h);
            glows.push({gl:L.glow(ctx, tipx, y-h, 5+rng()*5, fl, 0.5), ph:rng()*6}); }
          L.anims.push({chunk:ctx.i, fn:(t)=>{ for(const q of glows) q.gl.alpha=0.3+0.22*Math.sin(t*1.3+q.ph); }});
        }
      }
    }
  }
}

// Screen-space decorative waterfall inside a chunk (mid layer).
export function waterfall(L, ctx, x, yTop, yBot, width){
  const {rng, clim, PIXI}=ctx; const c=ctx.c;
  const col=lift(clim.fog,0.55);
  const strip=new PIXI.Sprite(L.tex.vgrad); strip.x=x-width/2; strip.y=yTop; strip.width=width; strip.height=yBot-yTop; strip.alpha=0.2; strip.tint=rgb2int(col); c.addChild(strip);
  const core=new PIXI.Sprite(L.tex.vgrad); core.x=x-width*0.22; core.y=yTop; core.width=width*0.44; core.height=yBot-yTop; core.alpha=0.3; core.tint=0xffffff; c.addChild(core);
  const streaks=[]; for(let k=0;k<7;k++){ const s=new PIXI.Sprite(L.tex.streak); s.anchor.set(.5); s.x=x+(rng()-0.5)*width*0.8; s.y=yTop+rng()*(yBot-yTop); s.scale.set(0.6+rng()*0.6, 1.5+rng()*2); s.alpha=0.35; s.tint=0xffffff; c.addChild(s); streaks.push({s,v:120+rng()*140}); }
  const mist=[]; for(let k=0;k<5;k++){ const m=L.glow(ctx, x+(rng()-0.5)*width*1.6, yBot-10+rng()*20, 30+rng()*50, lift(clim.fog,0.7), 0.22); mist.push({m,ph:rng()*6}); }
  L.anims.push({chunk:ctx.i, fn:(t,dt)=>{ for(const q of streaks){ q.s.y+=q.v*dt; if(q.s.y>yBot) q.s.y=yTop+rng()*30; } for(const q of mist){ q.m.alpha=0.14+0.1*Math.sin(t*0.9+q.ph); q.m.scale.x=q.m.scale.y=(1+0.1*Math.sin(t*0.7+q.ph))*q.m.scale.y/q.m.scale.y; } }});
}
