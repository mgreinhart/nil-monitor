// ═══════════════════════════════════════════════════════════════════
//  NIL MONITOR — Worker Entry Point
//  Handles API routes (fetch) and data fetching (scheduled/cron)
// ═══════════════════════════════════════════════════════════════════

import { handleApi } from './api.js';
import { fetchCourtListener } from './fetch-courtlistener.js';
import { fetchGoogleNews } from './fetch-google-news.js';
import { fetchNCAANews } from './fetch-ncaa-rss.js';
import { runAIPipeline } from './ai-pipeline.js';

export default {
  async fetch(request, env) {
    return handleApi(request, env);
  },

  async scheduled(event, env, ctx) {
    const cron = event.cron || '';
    console.log(`Cron trigger fired: ${cron}`);

    const isAIRun = cron.startsWith('30 ');

    if (isAIRun) {
      // :30 cron — AI pipeline only
      ctx.waitUntil(runAIPipeline(env));
    } else {
      // :00 cron or manual trigger — data fetchers + AI pipeline
      ctx.waitUntil(
        Promise.all([
          fetchGoogleNews(env),
          fetchNCAANews(env),
          fetchCourtListener(env),
        ]).then(() => runAIPipeline(env))
      );
    }
  },
};
