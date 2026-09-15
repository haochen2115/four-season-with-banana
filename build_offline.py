#!/usr/bin/env python3
# Bundle the game into ONE html file that runs offline from file:// (all code and sprites inlined).
import subprocess, base64, re, os, pathlib
root=pathlib.Path(__file__).resolve().parent; os.chdir(root)
js=subprocess.run(['npx','--yes','esbuild@0.24.2','src/main.js','--bundle','--format=esm','--minify','--target=es2022'],capture_output=True,text=True,check=True).stdout
def data_uri(p): return 'data:image/png;base64,'+base64.b64encode(open(p,'rb').read()).decode()
for m in sorted(set(re.findall(r'assets/sprites/[A-Za-z_]+\.png',js))): js=js.replace(m,data_uri(m))
js=js.replace('</script>','<\\/script>')
pixi=open('vendor/pixi.min.js').read()
html=open('index.html').read()
html=html.replace('<script src="vendor/pixi.min.js"></script>','<script>'+pixi+'</script>')
html=html.replace('<script type="module" src="src/main.js"></script>','<script type="module">'+js+'</script>')
pathlib.Path('dist').mkdir(exist_ok=True); out=pathlib.Path('dist/Banana的岁时漫游-离线版.html'); out.write_text(html,encoding='utf-8')
print(out, round(out.stat().st_size/1e6,1),'MB')
import zipfile; z=out.with_suffix('.zip'); zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED,compresslevel=9).write(out,out.name); print(z, round(z.stat().st_size/1e6,1),'MB')
