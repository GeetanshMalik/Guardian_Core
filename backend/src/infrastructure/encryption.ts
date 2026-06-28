import crypto from "node:crypto";

// 32-character key for AES-256 (256 bits). Uses environment variable or default fallback for dev.
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "some-32-byte-long-dev-secret-key-!!!";

function getKey(): Buffer {
  // Derive a 32-byte key deterministically using scrypt
  return crypto.scryptSync(ENCRYPTION_KEY, "salt-bytes-static", 32);
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns the encrypted string in the format iv:ciphertext:tag.
 */
export function encrypt(text: string): string {
  if (!text) return "";
  try {
    const iv = crypto.randomBytes(12);
    const key = getKey();
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    
    const tag = cipher.getAuthTag().toString("hex");
    return `${iv.toString("hex")}:${encrypted}:${tag}`;
  } catch (err) {
    console.error("[Encryption] Encryption failed:", err);
    throw new Error("Failed to encrypt token.");
  }
}

/**
 * Decrypts a ciphertext in the format iv:ciphertext:tag using AES-256-GCM.
 * Falls back to returning the input text if it's not encrypted (e.g. for backward compatibility).
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return "";
  
  const parts = encryptedText.split(":");
  if (parts.length !== 3) {
    // Treat as plaintext fallback (for dev or pre-existing tokens)
    return encryptedText;
  }

  try {
    const [ivHex, encryptedHex, tagHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const key = getKey();
    
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
  } catch (err) {
    console.warn("[Encryption] Decryption failed, returning input string as plaintext fallback:", err);
    return encryptedText;
  }
}
