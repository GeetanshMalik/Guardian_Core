/**
 * API Routes: Tools
 * Extracted from server.ts — All /api/tools/* endpoints
 */
import { Router } from "express";
import { container } from "../../infrastructure/container.js";
import { ToolExecutionFramework } from "../../cognitive/toolExecution.js";

const { toolRepository } = container;

const getToolRegistry = () => toolRepository.getRegistry();
const saveToolDefinition = (tool: any) => toolRepository.saveTool(tool);
const getToolExecutionLogs = () => toolRepository.getLogs();

const router = Router();

// 7a. Get all registered tools in the registry
router.get("/registry", async (req, res) => {
  try {
    const registry = await getToolRegistry();
    res.json(registry);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7b. Update tool settings (availabilityStatus)
router.put("/registry/:id", async (req, res) => {
  const { id } = req.params;
  const { availabilityStatus } = req.body;
  try {
    const registry = await getToolRegistry();
    const tool = registry.find(t => t.id === id);
    if (!tool) {
      return res.status(404).json({ error: "Tool not found" });
    }
    tool.availabilityStatus = availabilityStatus;
    await saveToolDefinition(tool);
    res.json(tool);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7c. Get tool execution audit logs
router.get("/logs", async (req, res) => {
  try {
    const logs = await getToolExecutionLogs();
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7d. Trigger rollback/undo for a previous tool execution
router.post("/rollback/:operationId", async (req, res) => {
  const { operationId } = req.params;
  const accessToken = req.cookies?.google_access_token;
  try {
    console.log(`[Server] Request to rollback operation: ${operationId}`);
    const framework = ToolExecutionFramework.getInstance();
    const success = await framework.rollback(operationId, accessToken);
    await container.auditService.log(
      "TOOL_ROLLBACK",
      `tools/operations/${operationId}`,
      { success },
      req.ip
    );
    if (success) {
      res.json({ success: true, message: `Successfully reverted operation: ${operationId}` });
    } else {
      res.status(400).json({ error: `Rollback was unsuccessful for operation: ${operationId}` });
    }
  } catch (err: any) {
    console.error("[Server] Rollback error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
