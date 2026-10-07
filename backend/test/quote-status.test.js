import test from 'node:test';
import assert from 'node:assert/strict';
import { quoteUsable,quoteLabel } from '../../frontend/src/use-quotes.js';
test('stale, cached and disconnected quotes are excluded from portfolio totals',()=>{
 const now=Date.now(),base={price:100,status:'live',receivedAt:new Date(now).toISOString()};
 assert.equal(quoteUsable(base,now),true);
 for(const status of ['cached','needs_key','disconnected','unavailable'])assert.equal(quoteUsable({...base,status},now),false);
 assert.equal(quoteUsable(base,now+90001),false);
 assert.match(quoteLabel(base,now+90001),/antigua/);
 assert.equal(quoteUsable({...base,price:NaN},now),false);
});
test('a recently retrieved market close remains an explicitly closed quote',()=>{
 assert.equal(quoteUsable({price:123,status:'closed',asOf:'2020-01-01T00:00:00Z',receivedAt:new Date().toISOString()}),true);
});

test('Twelve cached quotes stay usable until their scheduled refresh plus grace',()=>{
 const now=Date.now(),base={price:100,source:'Twelve Data',status:'snapshot',receivedAt:new Date(now).toISOString()};
 assert.equal(quoteUsable(base,now+300000),true);
 assert.equal(quoteUsable(base,now+390000),false);
 assert.equal(quoteUsable({...base,status:'closed'},now+1800000),true);
 assert.equal(quoteUsable({...base,status:'closed'},now+1890000),false);
});
