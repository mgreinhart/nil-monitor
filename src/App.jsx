import { useState, useEffect, Fragment } from "react";
import { ComposableMap, Geographies, Geography, Marker, Line } from "react-simple-maps";
import stateNilData from "./nil-state-data.json";

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
  cases: [], // Cases populated by CSLT fetcher — no mock data
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
  { name: "One Question Leadership", id: "6QmP0ZLPAiEG7iqhywSURD" },
  { name: "The Standard", id: "30VL73UUR59yLZfagH1Rzv" },
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

const Panel = ({ title, accent, children, style, right, noPad, size, onHeaderClick }) => {
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
        <div
          onClick={onHeaderClick}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: isSm ? "8px 12px" : "8px 16px",
            borderBottom: `1px solid ${T.border}`,
            minHeight: isLg ? 36 : 32,
            cursor: onHeaderClick ? "pointer" : "default",
            userSelect: onHeaderClick ? "none" : "auto",
          }}
        >
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

// ── Live Embed Components ─────────────────────────────────────────

const X_LIST_ACCOUNTS = [
  { handle: "@PeteThamel", org: "ESPN" },
  { handle: "@RossDellenger", org: "Yahoo" },
  { handle: "@NicoleAuerbach", org: "Athletic" },
  { handle: "@D1ticker", org: "College Sports" },
  { handle: "@DarrenHeitner", org: "NIL Legal" },
  { handle: "@achristovichh", org: "FOS" },
  { handle: "@Sportico", org: "Sports Business" },
];

const XListEmbed = () => (
  <Panel title="Live NIL News Feed" accent={T.accent} size="sm">
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
      <div style={{ padding: "4px 0", borderBottom: `1px solid ${T.border}`, textAlign: "center" }}>
        <span style={{ fontFamily: T.sans, fontSize: 13, fontStyle: "italic", color: T.textDim }}>...and more</span>
      </div>
    </div>
    <div style={{ marginTop: 8, textAlign: "right" }}>
      <a href={X_LIST_URL} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
        <Mono style={{ fontSize: 12, fontWeight: 600, color: T.accent }}>Open on X →</Mono>
      </a>
    </div>
  </Panel>
);

const PodcastsSection = () => {
  const [podcastDates, setPodcastDates] = useState({});
  useEffect(() => {
    fetch("/api/podcasts").then(r => r.ok ? r.json() : []).then(data => {
      const dates = {};
      for (const p of data) {
        if (p.latest_date) dates[p.spotify_id] = new Date(p.latest_date).getTime();
      }
      setPodcastDates(dates);
    }).catch(() => {});
  }, []);
  const now = Date.now();
  const sorted = [...NIL_PODCASTS].sort((a, b) => {
    const aDate = podcastDates[a.id] || 0;
    const bDate = podcastDates[b.id] || 0;
    const aFresh = aDate && (now - aDate) < 48 * 3600000;
    const bFresh = bDate && (now - bDate) < 48 * 3600000;
    if (aFresh && !bFresh) return -1;
    if (!aFresh && bFresh) return 1;
    if (aFresh && bFresh) return bDate - aDate;
    return 0;
  });
  return (
    <Panel title="NIL Podcasts" accent={T.accent} size="sm" noPad>
      <div style={{ display: "flex", flexDirection: "column", gap: 0, padding: 4 }}>
        {sorted.map((p, i) => {
          const isFresh = podcastDates[p.id] && (now - podcastDates[p.id]) < 48 * 3600000;
          return (
            <div key={p.id} style={{
              borderBottom: i < sorted.length - 1 ? `1px solid ${T.border}` : "none",
              padding: "2px 0",
              borderLeft: isFresh ? `3px solid ${T.accent}` : "3px solid transparent",
              paddingLeft: 4,
            }}>
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
          );
        })}
      </div>
    </Panel>
  );
};

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

// ── State NIL Legislation Map ─────────────────────────────────────
const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const STATE_DATA_BY_NAME = Object.fromEntries(stateNilData.map(s => [s.name, s]));

// State label centroids (lon, lat) — manually adjusted for legibility
const STATE_LABELS = {
  "Alabama": [-86.8, 32.8, "AL"], "Alaska": [-153.5, 64.2, "AK"], "Arizona": [-111.7, 34.3, "AZ"],
  "Arkansas": [-92.4, 34.8, "AR"], "California": [-119.5, 37.2, "CA"], "Colorado": [-105.5, 39.0, "CO"],
  "Connecticut": [-72.7, 41.6, "CT"], "Delaware": [-75.5, 39.0, "DE"], "Florida": [-81.7, 28.7, "FL"],
  "Georgia": [-83.4, 32.7, "GA"], "Hawaii": [-155.5, 21.5, "HI"], "Idaho": [-114.5, 44.4, "ID"],
  "Illinois": [-89.2, 40.0, "IL"], "Indiana": [-86.2, 39.8, "IN"], "Iowa": [-93.5, 42.0, "IA"],
  "Kansas": [-98.3, 38.5, "KS"], "Kentucky": [-85.3, 37.8, "KY"], "Louisiana": [-92.0, 31.0, "LA"],
  "Maine": [-69.2, 45.4, "ME"], "Maryland": [-76.7, 39.0, "MD"], "Massachusetts": [-72.0, 42.3, "MA"],
  "Michigan": [-84.6, 44.3, "MI"], "Minnesota": [-94.3, 46.3, "MN"], "Mississippi": [-89.7, 32.7, "MS"],
  "Missouri": [-92.5, 38.4, "MO"], "Montana": [-109.6, 47.0, "MT"], "Nebraska": [-99.8, 41.5, "NE"],
  "Nevada": [-116.6, 39.3, "NV"], "New Hampshire": [-71.0, 43.5, "NH"], "New Jersey": [-74.4, 40.1, "NJ"],
  "New Mexico": [-106.0, 34.5, "NM"], "New York": [-75.5, 43.0, "NY"], "North Carolina": [-79.4, 35.5, "NC"],
  "North Dakota": [-100.5, 47.4, "ND"], "Ohio": [-82.8, 40.4, "OH"], "Oklahoma": [-97.5, 35.5, "OK"],
  "Oregon": [-120.5, 43.9, "OR"], "Pennsylvania": [-77.6, 41.0, "PA"], "Rhode Island": [-71.5, 41.7, "RI"],
  "South Carolina": [-80.9, 34.0, "SC"], "South Dakota": [-100.2, 44.4, "SD"], "Tennessee": [-86.3, 35.8, "TN"],
  "Texas": [-99.0, 31.5, "TX"], "Utah": [-111.7, 39.3, "UT"], "Vermont": [-73.2, 44.5, "VT"],
  "Virginia": [-79.4, 37.5, "VA"], "Washington": [-120.5, 47.4, "WA"], "West Virginia": [-80.6, 38.6, "WV"],
  "Wisconsin": [-89.8, 44.6, "WI"], "Wyoming": [-107.5, 43.0, "WY"],
};

// Callout states — too small/narrow for inline labels at full size
// Label offset positions; dot stays at STATE_LABELS centroid, leader line connects them
const CALLOUT_OFFSETS = {
  "Connecticut": [-67.5, 43.2],
  "Rhode Island": [-66.5, 41.7],
  "New Jersey": [-67.5, 40.3],
  "Maryland": [-67.5, 37.5],
  "Delaware": [-67.5, 36.0],
};

const parseSections = (summary) => {
  if (!summary || summary === "N/A.") return [];
  const lines = summary.split("\n");
  const sections = [];
  let current = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const isHeader = trimmed.length >= 10 && trimmed.length < 85
      && /^[A-Z]/.test(trimmed)
      && !/[.;,:]$/.test(trimmed)
      && !/; or$/.test(trimmed)
      && trimmed.split(/\s+/).length >= 2;
    if (isHeader) {
      current = { title: trimmed, content: [] };
      sections.push(current);
    } else if (current) {
      current.content.push(trimmed);
    } else {
      current = { title: "Overview", content: [trimmed] };
      sections.push(current);
    }
  }
  // Merge empty sections: fold their title into the next section as a lead-in
  const merged = [];
  for (let i = 0; i < sections.length; i++) {
    if (sections[i].content.length === 0 && i + 1 < sections.length) {
      sections[i + 1].content.unshift(sections[i + 1].title);
      sections[i + 1].title = sections[i].title;
    } else {
      merged.push(sections[i]);
    }
  }
  return merged;
};

const StateLegislationMap = () => {
  const [selected, setSelected] = useState(null);
  const enacted = stateNilData.filter(s => s.status === "enacted").length;
  const total = stateNilData.length;

  return (
    <Panel title="State NIL Legislation" accent={T.accent} noPad>
      <div style={{ padding: "12px 16px 0" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, background: T.accent, display: "inline-block" }} />
            <Mono style={{ fontSize: 11, color: T.textMid }}>Enacted ({enacted})</Mono>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 12, height: 12, borderRadius: 2, background: "#e2e5ec", display: "inline-block" }} />
            <Mono style={{ fontSize: 11, color: T.textMid }}>No Law ({total - enacted})</Mono>
          </div>
        </div>
      </div>
      <div style={{ padding: "0 8px", position: "relative" }}>
        <ComposableMap projection="geoAlbersUsa" style={{ width: "100%", height: "auto" }}>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const name = geo.properties.name;
                const stateData = STATE_DATA_BY_NAME[name];
                const isEnacted = stateData?.status === "enacted";
                const isSelected = selected?.name === name;
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onClick={() => setSelected(stateData || null)}
                    style={{
                      default: {
                        fill: isEnacted ? T.accent : "#e2e5ec",
                        stroke: "#fff",
                        strokeWidth: isSelected ? 1.5 : 0.5,
                        outline: "none",
                        cursor: "pointer",
                      },
                      hover: {
                        fill: isEnacted ? "#c4402a" : "#cbd5e1",
                        stroke: "#fff",
                        strokeWidth: 1,
                        outline: "none",
                        cursor: "pointer",
                      },
                      pressed: {
                        fill: isEnacted ? "#a83824" : "#94a3b8",
                        stroke: "#fff",
                        strokeWidth: 1.5,
                        outline: "none",
                      },
                    }}
                  />
                );
              })
            }
          </Geographies>
          {/* State abbreviation labels (inline — skip callout states) */}
          {Object.entries(STATE_LABELS).map(([name, [lon, lat, abbr]]) => {
            if (CALLOUT_OFFSETS[name]) return null;
            const stateData = STATE_DATA_BY_NAME[name];
            const isEnacted = stateData?.status === "enacted";
            return (
              <Marker key={abbr} coordinates={[lon, lat]}>
                <text
                  textAnchor="middle" dominantBaseline="central"
                  onClick={() => setSelected(stateData || null)}
                  style={{
                    fontFamily: T.mono, fontSize: 10, fontWeight: 700,
                    fill: isEnacted ? "#fff" : "#3d4a5c",
                    cursor: "pointer", pointerEvents: "all",
                  }}
                >{abbr}</text>
              </Marker>
            );
          })}
          {/* Callout labels for small states — dot + leader line + offset label */}
          {Object.entries(CALLOUT_OFFSETS).map(([name, [labelLon, labelLat]]) => {
            const [dotLon, dotLat, abbr] = STATE_LABELS[name];
            const stateData = STATE_DATA_BY_NAME[name];
            const isEnacted = stateData?.status === "enacted";
            return (
              <Fragment key={`callout-${abbr}`}>
                <Marker coordinates={[dotLon, dotLat]}>
                  <circle r={2} fill={isEnacted ? T.accent : "#94a3b8"} stroke="#fff" strokeWidth={0.5} />
                </Marker>
                <Line
                  from={[dotLon, dotLat]}
                  to={[labelLon, labelLat]}
                  stroke="#94a3b8"
                  strokeWidth={0.5}
                  strokeDasharray="2,2"
                />
                <Marker coordinates={[labelLon, labelLat]}>
                  <text
                    textAnchor="start" dominantBaseline="central"
                    onClick={() => setSelected(stateData || null)}
                    style={{
                      fontFamily: T.mono, fontSize: 10, fontWeight: 700,
                      fill: "#3d4a5c",
                      cursor: "pointer", pointerEvents: "all",
                    }}
                  >{abbr}</text>
                </Marker>
              </Fragment>
            );
          })}
          {/* DC callout — line from actual location to offset label */}
          <Line
            from={[-77.04, 38.91]}
            to={[-71.5, 39.5]}
            stroke="#94a3b8"
            strokeWidth={0.5}
            strokeDasharray="2,2"
          />
          <Marker coordinates={[-71.5, 39.5]}>
            <g onClick={() => setSelected(STATE_DATA_BY_NAME["District of Columbia"])} style={{ cursor: "pointer" }}>
              <rect
                x={-28} y={-14} width={56} height={28} rx={4}
                fill={selected?.name === "District of Columbia" ? "#c4402a" : "#fff"}
                stroke={selected?.name === "District of Columbia" ? "#c4402a" : "#94a3b8"}
                strokeWidth={0.75}
              />
              <circle cx={-14} cy={0} r={4} fill={T.accent} />
              <text
                x={0} y={1} textAnchor="start" dominantBaseline="middle"
                style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 700, fill: selected?.name === "District of Columbia" ? "#fff" : "#3d4a5c" }}
              >DC</text>
            </g>
          </Marker>
          <Marker coordinates={[-77.04, 38.91]}>
            <circle r={2} fill={T.accent} stroke="#fff" strokeWidth={0.5} />
          </Marker>
        </ComposableMap>
        {/* State detail overlay — centered on map */}
        {selected && (
          <>
            <style>{`@keyframes stateOverlayIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }`}</style>
            <div
              onClick={() => setSelected(null)}
              style={{
                position: "absolute", inset: 0, zIndex: 10,
                background: "rgba(15,23,41,0.08)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <div
                onClick={e => e.stopPropagation()}
                style={{
                  background: "#fff",
                  borderRadius: 8,
                  boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
                  maxWidth: 480,
                  width: "calc(100% - 32px)",
                  maxHeight: "70%",
                  overflowY: "auto",
                  padding: 20,
                  animation: "stateOverlayIn 150ms ease",
                }}
              >
                {/* Header: name + badge + close */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <strong style={{ fontFamily: T.sans, fontSize: 20, fontWeight: 700, color: T.text }}>{selected.name}</strong>
                    <Mono style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: selected.status === "enacted" ? T.accent : T.textDim, padding: "2px 8px", borderRadius: 3 }}>
                      {selected.status === "enacted" ? "ENACTED" : "NO LAW"}
                    </Mono>
                  </div>
                  <button onClick={() => setSelected(null)} style={{ fontFamily: T.mono, fontSize: 18, color: T.textDim, background: "transparent", border: "none", cursor: "pointer", padding: "0 4px", lineHeight: 1 }}>&times;</button>
                </div>
                {/* Dates */}
                {selected.statusDetail && selected.statusDetail !== "None." && (
                  <Mono style={{ fontSize: 12, color: T.textDim, lineHeight: 1.5, display: "block", marginBottom: 12 }}>{selected.statusDetail}</Mono>
                )}
                {/* Provision sections — all expanded */}
                {selected.summary && selected.summary !== "N/A." ? (
                  <>
                    <div style={{ height: 1, background: T.border, marginBottom: 14 }} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {parseSections(selected.summary).map((sec, i) => (
                        <div key={i}>
                          <div style={{ fontFamily: T.sans, fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 4 }}>{sec.title}</div>
                          {sec.content.length > 0 && (
                            <div style={{ fontFamily: T.sans, fontSize: 12.5, color: T.textMid, lineHeight: 1.6 }}>
                              {sec.content.map((line, j) => <div key={j} style={{ marginBottom: 2 }}>{line}</div>)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : selected.status !== "enacted" ? (
                  <Mono style={{ fontSize: 12, color: T.textDim, marginTop: 4 }}>No NIL legislation enacted.</Mono>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>
      <div style={{ padding: "8px 16px", borderTop: `1px solid ${T.border}` }}>
        <Mono style={{ fontSize: 10, color: T.textDim }}>
          Source: Troutman Pepper — State & Federal NIL Legislation Tracker (Feb 2026)
        </Mono>
      </div>
    </Panel>
  );
};

// ╔═══════════════════════════════════════════════════════════════════
//  MONITOR PAGE — The Dashboard (live from D1, falls back to mock)
// ╚═══════════════════════════════════════════════════════════════════
const MonitorPage = ({ onRefresh }) => {
  const [expCase, setExpCase] = useState(null);
  const [recentOpen, setRecentOpen] = useState(false);
  const [courtroomOpen, setCourtroomOpen] = useState(true);
  const [headlineCatFilt, setHeadlineCatFilt] = useState("All");
  const [hlPage, setHlPage] = useState(0);
  const [briefingOpen, setBriefingOpen] = useState(null);

  // Live data state
  const [briefing, setBriefing] = useState(null);
  const [briefingGeneratedAt, setBriefingGeneratedAt] = useState(null);
  const [cases, setCases] = useState(null);
  const [headlines, setHeadlines] = useState(null);
  const [gdeltVolume, setGdeltVolume] = useState(null);
  const [keyDates, setKeyDates] = useState(null);

  const fetchHeadlines = () => {
    fetch("/api/headlines?limit=100").then(r => r.ok ? r.json() : null).then(d => {
      if (d) { setHeadlines(d); onRefresh?.(new Date()); }
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
    fetch("/api/gdelt-volume").then(r => r.ok ? r.json() : null).then(d => {
      if (d) setGdeltVolume(d);
    }).catch(() => {});
    fetch("/api/cslt-key-dates").then(r => r.ok ? r.json() : null).then(d => {
      if (d) setKeyDates(d);
    }).catch(() => {});
    fetchHeadlines();

    // Auto-refresh headlines every 2 minutes
    const id = setInterval(fetchHeadlines, 120000);
    return () => clearInterval(id);
  }, []);

  // Tier-based case filtering: Key Dates (Tier 1) handled separately via API.
  // Tier 2: recent activity (last 30 days), no upcoming action.
  // Tier 3+: everything else — don't show, link to CSLT.
  const { recentActivity, totalTracked } = (() => {
    if (!cases?.length) return { recentActivity: [], totalTracked: 0 };
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

    const parsed = cases.map(c => {
      let upcomingParsed = [], soonest = null;
      if (c.upcoming_dates) {
        try {
          upcomingParsed = JSON.parse(c.upcoming_dates);
          const future = upcomingParsed
            .filter(d => d.date && new Date(d.date) >= now)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
          soonest = future[0] || null;
        } catch {}
      }
      return { ...c, upcomingParsed, soonest };
    });

    // Deduplicate by case name — keep the row with most recent activity
    const deduped = new Map();
    for (const c of parsed) {
      const key = c.name.toLowerCase().trim();
      const existing = deduped.get(key);
      if (!existing) { deduped.set(key, c); continue; }
      const eDateA = existing.soonest ? new Date(existing.soonest.date) : null;
      const eDateB = c.soonest ? new Date(c.soonest.date) : null;
      if (eDateB && (!eDateA || eDateB < eDateA)) { deduped.set(key, c); continue; }
      if (eDateA && !eDateB) continue;
      const aLast = existing.last_event_date ? new Date(existing.last_event_date) : new Date(0);
      const bLast = c.last_event_date ? new Date(c.last_event_date) : new Date(0);
      if (bLast > aLast) deduped.set(key, c);
    }

    const recent = [];
    let total = 0;

    for (const c of deduped.values()) {
      const g = c.case_group || "Other";
      // Remove archived completely — no count, no link
      if (c.is_active === 0 || c.is_active === '0' || /archived|dismissed|resolved|withdrawn/i.test(g)) continue;

      total++;
      const lastDate = c.last_event_date ? new Date(c.last_event_date) : null;

      // Remove: >6 months stale with no upcoming, or no date info at all
      if (!c.soonest && (!lastDate || lastDate < sixMonthsAgo)) continue;

      // Tier 2: activity in last 30 days, no upcoming action
      if (!c.soonest && lastDate && lastDate >= thirtyDaysAgo) {
        recent.push(c);
      }
      // Everything else (including cases with upcoming dates) → Tier 3, not shown
    }

    // Sort Tier 2 by most recent activity first
    recent.sort((a, b) => {
      const aLast = a.last_event_date ? new Date(a.last_event_date) : new Date(0);
      const bLast = b.last_event_date ? new Date(b.last_event_date) : new Date(0);
      return bLast - aLast;
    });

    return { recentActivity: recent, totalTracked: total };
  })();

  // Briefing: API or mock
  const briefingSource = briefing || MOCK.briefing.map(([headline, body]) => ({ headline, body }));

  // Briefing defaults to all expanded; null = user hasn't interacted
  const briefingExpanded = briefingOpen ?? new Set(briefingSource.map((_, i) => i));

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
                  style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: i === 0 ? "0 0 10px 0" : "10px 0", cursor: "pointer" }}
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
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
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
          <div style={{ display: "flex", gap: 8, flexWrap: "nowrap", padding: "4px 16px", borderBottom: `1px solid ${T.borderLight}` }}>
            {[
              ["All", "All"], ["Legislation", "Legislation"], ["Litigation", "Litigation"],
              ["NCAA Governance", "Governance"], ["CSC / Enforcement", "CSC"],
              ["Revenue Sharing", "Rev. Share"], ["Roster / Portal", "Portal"], ["Realignment", "Realignment"],
            ].map(([val, label]) => (
              <Pill key={val} active={headlineCatFilt === val} onClick={() => { setHeadlineCatFilt(val); setHlPage(0); }}>{label}</Pill>
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
              <Mono style={{ flex: "0 0 96px", fontSize: 12, fontWeight: 600, color: T.textDim, textTransform: "uppercase", letterSpacing: ".3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.src}</Mono>
              <div style={{ flex: 1, fontFamily: T.sans, fontSize: 15, fontWeight: h.sev === "critical" ? 600 : 500, color: T.text, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.title}</div>
              {h.isNew && <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: "#fff", background: T.green, padding: "2px 6px", borderRadius: 3, letterSpacing: ".5px", flexShrink: 0, textTransform: "uppercase", lineHeight: 1.3 }}>NEW</span>}
              <Mono style={{ flex: "0 0 48px", fontSize: 12, color: T.textDim, textAlign: "right" }}>{h.time}</Mono>
            </a>
          ))}
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, padding: "8px 16px", borderTop: `1px solid ${T.borderLight}` }}>
            <button onClick={() => setHlPage(hlPageClamped - 1)} disabled={hlPageClamped === 0} style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 600, color: hlPageClamped > 0 ? T.accent : T.borderLight, background: "transparent", border: "none", cursor: hlPageClamped > 0 ? "pointer" : "default" }}>← Prev</button>
            <Mono style={{ fontSize: 12, color: T.textDim }}>{hlPageClamped + 1} of {hlTotalPages}</Mono>
            <button onClick={() => setHlPage(hlPageClamped + 1)} disabled={hlPageClamped >= hlTotalPages - 1} style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 600, color: hlPageClamped < hlTotalPages - 1 ? T.accent : T.borderLight, background: "transparent", border: "none", cursor: hlPageClamped < hlTotalPages - 1 ? "pointer" : "default" }}>Next →</button>
          </div>
        </Panel>

        {/* ══════════════════════════════════════════════════════════
            BELOW THE FOLD — Detail Sections
           ══════════════════════════════════════════════════════════ */}

        {/* ── State NIL Legislation Map ── */}
        <StateLegislationMap />

        {/* ── Litigation ── */}
        <Panel
          title="The Courtroom"
          accent={T.accent}
          noPad
          onHeaderClick={() => setCourtroomOpen(o => !o)}
          right={
            <Mono style={{ fontSize: 11, color: T.textDim, fontWeight: 400 }}>
              {cases?.length || 0} tracked cases &middot; Source: <a href="https://www.collegesportslitigationtracker.com/tracker" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: T.textDim, textDecoration: "none" }}>CSLT</a>
            </Mono>
          }
        >
          {!courtroomOpen ? null : <>
          <div style={{ padding: "6px 16px 2px", borderBottom: `1px solid ${T.borderLight}` }}>
            <Mono style={{ fontSize: 9, color: T.textDim, letterSpacing: "0.3px" }}>
              <span style={{ color: T.accent }}>Coral dates</span> = upcoming actions &middot; <span style={{ color: T.textDim }}>Gray dates</span> = last activity
            </Mono>
          </div>
          {/* ── KEY DATES (curated by CSLT) ── */}
          <div style={{ borderBottom: `1px solid ${T.border}` }}>
            <div style={{ padding: "10px 16px 4px" }}>
              <Mono style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1px", color: T.textDim, textTransform: "uppercase" }}>
                Key Dates{keyDates?.[0]?.month ? ` · ${keyDates[0].month}` : ""}
              </Mono>
            </div>
            {keyDates && keyDates.length > 0 ? keyDates.map((d, i) => {
              const isPast = d.date < new Date().toISOString().split("T")[0];
              return (
                <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "4px 16px", opacity: isPast ? 0.5 : 1 }}>
                  <Mono style={{ fontSize: 13, fontWeight: 600, color: isPast ? T.textDim : T.accent, flexShrink: 0, width: 48 }}>
                    {formatDate(d.date)}
                  </Mono>
                  <strong style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 700, color: isPast ? T.textDim : T.text, flexShrink: 0 }}>{d.case_name}</strong>
                  <Mono style={{ fontSize: 12, color: isPast ? T.textDim : T.textMid, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>&middot; {d.description}</Mono>
                </div>
              );
            }) : (
              <div style={{ padding: "6px 16px 8px" }}>
                <a href="https://www.collegesportslitigationtracker.com/" target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                  <Mono style={{ fontSize: 12, fontWeight: 600, color: T.accent }}>View key dates on CSLT →</Mono>
                </a>
              </div>
            )}
          </div>
          {/* ── TIER 2: RECENT ACTIVITY (collapsed by default) ── */}
          {recentActivity.length > 0 && (
            <div style={{ borderBottom: `1px solid ${T.border}` }}>
              <div
                onClick={() => setRecentOpen(o => !o)}
                style={{ padding: "10px 16px 6px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = T.surfaceAlt}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <Mono style={{ fontSize: 11, color: T.textDim, transition: "transform .15s", transform: recentOpen ? "rotate(90deg)" : "none" }}>▸</Mono>
                <Mono style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1px", color: T.textDim, textTransform: "uppercase" }}>
                  Recent Activity <span style={{ fontWeight: 400 }}>({recentActivity.length} case{recentActivity.length !== 1 ? "s" : ""})</span>
                </Mono>
              </div>
              {recentOpen && recentActivity.map((c) => {
                const isOpen = expCase === c.id;
                const eventSnippet = c.last_event_text
                  ? (c.last_event_text.length > 80 ? c.last_event_text.slice(0, 80) + "..." : c.last_event_text)
                  : "";
                const descSnippet = c.description
                  ? (c.description.length > 80 ? c.description.slice(0, 80) + "..." : c.description)
                  : "";
                return (
                  <div key={c.id} style={{ borderBottom: `1px solid ${T.borderLight}` }}>
                    <div
                      onClick={() => setExpCase(isOpen ? null : c.id)}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 16px", cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = T.surfaceAlt}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <Mono style={{ fontSize: 11, color: T.textDim, transition: "transform .15s", transform: isOpen ? "rotate(90deg)" : "none", flexShrink: 0 }}>▸</Mono>
                      <strong style={{ fontFamily: T.sans, fontSize: 15, fontWeight: 700, color: T.text, flexShrink: 0 }}>{c.name}</strong>
                      {eventSnippet && <Mono style={{ fontSize: 12, color: T.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>&nbsp;· {eventSnippet}</Mono>}
                      <div style={{ flex: 1 }} />
                      {c.last_event_date && (
                        <Mono style={{ fontSize: 13, color: T.textDim, flexShrink: 0, whiteSpace: "nowrap" }}>Last: {formatDate(c.last_event_date)}</Mono>
                      )}
                    </div>
                    <div style={{
                      maxHeight: isOpen ? 500 : 0, overflow: "hidden",
                      transition: "max-height .2s ease, opacity .2s ease",
                      opacity: isOpen ? 1 : 0,
                    }}>
                      <div style={{ padding: "8px 16px 12px 24px" }}>
                        <Mono style={{ fontSize: 12, color: T.textDim, marginBottom: 8, display: "block" }}>
                          {[c.court, c.judge && `Judge ${c.judge}`, c.case_number, c.filed_date].filter(Boolean).join(" · ")}
                        </Mono>
                        {descSnippet && <div style={{ fontFamily: T.sans, fontSize: 13, color: T.textMid, lineHeight: 1.5, marginBottom: 8 }}>{descSnippet}</div>}
                        {c.cslt_url && (
                          <a href={c.cslt_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ textDecoration: "none" }}>
                            <Mono style={{ fontSize: 12, fontWeight: 600, color: T.accent }}>Full case detail →</Mono>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {/* ── TIER 3: Everything else — link out ── */}
          {totalTracked > 0 && (
            <div style={{ padding: "8px 16px" }}>
              <Mono style={{ fontSize: 12, color: T.textDim }}>
                <a href="https://www.collegesportslitigationtracker.com/tracker" target="_blank" rel="noopener noreferrer" style={{ color: T.accent, textDecoration: "none", fontFamily: T.mono }}>View all {totalTracked} cases on College Sports Litigation Tracker →</a>
              </Mono>
            </div>
          )}
          </>}
        </Panel>

        {/* ── Outside View ── */}
        <Panel title="The Outside View" accent={T.textDim} size="sm">
          <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 24 }}>
            {/* Left: GDELT News Volume Chart */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <Mono style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1px", color: T.textDim, textTransform: "uppercase" }}>News Volume · 30 Days</Mono>
                {gdeltVolume?.total > 0 && (
                  <Mono style={{ fontSize: 11, color: T.textMid }}>{gdeltVolume.total.toLocaleString()} articles · avg {gdeltVolume.avg}/day</Mono>
                )}
              </div>
              {(() => {
                const pts = gdeltVolume?.data || [];
                if (pts.length === 0) return (
                  <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Mono style={{ fontSize: 12, color: T.textDim }}>{gdeltVolume ? "No volume data available" : "Loading..."}</Mono>
                  </div>
                );
                const W = 500, H = 120, PX = 0, PY = 8;
                const max = Math.max(...pts.map(p => p.count), 1);
                const xStep = (W - PX * 2) / (pts.length - 1 || 1);
                const yScale = (v) => PY + (H - PY * 2) * (1 - v / max);
                const linePoints = pts.map((p, i) => `${PX + i * xStep},${yScale(p.count)}`).join(" ");
                const areaPath = `M${PX},${H - PY} ` + pts.map((p, i) => `L${PX + i * xStep},${yScale(p.count)}`).join(" ") + ` L${PX + (pts.length - 1) * xStep},${H - PY} Z`;
                const midIdx = Math.floor(pts.length / 2);
                const fmtLabel = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
                return (
                  <div>
                    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 120, display: "block" }}>
                      <defs>
                        <linearGradient id="gdelt-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={T.accent} stopOpacity="0.15" />
                          <stop offset="100%" stopColor={T.accent} stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d={areaPath} fill="url(#gdelt-fill)" />
                      <polyline points={linePoints} fill="none" stroke={T.accent} strokeOpacity="0.4" strokeWidth="1.5" strokeLinejoin="round" />
                    </svg>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                      <Mono style={{ fontSize: 11, color: T.textDim }}>{fmtLabel(pts[0].date)}</Mono>
                      <Mono style={{ fontSize: 11, color: T.textDim }}>{fmtLabel(pts[midIdx].date)}</Mono>
                      <Mono style={{ fontSize: 11, color: T.textDim }}>{fmtLabel(pts[pts.length - 1].date)}</Mono>
                    </div>
                  </div>
                );
              })()}
              <Mono style={{ fontSize: 10, color: T.textDim, marginTop: 6, display: "block" }}>
                Articles mentioning NIL, NCAA, transfer portal across global media · GDELT
              </Mono>
            </div>
            {/* Right: Resources */}
            <div>
              <Mono style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1px", color: T.textDim, textTransform: "uppercase", marginBottom: 10, display: "block" }}>Resources</Mono>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { label: "College Sports Litigation Tracker", href: "https://www.collegesportslitigationtracker.com" },
                  { label: "Troutman Pepper NIL Tracker", href: "https://www.troutman.com/state-and-federal-nil-legislation-tracker/" },
                  { label: "NIL Revolution Blog", href: "https://www.nilrevolution.com" },
                  { label: "Saul Ewing NIL State Tracker", href: "https://www.saul.com/nil" },
                  { label: "CourtListener", href: "https://www.courtlistener.com" },
                  { label: "NIL Monitor X List", href: X_LIST_URL },
                ].map((r, i) => (
                  <a key={i} href={r.href} target="_blank" rel="noopener noreferrer"
                    style={{ textDecoration: "none", fontFamily: T.mono, fontSize: 13, color: T.textDim, display: "flex", alignItems: "center", gap: 6 }}
                    onMouseEnter={e => { e.currentTarget.style.color = T.accent; }}
                    onMouseLeave={e => { e.currentTarget.style.color = T.textDim; }}
                  >
                    <span style={{ color: T.accent }}>→</span> {r.label}
                  </a>
                ))}
              </div>
              <Mono style={{ fontSize: 10, color: T.textDim, marginTop: 12, display: "block" }}>
                Data sources for this dashboard
              </Mono>
            </div>
          </div>
        </Panel>
      </div>

      {/* ══ SIDEBAR ══ */}
      <div style={{ flex: "0 0 280px", display: "flex", flexDirection: "column", gap: 8, position: "sticky", top: 52 }}>
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
  const [showInfo, setShowInfo] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [now, setNow] = useState(Date.now());

  // Tick every 60s so "Updated X min ago" stays fresh
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

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
