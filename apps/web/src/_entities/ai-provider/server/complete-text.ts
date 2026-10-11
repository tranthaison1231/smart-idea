import "server-only";

import type { LookupAddress } from "node:dns";
import { lookup as dnsLookup } from "node:dns/promises";
import type { IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";

import type { AiProviderForInference } from "./provider-repository";

const RESPONSE_LIMIT = 160_000;
const OAUTH_STREAM_LIMIT = 1_000_000;
const REQUEST_TIMEOUT_MS = 120_000;
const OPENAI_RESPONSES_URL = "https://chatgpt.com/backend-api/codex/responses";

type AiCompletionDiagnostic = {
  stage: "dns" | "request" | "response" | "http";
  failure?: "lookup" | "network" | "timeout" | "stream";
  status?: number;
  upstreamCode?: string;
  upstreamParam?: string;
  requestId?: string;
  responseBytes?: number;
  outputCharacters?: number;
  lastEventType?: string;
};

export class AiCompletionError extends Error {
  constructor(
    readonly code: "provider_unsupported" | "provider_unavailable" | "provider_response_invalid",
    readonly diagnostic?: AiCompletionDiagnostic,
  ) {
    super(code);
  }
}

interface CompleteTextInput {
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens: number;
  responseFormat?: "json_object";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeDiagnosticField(value: unknown, pattern = /^[A-Za-z0-9_.-]{1,128}$/): string | undefined {
  return typeof value === "string" && pattern.test(value) ? value : undefined;
}

type UpstreamErrorDetails = { upstreamCode?: string; upstreamParam?: string };

function upstreamError(body: string): UpstreamErrorDetails {
  try {
    const root = asRecord(JSON.parse(body));
    const error = asRecord(root?.error) ?? root;
    const code = safeDiagnosticField(error?.code);
    const param = safeDiagnosticField(error?.param, /^[A-Za-z0-9_.\[\]-]{1,128}$/);
    return {
      ...(code ? { upstreamCode: code } : {}),
      ...(param ? { upstreamParam: param } : {}),
    };
  } catch {
    return {};
  }
}

function parseResponsesStream(body: string): {
  outputText: string | null;
  completed: boolean;
  failed?: boolean;
  outputCharacters: number;
  lastEventType?: string;
} & UpstreamErrorDetails {
  let outputText = "";
  let lastEventType: string | undefined;
  for (const block of body.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") continue;

    let event: Record<string, unknown> | null;
    try {
      event = asRecord(JSON.parse(data));
    } catch {
      continue;
    }
    if (!event) continue;
    lastEventType = safeDiagnosticField(event.type);

    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      outputText += event.delta;
    } else if (event.type === "response.completed") {
      const response = asRecord(event.response);
      return {
        outputText: response ? parseResponse(JSON.stringify(response)) ?? outputText : outputText,
        completed: true,
        outputCharacters: outputText.length,
        ...(lastEventType ? { lastEventType } : {}),
      };
    } else if (event.type === "response.failed" || event.type === "error") {
      const response = asRecord(event.response);
      const error = asRecord(response?.error) ?? asRecord(event.error) ?? event;
      return {
        outputText: null,
        completed: false,
        failed: true,
        outputCharacters: outputText.length,
        ...(lastEventType ? { lastEventType } : {}),
        ...upstreamError(JSON.stringify({ error })),
      };
    }
  }
  return {
    outputText: null,
    completed: false,
    outputCharacters: outputText.length,
    ...(lastEventType ? { lastEventType } : {}),
  };
}

function isPublicIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  return !(
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168 || b === 88 && c === 99 || b === 31 && c === 196 || b === 52 && c === 193 || b === 51 && c === 100)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) ||
    (a === 203 && b === 0 && c === 113)
  );
}

function ipv6Groups(value: string): number[] | null {
  if (value.includes("%")) return null;
  const address = value.toLowerCase();
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const parseHalf = (half: string) => half ? half.split(":") : [];
  let left = parseHalf(halves[0]!);
  let right = halves.length === 2 ? parseHalf(halves[1]!) : [];
  const last = right.length ? right[right.length - 1] : left[left.length - 1];
  if (last?.includes(".")) {
    const v4 = last.split(".").map(Number);
    if (v4.length !== 4 || v4.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
    const mapped = [((v4[0]! << 8) | v4[1]!).toString(16), ((v4[2]! << 8) | v4[3]!).toString(16)];
    if (right.length) right = [...right.slice(0, -1), ...mapped];
    else left = [...left.slice(0, -1), ...mapped];
  }
  const parse = (groups: string[]) => groups.map((group) => /^[0-9a-f]{1,4}$/.test(group) ? Number.parseInt(group, 16) : -1);
  const leftValues = parse(left);
  const rightValues = parse(right);
  if ([...leftValues, ...rightValues].some((group) => group < 0)) return null;
  const missing = 8 - leftValues.length - rightValues.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;
  return [...leftValues, ...Array(missing).fill(0), ...rightValues];
}

function isPublicIp(address: string) {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family !== 6) return false;
  const groups = ipv6Groups(address);
  if (!groups) return false;
  const [first, second] = groups;
  if (first === 0 && groups.slice(1).every((group) => group === 0)) return false;
  if (first === 0 && groups.slice(1, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    const mapped = `${groups[6]! >> 8}.${groups[6]! & 255}.${groups[7]! >> 8}.${groups[7]! & 255}`;
    return isPublicIpv4(mapped);
  }
  return (
    first! >= 0x2000 && first! < 0x4000 &&
    (first! & 0xfe00) !== 0xfc00 &&
    (first! & 0xffc0) !== 0xfe80 &&
    (first! & 0xff00) !== 0xff00 &&
    !(first === 0x2001 && second! <= 0x01ff) &&
    !(first === 0x2001 && second === 0x0db8) &&
    first !== 0x2002 &&
    first !== 0x3fff &&
    !(first === 0x2001 && second === 0x0010)
  );
}

async function readBounded(response: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  return new Promise((resolve, reject) => {
    response.on("data", (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > RESPONSE_LIMIT) {
        reject(new AiCompletionError("provider_response_invalid"));
        response.destroy(new Error("response_too_large"));
        return;
      }
      chunks.push(buffer);
    });
    response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    response.on("error", () => reject(new AiCompletionError("provider_unavailable", { stage: "response", failure: "stream" })));
  });
}

function configuredEndpoint(provider: AiProviderForInference) {
  let endpoint: URL;
  try {
    endpoint = new URL(`${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`);
  } catch {
    throw new AiCompletionError("provider_unsupported");
  }
  if (
    endpoint.protocol !== "https:" || !endpoint.hostname || endpoint.username || endpoint.password ||
    endpoint.search || endpoint.hash || endpoint.port === "0"
  ) {
    throw new AiCompletionError("provider_unsupported");
  }
  return endpoint;
}

async function resolvePublicAddresses(url: URL): Promise<LookupAddress[]> {
  let addresses: LookupAddress[];
  try {
    addresses = await dnsLookup(url.hostname.replace(/^\[|\]$/g, ""), { all: true, verbatim: true });
  } catch {
    throw new AiCompletionError("provider_unavailable", { stage: "dns", failure: "lookup" });
  }
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIp(address))) {
    throw new AiCompletionError("provider_unsupported");
  }
  return addresses;
}

export async function validateProviderForInference(provider: AiProviderForInference) {
  if (provider.credentialType === "oauth") return;
  await resolvePublicAddresses(configuredEndpoint(provider));
}

async function postConfiguredProvider(url: URL, apiKey: string, body: string) {
  const addresses = await resolvePublicAddresses(url);
  const pinned = addresses[0]!;
  const lookup = ((hostname, options, callback) => {
    if (typeof options === "object" && options !== null && "all" in options && options.all) {
      callback(null, addresses);
    } else {
      callback(null, pinned.address, pinned.family);
    }
  }) as LookupFunction;

  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const request = httpsRequest(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      lookup,
      timeout: REQUEST_TIMEOUT_MS,
    }, async (response) => {
      try {
        resolve({ status: response.statusCode ?? 502, body: await readBounded(response) });
      } catch (error) {
        reject(error);
      }
    });
    request.on("timeout", () => {
      reject(new AiCompletionError("provider_unavailable", { stage: "request", failure: "timeout" }));
      request.destroy();
    });
    request.on("error", () => reject(new AiCompletionError("provider_unavailable", { stage: "request", failure: "network" })));
    request.end(body);
  });
}

async function postOAuthProvider(url: URL, accessToken: string, body: string) {
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "OpenAI-Beta": "responses=v1",
      },
      body,
      cache: "no-store",
      redirect: "error",
      signal: timeoutSignal,
    });
  } catch (error) {
    if (timeoutSignal.aborted) {
      throw new AiCompletionError("provider_unavailable", { stage: "request", failure: "timeout" });
    }
    throw new AiCompletionError("provider_unavailable", {
      stage: "request",
      failure: error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network",
    });
  }
  const requestId = safeDiagnosticField(response.headers.get("x-request-id") ?? response.headers.get("openai-request-id"));
  const reader = response.body?.getReader();
  if (!reader) {
    throw new AiCompletionError("provider_response_invalid", {
      stage: "response",
      failure: "stream",
      status: response.status,
      requestId,
      responseBytes: 0,
    });
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > OAUTH_STREAM_LIMIT) {
        await reader.cancel();
        throw new AiCompletionError("provider_response_invalid", {
          stage: "response",
          failure: "stream",
          status: response.status,
          requestId,
          responseBytes: size,
        });
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof AiCompletionError) throw error;
    if (timeoutSignal.aborted) {
      throw new AiCompletionError("provider_unavailable", {
        stage: "response",
        failure: "timeout",
        status: response.status,
        requestId,
        responseBytes: size,
      });
    }
    throw new AiCompletionError("provider_unavailable", { stage: "response", failure: "stream" });
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return {
    status: response.status,
    body: text,
    requestId,
  };
}

function parseResponse(text: string): string | null {
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (typeof record.output_text === "string") return record.output_text;
    if (Array.isArray(record.choices)) {
      const first = record.choices[0];
      if (!first || typeof first !== "object") return null;
      const message = (first as Record<string, unknown>).message;
      if (!message || typeof message !== "object") return null;
      const content = (message as Record<string, unknown>).content;
      return typeof content === "string" ? content : null;
    }
    if (Array.isArray(record.output)) {
      for (const item of record.output) {
        if (!item || typeof item !== "object") continue;
        const content = (item as Record<string, unknown>).content;
        if (!Array.isArray(content)) continue;
        const textPart = content.find((part) => part && typeof part === "object" && (part as Record<string, unknown>).type === "output_text");
        if (textPart && typeof textPart === "object") {
          const outputText = (textPart as Record<string, unknown>).text;
          if (typeof outputText === "string") return outputText;
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function completeTextWithProvider(
  provider: AiProviderForInference,
  input: CompleteTextInput,
): Promise<string> {
  if (provider.credentialType === "oauth") {
    const body = JSON.stringify({
      model: provider.model,
      instructions: input.systemPrompt,
      input: [{ role: "user", content: input.userPrompt }],
      store: false,
      stream: true,
      ...(input.responseFormat ? { text: { format: { type: input.responseFormat } } } : {}),
    });
    const response = await postOAuthProvider(new URL(OPENAI_RESPONSES_URL), provider.accessToken, body);
    if (response.status < 200 || response.status >= 300) {
      throw new AiCompletionError("provider_unavailable", {
        stage: "http",
        status: response.status,
        requestId: response.requestId,
        ...upstreamError(response.body),
      });
    }
    const result = parseResponsesStream(response.body);
    if (result.failed) {
      throw new AiCompletionError("provider_unavailable", {
        stage: "response",
        status: response.status,
        requestId: response.requestId,
        ...(result.upstreamCode ? { upstreamCode: result.upstreamCode } : {}),
        ...(result.upstreamParam ? { upstreamParam: result.upstreamParam } : {}),
      });
    }
    if (!result.completed || !result.outputText) {
      throw new AiCompletionError("provider_response_invalid", {
        stage: "response",
        failure: "stream",
        status: response.status,
        requestId: response.requestId,
        responseBytes: Buffer.byteLength(response.body),
        outputCharacters: result.outputCharacters,
        ...(result.lastEventType ? { lastEventType: result.lastEventType } : {}),
      });
    }
    return result.outputText;
  }

  const endpoint = configuredEndpoint(provider);
  const body = JSON.stringify({
    model: provider.model,
    messages: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: input.userPrompt },
    ],
    max_tokens: input.maxOutputTokens,
    temperature: 0.35,
    response_format: { type: "json_object" },
  });
  const response = await postConfiguredProvider(endpoint, provider.apiKey, body);
  if (response.status < 200 || response.status >= 300) {
    throw new AiCompletionError("provider_unavailable", { stage: "http", status: response.status });
  }
  const text = parseResponse(response.body);
  if (!text) throw new AiCompletionError("provider_response_invalid");
  return text;
}
