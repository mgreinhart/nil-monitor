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

    const isAIRun = cron.startsWith('30 ');
    // Generate briefing only at 11:30 and 19:30 UTC (6:30 AM / 2:30 PM ET)
    const briefingHours = ['30 11', '30 19'];
    const includeBriefing = briefingHours.some(h => cron.startsWith(h));

    if (isAIRun) {
      // :30 cron — AI pipeline only
      ctx.waitUntil(runAIPipeline(env, { includeBriefing }));
    } else {
      // :00 cron — data fetchers only
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
