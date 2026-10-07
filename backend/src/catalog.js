import { randomUUID } from 'node:crypto';
import { pool } from './db.js';
import { fetchJson,binanceAssets,twelveAssets } from './market-data.js';
export const assetColumns=`id,symbol,name,kind,currency,exchange,provider,provider_symbol AS "providerSymbol",mic,active`;
let syncing;
export function syncCatalog(){
  if(syncing)return syncing;
  syncing=(async()=>{
    const sources=[
      {name:'Cripto',provider:'binance',kind:'crypto',url:'https://data-api.binance.vision/api/v3/exchangeInfo',parse:binanceAssets},
      {name:'Acciones',provider:'twelve',kind:'stock',url:'https://api.twelvedata.com/stocks?country=United%20States',parse:d=>twelveAssets(d,'stock')},
      {name:'ETF',provider:'twelve',kind:'etf',url:'https://api.twelvedata.com/etf',parse:d=>twelveAssets(d,'etf')}
    ];
    const results=[];
    for(const source of sources){
      try{
        const values=source.parse(await fetchJson(source.url));
        if(!values.length)throw new Error('No hay activos compatibles.');
        const unique=[...new Map(values.map(v=>[`${v.providerSymbol}|${v.mic}|${v.exchange}|${v.currency}`,v])).values()].map(v=>({...v,id:randomUUID()}));
        const client=await pool.connect();
        try{
          await client.query('BEGIN');
          await client.query('UPDATE assets SET active=false WHERE provider=$1 AND kind=$2',[source.provider,source.kind]);
          await client.query(`INSERT INTO assets(id,symbol,name,kind,currency,exchange,provider,provider_symbol,mic)
            SELECT id::uuid,symbol,name,kind,currency,exchange,provider,"providerSymbol",mic FROM json_to_recordset($1::json) AS x(id text,symbol text,name text,kind text,currency text,exchange text,provider text,"providerSymbol" text,mic text)
            ON CONFLICT(provider,provider_symbol,mic,exchange,currency) DO UPDATE SET name=excluded.name,active=true,updated_at=now()`,[JSON.stringify(unique)]);
          await client.query('COMMIT');
        }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
        results.push({source:source.name,count:unique.length,ok:true});
      }catch(e){results.push({source:source.name,ok:false,error:e.code?e.message:'No se pudo actualizar este catálogo. Se conserva la versión anterior.'});}
    }
    return results;
  })().finally(()=>{syncing=null;});return syncing;
}
