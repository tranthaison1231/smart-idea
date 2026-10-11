import type { CreateIdeaInput } from "@/_entities/idea/server/idea-repository";

function getText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function parseIdeaFormData(formData: FormData): CreateIdeaInput | null {
  const name = getText(formData, "name");
  if (!name) return null;

  const seenRevenueModels = new Set<string>();
  const revenueModels = getText(formData, "revenueModels")
    .split(/\r?\n/)
    .map((model) => model.trim())
    .filter((model) => {
      if (!model) return false;
      const key = model.toLowerCase();
      if (seenRevenueModels.has(key)) return false;
      seenRevenueModels.add(key);
      return true;
    });

  const optionalText = (key: string) => getText(formData, key) || null;

  return {
    name,
    description: optionalText("description"),
    industry: optionalText("industry"),
    problem: optionalText("problem"),
    targetCustomer: optionalText("targetCustomer"),
    solution: optionalText("solution"),
    revenueModels,
  };
}
