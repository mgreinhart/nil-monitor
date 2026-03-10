// ═══════════════════════════════════════════════════════════════════
//  NIL MONITOR — Worker Entry Point
//  Three cron patterns:
//    0,30 * * * *        — Group A fetchers (high-volume news)
//    7,37 * * * *        — Group B fetchers (lighter/supplemental)
//    0 10,11,20,21 * * * — AI pipeline (6 AM / 4 PM ET, auto-DST)
//
//  AI pipeline fires at all four candidate UTC hours; the handler
//  checks the actual US-Eastern hour and skips if it's not 6 or 16.
//
//  Splitting fetchers across two cron ticks halves the CPU budget
//  per invocation, preventing Cloudflare from killing the Worker.
// ═══════════════════════════════════════════════════════════════════

import { handleApi } from './api.js';
import { loadDedupCache, clearDedupCache, recordError } from './fetcher-utils.js';
import { fetchCourtListener } from './fetch-courtlistener.js';
import { fetchGoogleNews } from './fetch-google-news.js';
import { fetchNCAANews } from './fetch-ncaa-rss.js';
import { fetchNewsData } from './fetch-newsdata.js';
import { fetchNILRevolution } from './fetch-nil-revolution.js';
import { fetchBingNews } from './fetch-bing-news.js';
import { fetchPublications } from './fetch-publications.js';
import { fetchCSLT, fetchCSLTKeyDates } from './fetch-cslt.js';
import { fetchPodcasts } from './fetch-podcasts.js';
import { fetchCFBD } from './fetch-cfbd.js';
import { runAIPipeline } from './ai-pipeline.js';

// Wrap a fetcher so errors are logged to D1, not just console
function safeFetch(name, fn, env) {
  return fn(env).catch(async (e) => {
    console.error(`${name}:`, e.message);
    try { await recordError(env.DB, name, e); } catch (_) { /* best effort */ }
  });
}

// Group A: high-volume news aggregators (heaviest CPU/network)
const GROUP_A = [
  ['google-news', fetchGoogleNews],
  ['bing-news', fetchBingNews],
  ['newsdata', fetchNewsData],
  ['publications', fetchPublications],
  ['ncaa-rss', fetchNCAANews],
];

// Group B: lighter / supplemental sources
const GROUP_B = [
  ['courtlistener', fetchCourtListener],
  ['nil-revolution', fetchNILRevolution],
  ['cslt', fetchCSLT],
  ['cslt-keydates', fetchCSLTKeyDates],
  ['podcasts', fetchPodcasts],
  ['cfbd', fetchCFBD],
];

export default {
  async fetch(request, env) {
    return handleApi(request, env);
  },

  async scheduled(event, env, ctx) {
    const cron = event.cron || '';
    console.log(`Cron trigger fired: ${cron}`);

    if (cron === '0 10,11,20,21 * * *') {
      // AI pipeline — fires at 4 UTC hours; only runs when ET hour is 6 or 16
      const etHour = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false });
      const h = parseInt(etHour, 10);
      if (h !== 6 && h !== 16) {
        console.log(`AI pipeline skipped — ET hour is ${h}, not 6 or 16`);
        return;
      }
      const isAfternoon = h === 16;
      ctx.waitUntil(
        runAIPipeline(env, { includeBriefing: true, isAfternoon })
          .catch(e => console.error('ai-pipeline cron error:', e.message))
      );
    } else {
      // Determine which group to run based on cron pattern
      const isGroupA = cron === '0,30 * * * *';
      const fetchers = isGroupA ? GROUP_A : GROUP_B;
      const label = isGroupA ? 'A' : 'B';

      console.log(`Running fetcher group ${label} (${fetchers.length} fetchers)`);

      ctx.waitUntil((async () => {
        try {
          await loadDedupCache(env.DB);
          await Promise.all(fetchers.map(([name, fn]) => safeFetch(name, fn, env)));
        } catch (e) {
          console.error(`Group ${label} top-level error:`, e.message);
        } finally {
          clearDedupCache();
        }
      })());
    }
  },
};
