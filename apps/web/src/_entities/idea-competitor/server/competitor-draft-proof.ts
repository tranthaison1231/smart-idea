import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type {
  CompetitorDraft,
  CompetitorResearchProof,
} from "../model/competitor-research";

const PROOF_TTL_MS = 15 * 60 * 1000;
const PROOF_PURPOSE = "smart-idea:idea-competitor-draft:v1";

function proofKey() {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("draft_proof_configuration_unavailable");
  return createHmac("sha256", secret).update(PROOF_PURPOSE).digest();
}

function signatureFor(ownerId: string, ideaId: string, expiresAt: number, competitors: CompetitorDraft[]) {
  const canonicalDraft = JSON.stringify(competitors.map((competitor) => ({
    companyName: competitor.companyName,
    productName: competitor.productName,
    website: competitor.website,
    overview: competitor.overview,
    targetCustomer: competitor.targetCustomer,
    keyFeatures: competitor.keyFeatures,
    pricing: competitor.pricing,
    strengths: competitor.strengths,
    weaknesses: competitor.weaknesses,
    sources: competitor.sources.map((source) => ({
      id: source.id,
      title: source.title,
      url: source.url,
      domain: source.domain,
      snippet: source.snippet,
      publishedAt: source.publishedAt,
    })),
  })));
  const draftHash = createHash("sha256").update(canonicalDraft).digest("hex");
  return createHmac("sha256", proofKey())
    .update(JSON.stringify([ownerId, ideaId, expiresAt, draftHash]))
    .digest();
}

export function createCompetitorDraftProof(
  ownerId: string,
  ideaId: string,
  competitors: CompetitorDraft[],
): CompetitorResearchProof {
  const expiresAt = Date.now() + PROOF_TTL_MS;
  return {
    expiresAt,
    signature: signatureFor(ownerId, ideaId, expiresAt, competitors).toString("base64url"),
  };
}

export function verifyCompetitorDraftProof(
  ownerId: string,
  ideaId: string,
  competitors: CompetitorDraft[],
  proof: unknown,
): boolean {
  if (typeof proof !== "object" || proof === null || Array.isArray(proof)) return false;
  const value = proof as Record<string, unknown>;
  if (
    Object.keys(value).length !== 2 ||
    !Number.isSafeInteger(value.expiresAt) ||
    typeof value.signature !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(value.signature)
  ) return false;

  const expiresAt = value.expiresAt as number;
  const now = Date.now();
  if (expiresAt <= now || expiresAt > now + PROOF_TTL_MS) return false;

  const supplied = Buffer.from(value.signature, "base64url");
  const expected = signatureFor(ownerId, ideaId, expiresAt, competitors);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
