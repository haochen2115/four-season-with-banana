// Local development helpers (not shipped in the mini-tool build). They read window.__game.
(function(){
  function g(){ return window.__game; }
  window.__shot=async function(name){ var app=g().app; var rt=PIXI.RenderTexture.create({width:1280,height:720,resolution:1}); app.renderer.render(app.stage,{renderTexture:rt}); var b64=await app.renderer.extract.base64(rt,'image/png'); rt.destroy(true); await fetch('http://127.0.0.1:8322/shot?name='+name,{method:'POST',body:b64}); return 'sent '+name; };
  window.__sim=function(frames,keys){ keys=keys||{}; var app=g().app; var tt=performance.now(); for(var k in keys) dispatchEvent(new KeyboardEvent('keydown',{code:k})); var t0=performance.now(); for(var i=0;i<frames;i++){ tt+=16.67; app.ticker.update(tt); } var ms=(performance.now()-t0)/frames; for(var k2 in keys) dispatchEvent(new KeyboardEvent('keyup',{code:k2})); return {x:g().banana.x,y:g().banana.y,msPerFrame:ms}; };
})();
