import { fetchJson } from './market-data.js';
export function summarizeBars(bars){
  if(bars.length<50)throw new Error('Se necesitan al menos 50 velas cerradas.');
  for(let i=0;i<bars.length;i++){const b=bars[i];if(![b.open,b.high,b.low,b.close].every(n=>Number.isFinite(n)&&n>0)||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||(i&&b.time<=bars[i-1].time))throw new Error('Serie de velas no válida.');}
  const last=bars.at(-1),mean=n=>bars.slice(-n).reduce((s,b)=>s+b.close,0)/n;
  const trs=bars.slice(1).map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-bars[i].close),Math.abs(b.low-bars[i].close)));
  return {bars:bars.length,lastClose:last.close,lastClosedAt:new Date(last.time).toISOString(),sma20:mean(20),sma50:mean(50),atr14:trs.slice(-14).reduce((a,b)=>a+b,0)/14,support20:Math.min(...bars.slice(-20).map(b=>b.low)),resistance20:Math.max(...bars.slice(-20).map(b=>b.high))};
}
export async function researchAsset(asset){
  if(asset.provider!=='binance')return {asset,available:false,reason:'El análisis histórico de bolsa requiere una fuente verificable con fecha, mercado y moneda. Consulta fuentes públicas oficiales o tu proveedor; no inventes niveles.'};
  const url=`https://data-api.binance.vision/api/v3/klines?symbol=${encodeURIComponent(asset.providerSymbol)}&interval=4h&limit=100`;
  const raw=await fetchJson(url);if(!Array.isArray(raw))throw new Error('No se pudo leer la serie.');
  const bars=raw.filter(r=>Number(r[6])<Date.now()).map(r=>({time:Number(r[6]),open:Number(r[1]),high:Number(r[2]),low:Number(r[3]),close:Number(r[4]),volume:Number(r[5])}));
  const stats=summarizeBars(bars);
  if(Date.now()-new Date(stats.lastClosedAt).getTime()>8*3600000)throw new Error('Las velas no están actualizadas.');
  return {asset,available:true,timeframe:'4h',fetchedAt:new Date().toISOString(),source:url,stats,recentBars:bars.slice(-20),method:'Medias simples de 20 y 50 cierres, ATR simple de 14 rangos verdaderos, mínimo y máximo de 20 velas. Son indicadores descriptivos; no constituyen por sí solos una propuesta.'};
}
