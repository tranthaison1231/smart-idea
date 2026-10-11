"use client";

import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

import type { MarketDiscoveryFeed as MarketDiscoveryFeedData, MarketDiscoveryOpportunity } from "@/_entities/market-discovery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

const OpportunityDetailDialog = lazy(() =>
  import("./opportunity-detail-dialog").then((module) => ({
    default: module.OpportunityDetailDialog,
  })),
);

const MarketDiscoverySettingsDialog = lazy(() =>
  import("./market-discovery-settings-dialog").then((module) => ({
    default: module.MarketDiscoverySettingsDialog,
  })),
);

const emptyFeed: MarketDiscoveryFeedData = { history: [] };
const confidenceLabels = { low: "Độ tin cậy thấp", medium: "Độ tin cậy trung bình", high: "Độ tin cậy cao" } as const;
const errorMessages: Record<string, string> = {
  auth_failed: "Không thể xác thực tài khoản. Hãy tải lại trang.",
  feed_load_failed: "Không tải được lịch sử khám phá.",
  provider_not_configured: "Bạn chưa bật một Provider AI. Mở phần Cài đặt ở cuối sidebar để chọn provider.",
  provider_credentials_unavailable: "Thông tin xác thực AI không khả dụng. Kiểm tra API key hoặc kết nối ChatGPT trong Cài đặt.",
  provider_unsupported: "Provider cần hỗ trợ Chat Completions tương thích OpenAI qua HTTPS và địa chỉ công khai.",
  provider_unavailable: "Provider AI tạm thời không phản hồi. Hãy thử lại sau.",
  provider_response_invalid: "Provider trả về dữ liệu không hợp lệ. Hãy thử lại.",
  invalid_ai_response: "AI chưa tạo được cơ hội có nguồn hợp lệ. Hãy thử lại sau.",
  tavily_not_configured: "Nguồn tìm kiếm chưa được cấu hình. Quản trị viên cần thêm TAVILY_API_KEY cho ứng dụng.",
  source_search_failed: "Chưa lấy được nguồn thị trường. Lịch sử cũ của bạn vẫn được giữ.",
  no_market_evidence: "Snapshot hiện tại chưa có nguồn bằng chứng đủ dùng.",
  processing_timeout: "Quá trình khám phá vẫn đang chạy. Hãy tải lại sau ít phút.",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" })
    .format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function opportunityError(error: unknown) {
  if (error instanceof Error && error.message in errorMessages) return errorMessages[error.message];
  return "Có lỗi khi kết nối dịch vụ. Hãy thử lại.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMarketDiscoveryFeed(value: unknown): value is MarketDiscoveryFeedData {
  return isRecord(value) && Array.isArray(value.history) && value.history.every((run) => {
    if (!isRecord(run) || typeof run.id !== "string" || typeof run.marketDate !== "string" ||
      typeof run.createdAt !== "string" || (run.fetchedAt !== null && typeof run.fetchedAt !== "string") ||
      typeof run.stale !== "boolean" || typeof run.providerType !== "string" ||
      typeof run.providerModel !== "string" || !Array.isArray(run.opportunities)) return false;

    return run.opportunities.every((opportunity) => {
      if (!isRecord(opportunity) || typeof opportunity.id !== "string" ||
        typeof opportunity.productName !== "string" || typeof opportunity.problem !== "string" ||
        typeof opportunity.targetCustomer !== "string" || typeof opportunity.solution !== "string" ||
        typeof opportunity.whyNow !== "string" || typeof opportunity.confidenceRationale !== "string" ||
        !["low", "medium", "high"].includes(String(opportunity.confidence)) ||
        !Array.isArray(opportunity.revenueModels) || !opportunity.revenueModels.every((item) => typeof item === "string") ||
        !Array.isArray(opportunity.sourceIds) || !opportunity.sourceIds.every((item) => typeof item === "string") ||
        (opportunity.savedIdeaId !== null && typeof opportunity.savedIdeaId !== "string") ||
        !Array.isArray(opportunity.sources)) return false;

      return opportunity.sources.every((source) => isRecord(source) &&
        typeof source.id === "string" && typeof source.title === "string" &&
        typeof source.url === "string" && typeof source.domain === "string" &&
        (source.publishedAt === null || typeof source.publishedAt === "string"));
    });
  });
}

function readCachedFeed(key: string) {
  try {
    const cached: unknown = JSON.parse(window.localStorage.getItem(key) ?? "null");
    return isMarketDiscoveryFeed(cached) ? cached : null;
  } catch {
    return null;
  }
}

function cacheFeed(key: string, value: MarketDiscoveryFeedData) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function OpportunityCard({
  opportunity,
  onDetails,
  onSave,
  isSaving,
}: {
  opportunity: MarketDiscoveryOpportunity;
  onDetails: (opportunity: MarketDiscoveryOpportunity) => void;
  onSave: (opportunity: MarketDiscoveryOpportunity) => void;
  isSaving: boolean;
}) {
  return (
    <Card className="h-full min-w-0 border-border/80 bg-card/80">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={opportunity.confidence === "high" ? "default" : "outline"}>
            {confidenceLabels[opportunity.confidence]}
          </Badge>
          <Badge variant="secondary">{opportunity.sources.length} nguồn</Badge>
        </div>
        <CardTitle className="text-base leading-6">{opportunity.productName}</CardTitle>
        <CardDescription className="line-clamp-3 leading-6">{opportunity.problem}</CardDescription>
      </CardHeader>
      <CardContent className="grid flex-1 gap-4">
        <div className="grid gap-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Khách hàng</p>
          <p className="text-sm leading-5">{opportunity.targetCustomer}</p>
        </div>
        <div className="grid gap-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Giải pháp gợi ý</p>
          <p className="line-clamp-3 text-sm leading-5 text-muted-foreground">{opportunity.solution}</p>
        </div>
        <div className="flex min-h-6 flex-wrap gap-1.5">
          {opportunity.revenueModels.map((model) => (
            <Badge className="h-auto max-w-full whitespace-normal break-words py-1 text-left" key={model} variant="outline">
              {model}
            </Badge>
          ))}
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
          <Button onClick={() => onDetails(opportunity)} size="sm" variant="ghost">
            Xem chi tiết <ArrowUpRight aria-hidden="true" />
          </Button>
          {opportunity.savedIdeaId ? (
            <Button asChild size="sm" variant="secondary">
              <Link href={`/ideas/${opportunity.savedIdeaId}`}><Check aria-hidden="true" /> Đã lưu</Link>
            </Button>
          ) : (
            <Button disabled={isSaving} onClick={() => onSave(opportunity)} size="sm">
              {isSaving ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Sparkles aria-hidden="true" />}
              Lưu thành ý tưởng
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function OpportunityCardSkeleton() {
  return (
    <Card aria-hidden="true" className="h-full min-w-0 border-border/80 bg-card/80">
      <CardHeader className="gap-3">
        <div className="flex gap-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </CardHeader>
      <CardContent className="grid flex-1 gap-4">
        <div className="grid gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        <div className="grid gap-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="mt-auto flex justify-between border-t border-border/70 pt-3">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-36" />
        </div>
      </CardContent>
    </Card>
  );
}

export function MarketDiscoveryFeed({ userId }: { userId: string }) {
  const router = useRouter();
  const [feed, setFeed] = useState<MarketDiscoveryFeedData>(emptyFeed);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MarketDiscoveryOpportunity | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const storageKey = `smart-idea:market-discovery:${userId}`;

  const loadFeed = useCallback(async () => {
    const response = await fetch("/api/market-discovery/feed", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (!response.ok || !isMarketDiscoveryFeed(body)) {
      throw new Error(typeof body?.error === "string" ? body.error : "feed_load_failed");
    }
    setFeed(body);
    cacheFeed(storageKey, body);
  }, [storageKey]);

  const refresh = useCallback(async (announce = false) => {
    setRefreshing(true);
    setProcessing(false);
    setError(null);
    try {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const response = await fetch("/api/market-discovery/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "manual" }),
          cache: "no-store",
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          const code = typeof body?.error === "string" ? body.error : "discovery_failed";
          setError(code);
          return;
        }
        if (response.status === 202 || body?.state === "processing") {
          setProcessing(true);
          await wait(1500);
          continue;
        }
        if (!isMarketDiscoveryFeed(body?.feed)) {
          setError("feed_load_failed");
          return;
        }
        setFeed(body.feed);
        const cachedLocally = cacheFeed(storageKey, body.feed);
        if (!cachedLocally) {
          toast.warning("Feed đã được cập nhật trên tài khoản", {
            description: "Trình duyệt chưa lưu được bản sao cục bộ.",
          });
        }
        if (announce) {
          toast.success("Đã cập nhật Khám phá", {
            description: cachedLocally
              ? "Các cơ hội đã lưu vào lịch sử tài khoản và bộ nhớ trình duyệt."
              : "Các cơ hội đã được lưu vào lịch sử tài khoản.",
          });
        }
        return;
      }
      setError("processing_timeout");
    } catch {
      setError("feed_load_failed");
    } finally {
      setRefreshing(false);
      setProcessing(false);
    }
  }, [storageKey]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const cached = await Promise.resolve(readCachedFeed(storageKey));
      if (!active) return;
      if (cached) {
        setFeed(cached);
        setLoading(false);
      }
      try {
        await loadFeed();
      } catch {
        if (active && !cached) setError("feed_load_failed");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [loadFeed, storageKey]);

  const history = feed.history;

  const saveOpportunity = useCallback(async (opportunity: MarketDiscoveryOpportunity) => {
    setSavingId(opportunity.id);
    try {
      const response = await fetch(`/api/market-discovery/opportunities/${opportunity.id}/save`, {
        method: "POST",
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || typeof body?.ideaId !== "string") {
        throw new Error(typeof body?.error === "string" ? body.error : "opportunity_save_failed");
      }
      toast.success("Đã lưu cơ hội thành ý tưởng", {
        description: "Đang mở trang chi tiết để bạn tiếp tục phát triển.",
      });
      router.push(`/ideas/${body.ideaId}`);
    } catch {
      toast.error("Chưa lưu được ý tưởng", { description: "Hãy thử lại sau." });
    } finally {
      setSavingId(null);
    }
  }, [router]);

  return (
    <section aria-label="Cơ hội sản phẩm" className="grid gap-5 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Cơ hội có bằng chứng</p>
          <p className="mt-1 text-sm text-muted-foreground">Tổng hợp từ nguồn công khai và provider AI bạn đã bật.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setSettingsOpen(true)} variant="outline">
            <SlidersHorizontal aria-hidden="true" /> Cấu hình khám phá
          </Button>
          <Button disabled={refreshing} onClick={() => void refresh(true)}>
            {refreshing ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <RefreshCw aria-hidden="true" />}
            {refreshing ? "Đang tìm kiếm" : "Làm mới nguồn"}
          </Button>
        </div>
      </div>

      {processing ? (
        <div aria-live="polite" className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <LoaderCircle aria-hidden="true" className="animate-spin" size={16} />
          Đang lấy nguồn và tổng hợp cơ hội. Có thể mất khoảng một phút.
        </div>
      ) : null}
      {error ? (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0 text-amber-400" size={18} />
            <div className="grid gap-1">
              <p className="text-sm font-medium">{opportunityError(new Error(error))}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {loading || (history.length === 0 && refreshing) ? (
        <div aria-busy="true" className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3" role="status">
          <span className="sr-only">Đang tải lịch sử khám phá...</span>
          {Array.from({ length: 3 }, (_, index) => <OpportunityCardSkeleton key={index} />)}
        </div>
      ) : history.length === 0 && !refreshing ? (
        <Card className="items-center border-border/80 bg-card/60 px-6 py-12 text-center">
          <span className="mb-3 grid size-11 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <Sparkles aria-hidden="true" size={21} />
          </span>
          <CardTitle className="text-lg">Chưa có cơ hội khám phá</CardTitle>
          <CardDescription className="mt-2 max-w-md leading-6">
            Khi nguồn tìm kiếm và AI provider sẵn sàng, Smart Idea sẽ tạo feed cơ hội có dẫn chứng cho bạn.
          </CardDescription>
        </Card>
      ) : (
        <div className="grid gap-7">
          {history.map((run) => (
            <section aria-labelledby={`discovery-run-${run.id}`} className="grid gap-3" key={run.id}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold" id={`discovery-run-${run.id}`}>Khám phá ngày {formatDate(run.marketDate)}</h2>
                {run.stale ? <Badge variant="outline">Nguồn cũ · {formatDate(run.marketDate)}</Badge> : <Badge variant="secondary">{run.opportunities.length} cơ hội</Badge>}
                <span className="text-xs text-muted-foreground">{run.fetchedAt ? `Nguồn cập nhật ${new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(run.fetchedAt))}` : ""}</span>
              </div>
              <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                {run.opportunities.map((opportunity) => (
                  <OpportunityCard
                    isSaving={savingId === opportunity.id}
                    key={opportunity.id}
                    onDetails={setSelected}
                    onSave={(item) => void saveOpportunity(item)}
                    opportunity={opportunity}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-muted-foreground">Nguồn:</span>
                {run.opportunities.flatMap((opportunity) => opportunity.sources).filter((source, index, sources) => sources.findIndex((candidate) => candidate.id === source.id) === index).slice(0, 6).map((source) => (
                  <a className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" href={source.url} key={source.id} rel="noreferrer" target="_blank">
                    {source.domain}<ExternalLink aria-hidden="true" size={11} />
                  </a>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {selected ? (
        <Suspense
          fallback={(
            <Dialog open onOpenChange={(open) => { if (!open) setSelected(null); }}>
              <DialogContent aria-busy="true" className="max-w-2xl" showCloseButton={false}>
                <DialogHeader>
                  <DialogTitle>Đang tải chi tiết cơ hội</DialogTitle>
                  <DialogDescription>Đang chuẩn bị thông tin và nguồn tham khảo.</DialogDescription>
                </DialogHeader>
                <div aria-hidden="true" className="grid gap-5">
                  {Array.from({ length: 5 }, (_, index) => (
                    <div className="grid gap-2" key={index}>
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-4/5" />
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>
          )}
        >
          <OpportunityDetailDialog
            onOpenChange={(open) => { if (!open) setSelected(null); }}
            open
            opportunity={selected}
          />
        </Suspense>
      ) : null}

      {settingsOpen ? (
        <Suspense fallback={(
          <Dialog onOpenChange={setSettingsOpen} open>
            <DialogContent aria-busy="true" className="max-h-[calc(100dvh-2rem)] max-w-2xl sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Cấu hình khám phá</DialogTitle>
                <DialogDescription>Đang tải phần cài đặt...</DialogDescription>
              </DialogHeader>
              <div aria-hidden="true" className="grid gap-4 py-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-8 w-3/4" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-8 w-full" />
              </div>
            </DialogContent>
          </Dialog>
        )}>
          <MarketDiscoverySettingsDialog onOpenChange={setSettingsOpen} open />
        </Suspense>
      ) : null}
    </section>
  );
}
