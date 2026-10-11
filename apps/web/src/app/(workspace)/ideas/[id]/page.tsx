import { IdeaDetailPage } from "@/_pages/ideas";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <IdeaDetailPage id={id} />;
}
