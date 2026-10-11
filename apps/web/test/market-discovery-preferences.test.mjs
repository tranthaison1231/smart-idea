import assert from "node:assert/strict";
import test from "node:test";

const preferencesModule = await import("../src/_entities/market-discovery/model/market-discovery-preferences.ts").catch(() => null);

test("market discovery preferences parse custom labels and reject invalid market selections", () => {
  const parse = preferencesModule?.parseMarketDiscoveryPreferences;
  assert.equal(typeof parse, "function", "preference parser is not implemented yet");
  if (typeof parse !== "function") return;

  assert.deepEqual(parse({
    markets: ["  Việt Nam ", "việt nam", "United States"],
    topics: [" AI ", "Fintech"],
    revenueModels: ["Subscription / SaaS"],
    customerSegments: ["SME"],
  }), {
    markets: ["Việt Nam", "United States"],
    topics: ["AI", "Fintech"],
    revenueModels: ["Subscription / SaaS"],
    customerSegments: ["SME"],
    hiddenTags: { markets: [], topics: [], revenueModels: [], customerSegments: [] },
  });
  assert.deepEqual(parse({ markets: ["Vietnam"], topics: [], revenueModels: [], customerSegments: [] }), {
    markets: ["Vietnam"], topics: [], revenueModels: [], customerSegments: [],
    hiddenTags: { markets: [], topics: [], revenueModels: [], customerSegments: [] },
  });
  assert.equal(parse({ markets: ["Vietnam", "USA", "Japan", "Singapore"], topics: [], revenueModels: [], customerSegments: [] }), null);
  assert.deepEqual(parse({ markets: [], topics: [], revenueModels: [], customerSegments: [] }), {
    markets: [], topics: [], revenueModels: [], customerSegments: [],
    hiddenTags: { markets: [], topics: [], revenueModels: [], customerSegments: [] },
  });
  assert.equal(parse({ markets: ["Vietnam"], topics: [], revenueModels: [], customerSegments: [], ownerId: "another-user" }), null);
  assert.equal(parse({ markets: ["Vietnam"], topics: ["x".repeat(81)], revenueModels: [], customerSegments: [] }), null);
});

test("search query builder creates at most three bounded queries covering selected markets", () => {
  const buildQueries = preferencesModule?.buildMarketDiscoveryQueries;
  assert.equal(typeof buildQueries, "function", "query builder is not implemented yet");
  if (typeof buildQueries !== "function") return;

  const queries = buildQueries({
    markets: ["Việt Nam", "United States", "Southeast Asia"],
    topics: ["AI"],
    revenueModels: ["Subscription / SaaS"],
    customerSegments: ["SME"],
  });

  assert.equal(queries.length, 3);
  for (const market of ["Việt Nam", "United States", "Southeast Asia"]) {
    assert.ok(queries.some((query) => query.includes(market)), `no search query covers ${market}`);
  }
  assert.ok(queries.every((query) => query.length <= 240));
});
