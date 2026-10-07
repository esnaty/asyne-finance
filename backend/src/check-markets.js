// Optional live integration check. Only its own temporary position is removed.
import assert from 'node:assert/strict';
const base='http://127.0.0.1:3000/api';
async function request(path,method='GET',body){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return{status:r.status,data:r.status===204?null:await r.json()};}
const assets=(await request('/assets?q=BTC&kind=crypto')).data;
const btc=assets.find(a=>a.providerSymbol==='BTCUSDT');assert(btc);
assert(assets.every(a=>a.kind==='crypto'));
assert((await request('/assets?q=AAPL&kind=stock')).data.some(a=>a.symbol==='AAPL'));
assert((await request('/assets?q=SPY&kind=etf')).data.some(a=>a.symbol==='SPY'));
const q=(await request('/quotes?ids='+btc.id)).data[0];assert(q.price>0);assert.equal(q.currency,'USDT');assert(q.asOf);
let id;
try{
 const body={assetId:btc.id,symbol:btc.symbol,amount:20,averagePrice:100,targetPrice:110,stopLoss:90,currentPrice:999,currency:'USDT',strategy:'swing'};
 const p=await request('/positions','POST',body);assert.equal(p.status,201);id=p.data.id;assert.equal(p.data.currentPrice,null);
 const saved=(await request('/positions')).data.find(p=>p.id===id);assert.equal(saved.assetId,btc.id);assert.equal(saved.asset.exchange,'Binance Spot');assert.notEqual(saved.currentPrice,999);
 assert.equal((await request('/positions/'+id,'PUT',{...body,currency:'USD'})).status,400);
 const signal=AbortSignal.timeout(20000);const response=await fetch(base+'/quotes/stream?ids='+btc.id,{signal});
 const reader=response.body.getReader();let text='',live=false;
 try{while(!live){const {value,done}=await reader.read();if(done)break;text+=new TextDecoder().decode(value);const lines=text.split('\n');text=lines.pop();for(const line of lines){if(line.startsWith('data: ')){const quote=JSON.parse(line.slice(6));if(quote.status==='live'){assert.equal(quote.currency,'USDT');assert(quote.price>0);live=true;}}}}}finally{await reader.cancel();}
 assert(live,'Expected a real Binance trade via the local SSE endpoint');
 console.log('PASS: DB catalog, stock/ETF search, real crypto quote, live stream, linked position and currency rejection');
}finally{if(id)await request('/positions/'+id,'DELETE');}
