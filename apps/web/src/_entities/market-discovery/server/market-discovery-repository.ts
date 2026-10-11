import "server-only";

import { and, desc, eq, inArray, lte, or, sql } from "drizzle-orm";

import {
  getDb,
  marketDiscoveryOpportunities,
  marketDiscoveryPreferences,
  marketDiscoveryRuns,
  marketDiscoverySnapshots,
} from "@smart-idea/database/server";
import type { MarketDiscoveryPreferences } from "../model/market-discovery-preferences";

export const DISCOVERY_QUERY_VERSION = "vn-product-opportunities-v1";
const SNAPSHOT_LEASE_MS = 2 * 60 * 1000;
const RUN_LEASE_MS = 2 * 60 * 1000;

export type MarketDiscoverySnapshot = typeof marketDiscoverySnapshots.$inferSelect;

export function vietnamMarketDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export const marketDiscoveryRepository = {
  async findPreferences(ownerId: string) {
    const [preferences] = await getDb()
      .select()
      .from(marketDiscoveryPreferences)
      .where(eq(marketDiscoveryPreferences.ownerId, ownerId))
      .limit(1);
    return preferences ?? null;
  },

  async savePreferences(ownerId: string, preferences: MarketDiscoveryPreferences) {
    const [saved] = await getDb()
      .insert(marketDiscoveryPreferences)
      .values({ ownerId, ...preferences, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: marketDiscoveryPreferences.ownerId,
        set: { ...preferences, updatedAt: new Date() },
      })
      .returning({
        markets: marketDiscoveryPreferences.markets,
        topics: marketDiscoveryPreferences.topics,
        revenueModels: marketDiscoveryPreferences.revenueModels,
        customerSegments: marketDiscoveryPreferences.customerSegments,
        hiddenTags: marketDiscoveryPreferences.hiddenTags,
      });
    if (!saved) throw new Error("Market discovery preferences save failed");
    return saved;
  },

  async findDailySnapshot(marketDate: string) {
    const [snapshot] = await getDb()
      .select()
      .from(marketDiscoverySnapshots)
      .where(and(
        eq(marketDiscoverySnapshots.marketDate, marketDate),
        eq(marketDiscoverySnapshots.queryVersion, DISCOVERY_QUERY_VERSION),
        eq(marketDiscoverySnapshots.scope, "daily"),
      ))
      .limit(1);
    return snapshot ?? null;
  },

  async reserveDailySnapshot(marketDate: string) {
    const db = getDb();
    const now = new Date();
    const [inserted] = await db
      .insert(marketDiscoverySnapshots)
      .values({
        marketDate,
        scope: "daily",
        ownerId: null,
        queryVersion: DISCOVERY_QUERY_VERSION,
        state: "pending",
        leaseExpiresAt: new Date(now.getTime() + SNAPSHOT_LEASE_MS),
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) return { snapshot: inserted, claimed: true };

    const existing = await this.findDailySnapshot(marketDate);
    if (!existing) throw new Error("Daily market snapshot reservation failed");
    if (existing.state === "ready") return { snapshot: existing, claimed: false };
    if (existing.leaseExpiresAt && existing.leaseExpiresAt > now) return { snapshot: existing, claimed: false };

    const [reclaimed] = await db
      .update(marketDiscoverySnapshots)
      .set({ state: "pending", errorCode: null, leaseExpiresAt: new Date(now.getTime() + SNAPSHOT_LEASE_MS) })
      .where(and(
        eq(marketDiscoverySnapshots.id, existing.id),
        or(
          eq(marketDiscoverySnapshots.state, "failed"),
          lte(marketDiscoverySnapshots.leaseExpiresAt, now),
        ),
      ))
      .returning();
    return reclaimed
      ? { snapshot: reclaimed, claimed: true }
      : { snapshot: (await this.findDailySnapshot(marketDate)) ?? existing, claimed: false };
  },

  async reserveManualSnapshot(ownerId: string, marketDate: string) {
    const db = getDb();
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`market-discovery:${ownerId}`}, 0))`);
      const now = new Date();
      const [latest] = await tx
        .select()
        .from(marketDiscoverySnapshots)
        .where(and(
          eq(marketDiscoverySnapshots.ownerId, ownerId),
          eq(marketDiscoverySnapshots.scope, "manual"),
        ))
        .orderBy(desc(marketDiscoverySnapshots.createdAt))
        .limit(1);
      if (latest?.state === "pending") {
        if (!latest.leaseExpiresAt || latest.leaseExpiresAt <= now) {
          const [reclaimed] = await tx
            .update(marketDiscoverySnapshots)
            .set({ leaseExpiresAt: new Date(now.getTime() + SNAPSHOT_LEASE_MS), errorCode: null })
            .where(and(eq(marketDiscoverySnapshots.id, latest.id), eq(marketDiscoverySnapshots.state, "pending")))
            .returning();
          if (reclaimed) return { snapshot: reclaimed, claimed: true };
        }
        return { snapshot: latest, claimed: false };
      }

      const [snapshot] = await tx
        .insert(marketDiscoverySnapshots)
        .values({
          marketDate,
          scope: "manual",
          ownerId,
          queryVersion: DISCOVERY_QUERY_VERSION,
          state: "pending",
          leaseExpiresAt: new Date(now.getTime() + SNAPSHOT_LEASE_MS),
        })
        .returning();
      if (!snapshot) throw new Error("Manual market snapshot reservation failed");
      return { snapshot, claimed: true };
    });
  },

  async completeSnapshot(id: string, sources: MarketDiscoverySnapshot["sources"]) {
    const [snapshot] = await getDb()
      .update(marketDiscoverySnapshots)
      .set({ state: "ready", sources, fetchedAt: new Date(), leaseExpiresAt: null, errorCode: null })
      .where(and(eq(marketDiscoverySnapshots.id, id), eq(marketDiscoverySnapshots.state, "pending")))
      .returning();
    return snapshot ?? null;
  },

  async failSnapshot(id: string, errorCode = "source_search_failed") {
    await getDb()
      .update(marketDiscoverySnapshots)
      .set({ state: "failed", errorCode, leaseExpiresAt: null })
      .where(and(eq(marketDiscoverySnapshots.id, id), eq(marketDiscoverySnapshots.state, "pending")));
  },

  async latestReadySnapshotForOwner(ownerId: string) {
    const [snapshot] = await getDb()
      .select()
      .from(marketDiscoverySnapshots)
      .where(and(
        eq(marketDiscoverySnapshots.state, "ready"),
        or(
          eq(marketDiscoverySnapshots.scope, "daily"),
          eq(marketDiscoverySnapshots.ownerId, ownerId),
        ),
      ))
      .orderBy(desc(marketDiscoverySnapshots.fetchedAt))
      .limit(1);
    return snapshot ?? null;
  },

  async reserveRun(ownerId: string, snapshotId: string, providerType: string, providerModel: string, stale: boolean) {
    const db = getDb();
    const now = new Date();
    const [inserted] = await db
      .insert(marketDiscoveryRuns)
      .values({
        ownerId,
        snapshotId,
        providerType,
        providerModel,
        state: "pending",
        stale,
        leaseExpiresAt: new Date(now.getTime() + RUN_LEASE_MS),
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) return { run: inserted, claimed: true };

    const [existing] = await db
      .select()
      .from(marketDiscoveryRuns)
      .where(and(eq(marketDiscoveryRuns.ownerId, ownerId), eq(marketDiscoveryRuns.snapshotId, snapshotId)))
      .limit(1);
    if (!existing) throw new Error("Market discovery run reservation failed");
    if (existing.state === "ready") {
      if (stale && !existing.stale) {
        const [updated] = await db
          .update(marketDiscoveryRuns)
          .set({ stale: true, updatedAt: now })
          .where(eq(marketDiscoveryRuns.id, existing.id))
          .returning();
        return { run: updated ?? existing, claimed: false };
      }
      return { run: existing, claimed: false };
    }
    if (existing.leaseExpiresAt && existing.leaseExpiresAt > now) return { run: existing, claimed: false };

    const [reclaimed] = await db
      .update(marketDiscoveryRuns)
      .set({
        state: "pending",
        providerType,
        providerModel,
        stale,
        errorCode: null,
        leaseExpiresAt: new Date(now.getTime() + RUN_LEASE_MS),
        updatedAt: now,
      })
      .where(and(
        eq(marketDiscoveryRuns.id, existing.id),
        or(eq(marketDiscoveryRuns.state, "failed"), lte(marketDiscoveryRuns.leaseExpiresAt, now)),
      ))
      .returning();
    return reclaimed
      ? { run: reclaimed, claimed: true }
      : { run: (await this.findRun(ownerId, snapshotId)) ?? existing, claimed: false };
  },

  async findRun(ownerId: string, snapshotId: string) {
    const [run] = await getDb()
      .select()
      .from(marketDiscoveryRuns)
      .where(and(eq(marketDiscoveryRuns.ownerId, ownerId), eq(marketDiscoveryRuns.snapshotId, snapshotId)))
      .limit(1);
    return run ?? null;
  },

  async completeRun(runId: string, ownerId: string, opportunities: Array<{
    productName: string;
    problem: string;
    targetCustomer: string;
    solution: string;
    whyNow: string;
    revenueModels: string[];
    confidence: string;
    confidenceRationale: string;
    sourceIds: string[];
  }>) {
    const db = getDb();
    await db.transaction(async (tx) => {
      await tx.insert(marketDiscoveryOpportunities).values(
        opportunities.map((opportunity) => ({ ...opportunity, runId, ownerId })),
      );
      const [updated] = await tx
        .update(marketDiscoveryRuns)
        .set({ state: "ready", errorCode: null, leaseExpiresAt: null, updatedAt: new Date() })
        .where(and(
          eq(marketDiscoveryRuns.id, runId),
          eq(marketDiscoveryRuns.ownerId, ownerId),
          eq(marketDiscoveryRuns.state, "pending"),
        ))
        .returning({ id: marketDiscoveryRuns.id });
      if (!updated) throw new Error("Market discovery run is no longer pending");
    });
  },

  async failRun(runId: string, ownerId: string, errorCode: string) {
    await getDb()
      .update(marketDiscoveryRuns)
      .set({ state: "failed", errorCode, leaseExpiresAt: null, updatedAt: new Date() })
      .where(and(
        eq(marketDiscoveryRuns.id, runId),
        eq(marketDiscoveryRuns.ownerId, ownerId),
        eq(marketDiscoveryRuns.state, "pending"),
      ));
  },

  async listHistory(ownerId: string) {
    const runs = await getDb()
      .select({
        run: marketDiscoveryRuns,
        snapshot: marketDiscoverySnapshots,
      })
      .from(marketDiscoveryRuns)
      .innerJoin(marketDiscoverySnapshots, eq(marketDiscoveryRuns.snapshotId, marketDiscoverySnapshots.id))
      .where(and(eq(marketDiscoveryRuns.ownerId, ownerId), eq(marketDiscoveryRuns.state, "ready")))
      .orderBy(desc(marketDiscoveryRuns.createdAt))
      // shortcut: show the latest 30 runs; add cursor pagination when users need older history.
      .limit(30);
    if (!runs.length) return [];

    const opportunities = await getDb()
      .select()
      .from(marketDiscoveryOpportunities)
      .where(and(
        eq(marketDiscoveryOpportunities.ownerId, ownerId),
        inArray(marketDiscoveryOpportunities.runId, runs.map(({ run }) => run.id)),
      ));
    const opportunitiesByRun = new Map<string, typeof opportunities>();
    for (const opportunity of opportunities) {
      const rows = opportunitiesByRun.get(opportunity.runId) ?? [];
      rows.push(opportunity);
      opportunitiesByRun.set(opportunity.runId, rows);
    }
    return runs.map(({ run, snapshot }) => ({
      id: run.id,
      marketDate: snapshot.marketDate,
      createdAt: run.createdAt,
      fetchedAt: snapshot.fetchedAt,
      stale: run.stale,
      providerType: run.providerType,
      providerModel: run.providerModel,
      sources: snapshot.sources,
      opportunities: opportunitiesByRun.get(run.id) ?? [],
    }));
  },
};
