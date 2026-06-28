import { Request, Response, NextFunction } from "express";
import { verifyJwt } from "../../infrastructure/jwt.js";
import { decrypt } from "../../infrastructure/encryption.js";
import { runWithRequestContext, getRequestContext } from "../../infrastructure/requestContext.js";
import { container } from "../../infrastructure/container.js";

// Extend Express Request type locally for safety
export interface AuthenticatedRequest extends Request {
  user?: {
    email: string;
    name: string;
    picture: string;
    role: string;
    scopes: string[];
    google_access_token?: string;
    google_refresh_token?: string;
  };
}

/**
 * Authentication middleware that verifies JWT and scopes user context.
 */
export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  // 1. Extract token from header or cookie
  let token = "";
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else if (req.cookies?.user_session) {
    token = req.cookies.user_session;
  }

  if (!token) {
    console.warn(`[AuthMiddleware] Missing session credentials for path: ${req.path}`);
    container.auditService.log(
      "UNAUTHORIZED_ACCESS",
      `api${req.path}`,
      { reason: "Missing authentication token" },
      req.ip,
      "anonymous"
    ).catch(err => console.error("Audit log failed:", err));
    
    res.status(401).json({ error: "Unauthorized: Missing session credentials" });
    return;
  }

  // 2. Verify token
  const decoded = verifyJwt(token);
  if (!decoded) {
    console.warn(`[AuthMiddleware] Invalid or expired token for path: ${req.path}`);
    container.auditService.log(
      "UNAUTHORIZED_ACCESS",
      `api${req.path}`,
      { reason: "Invalid or expired token" },
      req.ip,
      "anonymous"
    ).catch(err => console.error("Audit log failed:", err));
    
    res.status(401).json({ error: "Unauthorized: Invalid or expired session" });
    return;
  }

  // 3. Decrypt Google tokens if present
  if (decoded.google_access_token) {
    decoded.google_access_token = decrypt(decoded.google_access_token);
  }
  if (decoded.google_refresh_token) {
    decoded.google_refresh_token = decrypt(decoded.google_refresh_token);
  }

  req.user = decoded;

  // 4. Backward compatibility: hydrate req.cookies for legacy routes
  if (decoded.google_access_token) {
    req.cookies = req.cookies || {};
    req.cookies.google_access_token = decoded.google_access_token;
  }

  // 5. Wrap execution inside AsyncLocalStorage request context
  const currentCtx = getRequestContext() || {};
  runWithRequestContext(
    {
      ...currentCtx,
      userId: decoded.email,
    },
    () => next()
  );
}

/**
 * Authorization middleware to restrict route access by role.
 */
export function requireRole(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized: Authentication required" });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      console.warn(`[AuthMiddleware] Access denied for user "${req.user.email}". Required roles: [${allowedRoles.join(", ")}]. User role: "${req.user.role}"`);
      container.auditService.log(
        "UNAUTHORIZED_ACCESS",
        `api${req.path}`,
        { reason: "Insufficient role clearance", userRole: req.user.role, requiredRoles: allowedRoles },
        req.ip,
        req.user.email
      ).catch(err => console.error("Audit log failed:", err));

      res.status(403).json({ error: "Forbidden: Insufficient privileges" });
      return;
    }

    next();
  };
}

/**
 * Authorization middleware to restrict route access by OAuth scopes.
 */
export function requireScopes(requiredScopes: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized: Authentication required" });
      return;
    }

    const userScopes = req.user.scopes || [];
    const hasAllScopes = requiredScopes.every(scope => userScopes.includes(scope));

    if (!hasAllScopes) {
      console.warn(`[AuthMiddleware] Access denied for user "${req.user.email}". Missing required scopes.`);
      container.auditService.log(
        "UNAUTHORIZED_ACCESS",
        `api${req.path}`,
        { reason: "Missing required integration scopes", userScopes, requiredScopes },
        req.ip,
        req.user.email
      ).catch(err => console.error("Audit log failed:", err));

      res.status(403).json({ error: "Forbidden: Missing required integration permissions" });
      return;
    }

    next();
  };
}
