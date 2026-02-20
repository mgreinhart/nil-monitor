// ═══════════════════════════════════════════════════════════════════
//  NIL MONITOR — Worker Entry Point
//  Handles API routes (fetch) and data fetching (scheduled/cron)
// ═══════════════════════════════════════════════════════════════════

import { handleApi } from './api.js';
import { fetchCourtListener } from './fetch-courtlistener.js';
import { fetchGoogleNews } from './fetch-google-news.js';
import { fetchNCAANews } from './fetch-ncaa-rss.js';
import { fetchNewsData } from './fetch-newsdata.js';
import { fetchCongress } from './fetch-congress.js';
import { runAIPipeline } from './ai-pipeline.js';

export default {
  async fetch(request, env) {
    return handleApi(request, env);
  },

  async scheduled(event, env, ctx) {
    const cron = event.cron || '';
    console.log(`Cron trigger fired: ${cron}`);

    const isAIRun = cron.startsWith('0 ');
    // Both AI runs generate briefings: 11:00 UTC = AM, 21:00 UTC = PM
    const isAfternoon = cron.startsWith('0 21');

    if (isAIRun) {
      // :00 cron — AI pipeline (always includes briefing)
      ctx.waitUntil(runAIPipeline(env, { includeBriefing: true, isAfternoon }));
    } else {
      // :30 cron — data fetchers only
      ctx.waitUntil(
        Promise.all([
          fetchGoogleNews(env),
          fetchNCAANews(env),
          fetchNewsData(env),
          fetchCongress(env),
          fetchCourtListener(env),
        ])
      );
    }
  },
};
