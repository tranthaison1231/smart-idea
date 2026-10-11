import { createHash } from "node:crypto";

import type { MarketSourceRecord } from "@smart-idea/database/server";

const TAVILY_SEARCH_URL = "https://api.tavily.com/search";
const TAVILY_EXTRACT_URL = "https://api.tavily.com/extract";
const SEARCH_QUERIES = [
  "Việt Nam doanh nghiệp nhỏ khó khăn quản lý vận hành số hóa gần đây",
  "Việt Nam nhu cầu sản phẩm số AI dịch vụ trực tuyến xu hướng mới nhất",
  "Việt Nam báo cáo thị trường sản phẩm công nghệ startup cơ hội số mới nhất",
] as const;
const MAX_QUERY_LENGTH = 240;
const MAX_EXTRACT_URLS = 3;
const MAX_RESULTS = 20;

export class TavilyConfigurationError extends Error {}
export class TavilySearchError extends Error {}

export type TavilySearchTopic = "general" | "news" | "finance";
export type TavilySearchTimeRange = "day" | "week" | "month" | "year";

export type TavilySearchQueryOptions = {
  query: string;
  topic?: TavilySearchTopic;
  timeRange?: TavilySearchTimeRange;
  language?: string;
  country?: string;
  maxResults?: number;
};

export type TavilySearchCall = {
  toolName?: "tavily.search" | "tavily.extract";
  query: string;
  status: "completed" | "failed";
  durationMs: number;
  resultCount?: number;
  fetchedAt?: string;
};

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

function sourceFrom(value: unknown, fetchedAt: string): MarketSourceRecord | null {
  const record = asRecord(value);
  const content = typeof record?.content === "string"
    ? record.content
    : typeof record?.raw_content === "string" ? record.raw_content : null;
  if (!record || typeof record.url !== "string" || !content?.trim()) return null;

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
  const title = typeof record.title === "string" && record.title.trim()
    ? record.title.trim()
    : url.hostname.replace(/^www\./i, "");
  return {
    id: createHash("sha256").update(normalizedUrl).digest("hex").slice(0, 32),
    title: title.slice(0, 300),
    url: normalizedUrl,
    domain: url.hostname.replace(/^www\./i, "").slice(0, 200),
    snippet: content.trim().slice(0, 1800),
    publishedAt,
    fetchedAt,
  };
}

function dedupeSources(results: MarketSourceRecord[]) {
  const seen = new Set<string>();
  return results.filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  }).slice(0, MAX_RESULTS);
}

function normalizedQuery(query: unknown) {
  if (typeof query !== "string") throw new TavilySearchError();
  const value = query.trim();
  if (!value || value.length > MAX_QUERY_LENGTH) throw new TavilySearchError();
  return value;
}

function normalizedOptions(options: TavilySearchQueryOptions) {
  const query = normalizedQuery(options?.query);
  const topic = options?.topic ?? "general";
  const timeRange = options?.timeRange ?? "month";
  if (!["general", "news", "finance"].includes(topic)) throw new TavilySearchError();
  if (!["day", "week", "month", "year"].includes(timeRange)) throw new TavilySearchError();
  const maxResults = options?.maxResults ?? 8;
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 20) throw new TavilySearchError();
  const language = options?.language?.trim() || "vi";
  const country = options?.country?.trim() || "vietnam";
  if (language.length > 20 || country.length > 80) throw new TavilySearchError();
  return { query, topic, timeRange, language, country, maxResults } as const;
}

function normalizedUrl(value: unknown) {
  if (typeof value !== "string") throw new TavilySearchError();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new TavilySearchError();
  }
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname) throw new TavilySearchError();
  return url.toString();
}

async function request(endpoint: string, body: Record<string, unknown>, apiKey: string) {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, ...body }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new TavilySearchError();
  }
  if (!response.ok) throw new TavilySearchError();
  const raw = await readBoundedBody(response);
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new TavilySearchError();
  }
}

export async function tavilySearchQuery(
  options: TavilySearchQueryOptions,
  onCall?: (call: TavilySearchCall) => void,
): Promise<MarketSourceRecord[]> {
  assertTavilyConfigured();
  const normalized = normalizedOptions(options);
  const startedAt = Date.now();
  const fetchedAt = new Date().toISOString();
  try {
    const body = await request(TAVILY_SEARCH_URL, {
      query: normalized.query,
      topic: normalized.topic,
      search_depth: "advanced",
      time_range: normalized.timeRange,
      max_results: normalized.maxResults,
      include_answer: false,
      include_raw_content: false,
      include_published_date: true,
      filter_by_published_date: false,
      language: normalized.language,
      country: normalized.country,
    }, process.env.TAVILY_API_KEY!.trim());
    const results = asRecord(body)?.results;
    if (!Array.isArray(results)) throw new TavilySearchError();
    const sources = results.flatMap((result) => {
      const source = sourceFrom(result, fetchedAt);
      return source && source.title && source.snippet ? [source] : [];
    });
    onCall?.({ toolName: "tavily.search", query: normalized.query, status: "completed", durationMs: Date.now() - startedAt, resultCount: sources.length, fetchedAt });
    return dedupeSources(sources);
  } catch (error) {
    onCall?.({ toolName: "tavily.search", query: normalized.query, status: "failed", durationMs: Date.now() - startedAt, fetchedAt });
    throw error instanceof TavilySearchError ? error : new TavilySearchError();
  }
}

export async function tavilyExtractSources(
  urls: readonly string[],
  onCall?: (call: TavilySearchCall) => void,
): Promise<MarketSourceRecord[]> {
  assertTavilyConfigured();
  if (!Array.isArray(urls) || urls.length < 1 || urls.length > MAX_EXTRACT_URLS) throw new TavilySearchError();
  const normalizedUrls = [...new Set(urls.map(normalizedUrl))];
  if (normalizedUrls.length < 1 || normalizedUrls.length > MAX_EXTRACT_URLS) throw new TavilySearchError();
  const query = normalizedUrls.join(", ");
  const startedAt = Date.now();
  const fetchedAt = new Date().toISOString();
  try {
    const body = await request(TAVILY_EXTRACT_URL, { urls: normalizedUrls }, process.env.TAVILY_API_KEY!.trim());
    const results = asRecord(body)?.results;
    if (!Array.isArray(results)) throw new TavilySearchError();
    const sources = results.flatMap((result) => {
      const source = sourceFrom(result, fetchedAt);
      return source && source.title && source.snippet ? [source] : [];
    });
    onCall?.({ toolName: "tavily.extract", query, status: "completed", durationMs: Date.now() - startedAt, resultCount: sources.length, fetchedAt });
    return dedupeSources(sources);
  } catch (error) {
    onCall?.({ toolName: "tavily.extract", query, status: "failed", durationMs: Date.now() - startedAt, fetchedAt });
    throw error instanceof TavilySearchError ? error : new TavilySearchError();
  }
}

export async function tavilySearch(
  queries?: readonly string[],
  onCall?: (call: TavilySearchCall) => void,
): Promise<MarketSourceRecord[]> {
  const selectedQueries = queries === undefined ? SEARCH_QUERIES : queries;
  if (selectedQueries.length < 1 || selectedQueries.length > 3) throw new TavilySearchError();
  const normalizedQueries = selectedQueries.map(normalizedQuery);
  const uniqueQueries = [...new Set(normalizedQueries.map((query) => query.toLocaleLowerCase()))]
    .map((normalized) => normalizedQueries.find((query) => query.toLocaleLowerCase() === normalized)!);
  const results: MarketSourceRecord[] = [];
  for (const query of uniqueQueries) results.push(...await tavilySearchQuery({ query }, onCall));
  return dedupeSources(results);
}
