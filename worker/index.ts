/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  /** Cron trigger (configured at deploy time): runs the Master Sheet
   *  auto-sync by calling the app's own authenticated route, so all sync
   *  logic lives in one place and can also be triggered manually. Failures
   *  are written to sync_runs — a misconfigured cron must never be silent. */
  async scheduled(_event: unknown, env: Env & { SYNC_CRON_SECRET?: string }, ctx: ExecutionContext): Promise<void> {
    const logCronFailure = (summary: string) => {
      const now = new Date().toISOString();
      return env.DB.prepare("INSERT INTO sync_runs (id, trigger_source, started_at, finished_at, outcome, summary) VALUES (?, 'cron', ?, ?, 'error', ?)")
        .bind(crypto.randomUUID(), now, now, summary.slice(0, 300)).run().then(() => undefined, () => undefined);
    };
    if (!env.SYNC_CRON_SECRET?.trim()) {
      ctx.waitUntil(logCronFailure("SYNC_CRON_SECRET is not configured on the worker — the scheduled sync cannot authenticate."));
      return;
    }
    const request = new Request("https://cron.internal/api/master/auto-sync", { method: "POST", headers: { "x-cron-key": env.SYNC_CRON_SECRET } });
    ctx.waitUntil(worker.fetch(request, env, ctx).then(
      response => response.ok ? undefined : logCronFailure(`The scheduled sync request failed with HTTP ${response.status}.`),
      error => logCronFailure(`The scheduled sync request threw: ${error instanceof Error ? error.message : "unknown error"}.`),
    ));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
