import { IdeaDetailPage } from "@/_pages/ideas";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const [{ id }, { tab }] = await Promise.all([params, searchParams]);
  return <IdeaDetailPage id={id} tab={Array.isArray(tab) ? tab[0] : tab} />;
}
