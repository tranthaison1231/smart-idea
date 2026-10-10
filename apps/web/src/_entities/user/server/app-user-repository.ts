import "server-only";

import { eq } from "drizzle-orm";

import { appUsers, getDb } from "@smart-idea/database/server";

export interface AuthIdentity {
  id: string;
  email: string;
  name: string;
}

export interface CurrentAppUser {
  id: string;
  externalAuthId: string;
  displayName: string;
  email: string;
}

export const appUserRepository = {
  async resolve(identity: AuthIdentity): Promise<CurrentAppUser> {
    const db = getDb();
    const [existing] = await db
      .select()
      .from(appUsers)
      .where(eq(appUsers.externalAuthId, identity.id))
      .limit(1);

    if (existing) return { ...existing, email: identity.email };

    await db
      .insert(appUsers)
      .values({
        externalAuthId: identity.id,
        displayName: identity.name || identity.email.split("@")[0] || "Người dùng",
      })
      .onConflictDoNothing({ target: appUsers.externalAuthId });

    const [provisioned] = await db
      .select()
      .from(appUsers)
      .where(eq(appUsers.externalAuthId, identity.id))
      .limit(1);

    if (!provisioned) {
      throw new Error("App user provisioning did not produce a record");
    }

    return { ...provisioned, email: identity.email };
  },
};
