"use client";

import Link from "next/link";
import { Settings, ChevronLeft } from "lucide-react";

export function Header({ title, subtitle, back }: { title: string; subtitle?: string; back?: string }) {
  return (
    <header className="sticky top-0 z-30 glass rounded-b-2xl px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 flex items-center gap-3">
      {back && (
        <Link href={back} className="rounded-xl bg-secondary p-2 text-foreground" aria-label="Back"><ChevronLeft className="h-5 w-5" /></Link>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="font-display text-xl font-bold tracking-tight leading-none truncate">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground mt-1 truncate">{subtitle}</p>}
      </div>
      <Link href="/settings" className="rounded-xl bg-secondary p-2 text-muted-foreground hover:text-foreground" aria-label="Settings"><Settings className="h-5 w-5" /></Link>
    </header>
  );
}
