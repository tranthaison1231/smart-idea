import "server-only";

import { and, asc, eq } from "drizzle-orm";

import {
  getDb,
  ideaCompetitors,
  ideas,
} from "@smart-idea/database/server";
import type { IdeaCompetitorView } from "../model/competitor-research";

export type IdeaCompetitor = typeof ideaCompetitors.$inferSelect;
export type IdeaCompetitorInsert = Omit<
  typeof ideaCompetitors.$inferInsert,
  "id" | "ideaId" | "createdAt"
>;

export function toIdeaCompetitorView(row: IdeaCompetitor): IdeaCompetitorView {
  return {
    id: row.id,
    companyName: row.companyName,
    productName: row.productName,
    website: row.website,
    overview: row.overview,
    targetCustomer: row.targetCustomer,
    keyFeatures: row.keyFeatures,
    pricing: row.pricing,
    strengths: row.strengths,
    weaknesses: row.weaknesses,
    sources: row.sources,
    createdAt: row.createdAt.toISOString(),
  };
}

const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export const ideaCompetitorRepository = {
  async listByIdeaForOwner(ideaId: string, ownerId: string): Promise<IdeaCompetitor[]> {
    if (!uuidPattern.test(ideaId)) return [];

    return getDb()
      .select({ competitor: ideaCompetitors })
      .from(ideaCompetitors)
      .innerJoin(ideas, eq(ideaCompetitors.ideaId, ideas.id))
      .where(and(eq(ideas.id, ideaId), eq(ideas.userId, ownerId)))
      .orderBy(asc(ideaCompetitors.createdAt))
      .then((rows) => rows.map(({ competitor }) => competitor));
  },

  async replaceForOwner(
    ideaId: string,
    ownerId: string,
    competitors: IdeaCompetitorInsert[],
  ): Promise<IdeaCompetitor[] | null> {
    if (!uuidPattern.test(ideaId)) return null;

    return getDb().transaction(async (tx) => {
      const [ownedIdea] = await tx
        .select({ id: ideas.id })
        .from(ideas)
        .where(and(eq(ideas.id, ideaId), eq(ideas.userId, ownerId)))
        .for("update")
        .limit(1);
      if (!ownedIdea) return null;

      await tx.delete(ideaCompetitors).where(eq(ideaCompetitors.ideaId, ideaId));
      if (competitors.length === 0) return [];

      return tx
        .insert(ideaCompetitors)
        .values(competitors.map((competitor) => ({ ...competitor, ideaId })))
        .returning();
    });
  },
};
