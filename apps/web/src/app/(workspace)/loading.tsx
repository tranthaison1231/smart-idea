import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main aria-busy="true" className="dashboard-page" id="main-content">
      <span className="sr-only" role="status">Đang tải workspace...</span>
      <header className="page-header">
        <div className="page-title-group">
          <Skeleton className="size-12 shrink-0 rounded-xl" />
          <div className="grid gap-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-4 w-56 max-w-[55vw]" />
          </div>
        </div>
        <Skeleton className="h-10 w-32" />
      </header>

      <section aria-hidden="true" className="grid gap-4 pt-6 xl:grid-cols-2">
        {Array.from({ length: 3 }, (_, index) => (
          <Card className="gap-5 border-border/70 bg-card/60" key={index}>
            <CardHeader className="gap-3">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-3/4" />
            </CardHeader>
            <CardContent className="grid gap-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </section>
    </main>
  );
}
