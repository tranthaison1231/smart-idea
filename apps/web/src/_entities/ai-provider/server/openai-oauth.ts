import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";

import {
  aiProviders,
  getDb,
  openaiOAuthAccounts,
  openaiOAuthTransactions,
} from "@smart-idea/database/server";
import { decryptCredential, encryptCredential, isCredentialEncryptionConfigured } from "./credential-cipher";

const OPENAI_ISSUER = "https://auth.openai.com";
const AUTHORIZATION_ENDPOINT = `${OPENAI_ISSUER}/oauth/authorize`;
const TOKEN_ENDPOINT = `${OPENAI_ISSUER}/oauth/token`;
const OPENAI_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OPENAI_OAUTH_SCOPES = "openid profile email offline_access api.connectors.read api.connectors.invoke";
const OPENAI_CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
const OPENAI_CODEX_MODELS = [
  "gpt-5-codex",
  "gpt-5.1-codex",
  "gpt-5.2-codex",
  "gpt-6.1-sol",
  "gpt-6-luna",
  "gpt-5.6-terra",
  "gpt-5",
] as const;
const CALLBACK_PATH = "/api/ai-assistant/openai/callback";
const CODEX_CALLBACK_PATH = "/auth/callback";
const DEFAULT_REDIRECT_URI = `http://localhost:1455${CODEX_CALLBACK_PATH}`;
const DEFAULT_HOST_ID = "smart-stock";

export class OpenAiOAuthError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
  }
}

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function redirectUri() {
  if (process.env.NODE_ENV === "production") {
    throw new OpenAiOAuthError("oauth_local_only", 503);
  }
  const value = process.env.OPENAI_OAUTH_REDIRECT_URI?.trim() || DEFAULT_REDIRECT_URI;
  try {
    const url = new URL(value);
    const isCodexCallback =
      url.pathname === CODEX_CALLBACK_PATH && [1455, 1457].includes(Number(url.port));
    const isAppCallback = url.pathname === CALLBACK_PATH;
    if (
      url.protocol !== "http:" ||
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      (!isCodexCallback && !isAppCallback) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error("Invalid callback");
    }
    return url.toString();
  } catch {
    throw new OpenAiOAuthError("oauth_redirect_not_configured", 503);
  }
}

export function isOpenAiOAuthCallbackUrl(url: URL) {
  const isCodexCallback =
    url.pathname === CODEX_CALLBACK_PATH && [1455, 1457].includes(Number(url.port));
  const isAppCallback = url.pathname === CALLBACK_PATH;
  return (
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
    (isCodexCallback || isAppCallback) &&
    !url.username &&
    !url.password &&
    !url.hash
  );
}

export function getOpenAiOAuthAppOrigin() {
  try {
    const url = new URL(process.env.BETTER_AUTH_URL?.trim() || "http://localhost:3001");
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error("Invalid URL");
    return url.origin;
  } catch {
    throw new OpenAiOAuthError("oauth_redirect_not_configured", 503);
  }
}

function stateHash(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

function parseTokenResponse(value: unknown): OAuthTokenResponse {
  const body = asRecord(value);
  if (
    !body ||
    typeof body.access_token !== "string" ||
    !body.access_token ||
    typeof body.expires_in !== "number" ||
    !Number.isFinite(body.expires_in) ||
    body.expires_in <= 0 ||
    (body.refresh_token !== undefined && typeof body.refresh_token !== "string") ||
    (body.id_token !== undefined && typeof body.id_token !== "string") ||
    (body.scope !== undefined && typeof body.scope !== "string") ||
    (body.token_type !== undefined && typeof body.token_type !== "string") ||
    (typeof body.token_type === "string" && body.token_type.toLowerCase() !== "bearer")
  ) {
    throw new OpenAiOAuthError("oauth_token_exchange_failed", 502);
  }
  return body as unknown as OAuthTokenResponse;
}

async function requestToken(fields: Record<string, string>) {
  let response: Response;
  try {
    response = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new OpenAiOAuthError("oauth_token_exchange_failed", 502);
  }
  if (!response.ok) throw new OpenAiOAuthError("oauth_token_exchange_failed", 502);
  return parseTokenResponse(await response.json().catch(() => null));
}

export function getOpenAiOAuthCallbackMessage(params: URLSearchParams) {
  const state = params.get("state");
  if (!state || state.length > 256) {
    return { outcome: "error" as const, error: "oauth_transaction_invalid" };
  }
  if (params.has("error")) {
    return {
      outcome: "callback" as const,
      state,
      error: params.get("error") === "access_denied" ? "oauth_access_denied" : "oauth_authorization_failed",
    };
  }

  const code = params.get("code");
  const clientId = params.get("client_id");
  if (!code || code.length > 4096 || (clientId !== null && clientId.length > 256)) {
    return { outcome: "error" as const, error: "oauth_code_missing" };
  }
  return { outcome: "callback" as const, state, code, ...(clientId ? { clientId } : {}) };
}

export async function startOpenAiOAuth(ownerId: string) {
  if (!isCredentialEncryptionConfigured()) {
    throw new OpenAiOAuthError("credentials_not_configured", 503);
  }
  const callbackUri = redirectUri();
  const origin = getOpenAiOAuthAppOrigin();
  const [account] = await getDb()
    .select()
    .from(openaiOAuthAccounts)
    .where(eq(openaiOAuthAccounts.ownerId, ownerId))
    .limit(1);
  const clientId = OPENAI_OAUTH_CLIENT_ID;
  const activeHostId = account?.hostId ?? DEFAULT_HOST_ID;
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const now = new Date();

  await getDb().transaction(async (tx) => {
    await tx.delete(openaiOAuthTransactions).where(lt(openaiOAuthTransactions.expiresAt, now));
    await tx.insert(openaiOAuthTransactions).values({
      stateHash: stateHash(state),
      ownerId,
      clientId,
      expectedSubject: null,
      hostId: activeHostId,
      codeVerifierCiphertext: encryptCredential(verifier),
      nonce,
      redirectUri: callbackUri,
      returnOrigin: origin,
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
    });
  });

  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", callbackUri);
  url.searchParams.set("scope", OPENAI_OAUTH_SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("codex_cli_simplified_flow", "true");
  url.searchParams.set("id_token_add_organizations", "true");
  url.searchParams.set("originator", "pi");

  return { authUrl: url.toString(), callbackOrigin: new URL(callbackUri).origin };
}

export async function completeOpenAiOAuth(ownerId: string, value: unknown) {
  const callback = asRecord(value);
  if (!callback || Object.keys(callback).some((key) => !["state", "code", "clientId", "error"].includes(key))) {
    throw new OpenAiOAuthError("oauth_callback_invalid", 400);
  }
  const state = typeof callback.state === "string" && callback.state.length <= 256 ? callback.state : null;
  const error = callback.error;
  const code = typeof callback.code === "string" && callback.code.length <= 4096 ? callback.code : null;
  const callbackClientId = typeof callback.clientId === "string" && callback.clientId.length <= 256
    ? callback.clientId
    : null;
  const isOAuthError = error === "oauth_access_denied" || error === "oauth_authorization_failed";
  if (
    !state ||
    (!isOAuthError && (!code || error !== undefined)) ||
    (isOAuthError && (code !== null || callbackClientId !== null)) ||
    (callback.clientId !== undefined && callbackClientId === null)
  ) {
    throw new OpenAiOAuthError("oauth_callback_invalid", 400);
  }

  const result = await getDb().transaction(async (tx) => {
    const [transaction] = await tx
      .select()
      .from(openaiOAuthTransactions)
      .where(eq(openaiOAuthTransactions.stateHash, stateHash(state)))
      .for("update")
      .limit(1);
    if (!transaction || transaction.ownerId !== ownerId || transaction.expiresAt <= new Date()) {
      throw new OpenAiOAuthError("oauth_transaction_invalid", 400);
    }

    if (isOAuthError) {
      await tx.delete(openaiOAuthTransactions).where(eq(openaiOAuthTransactions.id, transaction.id));
      return { error: error as string };
    }

    const issuedClientId = transaction.clientId;
    if (callbackClientId && callbackClientId !== transaction.clientId) {
      throw new OpenAiOAuthError("oauth_client_mismatch", 400);
    }

    const tokens = await requestToken({
      grant_type: "authorization_code",
      client_id: issuedClientId,
      code: code!,
      code_verifier: decryptCredential(transaction.codeVerifierCiphertext),
      redirect_uri: transaction.redirectUri,
    });
    if (!tokens.refresh_token) {
      throw new OpenAiOAuthError("oauth_token_exchange_failed", 502);
    }
    const scopes = tokens.scope?.split(/\s+/).filter(Boolean) ?? OPENAI_OAUTH_SCOPES.split(" ");
    const models = [...OPENAI_CODEX_MODELS];
    const [account] = await tx
      .select()
      .from(openaiOAuthAccounts)
      .where(eq(openaiOAuthAccounts.ownerId, ownerId))
      .for("update")
      .limit(1);
    const [provider] = await tx
      .select({ id: aiProviders.id, model: aiProviders.model })
      .from(aiProviders)
      .where(and(eq(aiProviders.ownerId, ownerId), eq(aiProviders.providerType, "oauth")))
      .for("update")
      .limit(1);
    const model = provider && models.includes(provider.model as (typeof OPENAI_CODEX_MODELS)[number]) ? provider.model : models[0];
    const now = new Date();
    const tokenFields = {
      clientId: issuedClientId,
      hostId: transaction.hostId,
      subject: account?.subject ?? ownerId,
      email: account?.email ?? null,
      accessTokenCiphertext: encryptCredential(tokens.access_token),
      refreshTokenCiphertext: encryptCredential(tokens.refresh_token),
      idTokenCiphertext: null,
      scopes,
      expiresAt: new Date(now.getTime() + tokens.expires_in * 1000),
      updatedAt: now,
    };
    await tx
      .insert(openaiOAuthAccounts)
      .values({ ownerId, ...tokenFields })
      .onConflictDoUpdate({ target: openaiOAuthAccounts.ownerId, set: tokenFields });

    if (provider) {
      await tx
        .update(aiProviders)
        .set({
          name: "ChatGPT Subscription",
          baseUrl: OPENAI_CODEX_BASE_URL,
          apiKeyCiphertext: null,
          models,
          model,
          updatedAt: now,
        })
        .where(and(eq(aiProviders.ownerId, ownerId), eq(aiProviders.id, provider.id)));
    } else {
      await tx.insert(aiProviders).values({
        ownerId,
        name: "ChatGPT Subscription",
        providerType: "oauth",
        baseUrl: OPENAI_CODEX_BASE_URL,
        apiKeyCiphertext: null,
        models,
        model,
        isEnabled: false,
        updatedAt: now,
      });
    }
    await tx.delete(openaiOAuthTransactions).where(eq(openaiOAuthTransactions.id, transaction.id));
    return { error: null, returnOrigin: transaction.returnOrigin };
  });
  if (result.error) throw new OpenAiOAuthError(result.error, 400);
  return { returnOrigin: result.returnOrigin };
}

export async function getValidOpenAiAccessToken(ownerId: string) {
  return getDb().transaction(async (tx) => {
    const [account] = await tx
      .select()
      .from(openaiOAuthAccounts)
      .where(eq(openaiOAuthAccounts.ownerId, ownerId))
      .for("update")
      .limit(1);
    if (account?.clientId !== OPENAI_OAUTH_CLIENT_ID) return null;
    if (!account.accessTokenCiphertext || !account.refreshTokenCiphertext || !account.expiresAt) return null;
    if (account.expiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
      return decryptCredential(account.accessTokenCiphertext);
    }

    const refreshToken = decryptCredential(account.refreshTokenCiphertext);
    const tokens = await requestToken({
      grant_type: "refresh_token",
      client_id: OPENAI_OAUTH_CLIENT_ID,
      refresh_token: refreshToken,
    });
    if (tokens.scope) {
      const scopes = tokens.scope.split(/\s+/).filter(Boolean);
      account.scopes = scopes;
    }
    await tx
      .update(openaiOAuthAccounts)
      .set({
        accessTokenCiphertext: encryptCredential(tokens.access_token),
        refreshTokenCiphertext: encryptCredential(tokens.refresh_token || refreshToken),
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        scopes: account.scopes,
        updatedAt: new Date(),
      })
      .where(eq(openaiOAuthAccounts.ownerId, ownerId));
    return tokens.access_token;
  });
}

export async function disconnectOpenAiOAuth(ownerId: string) {
  await getDb().transaction(async (tx) => {
    await tx.delete(openaiOAuthTransactions).where(eq(openaiOAuthTransactions.ownerId, ownerId));
    await tx.delete(aiProviders).where(and(eq(aiProviders.ownerId, ownerId), eq(aiProviders.providerType, "oauth")));
    await tx.delete(openaiOAuthAccounts).where(eq(openaiOAuthAccounts.ownerId, ownerId));
  });
  return { remoteRevocationConfirmed: false };
}
