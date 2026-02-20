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

    const isAfternoon = cron.startsWith('0 21');

    ctx.waitUntil((async () => {
      // Step 1: Fetch all data sources in parallel
      await Promise.all([
        fetchGoogleNews(env),
        fetchNCAANews(env),
        fetchNewsData(env),
        fetchCongress(env),
        fetchCourtListener(env),
      ]);
      console.log('Data fetchers complete, starting AI pipeline...');

      // Step 2: Run AI pipeline with fresh data
      await runAIPipeline(env, { includeBriefing: true, isAfternoon });
    })());
  },
};
