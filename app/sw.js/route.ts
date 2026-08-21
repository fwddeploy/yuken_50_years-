import { renderServiceWorker } from "../../src/pwa/service-worker";

export async function GET() {
  return new Response(renderServiceWorker(__YIL_RELEASE_ID__), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
