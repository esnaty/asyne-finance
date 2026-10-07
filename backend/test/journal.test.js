import test from 'node:test';
import assert from 'node:assert/strict';
import { tradeResult,batchSchema,buySchema,madridDay } from '../src/journal-domain.js';
import { summarizeBars } from '../src/research.js';
test('partial sale allocates entry fees and leaves remaining unrealized cost',()=>{
 const r=tradeResult({quantity:10,price:100,fee:10},[{quantity:4,price:120,fee:2}],110);
 assert.deepEqual(r,{remaining:6,sold:4,realized:74,unrealized:54,closed:false,cost:606});
});
test('full exit and missing quote never manufacture an unrealized gain',()=>{
 const t={quantity:10,price:100,fee:10};
 assert.equal(tradeResult(t,[],null).unrealized,null);
 const r=tradeResult(t,[{quantity:10,price:90,fee:5}],null);
 assert.equal(r.closed,true);assert.equal(r.realized,-115);assert.equal(r.unrealized,0);
 assert.throws(()=>tradeResult(t,[{quantity:11,price:110,fee:0}]));
});
test('decimal partial exits close exactly without double counting',()=>{
 const r=tradeResult({quantity:.3,price:100,fee:0},[{quantity:.1,price:120,fee:0},{quantity:.2,price:130,fee:0}]);
 assert.equal(r.remaining,0);assert.equal(r.realized,8);
});
test('Madrid day follows local midnight including daylight saving',()=>{
 assert.equal(madridDay(new Date('2026-09-27T22:30:00Z')),'2026-09-28');
 assert.equal(madridDay(new Date('2026-12-27T23:30:00Z')),'2026-12-28');
});
test('proposals are limited and execution requires actual size and price',()=>{
 assert.equal(batchSchema.safeParse({day:'2026-09-27',summary:'Sin oportunidades justificadas hoy.',sources:[{title:'Fuente',url:'https://example.org'}],ideas:[]}).success,true);
 assert.equal(buySchema.safeParse({amount:100,price:0}).success,false);
});
test('research rejects short histories and reports support and resistance',()=>{
 assert.throws(()=>summarizeBars([]));
 const bars=Array.from({length:60},(_,i)=>({time:1000*(i+1),open:100,high:110,low:90,close:100}));
 const r=summarizeBars(bars);assert.equal(r.sma20,100);assert.equal(r.sma50,100);assert.equal(r.atr14,20);assert.equal(r.support20,90);assert.equal(r.resistance20,110);
});
