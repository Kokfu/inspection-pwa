import { runCo2AcceptedDetailHarness } from "./co2/acceptedDetailHarness";
import { runHoseReelAcceptedDetailHarness } from "./hoseReel/acceptedDetailHarness";
const total=(await runHoseReelAcceptedDetailHarness())+(await runCo2AcceptedDetailHarness());
console.log(`Accepted detail harness: ${total} checks passed`);
