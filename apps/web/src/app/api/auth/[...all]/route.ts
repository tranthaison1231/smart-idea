import { toNextJsHandler } from "better-auth/next-js";

import { isGoogleAuthConfigured } from "@/_features/auth/index.server";

type AuthMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

function createHandler(method: AuthMethod) {
  return async (request: Request) => {
    if (!isGoogleAuthConfigured()) {
      return Response.json(
        { error: "Google authentication is not configured" },
        { status: 503 },
      );
    }

    const { getAuth } = await import("@/_features/auth/index.server");
    return toNextJsHandler(getAuth())[method](request);
  };
}

export const GET = createHandler("GET");
export const POST = createHandler("POST");
export const PATCH = createHandler("PATCH");
export const PUT = createHandler("PUT");
export const DELETE = createHandler("DELETE");
