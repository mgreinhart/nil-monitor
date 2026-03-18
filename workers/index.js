// ═══════════════════════════════════════════════════════════════════
//  NIL MONITOR — Worker Entry Point
//  Four cron patterns:
//    0,30 * * * *          — Google News only (76 queries, isolated)
//    10,40 * * * *         — Bing News (49q) + Publications (23) + NCAA (3) + NewsData (18)
//    7,37 * * * *          — Lighter/supplemental fetchers
//    25 10,11,19,20 * * *  — AI pipeline (6 AM / 3 PM ET, auto-DST)
//
//  Google News is isolated in its own invocation — it's the heaviest
//  fetcher and was the primary cause of CPU limit crashes.
//
//  Pipeline fires at :25 past the hour (not :00) so fetcher groups
//  finish inserting headlines before tagging runs.
//
//  AI pipeline fires at 4 UTC hours; the handler checks the actual
//  US-Eastern hour and day-of-week:
//    - Weekdays: morning (6 AM ET) + afternoon (3 PM ET)
//    - Saturday: no briefs
//    - Sunday: afternoon only (3 PM ET)
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

// Group A: Google News only — heaviest fetcher (76 queries), isolated
const GROUP_A = [
  ['google-news', fetchGoogleNews],
];

// Group B: Bing News (49q) + Publications (23 feeds) + NCAA RSS (3) + NewsData (18q)
// Lighter than old Group A1 (105+3+18=126) thanks to Bing trim (62→49) and dedup cache 7d→3d
const GROUP_B = [
  ['bing-news', fetchBingNews],
  ['publications', fetchPublications],
  ['ncaa-rss', fetchNCAANews],
  ['newsdata', fetchNewsData],
];

// Group C: Lighter / supplemental sources
const GROUP_C = [
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
      // Determine which fetcher group to run based on cron pattern
      let fetchers, label;
      if (cron === '0,30 * * * *') {
        fetchers = GROUP_A; label = 'A (Google)';
      } else if (cron === '10,40 * * * *') {
        fetchers = GROUP_B; label = 'B (Bing+Feeds)';
      } else {
        fetchers = GROUP_C; label = 'C (Light)';
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
