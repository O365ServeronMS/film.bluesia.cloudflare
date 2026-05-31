/// <reference types="astro/client" />

type R2ObjectBody = {
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  size: number;
  uploaded?: Date;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
};

type R2Bucket = {
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    }
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    objects: Array<{ key: string; size: number; uploaded: Date; customMetadata?: Record<string, string> }>;
    truncated: boolean;
    cursor?: string;
  }>;
};

type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number; metadata?: Record<string, string> }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<{
    keys: Array<{ name: string; metadata?: Record<string, string> }>;
    list_complete: boolean;
    cursor?: string;
  }>;
};

type CloudflareRuntime = {
  env: {
    KV?: KVNamespace;
    IMAGE_CACHE?: R2Bucket;
    MOVIE_METADATA?: KVNamespace;
    CACHE_REFRESH_TOKEN?: string;
    OPHIM_BASE_URL?: string;
    OPHIM_REFRESH_MAX_MOVIES?: string;
    OPHIM_REFRESH_DELAY_MS?: string;
    VSEMBED_EMBED_BASE_URL?: string;
    VSEMBED_MOBILE_EMBED_HOST?: string;
  };
};

declare namespace App {
  interface Locals {
    runtime?: CloudflareRuntime;
  }
}
