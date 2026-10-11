import { NextResponse } from "next/server";

import { OpenAiOAuthError } from "@/_entities/ai-provider/index.server";

export function oauthJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function oauthError(error: unknown) {
  return error instanceof OpenAiOAuthError
    ? { error: error.code, status: error.status }
    : { error: "oauth_failed", status: 500 };
}

export function oauthCallbackPage(
  returnOrigin: string,
  result:
    | { outcome: "callback"; state: string; code?: string; clientId?: string; error?: string }
    | { outcome: "error"; error: string },
) {
  const payload = JSON.stringify({ type: "smart-idea:openai-oauth", ...result }).replace(/[<\u2028\u2029]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  const targetOrigin = JSON.stringify(returnOrigin).replace(/</g, "\\u003c");
  const error = result.outcome === "error" || (result.outcome === "callback" && Boolean(result.error));
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Smart Idea · ChatGPT</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07111f;color:#e5eaf2;font:16px system-ui,sans-serif}main{max-width:420px;margin:24px;padding:32px;border:1px solid #243249;border-radius:20px;background:#0b1728;text-align:center}h1{font-size:22px}p{color:#9aa8ba;line-height:1.6}</style></head><body><main><h1>${error ? "Chưa thể kết nối ChatGPT" : "Đang xác nhận kết nối ChatGPT"}</h1><p>${error ? "Quay lại Smart Idea để xem chi tiết và thử lại." : "Quay lại Smart Idea để hoàn tất kết nối. Cửa sổ này sẽ tự đóng."}</p></main><script>if(window.opener){window.opener.postMessage(${payload},${targetOrigin})}window.close()</script></body></html>`;
  return new Response(html, {
    status: error ? 400 : 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
