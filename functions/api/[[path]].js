// Pages Function: proxy all /api/* requests to the Worker
const WORKER_ORIGIN = "https://nil-monitor-api.mgreinhart.workers.dev";

// Admin paths require same-origin and must NOT receive the wildcard
// Access-Control-Allow-Origin header. Cookie auth + SameSite=Strict is the
// primary defense; this is the defense-in-depth layer the worker already
// tries to enforce via ADMIN_CORS (see workers/api.js). Catches:
//   /api/admin, /api/admin/hide-headline, /api/admin/unhide-headline,
//   /api/admin-login, /api/trigger.
function isAdminPath(pathname) {
  return pathname.startsWith('/api/admin') || pathname === '/api/trigger';
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const target = `${WORKER_ORIGIN}${url.pathname}${url.search}`;
  const resp = await fetch(target, {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.method !== 'GET' && context.request.method !== 'HEAD'
      ? context.request.body : undefined,
    redirect: 'manual',
  });
  const newResp = new Response(resp.body, resp);
  if (!isAdminPath(url.pathname)) {
    newResp.headers.set("Access-Control-Allow-Origin", "*");
  }
  return newResp;
}
