import { Router, type IRouter } from "express";
import healthRouter from "./health";
import videosRouter from "./videos";
import statsRouter from "./stats";
import syncRouter from "./sync";

const router: IRouter = Router();

router.use(healthRouter);
router.use(videosRouter);
router.use(statsRouter);
router.use(syncRouter);

export default router;
