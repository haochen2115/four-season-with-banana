// The walkable path: a sequence of overlapping tree limbs. Everything is a pure
// function of world x so the world is endless and deterministic.
import { hash, makeRng, lerp, clamp, smooth, fbm1 } from './rng.js';

export const SEG = 900;            // nominal limb length
export const TERM_LEN = 4200;      // world px per solar term (~30s at walking speed)
export const YEAR_LEN = TERM_LEN*24;
export const BASE_Y = 470;         // nominal walking height (screen px of 720)

// Limb i spans [start, end]. Consecutive limbs overlap so you can always step across.
export function limb(i){
  const r = makeRng(hash(i, 11.7));
  const len = SEG*(0.75+r()*0.7);
  const start = i*SEG - 140 - r()*120;              // overlap previous limb
  const yA = BASE_Y + (r()-0.5)*120;                 // heights vary gently
  const yB = BASE_Y + (r()-0.5)*120;
  const bulge = 40 + r()*70;                         // how much the middle arches up
  const thick = 110 + r()*150;                       // max thickness
  const wob = r()*10;
  const dir = r()<.5?-1:1;
  return { i, start, end:start+len, len, yA, yB, bulge, thick, wob, dir, r: r() };
}
// Top surface of limb i at world x (undefined outside its span).
export function limbTop(L, x){
  const t = (x-L.start)/L.len; if(t<0||t>1) return undefined;
  const arch = Math.sin(t*Math.PI);                       // limbs arch upward in the middle
  const wave = (fbm1(x*0.004, L.i*3.3, 2)-0.5)*26;        // organic sway along the length
  return lerp(L.yA, L.yB, smooth(t)) - arch*L.bulge + wave;
}
export function limbThickness(L, x){
  const t = clamp((x-L.start)/L.len,0,1);
  const taper = Math.pow(Math.sin(t*Math.PI), 0.55);
  return 18 + L.thick*taper*(0.85+0.3*fbm1(x*0.006+L.wob, L.i, 2));
}
export function limbsNear(x){ const i=Math.floor(x/SEG); const out=[]; for(let k=i-2;k<=i+1;k++){ if(k<-1) continue; out.push(limb(k)); } return out; }
// Walkable ground = the highest limb surface under x (smallest y).
export function groundAt(x){
  let best=Infinity, which=null;
  for(const L of limbsNear(x)){ const y=limbTop(L,x); if(y!==undefined && y<best){ best=y; which=L; } }
  return { y: best===Infinity? BASE_Y : best, limb: which };
}
export function slopeAt(x){ const a=groundAt(x-6).y, b=groundAt(x+6).y; return Math.atan2(b-a,12); }
