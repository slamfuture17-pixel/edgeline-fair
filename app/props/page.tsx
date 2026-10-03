import { Suspense } from "react";
import { PropsExplorer } from "@/components/props-explorer";

export default function PropsPage() {
  return (
    <Suspense fallback={null}>
      <PropsExplorer />
    </Suspense>
  );
}
