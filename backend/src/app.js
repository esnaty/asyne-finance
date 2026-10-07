import { journalRouter } from './journal-routes.js';
import express from 'express';

import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { pool } from './db.js';

import { marketRouter } from './market-routes.js';

import { positionSchema,planSchema,calculatePosition } from './domain.js';

export const app=express();

app.disable('x-powered-by');app.use(express.json({limit:'128kb'}));

app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});

app.get('/api/health',async(_req,res)=>{await pool.query('SELECT 1');res.json({status:'ok',database:'postgresql'});});

const positionColumns=`exits,import_source AS "importSource",asset_id AS "assetId",id,symbol,quantity::float8 AS quantity,average_price::float8 AS "averagePrice",current_price::float8 AS "currentPrice",currency,strategy,amount::float8 AS amount,target_price::float8 AS "targetPrice",stop_loss::float8 AS "stopLoss",updated_at AS "updatedAt"`;

const planColumns=`id,symbol,market,currency,entry::float8 AS entry,stop::float8 AS stop,target::float8 AS target,notes,expires_at AS "expiresAt",status,updated_at AS "updatedAt"`;

const idSchema=z.uuid();

app.use('/api',marketRouter);app.use('/api',journalRouter);

async function parsePosition(body){

 const p=positionSchema.parse(body);

 if(p.assetId){

   const asset=(await pool.query('SELECT * FROM assets WHERE id=$1',[p.assetId])).rows[0];

   if(!asset||!asset.active)throw Object.assign(new Error('Selecciona un activo disponible en el catálogo.'),{status:400});

   if(p.currency!==asset.currency||p.symbol!==asset.symbol.toUpperCase())throw Object.assign(new Error('El activo y su moneda no coinciden con el catálogo.'),{status:400});

   p.currentPrice=null;

 }

 return p;

}

app.get('/api/positions',async(_req,res)=>{

 const rows=(await pool.query(`SELECT ${positionColumns} FROM positions ORDER BY updated_at DESC`)).rows;

 const assets=(await pool.query(`SELECT a.id,a.name,a.symbol,a.currency,a.exchange,a.kind,a.active,q.price::float8 AS price,q.as_of AS "asOf",q.received_at AS "receivedAt",q.source FROM assets a LEFT JOIN asset_quotes q ON q.asset_id=a.id WHERE a.id=ANY($1::uuid[])`,[rows.map(p=>p.assetId).filter(Boolean)])).rows;

 const map=new Map(assets.map(a=>[a.id,a]));

 res.json(rows.map(p=>{const asset=map.get(p.assetId);return {...p,asset:asset??null,currentPrice:p.assetId?asset?.price??null:p.currentPrice,quote:p.assetId?{assetId:p.assetId,price:asset?.price??null,currency:p.currency,asOf:asset?.asOf??null,receivedAt:asset?.receivedAt??null,source:asset?.source??null,status:'cached',message:'Último dato guardado · pendiente de actualización'}:null};}));

});

app.post('/api/positions',async(req,res)=>{const p=await parsePosition(req.body);const result=await pool.query(`INSERT INTO positions(id,symbol,quantity,average_price,current_price,currency,strategy,amount,target_price,stop_loss,asset_id,exits) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb) RETURNING ${positionColumns}`,[randomUUID(),p.symbol,p.quantity,p.averagePrice,p.currentPrice,p.currency,p.strategy,p.amount,p.targetPrice,p.stopLoss,p.assetId??null,JSON.stringify(p.exits)]);res.status(201).json(result.rows[0]);});

app.put('/api/positions/:id',async(req,res)=>{const id=idSchema.parse(req.params.id),p=await parsePosition(req.body);const result=await pool.query(`UPDATE positions SET symbol=$2,quantity=$3,average_price=$4,current_price=$5,currency=$6,strategy=$7,amount=$8,target_price=$9,stop_loss=$10,asset_id=$11,exits=$12::jsonb,updated_at=now() WHERE id=$1 RETURNING ${positionColumns}`,[id,p.symbol,p.quantity,p.averagePrice,p.currentPrice,p.currency,p.strategy,p.amount,p.targetPrice,p.stopLoss,p.assetId??null,JSON.stringify(p.exits)]);if(!result.rowCount)return res.status(404).json({error:'Posición no encontrada.'});res.json(result.rows[0]);});

app.delete('/api/positions/:id',async(req,res)=>{const result=await pool.query('DELETE FROM positions WHERE id=$1',[idSchema.parse(req.params.id)]);if(!result.rowCount)return res.status(404).json({error:'Posición no encontrada.'});res.status(204).end();});

app.get('/api/plans',async(_req,res)=>res.json((await pool.query(`SELECT ${planColumns} FROM plans ORDER BY updated_at DESC`)).rows));

app.post('/api/plans',async(req,res)=>{const p=planSchema.parse(req.body);const result=await pool.query(`INSERT INTO plans(id,symbol,market,currency,entry,stop,target,notes,expires_at,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${planColumns}`,[randomUUID(),p.symbol,p.market,p.currency,p.entry,p.stop,p.target,p.notes,p.expiresAt,p.status]);res.status(201).json(result.rows[0]);});

app.put('/api/plans/:id',async(req,res)=>{const p=planSchema.parse(req.body);const result=await pool.query(`UPDATE plans SET symbol=$2,market=$3,currency=$4,entry=$5,stop=$6,target=$7,notes=$8,expires_at=$9,status=$10,updated_at=now() WHERE id=$1 RETURNING ${planColumns}`,[idSchema.parse(req.params.id),p.symbol,p.market,p.currency,p.entry,p.stop,p.target,p.notes,p.expiresAt,p.status]);if(!result.rowCount)return res.status(404).json({error:'Plan no encontrado.'});res.json(result.rows[0]);});

app.delete('/api/plans/:id',async(req,res)=>{const result=await pool.query('DELETE FROM plans WHERE id=$1',[idSchema.parse(req.params.id)]);if(!result.rowCount)return res.status(404).json({error:'Plan no encontrado.'});res.status(204).end();});

app.post('/api/calculate', (req,res)=>res.json(calculatePosition(req.body)));

app.use('/api',(_req,res)=>res.status(404).json({error:'Ruta no encontrada.'}));

app.use((error,_req,res,_next)=>{if([400,404,409].includes(error.status)&&!error.type)return res.status(error.status).json({error:error.message});if(error instanceof z.ZodError)return res.status(400).json({error:'Revisa los campos.',details:error.issues.map(i=>`${i.path.join('.')}: ${i.message}`)});if(error.type==='entity.parse.failed')return res.status(400).json({error:'JSON no válido.'});if(error.type==='entity.too.large')return res.status(413).json({error:'Solicitud demasiado grande.'});console.error(error.message);res.status(500).json({error:'No se pudo completar la operación. Inténtalo de nuevo.'});});





