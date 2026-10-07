import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool } from './db.js';
import { madridDay } from './journal-domain.js';
const day=madridDay(),sources=[{title:'Temporary test source',url:'https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints'}];
let batchId,reportId;
async function post(path,body){const r=await fetch('http://127.0.0.1:3000/api'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
try{
 if((await pool.query('SELECT 1 FROM daily_batches WHERE day=$1 UNION ALL SELECT 1 FROM daily_reports WHERE day=$1',[day])).rowCount)throw new Error('Hay publicaciones reales hoy. No se crean fixtures para ese día.');
 const body={day,summary:'Temporary publication integration check.',sources,ideas:[]};
 const invalid=await post('/journal/batches',{...body,ideas:[{assetId:randomUUID(),entry:100,stop:90,target:120,rationale:'Temporary integration fixture, not a trading proposal.',invalidation:'Temporary integration fixture.',sourceAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString(),sources}]});
 assert.equal(invalid.status,400);assert.equal((await pool.query('SELECT 1 FROM daily_batches WHERE day=$1',[day])).rowCount,0);
 const batch=await post('/journal/batches',body);assert.equal(batch.status,201);batchId=batch.data.id;
 assert.equal((await post('/journal/batches',body)).data.created,false);
 const payload={day,title:'Temporary report integration check',summary:'Temporary report used to verify storage and snapshots.',observations:['Fixture only.'],suggestions:['Fixture only.'],sources};
 const report=await post('/reports',payload);assert.equal(report.status,201);reportId=report.data.id;
 assert.equal((await post('/reports',payload)).data.created,false);
 const rows=await (await fetch('http://127.0.0.1:3000/api/reports')).json();const saved=rows.find(r=>r.id===reportId);assert.ok(saved.createdAt);assert.equal(saved.day,day);assert.ok(Array.isArray(saved.snapshot.positions));assert.equal(saved.title,payload.title);
 console.log('Publication checks passed: atomic rollback, daily deduplication, report timestamp and portfolio snapshot.');
}finally{
 if(reportId)await pool.query('DELETE FROM daily_reports WHERE id=$1',[reportId]);
 if(batchId)await pool.query('DELETE FROM daily_batches WHERE id=$1',[batchId]);
 await pool.end();
}
