// Loads sprite sheets, slices them into stamps by alpha connected components,
// converts vegetation to luminance masks (so depth/season tints are pure multiplies)
// and bakes pre-blurred variants for far/near depth of field.
const PAD = 14;

function loadImage(src){ return new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=()=>rej(new Error('load '+src)); im.src=src; }); }

// Find bounding boxes of separate objects on a transparent sheet (coarse grid BFS).
function findBoxes(img, minArea=400){
  const cell=6, W=Math.ceil(img.width/cell), H=Math.ceil(img.height/cell);
  const c=document.createElement('canvas'); c.width=W; c.height=H; const g=c.getContext('2d');
  g.drawImage(img,0,0,W,H); const d=g.getImageData(0,0,W,H).data;
  const solid=new Uint8Array(W*H); for(let i=0;i<W*H;i++) solid[i]=d[i*4+3]>40?1:0;
  const seen=new Uint8Array(W*H), boxes=[];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){ const i=y*W+x; if(!solid[i]||seen[i]) continue;
    const st=[i]; seen[i]=1; let x0=x,x1=x,y0=y,y1=y,n=0;
    while(st.length){ const j=st.pop(); n++; const jx=j%W, jy=(j/W)|0; if(jx<x0)x0=jx; if(jx>x1)x1=jx; if(jy<y0)y0=jy; if(jy>y1)y1=jy;
      for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){ const nx=jx+dx, ny=jy+dy; if(nx<0||ny<0||nx>=W||ny>=H) continue; const k=ny*W+nx; if(solid[k]&&!seen[k]){ seen[k]=1; st.push(k);} } }
    if(n*cell*cell>minArea) boxes.push({x:x0*cell,y:y0*cell,w:(x1-x0+1)*cell,h:(y1-y0+1)*cell});
  }
  // merge overlapping boxes
  let merged=true; while(merged){ merged=false; for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++){ const A=boxes[a],B=boxes[b];
    if(A.x<B.x+B.w+8&&B.x<A.x+A.w+8&&A.y<B.y+B.h+8&&B.y<A.y+A.h+8){ const x=Math.min(A.x,B.x),y=Math.min(A.y,B.y); A.w=Math.max(A.x+A.w,B.x+B.w)-x; A.h=Math.max(A.y+A.h,B.y+B.h)-y; A.x=x; A.y=y; boxes.splice(b,1); merged=true; break; } } if(merged) continue; }
  boxes.sort((a,b)=> (Math.abs(a.y-b.y)>Math.max(a.h,b.h)*0.5) ? a.y-b.y : a.x-b.x);
  return boxes;
}

// Cut one object into its own padded canvas. mode: 'lum' -> luminance mask, 'color' -> keep colors.
function cut(img, box, mode, k=0.5){
  const c=document.createElement('canvas'); c.width=Math.round(box.w*k)+PAD*2; c.height=Math.round(box.h*k)+PAD*2; const g=c.getContext('2d');
  g.drawImage(img, box.x,box.y,box.w,box.h, PAD,PAD,Math.round(box.w*k),Math.round(box.h*k));
  if(mode==='lum'){
    const id=g.getImageData(0,0,c.width,c.height), d=id.data; let hi=1; const lums=[];
    for(let i=0;i<d.length;i+=4){ if(d[i+3]>60){ lums.push(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]); } }
    lums.sort((a,b)=>a-b); hi=lums[Math.floor(lums.length*0.96)]||255; const lo=lums[Math.floor(lums.length*0.05)]||0;
    for(let i=0;i<d.length;i+=4){ const l=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]; let v=(l-lo)/(hi-lo); v=Math.max(0,Math.min(1,v)); v=0.58+0.42*v; const o=Math.round(v*255); d[i]=d[i+1]=d[i+2]=o; }
    g.putImageData(id,0,0);
  }
  return c;
}
function blurred(canvas, px){ const k=0.5; const c=document.createElement('canvas'); c.width=Math.round(canvas.width*k); c.height=Math.round(canvas.height*k); const g=c.getContext('2d'); g.filter=`blur(${px*k}px)`; g.drawImage(canvas,0,0,c.width,c.height); return c; }

export async function loadStamps(PIXI, defs){
  // defs: {name:{src, mode, blurs:[0,2,5]}}
  const out={};
  await Promise.all(Object.entries(defs).map(async ([name,def])=>{
    let img; try{ img=await loadImage(def.src); }catch(e){ console.warn('missing',def.src); out[name]=null; return; }
    const boxes=findBoxes(img, def.minArea||400);
    const k=def.scale??0.5;
    const frames=boxes.map(b=>cut(img,b,def.mode||'lum',k));
    // pack every frame of every blur level into ONE atlas so a whole sheet costs one texture slot
    const items=[]; for(const bl of (def.blurs||[0])) for(const f of frames){ items.push({bl, cv: bl?blurred(f,bl):f}); }
    const AW=2048; let x=0,y=0,rowH=0; for(const it of items){ if(x+it.cv.width>AW){ x=0; y+=rowH; rowH=0; } it.x=x; it.y=y; x+=it.cv.width+2; rowH=Math.max(rowH,it.cv.height+2); }
    const AH=Math.min(4096, 1<<Math.ceil(Math.log2(y+rowH)));
    const atlas=document.createElement('canvas'); atlas.width=AW; atlas.height=AH; const ag=atlas.getContext('2d'); for(const it of items) ag.drawImage(it.cv,it.x,it.y);
    const base=PIXI.BaseTexture.from(atlas,{scaleMode:PIXI.SCALE_MODES.LINEAR, mipmap:PIXI.MIPMAP_MODES.ON});
    const levels={}; for(const it of items){ (levels[it.bl]=levels[it.bl]||[]).push(Object.assign(new PIXI.Texture(base,new PIXI.Rectangle(it.x,it.y,it.cv.width,it.cv.height)),{stampScale:(it.bl?0.5:1)*k})); }
    out[name]={ frames:levels, count:frames.length, pad:PAD, scale:k, atlas:base };
  }));
  return out;
}
export function pick(stamps,name,blur,i){ const s=stamps[name]; if(!s) return null; const lv=s.frames[blur]||s.frames[0]; return lv[((i%lv.length)+lv.length)%lv.length]; }

// Small procedural textures: soft glow disc, leaf, petal, snowflake, rain streak.
export function makeSoftDisc(PIXI, size=64, inner=0.0){ const c=document.createElement('canvas'); c.width=c.height=size; const g=c.getContext('2d'); const r=size/2; const gr=g.createRadialGradient(r,r,r*inner,r,r,r); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(0.5,'rgba(255,255,255,0.35)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(0,0,size,size); return PIXI.Texture.from(c); }
export function makeLeaf(PIXI){ const c=document.createElement('canvas'); c.width=32; c.height=16; const g=c.getContext('2d'); g.fillStyle='#fff'; g.beginPath(); g.moveTo(2,8); g.quadraticCurveTo(14,-4,30,8); g.quadraticCurveTo(14,20,2,8); g.fill(); g.strokeStyle='rgba(0,0,0,.25)'; g.lineWidth=1; g.beginPath(); g.moveTo(4,8); g.lineTo(28,8); g.stroke(); return PIXI.Texture.from(c); }
export function makePetal(PIXI){ const c=document.createElement('canvas'); c.width=16; c.height=16; const g=c.getContext('2d'); g.fillStyle='#fff'; g.beginPath(); g.ellipse(8,8,7,5,0.5,0,Math.PI*2); g.fill(); return PIXI.Texture.from(c); }
export function makeStreak(PIXI){ const c=document.createElement('canvas'); c.width=4; c.height=48; const g=c.getContext('2d'); const gr=g.createLinearGradient(0,0,0,48); gr.addColorStop(0,'rgba(255,255,255,0)'); gr.addColorStop(0.5,'rgba(255,255,255,1)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.fillRect(1,0,2,48); return PIXI.Texture.from(c); }
export function makeGradient(PIXI, w, h, stops, vertical=true){ const c=document.createElement('canvas'); c.width=w; c.height=h; const g=c.getContext('2d'); const gr=vertical?g.createLinearGradient(0,0,0,h):g.createLinearGradient(0,0,w,0); for(const [p,col] of stops) gr.addColorStop(p,col); g.fillStyle=gr; g.fillRect(0,0,w,h); return PIXI.Texture.from(c); }
export function makeRay(PIXI){ const c=document.createElement('canvas'); c.width=64; c.height=512; const g=c.getContext('2d'); const gr=g.createLinearGradient(0,0,0,512); gr.addColorStop(0,'rgba(255,255,255,0.9)'); gr.addColorStop(0.6,'rgba(255,255,255,0.35)'); gr.addColorStop(1,'rgba(255,255,255,0)'); g.fillStyle=gr; g.beginPath(); g.moveTo(26,0); g.lineTo(38,0); g.lineTo(64,512); g.lineTo(0,512); g.closePath(); g.fill(); const gx=g.createLinearGradient(0,0,64,0); gx.addColorStop(0,'rgba(0,0,0,1)'); gx.addColorStop(0.5,'rgba(0,0,0,0)'); gx.addColorStop(1,'rgba(0,0,0,1)'); g.globalCompositeOperation='destination-out'; g.fillStyle=gx; g.fillRect(0,0,64,512); return PIXI.Texture.from(c); }
