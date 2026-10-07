import test from 'node:test';
import assert from 'node:assert/strict';
import { binanceAssets,twelveAssets,normalizeTrade,normalizeTwelve,createQuoteReader } from '../src/market-data.js';
const crypto={id:'crypto',provider:'binance',providerSymbol:'BTCUSDT',currency:'USDT'};
const stock={id:'stock',provider:'twelve',providerSymbol:'AAPL',currency:'USD',exchange:'NASDAQ',mic:'XNAS'};
test('catalog keeps only active supported spot pairs',()=>{
 const symbols=[{symbol:'BTCUSDT',baseAsset:'BTC',quoteAsset:'USDT',status:'TRADING',isSpotTradingAllowed:true},{symbol:'ETHBTC',baseAsset:'ETH',quoteAsset:'BTC',status:'TRADING',isSpotTradingAllowed:true},{symbol:'DEADUSDT',baseAsset:'DEAD',quoteAsset:'USDT',status:'BREAK',isSpotTradingAllowed:true}];
 assert.deepEqual(binanceAssets({symbols}).map(a=>a.providerSymbol),['BTCUSDT']);
});
test('equities keep their exact exchange, currency and MIC',()=>{
 const assets=twelveAssets({data:[{symbol:'AAPL',currency:'USD',exchange:'NASDAQ',mic_code:'XNAS',name:'Apple'},{symbol:'AAPL',currency:'EUR',exchange:'XETRA',mic_code:'XETR',name:'Apple'}]},'stock');
 assert.equal(assets.length,2);assert.equal(assets[1].mic,'XETR');
});
test('quotes reject mismatched symbols, currencies and invalid prices',()=>{
 assert.throws(()=>normalizeTrade(crypto,{s:'ETHUSDT',p:'12',T:Date.now()}));
 assert.throws(()=>normalizeTrade(crypto,{p:'NaN',T:Date.now()}));
 assert.throws(()=>normalizeTwelve(stock,{symbol:'AAPL',currency:'EUR',mic_code:'XNAS',close:'100',timestamp:Date.now()/1000}));
 assert.throws(()=>normalizeTwelve(stock,{symbol:'AAPL',currency:'USD',mic_code:'XETR',close:'100',timestamp:Date.now()/1000}));
});
test('closed market is not called a live quote',()=>{
 const q=normalizeTwelve(stock,{symbol:'AAPL',currency:'USD',mic_code:'XNAS',close:'100',timestamp:Date.now()/1000,is_market_open:false});
 assert.equal(q.status,'closed');assert.equal(q.price,100);
});
test('missing key does not call the provider',async()=>{
 const reader=createQuoteReader({key:()=>'',request:()=>{throw Error('must not call');}});
 assert.equal((await reader(stock)).status,'needs_key');
});
test('concurrent calls share one request and preserve the source time',async()=>{
 let calls=0;const time=Date.now()-1000;
 const reader=createQuoteReader({request:async()=>{calls++;return[{price:'123.45',time}];}});
 const [a,b]=await Promise.all([reader(crypto),reader(crypto)]);
 assert.equal(calls,1);assert.deepEqual(a,b);assert.equal(a.asOf,new Date(time).toISOString());
});
test('free tier rate limit is enforced before sending the eighth request',async()=>{
 let calls=0;const reader=createQuoteReader({key:()=> 'test-key',request:async()=>{calls++;return{symbol:'AAPL',currency:'USD',mic_code:'XNAS',close:'100',timestamp:Date.now()/1000};}});
 for(let i=0;i<7;i++)await reader({...stock,id:String(i)});
 assert.equal((await reader({...stock,id:'eighth'})).status,'rate_limited');assert.equal(calls,7);
});

test('stock polling reuses prices for five minutes, or thirty while closed',async()=>{
 for(const closed of [false,true]){
  let calls=0,time=Date.now();
  const reader=createQuoteReader({now:()=>time,key:()=> 'test-key',request:async()=>{calls++;return{symbol:'AAPL',currency:'USD',mic_code:'XNAS',close:'100',timestamp:Date.now()/1000,is_market_open:!closed};}});
  await reader(stock);time+=(closed?1800000:300000)-1;await reader(stock);assert.equal(calls,1);
  time+=1;await reader(stock);assert.equal(calls,2);
 }
});

