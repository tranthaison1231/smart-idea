import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const CIPHER = "aes-256-gcm";
const NONCE_BYTES = 12;
const AUTH_TAG_BYTES = 16;

function getEncryptionKey() {
  const encoded = process.env.AI_CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error("AI credentials encryption is not configured correctly");
  }

  const key = Buffer.from(encoded, "base64");
  if (
    key.length !== 32 ||
    key.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")
  ) {
    throw new Error("AI credentials encryption is not configured correctly");
  }
  return key;
}

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid credential");
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) throw new Error("Invalid credential");
  return decoded;
}

export function encryptCredential(plaintext: string) {
  if (!plaintext) throw new Error("Credential must not be empty");

  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(CIPHER, getEncryptionKey(), nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function isCredentialEncryptionConfigured() {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function decryptCredential(envelope: string) {
  const parts = envelope.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Credential could not be decrypted");
  }

  try {
    const nonce = decodeBase64Url(parts[1]);
    const authTag = decodeBase64Url(parts[2]);
    const ciphertext = decodeBase64Url(parts[3]);
    if (nonce.length !== NONCE_BYTES || authTag.length !== AUTH_TAG_BYTES || !ciphertext.length) {
      throw new Error("Invalid credential");
    }

    const decipher = createDecipheriv(CIPHER, getEncryptionKey(), nonce);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Credential could not be decrypted");
  }
}
