// Procedural ambience with WebAudio: wind, stream, birds, cicadas, footsteps, a soft pad.
export class Audio {
  constructor(){ this.ctx=null; this.muted=false; this.stepT=0; this.birdT=2; this.padT=0; }
  start(){ if(this.ctx) return; try{ this.ctx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ return; }
    const c=this.ctx; this.master=c.createGain(); this.master.gain.value=this.muted?0:0.6; this.master.connect(c.destination);
    const noiseBuf=c.createBuffer(1,c.sampleRate*3,c.sampleRate); const d=noiseBuf.getChannelData(0); let b0=0,b1=0,b2=0; for(let i=0;i<d.length;i++){ const w=Math.random()*2-1; b0=0.99765*b0+w*0.0990460; b1=0.96300*b1+w*0.2965164; b2=0.57000*b2+w*1.0526913; d[i]=(b0+b1+b2+w*0.1848)*0.11; }
    const mk=(freq,q,gain)=>{ const src=c.createBufferSource(); src.buffer=noiseBuf; src.loop=true; const f=c.createBiquadFilter(); f.type='bandpass'; f.frequency.value=freq; f.Q.value=q; const g=c.createGain(); g.gain.value=gain; src.connect(f); f.connect(g); g.connect(this.master); src.start(); return {src,f,g}; };
    this.wind=mk(380,0.5,0.25); this.stream=mk(1900,0.8,0.0); this.leaves=mk(5200,1.2,0.05);
    // gentle pad: two detuned triangles through a lowpass
    this.pad=c.createGain(); this.pad.gain.value=0.0; const lp=c.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=600; this.pad.connect(lp); lp.connect(this.master);
    this.voices=[0,1,2].map(i=>{ const o=c.createOscillator(); o.type='triangle'; const g=c.createGain(); g.gain.value=0.05; o.connect(g); g.connect(this.pad); o.start(); return {o,g}; });
    this.chord=0; this.setChord([220,277.18,329.63]);
  }
  setChord(f){ if(!this.ctx) return; const now=this.ctx.currentTime; this.voices.forEach((v,i)=>{ v.o.frequency.setTargetAtTime(f[i]*(i===2?0.5:1),now,1.5); }); }
  suspend(){ if(this.ctx&&this.ctx.state==='running') this.ctx.suspend(); }
  resume(){ if(this.ctx&&this.ctx.state==='suspended'&&!this.muted) this.ctx.resume(); }
  setMuted(m){ this.muted=m; if(this.master) this.master.gain.setTargetAtTime(m?0:0.6,this.ctx.currentTime,0.3); }
  chirp(){ const c=this.ctx,o=c.createOscillator(),g=c.createGain(); o.type='sine'; const t=c.currentTime; const f=1800+Math.random()*1600; o.frequency.setValueAtTime(f,t); o.frequency.exponentialRampToValueAtTime(f*1.6,t+0.08); o.frequency.exponentialRampToValueAtTime(f*0.9,t+0.18); g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.06,t+0.03); g.gain.exponentialRampToValueAtTime(0.0005,t+0.25); o.connect(g); g.connect(this.master); o.start(t); o.stop(t+0.3); }
  step(snow){ const c=this.ctx; const src=c.createBufferSource(); src.buffer=this.wind.src.buffer; const f=c.createBiquadFilter(); f.type=snow?'lowpass':'bandpass'; f.frequency.value=snow?900:2400; const g=c.createGain(); const t=c.currentTime; g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(snow?0.16:0.09,t+0.01); g.gain.exponentialRampToValueAtTime(0.0001,t+0.09); src.connect(f); f.connect(g); g.connect(this.master); src.start(t,Math.random()*2); src.stop(t+0.12); }
  update(dt,clim,banana,cat,waterK){ if(!this.ctx) return; const now=this.ctx.currentTime;
    this.wind.g.gain.setTargetAtTime(0.18+0.25*clim.snow+0.1*clim.rain,now,1); this.wind.f.frequency.setTargetAtTime(300+200*clim.snow,now,1);
    this.stream.g.gain.setTargetAtTime(0.16*waterK+0.22*clim.rain,now,1);
    this.leaves.g.gain.setTargetAtTime(0.03+0.06*clim.leaf*(1-clim.snow),now,1);
    if(Math.abs(banana.speed)>20 && banana.onGround){ this.stepT+=dt*Math.abs(banana.speed)/38; if(this.stepT>=1){ this.stepT-=1; this.step(clim.snow>0.5); } }
    this.birdT-=dt; if(this.birdT<0){ const bird=(clim.leaf>0.4?1:0.25)*(1-clim.night)*(1-clim.rain*0.7); this.birdT=2+Math.random()*9/(0.05+bird); if(Math.random()<bird) this.chirp(); }
    this.padT+=dt; if(this.padT>14){ this.padT=0; const chords=[[220,277.18,329.63],[196,246.94,293.66],[174.61,220,261.63],[164.81,207.65,246.94]]; this.chord=(this.chord+1)%chords.length; this.setChord(chords[this.chord]); }
    this.pad.gain.setTargetAtTime(banana.sitting?0.12:0.06,now,2);
  }
}
