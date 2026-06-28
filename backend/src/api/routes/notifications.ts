/**
 * API Routes: Notifications
 * Extracted from server.ts — All /api/notifications/* endpoints
 */
import { Router } from "express";
import { container } from "../../infrastructure/container.js";

const { notificationService } = container;

const router = Router();

// 12. Fetch system-wide notifications
router.get("/", async (req, res) => {
  try {
    const notifications = await notificationService.getAll();
    res.json(notifications);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 13. Mark notification as read
router.post("/:id/read", async (req, res) => {
  const { id } = req.params;
  try {
    await notificationService.markRead(id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 14. Clear all notifications
router.post("/clear", async (req, res) => {
  try {
    await notificationService.clearAll();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
