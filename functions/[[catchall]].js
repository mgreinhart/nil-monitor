// Pages Function: proxy SEO routes (/news, /feed.xml) to the Worker
const WORKER_ORIGIN = "https://nil-monitor-api.mgreinhart.workers.dev";
const SEO_ROUTES = ["/news", "/feed.xml"];

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (!SEO_ROUTES.includes(url.pathname)) {
    return context.next();
  }
  const target = `${WORKER_ORIGIN}${url.pathname}${url.search}`;
  return fetch(target, {
    method: context.request.method,
    headers: context.request.headers,
  });
}
