import { useState, useEffect } from "react";

/* ═══════════════════════════════════════════════════════════════════
   NIL MONITOR — Phase 1 Static Shell
   Dense, glanceable dashboard for college athletics decision-makers.
   Bloomberg terminal × news app. Information density over decoration.
   ═══════════════════════════════════════════════════════════════════ */

// ── Design Tokens ──────────────────────────────────────────────────
const T = {
  navy: "#0f1729",
  navySoft: "#1a2237",
  accent: "#DC4A2D",
  accentDim: "#DC4A2D20",
  green: "#10b981",
  greenDim: "#10b98118",
  amber: "#f59e0b",
  amberDim: "#f59e0b18",
  red: "#ef4444",
  redDim: "#ef444418",
  purple: "#8b5cf6",
  purpleDim: "#8b5cf618",
  bg: "#f1f3f7",
  surface: "#ffffff",
  surfaceAlt: "#f7f8fb",
  briefingBg: "#FFF3E8",
  text: "#0f1729",
  textMid: "#3d4a5c",
  textDim: "#7c8698",
  border: "#edf0f4",
  borderLight: "#f0f2f6",
  mono: "'Geist Mono', 'Fira Code', 'SF Mono', monospace",
  sans: "'Geist Sans', 'Inter', system-ui, sans-serif",
  radius: 6,
};

const CAT_COLORS = {
  "Legislation": "#6366f1",
  "Litigation": "#3b82f6",
  "NCAA Governance": "#8b5cf6",
  "CSC / Enforcement": "#ef4444",
  "Revenue Sharing": "#10b981",
  "Roster / Portal": "#f59e0b",
  "Realignment": "#64748b",
  "Settlement Implementation": "#3b82f6",
  "Contract Enforcement": "#10b981",
  "Antitrust": "#f59e0b",
  "Employment Classification": "#8b5cf6",
  "Governance": "#6366f1",
};

const CSC_SUB_COLORS = {
  "Guidance": "#3b82f6", "Investigation": "#ef4444", "Enforcement": "#dc2626",
  "Personnel": "#8b5cf6", "Rule Clarification": "#f59e0b",
};
// ── Mock Data ──────────────────────────────────────────────────────
const MOCK = {
  kpis: [
    { label: "STATE BILLS", value: "47", delta: "+2", up: true },
    { label: "FEDERAL BILLS", value: "6", delta: "0", up: null },
    { label: "TRACKED CASES", value: "14", delta: "+1", up: true },
    { label: "CSC ACTIONS", value: "8", delta: "+2", up: true },
    { label: "NEXT DEADLINE", value: "4d", delta: "CSC Q1", up: null },
  ],
  briefing: [
    ["House settlement implementation enters critical phase.", "Judge Wilken's chambers issued a scheduling order yesterday setting the final fairness hearing for March 12. Schools that haven't signed the participation agreement now have 18 days. Separately, the CSC published guidance clarifying 'valid business purpose' criteria for third-party NIL deals — the first concrete enforcement rubric since the tip line launched."],
    ["Two new state bills.", "Texas HB 1247 and Florida SB 892 would require agent registration and mandatory disclosure for NIL intermediaries, respectively. Flag for government relations."],
    ["Williams v. Washington headed to mediation.", "Both parties agreed to a 30-day cooling period. First major test of revenue-sharing contract enforceability continues to develop."],
  ],
  timeline: [
    { time: "2h", cat: "CSC / Enforcement", src: "CSC.gov", text: "CSC publishes 'valid business purpose' evaluation criteria for third-party NIL deals", sev: "critical" },
    { time: "4h", cat: "Litigation", src: "CourtListener", text: "House v. NCAA — scheduling order sets final fairness hearing for March 12", sev: "critical" },
    { time: "6h", cat: "Legislation", src: "LegiScan", text: "TX HB 1247: agent registration for NIL intermediaries operating in Texas", sev: "important" },
    { time: "8h", cat: "Legislation", src: "LegiScan", text: "FL SB 892: mandatory disclosure for NIL deals exceeding $10,000", sev: "important" },
    { time: "11h", cat: "Revenue Sharing", src: "ESPN", text: "Williams v. Washington — parties agree to 30-day mediation period", sev: "routine" },
    { time: "14h", cat: "NCAA Governance", src: "NCAA.org", text: "D-I Board approves emergency legislation on NIL disclosure timelines", sev: "important" },
    { time: "1d", cat: "Roster / Portal", src: "On3", text: "Spring transfer portal window opens — 247 entries in first 12 hours", sev: "routine" },
    { time: "1d", cat: "CSC / Enforcement", src: "Sportico", text: "CSC confirms active investigation into LSU collective reporting practices", sev: "critical" },
    { time: "2d", cat: "Realignment", src: "FOS", text: "Pac-12 expansion negotiations with Mountain West stalled over media rights", sev: "routine" },
    { time: "2d", cat: "Litigation", src: "CourtListener", text: "Carter v. NCAA — NLRB certifies Dartmouth basketball union election", sev: "important" },
  ],
  cases: [
    { name: "House v. NCAA", court: "N.D. Cal.", judge: "Wilken", status: "Final Approval Pending", cat: "Settlement Implementation", lastFiling: "Feb 19", next: "Mar 12 — Fairness hearing", filings: 847, desc: "Class action settlement: revenue sharing ($20.5M cap), back-damages ($2.78B), College Sports Commission as enforcement body." },
    { name: "Williams v. Washington", court: "W.D. Wash.", judge: "Martinez", status: "Mediation", cat: "Contract Enforcement", lastFiling: "Feb 15", next: "Mar 17 — Mediation", filings: 23, desc: "First test of revenue-sharing contract enforceability. QB signed $4M deal, entered portal 4 days later." },
    { name: "Carter v. NCAA", court: "NLRB", judge: "Reg. Dir.", status: "Election Certified", cat: "Employment Classification", lastFiling: "Feb 17", next: "Mar 5 — Election", filings: 156, desc: "Dartmouth basketball union petition. NLRB certified election. NCAA appealing employee classification." },
    { name: "Tennessee v. NCAA", court: "E.D. Tenn.", judge: "Atchley", status: "Discovery", cat: "Governance", lastFiling: "Feb 10", next: "Apr 20 — Discovery deadline", filings: 89, desc: "State challenging NCAA governance authority. Antitrust claims in enforcement actions." },
    { name: "Duke v. Harper", court: "M.D.N.C.", judge: "Schroeder", status: "MTD Pending", cat: "Contract Enforcement", lastFiling: "Feb 8", next: "Mar 28 — MTD hearing", filings: 12, desc: "Duke seeking enforcement of multi-year revenue-sharing contract after player announced transfer intent." },
  ],
  headlines: [
    { src: "ESPN", time: "1h", cat: "Revenue Sharing", title: "Inside the $20.5M math problem: How ADs are allocating revenue-sharing dollars" },
    { src: "Sportico", time: "2h", cat: "CSC / Enforcement", title: "CSC's first enforcement rubric signals tough line on collective-funded deals" },
    { src: "NIL Revolution", time: "4h", cat: "Litigation", title: "Contract enforcement after Williams: What every compliance officer needs to know" },
    { src: "FOS", time: "6h", cat: "Roster / Portal", title: "Spring portal opens with record entries as revenue sharing reshapes rosters" },
    { src: "The Athletic", time: "8h", cat: "NCAA Governance", title: "NCAA Board's emergency NIL disclosure legislation: Winners and losers" },
    { src: "Extra Points", time: "12h", cat: "Legislation", title: "Two new state NIL bills signal a second wave of agent regulation" },
    { src: "BOCS", time: "1d", cat: "Revenue Sharing", title: "The Title IX implications of a $20.5M cap: A financial modeling analysis" },
    { src: "Sportico", time: "1d", cat: "Realignment", title: "Pac-12 expansion talks hit wall over Mountain West media rights" },
    { src: "NIL Revolution", time: "2d", cat: "CSC / Enforcement", title: "Breaking down the CSC's investigation powers and due process requirements" },
    { src: "ESPN", time: "2d", cat: "Litigation", title: "NLRB certifies Dartmouth union election — what it means for college sports" },
  ],
  xFeed: [
    { handle: "@PeteThamel", time: "12m", text: "BREAKING: CSC guidance memo is most specific enforcement document yet. Key: 'market rate comparables required for all deals >$50K.' Compliance offices scrambling." },
    { handle: "@RossDellenger", time: "28m", text: "Source: 4 Power 4 schools still haven't signed CSC participation agreement. March 1 deadline. Commissioners applying pressure." },
    { handle: "@NicoleAuerbach", time: "45m", text: "Williams v. Washington mediation isn't retreat. Both sides see trial as lose-lose. Settlement framework being discussed." },
    { handle: "@D1ticker", time: "1.5h", text: "AM Edition: CSC drops enforcement rubric, House hearing March 12, two new state bills, portal opens with record entries." },
    { handle: "@ExtraPoints", time: "2h", text: "New post: The CSC guidance memo is the most consequential document since the House settlement itself." },
    { handle: "@SportsBizLawyer", time: "3h", text: "CSC 'valid business purpose' criteria essentially kills pure inducement model. Schools must rethink collective relationships." },
  ],
};

// ── Embed Configuration ────────────────────────────────────────────
const X_LIST_URL = "https://x.com/i/lists/2024695913898528822";
const NIL_PODCASTS = [
  { name: "Highway to NIL", id: "1Pju07vvKyIqEZOGDNaMMD" },
  { name: "NIL Clubhouse", id: "3AbKOjnxZaBLs9VVfujToU" },
  { name: "The Portal", id: "2Wr77m5yVBgANHkDS7NxI5" },
];
// ── Shared Components ──────────────────────────────────────────────
const Mono = ({ children, style }) => <span style={{ fontFamily: T.mono, ...style }}>{children}</span>;

const Badge = ({ children, color = T.accent }) => (
  <span style={{
    fontFamily: T.mono, fontSize: 11, fontWeight: 700, letterSpacing: ".3px",
    padding: "4px 8px", borderRadius: 4,
    background: color + "15", color, whiteSpace: "nowrap", textTransform: "uppercase", lineHeight: 1.4,
  }}>{children}</span>
);

const Pill = ({ active, children, onClick }) => (
  <button onClick={onClick} style={{
    fontFamily: T.mono, fontSize: 11, fontWeight: 600, padding: "8px 12px", borderRadius: 4,
    border: `1px solid ${active ? T.accent : "#9ca3af"}`,
    background: active ? T.accent : "transparent",
    color: active ? "#fff" : "#3d4a5c", cursor: "pointer", whiteSpace: "nowrap", letterSpacing: ".3px",
  }}>{children}</button>
);

const Panel = ({ title, accent, children, style, right, noPad, size }) => {
  const isLg = size === "lg";
  const isSm = size === "sm";
  const ac = accent || T.accent;
  return (
    <div style={{
      background: isLg ? T.briefingBg : T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: T.radius,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      boxShadow: isLg ? "0 2px 8px rgba(0,0,0,.08)" : "none",
      ...style,
    }}>
      {title && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: isSm ? "8px 12px" : "8px 16px",
          borderBottom: `1px solid ${T.border}`,
          minHeight: isLg ? 36 : 32,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: isLg ? 5 : isSm ? 3 : 4, height: isLg ? 18 : 14, borderRadius: 2, background: ac, flexShrink: 0 }} />
            <Mono style={{ fontSize: isLg ? 17 : isSm ? 14 : 16, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: ac }}>{title}</Mono>
          </div>
          {right}
        </div>
      )}
      <div style={{ padding: noPad ? 0 : isLg ? "16px" : isSm ? "12px" : "12px 16px", flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
};

const Divider = () => <div style={{ height: 1, background: T.border, margin: 0 }} />;

// ── Bar Chart ──────────────────────────────────────────────────────
const MiniBarChart = ({ data }) => {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 1.5, height: 52 }}>
      {data.map((d, i) => (
        <div key={i} title={`${d.day}: ${d.count}`} style={{
          flex: 1, height: `${(d.count / max) * 100}%`,
          background: i === data.length - 1 ? T.accent : T.accent + "35",
          borderRadius: "1px 1px 0 0", minHeight: d.count > 0 ? 2 : 0,
        }} />
      ))}
    </div>
  );
};

// ── Live Embed Components ─────────────────────────────────────────

const X_LIST_ACCOUNTS = [
  { handle: "@PeteThamel", org: "ESPN" },
  { handle: "@RossDellenger", org: "Yahoo" },
  { handle: "@NicoleAuerbach", org: "Athletic" },
  { handle: "@D1ticker", org: "College Sports" },
  { handle: "@DarrenHeitner", org: "NIL Legal" },
  { handle: "@achristovichh", org: "FOS" },
  { handle: "@Sportico", org: "Sports Business" },
  { handle: "@NCAA", org: "Official" },
];

const XListEmbed = () => (
  <Panel title="Live NIL News Feed" accent={T.green} size="sm">
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {X_LIST_ACCOUNTS.map((a, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "4px 0", borderBottom: `1px solid ${T.border}`,
        }}>
          <span style={{ fontFamily: T.sans, fontSize: 13, fontWeight: 500, color: T.textMid }}>{a.handle}</span>
          <Mono style={{ fontSize: 12, color: T.textDim }}>{a.org}</Mono>
        </div>
      ))}
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
      <Mono style={{ fontSize: 11, color: T.textDim }}>Auto-updating · {X_LIST_ACCOUNTS.length} accounts</Mono>
      <a href={X_LIST_URL} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
        <Mono style={{ fontSize: 12, fontWeight: 600, color: T.accent }}>Open on X →</Mono>
      </a>
    </div>
  </Panel>
);

const PodcastsSection = () => (
  <Panel title="NIL Podcasts" accent={T.purple} size="sm" noPad>
    <div style={{ display: "flex", flexDirection: "column", gap: 0, padding: 4 }}>
      {NIL_PODCASTS.map((p, i) => (
        <div key={p.id} style={{ borderBottom: i < NIL_PODCASTS.length - 1 ? `1px solid ${T.border}` : "none", padding: "2px 0" }}>
          <iframe
            src={`https://open.spotify.com/embed/show/${p.id}?utm_source=generator&theme=0`}
            width="100%"
            height="152"
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            style={{ display: "block", borderRadius: 8, maxWidth: "100%" }}
          />
        </div>
      ))}
    </div>
  </Panel>
);

const KalshiSection = () => (
  <div style={{ marginTop: 12 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
      <Mono style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1px", color: T.textDim, textTransform: "uppercase" }}>
        Prediction Markets · Kalshi
      </Mono>
      <a href="https://kalshi.com/sports" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
        <Mono style={{ fontSize: 11, color: T.accent }}>All markets →</Mono>
      </a>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
      {[
        { label: "College Football", href: "https://kalshi.com/markets/kxncaaf/ncaaf-championship", desc: "CFB championship & game markets" },
        { label: "March Madness", href: "https://kalshi.com/sports/ncaab", desc: "NCAA tournament & basketball" },
        { label: "All Sports", href: "https://kalshi.com/sports", desc: "All event contracts" },
      ].map((link, i) => (
        <a key={i} href={link.href} target="_blank" rel="noopener noreferrer"
          style={{ padding: "8px 12px", background: T.surfaceAlt, borderRadius: 4, textDecoration: "none", border: `1px solid ${T.borderLight}` }}>
          <div style={{ fontFamily: T.sans, fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 4 }}>{link.label}</div>
          <Mono style={{ fontSize: 11, color: T.textDim }}>{link.desc}</Mono>
        </a>
      ))}
    </div>
  </div>
);

// ── Nav Resources ────────────────────────────────────────────────
const RESOURCES = [
  { label: "Saul Ewing NIL Tracker", href: "https://www.saul.com/nil-tracker" },
  { label: "CourtListener", href: "https://www.courtlistener.com" },
  { label: "LegiScan", href: "https://legiscan.com" },
  { label: "NCAA.org", href: "https://www.ncaa.org" },
  { label: "NIL Revolution", href: "https://www.nilrevolution.com" },
  { label: "Congress.gov", href: "https://www.congress.gov" },
];

// ── Utility Functions ────────────────────────────────────────────
const formatDate = (dateStr) => {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const timeAgo = (dateStr) => {
  if (!dateStr) return "";
  const normalized = dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T") + "Z";
  const diff = Date.now() - new Date(normalized).getTime();
  if (isNaN(diff) || diff < 0) return "";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days <= 7) return `${days}d`;
  return new Date(normalized).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const isWithinHour = (dateStr) => {
  if (!dateStr) return false;
  const normalized = dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T") + "Z";
  const diff = Date.now() - new Date(normalized).getTime();
  return !isNaN(diff) && diff >= 0 && diff < 3600000;
};

// ╔═══════════════════════════════════════════════════════════════════
//  MONITOR PAGE — The Dashboard (live from D1, falls back to mock)
// ╚═══════════════════════════════════════════════════════════════════
const MonitorPage = ({ onRefresh }) => {
  const [expCase, setExpCase] = useState(null);
  const [headlineCatFilt, setHeadlineCatFilt] = useState("All");
  const [hlPage, setHlPage] = useState(0);
  const [briefingOpen, setBriefingOpen] = useState(null);

  // Live data state
  const [briefing, setBriefing] = useState(null);
  const [briefingGeneratedAt, setBriefingGeneratedAt] = useState(null);
  const [cases, setCases] = useState(null);
  const [headlineCounts, setHeadlineCounts] = useState(null);
  const [headlines, setHeadlines] = useState(null);

  const fetchHeadlines = () => {
    fetch("/api/headlines?limit=100").then(r => r.ok ? r.json() : null).then(d => {
      if (d) { setHeadlines(d); onRefresh?.(new Date()); }
    }).catch(() => {});
    fetch("/api/headline-counts").then(r => r.ok ? r.json() : null).then(d => {
      if (d) setHeadlineCounts(d);
    }).catch(() => {});
  };

  useEffect(() => {
    // Initial load — all data
    fetch("/api/briefing").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.content) {
        setBriefing(JSON.parse(d.content));
        if (d.generated_at) setBriefingGeneratedAt(d.generated_at);
      }
    }).catch(() => {});
    fetch("/api/cases").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.length) setCases(d);
    }).catch(() => {});
    fetchHeadlines();

    // Auto-refresh headlines every 2 minutes
    const id = setInterval(fetchHeadlines, 120000);
    return () => clearInterval(id);
  }, []);

  // Normalize API cases or use mock
  const caseSource = cases ? cases.map(c => ({
    name: c.name, court: c.court, judge: c.judge, status: c.status,
    cat: c.category, lastFiling: c.last_filing_date, filings: c.filing_count,
    next: c.next_action_date ? `${formatDate(c.next_action_date)} — ${c.next_action || ""}` : null,
    nextDate: c.next_action_date || null,
    desc: c.description, clUrl: c.courtlistener_url, pacerUrl: c.pacer_url,
  })) : MOCK.cases;

  // Briefing: API or mock
  const briefingSource = briefing || MOCK.briefing.map(([headline, body]) => ({ headline, body }));

  // Briefing defaults to all expanded; null = user hasn't interacted
  const briefingExpanded = briefingOpen ?? new Set(briefingSource.map((_, i) => i));

  // Build 30-day chart data from headline counts (fill gaps with 0)
  const chartData = (() => {
    const map = {};
    if (headlineCounts) headlineCounts.forEach(r => { map[r.day] = r.count; });
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().split("T")[0];
      days.push({ day: key, count: map[key] || 0 });
    }
    return days;
  })();


  // Headlines: normalize for feed (include severity when AI-tagged)
  const hlSource = headlines ? headlines.map(h => ({
    src: h.source, title: h.title, cat: h.category, sev: h.severity,
    subCat: h.sub_category, time: timeAgo(h.published_at), url: h.url,
    isNew: isWithinHour(h.published_at),
  })) : MOCK.headlines;
  const hlFiltered = hlSource.filter(h => headlineCatFilt === "All" || h.cat === headlineCatFilt);
  const HL_PER_PAGE = 8;
  const hlTotalPages = Math.max(1, Math.ceil(hlFiltered.length / HL_PER_PAGE));
  const hlPageClamped = Math.min(hlPage, hlTotalPages - 1);
  const hlPageItems = hlFiltered.slice(hlPageClamped * HL_PER_PAGE, (hlPageClamped + 1) * HL_PER_PAGE);

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      {/* ══ MAIN COLUMN ══ */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>

        {/* ══════════════════════════════════════════════════════════
            ABOVE THE FOLD — Briefing + Headlines (stacked)
           ══════════════════════════════════════════════════════════ */}

        {/* ── Briefing (accordion, always expanded by default) ── */}
        <Panel size="lg" style={{ animation: "fadeIn 0.3s ease-in" }} title={(() => {
          if (!briefingGeneratedAt) return "Briefing";
          const n = briefingGeneratedAt.includes("T") ? briefingGeneratedAt : briefingGeneratedAt.replace(" ", "T") + "Z";
          const d = new Date(n);
          const month = d.toLocaleString("en-US", { month: "short", timeZone: "America/New_York" }).toUpperCase();
          const day = d.toLocaleString("en-US", { day: "numeric", timeZone: "America/New_York" });
          const hour = parseInt(d.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" }));
          const period = hour < 12 ? "AM" : "PM";
          return `${month} ${day} · ${period} BRIEFING`;
        })()} accent={T.accent} right={briefingSource.length > 0 && (
          <button
            onClick={() => setBriefingOpen(prev => {
              const current = prev ?? new Set(briefingSource.map((_, i) => i));
              return current.size === briefingSource.length ? new Set() : new Set(briefingSource.map((_, i) => i));
            })}
            style={{ fontFamily: T.mono, fontSize: 11, fontWeight: 600, color: T.textDim, background: "transparent", border: "none", cursor: "pointer", letterSpacing: ".3px" }}
          >{briefingExpanded.size === briefingSource.length ? "Collapse all" : "Expand all"}</button>
        )}>
          {briefingSource.map((s, i) => {
            const isOpen = briefingExpanded.has(i);
            return (
              <div key={i} style={{ borderBottom: i < briefingSource.length - 1 ? `1px solid ${T.borderLight}` : "none" }}>
                <div
                  onClick={() => setBriefingOpen(prev => {
                    const current = prev ?? new Set(briefingSource.map((_, i) => i));
                    const next = new Set(current);
                    next.has(i) ? next.delete(i) : next.add(i);
                    return next;
                  })}
                  style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "12px 0", cursor: "pointer" }}
                >
                  <Mono style={{ fontSize: 12, color: T.textDim, lineHeight: 1.6, flexShrink: 0, transition: "transform .15s", transform: isOpen ? "rotate(90deg)" : "none" }}>▸</Mono>
                  <span style={{ fontFamily: T.sans, fontSize: 18, fontWeight: 600, lineHeight: 1.5, color: T.text }}>{s.headline}</span>
                </div>
                <div style={{
                  maxHeight: isOpen ? 400 : 0, overflow: "hidden",
                  transition: "max-height .2s ease, opacity .2s ease",
                  opacity: isOpen ? 1 : 0,
                }}>
                  <div style={{ fontFamily: T.sans, fontSize: 15, lineHeight: 1.6, color: T.textMid, padding: "0 0 12px 20px" }}>
                    {s.body}
                  </div>
                </div>
              </div>
            );
          })}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: T.accent, flexShrink: 0 }} />
            <Mono style={{ fontSize: 13, color: T.accent }}>
              {briefingGeneratedAt ? `Generated ${(() => {
                const n = briefingGeneratedAt.includes("T") ? briefingGeneratedAt : briefingGeneratedAt.replace(" ", "T") + "Z";
                return new Date(n).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" }) + " · " + new Date(n).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
              })()}` : briefing ? "AI-generated" : "Sample briefing"}
            </Mono>
          </div>
        </Panel>

        {/* ── Latest Headlines ── */}
        <Panel title="Latest Headlines" accent={T.accent} noPad style={{ animation: "fadeIn 0.3s ease-in" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "4px 16px", borderBottom: `1px solid ${T.borderLight}` }}>
            {["All", ...Object.keys(CAT_COLORS).slice(0, 7)].map(c => (
              <Pill key={c} active={headlineCatFilt === c} onClick={() => { setHeadlineCatFilt(c); setHlPage(0); }}>{c}</Pill>
            ))}
          </div>
          {hlPageItems.length === 0 ? (
            <div style={{ padding: "20px 16px", textAlign: "center" }}>
              <Mono style={{ fontSize: 12, color: T.textDim }}>
                {headlines ? "No headlines in this category" : "Headlines populate when data pipeline runs"}
              </Mono>
            </div>
          ) : hlPageItems.map((h, i) => (
            <a key={i} href={h.url} target="_blank" rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 16px",
                borderBottom: `1px solid ${T.borderLight}`,
                // severity borders: critical = coral, important = amber, routine/null = none
                borderLeft: h.sev === "critical" ? `3px solid ${T.accent}` : h.sev === "important" ? `3px solid ${T.amber}` : "3px solid transparent",
                background: "transparent",
                textDecoration: "none", cursor: "pointer",
              }}
              onMouseEnter={e => e.currentTarget.style.background = T.surfaceAlt}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <Mono style={{ flex: "0 0 80px", fontSize: 12, fontWeight: 600, color: T.textDim, textTransform: "uppercase", letterSpacing: ".3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.src}</Mono>
              {h.cat && <Badge color={CAT_COLORS[h.cat]}>{h.cat}</Badge>}
              {h.subCat && <Badge color={CSC_SUB_COLORS[h.subCat] || T.textDim}>{h.subCat}</Badge>}
              <div style={{ flex: 1, fontFamily: T.sans, fontSize: 15, fontWeight: h.sev === "critical" ? 600 : 500, color: T.text, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.title}</div>
              {h.isNew && <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: "#fff", background: T.green, padding: "2px 6px", borderRadius: 3, letterSpacing: ".5px", flexShrink: 0, textTransform: "uppercase", lineHeight: 1.3 }}>NEW</span>}
              <Mono style={{ flex: "0 0 48px", fontSize: 12, color: T.textDim, textAlign: "right" }}>{h.time}</Mono>
            </a>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 16px", borderTop: `1px solid ${T.borderLight}` }}>
            {hlPageClamped > 0 ? (
              <button onClick={() => setHlPage(hlPageClamped - 1)} style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 600, color: T.accent, background: "transparent", border: "none", cursor: "pointer" }}>← Prev</button>
            ) : <span />}
            <Mono style={{ fontSize: 12, color: T.textDim }}>{hlPageClamped + 1} of {hlTotalPages}</Mono>
            {hlPageClamped < hlTotalPages - 1 ? (
              <button onClick={() => setHlPage(hlPageClamped + 1)} style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 600, color: T.accent, background: "transparent", border: "none", cursor: "pointer" }}>Next →</button>
            ) : <span />}
          </div>
        </Panel>

        {/* ══════════════════════════════════════════════════════════
            BELOW THE FOLD — Detail Sections
           ══════════════════════════════════════════════════════════ */}

        {/* ── Litigation ── */}
        <Panel title="The Courtroom" accent={T.textDim} noPad>
          {caseSource.map((c, i) => {
            const isOpen = expCase === i;
            const nextSoon = c.nextDate && (new Date(c.nextDate) - Date.now()) / 86400000 <= 30;
            return (
              <div key={i} style={{ borderBottom: i < caseSource.length - 1 ? `1px solid ${T.borderLight}` : "none" }}>
                <div
                  onClick={() => setExpCase(isOpen ? null : i)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", cursor: "pointer", flexWrap: "wrap" }}
                  onMouseEnter={e => e.currentTarget.style.background = T.surfaceAlt}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <Mono style={{ fontSize: 11, color: T.textDim, transition: "transform .15s", transform: isOpen ? "rotate(90deg)" : "none", flexShrink: 0 }}>▸</Mono>
                  <strong style={{ fontFamily: T.sans, fontSize: 16, fontWeight: 700, color: T.text }}>{c.name}</strong>
                  <Badge color={T.amber}>{c.status}</Badge>
                  {c.cat && <Badge color={CAT_COLORS[c.cat]}>{c.cat}</Badge>}
                  <div style={{ flex: 1 }} />
                  {c.next && <Mono style={{ fontSize: 13, fontWeight: 600, color: nextSoon ? T.red : T.textDim, flexShrink: 0 }}>→ {c.next}</Mono>}
                </div>
                <div style={{
                  maxHeight: isOpen ? 300 : 0, overflow: "hidden",
                  transition: "max-height .2s ease, opacity .2s ease",
                  opacity: isOpen ? 1 : 0,
                }}>
                  <div style={{ padding: "0 16px 12px 24px" }}>
                    <Mono style={{ fontSize: 11, color: T.textDim, display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                      {c.court && <span>{c.court}</span>}
                      {c.judge && <span>Judge {c.judge}</span>}
                      {c.filings != null && <span>{c.filings} filings</span>}
                      {c.lastFiling && <span>Last filed {formatDate(c.lastFiling)}</span>}
                    </Mono>
                    {c.desc && <div style={{ fontFamily: T.sans, fontSize: 13, color: T.textMid, lineHeight: 1.5, marginBottom: 8 }}>{c.desc}</div>}
                    <div style={{ display: "flex", gap: 12 }}>
                      {c.clUrl && <a href={c.clUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ textDecoration: "none" }}><Mono style={{ fontSize: 11, fontWeight: 600, color: T.accent }}>CourtListener →</Mono></a>}
                      {c.pacerUrl && <a href={c.pacerUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ textDecoration: "none" }}><Mono style={{ fontSize: 11, fontWeight: 600, color: T.accent }}>PACER →</Mono></a>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </Panel>

        {/* ── Outside View ── */}
        <Panel title="The Outside View" accent="#64748b" size="sm">
          <Mono style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1px", color: T.textDim, textTransform: "uppercase", marginBottom: 8, display: "block" }}>News Volume · 30 Days</Mono>
          <div style={{ height: 52 }}>
            {chartData.length > 0 ? <MiniBarChart data={chartData} /> : (
              <Mono style={{ fontSize: 12, color: T.textDim }}>Loading chart data...</Mono>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <Mono style={{ fontSize: 11, color: T.textDim }}>30d ago</Mono>
            <Mono style={{ fontSize: 11, color: T.textDim }}>Today</Mono>
          </div>
          <KalshiSection />
        </Panel>
      </div>

      {/* ══ SIDEBAR ══ */}
      <div style={{ flex: "0 0 280px", display: "flex", flexDirection: "column", gap: 8, position: "sticky", top: 52 }}>
        <XListEmbed />
        <PodcastsSection />
      </div>
    </div>
  );
};

// ╔═══════════════════════════════════════════════════════════════════
//  INFO MODAL — About content (data sources, methodology)
// ╚═══════════════════════════════════════════════════════════════════
const InfoModal = ({ onClose }) => (
  <div onClick={onClose} style={{
    position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,.5)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
  }}>
    <div onClick={e => e.stopPropagation()} style={{
      background: T.surface, borderRadius: T.radius, maxWidth: 680, width: "100%",
      maxHeight: "85vh", overflow: "auto", padding: "24px 32px",
      boxShadow: "0 20px 60px rgba(0,0,0,.3)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <h2 style={{ fontFamily: T.sans, fontSize: 22, fontWeight: 700, color: T.text, margin: 0 }}>What is NIL Monitor?</h2>
        <button onClick={onClose} style={{
          fontFamily: T.mono, fontSize: 18, color: T.textDim, background: "transparent",
          border: "none", cursor: "pointer", padding: "0 4px", lineHeight: 1,
        }}>&times;</button>
      </div>
      <p style={{ fontFamily: T.sans, fontSize: 15, lineHeight: 1.7, color: T.textMid, margin: "0 0 12px" }}>
        A live dashboard that gives college athletics decision-makers a single place to answer: <strong style={{ color: T.text }}>did anything change overnight that I need to know about?</strong>
      </p>
      <p style={{ fontFamily: T.sans, fontSize: 15, lineHeight: 1.7, color: T.textMid, margin: "0 0 12px" }}>
        We track the regulatory, legal, and governance landscape across five domains: state and federal legislation, active litigation, NCAA governance, College Sports Commission enforcement, and the news environment that shapes institutional attention.
      </p>
      <p style={{ fontFamily: T.sans, fontSize: 15, lineHeight: 1.7, color: T.textMid, margin: "0 0 20px" }}>
        We are the <strong style={{ color: T.text }}>first screen</strong> — the check that determines how you spend the rest of your morning.
      </p>
      <h3 style={{ fontFamily: T.sans, fontSize: 16, fontWeight: 700, color: T.text, margin: "0 0 8px" }}>Data Sources</h3>
      <div style={{ marginBottom: 16 }}>
        {[
          ["Google News RSS", "News aggregation (19 targeted queries)", "Free"],
          ["Bing News RSS", "News aggregation (15 targeted queries)", "Free"],
          ["NewsData.io", "News aggregation (87K+ sources)", "API"],
          ["Sportico", "Sports business journalism", "RSS"],
          ["Front Office Sports", "Sports business journalism", "RSS"],
          ["Business of College Sports", "Sports business journalism", "RSS"],
          ["AthleticDirectorU", "AD-focused news & analysis", "RSS"],
          ["Sports Litigation Alert", "Sports law coverage", "RSS"],
          ["CBS Sports", "College football coverage", "RSS"],
          ["ESPN", "College football coverage", "RSS"],
          ["On3", "College sports + recruiting", "RSS"],
          ["NYT Sports", "National sports coverage", "RSS"],
          ["NIL Revolution", "Legal analysis (Troutman Pepper)", "RSS"],
          ["NCAA.org", "Governance + rule changes", "RSS"],
          ["CourtListener / RECAP", "Federal court filings + alerts", "API"],
          ["LegiScan", "50-state + federal bill tracking", "API"],
          ["Congress.gov", "Federal bill detail", "API"],
          ["X (Twitter) List", "Real-time curated feed", "Embed"],
        ].map(([src, what, method], i) => (
          <div key={i} style={{ display: "flex", padding: "4px 0", borderBottom: `1px solid ${T.borderLight}` }}>
            <Mono style={{ fontSize: 11, fontWeight: 600, color: T.text, flex: "0 0 180px" }}>{src}</Mono>
            <span style={{ fontFamily: T.sans, fontSize: 13, color: T.textDim, flex: 1 }}>{what}</span>
            <Mono style={{ fontSize: 11, color: T.green }}>{method}</Mono>
          </div>
        ))}
      </div>
      <h3 style={{ fontFamily: T.sans, fontSize: 16, fontWeight: 700, color: T.text, margin: "0 0 8px" }}>Methodology</h3>
      <p style={{ fontFamily: T.sans, fontSize: 15, lineHeight: 1.7, color: T.textMid, margin: 0 }}>
        All data is aggregated automatically from public sources. An AI processing pipeline reads, categorizes, and routes information — generating the daily briefing, extracting deadlines from filings, detecting new cases, and tagging CSC activity. No editorial judgment on inclusion. All content links to original sources. Zero manual maintenance after initial setup.
      </p>
    </div>
  </div>
);

// ╔═══════════════════════════════════════════════════════════════════
//  APP SHELL — Single-page dashboard
// ╚═══════════════════════════════════════════════════════════════════
export default function NILMonitor() {
  const [showResources, setShowResources] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [now, setNow] = useState(Date.now());

  // Tick every 60s so "Updated X min ago" stays fresh
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // Close dropdown on any outside click
  useEffect(() => {
    if (!showResources) return;
    const close = () => setShowResources(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [showResources]);

  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: T.sans }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${T.bg}; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 2px; }
        button { outline: none; }
        button:hover { filter: brightness(0.95); }
        @keyframes pulse-live { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
        @keyframes fadeIn { from { opacity: 0.95; } to { opacity: 1; } }
      `}</style>

      {/* ── Navigation ── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100, background: T.navy,
        padding: "0 16px", display: "flex", alignItems: "center", height: 44,
        borderBottom: `1px solid ${T.navySoft}`,
      }}>
        {/* Left: brand + live + date */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginRight: 16 }}>
          <span style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 700, color: "#fff", background: T.accent, padding: "4px 8px", borderRadius: 4, letterSpacing: ".5px" }}>NIL</span>
          <span style={{ fontFamily: T.mono, fontSize: 14, fontWeight: 400, color: "#fff", letterSpacing: "1.5px" }}>MONITOR</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 20 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.green, display: "inline-block", animation: "pulse-live 2s ease-in-out infinite" }} />
          <Mono style={{ fontSize: 11, fontWeight: 700, color: T.green, letterSpacing: ".5px" }}>LIVE</Mono>
        </div>
        <Mono style={{ fontSize: 12, color: "rgba(255,255,255,.65)" }}>
          {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          {lastRefresh && (() => {
            const mins = Math.floor((now - lastRefresh.getTime()) / 60000);
            return ` · Updated ${mins < 1 ? "just now" : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`}`;
          })()}
        </Mono>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Right: Resources dropdown + Info icon */}
        <div style={{ position: "relative" }}>
          <button
            onClick={e => { e.stopPropagation(); setShowResources(prev => !prev); }}
            style={{
              fontFamily: T.sans, fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.6)",
              background: "transparent", border: "none", cursor: "pointer",
              padding: "8px 12px", letterSpacing: ".3px",
            }}
          >Resources ▾</button>
          {showResources && (
            <div onClick={e => e.stopPropagation()} style={{
              position: "absolute", top: "100%", right: 0, marginTop: 4,
              background: T.navy, border: `1px solid ${T.navySoft}`,
              borderRadius: 4, padding: "4px 0", minWidth: 220, zIndex: 110,
              boxShadow: "0 8px 24px rgba(0,0,0,.4)",
            }}>
              {RESOURCES.map((r, i) => (
                <a key={i} href={r.href} target="_blank" rel="noopener noreferrer"
                  style={{
                    display: "block", padding: "8px 16px", textDecoration: "none",
                    fontFamily: T.mono, fontSize: 11, color: "rgba(255,255,255,.8)",
                    borderBottom: i < RESOURCES.length - 1 ? `1px solid ${T.navySoft}` : "none",
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = T.navySoft}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >{r.label}</a>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => setShowInfo(true)}
          title="About NIL Monitor"
          style={{
            fontFamily: T.sans, fontSize: 15, color: "rgba(255,255,255,.4)",
            background: "transparent", border: "none", cursor: "pointer",
            padding: "8px", marginLeft: 4,
          }}
        >&#9432;</button>
      </nav>

      {/* ── Dashboard ── */}
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "16px 16px 40px" }}>
        <MonitorPage onRefresh={setLastRefresh} />
      </main>

      {/* ── Info Modal ── */}
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
    </div>
  );
}
