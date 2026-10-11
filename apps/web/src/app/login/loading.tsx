import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main aria-busy="true" className="login-page">
      <span className="sr-only" role="status">Đang mở trang đăng nhập...</span>
      <Card aria-hidden="true" className="login-card">
        <CardHeader className="login-card-header">
          <div className="login-brand">
            <Skeleton className="size-11 shrink-0 rounded-xl" />
            <div className="grid gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-2 w-36" />
            </div>
          </div>
          <Skeleton className="mb-3 h-3 w-32" />
          <Skeleton className="h-8 w-64 max-w-full" />
          <Skeleton className="mt-3 mb-7 h-10 w-full" />
        </CardHeader>
        <CardContent className="login-card-content">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="mx-auto mt-6 h-3 w-48 max-w-full" />
        </CardContent>
      </Card>
    </main>
  );
}
