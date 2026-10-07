import test from 'node:test';
import assert from 'node:assert/strict';
import { positionOutcome } from '../../frontend/src/position-outcome.js';
import { positionSchema } from '../src/domain.js';
const base={symbol:'BTC',amount:1000,averagePrice:100,targetPrice:120,stopLoss:90,currentPrice:null,currency:'USD',strategy:'swing'};
test('amount produces quantity, profit, loss, percentages and ratio',()=>{
  assert.deepEqual(positionOutcome(base),{quantity:10,amount:1000,profit:200,loss:100,profitPercent:20,lossPercent:10,ratio:2});
  assert.equal(positionSchema.parse(base).quantity,10);
});
test('partial fields hide only the unavailable result',()=>{
  const result=positionOutcome({...base,stopLoss:null});
  assert.equal(result.profit,200);assert.equal(result.loss,null);assert.equal(result.ratio,null);
  assert.equal(positionOutcome({...base,averagePrice:0}),null);
  assert.equal(positionOutcome({...base,amount:NaN}),null);
});
test('fractional quantities and quantity-based legacy positions',()=>{
  const p={...base,amount:undefined,quantity:.002,averagePrice:50000,targetPrice:60000,stopLoss:45000};
  assert.equal(positionOutcome(p,'quantity').profit,20);
  assert.equal(positionOutcome(p,'quantity').loss,10);
  assert.equal(positionSchema.parse(p).quantity,.002);
});
test('invalid levels and ambiguous size cannot be saved',()=>{
  for(const change of [{stopLoss:100},{stopLoss:0},{targetPrice:99},{amount:-1},{quantity:1},{amount:undefined}])assert.equal(positionSchema.safeParse({...base,...change}).success,false);
});
test('legacy positions without exit levels remain valid',()=>{
  const p=positionSchema.parse({symbol:'BTC',quantity:1,averagePrice:100,currentPrice:null,currency:'USD',strategy:'long_term'});
  assert.equal(p.targetPrice,null);assert.equal(p.stopLoss,null);assert.equal(p.amount,null);
});
