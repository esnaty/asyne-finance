import test from 'node:test';
import assert from 'node:assert/strict';
import { positionSchema } from '../src/domain.js';
import { positionOutcome } from '../../frontend/src/position-outcome.js';
const base={symbol:'TEST',quantity:10,averagePrice:100,currentPrice:null,currency:'USD',strategy:'long_term',stopLoss:90,exits:[{quantity:2,targetPrice:120},{quantity:3,targetPrice:150}]};
test('partial exits allocate capital once and leave the rest unvalued at target',()=>{
  const p=positionSchema.parse(base),r=positionOutcome(p,'quantity');
  assert.equal(r.amount,1000);assert.equal(r.allocated,5);assert.equal(r.remaining,5);
  assert.equal(r.profit,190);assert.equal(r.loss,100);assert.equal(r.ratio,null);
});
test('full allocation calculates weighted profit and risk ratio',()=>{
  const r=positionOutcome({...base,exits:[{quantity:4,targetPrice:120},{quantity:6,targetPrice:150}]},'quantity');
  assert.equal(r.remaining,0);assert.equal(r.profit,380);assert.equal(r.ratio,3.8);
});
test('reject overselling, invalid levels and mixing full and partial targets',()=>{
  for(const p of [{...base,quantity:4},{...base,targetPrice:130},{...base,exits:[{quantity:0,targetPrice:120}]},{...base,exits:[{quantity:1,targetPrice:100}]}])assert.equal(positionSchema.safeParse(p).success,false);
});
test('decimal allocation accepts an exact fractional position',()=>{
  const p={...base,quantity:.3,exits:[{quantity:.1,targetPrice:120},{quantity:.2,targetPrice:130}]};
  assert.equal(positionSchema.safeParse(p).success,true);
  assert.ok(positionOutcome(p,'quantity').profit!==null);
});
