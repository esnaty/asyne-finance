import assert from 'node:assert/strict';
const base='http://127.0.0.1:3000/api/positions';
const p={symbol:'TEST-EXITS',quantity:10,averagePrice:100,currency:'USD',strategy:'long_term',currentPrice:null,exits:[{quantity:2,targetPrice:120},{quantity:3,targetPrice:150}]};
async function request(url,method,body){return fetch(url,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
let id;
try{
  const response=await request(base,'POST',p);assert.equal(response.status,201);
  const created=await response.json();id=created.id;assert.deepEqual(created.exits,p.exits);
  const invalid=await request(`${base}/${id}`,'PUT',{...p,quantity:4});assert.equal(invalid.status,400);
  const rows=await (await fetch(base)).json();assert.deepEqual(rows.find(r=>r.id===id).exits,p.exits);
  const edited=await request(`${base}/${id}`,'PUT',{...p,exits:[{quantity:1,targetPrice:130}]});assert.equal(edited.status,200);assert.equal((await edited.json()).exits.length,1);
  console.log('Partial exits API: persisted, edited, overselling rejected without mutation.');
}finally{if(id)assert.equal((await fetch(`${base}/${id}`,{method:'DELETE'})).status,204);}
