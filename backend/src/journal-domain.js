import { z } from 'zod';
import Decimal from 'decimal.js';
const positive=z.number().finite().positive().max(1e12);
const fee=z.number().finite().min(0).max(1e12).default(0);
const timestamp=z.iso.datetime();
const sources=z.array(z.object({title:z.string().min(1).max(200),url:z.url().refine(s=>s.startsWith('https://'),'Usa una fuente HTTPS.')})).min(1).max(12);
export const batchSchema=z.object({
  day:z.iso.date(),summary:z.string().min(20).max(6000),sources,
  ideas:z.array(z.object({assetId:z.uuid(),entry:positive,stop:positive,target:positive,
    rationale:z.string().min(30).max(4000),invalidation:z.string().min(10).max(2000),
    sourceAt:timestamp,expiresAt:timestamp,sources
  }).strict().refine(v=>v.stop<v.entry&&v.entry<v.target,'Los niveles deben cumplir stop < entrada < objetivo.')).max(3)
}).strict();
export const reportSchema=z.object({day:z.iso.date(),title:z.string().min(5).max(200),
  summary:z.string().min(20).max(12000),observations:z.array(z.string().min(1).max(2000)).max(20),
  suggestions:z.array(z.string().min(1).max(2000)).max(12),sources}).strict();
export const buySchema=z.object({requestKey:z.uuid(),amount:positive,price:positive,fee,executedAt:timestamp}).strict();
export const saleSchema=z.object({requestKey:z.uuid(),quantity:positive,price:positive,fee,executedAt:timestamp}).strict();
export function tradeResult(trade,sales=[],price=null){
  const quantity=new Decimal(trade.quantity),entry=new Decimal(trade.price),entryFee=new Decimal(trade.fee);
  const sold=sales.reduce((s,r)=>s.plus(r.quantity),new Decimal(0));
  const remaining=quantity.minus(sold);
  if(remaining.lt(0))throw new Error('Las ventas superan la cantidad comprada.');
  const realized=sales.reduce((s,r)=>s.plus(new Decimal(r.quantity).times(new Decimal(r.price).minus(entry))).minus(r.fee).minus(entryFee.times(r.quantity).div(quantity)),new Decimal(0));
  const unrealized=remaining.isZero()?new Decimal(0):Number.isFinite(price)&&price>=0?remaining.times(new Decimal(price).minus(entry)).minus(entryFee.times(remaining).div(quantity)):null;
  return {remaining:remaining.toNumber(),sold:sold.toNumber(),realized:realized.toNumber(),unrealized:unrealized?.toNumber()??null,closed:remaining.isZero(),cost:remaining.times(entry).plus(entryFee.times(remaining).div(quantity)).toNumber()};
}
export function madridDay(date=new Date()){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-');
}
