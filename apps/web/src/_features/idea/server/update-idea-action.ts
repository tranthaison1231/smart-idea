"use server";

import { revalidatePath } from "next/cache";

import { ideaRepository } from "@/_entities/idea/index.server";
import { requireCurrentAppUser } from "@/_features/auth/index.server";
import type { CreateIdeaState } from "./create-idea-action";
import { parseIdeaFormData } from "./idea-form-data";

export async function updateIdeaAction(
  ideaId: string,
  _previousState: CreateIdeaState,
  formData: FormData,
): Promise<CreateIdeaState> {
  const user = await requireCurrentAppUser();
  const input = parseIdeaFormData(formData);

  if (!input) return { error: "Vui lòng nhập tên ý tưởng.", success: false };

  try {
    const updated = await ideaRepository.updateForOwner(ideaId, user.id, input);
    if (!updated) {
      return {
        error: "Không tìm thấy ý tưởng hoặc bạn không có quyền chỉnh sửa.",
        success: false,
      };
    }
  } catch (error) {
    console.error("Unable to update idea", error);
    return { error: "Chưa thể cập nhật ý tưởng. Vui lòng thử lại.", success: false };
  }

  revalidatePath("/ideas");
  revalidatePath(`/ideas/${ideaId}`);
  return { error: null, success: true };
}
