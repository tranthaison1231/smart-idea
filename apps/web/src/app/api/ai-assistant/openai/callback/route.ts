import {
  completeOpenAiOAuth,
  getOpenAiOAuthCallbackMessage,
  getOpenAiOAuthAppOrigin,
  isOpenAiOAuthCallbackUrl,
  OpenAiOAuthError,
} from "@/_entities/ai-provider/index.server";
import { getCurrentAppUser } from "@/_features/auth/index.server";
import { oauthCallbackPage, oauthError, oauthJson } from "../_responses";

export const runtime = "nodejs";

export async function GET(request: Request) {
  let returnOrigin = "http://localhost:3001";
  let result: ReturnType<typeof getOpenAiOAuthCallbackMessage>;
  try {
    returnOrigin = getOpenAiOAuthAppOrigin();
    result = getOpenAiOAuthCallbackMessage(new URL(request.url).searchParams);
  } catch (error) {
    const response = oauthError(error);
    result = { outcome: "error", error: response.error };
    if (!(error instanceof OpenAiOAuthError)) {
      returnOrigin = "http://localhost:3001";
    }
  }
  return oauthCallbackPage(returnOrigin, result);
}

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
  const redirectUrl =
    typeof body === "object" && body !== null && "redirectUrl" in body && typeof body.redirectUrl === "string"
      ? body.redirectUrl.trim()
      : "";
  if (!redirectUrl) return oauthJson({ error: "oauth_callback_invalid" }, 400);

  try {
    const callbackUrl = new URL(redirectUrl);
    if (!isOpenAiOAuthCallbackUrl(callbackUrl)) {
      return oauthJson({ error: "oauth_callback_invalid" }, 400);
    }
    const callback = getOpenAiOAuthCallbackMessage(callbackUrl.searchParams);
    if (callback.outcome === "error") return oauthJson({ error: callback.error }, 400);
    const callbackPayload = Object.fromEntries(
      Object.entries(callback).filter(([key]) => key !== "outcome"),
    );
    await completeOpenAiOAuth(user.id, callbackPayload);
    return oauthJson({ connected: true });
  } catch (error) {
    const response = oauthError(error);
    return oauthJson({ error: response.error }, response.status);
  }
}
