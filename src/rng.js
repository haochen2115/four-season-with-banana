// Deterministic hashing helpers so every chunk regenerates identically.
export function hash(...xs){ let h=2166136261>>>0; for(const x of xs){ let v=Math.floor(x*1000003)|0; h^=v; h=Math.imul(h,16777619); h^=h>>>13; } return (h>>>0)/4294967296; }
export function makeRng(seed){ let s=(seed*4294967296)|0 || 1; return ()=>{ s^=s<<13; s^=s>>>17; s^=s<<5; return ((s>>>0)%1000000)/1000000; }; }
export const lerp=(a,b,t)=>a+(b-a)*t;
export const clamp=(v,a,b)=>v<a?a:v>b?b:v;
export const smooth=t=>t*t*(3-2*t);
// 1D value noise with smooth interpolation, period-free.
export function noise1(x, seed=0){ const i=Math.floor(x), f=x-i; const a=hash(i,seed), b=hash(i+1,seed); return lerp(a,b,smooth(f)); }
export function fbm1(x, seed=0, oct=3){ let v=0,a=.5,f=1,n=0; for(let o=0;o<oct;o++){ v+=a*noise1(x*f,seed+o*7.1); n+=a; a*=.5; f*=2.1; } return v/n; }
