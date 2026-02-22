// ═══════════════════════════════════════════════════════════════════
//  NIL MONITOR — Worker Entry Point
//  Two cron patterns:
//    */15 * * * *   — fetchers (self-governing cooldowns)
//    0 11,21 * * *  — AI pipeline (6 AM / 4 PM ET)
// ═══════════════════════════════════════════════════════════════════

import { handleApi } from './api.js';
import { fetchCourtListener } from './fetch-courtlistener.js';
import { fetchGoogleNews } from './fetch-google-news.js';
import { fetchNCAANews } from './fetch-ncaa-rss.js';
import { fetchNewsData } from './fetch-newsdata.js';
import { fetchCongress } from './fetch-congress.js';
import { fetchNILRevolution } from './fetch-nil-revolution.js';
import { fetchBingNews } from './fetch-bing-news.js';
import { fetchPublications } from './fetch-publications.js';
import { fetchCSLT } from './fetch-cslt.js';
import { fetchPodcasts } from './fetch-podcasts.js';
import { fetchGDELT } from './fetch-gdelt.js';
import { runAIPipeline } from './ai-pipeline.js';

export default {
  async fetch(request, env) {
    return handleApi(request, env);
  },

  async scheduled(event, env, ctx) {
    const cron = event.cron || '';
    console.log(`Cron trigger fired: ${cron}`);

    if (cron === '0 11,21 * * *') {
      // AI pipeline — 11:00 UTC (6 AM ET) / 21:00 UTC (4 PM ET)
      const isAfternoon = new Date().getUTCHours() >= 20;
      ctx.waitUntil(runAIPipeline(env, { includeBriefing: true, isAfternoon }));
    } else {
      // */15 trigger — all fetchers run (each self-governs its cooldown)
      ctx.waitUntil(
        Promise.all([
          fetchGoogleNews(env).catch(e => console.error('google-news:', e.message)),
          fetchNCAANews(env).catch(e => console.error('ncaa-rss:', e.message)),
          fetchNewsData(env).catch(e => console.error('newsdata:', e.message)),
          fetchCongress(env).catch(e => console.error('congress:', e.message)),
          fetchCourtListener(env).catch(e => console.error('courtlistener:', e.message)),
          fetchNILRevolution(env).catch(e => console.error('nil-revolution:', e.message)),
          fetchBingNews(env).catch(e => console.error('bing-news:', e.message)),
          fetchPublications(env).catch(e => console.error('publications:', e.message)),
          fetchCSLT(env).catch(e => console.error('cslt:', e.message)),
          fetchPodcasts(env).catch(e => console.error('podcasts:', e.message)),
          fetchGDELT(env).catch(e => console.error('gdelt:', e.message)),
        ])
      );
    }
  },
};
