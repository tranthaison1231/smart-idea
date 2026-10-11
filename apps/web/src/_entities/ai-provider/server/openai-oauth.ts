import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { createRemoteJWKSet, jwtVerify } from "jose";

import {
  aiProviders,
  getDb,
  openaiOAuthAccounts,
  openaiOAuthTransactions,
} from "@smart-idea/database/server";
import { decryptCredential, encryptCredential, isCredentialEncryptionConfigured } from "./credential-cipher";

const OPENAI_ISSUER = "https://auth.openai.com";
const AUTHORIZATION_ENDPOINT = `${OPENAI_ISSUER}/api/accounts/authorize`;
const TOKEN_ENDPOINT = `${OPENAI_ISSUER}/api/accounts/oauth/token`;
const OIDC_CONFIGURATION_URL = `${OPENAI_ISSUER}/.well-known/openid-configuration`;
const RESOURCE = "https://api.openai.com/v1";
const CALLBACK_PATH = "/api/ai-assistant/openai/callback";
const DEFAULT_REDIRECT_URI = `http://127.0.0.1:3001${CALLBACK_PATH}`;
const HOST_ID_PATTERN = /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class OpenAiOAuthError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
  }
}

interface OpenAiOidcConfiguration {
  issuer: string;
  jwks_uri: string;
  revocation_endpoint: string;
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

function hostId() {
  const value = process.env.OPENAI_OAUTH_HOST_ID?.trim();
  if (!value || !HOST_ID_PATTERN.test(value)) {
    throw new OpenAiOAuthError("oauth_host_id_not_configured", 503);
  }
  return value;
}

function redirectUri() {
  if (process.env.NODE_ENV === "production") {
    throw new OpenAiOAuthError("oauth_local_only", 503);
  }
  const value = process.env.OPENAI_OAUTH_REDIRECT_URI?.trim() || DEFAULT_REDIRECT_URI;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" ||
      url.pathname !== CALLBACK_PATH ||
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

async function oidcConfiguration(): Promise<OpenAiOidcConfiguration> {
  let response: Response;
  try {
    response = await fetch(OIDC_CONFIGURATION_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new OpenAiOAuthError("oauth_configuration_failed", 502);
  }
  const body = asRecord(await response.json().catch(() => null));
  if (
    !response.ok ||
    body?.issuer !== OPENAI_ISSUER ||
    typeof body.jwks_uri !== "string" ||
    typeof body.revocation_endpoint !== "string"
  ) {
    throw new OpenAiOAuthError("oauth_configuration_failed", 502);
  }
  try {
    const jwks = new URL(body.jwks_uri);
    const revocation = new URL(body.revocation_endpoint);
    if (jwks.origin !== OPENAI_ISSUER || revocation.origin !== OPENAI_ISSUER) throw new Error("Invalid endpoint");
  } catch {
    throw new OpenAiOAuthError("oauth_configuration_failed", 502);
  }
  return body as unknown as OpenAiOidcConfiguration;
}

let remoteJwks: { uri: string; keys: ReturnType<typeof createRemoteJWKSet> } | undefined;

async function verifyIdToken(idToken: string, clientId: string, nonce: string) {
  try {
    const config = await oidcConfiguration();
    if (!remoteJwks || remoteJwks.uri !== config.jwks_uri) {
      remoteJwks = {
        uri: config.jwks_uri,
        keys: createRemoteJWKSet(new URL(config.jwks_uri)),
      };
    }
    const { payload } = await jwtVerify(idToken, remoteJwks.keys, {
      issuer: config.issuer,
      audience: clientId,
      algorithms: ["RS256", "ES256", "PS256"],
      clockTolerance: 30,
      requiredClaims: ["sub", "nonce"],
    });
    if (typeof payload.sub !== "string" || !payload.sub || payload.nonce !== nonce) {
      throw new Error("ID token claims did not match the authorization attempt");
    }
    return {
      subject: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
    };
  } catch (error) {
    if (error instanceof OpenAiOAuthError) throw error;
    throw new OpenAiOAuthError("oauth_id_token_invalid", 400);
  }
}

async function listModels(accessToken: string) {
  let response: Response;
  try {
    response = await fetch(`${RESOURCE}/models`, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new OpenAiOAuthError("oauth_models_unavailable", 502);
  }
  const body = asRecord(await response.json().catch(() => null));
  const candidates = Array.isArray(body?.models) ? body.models : [];
  const models = [...new Set(candidates.flatMap((candidate) => {
    const model = asRecord(candidate);
    return model?.visibility === "list" && typeof model.slug === "string" && model.slug.trim()
      ? [model.slug.trim()]
      : [];
  }))].slice(0, 100);
  if (!response.ok || !models.length) throw new OpenAiOAuthError("oauth_models_unavailable", 502);
  return models;
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
  const clientId = account?.clientId ?? "dynamic_agent_client";
  const activeHostId = account?.hostId ?? hostId();
  const idTokenHint = account?.idTokenCiphertext ? decryptCredential(account.idTokenCiphertext) : null;
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
      expectedSubject: account?.subject ?? null,
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
  url.searchParams.set("scope", "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct");
  url.searchParams.set("resource", RESOURCE);
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("ext_agent_host_id", activeHostId);
  if (idTokenHint) {
    url.searchParams.set("id_token_hint", idTokenHint);
  }
  if (account) {
    if (account.email) url.searchParams.set("login_hint", account.email);
  } else {
    url.searchParams.set("agent_name_hint", "Smart Idea");
  }

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

    let issuedClientId = transaction.clientId;
    if (transaction.clientId === "dynamic_agent_client") {
      if (!callbackClientId || !/^oaiapp_[A-Za-z0-9_-]{1,240}$/.test(callbackClientId)) {
        throw new OpenAiOAuthError("oauth_client_mismatch", 400);
      }
      issuedClientId = callbackClientId;
    } else if (callbackClientId && callbackClientId !== transaction.clientId) {
      throw new OpenAiOAuthError("oauth_client_mismatch", 400);
    }

    const tokens = await requestToken({
      grant_type: "authorization_code",
      client_id: issuedClientId,
      code: code!,
      code_verifier: decryptCredential(transaction.codeVerifierCiphertext),
      redirect_uri: transaction.redirectUri,
      resource: RESOURCE,
    });
    if (!tokens.refresh_token || !tokens.id_token || !tokens.scope) {
      throw new OpenAiOAuthError("oauth_token_exchange_failed", 502);
    }
    const scopes = tokens.scope.split(/\s+/).filter(Boolean);
    if (!scopes.includes("chatgpt.tokens.use.direct") || !scopes.includes("resource.invoke")) {
      throw new OpenAiOAuthError("oauth_scope_missing", 403);
    }
    const identity = await verifyIdToken(tokens.id_token, issuedClientId, transaction.nonce);
    if (transaction.expectedSubject && transaction.expectedSubject !== identity.subject) {
      throw new OpenAiOAuthError("oauth_account_changed", 409);
    }
    const models = await listModels(tokens.access_token);
    const [account] = await tx
      .select()
      .from(openaiOAuthAccounts)
      .where(eq(openaiOAuthAccounts.ownerId, ownerId))
      .for("update")
      .limit(1);
    if (
      (transaction.expectedSubject && account?.subject !== transaction.expectedSubject) ||
      (!transaction.expectedSubject && account && account.subject !== identity.subject) ||
      (transaction.expectedSubject && identity.subject !== transaction.expectedSubject)
    ) {
      throw new OpenAiOAuthError("oauth_account_changed", 409);
    }

    const [provider] = await tx
      .select({ id: aiProviders.id, model: aiProviders.model })
      .from(aiProviders)
      .where(and(eq(aiProviders.ownerId, ownerId), eq(aiProviders.providerType, "oauth")))
      .for("update")
      .limit(1);
    const model = provider && models.includes(provider.model) ? provider.model : models[0];
    const now = new Date();
    const tokenFields = {
      clientId: issuedClientId,
      hostId: transaction.hostId,
      subject: identity.subject,
      email: identity.email,
      accessTokenCiphertext: encryptCredential(tokens.access_token),
      refreshTokenCiphertext: encryptCredential(tokens.refresh_token),
      idTokenCiphertext: encryptCredential(tokens.id_token),
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
          baseUrl: RESOURCE,
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
        baseUrl: RESOURCE,
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
    if (!account?.accessTokenCiphertext || !account.refreshTokenCiphertext || !account.expiresAt) return null;
    if (account.expiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
      return decryptCredential(account.accessTokenCiphertext);
    }

    const refreshToken = decryptCredential(account.refreshTokenCiphertext);
    const tokens = await requestToken({
      grant_type: "refresh_token",
      client_id: account.clientId,
      refresh_token: refreshToken,
      resource: RESOURCE,
    });
    if (tokens.scope) {
      const scopes = tokens.scope.split(/\s+/).filter(Boolean);
      if (!scopes.includes("chatgpt.tokens.use.direct") || !scopes.includes("resource.invoke")) {
        throw new OpenAiOAuthError("oauth_scope_missing", 403);
      }
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
  const db = getDb();
  const account = await db.transaction(async (tx) => {
    await tx.delete(openaiOAuthTransactions).where(eq(openaiOAuthTransactions.ownerId, ownerId));
    const [account] = await tx
      .select()
      .from(openaiOAuthAccounts)
      .where(eq(openaiOAuthAccounts.ownerId, ownerId))
      .for("update")
      .limit(1);
    await tx.delete(aiProviders).where(and(eq(aiProviders.ownerId, ownerId), eq(aiProviders.providerType, "oauth")));
    if (account) {
      await tx
        .update(openaiOAuthAccounts)
        .set({
          accessTokenCiphertext: null,
          refreshTokenCiphertext: null,
          idTokenCiphertext: null,
          expiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(openaiOAuthAccounts.ownerId, ownerId));
    }
    return account?.refreshTokenCiphertext
      ? { clientId: account.clientId, refreshTokenCiphertext: account.refreshTokenCiphertext }
      : null;
  });
  let remoteRevocationConfirmed = !account;
  if (account) {
    try {
      const [config, refreshToken] = await Promise.all([
        oidcConfiguration(),
        Promise.resolve(decryptCredential(account.refreshTokenCiphertext)),
      ]);
      const response = await fetch(config.revocation_endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: refreshToken,
          token_type_hint: "refresh_token",
          client_id: account.clientId,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      remoteRevocationConfirmed = response.status === 200;
    } catch {
      remoteRevocationConfirmed = false;
    }
  }
  return { remoteRevocationConfirmed };
}
