"use server";

import { revalidatePath } from "next/cache";

import { ideaRepository } from "@/_entities/idea/index.server";
import { requireCurrentAppUser } from "@/_features/auth/index.server";
import { parseIdeaFormData } from "./idea-form-data";

export interface CreateIdeaState {
  error: string | null;
  success: boolean;
}

export async function createIdeaAction(
  _previousState: CreateIdeaState,
  formData: FormData,
): Promise<CreateIdeaState> {
  const user = await requireCurrentAppUser();
  const input = parseIdeaFormData(formData);

  if (!input) return { error: "Vui lòng nhập tên ý tưởng.", success: false };

  try {
    await ideaRepository.createForOwner(user.id, input);
  } catch (error) {
    console.error("Unable to save idea", error);
    return { error: "Chưa thể lưu ý tưởng. Vui lòng thử lại.", success: false };
  }

  revalidatePath("/ideas");
  return { error: null, success: true };
}
