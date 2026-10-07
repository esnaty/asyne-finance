import test from 'node:test';
import assert from 'node:assert/strict';
import { nyseSchedule } from '../src/nyse-calendar.js';
const at=(task,time)=>nyseSchedule(task,new Date(time));
test('only weekdays with an NYSE session are eligible',()=>{
  assert.equal(at('analysis','2026-09-27T13:30:00Z').due,false);
  assert.equal(at('analysis','2026-11-26T14:30:00Z').due,false);
  assert.equal(at('analysis','2026-04-03T13:30:00Z').due,false);
  assert.equal(at('analysis','2026-07-03T13:30:00Z').due,false);
  assert.equal(at('analysis','2026-09-28T13:30:00Z').due,true);
});
test('NY time follows US DST even when Madrid has not changed yet',()=>{
  assert.equal(at('analysis','2026-03-09T13:30:00Z').due,true);
  assert.equal(at('analysis','2026-03-09T14:30:00Z').due,false);
  assert.equal(at('analysis','2026-11-02T14:30:00Z').due,true);
  assert.equal(at('report','2026-10-26T20:00:00Z').due,true);
});
test('early-close reports run at 13:00 New York, not 16:00',()=>{
  const result=at('report','2026-11-27T18:00:00Z');assert.equal(result.due,true);assert.equal(result.close,'13:00');
  assert.equal(at('report','2026-11-27T21:00:00Z').due,false);
  assert.equal(at('report','2026-12-24T18:00:00Z').due,true);
  assert.equal(at('report','2028-07-03T17:00:00Z').due,true);
});
test('normal close, observed holidays and unverified years',()=>{
  assert.equal(at('report','2026-09-28T20:00:00Z').due,true);
  assert.equal(at('report','2026-09-28T19:59:00Z').due,false);
  assert.equal(at('report','2027-12-24T21:00:00Z').due,false);
  assert.equal(at('analysis','2027-12-31T14:30:00Z').due,true);
  const unknown=at('analysis','2029-09-28T13:30:00Z');assert.equal(unknown.calendarVerified,false);assert.equal(unknown.due,false);
});
