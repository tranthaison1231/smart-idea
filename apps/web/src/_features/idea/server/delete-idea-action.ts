"use server";

import { revalidatePath } from "next/cache";

import { ideaRepository } from "@/_entities/idea/index.server";
import { requireCurrentAppUser } from "@/_features/auth/index.server";
import type { CreateIdeaState } from "./create-idea-action";

export async function deleteIdeaAction(ideaId: string): Promise<CreateIdeaState> {
  const user = await requireCurrentAppUser();

  try {
    const deleted = await ideaRepository.deleteForOwner(ideaId, user.id);
    if (!deleted) {
      return {
        error: "Không tìm thấy ý tưởng hoặc bạn không có quyền xóa.",
        success: false,
      };
    }
  } catch (error) {
    console.error("Unable to delete idea", error);
    return { error: "Chưa thể xóa ý tưởng. Vui lòng thử lại.", success: false };
  }

  revalidatePath("/ideas");
  revalidatePath(`/ideas/${ideaId}`);
  return { error: null, success: true };
}
