import { z } from 'zod';
import Decimal from 'decimal.js';
const positive=z.number().finite().positive().max(1e12);
const price=positive.min(1e-12);
export const positionSchema=z.object({
  assetId:z.uuid().nullable().optional(),
  symbol:z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9./-]+$/).transform(s=>s.toUpperCase()),
  quantity:positive.optional(), amount:positive.optional(), averagePrice:price,
  targetPrice:price.nullable().optional().default(null),
  exits:z.array(z.object({quantity:positive,targetPrice:price}).strict()).max(50).default([]),
  stopLoss:price.nullable().optional().default(null),
  currentPrice:z.number().finite().min(0).max(1e12).nullable(),
  currency:z.enum(['USD','EUR','USDT']), strategy:z.enum(['long_term','swing'])
}).strict().superRefine((v,ctx)=>{
  if((v.amount===undefined)===(v.quantity===undefined))ctx.addIssue({code:'custom',path:['amount'],message:'Introduce un monto o una cantidad, no ambos.'});
  if(v.targetPrice!==null&&v.targetPrice<=v.averagePrice)ctx.addIssue({code:'custom',path:['targetPrice'],message:'La salida objetivo debe superar la entrada.'});
  if(v.exits.length&&v.targetPrice!==null)ctx.addIssue({code:'custom',path:['exits'],message:'Utiliza salidas parciales o un objetivo único, no ambos.'});
  const units=v.quantity??(v.amount&&v.averagePrice?new Decimal(v.amount).div(v.averagePrice):null);
  const allocated=v.exits.reduce((sum,e)=>sum.plus(e.quantity),new Decimal(0));
  if(units!==null&&allocated.gt(units))ctx.addIssue({code:'custom',path:['exits'],message:'Las salidas superan la cantidad de la posición.'});
  v.exits.forEach((e,i)=>{if(e.targetPrice<=v.averagePrice)ctx.addIssue({code:'custom',path:['exits',i,'targetPrice'],message:'La salida objetivo debe superar la entrada.'});});
  if(v.stopLoss!==null&&v.stopLoss>=v.averagePrice)ctx.addIssue({code:'custom',path:['stopLoss'],message:'El stop-loss debe ser inferior a la entrada.'});
}).transform(v=>({...v,quantity:v.amount===undefined?v.quantity:new Decimal(v.amount).div(v.averagePrice).toNumber(),amount:v.amount??null}));
export const planSchema=z.object({symbol:z.string().trim().min(1).max(20).regex(/^[A-Za-z0-9./-]+$/).transform(s=>s.toUpperCase()),market:z.string().trim().min(1).max(80),currency:z.enum(['USD','EUR','USDT']),entry:price,stop:price,target:price,notes:z.string().trim().max(2000).default(''),expiresAt:z.iso.datetime().nullable(),status:z.enum(['draft','watching','invalidated','archived']).default('draft')}).strict().refine(v=>v.stop<v.entry&&v.target>v.entry,{message:'El stop debe ser inferior a la entrada y el objetivo superior.',path:['stop']});
export const calculationSchema=z.object({capital:positive,risk:z.number().finite().positive().max(100),entry:price,stop:price,target:price,fee:z.number().finite().min(0).max(10)}).strict().refine(v=>v.stop<v.entry&&v.target>v.entry,{message:'El stop debe ser inferior a la entrada y el objetivo superior.',path:['stop']});
export function calculatePosition(input){const v=calculationSchema.parse(input);const d=x=>new Decimal(x),f=d(v.fee).div(100);const loss=d(v.entry).minus(v.stop).plus(f.times(d(v.entry).plus(v.stop)));const profit=d(v.target).minus(v.entry).minus(f.times(d(v.entry).plus(v.target)));const quantity=Decimal.min(d(v.capital).times(v.risk).div(100).div(loss),d(v.capital).div(d(v.entry).times(f.plus(1))));return Object.fromEntries(Object.entries({quantity,investment:quantity.times(v.entry),cost:quantity.times(v.entry).times(f.plus(1)),loss:quantity.times(loss),profit:quantity.times(profit),ratio:profit.div(loss)}).map(([k,n])=>[k,n.toSignificantDigits(15).toNumber()]));}
