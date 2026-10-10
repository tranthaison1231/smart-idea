"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

import type { CreateIdeaState } from "../server/create-idea-action";
import { IdeaCreateForm } from "./idea-create-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type CreateIdeaAction = (
  state: CreateIdeaState,
  formData: FormData,
) => Promise<CreateIdeaState>;

export function IdeaCreateDialog({
  action,
  triggerLabel,
}: {
  action: CreateIdeaAction;
  triggerLabel: string;
}) {
  const [open, setOpen] = useState(false);

  const handleSuccess = () => {
    setOpen(false);
    toast.success("Đã tạo ý tưởng.", {
      description: "Ý tưởng đã được lưu vào không gian của bạn.",
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg">
          <Plus aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="idea-create-dialog" showCloseButton={false}>
        <DialogHeader className="idea-create-dialog-header">
          <div>
            <p className="page-kicker">THÔNG TIN SẢN PHẨM</p>
            <DialogTitle className="idea-create-dialog-title">Tạo ý tưởng</DialogTitle>
            <DialogDescription>
              Chỉ cần tên ý tưởng để bắt đầu. Các thông tin còn lại có thể bổ sung sau.
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <Button aria-label="Đóng cửa sổ tạo ý tưởng" size="icon-sm" variant="ghost">
              <X aria-hidden="true" />
              <span className="sr-only">Đóng cửa sổ tạo ý tưởng</span>
            </Button>
          </DialogClose>
        </DialogHeader>
        {open ? <IdeaCreateForm action={action} onSuccess={handleSuccess} /> : null}
      </DialogContent>
    </Dialog>
  );
}
