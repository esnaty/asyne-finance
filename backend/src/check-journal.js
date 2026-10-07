// Isolated integration fixture. Deletes only the UUIDs created by this script.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool } from './db.js';
const base='http://127.0.0.1:3000/api';
const batchId=randomUUID(),ideaId=randomUUID();let tradeId;
async function req(path,method='GET',body){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
try{
 const asset=(await pool.query("SELECT id FROM assets WHERE provider='binance' AND symbol='BTC' AND currency='USDT' AND active LIMIT 1")).rows[0];assert.ok(asset);
 await pool.query("INSERT INTO daily_batches(id,day,summary,sources,created_at) VALUES($1,'1901-01-01','Temporary integration fixture','[]',now()-interval '1 minute')",[batchId]);
 await pool.query("INSERT INTO swing_ideas(id,batch_id,asset_id,entry,stop,target,rationale,invalidation,source_at,expires_at,sources) VALUES($1,$2,$3,100,90,120,'Temporary integration fixture','Temporary fixture',now(),now()+interval '1 hour','[]')",[ideaId,batchId,asset.id]);
 const body={requestKey:randomUUID(),amount:1000,price:100,fee:10,executedAt:new Date().toISOString()};
 const buy=await req(`/journal/ideas/${ideaId}/buy`,'POST',body);assert.equal(buy.status,201,JSON.stringify(buy.data));tradeId=buy.data.id;
 assert.equal((await req(`/journal/ideas/${ideaId}/buy`,'POST',body)).data.id,tradeId);
 assert.equal((await req(`/journal/ideas/${ideaId}/buy`,'POST',{...body,requestKey:randomUUID()})).status,400);
 assert.equal((await req(`/journal/ideas/${ideaId}/decision`,'PUT',{decision:'skipped'})).status,400);
 const sale={requestKey:randomUUID(),quantity:4,price:120,fee:2,executedAt:new Date().toISOString()};
 const sold=await req(`/journal/trades/${tradeId}/sell`,'POST',sale);assert.equal(sold.status,201,JSON.stringify(sold.data));
 assert.equal((await req(`/journal/trades/${tradeId}/sell`,'POST',sale)).data.id,sold.data.id);
 assert.equal((await req(`/journal/trades/${tradeId}/sell`,'POST',{...sale,requestKey:randomUUID(),quantity:7})).status,400);
 const journal=(await req('/journal')).data,t=journal.trades.find(t=>t.id===tradeId);assert.equal(t.realized,74);assert.equal(t.remaining,6);assert.equal(t.closed,false);
 const competing=await Promise.all([1,2].map(()=>req(`/journal/trades/${tradeId}/sell`,'POST',{...sale,requestKey:randomUUID(),quantity:6,price:90})));
 assert.deepEqual(competing.map(r=>r.status).sort(),[201,400]);
 const final=(await req('/journal')).data.trades.find(t=>t.id===tradeId);assert.equal(final.remaining,0);assert.equal(final.realized,6);assert.equal(final.closed,true);
 console.log('Journal integration passed: execution, retry deduplication, partial fees, oversell protection and concurrent close.');
}finally{
 if(tradeId){await pool.query('DELETE FROM swing_sales WHERE trade_id=$1',[tradeId]);await pool.query('DELETE FROM swing_trades WHERE id=$1',[tradeId]);}
 await pool.query('DELETE FROM swing_ideas WHERE id=$1',[ideaId]);await pool.query('DELETE FROM daily_batches WHERE id=$1',[batchId]);await pool.end();
}
