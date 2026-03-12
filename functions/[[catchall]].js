// Pages Function: proxy SEO routes to the Worker
const WORKER_ORIGIN = "https://nil-monitor-api.mgreinhart.workers.dev";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const p = url.pathname;

  // Proxy SEO routes to Worker
  if (p === '/news' || p.startsWith('/news/') ||
      p === '/briefing' || p.startsWith('/briefing/') ||
      p === '/feed.xml' || p === '/sitemap.xml') {
    const target = `${WORKER_ORIGIN}${p}${url.search}`;
    return fetch(target, {
      method: context.request.method,
      headers: context.request.headers,
    });
  }

  return context.next();
}
