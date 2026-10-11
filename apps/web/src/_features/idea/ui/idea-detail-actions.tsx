"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoaderCircle, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { IdeaCreateForm } from "./idea-create-form";
import { deleteIdeaAction, updateIdeaAction } from "../index.server";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type IdeaForActions = {
  id: string;
  name: string;
  description: string | null;
  industry: string | null;
  problem: string | null;
  targetCustomer: string | null;
  solution: string | null;
  revenueModels: string[];
};

export function IdeaDetailActions({
  idea,
  compact = false,
}: {
  idea: IdeaForActions;
  compact?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePending, startDelete] = useTransition();
  const updateAction = updateIdeaAction.bind(null, idea.id);

  const handleUpdateSuccess = () => {
    setEditOpen(false);
    toast.success("Đã cập nhật ý tưởng.", {
      description: "Thay đổi của bạn đã được lưu.",
    });
  };

  const handleDelete = () => {
    startDelete(async () => {
      const result = await deleteIdeaAction(idea.id);
      if (!result.success) {
        setDeleteError(result.error);
        return;
      }

      setDeleteOpen(false);
      toast.success("Đã xóa ý tưởng.", {
        description: "Ý tưởng đã được xóa khỏi không gian của bạn.",
      });
      if (pathname !== "/ideas") router.push("/ideas");
    });
  };

  return (
    <div className={compact ? "idea-action-buttons idea-action-buttons-compact" : "idea-action-buttons"}>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild>
          <Button
            aria-label={compact ? `Sửa ${idea.name}` : undefined}
            size={compact ? "sm" : "default"}
            variant="outline"
          >
            <Pencil aria-hidden="true" />
            {compact ? "Sửa" : "Chỉnh sửa"}
          </Button>
        </DialogTrigger>
        <DialogContent className="idea-create-dialog" showCloseButton={false}>
          <DialogHeader className="idea-create-dialog-header">
            <div>
              <p className="page-kicker">THÔNG TIN SẢN PHẨM</p>
              <DialogTitle className="idea-create-dialog-title">Chỉnh sửa ý tưởng</DialogTitle>
              <DialogDescription>
                Cập nhật thông tin và mô hình doanh thu của ý tưởng.
              </DialogDescription>
            </div>
            <DialogClose asChild>
              <Button aria-label="Đóng cửa sổ chỉnh sửa" size="icon-sm" variant="ghost">
                <X aria-hidden="true" />
                <span className="sr-only">Đóng cửa sổ chỉnh sửa</span>
              </Button>
            </DialogClose>
          </DialogHeader>
          {editOpen ? (
            <IdeaCreateForm
              action={updateAction}
              initialValues={{
                name: idea.name,
                description: idea.description ?? "",
                industry: idea.industry ?? "",
                problem: idea.problem ?? "",
                targetCustomer: idea.targetCustomer ?? "",
                solution: idea.solution ?? "",
                revenueModels: idea.revenueModels.join("\n"),
              }}
              onSuccess={handleUpdateSuccess}
              submitLabel="Lưu thay đổi"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) setDeleteError(null);
        }}
      >
        <DialogTrigger asChild>
          <Button
            aria-label={compact ? `Xóa ${idea.name}` : undefined}
            size={compact ? "sm" : "default"}
            variant="destructive"
          >
            <Trash2 aria-hidden="true" />
            Xóa
          </Button>
        </DialogTrigger>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Xóa ý tưởng này?</DialogTitle>
            <DialogDescription>
              Ý tưởng “{idea.name}” sẽ bị xóa vĩnh viễn. Bạn không thể hoàn tác thao tác này.
            </DialogDescription>
          </DialogHeader>
          {deleteError ? (
            <p className="idea-form-error" role="alert">{deleteError}</p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button disabled={deletePending} variant="outline">Hủy</Button>
            </DialogClose>
            <Button disabled={deletePending} onClick={handleDelete} variant="destructive">
              {deletePending ? (
                <LoaderCircle aria-hidden="true" className="is-spinning" />
              ) : (
                <Trash2 aria-hidden="true" />
              )}
              {deletePending ? "Đang xóa..." : "Xóa vĩnh viễn"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
