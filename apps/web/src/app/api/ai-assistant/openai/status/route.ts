import { getValidOpenAiAccessToken } from "@/_entities/ai-provider/index.server";
import { getCurrentAppUser } from "@/_features/auth/index.server";
import { oauthError, oauthJson } from "../_responses";

export const runtime = "nodejs";

export async function GET() {
  let user;
  try {
    user = await getCurrentAppUser();
  } catch {
    return oauthJson({ error: "auth_failed" }, 500);
  }
  if (!user) return oauthJson({ error: "unauthorized" }, 401);

  try {
    return oauthJson({ authenticated: Boolean(await getValidOpenAiAccessToken(user.id)) });
  } catch (error) {
    const response = oauthError(error);
    return oauthJson({ error: response.error }, response.status);
  }
}
