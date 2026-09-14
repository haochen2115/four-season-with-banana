// Small encounters that make the same forest feel alive across years.
import { rgb2int, lift, mix, TERMS } from './season.js';
import { groundAt, TERM_LEN } from './world.js';
const W=1280,H=720;
export class Eggs {
  constructor(ui,state,tex,PIXI,L,entities){ this.ui=ui; this.state=state; this.tex=tex; this.PIXI=PIXI; this.L=L; this.ent=entities; this.live=[]; this.c=new PIXI.Container(); entities.addChildAt(this.c,0); this.sitT=0; this.stillT=0; }
  found(key,title,note){ if(this.state.eggs[key]) return false; this.state.eggs[key]={title,note,year:this.state.age}; this.ui.toast('✦ '+title+' · '+note); return true; }
  onTerm(term){ this.term=term; this.spawnT=3+Math.random()*10; }
  spawnBirds(camX,camY){ const P=this.PIXI; const g=new P.Container(); const n=6+Math.floor(Math.random()*6); const birds=[]; for(let i=0;i<n;i++){ const b=new P.Graphics(); b.beginFill(0x1c2a22,0.85); b.drawPolygon([-6,0,-2,-2,0,0,2,-2,6,0,2,1,0,0,-2,1]); b.endFill(); b.x=Math.random()*160; b.y=Math.random()*60; b.ph=Math.random()*6; b.scale.set(0.9+Math.random()*0.8); g.addChild(b); birds.push(b); }
    g.x=camX+W+100; g.y=camY+80+Math.random()*180; g.vx=-(70+Math.random()*50); g.birds=birds; g.kind='birds'; this.c.addChild(g); this.live.push(g); }
  spawnButterfly(camX,camY,banana){ const P=this.PIXI; const g=new P.Container(); const w=new P.Graphics(); w.beginFill(0xffe9a8,0.95); w.drawEllipse(-4,0,4,3); w.drawEllipse(4,0,4,3); w.endFill(); g.addChild(w); g.wing=w; g.x=banana.x+200; g.y=banana.y-60; g.ph=Math.random()*6; g.kind='butterfly'; g.life=25; this.c.addChild(g); this.live.push(g); }
  spawnStar(camX,camY){ const P=this.PIXI; const s=new P.Sprite(this.tex.streak); s.anchor.set(.5); s.rotation=-2.2; s.scale.set(1.2,3); s.blendMode=P.BLEND_MODES.ADD; s.tint=0xfff6d8; s.x=camX+300+Math.random()*700; s.y=camY+60+Math.random()*120; s.kind='star'; s.life=1.6; s.vx=380; s.vy=190; this.c.addChild(s); this.live.push(s); }
  spawnLantern(banana){ const P=this.PIXI; const x=banana.x+700; const y=groundAt(x).y; const g=new P.Container(); const pole=new P.Graphics(); pole.lineStyle({width:3,color:0x2a2620}); pole.moveTo(0,0); pole.lineTo(0,-70); pole.lineTo(26,-78); pole.beginFill(0x3a2f26); pole.drawRoundedRect(16,-76,20,26,6); pole.endFill(); g.addChild(pole);
    const gl=new P.Sprite(this.tex.disc); gl.anchor.set(.5); gl.blendMode=P.BLEND_MODES.ADD; gl.tint=0xffb866; gl.alpha=0.7; gl.width=gl.height=150; gl.x=26; gl.y=-63; g.addChild(gl); const core=new P.Sprite(this.tex.disc); core.anchor.set(.5); core.tint=0xffe0a0; core.width=core.height=22; core.x=26; core.y=-63; g.addChild(core);
    g.x=x; g.y=y; g.gl=gl; g.kind='lantern'; g.ph=Math.random()*6; this.c.addChild(g); this.live.push(g); }
  spawnDandelion(banana){ const P=this.PIXI; const g=new P.Container(); for(let i=0;i<24;i++){ const s=new P.Sprite(this.tex.disc); s.anchor.set(.5); s.width=s.height=4+Math.random()*4; s.alpha=0.7; s.x=banana.x+(Math.random()-0.5)*80; s.y=banana.y-10-Math.random()*40; s.vx=20+Math.random()*30; s.vy=-(6+Math.random()*12); s.ph=Math.random()*6; g.addChild(s); } g.kind='dandelion'; g.life=12; this.c.addChild(g); this.live.push(g); }
  update(dt,t,clim,banana,cat,camX,camY){
    const term=this.term??0;
    this.spawnT-=dt;
    if(this.spawnT<0){ this.spawnT=14+Math.random()*30; const r=Math.random();
      if(term>=13&&term<=16 && r<0.7) this.spawnBirds(camX,camY);
      else if(term>=3&&term<=9 && clim.rain<0.3 && r<0.6) this.spawnButterfly(camX,camY,banana);
      else if(clim.night>0.6 && r<0.9) this.spawnStar(camX,camY);
      else if(term>=19&&term<=22 && r<0.5) this.spawnLantern(banana);
      else if(term===8 && r<0.8) this.spawnDandelion(banana);
    }
    // quiet-time eggs
    if(banana.sitting){ this.sitT+=dt; if(this.sitT>7 && cat.state==='sleep') this.found('catnap','小猫睡着了','你把这一小会儿，借给了它'); } else this.sitT=0;
    if(Math.abs(banana.speed)<3 && !banana.sitting){ this.stillT+=dt; if(this.stillT>6 && clim.fire>0.5) this.found('firefly','萤火停在肩上','你没有追，光自己靠近了'); } else this.stillT=0;
    if(this.state.age>=1 && term===0 && !this.state.eggs.second) this.found('second','第二个春天','小猫认得这条路了，跑在了前面');
    if(term===23 && banana.sitting && banana.sitT>3) this.found('letter','写给明年的信','谢谢你陪我走完这一年');
    for(let i=this.live.length-1;i>=0;i--){ const o=this.live[i]; let dead=false;
      if(o.kind==='birds'){ o.x+=o.vx*dt; for(const b of o.birds){ b.scale.y=Math.sin(t*9+b.ph)*0.9; b.y+=Math.sin(t*1.5+b.ph)*8*dt; } if(o.x<camX-400) dead=true; if(!this.state.eggs.birds && o.x<camX+W*0.6) this.found('birds','归鸟','一群鸟从头顶飞过，往南边去了'); }
      else if(o.kind==='butterfly'){ o.life-=dt; o.wing.scale.y=Math.abs(Math.sin(t*14+o.ph)); const tx=banana.x+(Math.sin(t*0.6+o.ph)*60)-20, ty=banana.y-50+Math.sin(t*1.1+o.ph)*25; o.x+= (tx-o.x)*dt*1.2+Math.sin(t*3+o.ph)*40*dt; o.y+=(ty-o.y)*dt*1.2; if(o.life<0) dead=true; if(Math.abs(o.x-cat.x)<20 && Math.abs(o.y-cat.y+20)<20) this.found('butterfly','蝴蝶','它停在了小猫的耳朵上'); }
      else if(o.kind==='star'){ o.x+=o.vx*dt; o.y+=o.vy*dt; o.life-=dt; o.alpha=Math.min(1,o.life); if(o.life<0) dead=true; if(banana.sitting||Math.abs(banana.speed)<3) this.found('star','流星','许了一个很小的愿望'); }
      else if(o.kind==='lantern'){ o.gl.alpha=0.55+0.15*Math.sin(t*3+o.ph); if(o.x<camX-600) dead=true; if(Math.abs(banana.x-o.x)<60) this.found('lantern','一盏灯','有人在雪夜里，为路过的人留了一盏灯'); }
      else if(o.kind==='dandelion'){ o.life-=dt; for(const s of o.children){ s.x+=(s.vx+Math.sin(t+s.ph)*15)*dt; s.y+=s.vy*dt; s.alpha=Math.min(0.7,o.life*0.3); } if(o.life<0) dead=true; this.found('dandelion','蒲公英','一脚踩进去，种子飞了一路'); }
      if(dead){ o.destroy({children:true}); this.live.splice(i,1); }
    }
  }
}
