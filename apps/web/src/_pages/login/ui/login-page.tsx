"use client";

import { useState } from "react";

import { BrandMark } from "@/_shared/ui/brand-mark";
import { authClient } from "@/_features/auth/client/auth-client";

export function LoginPage({ googleEnabled }: { googleEnabled: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
      });
      if (result.error) setError("Không thể bắt đầu đăng nhập Google. Vui lòng thử lại.");
    } catch {
      setError("Không thể bắt đầu đăng nhập Google. Vui lòng thử lại.");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="login-page">
      <section aria-labelledby="login-title" className="login-card">
        <div className="login-brand">
          <BrandMark />
          <span className="brand-copy">
            <span className="brand-name">Smart Idea</span>
            <span className="brand-caption">A SPACE FOR WHAT&apos;S NEXT</span>
          </span>
        </div>

        <p className="login-eyebrow">KHÔNG GIAN CỦA BẠN</p>
        <h1 id="login-title">Đăng nhập để tiếp tục</h1>
        <p className="login-description">
          Đăng nhập để mở workspace và tiếp tục phát triển các ý tưởng của bạn.
        </p>

        <button
          aria-busy={pending}
          className="login-google-button"
          disabled={!googleEnabled || pending}
          onClick={() => void signIn()}
          type="button"
        >
          <GoogleMark />
          <span>{pending ? "Đang kết nối Google..." : "Đăng nhập với Google"}</span>
        </button>

        {!googleEnabled ? (
          <p className="login-note">Google OAuth chưa được cấu hình cho môi trường này.</p>
        ) : null}
        {error ? (
          <p className="login-error" role="alert">
            {error}
          </p>
        ) : null}

        <p className="login-security-note">Quyền truy cập được quản lý theo tài khoản của bạn.</p>
      </section>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="google-mark" viewBox="0 0 24 24">
      <path fill="#4285f4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" />
      <path fill="#34a853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" />
      <path fill="#fbbc05" d="M5.84 14.09A6.7 6.7 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l2.85-2.22.81-.62Z" />
      <path fill="#ea4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53Z" />
    </svg>
  );
}
