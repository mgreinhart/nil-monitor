// ═══════════════════════════════════════════════════════════════════
//  Podcast Freshness Fetcher
//  Checks RSS feeds for each podcast, stores latest episode date.
//  Self-governing cooldown: every 6 hours, 6 AM–10 PM ET
// ═══════════════════════════════════════════════════════════════════

import { getETHour, shouldRun, recordRun } from './fetcher-utils.js';

const FETCHER = 'podcasts';

// Spotify show ID → RSS feed URL
const PODCAST_FEEDS = [
  { spotifyId: '1Pju07vvKyIqEZOGDNaMMD', feed: 'https://feeds.simplecast.com/1FKRroTP' },        // Highway to NIL
  { spotifyId: '3AbKOjnxZaBLs9VVfujToU', feed: 'https://anchor.fm/s/fff660bc/podcast/rss' },      // NIL Clubhouse
  { spotifyId: '2Wr77m5yVBgANHkDS7NxI5', feed: 'https://feeds.simplecast.com/1Gw4HZHD' },        // The Portal
  { spotifyId: '6QmP0ZLPAiEG7iqhywSURD', feed: 'https://rss.libsyn.com/shows/74483/destinations/327372.xml' }, // One Question Leadership
  { spotifyId: '30VL73UUR59yLZfagH1Rzv', feed: 'https://rss.buzzsprout.com/2549070.rss' },        // The Standard
];

function getCooldown() {
  const h = getETHour();
  if (h >= 6 && h < 22) return 360; // 6 hours
  return null; // skip overnight
}

/**
 * Extract the first item's pubDate from RSS XML.
 * Returns ISO date string or null.
 */
function getLatestEpisodeDate(xml) {
  const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/);
  if (!itemMatch) return null;
  const pubMatch = itemMatch[1].match(/<pubDate>([^<]*)<\/pubDate>/);
  if (!pubMatch) return null;
  const d = new Date(pubMatch[1].trim());
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Extract the first item's title from RSS XML.
 */
function getLatestEpisodeTitle(xml) {
  const itemMatch = xml.match(/<item>([\s\S]*?)<\/item>/);
  if (!itemMatch) return null;
  // Handle CDATA
  const cdata = itemMatch[1].match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/);
  if (cdata) return cdata[1].trim();
  const plain = itemMatch[1].match(/<title>([^<]*)<\/title>/);
  return plain ? plain[1].trim() : null;
}

export async function fetchPodcasts(env, { force = false } = {}) {
  if (!force) {
    const cooldown = getCooldown();
    if (cooldown === null) {
      console.log('Podcasts: outside active hours, skipping');
      return;
    }
    if (!await shouldRun(env.DB, FETCHER, cooldown)) {
      console.log(`Podcasts: cooldown (${cooldown}m) not elapsed, skipping`);
      return;
    }
  }

  console.log('Fetching podcast RSS feeds...');
  let updated = 0;

  for (const p of PODCAST_FEEDS) {
    try {
      const resp = await fetch(p.feed, {
        headers: { 'User-Agent': 'NILMonitor/1.0 (podcast freshness check)' },
      });
      if (!resp.ok) {
        console.error(`Podcasts: ${p.spotifyId} feed returned ${resp.status}`);
        continue;
      }
      const xml = await resp.text();
      const latestDate = getLatestEpisodeDate(xml);
      const latestTitle = getLatestEpisodeTitle(xml);

      if (latestDate) {
        await env.DB.prepare(
          `INSERT INTO podcast_episodes (spotify_id, latest_title, latest_date, updated_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(spotify_id) DO UPDATE SET
             latest_title = excluded.latest_title,
             latest_date = excluded.latest_date,
             updated_at = datetime('now')`
        ).bind(p.spotifyId, latestTitle, latestDate).run();
        updated++;
      }
    } catch (err) {
      console.error(`Podcasts: error fetching ${p.spotifyId}:`, err.message);
    }
  }

  await recordRun(env.DB, FETCHER);
  console.log(`Podcasts: ${updated}/${PODCAST_FEEDS.length} feeds updated`);
}
