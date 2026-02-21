// ═══════════════════════════════════════════════════════════════════
//  NIL Revolution (Troutman Pepper) RSS Fetcher
//  Self-governing cooldown:
//    6 AM–10 PM ET: every 2 hours
//    10 PM–6 AM ET: skip
//  Publishes a few times per week — frequent checks not needed.
// ═══════════════════════════════════════════════════════════════════

import { parseRSS } from './rss-parser.js';
import { getETHour, shouldRun, recordRun, insertHeadline } from './fetcher-utils.js';

const FETCHER = 'nil-revolution';
const FEED_URL = 'https://www.nilrevolution.com/feed/';

function getCooldown() {
  const h = getETHour();
  if (h >= 6 && h < 22) return 120;
  return null;
}

export async function fetchNILRevolution(env) {
  const cooldown = getCooldown();
  if (cooldown === null) {
    console.log('NIL Revolution: outside active hours, skipping');
    return;
  }
  if (!await shouldRun(env.DB, FETCHER, cooldown)) {
    console.log(`NIL Revolution: cooldown (${cooldown}m) not elapsed, skipping`);
    return;
  }

  console.log('Fetching NIL Revolution RSS...');
  let totalInserted = 0;

  try {
    const resp = await fetch(FEED_URL, {
      headers: { 'User-Agent': 'NILMonitor/1.0 (RSS Reader)' },
    });
    if (!resp.ok) {
      console.error(`NIL Revolution RSS failed: ${resp.status}`);
      await recordRun(env.DB, FETCHER);
      return;
    }

    const xml = await resp.text();
    const items = parseRSS(xml);

    for (const item of items.slice(0, 15)) {
      if (!item.title || !item.link) continue;

      const published = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString();

      const inserted = await insertHeadline(env.DB, {
        source: 'NIL Revolution', title: item.title, url: item.link, published,
      });
      if (inserted) totalInserted++;
    }
  } catch (err) {
    console.error('NIL Revolution RSS error:', err.message);
  }

  await recordRun(env.DB, FETCHER);
  console.log(`NIL Revolution: inserted ${totalInserted} headlines`);
}
