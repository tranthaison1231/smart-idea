"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { LoaderCircle, Plus, RotateCw, SlidersHorizontal, X } from "lucide-react";

import {
  DEFAULT_MARKET_DISCOVERY_PREFERENCES,
  parseMarketDiscoveryPreferences,
  type MarketDiscoveryPreferences,
} from "@/_entities/market-discovery";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const fields = [
  {
    key: "markets",
    label: "Thị trường",
    hint: "Chọn tối đa 3 thị trường. Bỏ trống để khám phá rộng.",
    max: 3,
    suggestions: ["Việt Nam", "United States", "Đông Nam Á", "Nhật Bản", "Singapore", "Indonesia"],
  },
  {
    key: "topics",
    label: "Chủ đề",
    hint: "Để trống nếu bạn muốn khám phá đa lĩnh vực.",
    max: 8,
    suggestions: ["AI", "Fintech", "Giáo dục", "Y tế", "Bán lẻ", "Logistics", "Năng suất", "Creator economy"],
  },
  {
    key: "revenueModels",
    label: "Mô hình doanh thu",
    hint: "Chọn cách kiếm tiền bạn muốn ưu tiên.",
    max: 8,
    suggestions: ["Subscription / SaaS", "Freemium + Upsell", "Usage-based / API", "Marketplace / Transaction", "Digital Goods", "Ads / Affiliate", "Dịch vụ / Managed service"],
  },
  {
    key: "customerSegments",
    label: "Khách hàng mục tiêu",
    hint: "Để trống nếu muốn tìm trên nhiều nhóm khách hàng.",
    max: 8,
    suggestions: ["SME", "Startup", "Doanh nghiệp lớn", "Người tiêu dùng", "Nhà sáng tạo nội dung", "Hộ kinh doanh", "Cơ quan nhà nước"],
  },
] as const;

type PreferenceKey = Exclude<keyof MarketDiscoveryPreferences, "hiddenTags">;

function copyDefaults(): MarketDiscoveryPreferences {
  return {
    markets: [...DEFAULT_MARKET_DISCOVERY_PREFERENCES.markets],
    topics: [],
    revenueModels: [],
    customerSegments: [],
    hiddenTags: { markets: [], topics: [], revenueModels: [], customerSegments: [] },
  };
}

function PreferenceField({
  field,
  value,
  onChange,
  hiddenValue,
  onHiddenChange,
}: {
  field: (typeof fields)[number];
  value: string[];
  onChange: (value: string[]) => void;
  hiddenValue: string[];
  onHiddenChange: (value: string[]) => void;
}) {
  const [customValue, setCustomValue] = useState("");
  const atLimit = value.length >= field.max;
  function toggle(label: string) {
    const selected = value.some((item) => item.toLocaleLowerCase() === label.toLocaleLowerCase());
    if (selected) {
      onChange(value.filter((item) => item.toLocaleLowerCase() !== label.toLocaleLowerCase()));
    } else if (!atLimit) {
      onChange([...value, label]);
    }
  }

  function addCustom() {
    const label = customValue.trim();
    if (!label || label.length > 80 || atLimit || value.some((item) => item.toLocaleLowerCase() === label.toLocaleLowerCase())) return;
    onChange([...value, label]);
    setCustomValue("");
  }

  function remove(label: string) {
    onChange(value.filter((item) => item.toLocaleLowerCase() !== label.toLocaleLowerCase()));
    if (field.suggestions.some((item) => item.toLocaleLowerCase() === label.toLocaleLowerCase())) {
      onHiddenChange([...hiddenValue, label]);
    }
  }

  const options = [...new Set([
    ...field.suggestions.filter((label) => !hiddenValue.some((item) => item.toLocaleLowerCase() === label.toLocaleLowerCase())),
    ...value,
  ])];
  return (
    <section className="grid gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label className="font-semibold">{field.label}</Label>
        <span className="text-xs text-muted-foreground">{value.length}/{field.max}</span>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{field.hint}</p>
      <div aria-label={field.label} className="flex flex-wrap gap-2" role="group">
        {options.map((label) => {
          const selected = value.some((item) => item.toLocaleLowerCase() === label.toLocaleLowerCase());
          return (
            <span className="inline-flex" key={label}>
              <Button
                aria-pressed={selected}
                className="h-8 rounded-l-full rounded-r-none"
                disabled={!selected && atLimit}
                onClick={() => toggle(label)}
                size="sm"
                type="button"
                variant={selected ? "secondary" : "outline"}
              >
                {label}
              </Button>
              <Button
                aria-label={`Xóa tag ${label}`}
                className="-ml-px h-8 w-8 rounded-l-none rounded-r-full px-0"
                onClick={() => remove(label)}
                size="icon"
                type="button"
                variant={selected ? "secondary" : "outline"}
              >
                <X aria-hidden="true" className="size-3.5" />
              </Button>
            </span>
          );
        })}
      </div>
      <div className="flex gap-2">
        <Input
          aria-label={`Nhãn tùy chỉnh cho ${field.label}`}
          maxLength={80}
          onChange={(event) => setCustomValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addCustom();
            }
          }}
          placeholder={`Thêm ${field.label.toLocaleLowerCase()} khác`}
          value={customValue}
        />
        <Button aria-label={`Thêm vào ${field.label}`} disabled={atLimit || !customValue.trim()} onClick={addCustom} size="icon" type="button" variant="outline">
          <Plus aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}

export function MarketDiscoverySettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [preferences, setPreferences] = useState(copyDefaults);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  const requestPreferences = useCallback(async () => {
    const response = await fetch("/api/market-discovery/preferences", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    const parsed = parseMarketDiscoveryPreferences(body?.preferences);
    if (!response.ok || !parsed) throw new Error("preferences_load_failed");
    return parsed;
  }, []);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void requestPreferences()
      .then((loaded) => { if (active) setPreferences(loaded); })
      .catch(() => { if (active) setLoadError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, requestPreferences]);

  const loadPreferences = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      setPreferences(await requestPreferences());
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [requestPreferences]);

  function update(key: PreferenceKey, value: string[]) {
    setPreferences((current) => ({ ...current, [key]: value }));
  }

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetch("/api/market-discovery/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      const saved = parseMarketDiscoveryPreferences(body?.preferences);
      if (!response.ok || !saved) throw new Error("preferences_save_failed");
      toast.success("Đã lưu cấu hình Khám phá", {
        description: "Cấu hình sẽ được áp dụng khi bạn làm mới nguồn tiếp theo.",
      });
      onOpenChange(false);
    } catch {
      toast.error("Chưa lưu được cấu hình", { description: "Hãy kiểm tra kết nối rồi thử lại." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border/70 px-5 py-5 pr-14 sm:px-6">
          <div className="mb-1 flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <SlidersHorizontal aria-hidden="true" className="size-4" />
            </span>
            <DialogTitle className="text-lg">Cấu hình khám phá</DialogTitle>
          </div>
          <DialogDescription className="leading-5">
            Chọn các ưu tiên để AI tìm cơ hội phù hợp hơn. Đây là gợi ý linh hoạt, không loại trừ cơ hội khác có bằng chứng.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div aria-busy="true" className="grid gap-6 px-5 py-6 sm:px-6" role="status">
            <span className="sr-only">Đang tải cấu hình khám phá...</span>
            {fields.map((field) => (
              <div aria-hidden="true" className="grid gap-3" key={field.key}>
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-64 max-w-full" />
                <div className="flex gap-2"><Skeleton className="h-8 w-24" /><Skeleton className="h-8 w-28" /><Skeleton className="h-8 w-20" /></div>
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="grid justify-items-start gap-3 px-5 py-8 sm:px-6">
            <p className="text-sm text-destructive">Không tải được cấu hình khám phá.</p>
            <Button onClick={() => void loadPreferences()} size="sm" type="button" variant="outline">
              <RotateCw aria-hidden="true" /> Tải lại
            </Button>
          </div>
        ) : (
          <form className="grid gap-6 px-5 py-6 sm:px-6" onSubmit={savePreferences}>
            {fields.map((field) => (
              <PreferenceField
                field={field}
                hiddenValue={preferences.hiddenTags[field.key]}
                key={field.key}
                onHiddenChange={(value) => setPreferences((current) => ({
                  ...current,
                  hiddenTags: { ...current.hiddenTags, [field.key]: value },
                }))}
                onChange={(value) => update(field.key, value)}
                value={preferences[field.key]}
              />
            ))}
            <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
              <Button disabled={saving} onClick={() => onOpenChange(false)} type="button" variant="outline">Hủy</Button>
              <Button disabled={saving || loading} type="submit">
                {saving ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
                {saving ? "Đang lưu" : "Lưu cấu hình"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
