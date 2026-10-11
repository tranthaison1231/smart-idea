"use client";

import { ExternalLink } from "lucide-react";

import type { MarketDiscoveryOpportunity } from "@/_entities/market-discovery";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const confidenceLabels = { low: "Thấp", medium: "Trung bình", high: "Cao" } as const;

export function OpportunityDetailDialog({
  opportunity,
  open,
  onOpenChange,
}: {
  opportunity: MarketDiscoveryOpportunity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!opportunity) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="pr-8">
          <p className="page-kicker">CƠ HỘI SẢN PHẨM</p>
          <DialogTitle className="text-xl">{opportunity.productName}</DialogTitle>
          <DialogDescription>{opportunity.problem}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 pt-2">
          <section className="grid gap-2">
            <h3 className="text-sm font-semibold">Khách hàng mục tiêu</h3>
            <p className="text-sm leading-6 text-muted-foreground">{opportunity.targetCustomer}</p>
          </section>
          <section className="grid gap-2">
            <h3 className="text-sm font-semibold">Sản phẩm gợi ý</h3>
            <p className="text-sm leading-6 text-muted-foreground">{opportunity.solution}</p>
          </section>
          <section className="grid gap-2">
            <h3 className="text-sm font-semibold">Vì sao lúc này?</h3>
            <p className="text-sm leading-6 text-muted-foreground">{opportunity.whyNow}</p>
          </section>
          <section className="grid gap-2">
            <h3 className="text-sm font-semibold">Mô hình doanh thu</h3>
            <div className="flex flex-wrap gap-2">
              {opportunity.revenueModels.map((model) => <Badge key={model} variant="outline">{model}</Badge>)}
            </div>
          </section>
          <section className="grid gap-2">
            <h3 className="text-sm font-semibold">Độ tin cậy · {confidenceLabels[opportunity.confidence]}</h3>
            <p className="text-sm leading-6 text-muted-foreground">{opportunity.confidenceRationale}</p>
          </section>
          <section className="grid gap-3">
            <h3 className="text-sm font-semibold">Nguồn tham khảo</h3>
            {opportunity.sources.map((source) => (
              <a
                className="group flex items-start justify-between gap-4 rounded-lg border border-border/70 bg-background/40 p-3 transition-colors hover:bg-muted/60"
                href={source.url}
                key={source.id}
                rel="noreferrer"
                target="_blank"
              >
                <span className="grid gap-1">
                  <span className="text-sm font-medium leading-5">{source.title}</span>
                  <span className="text-xs text-muted-foreground">{source.domain}{source.publishedAt ? ` · ${source.publishedAt}` : ""}</span>
                </span>
                <ExternalLink aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground group-hover:text-foreground" size={15} />
              </a>
            ))}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
