import { Router, type IRouter } from "express";
import { requireApiKey } from "../middlewares/auth";
import { syncAllVideos } from "../lib/sync";

const router: IRouter = Router();

router.post("/sync", requireApiKey, async (_req, res): Promise<void> => {
  const startedAt = new Date();
  const result = await syncAllVideos();

  res.json({
    total: result.total,
    synced: result.synced,
    failed: result.failed,
    started_at: startedAt.toISOString(),
  });
});

export default router;
