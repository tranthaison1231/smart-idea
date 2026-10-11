import { completeOpenAiOAuth } from "@/_entities/ai-provider/index.server";
import { getCurrentAppUser } from "@/_features/auth/index.server";
import { oauthError, oauthJson } from "../_responses";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let user;
  try {
    user = await getCurrentAppUser();
  } catch {
    return oauthJson({ error: "auth_failed" }, 500);
  }
  if (!user) return oauthJson({ error: "unauthorized" }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return oauthJson({ error: "oauth_callback_invalid" }, 400);
  }

  try {
    await completeOpenAiOAuth(user.id, body);
    return oauthJson({ connected: true });
  } catch (error) {
    const response = oauthError(error);
    return oauthJson({ error: response.error }, response.status);
  }
}
