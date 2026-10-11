"use client";

import { Bot, Sparkles } from "lucide-react";

import { AiProviderSettingsPanel } from "./ai-provider-settings-panel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
            {open ? <AiProviderSettingsPanel /> : null}
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
