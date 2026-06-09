import { ChevronRight } from "lucide-react";
import type { MovieCard as MovieCardType } from "@/lib/types";
import { MovieCard } from "@/components/MovieCard";

export function SectionRow({ title, href, items, returnTo = "" }: { title: string; href: string; items: MovieCardType[]; returnTo?: string }) {
  if (!items.length) return null;
  return (
    <section className="mt-8 px-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-black tracking-tight">{title}</h2>
        <a href={href} className="inline-flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-gold">
          Xem tất cả <ChevronRight className="h-4 w-4" />
        </a>
      </div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {items.slice(0, 8).map((movie, index) =>
          index >= 6 ? (
            <div key={movie.slug} className="hidden sm:block">
              <MovieCard movie={movie} compact returnTo={returnTo} />
            </div>
          ) : (
            <MovieCard key={movie.slug} movie={movie} compact returnTo={returnTo} />
          )
        )}
      </div>
    </section>
  );
}
