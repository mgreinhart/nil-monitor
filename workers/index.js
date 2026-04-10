// ═══════════════════════════════════════════════════════════════════
//  NIL MONITOR — Worker Entry Point
//  Four cron patterns:
//    0,30 * * * *          — Google News (86 queries, isolated)
//    10,40 * * * *         — Bing News (57q) + Publications (23) + NCAA (3) + NewsData (18)
//    7,37 * * * *          — Lighter/supplemental fetchers
//    25 10,11,19,20 * * *  — AI pipeline (6 AM / 3 PM ET, auto-DST)
//
//  Google News is isolated in its own invocation — it's the heaviest
//  fetcher and was the primary cause of CPU limit crashes.
//
//  Groups B and C run fetchers SEQUENTIALLY (not Promise.all) with a
//  CPU budget timer. If 80% of the 30s CPU limit is consumed, remaining
//  fetchers are skipped and will run on the next cron cycle.
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

// CPU budget: Cloudflare free tier allows 10ms CPU per invocation (not wall time).
// We can't measure CPU directly, but we can cap wall time as a proxy.
// 25 seconds wall time is safe — leaves headroom for cleanup/DB writes.
const WALL_TIME_BUDGET_MS = 25000;

// Wrap a fetcher so errors are logged to D1, not just console
function safeFetch(name, fn, env) {
  return fn(env).catch(async (e) => {
    console.error(`${name}:`, e.message);
    try { await recordError(env.DB, name, e); } catch (_) { /* best effort */ }
  });
}

/**
 * Run fetchers sequentially with a wall-time budget.
 * Each fetcher runs one at a time to avoid CPU spikes from parallel execution.
 * If the budget is consumed, remaining fetchers are skipped gracefully.
 */
async function runWithBudget(fetchers, label, env) {
  const start = Date.now();
  let completed = 0;

  try {
    try {
      await loadDedupCache(env.DB);
    } catch (e) {
      console.error(`Group ${label}: dedup cache failed (${e.message}), running fetchers without cache`);
      try { await recordError(env.DB, `group-${label.split(' ')[0]}-dedup`, e); } catch (_) {}
    }

    for (const [name, fn] of fetchers) {
      const elapsed = Date.now() - start;
      if (elapsed > WALL_TIME_BUDGET_MS) {
        const skipped = fetchers.slice(completed).map(([n]) => n).join(', ');
        console.log(`Group ${label}: budget exceeded at ${elapsed}ms — skipping: ${skipped}`);
        break;
      }
      await safeFetch(name, fn, env);
      completed++;
    }

    console.log(`Group ${label}: completed ${completed}/${fetchers.length} fetchers in ${Date.now() - start}ms`);
  } catch (e) {
    console.error(`Group ${label} top-level error:`, e.message);
    try { await recordError(env.DB, `group-${label.split(' ')[0]}-init`, e); } catch (_) { /* best effort */ }
  } finally {
    clearDedupCache();
  }
}

// Group A: Google News only — heaviest fetcher (86 queries), isolated
const GROUP_A = [
  ['google-news', fetchGoogleNews],
];

// Group B: Bing News (57q) + Publications (23 feeds) + NCAA RSS (3) + NewsData (18q)
// Run sequentially to avoid CPU spikes — total ~101 network calls
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

      console.log(`Running fetcher group ${label} (${fetchers.length} fetchers, sequential)`);
      ctx.waitUntil(
        runWithBudget(fetchers, label, env)
          .catch(e => console.error(`Group ${label} unhandled error:`, e.message))
      );
    }
  },
};
