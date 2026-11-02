const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root=path.join(__dirname,'..');

test('HTML loads real separated app modules and has no inline event handlers',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 for(const file of ['css/app.css','js/core.js','js/learning.js','js/simulation.js','js/renderer3d.js','js/renderer-fallback.js','js/view.js','js/inspector.js','js/app.js']){
  assert.ok(fs.existsSync(path.join(root,file)),`missing ${file}`);
  assert.ok(html.includes(`href="${file}"`)||html.includes(`src="${file}"`),`not loaded: ${file}`);
 }
 assert.doesNotMatch(html,/\son(?:click|input|change|pointer\w+)\s*=/i);
 assert.doesNotMatch(html,/<style\b/i);
});

test('both rendering paths and browser-local persistence exist',()=>{
 const webgl=fs.readFileSync(path.join(root,'js/renderer3d.js'),'utf8');
 const fallback=fs.readFileSync(path.join(root,'js/renderer-fallback.js'),'utf8');
 const core=fs.readFileSync(path.join(root,'js/core.js'),'utf8');
 assert.match(webgl,/getContext\('webgl'/);assert.match(fallback,/activateFallback/);assert.match(fallback,/getContext\('2d'/);
 assert.match(webgl,/webglcontextlost/);assert.match(core,/localStorage\.setItem/);
});

test('WebGL animation initialization has one loop latch and no renderer recreation on UI refresh',()=>{
 const webgl=fs.readFileSync(path.join(root,'js/renderer3d.js'),'utf8');
 const view=fs.readFileSync(path.join(root,'js/view.js'),'utf8');
 assert.match(webgl,/renderLoopStarted/);assert.match(webgl,/function start3DLoop/);
 assert.doesNotMatch(view,/init3D\(/);assert.match(fs.readFileSync(path.join(root,'js/app.js'),'utf8'),/init3D\(\);\s*start3DLoop\(\);/);
});

test('workflows validate tests before publishing',()=>{
 const workflow=fs.readFileSync(path.join(root,'.github','workflows','pages.yml'),'utf8');
 assert.match(workflow,/needs: validate/);assert.match(workflow,/node --test tests\/\*.test\.cjs/);assert.match(workflow,/node --check/);
});

test('shared DOM helper is defined before the app boots',()=>{
 const core=fs.readFileSync(path.join(root,'js/core.js'),'utf8');
 const app=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
 assert.match(core,/function \$\(id\)\s*\{\s*return document\.getElementById\(id\);\s*\}/);
 assert.ok(fs.readFileSync(path.join(root,'index.html'),'utf8').indexOf('js/core.js') < fs.readFileSync(path.join(root,'index.html'),'utf8').indexOf('js/app.js'));
 assert.match(app,/bindUI\(\);\s*load\(\);/);
});

test('government panel exposes player-selectable policies and the app handles action',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),app=fs.readFileSync(path.join(root,'js/app.js'),'utf8');
 assert.match(html,/id="policy-select"/);assert.match(html,/data-action="set-policy"/);assert.match(app,/case 'set-policy': setPolicy\(\)/);
});
