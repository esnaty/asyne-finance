import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { pool } from './db.js';
import { batchSchema,reportSchema,buySchema,saleSchema,tradeResult,madridDay } from './journal-domain.js';
import { quoteFor } from './market-routes.js';
import { assetColumns } from './catalog.js';
import { researchAsset } from './research.js';
export const journalRouter=Router();
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const uuid=z.uuid();
const tradeColumns=`id,idea_id AS "ideaId",quantity::float8 AS quantity,price::float8 AS price,fee::float8 AS fee,executed_at AS "executedAt",created_at AS "createdAt",request_key AS "requestKey"`;
const saleColumns=`id,trade_id AS "tradeId",quantity::float8 AS quantity,price::float8 AS price,fee::float8 AS fee,executed_at AS "executedAt",request_key AS "requestKey"`;
async function transaction(work){const c=await pool.connect();try{await c.query('BEGIN');const result=await work(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
function quotePrice(q){return q&&['live','snapshot','closed'].includes(q.status)&&Date.now()-new Date(q.receivedAt).getTime()<(q.source==='Twelve Data'?(q.status==='closed'?1890000:390000):90000)?Number(q.price):null;}
export async function journalContext(){
  const batches=(await pool.query('SELECT id,day::text,summary,sources,created_at AS "createdAt" FROM daily_batches ORDER BY day DESC LIMIT 30')).rows;
  // Include all executed ideas even after their proposal batch leaves the recent list.
  const ideas=(await pool.query(`SELECT i.id,i.batch_id AS "batchId",i.asset_id AS "assetId",a.symbol,a.name,a.currency,a.exchange,a.kind,
    i.entry::float8 AS entry,i.stop::float8 AS stop,i.target::float8 AS target,i.rationale,i.invalidation,i.source_at AS "sourceAt",i.expires_at AS "expiresAt",i.sources,i.decision,b.day::text,b.created_at AS "createdAt"
    FROM swing_ideas i JOIN assets a ON a.id=i.asset_id JOIN daily_batches b ON b.id=i.batch_id
    WHERE i.batch_id=ANY($1::uuid[]) OR EXISTS(SELECT 1 FROM swing_trades t WHERE t.idea_id=i.id) ORDER BY b.day DESC,a.symbol`,[batches.map(b=>b.id)])).rows;
  const trades=(await pool.query(`SELECT ${tradeColumns} FROM swing_trades ORDER BY executed_at DESC`)).rows;
  const sales=(await pool.query(`SELECT ${saleColumns} FROM swing_sales ORDER BY executed_at`)).rows;
  const positions=(await pool.query(`SELECT id,symbol,strategy,currency,quantity::float8 AS quantity,average_price::float8 AS "averagePrice",asset_id AS "assetId",stop_loss::float8 AS "stopLoss",exits FROM positions`)).rows;
  const quotes=(await pool.query(`SELECT asset_id AS "assetId",price::float8 AS price,as_of AS "asOf",received_at AS "receivedAt",status,source FROM asset_quotes WHERE asset_id=ANY($1::uuid[])`,[[...new Set([...positions.map(p=>p.assetId),...ideas.map(i=>i.assetId)].filter(Boolean))]])).rows;
  const qm=new Map(quotes.map(q=>[q.assetId,q]));
  const enriched=trades.map(t=>{const idea=ideas.find(i=>i.id===t.ideaId);const ownSales=sales.filter(s=>s.tradeId===t.id);return {...t,...tradeResult(t,ownSales,quotePrice(qm.get(idea.assetId))),idea,sales:ownSales,quote:qm.get(idea.assetId)??null};});
  const groups=new Map();
  function group(strategy,currency){const k=`${strategy}:${currency}`;if(!groups.has(k))groups.set(k,{strategy,currency,cost:0,unrealized:0,realized:strategy==='swing'?0:null,missing:0,valued:0,open:0,closed:0,wins:0,losses:0,fees:0});return groups.get(k);}
  for(const p of positions){const g=group(p.strategy,p.currency),price=quotePrice(qm.get(p.assetId));g.cost+=p.quantity*p.averagePrice;g.open++;if(price===null)g.missing++;else{g.valued++;g.unrealized+=p.quantity*(price-p.averagePrice);}}
  for(const t of enriched){const g=group('swing',t.idea.currency);g.realized+=t.realized;g.fees+=t.fee+t.sales.reduce((n,s)=>n+s.fee,0);g.cost+=t.cost;if(t.closed){g.closed++;if(t.realized>0)g.wins++;if(t.realized<0)g.losses++;}else{g.open++;if(t.unrealized===null)g.missing++;else{g.valued++;g.unrealized+=t.unrealized;}}}
  const stats=[...groups.values()].map(g=>({...g,unrealized:g.valued||!g.open?g.unrealized:null,winRate:g.closed?g.wins/g.closed*100:null,total:g.realized===null||g.missing?null:g.realized+g.unrealized}));
  return {asOf:new Date().toISOString(),day:madridDay(),batches,ideas,trades:enriched,positions,quotes,stats};
}
journalRouter.get('/journal',async(_req,res)=>res.json(await journalContext()));
journalRouter.get('/journal/research/:id',async(req,res)=>{
  const asset=(await pool.query(`SELECT ${assetColumns} FROM assets WHERE id=$1 AND active`,[uuid.parse(req.params.id)])).rows[0];
  if(!asset)throw fail('Activo no encontrado.',404);res.json(await researchAsset(asset));
});
journalRouter.post('/journal/refresh-quotes',async(_req,res)=>{
  const assets=(await pool.query(`SELECT ${assetColumns} FROM assets WHERE active AND id IN (SELECT asset_id FROM positions UNION SELECT i.asset_id FROM swing_ideas i JOIN swing_trades t ON t.idea_id=i.id) LIMIT 50`)).rows;
  const result=[];for(const a of assets)result.push(await quoteFor(a));res.json(result);
});
journalRouter.post('/journal/batches',async(req,res)=>{
  const data=batchSchema.parse(req.body),now=Date.now();
  if(data.day!==madridDay())throw fail('Solo se puede publicar el análisis del día actual de Madrid.');
  if(new Set(data.ideas.map(i=>i.assetId)).size!==data.ideas.length)throw fail('No repitas activos en un mismo día.');
  const result=await transaction(async c=>{
    const id=randomUUID();
    const inserted=await c.query('INSERT INTO daily_batches(id,day,summary,sources) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(day) DO NOTHING RETURNING id',[id,data.day,data.summary,JSON.stringify(data.sources)]);
    if(!inserted.rowCount)return {created:false,id:(await c.query('SELECT id FROM daily_batches WHERE day=$1',[data.day])).rows[0].id};
    for(const idea of data.ideas){
      const a=(await c.query('SELECT active FROM assets WHERE id=$1',[idea.assetId])).rows[0];
      if(!a?.active)throw fail('Activo no disponible.');
      if(new Date(idea.sourceAt).getTime()>now+60000||now-new Date(idea.sourceAt).getTime()>96*3600000)throw fail('La fecha de mercado es futura o tiene más de 96 horas.');
      if(new Date(idea.expiresAt).getTime()<=now||new Date(idea.expiresAt).getTime()>now+48*3600000)throw fail('La propuesta debe caducar dentro de las próximas 48 horas.');
      await c.query(`INSERT INTO swing_ideas(id,batch_id,asset_id,entry,stop,target,rationale,invalidation,source_at,expires_at,sources) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,[randomUUID(),id,idea.assetId,idea.entry,idea.stop,idea.target,idea.rationale,idea.invalidation,idea.sourceAt,idea.expiresAt,JSON.stringify(idea.sources)]);
    }return {created:true,id};
  });res.status(result.created?201:200).json(result);
});
journalRouter.put('/journal/ideas/:id/decision',async(req,res)=>{
  const id=uuid.parse(req.params.id),{decision}=z.object({decision:z.enum(['pending','skipped'])}).strict().parse(req.body);
  await transaction(async c=>{const row=await c.query('SELECT id FROM swing_ideas WHERE id=$1 FOR UPDATE',[id]);if(!row.rowCount)throw fail('Propuesta no encontrada.',404);
    if((await c.query('SELECT 1 FROM swing_trades WHERE idea_id=$1',[id])).rowCount)throw fail('Una compra registrada no puede cambiarse a no ejecutada.');
    await c.query('UPDATE swing_ideas SET decision=$2 WHERE id=$1',[id,decision]);});res.json({decision});
});
journalRouter.post('/journal/ideas/:id/buy',async(req,res)=>{
  const id=uuid.parse(req.params.id),v=buySchema.parse(req.body);
  const result=await transaction(async c=>{
    const idea=(await c.query('SELECT i.*,b.created_at FROM swing_ideas i JOIN daily_batches b ON b.id=i.batch_id WHERE i.id=$1 FOR UPDATE OF i',[id])).rows[0];if(!idea)throw fail('Propuesta no encontrada.',404);
    const existing=(await c.query(`SELECT ${tradeColumns} FROM swing_trades WHERE idea_id=$1`,[id])).rows[0];
    if(existing){if(existing.requestKey===v.requestKey)return existing;throw fail('Esta propuesta ya tiene una compra registrada.');}
    const at=new Date(v.executedAt).getTime();if(at>Date.now()+60000||at<new Date(idea.created_at).getTime()-60000||at>new Date(idea.expires_at).getTime())throw fail('La compra debe haberse ejecutado durante la vigencia de la propuesta y no en el futuro.');
    // Keep a decimal quantity that survives the JSON number round-trip used by the UI.
    const quantity=new Decimal(v.amount).div(v.price).toSignificantDigits(15,Decimal.ROUND_DOWN).toString();
    const trade=(await c.query(`INSERT INTO swing_trades(id,idea_id,quantity,price,fee,executed_at,request_key) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${tradeColumns}`,[randomUUID(),id,quantity,v.price,v.fee,v.executedAt,v.requestKey])).rows[0];return trade;
  });res.status(201).json(result);
});
journalRouter.post('/journal/trades/:id/sell',async(req,res)=>{
  const id=uuid.parse(req.params.id),v=saleSchema.parse(req.body);
  const result=await transaction(async c=>{
    const t=(await c.query('SELECT * FROM swing_trades WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!t)throw fail('Compra no encontrada.',404);
    const prior=(await c.query(`SELECT ${saleColumns} FROM swing_sales WHERE request_key=$1`,[v.requestKey])).rows[0];if(prior){if(prior.tradeId!==id)throw fail('Identificador de venta ya usado.');return prior;}
    const sold=(await c.query('SELECT COALESCE(sum(quantity),0)::text AS quantity FROM swing_sales WHERE trade_id=$1',[id])).rows[0].quantity;
    if(new Decimal(sold).plus(v.quantity).gt(t.quantity))throw fail('No puedes vender más unidades de las que quedan.');
    const at=new Date(v.executedAt).getTime();if(at>Date.now()+60000||at<new Date(t.executed_at).getTime())throw fail('La venta debe ser posterior a la compra y no futura.');
    return (await c.query(`INSERT INTO swing_sales(id,trade_id,quantity,price,fee,executed_at,request_key) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${saleColumns}`,[randomUUID(),id,v.quantity,v.price,v.fee,v.executedAt,v.requestKey])).rows[0];
  });res.status(201).json(result);
});
journalRouter.get('/reports',async(_req,res)=>res.json((await pool.query('SELECT id,day::text,title,summary,observations,suggestions,sources,snapshot,created_at AS "createdAt" FROM daily_reports ORDER BY day DESC,created_at DESC LIMIT 90')).rows));
journalRouter.post('/reports',async(req,res)=>{
  const r=reportSchema.parse(req.body);if(r.day!==madridDay())throw fail('El informe debe corresponder al día actual de Madrid.');
  const snapshot=await journalContext();
  const saved=await pool.query(`INSERT INTO daily_reports(id,day,title,summary,observations,suggestions,sources,snapshot) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb) ON CONFLICT(day) DO NOTHING RETURNING id`,[randomUUID(),r.day,r.title,r.summary,JSON.stringify(r.observations),JSON.stringify(r.suggestions),JSON.stringify(r.sources),JSON.stringify(snapshot)]);
  res.status(saved.rowCount?201:200).json({created:!!saved.rowCount,id:saved.rows[0]?.id??(await pool.query('SELECT id FROM daily_reports WHERE day=$1',[r.day])).rows[0].id});
});
