// Banana (the traveller) and the little white cat that follows.
import { groundAt, slopeAt } from './world.js';
import { lerp, clamp } from './rng.js';
import { rgb2int } from './season.js';

export class Banana {
  constructor(PIXI, frames, tex){
    this.PIXI=PIXI; this.c=new PIXI.Container();
    this.shadow=new PIXI.Sprite(tex.disc); this.shadow.anchor.set(.5); this.shadow.tint=0x000000; this.shadow.alpha=0.28; this.shadow.width=44; this.shadow.height=10; this.c.addChild(this.shadow);
    this.body=new PIXI.Container(); this.c.addChild(this.body);
    this.spr=new PIXI.AnimatedSprite(frames); this.spr.anchor.set(0.5,0.97); this.spr.animationSpeed=0; this.body.addChild(this.spr);
    const h=frames[0].height; this.scale=54/h; this.spr.scale.set(this.scale);
    this.x=300; this.y=groundAt(300).y; this.vy=0; this.onGround=true; this.facing=1; this.speed=0; this.sitting=false; this.sitT=0; this.walkT=0; this.idleT=0; this.jumpT=0;
  }
  update(dt, input){
    let ax=0; if(!this.sitting){ if(input.left) ax-=1; if(input.right) ax+=1; }
    const target=ax*(input.run?250:150);
    this.speed=lerp(this.speed,target,1-Math.exp(-dt*9));
    if(Math.abs(ax)>0) this.facing=ax>0?1:-1;
    this.x+=this.speed*dt; if(this.x<120){ this.x=120; this.speed=0; }
    const g=groundAt(this.x).y;
    if(input.jump && this.onGround && !this.sitting){ this.vy=-330; this.onGround=false; this.jumpT=0; }
    if(!this.onGround){ this.vy+=1100*dt; this.y+=this.vy*dt; this.jumpT+=dt; if(this.y>=g && this.vy>0){ this.y=g; this.vy=0; this.onGround=true; } }
    else { // follow the ground: step up smoothly, fall if the ground drops away
      if(g>this.y+22){ this.onGround=false; this.vy=0; }                       // ground fell away: drop
      else if(g<this.y-16 && Math.abs(this.speed)>20){ this.vy=-190; this.onGround=false; } // a step up: small hop
      else this.y=lerp(this.y,g,1-Math.exp(-dt*18));
    }
    // animation
    const moving=Math.abs(this.speed)>8;
    if(moving){ this.walkT+=dt*Math.abs(this.speed)/38; this.spr.gotoAndStop(Math.floor(this.walkT)%4); this.idleT=0; }
    else { this.idleT+=dt; this.spr.gotoAndStop(1); }
    if(this.sitting){ this.sitT+=dt; this.spr.gotoAndStop(3); this.body.rotation=lerp(this.body.rotation,-0.28*this.facing,dt*6); this.body.y=lerp(this.body.y,6,dt*6); this.body.scale.y=lerp(this.body.scale.y,0.86,dt*6); }
    else { this.sitT=0; const slope=this.onGround?slopeAt(this.x)*0.35:0; this.body.rotation=lerp(this.body.rotation, slope + (this.onGround?0:-0.08*this.facing), dt*8); this.body.y=lerp(this.body.y, moving?Math.abs(Math.sin(this.walkT*Math.PI))*-2:Math.sin(this.idleT*1.4)*1.2, dt*10); this.body.scale.y=lerp(this.body.scale.y,1,dt*8); }
    this.body.scale.x=this.facing;
    this.c.x=this.x; this.c.y=this.y; this.shadow.alpha=this.onGround?0.28:0.12; this.shadow.width=this.onGround?44:30;
  }
}

export class Cat {
  constructor(PIXI, frames, tex){
    this.PIXI=PIXI; this.c=new PIXI.Container();
    this.glow=new PIXI.Sprite(tex.disc); this.glow.anchor.set(.5); this.glow.blendMode=PIXI.BLEND_MODES.ADD; this.glow.tint=0xfff4d6; this.glow.alpha=0.28; this.glow.width=90; this.glow.height=60; this.glow.y=-14; this.c.addChild(this.glow);
    this.shadow=new PIXI.Sprite(tex.disc); this.shadow.anchor.set(.5); this.shadow.tint=0x000000; this.shadow.alpha=0.22; this.shadow.width=30; this.shadow.height=7; this.c.addChild(this.shadow);
    this.spr=new PIXI.AnimatedSprite(frames); this.spr.anchor.set(0.5,0.96); this.c.addChild(this.spr);
    const h=frames[0].height; this.scale=30/h; this.spr.scale.set(this.scale);
    this.x=220; this.y=groundAt(220).y; this.facing=1; this.walkT=0; this.state='walk'; this.restT=0; this.zz=0; this.frames=frames.length;
  }
  update(dt, banana, t){
    const gap=banana.facing>0?-64:64; const target=banana.x+gap*(banana.sitting?0.6:1);
    const dist=target-this.x;
    const far=Math.abs(dist)>14;
    if(far && !(banana.sitting&&Math.abs(dist)<40)){ const sp=clamp(Math.abs(dist)*3,60,260); this.x+=Math.sign(dist)*sp*dt; this.facing=Math.sign(dist)||this.facing; this.walkT+=dt*sp/40; this.spr.gotoAndStop(Math.floor(this.walkT)%4); this.state='walk'; this.restT=0; }
    else { this.restT+=dt; if(this.restT>0.9){ this.spr.gotoAndStop(this.frames-1); this.state=banana.sitting&&banana.sitT>5?'sleep':'sit'; this.facing=banana.facing; } else this.spr.gotoAndStop(1); }
    const g=groundAt(this.x).y; this.y=lerp(this.y,g,1-Math.exp(-dt*14));
    this.spr.scale.x=this.scale*this.facing; this.spr.y=this.state==='walk'?Math.abs(Math.sin(this.walkT*Math.PI))*-1.5:0;
    this.c.x=this.x; this.c.y=this.y; this.glow.alpha=0.22+0.06*Math.sin(t*2);
  }
}
