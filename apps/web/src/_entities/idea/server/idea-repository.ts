import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";

import {
  type DatabaseTransaction,
  getDb,
  ideaRevenueModels,
  ideas,
} from "@smart-idea/database/server";

export type IdeaWithRevenueModels = typeof ideas.$inferSelect & {
  revenueModels: string[];
};

export interface CreateIdeaInput {
  name: string;
  description: string | null;
  industry: string | null;
  problem: string | null;
  targetCustomer: string | null;
  solution: string | null;
  revenueModels: string[];
}

const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

async function createForOwnerInTransaction(
  tx: DatabaseTransaction,
  ownerId: string,
  input: CreateIdeaInput,
) {
  const [idea] = await tx
    .insert(ideas)
    .values({
      userId: ownerId,
      name: input.name,
      description: input.description,
      industry: input.industry,
      problem: input.problem,
      targetCustomer: input.targetCustomer,
      solution: input.solution,
    })
    .returning({ id: ideas.id });

  if (!idea) throw new Error("Idea insert did not return an ID");
  if (input.revenueModels.length > 0) {
    await tx.insert(ideaRevenueModels).values(
      input.revenueModels.map((name) => ({ ideaId: idea.id, name })),
    );
  }
  return idea.id;
}

export const ideaRepository = {
  async listByOwner(ownerId: string): Promise<IdeaWithRevenueModels[]> {
    const db = getDb();
    const ownedIdeas = await db
      .select()
      .from(ideas)
      .where(eq(ideas.userId, ownerId))
      .orderBy(desc(ideas.updatedAt));

    if (ownedIdeas.length === 0) return [];

    const revenueRows = await db
      .select({ ideaId: ideaRevenueModels.ideaId, name: ideaRevenueModels.name })
      .from(ideaRevenueModels)
      .innerJoin(ideas, eq(ideaRevenueModels.ideaId, ideas.id))
      .where(
        and(
          eq(ideas.userId, ownerId),
          inArray(
            ideaRevenueModels.ideaId,
            ownedIdeas.map((idea) => idea.id),
          ),
        ),
      );

    const labelsByIdea = new Map<string, string[]>();
    for (const row of revenueRows) {
      const labels = labelsByIdea.get(row.ideaId) ?? [];
      labels.push(row.name);
      labelsByIdea.set(row.ideaId, labels);
    }

    return ownedIdeas.map((idea) => ({
      ...idea,
      revenueModels: labelsByIdea.get(idea.id) ?? [],
    }));
  },

  async findByIdForOwner(
    id: string,
    ownerId: string,
  ): Promise<IdeaWithRevenueModels | null> {
    if (!uuidPattern.test(id)) return null;

    const db = getDb();
    const [idea] = await db
      .select()
      .from(ideas)
      .where(and(eq(ideas.id, id), eq(ideas.userId, ownerId)))
      .limit(1);

    if (!idea) return null;

    const revenueRows = await db
      .select({ name: ideaRevenueModels.name })
      .from(ideaRevenueModels)
      .innerJoin(ideas, eq(ideaRevenueModels.ideaId, ideas.id))
      .where(
        and(
          eq(ideas.id, id),
          eq(ideas.userId, ownerId),
        ),
      );

    return { ...idea, revenueModels: revenueRows.map((row) => row.name) };
  },

  async createForOwner(ownerId: string, input: CreateIdeaInput) {
    const db = getDb();
    return db.transaction((tx) => createForOwnerInTransaction(tx, ownerId, input));
  },

  createForOwnerInTransaction,

  async updateForOwner(
    id: string,
    ownerId: string,
    input: CreateIdeaInput,
  ): Promise<boolean> {
    if (!uuidPattern.test(id)) return false;

    const db = getDb();
    return db.transaction(async (tx) => {
      const [updatedIdea] = await tx
        .update(ideas)
        .set({
          name: input.name,
          description: input.description,
          industry: input.industry,
          problem: input.problem,
          targetCustomer: input.targetCustomer,
          solution: input.solution,
          updatedAt: new Date(),
        })
        .where(and(eq(ideas.id, id), eq(ideas.userId, ownerId)))
        .returning({ id: ideas.id });

      if (!updatedIdea) return false;

      await tx
        .delete(ideaRevenueModels)
        .where(eq(ideaRevenueModels.ideaId, id));

      if (input.revenueModels.length > 0) {
        await tx.insert(ideaRevenueModels).values(
          input.revenueModels.map((name) => ({ ideaId: id, name })),
        );
      }

      return true;
    });
  },

  async deleteForOwner(id: string, ownerId: string): Promise<boolean> {
    if (!uuidPattern.test(id)) return false;

    const [deletedIdea] = await getDb()
      .delete(ideas)
      .where(and(eq(ideas.id, id), eq(ideas.userId, ownerId)))
      .returning({ id: ideas.id });

    return Boolean(deletedIdea);
  },
};
