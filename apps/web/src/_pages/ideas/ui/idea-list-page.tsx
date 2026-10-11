import Link from "next/link";
import { Lightbulb, Sparkles } from "lucide-react";

import { ideaRepository } from "@/_entities/idea/index.server";
import { IdeaCreateDialog, IdeaDetailActions } from "@/_features/idea";
import { requireCurrentAppUser } from "@/_features/auth/index.server";
import { createIdeaAction } from "@/_features/idea/index.server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const createdDateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export async function IdeaListPage() {
  const user = await requireCurrentAppUser();
  const ideas = await ideaRepository.listByOwner(user.id);

  return (
    <main className="dashboard-page ideas-page" id="main-content">
      <header className="page-header ideas-page-header">
        <div className="page-title-group">
          <span className="page-title-icon">
            <Lightbulb aria-hidden="true" size={21} strokeWidth={1.8} />
          </span>
          <div>
            <p className="page-kicker">KHÔNG GIAN</p>
            <h1>Ý tưởng</h1>
            <p className="page-subtitle">Lưu lại và phát triển những cơ hội sản phẩm của bạn.</p>
          </div>
        </div>
        <IdeaCreateDialog action={createIdeaAction} triggerLabel="Tạo ý tưởng" />
      </header>

      {ideas.length === 0 ? (
        <Card aria-labelledby="ideas-empty-title" className="empty-state ideas-empty-state" role="region">
          <span className="empty-state-icon">
            <Sparkles aria-hidden="true" size={23} strokeWidth={1.7} />
          </span>
          <p className="page-kicker">SMART IDEA / Ý TƯỞNG</p>
          <h2 id="ideas-empty-title">Bắt đầu từ một ý tưởng.</h2>
          <p className="empty-state-description">
            Ghi lại vấn đề, khách hàng và giải pháp để biến cơ hội thành sản phẩm.
          </p>
        </Card>
      ) : (
        <Card aria-label="Danh sách ý tưởng" className="ideas-table-wrap" role="region">
          <Table className="ideas-table">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Ý tưởng</TableHead>
                <TableHead scope="col">Lĩnh vực</TableHead>
                <TableHead scope="col">Mô hình doanh thu</TableHead>
                <TableHead scope="col">Ngày tạo</TableHead>
                <TableHead className="ideas-table-actions-head" scope="col">
                  Thao tác
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ideas.map((idea) => (
                <TableRow key={idea.id}>
                  <TableHead className="ideas-table-title whitespace-normal" scope="row">
                    <Link className="ideas-table-idea" href={`/ideas/${idea.id}`}>
                      <span className="ideas-table-name">{idea.name}</span>
                      <span className="ideas-table-description">
                        {idea.description || "Chưa có mô tả cho ý tưởng này."}
                      </span>
                    </Link>
                  </TableHead>
                  <TableCell>
                    {idea.industry || <span className="idea-table-muted">Chưa phân loại</span>}
                  </TableCell>
                  <TableCell>
                    {idea.revenueModels.length > 0 ? (
                      <div className="idea-tag-list">
                        {idea.revenueModels.map((model) => (
                          <Badge
                            key={model}
                            className="h-auto max-w-full whitespace-normal break-words py-1 text-left"
                            variant="outline"
                          >
                            {model}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="idea-table-muted">Chưa có</span>
                    )}
                  </TableCell>
                  <TableCell className="idea-table-date">
                    {createdDateFormatter.format(idea.createdAt)}
                  </TableCell>
                  <TableCell className="ideas-table-actions-cell">
                    <IdeaDetailActions compact idea={idea} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </main>
  );
}
