import express from "express";
import { loadConfig } from "./config/env.js";
import { authRequired } from "./middleware/authRequired.js";
import { healthRouter } from "./routes/health.js";
import { syncRouter } from "./routes/sync.js";

const config = loadConfig();
const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

app.use(healthRouter);
app.use(authRequired);
app.use(syncRouter);

app.use((_request, response) => {
  response.status(404).json({ error: "NOT_FOUND" });
});

app.listen(config.port, () => {
  console.log(`inspection-api listening on ${config.port}`);
});

