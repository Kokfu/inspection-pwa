import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repairDraftWriter } from '../src/repairs/repairDraftWriter';

function gate() { let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve}; }

test('burst shares the drain and waits for latest commit',async()=>{
  const first=gate(),latest=gate(),writes:string[]=[];
  const save=repairDraftWriter(async(value:string)=>{writes.push(value);await (writes.length===1?first:latest).promise;});
  const a=save('C');await Promise.resolve();
  const b=save('CR'),c=save('CR09');assert.equal(a,b);assert.equal(a,c);
  let done=false;void c.then(()=>{done=true;});first.resolve();await Promise.resolve();
  assert.equal(done,false);latest.resolve();await c;assert.deepEqual(writes,['C','CR09']);
});

test('new input in a commit microtask starts a new drain instead of being stranded',async()=>{
  const first=gate(),writes:string[]=[];
  const save=repairDraftWriter((value:string)=>{writes.push(value);return writes.length===1?first.promise:Promise.resolve();});
  const a=save('first');await Promise.resolve();
  const afterCommit=first.promise.then(()=>save('latest'));
  first.resolve();await a;await afterCommit;assert.deepEqual(writes,['first','latest']);
});

test('failed transaction rejects all waiting callers; retry persists newest visible work',async()=>{
  const first=gate(),writes:string[]=[];let fail=true;
  const save=repairDraftWriter(async(value:string)=>{await first.promise;if(fail)throw new Error('rollback');writes.push(value);});
  const a=save('first');await Promise.resolve();const b=save('latest');first.resolve();
  await assert.rejects(a,/rollback/);await assert.rejects(b,/rollback/);assert.deepEqual(writes,[]);
  fail=false;await save('latest retry');assert.deepEqual(writes,['latest retry']);
});
