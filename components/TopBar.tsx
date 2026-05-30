"use client";

import { Clock3, Heart, UserRound } from "lucide-react";
import { SearchSuggest } from "@/components/SearchSuggest";

export function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[#07090f]/90 px-4 py-4 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <SearchSuggest />
        <a href="/favorites" aria-label="Phim yêu thích" className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-white/10 bg-white/10 text-zinc-300">
          <Heart className="h-5 w-5" />
        </a>
        <a href="/history" aria-label="Lịch sử xem" className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-white/10 bg-white/10 text-zinc-300">
          <Clock3 className="h-5 w-5" />
        </a>
        <a href="/settings" aria-label="Cài đặt" className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-white/10 bg-white/10 text-zinc-300">
          <UserRound className="h-5 w-5" />
        </a>
      </div>
    </header>
  );
}
