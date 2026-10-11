import {
  getOpenAiOAuthCallbackMessage,
  getOpenAiOAuthAppOrigin,
  OpenAiOAuthError,
} from "@/_entities/ai-provider/index.server";
import { oauthCallbackPage, oauthError } from "../_responses";

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
