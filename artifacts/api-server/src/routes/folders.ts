import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, foldersTable, videosTable } from "@workspace/db";
import { requireApiKey } from "../middlewares/auth";

const router: IRouter = Router();

function parseFolderBody(body: unknown): { name: string; color: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name || name.length > 80) return null;
  const color = typeof b.color === "string" ? b.color : "#3b82f6";
  return { name, color };
}

router.get("/folders", requireApiKey, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: foldersTable.id,
      name: foldersTable.name,
      color: foldersTable.color,
      created_at: foldersTable.created_at,
      video_count: sql<number>`cast(count(${videosTable.id}) as int)`,
    })
    .from(foldersTable)
    .leftJoin(videosTable, eq(videosTable.folder_id, foldersTable.id))
    .groupBy(foldersTable.id)
    .orderBy(foldersTable.name);

  res.json(rows.map((r) => ({ ...r, created_at: r.created_at.toISOString() })));
});

router.post("/folders", requireApiKey, async (req, res): Promise<void> => {
  const parsed = parseFolderBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "name is required (max 80 chars)", code: "VALIDATION_ERROR" });
    return;
  }

  const [folder] = await db.insert(foldersTable).values(parsed).returning();
  res.status(201).json({ ...folder, video_count: 0, created_at: folder.created_at.toISOString() });
});

router.patch("/folders/:id", requireApiKey, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id", code: "VALIDATION_ERROR" });
    return;
  }

  const parsed = parseFolderBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "name is required (max 80 chars)", code: "VALIDATION_ERROR" });
    return;
  }

  const [folder] = await db.update(foldersTable).set(parsed).where(eq(foldersTable.id, id)).returning();
  if (!folder) {
    res.status(404).json({ error: "Folder not found", code: "NOT_FOUND" });
    return;
  }

  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(videosTable)
    .where(eq(videosTable.folder_id, folder.id));

  res.json({ ...folder, video_count: count, created_at: folder.created_at.toISOString() });
});

router.delete("/folders/:id", requireApiKey, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id", code: "VALIDATION_ERROR" });
    return;
  }

  const [folder] = await db.delete(foldersTable).where(eq(foldersTable.id, id)).returning();
  if (!folder) {
    res.status(404).json({ error: "Folder not found", code: "NOT_FOUND" });
    return;
  }

  res.sendStatus(204);
});

export default router;
