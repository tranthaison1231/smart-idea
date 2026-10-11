export interface MarketDiscoveryPreferences {
  markets: string[];
  topics: string[];
  revenueModels: string[];
  customerSegments: string[];
  hiddenTags: {
    markets: string[];
    topics: string[];
    revenueModels: string[];
    customerSegments: string[];
  };
}

export const DEFAULT_MARKET_DISCOVERY_PREFERENCES: MarketDiscoveryPreferences = {
  markets: ["Việt Nam"],
  topics: [],
  revenueModels: [],
  customerSegments: [],
  hiddenTags: { markets: [], topics: [], revenueModels: [], customerSegments: [] },
};

function parseLabels(value: unknown, maxItems: number): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") return null;
    const label = item.trim();
    if (!label || label.length > 80) return null;
    const key = label.toLocaleLowerCase();
    if (!seen.has(key)) {
      labels.push(label);
      seen.add(key);
    }
  }
  return labels;
}

export function parseMarketDiscoveryPreferences(value: unknown): MarketDiscoveryPreferences | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const allowedKeys = ["markets", "topics", "revenueModels", "customerSegments", "hiddenTags"];
  if (Object.keys(record).some((key) => !allowedKeys.includes(key))) return null;

  const markets = parseLabels(record.markets, 3);
  const topics = parseLabels(record.topics, 8);
  const revenueModels = parseLabels(record.revenueModels, 8);
  const customerSegments = parseLabels(record.customerSegments, 8);
  const hidden = record.hiddenTags === undefined ? {} : record.hiddenTags;
  if (typeof hidden !== "object" || hidden === null || Array.isArray(hidden)) return null;
  const hiddenRecord = hidden as Record<string, unknown>;
  const hiddenKeys = ["markets", "topics", "revenueModels", "customerSegments"];
  if (Object.keys(hiddenRecord).some((key) => !hiddenKeys.includes(key))) return null;
  const hiddenTags = {
    markets: parseLabels(hiddenRecord.markets ?? [], 16),
    topics: parseLabels(hiddenRecord.topics ?? [], 16),
    revenueModels: parseLabels(hiddenRecord.revenueModels ?? [], 16),
    customerSegments: parseLabels(hiddenRecord.customerSegments ?? [], 16),
  };
  if (!markets || !topics || !revenueModels || !customerSegments || Object.values(hiddenTags).some((labels) => !labels)) return null;
  return { markets, topics, revenueModels, customerSegments, hiddenTags: hiddenTags as MarketDiscoveryPreferences["hiddenTags"] };
}

export function buildMarketDiscoveryQueries(preferences: MarketDiscoveryPreferences): string[] {
  const templates = [
    (market: string, focus: string) => `${market} ${focus || "sản phẩm số"} nhu cầu chưa được đáp ứng gần đây`,
    (market: string, focus: string) => `${market} ${focus || "mô hình doanh thu"} SaaS sản phẩm số xu hướng`,
    (market: string, focus: string) => `${market} ${focus || "doanh nghiệp"} vấn đề vận hành số hóa cơ hội sản phẩm`,
  ];
  return templates.map((template, index) => {
    const market = preferences.markets.length
      ? preferences.markets[index % preferences.markets.length]
      : "nhiều thị trường";
    const focus = [preferences.topics, preferences.revenueModels, preferences.customerSegments][index][0] ?? "";
    return template(market, focus).slice(0, 240);
  });
}
