import { describe, it, expect } from 'vitest';
import {
  isGameNoise,
  isProSportsNoise,
  isSpamTitle,
  isBlockedDomain,
  isPortalNoise,
  isTitleRelevant,
  categorizeByKeyword,
  normalizeUrl,
  decodeEntities,
} from '../fetcher-utils.js';

// ═══════════════════════════════════════════════════════════════════
//  Fixture tests for the headline classifier chain
//  (AUDIT-2026-08-04-design.md §3, recommendation #1)
//
//  These are the functions insertHeadline() runs every incoming
//  headline through before it's written to D1. There were previously
//  zero tests for any of this — a regex edit could silently change
//  what gets filtered with no signal until someone eyeballs production.
//
//  Each fixture below is traced against the actual regex source, not
//  guessed. If a fixture fails, treat that as a real behavior
//  question before "fixing" the fixture to match — it may mean the
//  regex doesn't do what its neighboring comment claims.
// ═══════════════════════════════════════════════════════════════════

describe('isGameNoise', () => {
  const noise = [
    ['Alabama vs Georgia: Game Recap and Highlights', 'game recap + highlights, no business signal'],
    ["2026 NFL Mock Draft: Way-Too-Early First Round Projections", 'mock draft'],
    ["Best Bets and Odds for Saturday's Top 25 Matchups", 'betting odds + top 25, no rescue'],
    ['Michigan Survives First Round Thriller in Overtime', 'bracket/overtime game coverage'],
    ['Where to Watch Saturday\'s Top College Football Games', 'how-to-watch'],
    ['5-Star Quarterback Commits to Ohio State on Signing Day', 'recruiting commitment'],
  ];
  const notNoise = [
    ['NCAA Board Approves New NIL Enforcement Guidelines', 'contains NIL — business signal rescues'],
    ['Texas Governor Signs NIL Agent Registration Bill', 'contains NIL, clean legislative story'],
    ['NCAA Changing Transfer Portal Window Rules for 2026', 'portal + "window"/"rule" — safe-listed, then rescued by business signal'],
    ['College Sports Commission Opens New Investigation', 'governance/enforcement story, not game coverage'],
  ];
  const preflightOverridesBusiness = [
    // PREFLIGHT_NOISE_RE is checked BEFORE the business-signal rescue, so
    // these ARE noise even though they contain "NIL".
    ['Five-Star QB Announces NIL Deal With Nike Ahead of Season', 'individual NIL deal announcement — preflight overrides the NIL rescue'],
  ];
  const portalOverridesBusiness = [
    // isPortalNoise is also checked before the business-signal rescue.
    ['Kim Mulkey Loses Elite Guard to Transfer Portal', 'team-specific portal loss, no safe-list word present'],
  ];

  it.each(noise)('flags as noise: %s (%s)', (title) => {
    expect(isGameNoise(title)).toBe(true);
  });
  it.each(notNoise)('does not flag: %s (%s)', (title) => {
    expect(isGameNoise(title)).toBe(false);
  });
  it.each(preflightOverridesBusiness)('preflight overrides NIL rescue: %s (%s)', (title) => {
    expect(isGameNoise(title)).toBe(true);
  });
  it.each(portalOverridesBusiness)('portal noise overrides business rescue: %s (%s)', (title) => {
    expect(isGameNoise(title)).toBe(true);
  });

  it('returns false for empty/null input', () => {
    expect(isGameNoise('')).toBe(false);
    expect(isGameNoise(null)).toBe(false);
  });
});

describe('isProSportsNoise', () => {
  it('flags a pro team headline with no college context', () => {
    expect(isProSportsNoise('Cowboys Sign Free Agent Linebacker to One-Year Deal')).toBe(true);
  });
  it('flags a bare pro-league business headline', () => {
    expect(isProSportsNoise('NFL Network Ratings Hit Season High for Sunday Slate')).toBe(true);
  });
  it('does not flag when college context is present, even with a pro team name', () => {
    expect(isProSportsNoise('NFL Draft Prospect Also Played College Football at Alabama')).toBe(false);
  });
  it('does not flag an unrelated college headline', () => {
    expect(isProSportsNoise('Big Ten Announces New Media Rights Deal With ESPN')).toBe(false);
  });
});

describe('isSpamTitle', () => {
  it('flags clearance-sale bait', () => {
    expect(isSpamTitle('Clearance Sale: Best Football Gear Deals This Week')).toBe(true);
  });
  it('flags hot-deal bait with a sports keyword', () => {
    expect(isSpamTitle("Hot Deal Alert on Basketball Shoes This Weekend")).toBe(true);
  });
  it('does not flag an ordinary headline', () => {
    expect(isSpamTitle('Alabama Announces New Football Facility Plans')).toBe(false);
  });
});

describe('isBlockedDomain', () => {
  it('flags a known spam domain', () => {
    expect(isBlockedDomain('https://www.padelspain.com/some-article')).toBe(true);
  });
  it('flags another known spam domain regardless of path', () => {
    expect(isBlockedDomain('https://clearancefind.net/deals/123')).toBe(true);
  });
  it('does not flag a legitimate outlet', () => {
    expect(isBlockedDomain('https://espn.com/college-football/story/123')).toBe(false);
  });
});

describe('isPortalNoise', () => {
  it('flags team-specific portal shopping-list framing', () => {
    expect(isPortalNoise('3 Biggest Transfer Portal Needs for BYU This Spring')).toBe(true);
  });
  it('flags a coach/team losing a player to the portal', () => {
    expect(isPortalNoise('Kim Mulkey Loses Elite Guard to Transfer Portal')).toBe(true);
  });
  it('does not flag portal policy/window coverage (safe-listed)', () => {
    expect(isPortalNoise('NCAA Changing Transfer Portal Window Rules for 2026')).toBe(false);
  });
  it('does not flag an unrelated headline', () => {
    expect(isPortalNoise('Texas Governor Signs NIL Agent Registration Bill')).toBe(false);
  });
});

describe('isTitleRelevant', () => {
  const relevant = [
    ['Texas Passes New NIL Agent Registration Law', 'NIL'],
    ['NCAA Adopts New Transfer Portal Eligibility Rule', 'NCAA + eligibility'],
    ['Big Ten Announces New Media Rights Deal With ESPN', 'conference + media rights'],
    ['College Sports Commission Opens New Investigation', 'CSC'],
  ];
  const irrelevant = [
    ['Local Weather Forecast for the Weekend', 'no domain keywords at all'],
    ['Lakers Sign Free Agent Center to Multi-Year Deal', 'pro sports, no college/NIL/NCAA keyword'],
  ];
  it.each(relevant)('passes the gate: %s (%s)', (title) => {
    expect(isTitleRelevant(title)).toBe(true);
  });
  it.each(irrelevant)('is rejected by the gate: %s (%s)', (title) => {
    expect(isTitleRelevant(title)).toBe(false);
  });
});

describe('categorizeByKeyword', () => {
  const cases = [
    ['College Sports Commission Opens Investigation Into Booster Payments', 'CSC / Enforcement'],
    ['Texas Senate Passes NIL Agent Registration Bill 28-3', 'Legislation'],
    ['Judge Rules NCAA Cannot Enforce Eligibility Restriction in Antitrust Case', 'Litigation'],
    ['Athletic Director Announces $5M Fundraising Campaign for New Arena', 'Business / Finance'],
    ['Lakers Sign Free Agent Center to Multi-Year Deal', 'Off-Topic'],
    ['Local Weather Forecast for the Weekend', null],
  ];
  it.each(cases)('categorizes "%s" as %s', (title, expected) => {
    expect(categorizeByKeyword(title)).toBe(expected);
  });
});

describe('normalizeUrl', () => {
  it('strips tracking params, www, and trailing slash while keeping other query params', () => {
    const input = 'https://www.espn.com/story/?utm_source=twitter&utm_medium=social&id=5';
    expect(normalizeUrl(input)).toBe('https://espn.com/story?id=5');
  });
  it('strips a bare trailing slash with no query string', () => {
    expect(normalizeUrl('https://example.com/path/')).toBe('https://example.com/path');
  });
  it('strips the URL fragment', () => {
    expect(normalizeUrl('https://example.com/path#section2')).toBe('https://example.com/path');
  });
  it('falls back to the raw input on an unparseable URL', () => {
    expect(normalizeUrl('not a url')).toBe('not a url');
  });
});

describe('decodeEntities', () => {
  it('decodes named entities', () => {
    expect(decodeEntities('Texas &amp; A&amp;M Face Off')).toBe('Texas & A&M Face Off');
  });
  it('decodes decimal numeric entities', () => {
    expect(decodeEntities('It&#8217;s a Big Deal')).toBe('It’s a Big Deal');
  });
  it('decodes hex numeric entities', () => {
    expect(decodeEntities('Caf&#x00e9; Discussion')).toBe('Café Discussion');
  });
  it('leaves a plain title unchanged', () => {
    expect(decodeEntities('Plain Title')).toBe('Plain Title');
  });
  it('passes through null/empty unchanged', () => {
    expect(decodeEntities(null)).toBe(null);
    expect(decodeEntities('')).toBe('');
  });
});
