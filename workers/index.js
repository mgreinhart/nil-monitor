// ═══════════════════════════════════════════════════════════════════
//  NIL MONITOR — Worker Entry Point
//  Four cron patterns:
//    0,30 * * * *          — Group A1 fetchers (Google News, NCAA, NewsData)
//    10,40 * * * *         — Group A2 fetchers (Bing News, Publications)
//    7,37 * * * *          — Group B fetchers (lighter/supplemental)
//    25 10,11,19,20 * * *  — AI pipeline (6 AM / 3 PM ET, auto-DST)
//
//  Pipeline fires at :25 past the hour (not :00) so fetcher groups
//  A1 (:00), B (:07), and A2 (:10) finish inserting headlines first.
//
//  AI pipeline fires at 4 UTC hours; the handler checks the actual
//  US-Eastern hour and day-of-week:
//    - Weekdays: morning (6 AM ET) + afternoon (3 PM ET)
//    - Saturday: no briefs
//    - Sunday: afternoon only (3 PM ET)
//
//  Group A was split into A1/A2 to stay under Cloudflare's free-tier
//  CPU limit (Google 105 + Bing 62 queries was too heavy together).
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

// Group A1: heaviest aggregators (Google News 105 queries + lighter feeds)
const GROUP_A1 = [
  ['google-news', fetchGoogleNews],
  ['ncaa-rss', fetchNCAANews],
  ['newsdata', fetchNewsData],
];

// Group A2: second-heaviest aggregators (Bing News 62 queries + publications 24 feeds)
const GROUP_A2 = [
  ['bing-news', fetchBingNews],
  ['publications', fetchPublications],
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

    if (cron === '25 10,11,19,20 * * *') {
      // AI pipeline — fires at 4 UTC hours; only runs when ET hour is 6 or 15
      const now = new Date();
      const etHour = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false });
      const h = parseInt(etHour, 10);
      if (h !== 6 && h !== 15) {
        console.log(`AI pipeline skipped — ET hour is ${h}, not 6 or 15`);
        return;
      }

      // Weekend schedule: Saturday = no briefs, Sunday = afternoon only
      const etDay = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();
      if (etDay === 6) {
        console.log('AI pipeline skipped — Saturday, no briefs');
        return;
      }
      if (etDay === 0 && h === 6) {
        console.log('AI pipeline skipped — Sunday morning, afternoon only');
        return;
      }

      const isAfternoon = h === 15;
      ctx.waitUntil(
        runAIPipeline(env, { includeBriefing: true, isAfternoon })
          .catch(e => console.error('ai-pipeline cron error:', e.message))
      );
    } else {
      // Determine which group to run based on cron pattern
      let fetchers, label;
      if (cron === '0,30 * * * *') {
        fetchers = GROUP_A1; label = 'A1';
      } else if (cron === '10,40 * * * *') {
        fetchers = GROUP_A2; label = 'A2';
      } else {
        fetchers = GROUP_B; label = 'B';
      }

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
