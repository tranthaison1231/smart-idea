"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ExternalLink, LoaderCircle, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";

import type {
  CompetitorDraft,
  CompetitorResearchDraft,
  IdeaCompetitorView,
} from "@/_entities/idea-competitor";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const errorMessages: Record<string, string> = {
  idea_not_found: "Không tìm thấy ý tưởng này hoặc bạn không có quyền truy cập.",
  provider_not_configured: "Hãy mở Cài đặt AI và bật một provider trước khi tìm đối thủ.",
  provider_credentials_unavailable: "Thông tin kết nối AI không khả dụng. Hãy kiểm tra lại Cài đặt AI.",
  tavily_not_configured: "Nguồn tìm kiếm chưa được cấu hình. Hãy liên hệ quản trị viên để bật Tavily.",
  source_search_failed: "Chưa lấy được nguồn công khai. Hãy thử tìm kiếm lại sau.",
  provider_unsupported: "Provider AI hiện tại chưa hỗ trợ yêu cầu này.",
  provider_unavailable: "Provider AI tạm thời không phản hồi. Hãy thử lại sau.",
  provider_response_invalid: "Provider AI trả về dữ liệu không hợp lệ. Hãy thử lại.",
  invalid_ai_response: "AI chưa tạo được danh sách có đủ bằng chứng. Hãy thử làm mới nguồn.",
  invalid_draft: "Bản nghiên cứu đã hết hạn hoặc không còn hợp lệ. Hãy tìm kiếm lại.",
  server_configuration_unavailable: "Cấu hình máy chủ chưa sẵn sàng. Hãy thử lại sau.",
  unauthorized: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
  invalid_request: "Yêu cầu không hợp lệ. Hãy thử lại.",
  research_failed: "Chưa thể tìm đối thủ lúc này. Hãy thử lại sau.",
  save_failed: "Chưa lưu được danh sách đối thủ. Bản nháp vẫn được giữ lại.",
};

function responseError(value: unknown): string {
  if (typeof value !== "object" || value === null || !("error" in value)) return "";
  const code = (value as { error?: unknown }).error;
  return typeof code === "string" ? code : "";
}

function validResearchDraft(value: unknown): value is CompetitorResearchDraft {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<CompetitorResearchDraft>;
  return Array.isArray(candidate.competitors) && candidate.competitors.length > 0 &&
    typeof candidate.proof === "object" && candidate.proof !== null &&
    Number.isSafeInteger(candidate.proof.expiresAt) && typeof candidate.proof.signature === "string";
}

function display(value: string | null) {
  return value?.trim() || "Chưa có dữ liệu";
}

function CompetitorTable({
  competitors,
  onDetails,
}: {
  competitors: Array<CompetitorDraft & { id?: string }>;
  onDetails: (competitor: CompetitorDraft) => void;
}) {
  return (
    <Table className="min-w-[900px]">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[19%]">Công ty / Sản phẩm</TableHead>
          <TableHead className="w-[25%]">Định vị</TableHead>
          <TableHead className="w-[18%]">Khách hàng</TableHead>
          <TableHead className="w-[15%]">Giá</TableHead>
          <TableHead className="w-[13%]">Nguồn</TableHead>
          <TableHead className="w-[10%] text-right">Chi tiết</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {competitors.map((competitor, index) => (
          <TableRow key={competitor.id ?? `${competitor.companyName}-${index}`}>
            <TableCell className="whitespace-normal break-words align-top">
              <p className="font-medium">{competitor.companyName}</p>
              {competitor.productName && <p className="mt-1 text-muted-foreground">{competitor.productName}</p>}
              {competitor.website && (
                <a
                  className="mt-1 inline-flex items-center gap-1 text-primary hover:underline"
                  href={competitor.website}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Website <ExternalLink aria-hidden="true" className="size-3" />
                </a>
              )}
            </TableCell>
            <TableCell className="max-w-64 whitespace-normal break-words align-top text-muted-foreground">
              <p className="line-clamp-3">{competitor.overview}</p>
            </TableCell>
            <TableCell className="max-w-52 whitespace-normal break-words align-top text-muted-foreground">
              <p className="line-clamp-3">{display(competitor.targetCustomer)}</p>
            </TableCell>
            <TableCell className="max-w-48 whitespace-normal break-words align-top text-muted-foreground">
              {display(competitor.pricing)}
            </TableCell>
            <TableCell className="whitespace-normal align-top">
              <div className="flex flex-col items-start gap-1.5">
                {competitor.sources.slice(0, 2).map((source) => (
                  <a
                    className="inline-flex max-w-40 items-center gap-1 truncate text-primary hover:underline"
                    href={source.url}
                    key={source.id}
                    rel="noopener noreferrer"
                    target="_blank"
                    title={source.title}
                  >
                    {source.domain} <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
                  </a>
                ))}
                {competitor.sources.length > 2 && (
                  <span className="text-xs text-muted-foreground">+{competitor.sources.length - 2} nguồn</span>
                )}
              </div>
            </TableCell>
            <TableCell className="text-right align-top">
              <Button onClick={() => onDetails(competitor)} size="sm" variant="outline">
                Xem <ArrowUpRight aria-hidden="true" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ResearchSkeleton() {
  return (
    <Card aria-busy="true" aria-label="Đang tìm kiếm đối thủ">
      <CardContent className="space-y-4 pt-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div className="grid gap-3 border-b border-border/60 pb-4 last:border-0 sm:grid-cols-5" key={index}>
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-5 w-full sm:col-span-2" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-8 w-20 justify-self-end" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function IdeaCompetitorsPanel({
  ideaId,
  savedCompetitors,
}: {
  ideaId: string;
  savedCompetitors: IdeaCompetitorView[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<CompetitorResearchDraft | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [selected, setSelected] = useState<CompetitorDraft | null>(null);

  async function searchCompetitors() {
    if (searching || saving) return;
    setSearching(true);
    setError(null);
    try {
      const response = await fetch(`/api/ideas/${encodeURIComponent(ideaId)}/competitors/research`, {
        method: "POST",
        cache: "no-store",
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const code = responseError(body);
        setError(errorMessages[code] ?? "Chưa thể tìm đối thủ lúc này. Hãy thử lại sau.");
      } else if (!validResearchDraft(body)) {
        setError("AI trả về kết quả không hợp lệ. Hãy tìm kiếm lại.");
      } else {
        setDraft(body);
      }
    } catch {
      setError("Không thể kết nối máy chủ. Bản nháp hiện tại vẫn được giữ nguyên.");
    } finally {
      setSearching(false);
    }
  }

  async function saveDraft() {
    if (!draft || saving || searching) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/ideas/${encodeURIComponent(ideaId)}/competitors`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const code = responseError(body);
        setError(errorMessages[code] ?? "Chưa lưu được danh sách đối thủ. Bản nháp vẫn được giữ lại.");
        return;
      }
      if (typeof body !== "object" || body === null || !Array.isArray((body as { competitors?: unknown }).competitors)) {
        setError("Máy chủ trả về phản hồi không hợp lệ. Bản nháp vẫn được giữ lại.");
        return;
      }

      const count = draft.competitors.length;
      setDraft(null);
      setReplaceOpen(false);
      router.refresh();
      toast.success("Đã lưu danh sách đối thủ", {
        description: `${count} đối thủ đã được lưu vào ý tưởng này.`,
      });
    } catch {
      setError("Không thể kết nối máy chủ. Bản nháp vẫn được giữ lại.");
    } finally {
      setSaving(false);
    }
  }

  function requestSave() {
    if (!draft || saving || searching) return;
    if (savedCompetitors.length > 0) setReplaceOpen(true);
    else void saveDraft();
  }

  function openDetails(competitor: CompetitorDraft) {
    setSelected(competitor);
  }

  return (
    <section className="space-y-5 pt-5" aria-label="Nghiên cứu đối thủ">
      <div className="flex flex-wrap items-center justify-end gap-4">
        <div className="flex flex-wrap gap-2">
          {draft && (
            <Button disabled={searching || saving} onClick={() => void searchCompetitors()} variant="outline">
              {searching ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Search aria-hidden="true" />}
              Làm mới
            </Button>
          )}
          <Button disabled={searching || saving} onClick={() => void (draft ? requestSave() : searchCompetitors())}>
            {searching || saving
              ? <LoaderCircle aria-hidden="true" className="animate-spin" />
              : draft
                ? <Sparkles aria-hidden="true" />
                : <Search aria-hidden="true" />}
            {searching ? "Đang tìm kiếm" : saving ? "Đang lưu" : draft ? "Lưu" : "Tìm kiếm đối thủ"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Đối thủ đã lưu</CardTitle>
          <CardDescription>
            {savedCompetitors.length > 0
              ? `${savedCompetitors.length} đối thủ thuộc ý tưởng này.`
              : "Danh sách đã lưu sẽ xuất hiện ở đây sau khi bạn xác nhận lưu kết quả."}
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          {savedCompetitors.length > 0 ? (
            <CompetitorTable competitors={savedCompetitors} onDetails={openDetails} />
          ) : (
            <div className="rounded-lg border border-dashed border-border px-5 py-8 text-center">
              <p className="font-medium">Chưa có đối thủ được lưu</p>
              <p className="mt-1 text-sm text-muted-foreground">Tìm kiếm sẽ tạo bản nháp trước, chưa thay đổi dữ liệu đã lưu.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {searching && <ResearchSkeleton />}

      {draft && (
        <Card className="border-primary/30">
          <CardHeader className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Kết quả chưa lưu</CardTitle>
              <CardDescription className="mt-1">
                AI tìm được {draft.competitors.length} đối thủ. Kiểm tra nguồn trước khi lưu.
              </CardDescription>
            </div>
            <Badge variant="outline">Bản nháp · hết hạn sau 15 phút</Badge>
          </CardHeader>
          <CardContent className="min-w-0">
            <CompetitorTable competitors={draft.competitors} onDetails={openDetails} />
          </CardContent>
        </Card>
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-h-[min(85dvh,800px)] overflow-y-auto sm:max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <p className="page-kicker">HỒ SƠ ĐỐI THỦ</p>
                <DialogTitle>{selected.companyName}</DialogTitle>
                <DialogDescription>{selected.productName || "Chưa xác định sản phẩm cụ thể"}</DialogDescription>
              </DialogHeader>
              <dl className="grid gap-4 sm:grid-cols-2">
                {[
                  ["Định vị", selected.overview],
                  ["Khách hàng mục tiêu", display(selected.targetCustomer)],
                  ["Giá", display(selected.pricing)],
                  ["Tính năng nổi bật", selected.keyFeatures.join(" · ") || "Chưa có dữ liệu"],
                  ["Điểm mạnh", selected.strengths.join(" · ") || "Chưa có dữ liệu"],
                  ["Điểm yếu", selected.weaknesses.join(" · ") || "Chưa có dữ liệu"],
                ].map(([label, value]) => (
                  <div className="space-y-1.5" key={label}>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
                    <dd className="whitespace-pre-wrap break-words leading-relaxed">{value}</dd>
                  </div>
                ))}
              </dl>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Nguồn tham khảo</h3>
                <ul className="space-y-3">
                  {selected.sources.map((source) => (
                    <li className="rounded-lg border border-border p-3" key={source.id}>
                      <a className="inline-flex items-center gap-1 font-medium text-primary hover:underline" href={source.url} rel="noopener noreferrer" target="_blank">
                        {source.title} <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
                      </a>
                      <p className="mt-1 text-xs text-muted-foreground">{source.domain}</p>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{source.snippet}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={replaceOpen} onOpenChange={(open) => { if (!saving) setReplaceOpen(open); }}>
        <DialogContent showCloseButton={!saving}>
          <DialogHeader>
            <DialogTitle>Thay danh sách đối thủ?</DialogTitle>
            <DialogDescription>
              Khi lưu, {savedCompetitors.length} đối thủ hiện tại sẽ được thay bằng {draft?.competitors.length ?? 0} kết quả mới. Thao tác này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button disabled={saving} onClick={() => setReplaceOpen(false)} variant="outline">Hủy</Button>
            <Button disabled={saving || !draft} onClick={() => void saveDraft()}>
              {saving && <LoaderCircle aria-hidden="true" className="animate-spin" />}
              {saving ? "Đang lưu" : "Thay danh sách"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
