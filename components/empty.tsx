import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";

export function CardSkeletons({ n = 4 }: { n?: number }) {
  return (
    <div className="space-y-3 px-4">
      {Array.from({ length: n }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl bg-secondary/60" />)}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="mx-4 glass rounded-2xl p-6 text-center">
      <AlertCircle className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
      <div className="font-display font-bold">{title}</div>
      {body && <p className="text-sm text-muted-foreground mt-1">{body}</p>}
    </div>
  );
}
