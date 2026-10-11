import { Clock3, Sparkles } from "lucide-react";

import { requireCurrentAppUser } from "@/_features/auth/index.server";
import { MarketDiscoveryFeed } from "@/_features/market-discovery";

export async function DiscoverPage() {
  const user = await requireCurrentAppUser();

  return (
    <main className="dashboard-page" id="main-content">
      <header className="page-header">
        <div className="page-title-group">
          <span className="page-title-icon">
            <Sparkles aria-hidden="true" size={21} strokeWidth={1.8} />
          </span>
          <div>
            <p className="page-kicker">KHÔNG GIAN</p>
            <h1>Khám phá</h1>
            <p className="page-subtitle">Tìm cơ hội sản phẩm số từ tín hiệu thị trường Việt Nam.</p>
          </div>
        </div>
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock3 aria-hidden="true" size={15} />
          Cập nhật theo yêu cầu
        </span>
      </header>
      <MarketDiscoveryFeed key={user.id} userId={user.id} />
    </main>
  );
}
