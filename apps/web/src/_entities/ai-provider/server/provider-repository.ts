import "server-only";

import { and, desc, eq, ne } from "drizzle-orm";

import { aiProviders, getDb, openaiOAuthAccounts } from "@smart-idea/database/server";
import { encryptCredential, isCredentialEncryptionConfigured } from "./credential-cipher";
import { decryptCredential } from "./credential-cipher";
import { getValidOpenAiAccessToken } from "./openai-oauth";
import type { AiProviderInput } from "./provider-input";

export interface AiProviderView {
  id: string;
  name: string;
  providerType: string;
  baseUrl: string;
  models: string[];
  model: string;
  isEnabled: boolean;
  apiKeyConfigured: boolean;
}

export class AiProviderKeyRequiredError extends Error {}
export class AiCredentialsNotConfiguredError extends Error {}
export class AiProviderNotConfiguredError extends Error {}
export class AiProviderCredentialUnavailableError extends Error {}

export type AiProviderForInference = {
  id: string;
  name: string;
  providerType: string;
  baseUrl: string;
  model: string;
} & (
  | { credentialType: "api-key"; apiKey: string }
  | { credentialType: "oauth"; accessToken: string }
);

function toView(row: typeof aiProviders.$inferSelect): AiProviderView {
  return {
    id: row.id,
    name: row.name,
    providerType: row.providerType,
    baseUrl: row.baseUrl,
    models: row.models,
    model: row.model,
    isEnabled: row.isEnabled,
    apiKeyConfigured: Boolean(row.apiKeyCiphertext),
  };
}

function encryptedKey(input: AiProviderInput) {
  if (input.apiKey && !isCredentialEncryptionConfigured()) {
    throw new AiCredentialsNotConfiguredError();
  }
  return input.apiKey ? encryptCredential(input.apiKey) : null;
}

async function listByOwner(ownerId: string) {
  const rows = await getDb()
    .select()
    .from(aiProviders)
    .where(eq(aiProviders.ownerId, ownerId))
    .orderBy(desc(aiProviders.updatedAt));
  return rows.map(toView);
}

export const providerRepository = {
  listByOwner,

  async getEnabledForInference(ownerId: string): Promise<AiProviderForInference> {
    const [provider] = await getDb()
      .select()
      .from(aiProviders)
      .where(and(eq(aiProviders.ownerId, ownerId), eq(aiProviders.isEnabled, true)))
      .limit(1);
    if (!provider) throw new AiProviderNotConfiguredError();

    const base = {
      id: provider.id,
      name: provider.name,
      providerType: provider.providerType,
      baseUrl: provider.baseUrl,
      model: provider.model,
    };
    if (provider.providerType === "oauth") {
      let accessToken: string | null;
      try {
        accessToken = await getValidOpenAiAccessToken(ownerId);
      } catch {
        throw new AiProviderCredentialUnavailableError();
      }
      if (!accessToken) throw new AiProviderCredentialUnavailableError();
      return { ...base, credentialType: "oauth", accessToken };
    }

    if (!provider.apiKeyCiphertext) throw new AiProviderCredentialUnavailableError();
    try {
      return {
        ...base,
        credentialType: "api-key",
        apiKey: decryptCredential(provider.apiKeyCiphertext),
      };
    } catch {
      throw new AiProviderCredentialUnavailableError();
    }
  },

  async createForOwner(ownerId: string, input: AiProviderInput) {
    const apiKeyCiphertext = encryptedKey(input);
    if (input.isEnabled && !apiKeyCiphertext) throw new AiProviderKeyRequiredError();
    if (input.isEnabled && !isCredentialEncryptionConfigured()) {
      throw new AiCredentialsNotConfiguredError();
    }

    const db = getDb();
    await db.transaction(async (tx) => {
      if (input.isEnabled) {
        await tx
          .update(aiProviders)
          .set({ isEnabled: false, updatedAt: new Date() })
          .where(and(eq(aiProviders.ownerId, ownerId), eq(aiProviders.isEnabled, true)));
      }
      await tx.insert(aiProviders).values({
        ownerId,
        name: input.name,
        providerType: input.providerType,
        baseUrl: input.baseUrl,
        apiKeyCiphertext,
        models: input.models,
        model: input.model,
        isEnabled: input.isEnabled,
      });
    });
    return listByOwner(ownerId);
  },

  async updateForOwner(ownerId: string, id: string, input: AiProviderInput) {
    const db = getDb();
    const updated = await db.transaction(async (tx) => {
      const ownerProviders = await tx
        .select({
          id: aiProviders.id,
          apiKeyCiphertext: aiProviders.apiKeyCiphertext,
          providerType: aiProviders.providerType,
        })
        .from(aiProviders)
        .where(eq(aiProviders.ownerId, ownerId))
        .orderBy(aiProviders.id)
        .for("update");
      const existing = ownerProviders.find((provider) => provider.id === id);
      if (!existing || existing.providerType === "oauth") return false;

      const apiKeyCiphertext = input.clearApiKey
        ? null
        : input.apiKey
          ? encryptedKey(input)
          : undefined;
      const hasApiKey =
        apiKeyCiphertext === undefined
          ? Boolean(existing.apiKeyCiphertext)
          : Boolean(apiKeyCiphertext);
      if (input.isEnabled && !hasApiKey) throw new AiProviderKeyRequiredError();
      if (input.isEnabled && !isCredentialEncryptionConfigured()) {
        throw new AiCredentialsNotConfiguredError();
      }

      if (input.isEnabled) {
        await tx
          .update(aiProviders)
          .set({ isEnabled: false, updatedAt: new Date() })
          .where(
            and(
              eq(aiProviders.ownerId, ownerId),
              eq(aiProviders.isEnabled, true),
              ne(aiProviders.id, id),
            ),
          );
      }

      await tx
        .update(aiProviders)
        .set({
          name: input.name,
          providerType: input.providerType,
          baseUrl: input.baseUrl,
          ...(apiKeyCiphertext === undefined ? {} : { apiKeyCiphertext }),
          models: input.models,
          model: input.model,
          isEnabled: input.isEnabled,
          updatedAt: new Date(),
        })
        .where(and(eq(aiProviders.ownerId, ownerId), eq(aiProviders.id, id)));
      return true;
    });
    if (!updated) return null;
    return listByOwner(ownerId);
  },

  async updateOAuthForOwner(
    ownerId: string,
    id: string,
    model: string,
    isEnabled: boolean,
  ) {
    const db = getDb();
    const updated = await db.transaction(async (tx) => {
      const [account] = await tx
        .select({ ownerId: openaiOAuthAccounts.ownerId })
        .from(openaiOAuthAccounts)
        .where(eq(openaiOAuthAccounts.ownerId, ownerId))
        .for("update")
        .limit(1);
      if (!account) return false;

      const providers = await tx
        .select({
          id: aiProviders.id,
          providerType: aiProviders.providerType,
          models: aiProviders.models,
        })
        .from(aiProviders)
        .where(eq(aiProviders.ownerId, ownerId))
        .orderBy(aiProviders.id)
        .for("update");
      const existing = providers.find((provider) => provider.id === id);
      if (
        !existing ||
        existing.providerType !== "oauth" ||
        !existing.models.includes(model)
      ) {
        return false;
      }

      if (isEnabled) {
        await tx
          .update(aiProviders)
          .set({ isEnabled: false, updatedAt: new Date() })
          .where(
            and(
              eq(aiProviders.ownerId, ownerId),
              eq(aiProviders.isEnabled, true),
              ne(aiProviders.id, id),
            ),
          );
      }
      await tx
        .update(aiProviders)
        .set({ model, isEnabled, updatedAt: new Date() })
        .where(and(eq(aiProviders.ownerId, ownerId), eq(aiProviders.id, id)));
      return true;
    });
    if (!updated) return null;
    return listByOwner(ownerId);
  },

  async deleteForOwner(ownerId: string, id: string) {
    const [deleted] = await getDb()
      .delete(aiProviders)
      .where(
        and(
          eq(aiProviders.ownerId, ownerId),
          eq(aiProviders.id, id),
          ne(aiProviders.providerType, "oauth"),
        ),
      )
      .returning({ id: aiProviders.id });
    return Boolean(deleted);
  },
};
