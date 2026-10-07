// Creates isolated temporary records and removes only those records on completion.
import assert from 'node:assert/strict';
const base='http://127.0.0.1:3000/api';
async function req(path,method='GET',body){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:r.status===204?null:await r.json()};}
const p={symbol:'TEST-API',quantity:.002,averagePrice:100,currentPrice:null,currency:'EUR',strategy:'long_term'};
const s={symbol:'TEST-API',market:'Prueba local',currency:'USDT',entry:100,stop:97,target:106,notes:'Registro temporal de prueba',expiresAt:null,status:'draft'};
let pid,sid;
try{
assert.equal((await req('/health')).status,200);
const created=await req('/positions','POST',p);assert.equal(created.status,201);pid=created.data.id;assert.equal(created.data.currentPrice,null);
assert.equal((await req('/positions')).data.find(x=>x.id===pid).quantity,.002);
assert.equal((await req('/positions/'+pid,'PUT',{...p,currentPrice:105})).data.currentPrice,105);
assert.equal((await req('/positions','POST',{...p,quantity:-1})).status,400);
const sized={symbol:'TEST-API',amount:1000,averagePrice:100,targetPrice:120,stopLoss:90,currentPrice:null,currency:'USD',strategy:'swing'};
const updated=await req('/positions/'+pid,'PUT',sized);
assert.equal(updated.status,200);assert.equal(updated.data.quantity,10);
const stored=(await req('/positions')).data.find(x=>x.id===pid);
assert.equal(stored.amount,1000);assert.equal(stored.targetPrice,120);assert.equal(stored.stopLoss,90);
assert.equal((await req('/positions/'+pid,'PUT',{...sized,stopLoss:101})).status,400);
assert.equal((await req('/positions')).data.find(x=>x.id===pid).stopLoss,90);
const resized=await req('/positions/'+pid,'PUT',{...sized,amount:500});
assert.equal(resized.data.quantity,5);assert.equal(resized.data.amount,500);
const plan=await req('/plans','POST',s);assert.equal(plan.status,201);sid=plan.data.id;
assert.equal((await req('/plans/'+sid,'PUT',{...s,status:'watching'})).data.status,'watching');
assert.equal((await req('/plans','POST',{...s,stop:110})).status,400);
assert.equal((await req('/calculate','POST',{capital:60,risk:1,entry:100,stop:97,target:106,fee:.1})).data.loss,.6);
assert.equal((await req('/positions/not-a-uuid','DELETE')).status,400);
console.log('PASS: PostgreSQL CRUD for positions and plans, calculation, validation, and UUID handling');
}finally{if(pid)assert.equal((await req('/positions/'+pid,'DELETE')).status,204);if(sid)assert.equal((await req('/plans/'+sid,'DELETE')).status,204);}
