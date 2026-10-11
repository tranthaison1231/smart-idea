import type { MarketSourceRecord } from "@smart-idea/database/server";

export interface CompetitorDraft {
  companyName: string;
  productName: string | null;
  website: string | null;
  overview: string;
  targetCustomer: string | null;
  keyFeatures: string[];
  pricing: string | null;
  strengths: string[];
  weaknesses: string[];
  sources: MarketSourceRecord[];
}

export interface IdeaCompetitorView extends CompetitorDraft {
  id: string;
  createdAt: string;
}

export interface CompetitorResearchProof {
  expiresAt: number;
  signature: string;
}

export interface CompetitorResearchDraft {
  competitors: CompetitorDraft[];
  proof: CompetitorResearchProof;
}

export type CompetitorResearchErrorCode =
  | "idea_not_found"
  | "provider_not_configured"
  | "provider_credentials_unavailable"
  | "tavily_not_configured"
  | "source_search_failed"
  | "provider_unsupported"
  | "provider_unavailable"
  | "provider_response_invalid"
  | "invalid_ai_response"
  | "invalid_draft"
  | "server_configuration_unavailable";
