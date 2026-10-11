import type { MarketSourceRecord } from "@smart-idea/database/server";

export type OpportunityConfidence = "low" | "medium" | "high";
export type MarketSourceCitation = Omit<MarketSourceRecord, "snippet">;

export interface OpportunityDraft {
  productName: string;
  problem: string;
  targetCustomer: string;
  solution: string;
  whyNow: string;
  revenueModels: string[];
  confidence: OpportunityConfidence;
  confidenceRationale: string;
  sourceIds: string[];
}

export interface MarketDiscoveryOpportunity extends OpportunityDraft {
  id: string;
  savedIdeaId: string | null;
  sources: MarketSourceCitation[];
}

export interface MarketDiscoveryRunView {
  id: string;
  marketDate: string;
  createdAt: string;
  fetchedAt: string | null;
  stale: boolean;
  providerType: string;
  providerModel: string;
  opportunities: MarketDiscoveryOpportunity[];
}

export interface MarketDiscoveryFeed {
  history: MarketDiscoveryRunView[];
}

export class MarketDiscoveryError extends Error {
  constructor(
    readonly code: string,
    readonly status = 500,
  ) {
    super(code);
  }
}
