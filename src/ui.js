// DOM overlay: chapter label, drifting diary lines, journal, hints.
import { TERMS, SEASON_NAMES } from './season.js';
export class UI {
  constructor(){
    this.root=document.getElementById('ui');
    this.root.innerHTML=`
      <div id="chapter"><span class="num"></span><span class="name"></span><span class="sep">|</span><span class="season"></span></div>
      <div id="age"></div>
      <div id="sub"></div>
      <div id="hint"></div>
      <div id="toast"></div>
      <div id="journal" class="hidden"><div class="paper"><span class="jclose" data-act="journal">✕</span><div class="jhead"></div><div class="jgrid"></div><div class="jeggs"></div><div class="jfoot"><span class="jnav" data-act="jprev">‹ 上一年</span><span class="jnav" data-act="jnext">下一年 ›</span><span class="keys">← → 翻年　·　J / Esc 合上</span><span class="tips">点 ✕ 或空白处合上</span></div></div></div>
      <div id="touch" class="hidden">
        <div class="tzone left" data-act="left"><i>‹</i></div><div class="tzone right" data-act="right"><i>›</i></div>
        <div class="tbtn jump" data-act="jump">跳</div><div class="tbtn sit" data-act="sit">坐</div>
        <div class="tbar"><div class="tbtn small" data-act="journal">手记</div><div class="tbtn small" data-act="auto">漫游</div><div class="tbtn small icon" data-act="mute">🔊</div></div>
      </div>
      <div id="title" class=""><div class="t1">Banana的岁时漫游</div><div class="t2">A YEAR-LONG WALK THROUGH THE FOREST</div><div class="t3"><span class="keys">A / D 慢慢走 · Shift 小跑 · 空格 跳 · E 坐下 · J 手记<br></span><span class="tips">按住画面左右两侧慢慢走 · 右下角可以跳、坐下<br></span><span>正在长出森林…</span></div></div>`;
    this.q=s=>this.root.querySelector(s);
    this.touch=('ontouchstart' in window)||(navigator.maxTouchPoints>0);
    this.root.classList.toggle('is-touch',this.touch);
    this.subT=0; this.subQueue=[]; this.subCur=null; this.hintT=0; this.lastTerm=-1;
  }
  setTerm(i, age){ const [name,chapter,season]=TERMS[i]; this.q('#chapter .num').textContent=String(i+1).padStart(2,'0')+' / 24'; this.q('#chapter .name').textContent=name+' · '+chapter; this.q('#chapter .season').textContent=SEASON_NAMES[season]; const el=this.q('#chapter'); if(this.lastTerm!==i){ el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); this.lastTerm=i; } this.q('#age').textContent=age>0?`${age} 岁 · 第 ${age+1} 年`:'第 1 年'; }
  say(text, dur=5.5){ this.subQueue.push({text,dur}); }
  toast(text){ const el=this.q('#toast'); el.textContent=text; el.classList.add('show'); clearTimeout(this._tt); this._tt=setTimeout(()=>el.classList.remove('show'),4200); }
  hint(text){ const el=this.q('#hint'); if(el.textContent!==text){ el.textContent=text; } el.classList.toggle('show',!!text); }
  update(dt){
    const el=this.q('#sub');
    if(this.subCur){ this.subT-=dt; if(this.subT<=0){ el.classList.remove('show'); this.subCur=null; this.subT=1.2; } }
    else if(this.subT>0){ this.subT-=dt; }
    else if(this.subQueue.length){ this.subCur=this.subQueue.shift(); el.textContent=this.subCur.text; el.classList.add('show'); this.subT=this.subCur.dur; }
  }
  hideTitle(){ this.q('#title').classList.add('hidden'); if(this.touch) this.q('#touch').classList.remove('hidden'); }
  // wire the on-screen controls; `actions` maps names to functions, hold-actions get {name,down}
  bindTouch(actions){
    const layer=this.q('#touch'); const held=new Map();
    const start=e=>{ const el=e.target.closest('[data-act]'); if(!el) return; e.preventDefault(); const a=el.dataset.act; el.classList.add('on');
      if(a==='left'||a==='right'){ held.set(e.pointerId,{el,a}); actions.hold(a,true); } else { held.set(e.pointerId,{el,a:null}); actions[a]&&actions[a](); } };
    const end=e=>{ const h=held.get(e.pointerId); if(!h) return; h.el.classList.remove('on'); if(h.a) actions.hold(h.a,false); held.delete(e.pointerId); };
    layer.addEventListener('pointerdown',start); layer.addEventListener('pointerup',end); layer.addEventListener('pointercancel',end); layer.addEventListener('pointerleave',end);
    const j=this.q('#journal'); j.addEventListener('pointerdown',e=>{ const el=e.target.closest('[data-act]'); if(el){ e.preventDefault(); actions[el.dataset.act]&&actions[el.dataset.act](); return; } if(!e.target.closest('.paper')){ e.preventDefault(); actions.journal(); } });
  }
  setAuto(on){ const b=this.q('[data-act=auto]'); if(b) b.classList.toggle('active',on); }
  setMute(on){ const b=this.q('[data-act=mute]'); if(b) b.textContent=on?'🔇':'🔊'; }
  setSit(on){ const b=this.q('[data-act=sit]'); if(b&&b.textContent!==(on?'起':'坐')) b.textContent=on?'起':'坐'; }
  showJournal(state, year){
    const j=this.q('#journal'); j.classList.remove('hidden');
    this.q('#touch').classList.add('hidden');   // walk zones sit above the journal in the DOM: take them away while it is open
    const y=year; const seen=state.years[y]?.seen||[]; const eggs=state.eggs||{};
    this.q('.jhead').innerHTML=`<b>岁时手记</b><span>第 ${y+1} 年${y===state.age?' · 正在经历':' · 已珍藏'}</span>`;
    this.q('.jgrid').innerHTML=TERMS.map((t,i)=>`<div class="cell ${seen.includes(i)?'on':''}"><i>${String(i+1).padStart(2,'0')}</i><b>${t[0]}</b><s>${t[1]}</s></div>`).join('');
    const eggList=Object.entries(eggs); this.q('.jeggs').innerHTML=`<div class="eh">路上遇见的小事 · ${eggList.length}</div>`+(eggList.length?eggList.map(([k,v])=>`<div class="egg">✦ ${v.title}<span>${v.note} · 第 ${v.year+1} 年</span></div>`).join(''):`<div class="egg dim">有些相遇，藏在慢慢走的日子里。</div>`);
  }
  hideJournal(){ this.q('#journal').classList.add('hidden'); if(this.touch&&this.q('#title').classList.contains('hidden')) this.q('#touch').classList.remove('hidden'); }
}
