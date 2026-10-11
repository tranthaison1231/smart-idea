"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Bot,
  Check,
  KeyRound,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import type { AiProviderView } from "@/_entities/ai-provider/index.server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

const providerTypes = [
  ["oauth", "ChatGPT Subscription (OAuth)"],
  ["custom", "OpenAI Compatible"],
  ["anthropic", "Anthropic (Native)"],
  ["gemini", "Google Gemini"],
  ["vertex", "Google Vertex AI"],
  ["openrouter", "OpenRouter"],
  ["groq", "Groq"],
  ["deepseek", "DeepSeek"],
  ["mistral", "Mistral AI"],
  ["xai", "xAI (Grok)"],
  ["minimax", "MiniMax (Native)"],
  ["cohere", "Cohere"],
  ["perplexity", "Perplexity"],
] as const;

type ProviderType = (typeof providerTypes)[number][0];
type ProviderDraft = Omit<AiProviderView, "apiKeyConfigured"> & {
  apiKey: string;
  apiKeyConfigured: boolean;
  clearApiKey: boolean;
};

const initialDraft = (): ProviderDraft => ({
  id: "",
  name: "Provider mới",
  providerType: "custom",
  baseUrl: "https://api.openai.com/v1",
  models: ["gpt-4.1-mini"],
  model: "gpt-4.1-mini",
  isEnabled: false,
  apiKey: "",
  apiKeyConfigured: false,
  clearApiKey: false,
});

function providerLabel(providerType: string) {
  return providerTypes.find(([value]) => value === providerType)?.[1] ?? providerType;
}

function errorMessage(code: unknown) {
  switch (code) {
    case "unauthorized":
      return "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại rồi thử tiếp.";
    case "credentials_not_configured":
      return "Máy chủ chưa cấu hình khóa mã hóa AI_CREDENTIALS_ENCRYPTION_KEY.";
    case "oauth_host_id_not_configured":
      return "Máy chủ chưa cấu hình OPENAI_OAUTH_HOST_ID ổn định cho cài đặt này.";
    case "oauth_local_only":
      return "ChatGPT Subscription OAuth hiện chỉ hoạt động với ứng dụng chạy local.";
    case "oauth_redirect_not_configured":
      return "Callback OAuth cần chạy tại 127.0.0.1:3001.";
    case "oauth_access_denied":
      return "Bạn đã hủy cấp quyền ChatGPT.";
    case "oauth_transaction_invalid":
      return "Phiên đăng nhập OAuth đã hết hạn hoặc không hợp lệ. Hãy thử kết nối lại.";
    case "oauth_client_mismatch":
      return "OpenAI trả về đăng ký ứng dụng không khớp. Hãy bắt đầu kết nối mới.";
    case "oauth_account_changed":
      return "Tài khoản ChatGPT trả về không khớp tài khoản đã liên kết.";
    case "oauth_scope_missing":
      return "Bạn chưa cấp quyền dùng ChatGPT plan cho ứng dụng.";
    case "oauth_models_unavailable":
      return "Không tải được danh sách model ChatGPT. Hãy thử kết nối lại.";
    case "api_key_required":
      return "Hãy cấu hình API key trước khi bật provider này.";
    case "active_provider_conflict":
      return "Một provider khác vừa được bật. Hãy tải lại danh sách rồi thử lại.";
    case "invalid_provider":
      return "Thông tin provider chưa hợp lệ. Hãy kiểm tra lại các trường.";
    case "provider_not_found":
      return "Không tìm thấy provider trong tài khoản của bạn.";
    default:
      return "Không thể hoàn thành thao tác. Vui lòng thử lại.";
  }
}

type OAuthPopupResult =
  | { outcome: "callback"; callback: { state: string; code?: string; clientId?: string; error?: string } }
  | { outcome: "error"; error: string }
  | { outcome: "closed" }
  | { outcome: "timeout" };

function waitForOAuthPopup(popup: Window, callbackOrigin: string) {
  return new Promise<OAuthPopupResult>((resolve) => {
    let settled = false;
    let closeTimer: number | undefined;
    const interval = window.setInterval(() => {
      if (!popup.closed) return;
      closeTimer ??= window.setTimeout(() => finish({ outcome: "closed" }), 750);
    }, 300);
    const timeout = window.setTimeout(() => finish({ outcome: "timeout" }), 6 * 60 * 1000);
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== callbackOrigin || event.source !== popup) return;
      if (typeof event.data !== "object" || event.data === null) return;
      const data = event.data as Record<string, unknown>;
      if (data.type !== "smart-idea:openai-oauth") return;
      if (
        data.outcome === "callback" &&
        typeof data.state === "string" &&
        (data.code === undefined || typeof data.code === "string") &&
        (data.clientId === undefined || typeof data.clientId === "string") &&
        (data.error === undefined || typeof data.error === "string")
      ) {
        finish({
          outcome: "callback",
          callback: {
            state: data.state,
            ...(typeof data.code === "string" ? { code: data.code } : {}),
            ...(typeof data.clientId === "string" ? { clientId: data.clientId } : {}),
            ...(typeof data.error === "string" ? { error: data.error } : {}),
          },
        });
      } else if (data.outcome === "error" && typeof data.error === "string") {
        finish({ outcome: "error", error: data.error });
      }
    };
    function finish(result: OAuthPopupResult) {
      if (settled) return;
      settled = true;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      if (closeTimer) window.clearTimeout(closeTimer);
      window.removeEventListener("message", onMessage);
      resolve(result);
    }
    window.addEventListener("message", onMessage);
  });
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as
    | (T & { error?: unknown })
    | null;
  if (!response.ok) throw new Error(errorMessage(body?.error));
  if (!body) throw new Error("Không nhận được phản hồi từ máy chủ.");
  return body;
}

async function fetchProviderList() {
  const response = await fetch("/api/ai-assistant/providers", { cache: "no-store" });
  return readResponse<{
    providers: AiProviderView[];
    credentialsReady: boolean;
  }>(response);
}

export function AiProviderSettingsPanel() {
  const [providers, setProviders] = useState<AiProviderView[]>([]);
  const [credentialsReady, setCredentialsReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<ProviderDraft | null>(null);
  const [newModel, setNewModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [connectingOpenAi, setConnectingOpenAi] = useState(false);
  const [pendingProviderId, setPendingProviderId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AiProviderView | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadProviders() {
    setLoading(true);
    setLoadError("");
    try {
      const body = await fetchProviderList();
      setProviders(body.providers);
      setCredentialsReady(body.credentialsReady);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Không thể tải provider.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void fetchProviderList()
      .then((body) => {
        if (!active) return;
        setProviders(body.providers);
        setCredentialsReady(body.credentialsReady);
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Không thể tải provider.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const visibleProviders = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("vi");
    if (!term) return providers;
    return providers.filter((provider) =>
      [provider.name, provider.providerType, provider.baseUrl, provider.model, ...provider.models]
        .join(" ")
        .toLocaleLowerCase("vi")
        .includes(term),
    );
  }, [providers, search]);

  function editProvider(provider?: AiProviderView) {
    setNewModel("");
    setDraft(
      provider
        ? { ...provider, apiKey: "", clearApiKey: false }
        : initialDraft(),
    );
  }

  async function connectOpenAi() {
    const popup = window.open("about:blank", "smart-idea-chatgpt-oauth", "popup,width=560,height=720");
    if (!popup) {
      toast.error("Trình duyệt đã chặn cửa sổ đăng nhập ChatGPT.", {
        description: "Cho phép popup cho Smart Idea rồi thử lại.",
      });
      return;
    }

    setConnectingOpenAi(true);
    try {
      const response = await fetch("/api/ai-assistant/openai/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
        cache: "no-store",
      });
      const { authUrl, callbackOrigin } = await readResponse<{
        authUrl: string;
        callbackOrigin: string;
      }>(response);
      const expectedState = new URL(authUrl).searchParams.get("state");
      if (!expectedState) throw new Error("Không nhận được trạng thái OAuth hợp lệ. Hãy thử lại.");
      popup.location.href = authUrl;
      popup.focus();
      const result = await waitForOAuthPopup(popup, callbackOrigin);
      if (result.outcome === "error") throw new Error(errorMessage(result.error));
      if (result.outcome === "closed") throw new Error("Cửa sổ đăng nhập đã được đóng trước khi kết nối hoàn tất.");
      if (result.outcome === "timeout") throw new Error("Đăng nhập ChatGPT đã hết thời gian chờ.");
      if (result.callback.state !== expectedState) {
        throw new Error("Trạng thái OAuth không khớp. Hãy thử kết nối lại.");
      }

      const completeResponse = await fetch("/api/ai-assistant/openai/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(result.callback),
        cache: "no-store",
      });
      await readResponse<{ connected: boolean }>(completeResponse);

      const statusResponse = await fetch("/api/ai-assistant/openai/status", { cache: "no-store" });
      const status = await readResponse<{ authenticated: boolean }>(statusResponse);
      if (!status.authenticated) throw new Error("Không xác nhận được kết nối ChatGPT. Hãy thử lại.");
      const body = await fetchProviderList();
      setProviders(body.providers);
      setCredentialsReady(body.credentialsReady);
      setDraft(null);
      toast.success("Đã kết nối ChatGPT Subscription", {
        description: "Tài khoản đã được liên kết an toàn với workspace của bạn.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể kết nối ChatGPT.");
    } finally {
      popup.close();
      setConnectingOpenAi(false);
    }
  }

  async function saveProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    try {
      if (draft.providerType === "oauth" && !draft.id) {
        throw new Error("Hãy kết nối tài khoản ChatGPT trước khi lưu provider.");
      }
      const payload: Record<string, unknown> = draft.providerType === "oauth"
        ? {
            id: draft.id,
            providerType: "oauth",
            model: draft.model,
            isEnabled: draft.isEnabled,
          }
        : {
            ...(draft.id ? { id: draft.id } : {}),
            name: draft.name,
            providerType: draft.providerType,
            baseUrl: draft.baseUrl,
            models: draft.models,
            model: draft.model,
            isEnabled: draft.isEnabled,
            ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}),
            ...(draft.clearApiKey ? { clearApiKey: true } : {}),
          };
      const response = await fetch("/api/ai-assistant/providers", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await readResponse<{ providers: AiProviderView[] }>(response);
      setProviders(body.providers);
      setDraft(null);
      toast.success(draft.providerType === "oauth" ? "Đã cập nhật ChatGPT Subscription" : draft.id ? "Đã cập nhật provider" : "Đã thêm provider", {
        description: "Cấu hình đã được lưu an toàn cho tài khoản của bạn.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể lưu provider.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleProvider(provider: AiProviderView, enabled: boolean) {
    setPendingProviderId(provider.id);
    try {
      const response = await fetch("/api/ai-assistant/providers", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          provider.providerType === "oauth"
            ? { id: provider.id, providerType: "oauth", model: provider.model, isEnabled: enabled }
            : { ...provider, isEnabled: enabled },
        ),
      });
      const body = await readResponse<{ providers: AiProviderView[] }>(response);
      setProviders(body.providers);
      const selected = body.providers.find((item) => item.isEnabled);
      toast.success(enabled ? "Đã bật provider" : "Đã tắt provider", {
        description: selected ? `${selected.name} đang được chọn sử dụng.` : "Không có provider nào đang bật.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể cập nhật provider.");
    } finally {
      setPendingProviderId(null);
    }
  }

  async function deleteProvider() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.providerType === "oauth") {
        const response = await fetch("/api/ai-assistant/openai/logout", { method: "POST" });
        const body = await readResponse<{ remoteRevocationConfirmed: boolean }>(response);
        const list = await fetchProviderList();
        setProviders(list.providers);
        setCredentialsReady(list.credentialsReady);
        toast.success("Đã ngắt kết nối ChatGPT", {
          description: body.remoteRevocationConfirmed
            ? "Phiên ChatGPT đã được thu hồi và xóa khỏi tài khoản Smart Idea."
            : "Đã xóa kết nối cục bộ; OpenAI chưa xác nhận thu hồi phiên từ xa.",
        });
      } else {
        const response = await fetch(
          `/api/ai-assistant/providers?id=${encodeURIComponent(deleteTarget.id)}`,
          { method: "DELETE" },
        );
        const body = await readResponse<{ providers: AiProviderView[] }>(response);
        setProviders(body.providers);
        toast.success("Đã xóa provider", {
          description: `${deleteTarget.name} đã được xóa khỏi tài khoản của bạn.`,
        });
      }
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Không thể xóa provider.");
    } finally {
      setDeleting(false);
    }
  }

  function addModel() {
    if (!draft) return;
    const value = newModel.trim();
    if (!value || value.length > 160 || draft.models.length >= 100 || draft.models.includes(value)) return;
    setDraft({ ...draft, models: [...draft.models, value], model: draft.model || value });
    setNewModel("");
  }

  function removeModel(value: string) {
    if (!draft || draft.models.length <= 1) return;
    const models = draft.models.filter((model) => model !== value);
    setDraft({ ...draft, models, model: draft.model === value ? models[0] : draft.model });
  }

  return (
    <section aria-labelledby="provider-ai-title" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold" id="provider-ai-title">Provider AI</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Lưu cấu hình model riêng tư cho workspace của bạn.
          </p>
        </div>
        <Button onClick={() => editProvider()} type="button">
          <Plus aria-hidden="true" />
          Thêm provider
        </Button>
      </div>

      {!credentialsReady ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-100" role="status">
          Máy chủ chưa cấu hình khóa mã hóa AI. Hãy thêm <code>AI_CREDENTIALS_ENCRYPTION_KEY</code> vào môi trường rồi khởi động lại ứng dụng để lưu API key và bật provider.
        </div>
      ) : null}

      <Card className="gap-0 py-0">
        <CardHeader className="gap-3 border-b py-4 sm:flex sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-sm">Provider đã cấu hình</CardTitle>
            <CardDescription className="mt-1">
              Chỉ một provider có thể hoạt động tại một thời điểm.
            </CardDescription>
          </div>
          <div className="relative w-full sm:max-w-64">
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Tìm provider"
              className="pl-9"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Tìm provider..."
              value={search}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          {loadError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>{loadError}</span>
                <Button disabled={loading} onClick={() => void loadProviders()} size="sm" variant="outline">
                  Thử lại
                </Button>
              </div>
            </div>
          ) : null}
          {loading ? (
            <div aria-busy="true" className="space-y-3" role="status">
              <span className="sr-only">Đang tải danh sách provider...</span>
              {Array.from({ length: 2 }, (_, index) => (
                <Card aria-hidden="true" className="gap-0 py-0" key={index}>
                  <CardHeader className="gap-3 p-4 sm:flex-row sm:items-center">
                    <Skeleton className="size-10 shrink-0 rounded-xl" />
                    <div className="grid flex-1 gap-2">
                      <Skeleton className="h-4 w-2/5" />
                      <Skeleton className="h-3 w-3/5" />
                    </div>
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-9 rounded-full" />
                      <Skeleton className="size-8 rounded-md" />
                      <Skeleton className="size-8 rounded-md" />
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : visibleProviders.length ? (
            visibleProviders.map((provider) => (
              <Card className="gap-0 py-0" key={provider.id}>
                <CardHeader className="gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
                    <KeyRound aria-hidden="true" className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="truncate text-sm">{provider.name}</CardTitle>
                      <Badge variant="outline">{providerLabel(provider.providerType)}</Badge>
                      {provider.isEnabled ? <Badge>Đang dùng</Badge> : null}
                    </div>
                    <CardDescription className="mt-1 truncate">
                      {provider.model} · {provider.baseUrl}
                    </CardDescription>
                  </div>
                  <div className="flex shrink-0 items-center justify-end gap-1">
                    <span className="mr-1 hidden text-xs text-muted-foreground md:inline">
                      {provider.providerType === "oauth"
                        ? "Đã kết nối"
                        : provider.apiKeyConfigured
                          ? "Key đã lưu"
                          : "Chưa có key"}
                    </span>
                    <span className="flex items-center gap-2">
                      {pendingProviderId === provider.id ? (
                        <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-muted-foreground" />
                      ) : null}
                      <Switch
                        aria-busy={pendingProviderId === provider.id}
                        aria-label={`${provider.isEnabled ? "Tắt" : "Bật"} ${provider.name}`}
                        checked={provider.isEnabled}
                        disabled={
                          pendingProviderId !== null ||
                          (!credentialsReady && !provider.isEnabled) ||
                          (provider.providerType !== "oauth" && !provider.apiKeyConfigured && !provider.isEnabled)
                        }
                        onCheckedChange={(checked) => void toggleProvider(provider, checked)}
                      />
                    </span>
                    <Button
                      aria-label={`Sửa ${provider.name}`}
                      onClick={() => editProvider(provider)}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                    <Button
                      aria-label={`${provider.providerType === "oauth" ? "Ngắt kết nối" : "Xóa"} ${provider.name}`}
                      onClick={() => setDeleteTarget(provider)}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 aria-hidden="true" className="text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            ))
          ) : (
            <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
              <div className="flex size-11 items-center justify-center rounded-xl border bg-muted/40 text-muted-foreground">
                <Bot aria-hidden="true" className="size-5" />
              </div>
              <p className="text-sm font-medium">
                {search ? "Không tìm thấy provider phù hợp" : "Chưa có provider nào"}
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {search
                  ? "Thử một từ khóa khác hoặc xóa nội dung tìm kiếm."
                  : "Thêm provider và model để chuẩn bị cho các tính năng AI tiếp theo."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setDraft(null);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader className="pr-8">
            <DialogTitle>
              {draft?.providerType === "oauth"
                ? draft.id ? "Cài đặt ChatGPT Subscription" : "Kết nối ChatGPT Subscription"
                : draft?.id ? "Chỉnh sửa provider" : "Thêm provider"}
            </DialogTitle>
            <DialogDescription>
              {draft?.providerType === "oauth"
                ? "Đăng nhập ChatGPT để dùng model trong gói của bạn. Token được lưu mã hóa trên server."
                : "Thông tin được lưu riêng cho tài khoản của bạn; API key không được trả về trình duyệt."}
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <form className="space-y-5" onSubmit={(event) => void saveProvider(event)}>
              <div className="grid gap-4 sm:grid-cols-2">
                {draft.providerType === "oauth" ? (
                  <div className="flex items-center rounded-lg border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    Kết nối với tài khoản ChatGPT của riêng bạn.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="provider-name">Tên provider</Label>
                    <Input
                      autoComplete="off"
                      id="provider-name"
                      maxLength={80}
                      onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                      required
                      value={draft.name}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="provider-type">Loại provider</Label>
                  <Select
                    disabled={draft.providerType === "oauth" && Boolean(draft.id)}
                    onValueChange={(providerType) =>
                      setDraft({ ...draft, providerType: providerType as ProviderType })
                    }
                    value={draft.providerType}
                  >
                    <SelectTrigger aria-label="Loại provider" id="provider-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {providerTypes.map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {draft.providerType !== "oauth" ? (
                <>
              <div className="space-y-2">
                <Label htmlFor="provider-base-url">Base URL</Label>
                <Input
                  autoComplete="url"
                  id="provider-base-url"
                  onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
                  placeholder="https://api.openai.com/v1"
                  required
                  type="url"
                  value={draft.baseUrl}
                />
                <p className="text-xs text-muted-foreground">Chỉ hỗ trợ URL HTTP hoặc HTTPS, không kèm thông tin đăng nhập.</p>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="provider-api-key">API key</Label>
                  {draft.apiKeyConfigured && !draft.clearApiKey ? (
                    <Button
                      className="h-auto px-0 text-xs text-destructive"
                      onClick={() => setDraft({ ...draft, apiKey: "", clearApiKey: true, isEnabled: false, apiKeyConfigured: false })}
                      size="sm"
                      type="button"
                      variant="link"
                    >
                      Xóa key đã lưu
                    </Button>
                  ) : null}
                </div>
                <Input
                  autoComplete="new-password"
                  disabled={!credentialsReady || draft.clearApiKey}
                  id="provider-api-key"
                  maxLength={500}
                  onChange={(event) => setDraft({ ...draft, apiKey: event.target.value, clearApiKey: false })}
                  placeholder={
                    draft.apiKeyConfigured
                      ? "Để trống để giữ key hiện tại"
                      : "Dán API key của provider"
                  }
                  type="password"
                  value={draft.apiKey}
                />
                <p className="text-xs text-muted-foreground">
                  {draft.clearApiKey
                    ? "Provider sẽ bị tắt và API key đã lưu sẽ bị xóa khi lưu."
                    : draft.apiKeyConfigured
                      ? "API key đã được lưu an toàn. Để trống để giữ nguyên."
                      : "API key được mã hóa trước khi lưu và chỉ dùng ở server."}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Danh sách model</Label>
                <div className="flex gap-2">
                  <Input
                    aria-label="Tên model mới"
                    maxLength={160}
                    onChange={(event) => setNewModel(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        addModel();
                      }
                    }}
                    placeholder="Ví dụ: gpt-4.1-mini"
                    value={newModel}
                  />
                  <Button
                    aria-label="Thêm model"
                    disabled={!newModel.trim() || draft.models.length >= 100}
                    onClick={addModel}
                    type="button"
                    variant="outline"
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {draft.models.map((model) => (
                    <Badge className="gap-1.5 pr-1" key={model} variant="secondary">
                      {model}
                      <Button
                        aria-label={`Xóa model ${model}`}
                        className="size-5 rounded-full p-0"
                        disabled={draft.models.length <= 1}
                        onClick={() => removeModel(model)}
                        size="icon-xs"
                        type="button"
                        variant="ghost"
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="provider-selected-model">Model đang chọn</Label>
                <Select
                  onValueChange={(model) => setDraft({ ...draft, model })}
                  value={draft.model}
                >
                  <SelectTrigger id="provider-selected-model">
                    <SelectValue placeholder="Chọn model" />
                  </SelectTrigger>
                  <SelectContent>
                    {draft.models.map((model) => (
                      <SelectItem key={model} value={model}>{model}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter>
                <Button
                  disabled={
                    saving ||
                    !draft.name.trim() ||
                    !draft.baseUrl.trim() ||
                    !draft.models.length ||
                    !draft.models.includes(draft.model) ||
                    (draft.isEnabled && !draft.apiKeyConfigured && !draft.apiKey.trim())
                  }
                  type="submit"
                >
                  {saving ? (
                    <LoaderCircle aria-hidden="true" className="animate-spin" />
                  ) : (
                    <Check aria-hidden="true" />
                  )}
                  {saving ? "Đang lưu..." : "Lưu provider"}
                </Button>
              </DialogFooter>
                </>
              ) : draft.id ? (
                <div className="space-y-5">
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-100">
                    ChatGPT Subscription đã được kết nối. Token chỉ được sử dụng và giải mã ở server.
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="provider-selected-model">Model đang chọn</Label>
                    <Select
                      onValueChange={(model) => setDraft({ ...draft, model })}
                      value={draft.model}
                    >
                      <SelectTrigger id="provider-selected-model">
                        <SelectValue placeholder="Chọn model" />
                      </SelectTrigger>
                      <SelectContent>
                        {draft.models.map((model) => (
                          <SelectItem key={model} value={model}>{model}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Danh sách được lấy từ catalog của tài khoản ChatGPT đã liên kết.
                    </p>
                  </div>
                  <DialogFooter>
                    <Button
                      disabled={connectingOpenAi || !credentialsReady}
                      onClick={() => void connectOpenAi()}
                      type="button"
                      variant="outline"
                    >
                      {connectingOpenAi ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <KeyRound aria-hidden="true" />}
                      {connectingOpenAi ? "Đang kết nối..." : "Kết nối lại"}
                    </Button>
                    <Button
                      disabled={saving || !draft.models.includes(draft.model)}
                      type="submit"
                    >
                      {saving ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />}
                      {saving ? "Đang lưu..." : "Lưu model"}
                    </Button>
                  </DialogFooter>
                </div>
              ) : (
                <div className="space-y-4 rounded-xl border bg-muted/10 p-5">
                  <div>
                    <h3 className="text-sm font-medium">Kết nối bằng tài khoản ChatGPT</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Smart Idea sẽ mở trang OpenAI để bạn đăng nhập và cấp quyền dùng model trong gói ChatGPT.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      {credentialsReady
                        ? "Token được mã hóa trước khi lưu; ứng dụng không đọc cuộc trò chuyện ChatGPT của bạn."
                        : "Hãy cấu hình AI_CREDENTIALS_ENCRYPTION_KEY trên server trước."}
                    </p>
                    <Button
                      disabled={connectingOpenAi || !credentialsReady}
                      onClick={() => void connectOpenAi()}
                      type="button"
                    >
                      {connectingOpenAi ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <KeyRound aria-hidden="true" />}
                      {connectingOpenAi ? "Đang chờ OpenAI..." : "Đăng nhập với ChatGPT"}
                    </Button>
                  </div>
                </div>
              )}
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{deleteTarget?.providerType === "oauth" ? "Ngắt kết nối ChatGPT?" : "Xóa provider này?"}</DialogTitle>
            <DialogDescription>
              {deleteTarget?.providerType === "oauth"
                ? "Smart Idea sẽ xóa token đã lưu và yêu cầu OpenAI thu hồi phiên ChatGPT."
                : `“${deleteTarget?.name}” và API key đã mã hóa sẽ bị xóa vĩnh viễn.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button disabled={deleting} onClick={() => setDeleteTarget(null)} type="button" variant="outline">
              Hủy
            </Button>
            <Button disabled={deleting} onClick={() => void deleteProvider()} type="button" variant="destructive">
              {deleting ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Trash2 aria-hidden="true" />}
              {deleting
                ? deleteTarget?.providerType === "oauth" ? "Đang ngắt kết nối..." : "Đang xóa..."
                : deleteTarget?.providerType === "oauth" ? "Ngắt kết nối" : "Xóa provider"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
