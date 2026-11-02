// Canvas isometric renderer used if WebGL is unsupported or the context is lost.
let fallbackActive = false, fallbackLoopStarted = false, fallbackAgents = [];
function activateFallback(reason) {
  if (fallbackActive) return;
  fallbackActive = true; gl = null;
  const previous = $('map'), canvas = document.createElement('canvas');
  canvas.id = 'map'; canvas.className = 'map'; canvas.setAttribute('aria-label', 'Mapa 3D isométrico de respaldo');
  previous.replaceWith(canvas);
  $('mapmeta').textContent = `Modo isométrico de respaldo · arrastra para orientar · ${String(reason || 'WebGL no disponible')}`;
  canvas.addEventListener('pointerdown', event => { canvas.dataset.dragX=event.clientX; canvas.dataset.dragY=event.clientY; canvas.dataset.dragged='0'; canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener('pointermove', event => {
    if(!canvas.hasPointerCapture(event.pointerId))return;
    const dx=event.clientX-Number(canvas.dataset.dragX),dy=event.clientY-Number(canvas.dataset.dragY);
    if(Math.abs(dx)+Math.abs(dy)>4)canvas.dataset.dragged='1';
    camYaw+=dx*.004;camPitch=Math.max(.3,Math.min(1.25,camPitch+dy*.003));canvas.dataset.dragX=event.clientX;canvas.dataset.dragY=event.clientY;
  });
  canvas.addEventListener('pointerup',event=>{if(canvas.dataset.dragged==='0'){const person=fallbackAgents.find(item=>Math.hypot(item.x-event.offsetX,item.y-event.offsetY)<18);if(person)openBrain(person.id);}});
  canvas.addEventListener('wheel',event=>{event.preventDefault();camDistance=Math.max(20,Math.min(78,camDistance+event.deltaY*.035));},{passive:false});
  if(!fallbackLoopStarted){fallbackLoopStarted=true;requestAnimationFrame(renderFallbackFrame);}
}
function renderFallbackFrame(time) {
  const canvas=$('map');if(!fallbackActive||!canvas)return;
  const rect=canvas.getBoundingClientRect(),d=Math.min(window.devicePixelRatio||1,1.5),w=Math.max(1,Math.floor(rect.width*d)),h=Math.max(1,Math.floor(rect.height*d));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
  const ctx=canvas.getContext('2d');if(!ctx)return;ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,rect.width,rect.height);ctx.fillStyle='#142128';ctx.fillRect(0,0,rect.width,rect.height);
  const cx=rect.width*.5,cy=rect.height*.55,scale=Math.min(rect.width/78,rect.height/55)*Math.max(.62,48/camDistance),yaw=camYaw,pitch=camPitch;
  function iso(x,y,z){const rx=x*Math.cos(yaw)-z*Math.sin(yaw),rz=x*Math.sin(yaw)+z*Math.cos(yaw);return[cx+(rx-rz)*.7*scale,cy+(rx+rz)*.26*scale-y*Math.sin(pitch)*scale];}
  function polygon(points,color){ctx.fillStyle=color;ctx.beginPath();points.forEach((point,index)=>{const p=iso(...point);index?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]);});ctx.closePath();ctx.fill();}
  polygon([[-21,0,-18],[21,0,-18],[21,0,18],[-21,0,18]],'#35463e');
  for(let i=-4;i<=4;i++){const a=iso(i*4,0,-18),b=iso(i*4,0,18),c=iso(-21,0,i*4),e=iso(21,0,i*4);ctx.strokeStyle='#53645d';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.moveTo(...c);ctx.lineTo(...e);ctx.stroke();}
  const buildings=city.buildings.map(building=>({building,position:buildingPosition(building)})).sort((a,b)=>(a.position[0]+a.position[2])-(b.position[0]+b.position[2]));
  for(const {building,position} of buildings){const [x,,z]=position;if(building.kind==='park'){polygon([[x-2.4,.05,z-1.8],[x+2.4,.05,z-1.8],[x+2.4,.05,z+1.8],[x-2.4,.05,z+1.8]],'#398250');const p=iso(x,.25,z);ctx.fillStyle='#27683e';ctx.fillRect(p[0]-8,p[1]-22,16,22);ctx.fillStyle='#4f9c59';ctx.fillRect(p[0]-17,p[1]-37,34,22);continue;}
    const sx=building.kind==='civic'?3.7:2.8,sz=building.kind==='civic'?3.4:2.8,sy=building.kind==='civic'?4.1:2.7,color=building.kind==='housing'?'#397ca1':building.kind==='civic'?'#2caa86':building.kind==='education'?'#7953a0':'#ad7d3d';
    const top=[[x-sx/2,sy,z-sz/2],[x+sx/2,sy,z-sz/2],[x+sx/2,sy,z+sz/2],[x-sx/2,sy,z+sz/2]],base=[[x-sx/2,0,z-sz/2],[x+sx/2,0,z-sz/2],[x+sx/2,0,z+sz/2],[x-sx/2,0,z+sz/2]];
    polygon([base[1],base[2],top[2],top[1]],shade(color,-18));polygon([base[2],base[3],top[3],top[2]],shade(color,-35));polygon(top,shade(color,18));
    const door=iso(x,.8,z+sz/2+.04);ctx.fillStyle='#222c31';ctx.fillRect(door[0]-5,door[1]-8,10,16);
    for(let floor=0;floor<2;floor++){const window=iso(x-sx*.25,1.2+floor*.9,z+sz/2+.02);ctx.fillStyle='#9fd8d1';ctx.fillRect(window[0]-3,window[1]-5,6,6);}
    const label=iso(x,sy+.8,z);ctx.fillStyle='#d7e4dc';ctx.font='10px system-ui';ctx.textAlign='center';ctx.fillText(building.name,label[0],label[1]);
  }
  fallbackAgents=[];const stride=Math.max(1,Math.ceil(city.agents.length/1100));
  for(let index=0;index<city.agents.length;index++){const agent=city.agents[index];if(index%stride!==0&&agent.id!==selected)continue;const position=agentMotion(agent,time);if(position.inside)continue;const p=iso(position.x,.6,position.z),color=agent.id===selected?'#ff705d':['#e58b55','#57a0d1','#a982ca','#6ebd91','#dcbb64'][agent.brain.seed%5];ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(p[0]-5,p[1]+8,11,3);ctx.fillStyle=color;ctx.fillRect(p[0]-5,p[1]-4,10,12);ctx.fillStyle=['#d6aa82','#f0c1a0','#a66c4e'][agent.brain.seed%3];ctx.fillRect(p[0]-4,p[1]-12,8,8);fallbackAgents.push({id:agent.id,x:p[0],y:p[1]-8});}
  requestAnimationFrame(renderFallbackFrame);
}
function shade(hex,amount){const value=parseInt(hex.slice(1),16),r=Math.max(0,Math.min(255,(value>>16)+amount)),g=Math.max(0,Math.min(255,((value>>8)&255)+amount)),b=Math.max(0,Math.min(255,(value&255)+amount));return`rgb(${r},${g},${b})`;}
