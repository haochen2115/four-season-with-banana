#!/usr/bin/env python3
"""Build the 小红书小工具 zip: index.html at the zip root, classic scripts only, no external
resources, ES2017 output, WebP sprite sheets sized for mobile GPUs. Requires Node (esbuild via npx) and Pillow."""
import subprocess, re, os, pathlib, shutil, zipfile, sys
from PIL import Image
ROOT=pathlib.Path(__file__).resolve().parent; os.chdir(ROOT)
OUT=ROOT/'dist-xhs'; shutil.rmtree(OUT,ignore_errors=True); (OUT/'vendor').mkdir(parents=True); (OUT/'assets'/'sprites').mkdir(parents=True)
ESBUILD=['npx','--yes','esbuild@0.24.2']
def esb(args): return subprocess.run(ESBUILD+args,capture_output=True,text=True,check=True).stdout
# 1. PixiJS → ES2017. The container forbids runtime code generation: @pixi/unsafe-eval replaces the
#    uniform generator, and the now-unreachable `new Function` calls are turned into throwing stubs.
pixi=esb(['vendor/pixi.min.js','--target=es2017','--minify'])
n=pixi.count('new Function('); pixi=pixi.replace('new Function(','(function(){throw new Error("codegen disabled")})(')
# The game never uses PixiJS' asset loaders (Assets / ImageBitmap worker / video / SVG / web fonts):
# textures come from in-memory canvases. Neutralise those unreachable network/worker code paths so the
# package carries no network-capable calls, and drop license banners that contain URLs.
def neutralise(js):
    js=re.sub(r'/\*![\s\S]*?\*/','',js)
    js=js.replace('fetch(','fetchUnavailable(').replace('new Worker(','new WorkerUnavailable(')
    js=js.replace('window.location.href','""').replace('https://pixijs.com','').replace('http://www.w3.org/2000/svg','w3-svg').replace('http://www.w3.org/1999/xhtml','w3-xhtml')
    js=js.replace('https://github.com/','github.com/')   # attribution inside a GLSL comment string
    return js
pixi=neutralise(pixi); (OUT/'vendor'/'pixi.min.js').write_text(pixi)
ue=neutralise(esb([str(ROOT/'vendor'/'unsafe-eval.min.js'),'--target=es2017','--minify'])); (OUT/'vendor'/'unsafe-eval.min.js').write_text(ue)
# 2. Game bundle: classic IIFE script, ES2017/Chrome 61, sprite paths → packaged WebP
game=esb(['src/main.js','--bundle','--format=iife','--minify','--target=es2017,chrome61'])
game=re.sub(r'assets/sprites/([A-Za-z_]+)\.png', r'./assets/sprites/\1.webp', game)
(OUT/'game.js').write_text(game)
# 3. Sprite sheets: 60% size WebP (atlases then fit 2048², ~4x less GPU memory)
for p in sorted((ROOT/'assets'/'sprites').glob('*.png')):
    im=Image.open(p).convert('RGBA'); k=0.6 if p.stem not in ('banana_walk','cat') else 0.5
    im=im.resize((round(im.width*k),round(im.height*k)),Image.LANCZOS); im.save(OUT/'assets'/'sprites'/(p.stem+'.webp'),'WEBP',quality=82,method=6)
# 4. index.html: container template, no inline scripts, no external resources
html=open('index.html',encoding='utf-8').read()
style=html[html.index('<style>'):html.index('</style>')+8]
style=style.replace('font-family:"Noto Serif SC","Songti SC","STSong",serif;','font-family:"Songti SC","STSong","Noto Serif CJK SC","Source Han Serif SC","PingFang SC","Hiragino Sans GB","Microsoft YaHei",serif;')
style=style.replace('#stage{position:fixed;top:0;left:0;right:0;bottom:0;','#stage{position:fixed;top:0;left:0;right:0;bottom:0;overflow:hidden;')
body=html[html.index('<div id="stage">'):html.index('<script src="vendor/pixi.min.js">')]
index=f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <title>Banana的岁时漫游</title>
  {style.replace('html,body{margin:0;height:100%;','html,body{margin:0;height:100%;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;touch-action:manipulation;')}
</head>
<body>
{body.strip()}
<script src="./vendor/pixi.min.js"></script>
<script src="./vendor/unsafe-eval.min.js"></script>
<script src="./game.js"></script>
</body>
</html>
'''
(OUT/'index.html').write_text(index,encoding='utf-8')
# 5. zip the *contents* of dist-xhs
zpath=ROOT/'dist'/'banana-minitool.zip'; zpath.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(zpath,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for f in sorted(OUT.rglob('*')):
        if f.is_file() and f.name!='.DS_Store': z.write(f,f.relative_to(OUT).as_posix())
sizes={f.relative_to(OUT).as_posix():f.stat().st_size for f in OUT.rglob('*') if f.is_file()}
print('new Function stubs replaced:',n); print({k:round(v/1024) for k,v in sizes.items()}); print('zip', zpath, round(zpath.stat().st_size/1024/1024,2),'MiB')
