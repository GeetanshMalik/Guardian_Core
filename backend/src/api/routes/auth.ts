/**
 * API Routes: Authentication (OAuth + User Profile)
 * Extracted from server.ts — Google OAuth flow endpoints
 */
import { Router } from "express";
import { google } from "googleapis";
import { container } from "../../infrastructure/container.js";
import { signJwt } from "../../infrastructure/jwt.js";
import { encrypt } from "../../infrastructure/encryption.js";

const router = Router();

function getUserRole(email: string): "admin" | "user" {
  const adminEmailsEnv = process.env.ADMIN_EMAILS || "geetansh@example.com,admin@example.com";
  const admins = adminEmailsEnv.split(",").map(e => e.trim().toLowerCase());
  return admins.includes(email.toLowerCase()) ? "admin" : "user";
}

// 1. Kick-off Google Sign-In OAuth Consent Flow
router.get("/google", (req, res) => {
  try {
    // If mock=true is passed (demo login), skip OAuth entirely and go straight to mock callback
    if (req.query.mock === "true") {
      return res.redirect("/auth/google/callback?mock=true");
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    // Resolve callback URL dynamically based on current request domain (foolproof routing)
    const callbackUrl = `${req.protocol}://${req.get("host")}/auth/google/callback`;

    if (!clientId || !clientSecret) {
      console.warn("[OAuth] Google OAuth client credentials missing in env. Triggering simulated fallback login.");
      return res.redirect("/auth/google/callback?mock=true");
    }

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, callbackUrl);

    const scopes = [
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/calendar.events"
    ];

    const referer = req.headers.referer;
    let state = "";
    if (referer) {
      try {
        const refUrl = new URL(referer);
        state = `${refUrl.protocol}//${refUrl.host}`;
      } catch (e) {
        // Ignored
      }
    }

    const authorizeUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      prompt: "consent",
      ...(state ? { state } : {})
    });

    res.redirect(authorizeUrl);
  } catch (err: any) {
    console.error("[OAuth] Error starting OAuth flow:", err);
    res.redirect(`${process.env.FRONTEND_URL || ""}/?error=auth_failed`);
  }
});

// 2. Google OAuth Redirect Callback Target
router.get("/google/callback", async (req, res) => {
  const { code, mock, state } = req.query;
  const isProd = process.env.NODE_ENV === "production";
  const frontendUrl = (state && typeof state === "string" && state.startsWith("http"))
    ? state
    : (process.env.FRONTEND_URL || "");

  const getCookieOptions = (maxAge?: number) => ({
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" as const : "lax" as const,
    ...(maxAge !== undefined ? { maxAge } : {})
  });

  if (mock === "true" || !code) {
    console.log("[OAuth] Simulated profile sign-in triggered.");

    const email = "geetansh@example.com";
    const name = "Geetansh";
    const picture = "https://lh3.googleusercontent.com/a/default-user=s120";
    const role = getUserRole(email);
    const scopes = [
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/calendar.events"
    ];

    const encryptedAccess = encrypt("mock_access_token");

    const jwtToken = signJwt({
      email,
      name,
      picture,
      role,
      scopes,
      google_access_token: encryptedAccess
    }, 24 * 3600); // 24 hours

    const userPayload = { email, name, picture, role };

    res.cookie("user_session", jwtToken, getCookieOptions());

    res.cookie("user_profile", JSON.stringify(userPayload), getCookieOptions());

    // Downstream compatibility
    res.cookie("google_access_token", "mock_access_token", getCookieOptions());

    container.auditService.log(
      "OAUTH_LOGIN",
      `users/${email}`,
      { method: "simulated", role },
      req.ip,
      email
    ).catch(err => console.error("Failed to save audit log:", err));

    return res.redirect(`${frontendUrl}/?token=${jwtToken}&user=${encodeURIComponent(JSON.stringify(userPayload))}`);
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    
    // Resolve callback URL dynamically based on current request domain (foolproof routing)
    const callbackUrl = `${req.protocol}://${req.get("host")}/auth/google/callback`;

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, callbackUrl);
    const { tokens } = await oauth2Client.getToken(code as string);

    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
    const { data: profile } = await oauth2.userinfo.get();

    const email = profile.email || "user@example.com";
    const name = profile.name || "Google User";
    const picture = profile.picture || "https://lh3.googleusercontent.com/a/default-user=s120";
    const role = getUserRole(email);

    const userScopes = tokens.scope ? tokens.scope.split(" ") : [
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/calendar.events"
    ];

    const encryptedAccess = tokens.access_token ? encrypt(tokens.access_token) : "";
    const encryptedRefresh = tokens.refresh_token ? encrypt(tokens.refresh_token) : "";

    const jwtToken = signJwt({
      email,
      name,
      picture,
      role,
      scopes: userScopes,
      google_access_token: encryptedAccess,
      google_refresh_token: encryptedRefresh
    }, tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : 3600);

    const userPayload = { email, name, picture, role };
    const cookieMaxAge = tokens.expiry_date ? tokens.expiry_date - Date.now() : 3600 * 1000;

    res.cookie("user_session", jwtToken, getCookieOptions(cookieMaxAge));

    res.cookie("user_profile", JSON.stringify(userPayload), getCookieOptions());

    res.cookie("google_access_token", tokens.access_token || "", getCookieOptions(cookieMaxAge));

    if (tokens.refresh_token) {
      res.cookie("google_refresh_token", tokens.refresh_token, getCookieOptions());
    }

    container.auditService.log(
      "OAUTH_LOGIN",
      `users/${email}`,
      { method: "oauth2", role },
      req.ip,
      email
    ).catch(err => console.error("Failed to save audit log:", err));

    res.redirect(`${frontendUrl}/?token=${jwtToken}&user=${encodeURIComponent(JSON.stringify(userPayload))}`);
  } catch (err: any) {
    console.error("[OAuth] Error during token exchange:", err);
    // Fallback to simulated login on failure to prevent total lockout in dev
    const email = "geetansh@example.com";
    const name = "Geetansh";
    const picture = "https://lh3.googleusercontent.com/a/default-user=s120";
    const role = getUserRole(email);
    const scopes = [
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/calendar.events"
    ];

    const jwtToken = signJwt({
      email,
      name,
      picture,
      role,
      scopes,
      google_access_token: encrypt("mock_access_token")
    }, 3600);

    const userPayload = { email, name, picture, role };

    res.cookie("user_session", jwtToken, getCookieOptions(3600 * 1000));
    res.cookie("user_profile", JSON.stringify(userPayload), getCookieOptions());
    res.cookie("google_access_token", "mock_access_token", getCookieOptions(3600 * 1000));
    res.redirect(`${frontendUrl}/?token=${jwtToken}&user=${encodeURIComponent(JSON.stringify(userPayload))}`);
  }
});

export default router;
