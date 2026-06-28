import { Router } from "express";
import { container } from "../../infrastructure/container.js";
import { conversationMessageSchema, validateBody } from "../middleware/validation.js";
import { ValidationError } from "../../infrastructure/errors.js";

const { guardianCore } = container;

const router = Router();

/**
 * POST /api/v1/conversations/message (§22.9)
 * Processes natural language message through the Roundtable cognitive pipeline.
 */
router.post("/message", validateBody(conversationMessageSchema), async (req, res, next) => {
  const { message, goalId, conversationId } = req.body;
  const targetId = goalId || conversationId;

  if (!targetId) {
    return next(new ValidationError("goalId or conversationId is required to start a conversation context."));
  }

  try {
    const { responseMessage, goal } = await guardianCore.processConversation(targetId, message);
    
    // Standard response format (§22.18)
    res.json({
      success: true,
      data: {
        responseMessage,
        goal
      },
      meta: {
        requestId: res.getHeader("x-request-id"),
        timestamp: new Date().toISOString(),
        version: "v1"
      }
    });
  } catch (err: any) {
    next(err);
  }
});

export default router;
