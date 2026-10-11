import { NextResponse } from "next/server";

import { getCurrentAppUser } from "@/_features/auth/index.server";
import {
  AiCredentialsNotConfiguredError,
  AiProviderKeyRequiredError,
  isAiProviderId,
  isCredentialEncryptionConfigured,
  parseAiProviderInput,
  parseOAuthProviderUpdate,
  providerRepository,
} from "@/_entities/ai-provider/index.server";

export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isUniqueViolation(error: unknown) {
  const code = (value: unknown) =>
    typeof value === "object" && value !== null && "code" in value ? value.code : undefined;
  const cause =
    typeof error === "object" && error !== null && "cause" in error ? error.cause : undefined;
  return code(error) === "23505" || code(cause) === "23505";
}

export async function GET() {
  let user;
  try {
    user = await getCurrentAppUser();
  } catch {
    return json({ error: "auth_failed" }, 500);
  }
  if (!user) return json({ error: "unauthorized" }, 401);

  try {
    const providers = await providerRepository.listByOwner(user.id);
    return json({ providers, credentialsReady: isCredentialEncryptionConfigured() });
  } catch {
    return json({ error: "provider_load_failed" }, 500);
  }
}

export async function PUT(request: Request) {
  let user;
  try {
    user = await getCurrentAppUser();
  } catch {
    return json({ error: "auth_failed" }, 500);
  }
  if (!user) return json({ error: "unauthorized" }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_provider" }, 400);
  }

  const record = typeof body === "object" && body !== null && !Array.isArray(body)
    ? body as Record<string, unknown>
    : null;
  if (record?.providerType === "oauth") {
    const oauthInput = parseOAuthProviderUpdate(body);
    if (!oauthInput) return json({ error: "invalid_provider" }, 400);
    try {
      const providers = await providerRepository.updateOAuthForOwner(
        user.id,
        oauthInput.id,
        oauthInput.model,
        oauthInput.isEnabled,
      );
      if (!providers) return json({ error: "provider_not_found" }, 404);
      return json({ providers });
    } catch (error) {
      if (isUniqueViolation(error)) return json({ error: "active_provider_conflict" }, 409);
      return json({ error: "provider_save_failed" }, 500);
    }
  }

  const parsed = parseAiProviderInput(body);
  if (!parsed) return json({ error: "invalid_provider" }, 400);
  if (parsed.input.apiKey && !isCredentialEncryptionConfigured()) {
    return json({ error: "credentials_not_configured" }, 503);
  }

  try {
    const providers = parsed.id
      ? await providerRepository.updateForOwner(user.id, parsed.id, parsed.input)
      : await providerRepository.createForOwner(user.id, parsed.input);
    if (!providers) return json({ error: "provider_not_found" }, 404);
    return json({ providers });
  } catch (error) {
    if (error instanceof AiProviderKeyRequiredError) {
      return json({ error: "api_key_required" }, 400);
    }
    if (error instanceof AiCredentialsNotConfiguredError) {
      return json({ error: "credentials_not_configured" }, 503);
    }
    if (isUniqueViolation(error)) return json({ error: "active_provider_conflict" }, 409);
    return json({ error: "provider_save_failed" }, 500);
  }
}

export async function DELETE(request: Request) {
  let user;
  try {
    user = await getCurrentAppUser();
  } catch {
    return json({ error: "auth_failed" }, 500);
  }
  if (!user) return json({ error: "unauthorized" }, 401);

  const id = new URL(request.url).searchParams.get("id");
  if (!id || !isAiProviderId(id)) return json({ error: "provider_not_found" }, 404);

  try {
    const deleted = await providerRepository.deleteForOwner(user.id, id);
    if (!deleted) return json({ error: "provider_not_found" }, 404);
    return json({ providers: await providerRepository.listByOwner(user.id) });
  } catch {
    return json({ error: "provider_delete_failed" }, 500);
  }
}
