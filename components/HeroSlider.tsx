"use client";

/* Images use the app-owned responsive /api/image proxy rather than the Next image pipeline. */
import { KeyboardEvent, TouchEvent, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Info, Play, Sparkles, Star } from "lucide-react";
import type { MovieCard } from "@/lib/types";
import { hrefWithReturnTo } from "@/lib/navigation";
import { baseSpotlightScore, normalizedLabelSet } from "@/lib/spotlight";
import { getDisplayRating, proxiedImage, proxiedImageCandidateSrcSet } from "@/lib/utils";

const SLIDE_INTERVAL_MS = 5000;
const FAV_KEY = "film.bluesia.net:favorites";
const HISTORY_KEY = "film.bluesia.net:history";
const LEGACY_FAV_KEY = "bluesia:favorites";
const LEGACY_HISTORY_KEY = "bluesia:history";
const LOCAL_MOVIES_UPDATED_EVENT = "film.bluesia.net:local-movies-updated";
const LEGACY_LOCAL_MOVIES_UPDATED_EVENT = "bluesia:local-movies-updated";

type StoredMovie = MovieCard & { savedAt?: number };
type PersonalData = { favorites: StoredMovie[]; history: StoredMovie[] };

type PreferenceMap = {
  favoriteSlugs: Set<string>;
  watchedSlugs: Set<string>;
  country: Map<string, number>;
  category: Map<string, number>;
  type: Map<string, number>;
};

function readStoredRaw(key: string): StoredMovie[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.filter((movie) => movie?.slug) : [];
  } catch {
    return [];
  }
}

function readStored(key: string, legacyKey?: string): StoredMovie[] {
  const current = readStoredRaw(key);
  if (current.length || !legacyKey) return current;
  return readStoredRaw(legacyKey);
}

function addWeight(map: Map<string, number>, labels: Set<string>, weight: number) {
  labels.forEach((label) => {
    map.set(label, (map.get(label) || 0) + weight);
  });
}

function buildPreferences(data: PersonalData | null): PreferenceMap | null {
  if (!data || (!data.favorites.length && !data.history.length)) return null;

  const prefs: PreferenceMap = {
    favoriteSlugs: new Set(data.favorites.map((movie) => movie.slug)),
    watchedSlugs: new Set(data.history.map((movie) => movie.slug)),
    country: new Map(),
    category: new Map(),
    type: new Map()
  };

  data.favorites.slice(0, 60).forEach((movie, index) => {
    const recency = Math.max(1, 1.35 - index * 0.02);
    addWeight(prefs.country, normalizedLabelSet(movie.country), 15 * recency);
    addWeight(prefs.category, normalizedLabelSet(movie.category), 13 * recency);
    addWeight(prefs.type, normalizedLabelSet(movie.type), 6 * recency);
  });

  data.history.slice(0, 80).forEach((movie, index) => {
    const recency = Math.max(0.4, 1.15 - index * 0.015);
    addWeight(prefs.country, normalizedLabelSet(movie.country), 7 * recency);
    addWeight(prefs.category, normalizedLabelSet(movie.category), 6 * recency);
    addWeight(prefs.type, normalizedLabelSet(movie.type), 3 * recency);
  });

  return prefs;
}

function matchingWeight(map: Map<string, number>, labels: Set<string>, cap: number) {
  let score = 0;
  labels.forEach((label) => {
    score += map.get(label) || 0;
  });
  return Math.min(cap, score);
}

function rankForUser(items: MovieCard[], data: PersonalData | null) {
  const prefs = buildPreferences(data);

  return [...items]
    .map((movie, index) => {
      let score = baseSpotlightScore(movie, [], index) + Math.max(0, items.length - index) * 0.8;

      if (prefs) {
        score += matchingWeight(prefs.country, normalizedLabelSet(movie.country), 34);
        score += matchingWeight(prefs.category, normalizedLabelSet(movie.category), 30);
        score += matchingWeight(prefs.type, normalizedLabelSet(movie.type), 12);

        if (prefs.favoriteSlugs.has(movie.slug)) score += 14;
        if (prefs.watchedSlugs.has(movie.slug) && !prefs.favoriteSlugs.has(movie.slug)) score -= 10;
      }

      return { movie, score, index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.movie);
}

export function HeroSlider({ items }: { items: MovieCard[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [personalData, setPersonalData] = useState<PersonalData | null>(null);
  const [interactionTick, setInteractionTick] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const slides = useMemo(() => rankForUser(items.filter((movie) => movie.slug), personalData).slice(0, 8), [items, personalData]);

  useEffect(() => {
    const refreshPersonalData = () => {
      setPersonalData({
        favorites: readStored(FAV_KEY, LEGACY_FAV_KEY),
        history: readStored(HISTORY_KEY, LEGACY_HISTORY_KEY)
      });
    };

    refreshPersonalData();
    window.addEventListener("storage", refreshPersonalData);
    window.addEventListener("focus", refreshPersonalData);
    window.addEventListener(LOCAL_MOVIES_UPDATED_EVENT, refreshPersonalData);
    window.addEventListener(LEGACY_LOCAL_MOVIES_UPDATED_EVENT, refreshPersonalData);

    return () => {
      window.removeEventListener("storage", refreshPersonalData);
      window.removeEventListener("focus", refreshPersonalData);
      window.removeEventListener(LOCAL_MOVIES_UPDATED_EVENT, refreshPersonalData);
      window.removeEventListener(LEGACY_LOCAL_MOVIES_UPDATED_EVENT, refreshPersonalData);
    };
  }, []);

  useEffect(() => {
    if (slides.length <= 1) return;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, SLIDE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [slides.length, interactionTick]);

  if (!slides.length) return null;

  const visibleIndex = activeIndex < slides.length ? activeIndex : 0;
  const active = slides[visibleIndex];
  const activeReturnTo = "/";
  const activeImage = active.thumb || active.poster;
  const displayRating = getDisplayRating(active);
  const isPersonalized = Boolean(personalData && (personalData.favorites.length || personalData.history.length));
  const canNavigate = slides.length > 1;

  function moveSlide(direction: 1 | -1) {
    if (!canNavigate) return;
    setActiveIndex((current) => (current + direction + slides.length) % slides.length);
    setInteractionTick((current) => current + 1);
  }

  function chooseSlide(index: number) {
    setActiveIndex(index);
    setInteractionTick((current) => current + 1);
  }

  function handleTouchStart(event: TouchEvent<HTMLElement>) {
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 45 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;

    moveSlide(deltaX < 0 ? 1 : -1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveSlide(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveSlide(1);
    }
  }

  return (
    <section className="px-4 pt-5">
      <div
        className="relative h-[320px] overflow-hidden rounded-3xl bg-panel shadow-2xl shadow-black/30 ring-1 ring-white/5 sm:h-[360px]"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        aria-roledescription="carousel"
        aria-label="Smart Spotlight"
      >
        {activeImage && (
          <img
            key={`${active.slug}-${activeImage}`}
            src={proxiedImage(activeImage, "backdrop-mobile")}
            srcSet={proxiedImageCandidateSrcSet(activeImage, [
              { profile: "backdrop-mobile", width: 780 },
              { profile: "backdrop-desktop", width: 1280 }
            ])}
            sizes="(min-width: 640px) 688px, calc(100vw - 32px)"
            alt={active.name}
            loading={visibleIndex === 0 ? "eager" : "lazy"}
            fetchPriority={visibleIndex === 0 ? "high" : "auto"}
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover opacity-80 transition-opacity duration-700"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        {canNavigate && (
          <>
            <button
              type="button"
              aria-label="Spotlight trước"
              onClick={() => moveSlide(-1)}
              className="absolute left-3 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65 focus:outline-none focus:ring-2 focus:ring-gold/80 sm:grid"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              aria-label="Spotlight tiếp theo"
              onClick={() => moveSlide(1)}
              className="absolute right-3 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition hover:bg-black/65 focus:outline-none focus:ring-2 focus:ring-gold/80 sm:grid"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        )}
        <div key={active.slug} className="relative z-10 flex h-full flex-col justify-end p-5 animate-[fadeIn_0.45s_ease-out]">
          <div className="mb-3 flex min-h-8 flex-wrap content-end gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2.5 py-1 text-xs font-black text-white backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-gold" /> {isPersonalized ? "Dành cho bạn" : "Smart Spotlight"}
            </span>
            <span className="rounded-md bg-gold px-2.5 py-1 text-xs font-black text-black">{active.episodeCurrent || "FULL"}</span>
            {active.quality && <span className="rounded-md bg-white/20 px-2.5 py-1 text-xs font-bold text-white backdrop-blur">{active.quality}</span>}
            {displayRating && (
              <span className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2.5 py-1 text-xs font-bold text-gold backdrop-blur">
                <Star className="h-3.5 w-3.5 fill-gold" /> {displayRating.text}
              </span>
            )}
          </div>
          <h1 className="line-clamp-2 min-h-[4.5rem] max-w-[82%] text-3xl font-black leading-tight tracking-tight text-white drop-shadow-lg sm:max-w-[74%]">{active.name}</h1>
          <p className="mt-1 line-clamp-1 min-h-5 max-w-[86%] text-sm italic text-zinc-200 sm:max-w-[78%]">{active.originName || active.name} · {active.year || "N/A"}{active.country ? ` · ${active.country}` : ""}</p>
          <div className="mt-5 flex items-center gap-3">
            <a href={hrefWithReturnTo(`/watch/${active.slug}`, activeReturnTo, "home")} aria-label={`Xem phim ${active.name}`} className="grid h-16 w-16 place-items-center rounded-full bg-gold text-black shadow-glow transition hover:scale-105">
              <Play className="ml-1 h-8 w-8 fill-black" />
            </a>
            <a href={hrefWithReturnTo(`/movie/${active.slug}`, activeReturnTo, "home")} aria-label={`Chi tiết phim ${active.name}`} className="grid h-14 w-14 place-items-center rounded-full bg-white/20 text-white backdrop-blur transition hover:bg-white/25">
              <Info className="h-7 w-7" />
            </a>
          </div>
          <div className="mt-5 flex items-center justify-center gap-1">
            {slides.map((movie, index) => (
              <button
                key={movie.slug}
                type="button"
                aria-label={"Chuyển tới " + movie.name}
                onClick={() => chooseSlide(index)}
                className="grid h-6 min-w-6 place-items-center rounded-full transition"
              >
                <span
                  className={index === visibleIndex ? "h-2.5 w-10 rounded-full bg-gold transition-all" : "h-2.5 w-2.5 rounded-full bg-white/40 transition-all hover:bg-white"}
                />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
