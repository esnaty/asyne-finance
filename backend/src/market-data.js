export class MarketError extends Error {
  constructor(code,message){super(message);this.code=code;}
}
export async function fetchJson(url){
  let response;
  try{response=await fetch(url,{signal:AbortSignal.timeout(10000)});}catch{throw new MarketError('unavailable','El proveedor no responde.');}
  if(response.status===429||response.status===418)throw new MarketError('rate_limited','Límite del proveedor alcanzado. Reintentaremos más tarde.');
  if(!response.ok)throw new MarketError('unavailable',`El proveedor respondió con HTTP ${response.status}.`);
  try{return await response.json();}catch{throw new MarketError('unavailable','Respuesta de mercado no válida.');}
}
export function binanceAssets(data){
  if(!Array.isArray(data.symbols)||!data.symbols.length)throw new MarketError('unavailable','Catálogo Binance vacío o no válido.');
  return data.symbols.filter(s=>s.status==='TRADING'&&s.isSpotTradingAllowed&&['USDT','EUR'].includes(s.quoteAsset)&&/^[A-Z0-9]+$/.test(s.symbol)&&s.baseAsset.length<=20).map(s=>({symbol:s.baseAsset,name:s.baseAsset,kind:'crypto',currency:s.quoteAsset,exchange:'Binance Spot',provider:'binance',providerSymbol:s.symbol,mic:''}));
}
export function twelveAssets(data,kind){
  if(!Array.isArray(data.data)||!data.data.length)throw new MarketError('unavailable','Catálogo de bolsa vacío o no válido.');
  return data.data.filter(s=>['USD','EUR'].includes(s.currency)&&s.exchange&&s.mic_code&&s.symbol?.length<=20&&/^[A-Za-z0-9./-]+$/.test(s.symbol)).map(s=>({symbol:s.symbol,name:s.name,kind,currency:s.currency,exchange:s.exchange,provider:'twelve',providerSymbol:s.symbol,mic:s.mic_code}));
}
export function normalizeTrade(asset,data){
  const price=Number(data.p??data.price),timestamp=Number(data.T??data.time);
  if(data.s&&data.s!==asset.providerSymbol)throw new MarketError('invalid_quote','La cotización corresponde a otro activo.');
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(timestamp)||timestamp<=0||timestamp>Date.now()+60000)throw new MarketError('invalid_quote','Precio o fecha no válidos.');
  return {assetId:asset.id,price,currency:asset.currency,source:'Binance',asOf:new Date(timestamp).toISOString(),receivedAt:new Date().toISOString(),status:'live',message:'Última operación · Binance Spot'};
}
export function normalizeTwelve(asset,data){
  if(data.status==='error')throw new MarketError(data.code===429?'rate_limited':'unavailable',data.code===429?'Límite de Twelve Data alcanzado.':'Este activo no está disponible con la clave o el plan configurado.');
  if(data.symbol!==asset.providerSymbol||data.currency!==asset.currency||(data.mic_code?data.mic_code!==asset.mic:data.exchange!==asset.exchange))throw new MarketError('invalid_quote','El proveedor devolvió otro mercado o moneda.');
  const price=Number(data.close),timestamp=Number(data.timestamp)*1000;
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(timestamp)||timestamp<=0||timestamp>Date.now()+60000)throw new MarketError('invalid_quote','Precio o fecha no válidos.');
  return {assetId:asset.id,price,currency:asset.currency,source:'Twelve Data',asOf:new Date(timestamp).toISOString(),receivedAt:new Date().toISOString(),status:data.is_market_open===false?'closed':'snapshot',message:data.is_market_open===false?'Mercado cerrado · última cotización':'Consulta cada 5 min · cobertura y retraso según el plan'};
}
// Shared across browser tabs: avoid duplicate requests and respect the free tier.
export function createQuoteReader({request=fetchJson,key=()=>process.env.TWELVE_DATA_API_KEY,now=()=>Date.now()}={}){
  const cache=new Map(),pending=new Map();let minute=[],day='',daily=0;
  return async function read(asset){
    const time=now(),cached=cache.get(asset.id);
    if(cached&&cached.until>time)return cached.value;
    if(pending.has(asset.id))return pending.get(asset.id);
    const work=(async()=>{
      try{
        let quote;
        if(asset.provider==='binance'){
          const data=await request(`https://data-api.binance.vision/api/v3/trades?symbol=${encodeURIComponent(asset.providerSymbol)}&limit=1`);
          if(!Array.isArray(data)||!data.length)throw new MarketError('unavailable','No hay operaciones disponibles.');
          quote=normalizeTrade(asset,data[0]);quote.status='snapshot';quote.message='Última operación · conectando al directo';
        }else{
          if(!key())throw new MarketError('needs_key','Configura la clave gratuita de Twelve Data para acciones y ETF.');
          const today=new Date(time).toISOString().slice(0,10);if(day!==today){day=today;daily=0;}
          minute=minute.filter(t=>t>time-60000);
          if(minute.length>=7||daily>=750)throw new MarketError('rate_limited','Presupuesto gratuito de consultas agotado.');
          minute.push(time);daily++;
          const params=new URLSearchParams({symbol:asset.providerSymbol,mic_code:asset.mic,apikey:key()});
          quote=normalizeTwelve(asset,await request(`https://api.twelvedata.com/quote?${params}`));
        }
        cache.set(asset.id,{value:quote,until:time+(asset.provider==='binance'?10000:quote.status==='closed'?1800000:300000)});return quote;
      }catch(e){
        const value={assetId:asset.id,price:null,currency:asset.currency,source:asset.provider==='binance'?'Binance':'Twelve Data',asOf:null,receivedAt:null,status:e.code||'unavailable',message:e instanceof MarketError?e.message:'Cotización no disponible.'};
        cache.set(asset.id,{value,until:time+60000});return value;
      }
    })();
    pending.set(asset.id,work);try{return await work;}finally{pending.delete(asset.id);}
  };
}
