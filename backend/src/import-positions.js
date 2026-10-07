// Local CLI: node src/import-positions.js /path/to/reviewed-manifest.json
// The manifest is extracted and reviewed before invoking this command.
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pool,migrate } from './db.js';
import { positionSchema } from './domain.js';

try {
  const manifest=JSON.parse(await readFile(process.argv[2],'utf8'));
  if(!Array.isArray(manifest.items)||!manifest.items.length)throw new Error('Manifest vacío.');
  const items=manifest.items.map(item=>({...item,position:positionSchema.parse(item.position)}));
  if(items.some(i=>typeof i.key!=='string'||!i.key||!i.source?.range)||new Set(items.map(i=>i.key)).size!==items.length)throw new Error('Claves u origen inválidos.');
  await migrate();
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    let inserted=0;
    for(const item of items){
      const p=item.position;
      // Resolve only an explicit, reviewed identity. Similar tickers are not substitutes.
      let assetId=null;
      if(item.catalog){
        const matches=await client.query('SELECT id FROM assets WHERE symbol=$1 AND currency=$2 AND kind=$3 AND exchange=$4 AND active',[p.symbol,p.currency,item.catalog.kind,item.catalog.exchange]);
        if(matches.rowCount!==1)throw new Error(`Identidad ambigua: ${p.symbol}`);
        assetId=matches.rows[0].id;
      }
      const result=await client.query(`INSERT INTO positions(id,symbol,quantity,average_price,current_price,currency,strategy,amount,target_price,stop_loss,asset_id,exits,import_key,import_source)
        VALUES($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13::jsonb) ON CONFLICT(import_key) DO NOTHING`,
        [randomUUID(),p.symbol,p.quantity,p.averagePrice,p.currency,p.strategy,p.amount,p.targetPrice,p.stopLoss,assetId,JSON.stringify(p.exits),item.key,JSON.stringify({...item.source,sourceSha256:manifest.sourceSha256})]);
      inserted+=result.rowCount;
    }
    await client.query('COMMIT');
    console.log(JSON.stringify({inserted,skipped:items.length-inserted}));
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}finally{await pool.end();}
