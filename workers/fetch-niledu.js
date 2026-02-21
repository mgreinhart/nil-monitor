// ═══════════════════════════════════════════════════════════════════
//  NIL/edu Substack RSS Fetcher
//  Self-governing cooldown:
//    6 AM–10 PM ET: every 2 hours
//    10 PM–6 AM ET: skip
//  Weekly newsletter — frequent checks not needed.
// ═══════════════════════════════════════════════════════════════════

import { parseRSS } from './rss-parser.js';
import { getETHour, shouldRun, recordRun, categorizeByKeyword } from './fetcher-utils.js';

const FETCHER = 'niledu';
const FEED_URL = 'https://niledu.substack.com/feed';

function getCooldown() {
  const h = getETHour();
  if (h >= 6 && h < 22) return 120;
  return null;
}

export async function fetchNILEdu(env) {
  const cooldown = getCooldown();
  if (cooldown === null) {
    console.log('NIL/edu: outside active hours, skipping');
    return;
  }
  if (!await shouldRun(env.DB, FETCHER, cooldown)) {
    console.log(`NIL/edu: cooldown (${cooldown}m) not elapsed, skipping`);
    return;
  }

  console.log('Fetching NIL/edu Substack RSS...');
  let totalInserted = 0;

  try {
    const resp = await fetch(FEED_URL, {
      headers: { 'User-Agent': 'NILMonitor/1.0 (RSS Reader)' },
    });
    if (!resp.ok) {
      console.error(`NIL/edu RSS failed: ${resp.status}`);
      return;
    }

    const xml = await resp.text();
    const items = parseRSS(xml);

    for (const item of items.slice(0, 15)) {
      if (!item.title || !item.link) continue;

      const published = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();
      const category = categorizeByKeyword(item.title);

      try {
        await env.DB.prepare(
          `INSERT OR IGNORE INTO headlines (source, title, url, category, published_at)
           VALUES (?, ?, ?, ?, ?)`
        ).bind('NIL/edu', item.title, item.link, category, published).run();
        totalInserted++;
      } catch (e) {
        // UNIQUE constraint on url — skip duplicates
      }
    }
  } catch (err) {
    console.error('NIL/edu RSS error:', err.message);
  }

  await recordRun(env.DB, FETCHER);
  console.log(`NIL/edu: inserted ${totalInserted} headlines`);
}
