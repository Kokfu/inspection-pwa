import assert from "node:assert/strict";
import test from "node:test";
import { isRetiredRepair, selectableResultOptions } from "../src/inspectionControls/resultEntryPolicy";
test("entry policy hides only Complete Repair without changing frozen options",()=>{
  const options=Object.freeze(["good","not_good","complete_repair","na"]);
  assert.deepEqual(selectableResultOptions(options,v=>v),["good","not_good","na"]);
  assert.deepEqual(options,["good","not_good","complete_repair","na"]);
  assert.equal(isRetiredRepair("complete_repair"),true);
  assert.deepEqual(selectableResultOptions(["normal","test","isolation","poor","not_relevant"],v=>v),["normal","test","isolation","poor","not_relevant"]);
});
