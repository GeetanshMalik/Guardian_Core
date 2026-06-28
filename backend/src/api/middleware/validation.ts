import { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";

export const createGoalSchema = z.object({
  title: z.string().min(1, "Title is required"),
  deadline: z.string().min(1, "Deadline is required"),
  context: z.string().optional()
});

export const conversationMessageSchema = z.object({
  message: z.string().min(1, "Message is required"),
  goalId: z.string().optional(),
  conversationId: z.string().optional()
});

export const completeTaskSchema = z.object({
  isCompleted: z.boolean()
});

/**
 * Express middleware helper to validate request body with Zod schemas.
 */
export function validateBody(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
            details: err.flatten().fieldErrors
          },
          requestId: res.getHeader("x-request-id")
        });
      }
      next(err);
    }
  };
}
