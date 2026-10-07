import { Router } from 'express';
import { z } from 'zod';
import { pool } from './db.js';
import { assetColumns,syncCatalog } from './catalog.js';
import { createQuoteReader,normalizeTrade } from './market-data.js';
export const marketRouter=Router();
const readQuote=createQuoteReader();
marketRouter.get('/assets',async(req,res)=>{
  const q=z.string().max(80).parse(req.query.q??'');
  const kind=z.enum(['all','crypto','stock','etf']).parse(req.query.kind??'all');
  const pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%';
  const {rows}=await pool.query(`SELECT ${assetColumns} FROM assets WHERE active AND ($1='all' OR kind=$1) AND (symbol ILIKE $2 OR name ILIKE $2)
    ORDER BY CASE WHEN symbol=upper($3) THEN 0 WHEN symbol IN ('BTC','ETH','SOL','AAPL','MSFT','SPY','QQQ') THEN 1 ELSE 2 END,symbol,currency,exchange LIMIT 100`,[kind,pattern,q]);
  res.json(rows);
});
marketRouter.get('/market/status',async(_req,res)=>{
  const counts=(await pool.query('SELECT kind,count(*)::int AS count FROM assets WHERE active GROUP BY kind')).rows;
  res.json({twelveConfigured:!!process.env.TWELVE_DATA_API_KEY,counts});
});
marketRouter.post('/assets/sync',async(_req,res)=>res.json(await syncCatalog()));
async function assetsForQuery(query){
  const ids=z.array(z.uuid()).max(50).parse(String(query.ids??'').split(',').filter(Boolean));
  return (await pool.query(`SELECT ${assetColumns} FROM assets WHERE id=ANY($1::uuid[])`,[ids])).rows;
}
async function persistQuote(q){
  if(q.price===null)return;
  await pool.query(`INSERT INTO asset_quotes(asset_id,price,as_of,received_at,source,status,message) VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(asset_id) DO UPDATE SET price=excluded.price,as_of=excluded.as_of,received_at=excluded.received_at,source=excluded.source,status=excluded.status,message=excluded.message
    WHERE asset_quotes.as_of<=excluded.as_of`,[q.assetId,q.price,q.asOf,q.receivedAt,q.source,q.status,q.message]);
}
export async function quoteFor(asset){
  if(!asset.active)return{assetId:asset.id,price:null,currency:asset.currency,status:'unavailable',message:'Activo retirado del catálogo del proveedor.'};
  const q=await readQuote(asset);await persistQuote(q);return q;
}
marketRouter.get('/quotes',async(req,res)=>res.json(await Promise.all((await assetsForQuery(req.query)).map(quoteFor))));
marketRouter.get('/quotes/stream',async(req,res)=>{
  const assets=await assetsForQuery(req.query);
  res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();res.write('retry: 10000\n\n');
  let closed=false,socket,refreshTimer,flushTimer;const latest=new Map(),seen=new Map();
  const send=q=>{if(!closed&&!res.destroyed)res.write(`data: ${JSON.stringify(q)}\n\n`);};
  const safeQuote=async asset=>{try{const q=await quoteFor(asset);if(!seen.has(asset.id))send(q);}catch{send({assetId:asset.id,status:'unavailable',price:null,message:'No se pudo consultar la cotización.'});}};
  const heartbeat=setInterval(()=>{if(!closed)res.write(': keepalive\n\n');},15000);
  const clean=()=>{if(closed)return;closed=true;clearInterval(heartbeat);clearInterval(refreshTimer);clearInterval(flushTimer);socket?.close();};
  res.on('close',clean);
  for(const asset of assets)void safeQuote(asset);
  const crypto=assets.filter(a=>a.provider==='binance'&&a.active);
  if(crypto.length){
    const lookup=new Map(crypto.map(a=>[a.providerSymbol,a]));
    const streams=crypto.map(a=>`${a.providerSymbol.toLowerCase()}@trade`).join('/');
    socket=new WebSocket(`wss://data-stream.binance.vision:443/stream?streams=${streams}`);
    socket.addEventListener('message',event=>{
      try{const data=JSON.parse(event.data).data,asset=lookup.get(data?.s);if(!asset)return;const q=normalizeTrade(asset,data);if((seen.get(asset.id)||0)>data.T)return;seen.set(asset.id,data.T);latest.set(asset.id,q);}catch{/* Ignore malformed provider events. */}
    });
    const disconnected=()=>{if(closed)return;crypto.forEach(a=>send({assetId:a.id,status:'disconnected',price:null,message:'Directo desconectado. Reconectando…'}));clean();res.end();};
    socket.addEventListener('close',disconnected);socket.addEventListener('error',disconnected);
    let flushing=false;
    flushTimer=setInterval(async()=>{if(flushing||closed)return;flushing=true;const batch=[...latest.values()];latest.clear();try{for(const q of batch){send(q);await persistQuote(q);}}catch{/* The UI still receives the live quote; keep database failure isolated. */}finally{flushing=false;}},1000);
  }
  refreshTimer=setInterval(()=>assets.filter(a=>a.provider!=='binance').forEach(a=>void safeQuote(a)),60000);
});
