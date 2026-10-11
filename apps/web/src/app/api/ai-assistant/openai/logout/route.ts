import { disconnectOpenAiOAuth } from "@/_entities/ai-provider/index.server";
import { getCurrentAppUser } from "@/_features/auth/index.server";
import { oauthError, oauthJson } from "../_responses";

export const runtime = "nodejs";

export async function POST() {
  let user;
  try {
    user = await getCurrentAppUser();
  } catch {
    return oauthJson({ error: "auth_failed" }, 500);
  }
  if (!user) return oauthJson({ error: "unauthorized" }, 401);

  try {
    return oauthJson(await disconnectOpenAiOAuth(user.id));
  } catch (error) {
    const response = oauthError(error);
    return oauthJson({ error: response.error }, response.status);
  }
}
