// WebGL renderer for the voxel city; only this module owns its render loop.
let gl = null, shaderProgram = null, cubeBuffer = null, sceneObjects = [];
let camYaw = .78, camPitch = .72, camDistance = 47, camTarget = [0, 0, 0];
let drag = null, lastFrame = 0, projectedAgents = [], renderLoopStarted = false;

function multiplyMatrices(a, b) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++)
    out[column * 4 + row] = a[row] * b[column * 4] + a[4 + row] * b[column * 4 + 1] + a[8 + row] * b[column * 4 + 2] + a[12 + row] * b[column * 4 + 3];
  return out;
}
function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}
function normalize(vector) { const length = Math.hypot(...vector) || 1; return vector.map(value => value / length); }
function cross(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
function lookAt(eye, center, up) {
  const z = normalize([eye[0]-center[0], eye[1]-center[1], eye[2]-center[2]]), x = normalize(cross(up, z)), y = cross(z, x);
  return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
}
function modelMatrix(x, y, z, sx, sy, sz) { return new Float32Array([sx,0,0,0,0,sy,0,0,0,0,sz,0,x,y,z,1]); }
function compileShader(type, source) {
  const shader = gl.createShader(type); gl.shaderSource(shader, source); gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
  return shader;
}
function init3D() {
  try { initializeWebGL(); if (!gl) activateFallback('WebGL no disponible o bloqueado'); }
  catch (error) { console.error('WebGL no pudo iniciar:', error); gl = null; activateFallback(error.message); }
}
function initializeWebGL() {
  const canvas = $('map');
  gl = canvas.getContext('webgl', { antialias: true, alpha: false }) || canvas.getContext('experimental-webgl');
  if (!gl) return;
  const vertex = compileShader(gl.VERTEX_SHADER, 'attribute vec3 p; uniform mat4 mvp; void main(){gl_Position=mvp*vec4(p,1.0);}');
  const fragment = compileShader(gl.FRAGMENT_SHADER, 'precision mediump float; uniform vec4 color; void main(){gl_FragColor=color;}');
  shaderProgram = gl.createProgram(); gl.attachShader(shaderProgram, vertex); gl.attachShader(shaderProgram, fragment); gl.linkProgram(shaderProgram);
  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(shaderProgram));
  const faces = [
    [-.5,-.5,.5,.5,-.5,.5,.5,.5,.5,-.5,-.5,.5,.5,.5,.5,-.5,.5,.5], [.5,-.5,-.5,-.5,-.5,-.5,-.5,.5,-.5,.5,-.5,-.5,-.5,.5,-.5,.5,.5,-.5],
    [-.5,.5,.5,.5,.5,.5,.5,.5,-.5,-.5,.5,.5,.5,.5,-.5,-.5,.5,-.5], [-.5,-.5,-.5,.5,-.5,-.5,.5,-.5,.5,-.5,-.5,-.5,.5,-.5,.5,-.5,-.5,.5],
    [.5,-.5,.5,.5,-.5,-.5,.5,.5,-.5,.5,-.5,.5,.5,.5,-.5,.5,.5,.5], [-.5,-.5,-.5,-.5,-.5,.5,-.5,.5,.5,-.5,-.5,-.5,-.5,.5,.5,-.5,.5,-.5]
  ];
  cubeBuffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(faces.flat()), gl.STATIC_DRAW);
  gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); activateFallback('el dispositivo perdió el contexto gráfico'); });
  canvas.addEventListener('pointerdown', event => { drag = { x:event.clientX,y:event.clientY,yaw:camYaw,pitch:camPitch,moved:false }; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', event => { if (!drag) return; const dx=event.clientX-drag.x,dy=event.clientY-drag.y; if (Math.abs(dx)+Math.abs(dy)>4) drag.moved=true; camYaw=drag.yaw-dx*.008; camPitch=Math.max(.22,Math.min(1.35,drag.pitch+dy*.006)); });
  canvas.addEventListener('pointerup', event => { if (drag && !drag.moved) { const rect=canvas.getBoundingClientRect(), hit=projectedAgents.find(person=>Math.hypot(person.x-(event.clientX-rect.left),person.y-(event.clientY-rect.top))<14); if (hit) openBrain(hit.id); } drag=null; });
  canvas.addEventListener('wheel', event => { event.preventDefault(); camDistance=Math.max(20,Math.min(78,camDistance+event.deltaY*.035)); }, { passive:false });
}
function start3DLoop() { if (!renderLoopStarted && !fallbackActive) { renderLoopStarted=true; requestAnimationFrame(safeFrame3D); } }
function safeFrame3D(time) { try { renderFrame(time); } catch (error) { console.error('Escena WebGL:', error); activateFallback('fallo del controlador gráfico'); } }
function addCube(x,y,z,sx,sy,sz,color) { sceneObjects.push({x,y,z,sx,sy,sz,color}); }
function buildingPosition(building) { return [(building.x-.5)*38, 0, (building.y-.5)*32]; }
function agentMotion(agent, time) {
  const home=city.buildings.find(building=>building.id===agent.home)||city.buildings.find(building=>building.kind==='housing');
  const firm=city.firms.find(item=>item.id===agent.job), office=firm?city.buildings.find(building=>building.id===firm.building):null;
  if (!home) return {x:0,z:0,inside:true};
  const start=buildingPosition(home),end=buildingPosition(office||home);
  const phase=((time/1000+(agent.brain.seed%100)*.37)%72+72)%72,walkingOut=phase>=24&&phase<33,walkingHome=phase>=56&&phase<65;
  if(walkingOut)return{x:start[0]+(end[0]-start[0])*(phase-24)/9,z:start[2]+(end[2]-start[2])*(phase-24)/9,inside:false};
  if(walkingHome)return{x:end[0]+(start[0]-end[0])*(phase-56)/9,z:end[2]+(start[2]-end[2])*(phase-56)/9,inside:false};
  return{x:phase<24?start[0]:end[0],z:phase<24?start[2]:end[2],inside:true};
}
function projectPoint(point, matrix, width, height) {
  const [x,y,z]=point,cx=matrix[0]*x+matrix[4]*y+matrix[8]*z+matrix[12],cy=matrix[1]*x+matrix[5]*y+matrix[9]*z+matrix[13],cw=matrix[3]*x+matrix[7]*y+matrix[11]*z+matrix[15];
  if(cw<=0)return null;return{x:(cx/cw*.5+.5)*width,y:(1-(cy/cw*.5+.5))*height};
}
function renderFrame(time) {
  if(!gl)return;if(time-lastFrame<32){requestAnimationFrame(safeFrame3D);return;}lastFrame=time;
  const canvas=$('map'),rect=canvas.getBoundingClientRect(),d=window.devicePixelRatio||1,width=Math.max(1,Math.floor(rect.width*d)),height=Math.max(1,Math.floor(rect.height*d));
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height);}
  gl.clearColor(.055,.09,.105,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  const eye=[Math.sin(camYaw)*Math.cos(camPitch)*camDistance,Math.sin(camPitch)*camDistance,Math.cos(camYaw)*Math.cos(camPitch)*camDistance],vp=multiplyMatrices(perspective(.78,width/height,.1,180),lookAt(eye,camTarget,[0,1,0]));
  sceneObjects=[];addCube(0,-.38,0,42,.5,36,[.14,.22,.19,1]);
  for(let i=-4;i<=4;i++){addCube(i*4,-.105,0,.26,.05,34,[.25,.32,.3,1]);addCube(0,-.10,i*4,42,.05,.25,[.25,.32,.3,1]);}
  for(const building of city.buildings){const [x,,z]=buildingPosition(building),kind=building.kind,color=kind==='housing'?[.24,.48,.68,1]:kind==='civic'?[.2,.68,.56,1]:kind==='education'?[.55,.36,.7,1]:[.7,.5,.25,1],sx=kind==='civic'?3.7:2.8,sz=kind==='civic'?3.4:2.8,sy=kind==='civic'?4.1:2.7;
    if(kind==='park'){addCube(x,.1,z,5,.2,4,[.19,.43,.24,1]);addCube(x,.9,z,1.1,1.8,1.1,[.22,.48,.28,1]);continue;}
    addCube(x,sy/2,z,sx,sy,sz,color);addCube(x,sy+.22,z,sx*1.12,.42,sz*1.12,[color[0]*.72,color[1]*.75,color[2]*.78,1]);
    for(const side of [-1,1])for(let floor=0;floor<2;floor++)addCube(x+side*(sx/2+.012),.75+floor*1.05,z,.035,.47,.72,[.55,.78,.77,1]);
    addCube(x,.72,z+sz/2+.02,.65,1.42,.05,[.13,.17,.18,1]);
  }
  projectedAgents=[];const stride=Math.max(1,Math.ceil(city.agents.length/700));
  for(let index=0;index<city.agents.length;index++){const agent=city.agents[index];if(index%stride!==0&&agent.id!==selected)continue;const position=agentMotion(agent,time);if(position.inside)continue;
    const bob=Math.abs(Math.sin(time/125+(agent.brain.seed%19)))*.11,skin=[.72+(agent.brain.seed%4)*.045,.48+(agent.brain.seed%5)*.045,.34+(agent.brain.seed%3)*.055,1],shirt=agent.id===selected?[1,.31,.2,1]:[.18+(agent.brain.seed%7)*.055,.42+(agent.brain.seed%6)*.05,.65-(agent.brain.seed%4)*.06,1],y=.65+bob;
    addCube(position.x,y,position.z,.46,.75,.38,shirt);addCube(position.x,y+.62,position.z,.4,.4,.4,skin);
    const screen=projectPoint([position.x,y+.82,position.z],vp,width,height);if(screen)projectedAgents.push({id:agent.id,x:screen.x/d,y:screen.y/d});
  }
  gl.useProgram(shaderProgram);gl.bindBuffer(gl.ARRAY_BUFFER,cubeBuffer);const attribute=gl.getAttribLocation(shaderProgram,'p'),uMvp=gl.getUniformLocation(shaderProgram,'mvp'),uColor=gl.getUniformLocation(shaderProgram,'color');
  gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,3,gl.FLOAT,false,0,0);
  for(const cube of sceneObjects){gl.uniformMatrix4fv(uMvp,false,multiplyMatrices(vp,modelMatrix(cube.x,cube.y,cube.z,cube.sx,cube.sy,cube.sz)));gl.uniform4fv(uColor,cube.color);gl.drawArrays(gl.TRIANGLES,0,36);}
  if(gl.getError()!==gl.NO_ERROR){activateFallback('error de renderizado WebGL');return;}requestAnimationFrame(safeFrame3D);
}
function renderMap() { /* The dedicated animation loop refreshes the WebGL canvas independently. */ }
