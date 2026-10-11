import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lightbulb } from "lucide-react";

import { ideaRepository } from "@/_entities/idea/index.server";
import { requireCurrentAppUser } from "@/_features/auth/index.server";
import { IdeaDetailActions } from "@/_features/idea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export async function IdeaDetailPage({ id }: { id: string }) {
  const user = await requireCurrentAppUser();
  const idea = await ideaRepository.findByIdForOwner(id, user.id);

  if (!idea) notFound();

  const fields = [
    { label: "Lĩnh vực", value: idea.industry },
    { label: "Mô tả", value: idea.description },
    { label: "Vấn đề cần giải quyết", value: idea.problem },
    { label: "Khách hàng mục tiêu", value: idea.targetCustomer },
    { label: "Giải pháp dự kiến", value: idea.solution },
  ];

  return (
    <main className="dashboard-page ideas-page" id="main-content">
      <header className="page-header ideas-page-header">
        <div className="page-title-group">
          <span className="page-title-icon">
            <Lightbulb aria-hidden="true" size={21} strokeWidth={1.8} />
          </span>
          <div className="idea-detail-heading">
            <p className="page-kicker">Ý TƯỞNG / CHI TIẾT</p>
            <h1>{idea.name}</h1>
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
    </main>
  );
}
