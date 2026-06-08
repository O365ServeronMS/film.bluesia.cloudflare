"use client";

import { useEffect, useRef, useState } from "react";

type HlsErrorData = {
  fatal?: boolean;
  type?: string;
};

type HlsRuntime = {
  attachMedia: (media: HTMLMediaElement) => void;
  destroy: () => void;
  loadSource: (source: string) => void;
  off: (event: string, listener: (event: string, data: HlsErrorData) => void) => void;
  on: (event: string, listener: (event: string, data: HlsErrorData) => void) => void;
  recoverMediaError: () => void;
  startLoad: () => void;
};

type HlsConstructor = {
  new (config: Record<string, unknown>): HlsRuntime;
  ErrorTypes: {
    MEDIA_ERROR: string;
    NETWORK_ERROR: string;
  };
  Events: {
    ERROR: string;
  };
  isSupported: () => boolean;
};

type NavigatorWithConnection = Navigator & {
  connection?: {
    effectiveType?: string;
    saveData?: boolean;
  };
};

const DEFAULT_HLS_BUFFER_CONFIG = {
  enableWorker: true,
  lowLatencyMode: false,
  maxBufferLength: 60,
  maxMaxBufferLength: 120,
  backBufferLength: 60,
  maxBufferSize: 60 * 1000 * 1000,
  manifestLoadingMaxRetry: 3,
  manifestLoadingRetryDelay: 1000,
  fragLoadingMaxRetry: 4,
  fragLoadingRetryDelay: 1000,
};

function hasGoodNetworkForAggressiveBuffering() {
  const connection = (navigator as NavigatorWithConnection).connection;
  if (!connection || connection.saveData) return false;

  const effectiveType = connection.effectiveType?.toLowerCase();
  return effectiveType !== "slow-2g" && effectiveType !== "2g";
}

function getHlsBufferConfig() {
  if (!hasGoodNetworkForAggressiveBuffering()) return DEFAULT_HLS_BUFFER_CONFIG;

  return {
    ...DEFAULT_HLS_BUFFER_CONFIG,
    maxBufferLength: 180,
    maxMaxBufferLength: 300,
    maxBufferSize: 120 * 1000 * 1000,
    backBufferLength: 60,
  };
}

export function HlsVideo({ src, poster }: { src: string; poster?: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let disposed = false;
    let hlsInstance: HlsRuntime | null = null;
    let detachHlsErrorListener: (() => void) | null = null;

    setError("");
    video.pause();
    video.removeAttribute("src");
    video.load();

    async function setup() {
      if (!video || disposed) return;

      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
        video.load();
        return;
      }

      try {
        const { default: Hls } = (await import("hls.js")) as { default: HlsConstructor };
        if (disposed) return;

        if (!Hls.isSupported()) {
          setError("Trinh duyet khong ho tro HLS.");
          return;
        }

        const hls = new Hls(getHlsBufferConfig());
        let recoveredMediaError = false;
        let retriedNetworkError = false;

        const onHlsError = (_event: string, data: HlsErrorData) => {
          if (!data.fatal || disposed) return;

          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredMediaError) {
            recoveredMediaError = true;
            hls.recoverMediaError();
            return;
          }

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR && !retriedNetworkError) {
            retriedNetworkError = true;
            hls.startLoad();
            return;
          }

          setError("Khong the phuc hoi phien phat HLS.");
          if (detachHlsErrorListener) {
            detachHlsErrorListener();
            detachHlsErrorListener = null;
          }
          hls.destroy();
          hlsInstance = null;
        };

        hlsInstance = hls;
        hls.on(Hls.Events.ERROR, onHlsError);
        detachHlsErrorListener = () => hls.off(Hls.Events.ERROR, onHlsError);
        hls.loadSource(src);
        hls.attachMedia(video);
      } catch {
        if (!disposed) setError("Khong the tai trinh phat HLS.");
      }
    }

    void setup();

    return () => {
      disposed = true;
      if (detachHlsErrorListener) {
        detachHlsErrorListener();
        detachHlsErrorListener = null;
      }
      if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
      }
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [src]);

  return (
    <div className="relative h-full w-full bg-black">
      <video
        ref={videoRef}
        className="h-full w-full bg-black"
        controls
        playsInline
        preload="metadata"
        poster={poster}
      />
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-black p-6 text-center text-sm text-zinc-400">
          {error}
        </div>
      )}
    </div>
  );
}
