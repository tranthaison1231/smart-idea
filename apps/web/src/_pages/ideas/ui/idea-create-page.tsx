import Link from "next/link";
import { ArrowLeft, Lightbulb } from "lucide-react";

import { IdeaCreateForm } from "@/_features/idea";
import { createIdeaAction } from "@/_features/idea/index.server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function IdeaCreatePage() {
  return (
    <main className="dashboard-page ideas-page" id="main-content">
      <header className="page-header ideas-page-header">
        <div className="page-title-group">
          <span className="page-title-icon">
            <Lightbulb aria-hidden="true" size={21} strokeWidth={1.8} />
          </span>
          <div>
            <p className="page-kicker">Ý TƯỞNG / MỚI</p>
            <h1>Tạo ý tưởng</h1>
            <p className="page-subtitle">Ghi lại những thông tin bạn đã biết về sản phẩm.</p>
          </div>
        </div>
        <Button asChild variant="outline">
          <Link href="/ideas">
            <ArrowLeft aria-hidden="true" />
            Danh sách ý tưởng
          </Link>
        </Button>
      </header>

      <Card aria-labelledby="idea-form-title" className="idea-form-card" role="region">
        <CardHeader className="idea-form-intro">
          <p className="page-kicker">THÔNG TIN SẢN PHẨM</p>
          <h2 id="idea-form-title">Mô tả ý tưởng của bạn</h2>
          <p>Chỉ cần tên ý tưởng để bắt đầu. Các thông tin còn lại có thể bổ sung sau.</p>
        </CardHeader>
        <CardContent>
          <IdeaCreateForm action={createIdeaAction} />
        </CardContent>
      </Card>
    </main>
  );
}
