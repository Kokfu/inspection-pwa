import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireRole } from "../middleware/requireRole.js";

type ServerTestRecord = {
  clientUuid: string;
  title: string;
  notes: string;
  createdAt: string;
};

export const testRecordsRouter = Router();

testRecordsRouter.get(
  "/test-records",
  requireRole("admin", "inspector"),
  async (_request, response, next) => {
    try {
      const result = await pool.query<ServerTestRecord>(
        `
          SELECT
            client_uuid AS "clientUuid",
            title,
            notes,
            created_at AS "createdAt"
          FROM test_records
          ORDER BY created_at DESC, client_uuid ASC
          LIMIT $1;
        `,
        [100]
      );

      response.json({ records: result.rows });
    } catch (error) {
      next(error);
    }
  }
);
