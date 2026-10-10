import { LayoutDashboard, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";

export function HomePage() {
  return (
    <main id="main-content" className="dashboard-page">
      <header className="page-header">
        <div className="page-title-group">
          <span className="page-title-icon">
            <LayoutDashboard aria-hidden="true" size={21} strokeWidth={1.8} />
          </span>
          <div>
            <p className="page-kicker">KHÔNG GIAN</p>
            <h1>Tổng quan</h1>
            <p className="page-subtitle">Không gian Smart Idea</p>
          </div>
        </div>
        <span className="page-status">
          <span className="status-dot" aria-hidden="true" />
          Khung nền đã sẵn sàng
        </span>
      </header>

      <Card className="empty-state" aria-labelledby="empty-state-title" role="region">
        <span className="empty-state-icon">
          <Sparkles aria-hidden="true" size={23} strokeWidth={1.7} />
        </span>
        <p className="page-kicker">SMART IDEA / TỔNG QUAN</p>
        <h2 id="empty-state-title">Không gian của bạn đã sẵn sàng.</h2>
        <p className="empty-state-description">
          Các trang và tính năng sẽ được bổ sung khi ý tưởng sản phẩm được xác định.
        </p>
      </Card>
    </main>
  );
}
