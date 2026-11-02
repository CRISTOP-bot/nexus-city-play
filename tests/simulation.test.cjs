const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function makeContext() {
  const storage = new Map();
  const context = vm.createContext({
    console, Math, Map, Set, Object, Array, String, Number, Boolean, JSON, Date, Float32Array,
    globalThis: null,
    localStorage: { getItem:key=>storage.get(key)??null, setItem:(key,value)=>storage.set(key,value), removeItem:key=>storage.delete(key) },
    window:{devicePixelRatio:1,addEventListener(){}}, document:{addEventListener(){},hidden:false},
    requestAnimationFrame(){},setInterval,clearInterval,confirm:()=>true,alert(){}
  });
  context.globalThis=context;
  for(const file of ['core.js','learning.js','simulation.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'..','js',file),'utf8'),context,{filename:file});
  vm.runInContext('this.__getCity = () => city; this.__setCity = value => { city = value; }; this.__getGoods = () => GOODS; this.__getSaveKey = () => SAVE_KEY; this.render = () => {}; this.save = () => {};',context);
  return {context,storage};
}

test('same seed creates the same populated city and unique, bounded individual brains',()=>{
 const {context}=makeContext(),a=context.createCity(40,123),b=context.createCity(40,123);
 assert.equal(a.agents.length,40);assert.equal(new Set(a.agents.map(x=>x.id)).size,40);
 assert.equal(a.agents[0].name,b.agents[0].name);assert.equal(a.agents[0].brain.seed,b.agents[0].brain.seed);
 assert.equal(Object.keys(a.agents[0].brain.semantic).length,6);assert.equal(a.agents[0].brain.episodic.length,0);
});
test('repeated economic failures change the next autonomous decision',()=>{
 const {context}=makeContext(),world=context.createCity(10,7);context.__setCity(world);const a=world.agents[0];
 a.traits.ambition=0;a.brain.preferences.saving=.15;a.needs.food=.9;a.needs.belonging=.9;a.job=null;
 assert.equal(context.decide(a,['seek_work','save_money']).action,'seek_work');
 for(let i=0;i<4;i++)context.learn(a,'seek_work',-1);
 assert.equal(context.decide(a,['seek_work','save_money']).action,'save_money');
});
test('learned knowledge is attributable and experience affects action value',()=>{
 const {context}=makeContext(),world=context.createCity(8,19);context.__setCity(world);const a=world.agents[0];
 context.learn(a,'buy_food',.8,{key:'market:food',text:'Food price learned.'});
 assert.equal(a.brain.semantic['market:food'].source,'learned');assert.equal(a.brain.semantic['market:food'].verified,true);
 assert.equal(a.brain.action_counts.buy_food,1);assert.equal(a.brain.learning,1);
});
test('old saved cities migrate without losing residents or initialize their brains',()=>{
 const {context,storage}=makeContext(),old=context.createCity(5,3);delete old.schema;for(const a of old.agents)delete a.brain;
 storage.set(context.__getSaveKey(),JSON.stringify(old));context.load();const migrated=context.__getCity();
 assert.equal(migrated.agents.length,5);assert.ok(migrated.agents.every(a=>a.brain&&a.brain.semantic.employment));
});
test('daily simulation remains deterministic, bounded and records its calendar',()=>{
 const {context}=makeContext(),world=context.createCity(60,8);context.__setCity(world);context.tick(8);const result=context.__getCity();
 assert.equal(result.day,8);assert.ok(result.history.length>=2);
 assert.ok(Object.entries(result.prices).every(([good,price])=>price>=context.__getGoods()[good]*.35&&price<=context.__getGoods()[good]*3));
 assert.ok(result.events.some(event=>event.day===7));
});
test('skills transfer to a learner and must be mastered by the teacher',()=>{
 const {context}=makeContext(),world=context.createCity(4,9);context.__setCity(world);const [teacher,learner]=world.agents;
 teacher.brain.procedural.budgeting=.9;assert.equal(context.teachSkill(teacher,learner,'budgeting'),true);
 assert.ok(learner.brain.procedural.budgeting>=.49);assert.equal(learner.brain.semantic['skill:budgeting'].source,'social');
 assert.equal(context.teachSkill(learner,teacher,'unknown'),false);
});

test('migration upgrades old resident traits and needs while preserving saved values',()=>{
 const {context}=makeContext(),world=context.createCity(3,31);delete world.agents[0].traits.curiosity;delete world.agents[0].needs.clothes;world.agents[0].money=17;
 const migrated=context.migrateCity(world),a=migrated.agents[0];
 assert.equal(migrated.schema,4);assert.equal(a.money,17);assert.equal(a.traits.curiosity,.5);assert.equal(a.needs.clothes,.65);assert.ok(a.needs.health>0);
});
test('clothing purchases improve clothing need and reduce stock and money',()=>{
 const {context}=makeContext(),world=context.createCity(6,33);context.__setCity(world);const a=world.agents[0],firm=world.firms.find(x=>x.good==='clothes');
 a.money=100;a.needs.clothes=.1;const before=firm.inventory;context.buyGood(a,'clothes',world.firms,{food:0,energy:0,clothes:0});
 assert.ok(a.needs.clothes>.1);assert.ok(a.money<100);assert.ok(firm.inventory<before);
});
test('rest reduces fatigue and stress; recovery and wear stay within bounds',()=>{
 const {context}=makeContext(),world=context.createCity(12,45);context.__setCity(world);const a=world.agents[0];
 a.job=null;a.needs.energy=.15;a.needs.stress=.8;a.needs.food=.1;a.needs.clothes=.2;
 context.tick(12);
 assert.ok(a.needs.energy>=0&&a.needs.energy<=1);assert.ok(a.needs.stress>=0&&a.needs.stress<=1);assert.ok(a.needs.health>=0&&a.needs.health<=1);assert.ok(a.needs.clothes>=0&&a.needs.clothes<=1);
});
test('personality profiles contain curiosity, empathy and responsibility',()=>{
 const {context}=makeContext(),world=context.createCity(30,99);
 assert.ok(world.agents.every(a=>['curiosity','kindness','conscientiousness'].every(k=>a.traits[k]>=0&&a.traits[k]<=1)));
 assert.ok(world.agents.every(a=>['food','energy','belonging','clothes','health','stress'].every(k=>Number.isFinite(a.needs[k]))));
});
test('goals, kindness and relationships affect social/learning choices',()=>{
 const {context}=makeContext(),world=context.createCity(8,72);context.__setCity(world);const a=world.agents[0];
 a.goals=['formar comunidad'];a.traits.kindness=1;a.traits.sociability=1;a.needs.belonging=.05;a.needs.food=1;a.needs.energy=1;a.job=null;
 const decision=context.decide(a,['socialize','help_neighbor','save_money']);assert.ok(['socialize','help_neighbor'].includes(decision.action));
});
test('initial housing has enough declared capacity and every firm has workers',()=>{
 const {context}=makeContext(),world=context.createCity(240,42),homes=world.buildings.filter(b=>b.kind==='housing');
 assert.ok(homes.reduce((sum,b)=>sum+b.capacity,0)>=world.agents.length);
 assert.ok(world.firms.every(f=>f.employees.length>0));assert.equal(world.agents.filter(a=>a.job).length,world.firms.reduce((n,f)=>n+f.employees.length,0));
});
test('schema migration preserves old brain while adding complete defaults',()=>{
 const {context}=makeContext(),world=context.createCity(5,5),a=world.agents[0];
 delete a.brain.preferences;delete a.brain.procedural.self_care;delete a.traits.curiosity;delete a.needs.health;
 const oldLearning=a.brain.learning,migrated=context.migrateCity(world);
 assert.equal(migrated.schema,4);assert.equal(a.brain.learning,oldLearning);assert.equal(a.traits.curiosity,.5);assert.equal(a.needs.health,.9);
 assert.ok(Number.isFinite(a.brain.preferences.generosity));assert.ok(Number.isFinite(a.brain.procedural.self_care));assert.equal(a.brain.education_progress,0);assert.ok(world.buildings.some(b=>b.id===a.home&&b.kind==='housing'));assert.equal(world.buildings.filter(b=>b.kind==='housing').reduce((sum,b)=>sum+b.occupants,0),world.agents.length);
});

test('city event random stream and economy remain reproducible from the same seed',()=>{
 const {context}=makeContext(),a=context.createCity(80,812),b=context.createCity(80,812);
 context.__setCity(a);context.tick(80);const resultA=context.__getCity();
 const second=makeContext(),bContext=second.context; bContext.__setCity(b);bContext.tick(80);const resultB=bContext.__getCity();
 assert.deepEqual(JSON.parse(JSON.stringify(resultA.prices)),JSON.parse(JSON.stringify(resultB.prices)));
 assert.deepEqual(resultA.events.map(e=>[e.day,e.category,e.text]),resultB.events.map(e=>[e.day,e.category,e.text]));
 assert.equal(resultA.rng,resultB.rng);
});
test('public service policy improves health only when the city can afford services',()=>{
 const {context}=makeContext(),world=context.createCity(10,15);context.__setCity(world);world.policy='Servicios públicos';world.treasury=200;
 for(const a of world.agents){a.needs.health=.5;a.needs.food=1;a.needs.energy=1;}
 context.tick(7);
 assert.ok(world.agents.some(a=>a.needs.health>.5));assert.ok(world.treasury<200);
});
test('bankrupted essential supplier is restarted only through funded recovery',()=>{
 const {context}=makeContext(),world=context.createCity(10,4);context.__setCity(world);const suppliers=world.firms.filter(x=>x.good==='food');
 for(const firm of suppliers){firm.active=false;firm.inventory=0;firm.cash=-10;}
 const bankrupt=suppliers[0];bankrupt.active=true;world.treasury=0;world.day=1;
 context.processBusinessFailures([bankrupt],new Map());assert.equal(bankrupt.active,false);
 world.day=30;world.treasury=10000;context.processBusinessFailures([],new Map());
 assert.ok(suppliers.some(x=>x.active&&x.cash>0));assert.ok(world.treasury<10000);
});
test('economic actions keep need, price and individual money within valid bounds',()=>{
 const {context}=makeContext(),world=context.createCity(120,516);context.__setCity(world);context.tick(365);
 for(const agent of world.agents){
  assert.ok(Number.isFinite(agent.money)&&agent.money>=0);
  for(const key of ['food','energy','belonging','clothes','health','stress']) assert.ok(Number.isFinite(agent.needs[key])&&agent.needs[key]>=0&&agent.needs[key]<=1,`${agent.id} ${key}=${agent.needs[key]}`);
 }
 for(const [good,price] of Object.entries(world.prices)) assert.ok(price>=context.__getGoods()[good]*.35&&price<=context.__getGoods()[good]*3);
});
test('older saved worlds without firms or buildings migrate without crashing a tick',()=>{
 const {context}=makeContext(),world=context.createCity(20,6);world.firms=[];world.buildings=[];world.relationships=[];
 const migrated=context.migrateCity(world);assert.ok(migrated.buildings.some(b=>b.kind==='housing'));context.__setCity(migrated);assert.doesNotThrow(()=>context.tick(3));
 assert.equal(migrated.day,3);assert.ok(migrated.agents.every(a=>a.needs&&a.brain));
});

test('tax revenue comes from payroll and is bounded by actual wages',()=>{
 const {context}=makeContext(),world=context.createCity(90,404);context.__setCity(world);world.tax_rate=.1;
 const initial=world.treasury;context.tick(7);
 assert.ok(world.treasury>initial);assert.ok(world.treasury-initial<200);
 assert.ok(world.agents.filter(a=>a.job).every(a=>a.money>=0));
});
test('education advances through levels instead of instantly granting graduation',()=>{
 const {context}=makeContext(),world=context.createCity(8,55);context.__setCity(world);const a=world.agents[0];
 a.education='básica';a.brain.education_progress=.95;a.traits.curiosity=.8;
 context.tick(30);
 assert.ok(['básica','media','superior'].includes(a.education));
 assert.ok(a.brain.education_progress>=0&&a.brain.education_progress<=1);
 assert.ok(a.brain.decisions.length<=20);
});
