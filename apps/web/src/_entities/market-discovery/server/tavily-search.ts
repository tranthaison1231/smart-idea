import "server-only";

import { createHash } from "node:crypto";

import type { MarketSourceRecord } from "@smart-idea/database/server";

const TAVILY_URL = "https://api.tavily.com/search";
const SEARCH_QUERIES = [
  "Việt Nam doanh nghiệp nhỏ khó khăn quản lý vận hành số hóa gần đây",
  "Việt Nam nhu cầu sản phẩm số AI dịch vụ trực tuyến xu hướng mới nhất",
  "Việt Nam báo cáo thị trường sản phẩm công nghệ startup cơ hội số mới nhất",
] as const;

export class TavilyConfigurationError extends Error {}
export class TavilySearchError extends Error {}

export function assertTavilyConfigured() {
  if (!process.env.TAVILY_API_KEY?.trim()) throw new TavilyConfigurationError();
}

async function readBoundedBody(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new TavilySearchError();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 120_000) {
        await reader.cancel();
        throw new TavilySearchError();
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof TavilySearchError) throw error;
    throw new TavilySearchError();
  }
  return Buffer.concat(chunks).toString("utf8");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function sourceFrom(value: unknown): MarketSourceRecord | null {
  const record = asRecord(value);
  if (!record || typeof record.url !== "string" || typeof record.title !== "string" || typeof record.content !== "string") {
    return null;
  }

  let url: URL;
  try {
    url = new URL(record.url);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;

  const normalizedUrl = url.toString();
  const publishedAt = typeof record.published_date === "string" && record.published_date.length <= 80
    ? record.published_date
    : null;
  return {
    id: createHash("sha256").update(normalizedUrl).digest("hex").slice(0, 32),
    title: record.title.trim().slice(0, 300),
    url: normalizedUrl,
    domain: url.hostname.replace(/^www\./i, "").slice(0, 200),
    snippet: record.content.trim().slice(0, 1800),
    publishedAt,
  };
}

async function search(query: string, apiKey: string): Promise<MarketSourceRecord[]> {
  let response: Response;
  try {
    response = await fetch(TAVILY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        topic: "general",
        search_depth: "basic",
        max_results: 8,
        include_answer: false,
        include_raw_content: false,
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new TavilySearchError();
  }

  if (!response.ok) throw new TavilySearchError();
  const raw = await readBoundedBody(response);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new TavilySearchError();
  }
  const results = asRecord(body)?.results;
  if (!Array.isArray(results)) throw new TavilySearchError();
  return results.flatMap((result) => {
    const source = sourceFrom(result);
    return source && source.title && source.snippet ? [source] : [];
  });
}

export async function tavilySearch(queries?: readonly string[]): Promise<MarketSourceRecord[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) throw new TavilyConfigurationError();

  const selectedQueries = queries === undefined ? SEARCH_QUERIES : queries;
  if (selectedQueries.length < 1 || selectedQueries.length > 3) throw new TavilySearchError();
  const normalizedQueries = selectedQueries.map((query) => {
    if (typeof query !== "string") throw new TavilySearchError();
    const normalized = query.trim();
    if (!normalized || normalized.length > 240) throw new TavilySearchError();
    return normalized;
  });
  const uniqueQueries = [...new Set(normalizedQueries.map((query) => query.toLocaleLowerCase()))]
    .map((normalized) => normalizedQueries.find((query) => query.toLocaleLowerCase() === normalized)!);

  const results: MarketSourceRecord[] = [];
  for (const query of uniqueQueries) results.push(...await search(query, apiKey));
  const seen = new Set<string>();
  return results.filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  }).slice(0, 20);
}
