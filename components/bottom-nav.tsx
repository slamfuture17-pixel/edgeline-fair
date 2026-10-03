"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Calendar, Users, Zap, Bookmark, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Today", icon: Calendar },
  { href: "/props", label: "Props", icon: Users },
  { href: "/edges", label: "Edges", icon: Zap },
  { href: "/picks", label: "Picks", icon: Bookmark },
  { href: "/performance", label: "Record", icon: BarChart3 },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40">
      <div className="mx-auto max-w-md glass border-t rounded-t-2xl px-2 pt-2">
        <ul className="grid grid-cols-5">
          {items.map((it) => {
            const active = it.href === "/" ? path === "/" || path.startsWith("/game") : path.startsWith(it.href);
            return (
              <li key={it.href}>
                <Link href={it.href} className={cn("flex flex-col items-center gap-1 py-1.5 pb-[calc(env(safe-area-inset-bottom)+0.4rem)] text-[11px] font-medium transition-colors", active ? "text-primary" : "text-muted-foreground")}>
                  <span className={cn("rounded-xl px-4 py-1 transition-all", active && "bg-primary/15 shadow-profit")}><it.icon className="h-5 w-5" /></span>
                  {it.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
