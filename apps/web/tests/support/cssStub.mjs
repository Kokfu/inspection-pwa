// Lets node:test import components that `import "./x.css"`: CSS has no runtime
// meaning for server-rendered markup assertions, so it resolves to an empty module.
import { registerHooks } from "node:module";

registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith(".css")) return { format: "module", source: "export {};", shortCircuit: true };
    return nextLoad(url, context);
  }
});
