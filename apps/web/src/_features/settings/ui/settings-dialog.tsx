"use client";

import { lazy, Suspense } from "react";
import { Bot, Sparkles } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const AiProviderSettingsPanel = lazy(() =>
  import("./ai-provider-settings-panel").then((module) => ({
    default: module.AiProviderSettingsPanel,
  })),
);

function ProviderSettingsSkeleton() {
  return (
    <section aria-busy="true" className="space-y-5" role="status">
      <span className="sr-only">Đang tải cài đặt provider AI...</span>
      <div aria-hidden="true" className="flex items-center justify-between gap-4">
        <div className="grid gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-56 max-w-[50vw]" />
        </div>
        <Skeleton className="h-9 w-32" />
      </div>
      <Card aria-hidden="true" className="gap-3">
        <CardHeader className="gap-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-64 max-w-[60vw]" />
        </CardHeader>
        <CardContent className="grid gap-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div className="flex items-center gap-3 rounded-lg border p-4" key={index}>
              <Skeleton className="size-10 shrink-0 rounded-xl" />
              <div className="grid flex-1 gap-2">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
              <Skeleton className="size-8 rounded-md" />
              <Skeleton className="size-8 rounded-md" />
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(780px,calc(100dvh-2rem))] max-w-5xl overflow-hidden p-0 sm:max-w-5xl">
        <div className="flex h-full min-h-0 flex-col sm:flex-row">
          <aside className="shrink-0 border-b bg-muted/20 p-4 sm:w-56 sm:border-r sm:border-b-0 sm:p-5">
            <div className="mb-6 flex items-center gap-3 px-1 pt-1">
              <div className="flex size-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <Sparkles aria-hidden="true" className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">Cài đặt</p>
                <p className="text-xs text-muted-foreground">Smart Idea</p>
              </div>
            </div>
            <nav aria-label="Mục cài đặt">
              <Button
                aria-current="page"
                className="w-full justify-start gap-2"
                type="button"
                variant="secondary"
              >
                <Bot aria-hidden="true" className="size-4 text-primary" />
                Provider AI
              </Button>
            </nav>
          </aside>

          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-5 sm:p-8">
            <DialogHeader className="mb-6 pr-10">
              <DialogTitle className="text-xl">Cài đặt workspace</DialogTitle>
              <DialogDescription>
                Quản lý cấu hình AI riêng cho tài khoản của bạn.
              </DialogDescription>
            </DialogHeader>
            {open ? (
              <Suspense fallback={<ProviderSettingsSkeleton />}>
                <AiProviderSettingsPanel />
              </Suspense>
            ) : null}
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
