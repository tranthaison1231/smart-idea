import "server-only";

export const AI_PROVIDER_TYPES = [
  "custom",
  "anthropic",
  "gemini",
  "vertex",
  "openrouter",
  "groq",
  "deepseek",
  "mistral",
  "xai",
  "minimax",
  "cohere",
  "perplexity",
] as const;

export type AiProviderType = (typeof AI_PROVIDER_TYPES)[number];

export interface AiProviderInput {
  name: string;
  providerType: AiProviderType;
  baseUrl: string;
  apiKey?: string;
  clearApiKey?: boolean;
  models: string[];
  model: string;
  isEnabled: boolean;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAiProviderId(value: string) {
  return uuidPattern.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimmedString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result.length > 0 && result.length <= maxLength ? result : null;
}

export function parseAiProviderInput(
  value: unknown,
): { id?: string; input: AiProviderInput } | null {
  if (!isRecord(value)) return null;

  const id = value.id;
  if (id !== undefined && (typeof id !== "string" || !isAiProviderId(id))) {
    return null;
  }

  const name = trimmedString(value.name, 80);
  const baseUrl = trimmedString(value.baseUrl, 2048);
  const model = trimmedString(value.model, 160);
  const providerType = value.providerType;
  const models = value.models;
  const isEnabled = value.isEnabled;
  const clearApiKey = value.clearApiKey;

  if (
    !name ||
    !baseUrl ||
    !model ||
    typeof providerType !== "string" ||
    !AI_PROVIDER_TYPES.includes(providerType as AiProviderType) ||
    !Array.isArray(models) ||
    models.length === 0 ||
    models.length > 100 ||
    typeof isEnabled !== "boolean" ||
    (clearApiKey !== undefined && typeof clearApiKey !== "boolean")
  ) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return null;
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return null;
  }

  const normalizedModels: string[] = [];
  for (const candidate of models) {
    const item = trimmedString(candidate, 160);
    if (!item || normalizedModels.includes(item)) return null;
    normalizedModels.push(item);
  }
  if (!normalizedModels.includes(model)) return null;

  const apiKeyValue = value.apiKey;
  let apiKey: string | undefined;
  if (apiKeyValue !== undefined) {
    if (typeof apiKeyValue !== "string") return null;
    const trimmed = apiKeyValue.trim();
    if (trimmed.length > 500) return null;
    if (trimmed) apiKey = trimmed;
  }
  if (clearApiKey === true && apiKey) return null;

  return {
    ...(typeof id === "string" ? { id } : {}),
    input: {
      name,
      providerType: providerType as AiProviderType,
      baseUrl,
      ...(apiKey ? { apiKey } : {}),
      ...(clearApiKey === true ? { clearApiKey: true } : {}),
      models: normalizedModels,
      model,
      isEnabled,
    },
  };
}

export function parseOAuthProviderUpdate(value: unknown) {
  if (!isRecord(value)) return null;
  if (Object.keys(value).some((key) => !["id", "providerType", "model", "isEnabled"].includes(key))) {
    return null;
  }
  const id = value.id;
  const model = trimmedString(value.model, 160);
  if (
    typeof id !== "string" ||
    !isAiProviderId(id) ||
    value.providerType !== "oauth" ||
    !model ||
    typeof value.isEnabled !== "boolean"
  ) {
    return null;
  }
  return { id, model, isEnabled: value.isEnabled };
}
