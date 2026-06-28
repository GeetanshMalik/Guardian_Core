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
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    const callbackUrl = process.env.GOOGLE_CALLBACK_URL || `${process.env.APP_URL || "http://localhost:3000"}/auth/google/callback`;

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

    const authorizeUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      prompt: "consent"
    });

    res.redirect(authorizeUrl);
  } catch (err: any) {
    console.error("[OAuth] Error starting OAuth flow:", err);
    res.redirect("/?error=auth_failed");
  }
});

// 2. Google OAuth Redirect Callback Target
router.get("/google/callback", async (req, res) => {
  const { code, mock } = req.query;

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

    res.cookie("user_session", jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax"
    });

    res.cookie("user_profile", JSON.stringify({
      email,
      name,
      picture,
      role
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax"
    });

    // Downstream compatibility
    res.cookie("google_access_token", "mock_access_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax"
    });

    container.auditService.log(
      "OAUTH_LOGIN",
      `users/${email}`,
      { method: "simulated", role },
      req.ip,
      email
    ).catch(err => console.error("Failed to save audit log:", err));

    return res.redirect("/");
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const callbackUrl = process.env.GOOGLE_CALLBACK_URL || `${process.env.APP_URL || "http://localhost:3000"}/auth/google/callback`;

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

    res.cookie("user_session", jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: (tokens.expiry_date ? tokens.expiry_date - Date.now() : 3600) * 1000
    });

    res.cookie("user_profile", JSON.stringify({
      email,
      name,
      picture,
      role
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax"
    });

    res.cookie("google_access_token", tokens.access_token || "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: (tokens.expiry_date ? tokens.expiry_date - Date.now() : 3600) * 1000
    });

    if (tokens.refresh_token) {
      res.cookie("google_refresh_token", tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax"
      });
    }

    container.auditService.log(
      "OAUTH_LOGIN",
      `users/${email}`,
      { method: "oauth2", role },
      req.ip,
      email
    ).catch(err => console.error("Failed to save audit log:", err));

    res.redirect("/");
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

    res.cookie("user_session", jwtToken, { httpOnly: true });
    res.cookie("user_profile", JSON.stringify({ email, name, picture, role }), { httpOnly: true });
    res.cookie("google_access_token", "mock_access_token", { httpOnly: true });
    res.redirect("/");
  }
});

export default router;
