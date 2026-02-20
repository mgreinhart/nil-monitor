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
    console.log(`Cron trigger fired: ${event.cron}`);

    // Data fetchers run at :00 (0 8,20 * * *)
    // AI pipeline runs at :30 (30 8,20 * * *)
    const minute = new Date().getMinutes();
    const isAIRun = minute >= 15; // :30 trigger → AI pipeline

    if (isAIRun) {
      ctx.waitUntil(runAIPipeline(env));
    } else {
      ctx.waitUntil(fetchGoogleNews(env));
      ctx.waitUntil(fetchNCAANews(env));
      ctx.waitUntil(fetchCourtListener(env));
    }
  },
};
