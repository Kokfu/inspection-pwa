import { runCo2AcceptedDetailHarness } from "./co2/acceptedDetailHarness";
import { runFm200AcceptedDetailHarness } from "./fm200/acceptedDetailHarness";
import { runHoseReelAcceptedDetailHarness } from "./hoseReel/acceptedDetailHarness";
const total=(await runHoseReelAcceptedDetailHarness())+(await runCo2AcceptedDetailHarness())+(await runFm200AcceptedDetailHarness());
console.log(`Accepted detail harness: ${total} checks passed`);
