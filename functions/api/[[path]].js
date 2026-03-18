// Pages Function: proxy all /api/* requests to the Worker
const WORKER_ORIGIN = "https://nil-monitor-api.mgreinhart.workers.dev";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const target = `${WORKER_ORIGIN}${url.pathname}${url.search}`;
  const resp = await fetch(target, {
    method: context.request.method,
    headers: context.request.headers,
    body: context.request.method !== 'GET' && context.request.method !== 'HEAD'
      ? context.request.body : undefined,
  });
  const newResp = new Response(resp.body, resp);
  newResp.headers.set("Access-Control-Allow-Origin", "*");
  return newResp;
}
