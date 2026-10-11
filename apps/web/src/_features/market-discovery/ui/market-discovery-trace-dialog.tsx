"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CircleCheck, CircleX, Copy, Download, ExternalLink, History, LoaderCircle } from "lucide-react";

import type { MarketDiscoveryTrace, MarketDiscoveryTraceSpan } from "@/_entities/market-discovery";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

type TraceSource = { id: string; title: string; url: string; domain: string; snippet: string; publishedAt: string | null };
type TraceRoot = Omit<MarketDiscoveryTrace, "spans">;
type TraceResponse = { trace: TraceRoot; spans: MarketDiscoveryTraceSpan[]; sources: TraceSource[]; opportunities: Array<Record<string, unknown>> };
type TabKey = "overview" | "io" | "spans" | "events" | "sources";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Tổng quan" },
  { key: "io", label: "Input / Output" },
  { key: "spans", label: "Spans" },
  { key: "events", label: "Events" },
  { key: "sources", label: "Nguồn" },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTraceResponse(value: unknown): value is TraceResponse {
  if (!isRecord(value) || !isRecord(value.trace) || !Array.isArray(value.spans) || !Array.isArray(value.sources) || !Array.isArray(value.opportunities)) return false;
  const trace = value.trace;
  return trace.version === 2 && typeof trace.status === "string" && typeof trace.start_time === "string" && Array.isArray(value.spans);
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null) return "—";
  return durationMs < 1000 ? `${durationMs} ms` : `${(durationMs / 1000).toFixed(1)} s`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function statusLabel(status: "completed" | "failed" | "running") {
  return status === "completed" ? "Hoàn tất" : status === "failed" ? "Thất bại" : "Đang chạy";
}

function StatusBadge({ status }: { status: "completed" | "failed" | "running" }) {
  return (
    <Badge variant={status === "completed" ? "default" : status === "failed" ? "destructive" : "secondary"} className="gap-1 text-xs">
      {status === "completed" ? <CircleCheck aria-hidden="true" size={12} /> : status === "failed" ? <CircleX aria-hidden="true" size={12} /> : <LoaderCircle aria-hidden="true" className="animate-spin" size={12} />}
      {statusLabel(status)}
    </Badge>
  );
}

function spanTitle(span: MarketDiscoveryTraceSpan) {
  if (span.span_type === "llm_call") return span.model ? `${span.provider ?? "provider"}/${span.model}` : span.name;
  if (span.span_type === "tool_call") return span.tool_name ?? span.name;
  return span.name;
}

function providerFromTrace(trace: TraceRoot) {
  const provider = trace.metadata.provider;
  return isRecord(provider) ? provider : null;
}

function applicationPrompt(trace: TraceRoot) {
  const prompt = trace.metadata.application_prompt;
  return isRecord(prompt) ? prompt : null;
}

function PreviewBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard is optional */ }
  }
  return (
    <section className="grid gap-2 rounded-lg border border-border/70 bg-muted/10 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        <Button aria-label={`Sao chép ${label}`} onClick={() => void copy()} size="sm" variant="ghost">
          {copied ? <Check aria-hidden="true" className="text-emerald-400" /> : <Copy aria-hidden="true" />}
          {copied ? "Đã sao chép" : "Sao chép"}
        </Button>
      </div>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/60 bg-background/40 p-3 text-xs leading-5 text-muted-foreground">{value || "—"}</pre>
    </section>
  );
}

function SpanRow({ span }: { span: MarketDiscoveryTraceSpan }) {
  return (
    <details className="rounded-lg border border-border/70 bg-muted/5 p-3">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2">
        <Badge variant="outline" className="shrink-0 text-xs">{span.span_type}</Badge>
        <span className="min-w-0 flex-1 truncate font-medium">{spanTitle(span)}</span>
        {span.input_tokens !== undefined && span.output_tokens !== undefined ? <span className="text-xs text-muted-foreground">{span.input_tokens ?? 0}/{span.output_tokens ?? 0} tokens</span> : null}
        <span className="text-xs text-muted-foreground">{formatDuration(span.duration_ms)}</span>
        <StatusBadge status={span.status} />
      </summary>
      <div className="mt-3 grid gap-3 border-t border-border/60 pt-3 text-xs">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
          <span>{formatTime(span.start_time)}</span>
          {span.provider ? <span>Provider: {span.provider}</span> : null}
          {span.model ? <span>Model: {span.model}</span> : null}
          {span.tool_name ? <span>Tool: {span.tool_name}</span> : null}
          <span>ID: {span.id}</span>
        </div>
        {span.input_preview ? <PreviewBlock label="Input" value={span.input_preview} /> : null}
        {span.output_preview ? <PreviewBlock label="Output" value={span.output_preview} /> : null}
        {span.error ? <p className="text-destructive">Lỗi: {span.error}</p> : null}
        {span.metadata && Object.keys(span.metadata).length ? <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">{JSON.stringify(span.metadata, null, 2)}</pre> : null}
      </div>
    </details>
  );
}

export function MarketDiscoveryTraceDialog({
  runId,
  open,
  onOpenChange,
}: {
  runId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [data, setData] = useState<TraceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<TabKey>("overview");

  useEffect(() => {
    if (!open) return;
    let active = true;
    void fetch(`/api/market-discovery/runs/${runId}/trace`, { cache: "no-store" })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok || !isTraceResponse(body)) throw new Error("trace_load_failed");
        if (active) {
          setError(false);
          setTab("overview");
          setData(body);
        }
      })
      .catch(() => { if (active) setError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, runId]);

  const spans = useMemo(() => data?.spans ?? [], [data]);
  const nonEventSpans = spans.filter((span) => span.span_type !== "event");
  const eventSpans = spans.filter((span) => span.span_type === "event");
  const provider = data ? providerFromTrace(data.trace) : null;
  const prompt = data ? applicationPrompt(data.trace) : null;

  async function exportTrace() {
    setExporting(true);
    try {
      const response = await fetch(`/api/market-discovery/runs/${runId}/trace/export`, { cache: "no-store" });
      if (!response.ok) throw new Error("trace_export_failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `trace-${runId.slice(0, 8)}.json.gz`;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      window.setTimeout(() => { anchor.remove(); URL.revokeObjectURL(url); }, 1000);
    } catch { setError(true); } finally { setExporting(false); }
  }

  async function copyTraceId() {
    try {
      await navigator.clipboard.writeText(runId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch { setError(true); }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-[85vh] w-[95vw] !max-w-6xl flex-col">
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
            <div className="flex min-w-0 items-center gap-2">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-primary/30 bg-primary/10 text-primary"><History aria-hidden="true" size={16} /></span>
              <div className="min-w-0"><DialogTitle>Trace khám phá</DialogTitle><DialogDescription className="truncate">Theo dõi Input, Output, spans và nguồn đã dùng</DialogDescription></div>
            </div>
            <div className="flex items-center gap-1">
              <Button disabled={copied} onClick={() => void copyTraceId()} size="sm" variant="ghost">{copied ? <Check aria-hidden="true" className="text-emerald-400" /> : <Copy aria-hidden="true" />}{copied ? "Đã sao chép" : "Sao chép trace ID"}</Button>
              <Button disabled={!data || exporting} onClick={() => void exportTrace()} size="sm" variant="ghost">{exporting ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <Download aria-hidden="true" />}Xuất .json.gz</Button>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto -mx-4 px-4 sm:-mx-6 sm:px-6">
          {loading ? (
            <div aria-busy="true" className="grid gap-4 py-2" role="status"><div className="grid gap-2 sm:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton className="h-6 w-full" key={index} />)}</div>{Array.from({ length: 5 }, (_, index) => <Skeleton className="h-14 w-full" key={index} />)}</div>
          ) : error ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-200">Không tải được trace của lần khám phá này. Các cơ hội trong feed vẫn được giữ nguyên.</p>
          ) : data ? (
            <div className="grid gap-4 pb-2">
              <div className="grid gap-3 rounded-lg border border-border/70 bg-muted/20 p-4 text-sm sm:grid-cols-4">
                <div><p className="text-xs text-muted-foreground">Trạng thái</p><StatusBadge status={data.trace.status} /></div>
                <div><p className="text-xs text-muted-foreground">Thời lượng</p><p>{formatDuration(data.trace.duration_ms)}</p></div>
                <div><p className="text-xs text-muted-foreground">Provider / Model</p><p className="truncate">{String(provider?.type ?? "—")} / {String(provider?.model ?? "—")}</p></div>
                <div><p className="text-xs text-muted-foreground">Bắt đầu</p><p>{formatTime(data.trace.start_time)}</p></div>
                <div><p className="text-xs text-muted-foreground">Số nguồn</p><p>{data.sources.length}</p></div>
                <div><p className="text-xs text-muted-foreground">Số cơ hội</p><p>{data.opportunities.length}</p></div>
                <div><p className="text-xs text-muted-foreground">Spans</p><p>{nonEventSpans.length}</p></div>
                <div><p className="text-xs text-muted-foreground">LLM / Tool</p><p>{data.trace.llm_call_count} / {data.trace.tool_call_count}</p></div>
                <div><p className="text-xs text-muted-foreground">Events</p><p>{eventSpans.length}</p></div>
                {data.trace.error ? <div className="sm:col-span-4"><p className="text-xs text-muted-foreground">Lỗi</p><p className="text-destructive">{data.trace.error}</p></div> : null}
              </div>

              <nav aria-label="Các phần trace" className="flex flex-wrap gap-1 border-b border-border/70 pb-1">
                {tabs.map((item) => <Button aria-current={tab === item.key ? "page" : undefined} className={tab === item.key ? "border-primary bg-primary/10 text-primary" : ""} key={item.key} onClick={() => setTab(item.key)} size="sm" variant="ghost">{item.label}{item.key === "spans" ? ` (${nonEventSpans.length})` : item.key === "events" ? ` (${eventSpans.length})` : item.key === "sources" ? ` (${data.sources.length})` : ""}</Button>)}
              </nav>

              {tab === "overview" ? <section className="grid gap-3">
                <div className="grid gap-2 rounded-lg border border-border/70 p-4"><h3 className="text-sm font-semibold">Luồng xử lý</h3><p className="text-sm leading-6 text-muted-foreground">{spans.filter((span) => span.span_type === "event").map((span) => span.name).join(" → ") || "Chưa có event"}</p><div className="grid gap-2 sm:grid-cols-3">{(["agent", "llm_call", "tool_call"] as const).map((type) => <div className="rounded-md border border-border/60 bg-muted/10 p-3" key={type}><p className="text-xs text-muted-foreground">{type}</p><p className="mt-1 text-lg font-semibold">{spans.filter((span) => span.span_type === type).length}</p></div>)}</div></div>
                {data.trace.error ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{data.trace.error}</p> : null}
              </section> : null}

              {tab === "io" ? <section className="grid gap-3"><p className="text-xs text-muted-foreground">Chỉ hiển thị prompt ứng dụng đã redact và kết quả provider. Không lưu chain-of-thought nội bộ, system/developer secret hoặc credential.</p><PreviewBlock label="Input" value={data.trace.input_preview} />{prompt ? <div className="grid gap-2 rounded-lg border border-border/70 p-3"><h3 className="text-sm font-semibold">Prompt ứng dụng</h3><pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">{JSON.stringify(prompt, null, 2)}</pre></div> : null}<PreviewBlock label="Output" value={data.trace.output_preview} /></section> : null}

              {tab === "spans" ? <section className="grid gap-2"><p className="text-xs text-muted-foreground">Mỗi dòng là một span xử lý thật: agent, tool_call hoặc llm_call.</p>{nonEventSpans.map((span) => <SpanRow key={span.id} span={span} />)}</section> : null}

              {tab === "events" ? <section className="grid gap-2"><p className="text-xs text-muted-foreground">Các mốc trạng thái của pipeline được hiển thị riêng để dễ theo dõi.</p>{eventSpans.map((span) => <SpanRow key={span.id} span={span} />)}</section> : null}

              {tab === "sources" ? <section className="grid gap-2"><p className="text-xs text-muted-foreground">Danh sách nguồn công khai được dùng để tổng hợp cơ hội.</p>{data.sources.map((source) => <a className="inline-flex min-w-0 items-center gap-2 rounded-md border border-border/60 p-3 text-sm text-muted-foreground hover:text-foreground" href={source.url} key={source.id} rel="noreferrer" target="_blank"><span className="min-w-0 flex-1"><span className="block truncate font-medium text-foreground">{source.title}</span><span className="block truncate text-xs">{source.domain}</span></span><ExternalLink aria-hidden="true" className="shrink-0" size={14} /></a>)}</section> : null}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
