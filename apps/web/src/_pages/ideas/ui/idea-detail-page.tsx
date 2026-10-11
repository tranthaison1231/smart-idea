import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileSearch, Lightbulb, ListChecks, UsersRound } from "lucide-react";

import { ideaRepository } from "@/_entities/idea/index.server";
import {
  ideaCompetitorRepository,
  toIdeaCompetitorView,
} from "@/_entities/idea-competitor/index.server";
import { IdeaCompetitorsPanel } from "@/_features/idea-competitors";
import { requireCurrentAppUser } from "@/_features/auth/index.server";
import { IdeaDetailActions } from "@/_features/idea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const ideaDetailTabs = [
  { id: "overview", label: "Tổng Quan" },
  { id: "features", label: "Tính năng" },
  { id: "competitors", label: "Đối Thủ" },
  { id: "research", label: "Research" },
] as const;

type IdeaDetailTab = (typeof ideaDetailTabs)[number]["id"];

export async function IdeaDetailPage({
  id,
  tab,
}: {
  id: string;
  tab?: string;
}) {
  const user = await requireCurrentAppUser();
  const idea = await ideaRepository.findByIdForOwner(id, user.id);

  if (!idea) notFound();

  const activeTab: IdeaDetailTab = tab === "features" || tab === "competitors" || tab === "research"
    ? tab
    : "overview";
  const savedCompetitors = activeTab === "competitors"
    ? (await ideaCompetitorRepository.listByIdeaForOwner(id, user.id)).map(toIdeaCompetitorView)
    : [];

  const fields = [
    { label: "Lĩnh vực", value: idea.industry },
    { label: "Mô tả", value: idea.description },
    { label: "Vấn đề cần giải quyết", value: idea.problem },
    { label: "Khách hàng mục tiêu", value: idea.targetCustomer },
    { label: "Giải pháp dự kiến", value: idea.solution },
  ];
  const placeholder = activeTab === "features"
    ? {
        icon: ListChecks,
        kicker: "TÍNH NĂNG",
        title: "Chưa có tính năng nào",
        description: "Các tính năng dự kiến cho sản phẩm sẽ được lưu tại đây.",
      }
    : activeTab === "competitors"
      ? {
          icon: UsersRound,
          kicker: "ĐỐI THỦ",
          title: "Chưa có dữ liệu đối thủ",
          description: "Thông tin sản phẩm cạnh tranh, vị trí thị trường và điểm khác biệt sẽ được tập hợp tại đây.",
        }
      : {
          icon: FileSearch,
          kicker: "RESEARCH",
          title: "Chưa có nghiên cứu nào",
          description: "Ghi chú, nguồn tham khảo và kết quả nghiên cứu cho ý tưởng sẽ được lưu tại đây.",
        };
  const PlaceholderIcon = placeholder.icon;

  return (
    <main className="dashboard-page ideas-page" id="main-content">
      <header className="page-header ideas-page-header">
        <div className="page-title-group">
          <span className="page-title-icon">
            <Lightbulb aria-hidden="true" size={21} strokeWidth={1.8} />
          </span>
          <div className="idea-detail-heading">
            <p className="page-kicker">Ý TƯỞNG / CHI TIẾT</p>
            <Tooltip>
              <TooltipTrigger asChild>
                <h1 tabIndex={0}>{idea.name}</h1>
              </TooltipTrigger>
              <TooltipContent align="start" side="bottom" sideOffset={6}>
                {idea.name}
              </TooltipContent>
            </Tooltip>
            <p className="page-subtitle">Các thông tin đã lưu về sản phẩm.</p>
          </div>
        </div>
        <div className="idea-detail-actions">
          <IdeaDetailActions
            idea={{
              id: idea.id,
              name: idea.name,
              description: idea.description,
              industry: idea.industry,
              problem: idea.problem,
              targetCustomer: idea.targetCustomer,
              solution: idea.solution,
              revenueModels: idea.revenueModels,
            }}
          />
          <Button asChild variant="outline">
            <Link href="/ideas">
              <ArrowLeft aria-hidden="true" />
              Tất cả ý tưởng
            </Link>
          </Button>
        </div>
      </header>

      <nav aria-label="Các mục của ý tưởng" className="idea-detail-tabs">
        {ideaDetailTabs.map((item) => (
          <Button
            asChild
            className={activeTab === item.id ? "idea-detail-tab idea-detail-tab-active" : "idea-detail-tab"}
            key={item.id}
            variant="ghost"
          >
            <Link
              aria-current={activeTab === item.id ? "page" : undefined}
              href={`/ideas/${id}?tab=${item.id}`}
            >
              {item.label}
            </Link>
          </Button>
        ))}
      </nav>

      {activeTab === "overview" ? (
        <div className="idea-detail-layout">
          <Card
            aria-labelledby="idea-detail-fields-title"
            className="idea-detail-card"
            role="region"
          >
            <CardHeader className="idea-form-intro">
              <p className="page-kicker">TỔNG QUAN</p>
              <h2 id="idea-detail-fields-title">Bài toán và giải pháp</h2>
            </CardHeader>
            <CardContent>
              <dl className="idea-detail-fields">
                {fields.map((field) => (
                  <div className="idea-detail-field" key={field.label}>
                    <dt>{field.label}</dt>
                    <dd>{field.value || <span className="idea-detail-missing">Chưa bổ sung</span>}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card
            aria-labelledby="idea-revenue-title"
            className="idea-detail-card"
            role="region"
          >
            <CardHeader className="idea-form-intro">
              <p className="page-kicker">KIẾM TIỀN</p>
              <h2 id="idea-revenue-title">Mô hình doanh thu</h2>
            </CardHeader>
            <CardContent>
              {idea.revenueModels.length > 0 ? (
                <ul className="idea-revenue-list">
                  {idea.revenueModels.map((model) => (
                    <li key={model}>
                      <Badge
                        className="h-auto max-w-full whitespace-normal px-3 py-2 text-left leading-relaxed"
                        variant="outline"
                      >
                        {model}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="idea-detail-missing idea-revenue-empty">
                  Chưa bổ sung mô hình doanh thu.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : activeTab === "competitors" ? (
        <IdeaCompetitorsPanel ideaId={idea.id} savedCompetitors={savedCompetitors} />
      ) : (
        <Card
          aria-labelledby={`idea-detail-${activeTab}-title`}
          className="empty-state idea-detail-tab-empty"
          role="region"
        >
          <span className="empty-state-icon">
            <PlaceholderIcon aria-hidden="true" size={23} strokeWidth={1.7} />
          </span>
          <p className="page-kicker">{placeholder.kicker}</p>
          <h2 id={`idea-detail-${activeTab}-title`}>{placeholder.title}</h2>
          <p className="empty-state-description">{placeholder.description}</p>
        </Card>
      )}
    </main>
  );
}
