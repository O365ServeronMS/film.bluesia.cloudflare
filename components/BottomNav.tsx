"use client";

import { useEffect, useMemo, useState } from "react";
import { Clapperboard, Film, Home, MonitorPlay, Settings, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { key: "home", href: "/", label: "Trang chủ", icon: Home },
  { key: "phim-le", href: "/list/phim-le", label: "Phim lẻ", icon: Film },
  { key: "phim-bo", href: "/list/phim-bo", label: "Phim bộ", icon: MonitorPlay },
  { key: "tv-shows", href: "/list/tv-shows", label: "TV Show", icon: Clapperboard },
  { key: "hoat-hinh", href: "/list/hoat-hinh", label: "Hoạt hình", icon: Sparkles },
  { key: "settings", href: "/settings", label: "Cài đặt", icon: Settings }
];

const CONTEXT_KEY = "film.bluesia.net:last-nav-section";

function normalizePath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname || "/";
}

function activeKeyFromPath(pathname: string, contextKey = "") {
  const path = normalizePath(pathname);
  if (path === "/") return "home";
  if (path.startsWith("/list/phim-le")) return "phim-le";
  if (path.startsWith("/list/phim-bo")) return "phim-bo";
  if (path.startsWith("/list/tv-shows")) return "tv-shows";
  if (path.startsWith("/list/hoat-hinh")) return "hoat-hinh";
  if (path.startsWith("/search")) return "search";
  if (path.startsWith("/settings")) return "settings";
  if (path.startsWith("/movie/") || path.startsWith("/watch/")) return contextKey;
  return "";
}

function contextFromPath(pathname: string) {
  const key = activeKeyFromPath(pathname);
  return key && !["home", "search", "settings"].includes(key) ? key : "";
}

function readContext() {
  if (typeof window === "undefined") return "";
  try {
    return sessionStorage.getItem(CONTEXT_KEY) || "";
  } catch {
    return "";
  }
}

function writeContext(pathname: string) {
  const key = contextFromPath(pathname);
  if (!key || typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CONTEXT_KEY, key);
  } catch {
    // Active state can still follow the current path if storage is unavailable.
  }
}

function devLog(message: string, details: Record<string, unknown>) {
  if (import.meta.env.DEV) console.debug(`[nav] ${message}`, details);
}

function isContextualPath(pathname: string) {
  const path = normalizePath(pathname);
  return path.startsWith("/movie/") || path.startsWith("/watch/");
}

function contextKeyForPath(pathname: string) {
  const key = contextFromPath(pathname);
  if (key) return key;
  return isContextualPath(pathname) ? readContext() : "";
}

export function BottomNav({ initialPathname = "/" }: { initialPathname?: string }) {
  const currentPathname = typeof window === "undefined" ? initialPathname : window.location.pathname;
  const [pathname, setPathname] = useState(() =>
    currentPathname
  );
  const [contextKey, setContextKey] = useState(() =>
    contextKeyForPath(currentPathname)
  );
  const activeKey = useMemo(() => activeKeyFromPath(pathname, contextKey), [pathname, contextKey]);

  useEffect(() => {
    function syncPath(eventName: string) {
      const nextPathname = window.location.pathname;
      writeContext(nextPathname);
      const nextContextKey = contextKeyForPath(nextPathname);
      setPathname(nextPathname);
      setContextKey(nextContextKey);
      devLog("NAV_ROUTE_CHANGE", { event: eventName, pathname: nextPathname });
      devLog("NAV_ACTIVE_FROM_PATH", { pathname: nextPathname, active: activeKeyFromPath(nextPathname, nextContextKey) || null });
    }

    writeContext(window.location.pathname);
    syncPath("mount");

    function handlePageLoad() {
      syncPath("astro:page-load");
    }

    function handlePopState() {
      syncPath("popstate");
    }

    function handlePageShow(event: PageTransitionEvent) {
      syncPath(event.persisted ? "pageshow-persisted" : "pageshow");
    }

    window.addEventListener("astro:page-load", handlePageLoad);
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("astro:page-load", handlePageLoad);
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  return (
    <nav className="bottom-nav fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[720px] border-t border-white/5 bg-[#0b0d13]/95 px-2 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl">
      <div className="bottom-nav-grid grid grid-cols-6 gap-1">
        {items.map((item) => {
          const active = activeKey === item.key;
          const Icon = item.icon;
          return (
            <a
              href={item.href}
              key={item.href}
              onClick={() => {
                writeContext(item.href);
                setPathname(item.href);
                setContextKey(contextFromPath(item.href));
                devLog("NAV_CLICK_TARGET", { href: item.href, active: item.key });
              }}
              className={cn(
                "bottom-nav-item flex flex-col items-center justify-center rounded-2xl px-1 py-2 text-[11px] font-medium text-zinc-400 transition",
                active && "bg-gold/20 text-gold shadow-glow"
              )}
            >
              <Icon className="bottom-nav-icon mb-1 h-5 w-5" />
              <span className="bottom-nav-label whitespace-nowrap">{item.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
