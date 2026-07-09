import pg from "pg";
import { loadConfig } from "../config/env.js";

const { Pool } = pg;
const config = loadConfig();

export const pool = new Pool({
  connectionString: config.databaseUrl
});

