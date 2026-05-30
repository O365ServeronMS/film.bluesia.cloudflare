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

type CloudflareRuntime = {
  env: {
    BLUESIA_CACHE_R2?: R2Bucket;
    BLUESIA_CACHE_MAX_BYTES?: string;
    BLUESIA_CACHE_METADATA_MAX_BYTES?: string;
    BLUESIA_CACHE_IMAGE_MAX_BYTES?: string;
    OPHIM_BASE_URL?: string;
    VSEMBED_EMBED_BASE_URL?: string;
    VSEMBED_MOBILE_EMBED_HOST?: string;
  };
};

declare namespace App {
  interface Locals {
    runtime?: CloudflareRuntime;
  }
}
