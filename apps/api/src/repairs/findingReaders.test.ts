import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFindingParts, resolveRepairField, type R } from "./findingReaders.js";
import { fixture, systems, setResult } from "./repairFixtures.js";
for (const system of systems) test(`${system}: frozen accepted parts, explicit paths, no Complete Repair / Good / N.A.`,() => {
  const f=fixture(system), parts=readFindingParts(f.row).parts;
  assert.ok(parts.length>0);
  assert.deepEqual(parts.map(p => p.fieldPath),f.adapter.derivePoorFieldPaths(f.response));
  for (const part of parts) {
    assert.equal(part.remark,"Own original remark");
    assert.equal(resolveRepairField(system,f.response,part.fieldPath)?.result,"not_good");
  }
  for (const state of ["good","na","complete_repair"]) {
    const copy=structuredClone({row:f.row,response:f.response,snapshot:f.snapshot});
    for (const p of parts) setResult(system,copy.response,p.fieldPath,state);
    if ("evidenceManifest" in copy.snapshot) copy.snapshot.evidenceManifest=state==="complete_repair" ? f.manifest : [];
    copy.row.responses=copy.response; copy.row.inspectionSnapshot=copy.snapshot;
    assert.equal(readFindingParts(copy.row).parts.length,0);
  }
  assert.equal(resolveRepairField(system,f.response,"foreign.fake.not_good"),undefined);
  const copy=structuredClone(f.row); copy.status="draft"; assert.throws(() => readFindingParts(copy),/invalid/);
  const badTime=structuredClone(f.row);badTime.performedAt="2026-02-30T00:00:00.000000Z";assert.throws(()=>readFindingParts(badTime),/invalid/);
  if (system==="fire_alarm_detector") {
    const badState=structuredClone(f.row);((badState.responses as R).primaryDeviceRows as R[])[0]!.manualCallPoint=["not_good"];
    assert.throws(()=>readFindingParts(badState),/invalid/);
  }
  if (parts.some(p => p.rowUuid)) {
    const p=parts.find(p => p.rowUuid)!;
    assert.equal(resolveRepairField(system,f.response,p.fieldPath.replace(p.rowUuid!,randomUUID())),undefined);
    const collection=p.responsePath.split(".")[0]!;
    const rows=f.response[collection] as R[];
    rows.push(structuredClone(rows[0]!)); assert.throws(() => readFindingParts(f.row),/invalid/);
  }
});
