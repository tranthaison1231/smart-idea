"use client";

import { useActionState, useState, type ChangeEvent } from "react";
import { ArrowUpRight, LoaderCircle } from "lucide-react";

import type { CreateIdeaState } from "../server/create-idea-action";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type CreateIdeaAction = (
  state: CreateIdeaState,
  formData: FormData,
) => Promise<CreateIdeaState>;

type IdeaFormValues = {
  name: string;
  description: string;
  industry: string;
  targetCustomer: string;
  problem: string;
  solution: string;
  revenueModels: string;
};

const initialState = { error: null, success: false } as const;

const emptyValues: IdeaFormValues = {
  name: "",
  description: "",
  industry: "",
  targetCustomer: "",
  problem: "",
  solution: "",
  revenueModels: "",
};

export function IdeaCreateForm({
  action,
  onSuccess,
  initialValues: providedValues,
  submitLabel = "Lưu ý tưởng",
}: {
  action: CreateIdeaAction;
  onSuccess?: () => void;
  initialValues?: Partial<IdeaFormValues>;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(
    async (previousState: CreateIdeaState, formData: FormData) => {
      const result = await action(previousState, formData);
      if (result.success) onSuccess?.();
      return result;
    },
    initialState,
  );
  const [values, setValues] = useState(() => ({ ...emptyValues, ...providedValues }));

  const updateField = (field: keyof IdeaFormValues) => (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const value = event.currentTarget.value;
    setValues((current) => ({ ...current, [field]: value }));
  };

  return (
    <form action={formAction} className="idea-form">
      <div className="idea-form-fields">
        <div className="idea-field idea-field-full">
          <Label htmlFor="idea-name">Tên ý tưởng <span aria-hidden="true">*</span></Label>
          <Input
            autoComplete="off"
            id="idea-name"
            name="name"
            placeholder="Ví dụ: Trợ lý AI cho cửa hàng nhỏ"
            required
            value={values.name}
            onChange={updateField("name")}
          />
        </div>

        <div className="idea-field idea-field-full">
          <Label htmlFor="idea-description">Mô tả</Label>
          <Textarea
            id="idea-description"
            name="description"
            placeholder="Mô tả ngắn ý tưởng sản phẩm của bạn"
            rows={3}
            value={values.description}
            onChange={updateField("description")}
          />
        </div>

        <div className="idea-field">
          <Label htmlFor="idea-industry">Lĩnh vực</Label>
          <Input
            id="idea-industry"
            name="industry"
            placeholder="Ví dụ: Giáo dục, tài chính, bán lẻ"
            value={values.industry}
            onChange={updateField("industry")}
          />
        </div>

        <div className="idea-field">
          <Label htmlFor="idea-target-customer">Khách hàng mục tiêu</Label>
          <Textarea
            id="idea-target-customer"
            name="targetCustomer"
            placeholder="Ai sẽ sử dụng hoặc trả tiền cho sản phẩm?"
            rows={3}
            value={values.targetCustomer}
            onChange={updateField("targetCustomer")}
          />
        </div>

        <div className="idea-field">
          <Label htmlFor="idea-problem">Vấn đề cần giải quyết</Label>
          <Textarea
            id="idea-problem"
            name="problem"
            placeholder="Khách hàng đang gặp khó khăn gì?"
            rows={4}
            value={values.problem}
            onChange={updateField("problem")}
          />
        </div>

        <div className="idea-field">
          <Label htmlFor="idea-solution">Giải pháp dự kiến</Label>
          <Textarea
            id="idea-solution"
            name="solution"
            placeholder="Sản phẩm sẽ giải quyết vấn đề như thế nào?"
            rows={4}
            value={values.solution}
            onChange={updateField("solution")}
          />
        </div>

        <div className="idea-field idea-field-full">
          <Label htmlFor="idea-revenue-models">Mô hình doanh thu</Label>
          <Textarea
            id="idea-revenue-models"
            name="revenueModels"
            placeholder={"Mỗi mô hình trên một dòng, ví dụ:\nSubscription / SaaS\nFreemium + Upsell"}
            rows={3}
            value={values.revenueModels}
            onChange={updateField("revenueModels")}
          />
          <p className="idea-field-hint">Có thể nhập nhiều mô hình; dòng trống và nhãn trùng sẽ được bỏ qua.</p>
        </div>
      </div>

      {state.error ? (
        <p className="idea-form-error" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="idea-form-success" role="status">Đã lưu ý tưởng thành công.</p>
      ) : null}

      <div className="idea-form-actions">
        <Button disabled={pending || state.success} size="lg" type="submit">
          {pending ? (
            <LoaderCircle aria-hidden="true" className="is-spinning" size={17} />
          ) : (
            <ArrowUpRight aria-hidden="true" size={17} />
          )}
          {pending ? "Đang lưu..." : state.success ? "Đã lưu" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
