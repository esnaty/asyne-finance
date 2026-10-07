// Tools for the two local Codex daily automations. No broker credentials or trading calls.
import { readFile } from 'node:fs/promises';
import { nyseSchedule } from './nyse-calendar.js';
const base='http://127.0.0.1:3000/api';
async function call(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(120000)});const result=await r.json();if(!r.ok)throw new Error(JSON.stringify(result));return result;}
const [command,path]=process.argv.slice(2);
if(command==='schedule-check'){
  console.log(JSON.stringify(nyseSchedule(path),null,2));
}else if(command==='context'){
  await call('/journal/refresh-quotes',{});
  console.log(JSON.stringify({context:await call('/journal'),reports:await call('/reports'),providers:await call('/market/status')},null,2));
}else if(command==='catalog'){
  if(!path)throw new Error('Indica el símbolo o nombre.');console.log(JSON.stringify(await call(`/assets?q=${encodeURIComponent(path)}`),null,2));
}else if(command==='research'){
  if(!path)throw new Error('Indica el UUID del activo del catálogo.');console.log(JSON.stringify(await call(`/journal/research/${encodeURIComponent(path)}`),null,2));
}else if(['publish-analysis','publish-report'].includes(command)){
  if(!path)throw new Error('Indica un JSON revisado.');const payload=JSON.parse(await readFile(path,'utf8'));
  console.log(JSON.stringify(await call(command==='publish-analysis'?'/journal/batches':'/reports',payload),null,2));
}else throw new Error('Uso: daily-task.js schedule-check analysis|report | context | catalog SYMBOL | research UUID | publish-analysis FILE | publish-report FILE');
