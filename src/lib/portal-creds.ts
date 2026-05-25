import crypto from "node:crypto";

/**
 * Symmetric encryption for portal credentials (sam.gov, grants.gov, etc.).
 *
 * Format: base64(iv || authTag || ciphertext)
 * AES-256-GCM with a 32-byte key from PORTAL_CRED_KEY env (base64-encoded).
 *
 * Generate a key once with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Then set PORTAL_CRED_KEY in env. Rotating the key invalidates existing creds —
 * users will need to re-enter them.
 */

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.PORTAL_CRED_KEY;
  if (!raw) {
    throw new Error(
      "PORTAL_CRED_KEY env var not set. Run: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\" and set the output."
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `PORTAL_CRED_KEY must decode to 32 bytes, got ${key.length}`
    );
  }
  return key;
}

export function encryptCred(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptCred(encoded: string): string {
  const key = getKey();
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/**
 * Normalize a portal domain (strip protocol, www, trailing slashes, path).
 * "https://sam.gov/foo" → "sam.gov"
 * "WWW.Grants.gov/" → "grants.gov"
 */
export function normalizePortalDomain(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  s = s.split("/")[0];
  s = s.split("?")[0];
  return s;
}
