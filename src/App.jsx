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
  "Business / Finance": "#f97316",
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
  { name: "SBJ Morning Buzzcast", id: "0NOi7MnlTRMfb3Dv17DOaP" },
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
  <button onClick={onClick} className="pill" style={{
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
            <div style={{ width: isLg ? 5 : isSm ? 3 : 4, height: isLg ? 20 : 16, borderRadius: 2, background: ac, flexShrink: 0 }} />
            <Mono style={{ fontSize: isLg ? 19 : isSm ? 16 : 19, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: ac }}>{title}</Mono>
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
    const aFresh = aDate && (now - aDate) < 24 * 3600000;
    const bFresh = bDate && (now - bDate) < 24 * 3600000;
    if (aFresh && !bFresh) return -1;
    if (!aFresh && bFresh) return 1;
    return bDate - aDate;
  });
  return (
    <Panel title="NIL Podcasts" accent={T.accent} size="sm" noPad>
      <div style={{ display: "flex", flexDirection: "column", gap: 0, padding: 4 }}>
        {sorted.map((p, i) => {
          const isFresh = podcastDates[p.id] && (now - podcastDates[p.id]) < 24 * 3600000;
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
  return !isNaN(diff) && diff >= 0 && diff < 10800000;
};

// ── State NIL Legislation Map ─────────────────────────────────────
const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";
const STATE_DATA_BY_NAME = Object.fromEntries(stateNilData.map(s => [s.name, s]));

// State label positions (lon, lat) — manually adjusted for legibility
// Small NE states: labels placed adjacent/outside the state, no leader lines
const STATE_LABELS = {
  "Alabama": [-86.8, 32.8, "AL"], "Alaska": [-153.5, 64.2, "AK"], "Arizona": [-111.7, 34.3, "AZ"],
  "Arkansas": [-92.4, 34.8, "AR"], "California": [-119.5, 37.2, "CA"], "Colorado": [-105.5, 39.0, "CO"],
  "Connecticut": [-72.7, 41.6, "CT"],
  "Delaware": [-75.0, 38.7, "DE", "start", 0.5],
  "Florida": [-81.7, 28.7, "FL"],
  "Georgia": [-83.4, 32.7, "GA"], "Hawaii": [-155.5, 21.5, "HI"], "Idaho": [-114.5, 43.3, "ID"],
  "Illinois": [-89.2, 40.0, "IL"], "Indiana": [-86.2, 39.8, "IN"], "Iowa": [-93.5, 42.0, "IA"],
  "Kansas": [-98.3, 38.5, "KS"], "Kentucky": [-85.3, 37.8, "KY"], "Louisiana": [-92.5, 31.2, "LA"],
  "Maine": [-69.2, 45.4, "ME"],
  "Maryland": [-76.7, 39.0, "MD", "middle", 0, 9],
  "Massachusetts": [-70.5, 42.3, "MA", "start", 0.3],
  "Michigan": [-84.6, 43.3, "MI"], "Minnesota": [-94.3, 46.3, "MN"], "Mississippi": [-89.7, 32.7, "MS"],
  "Missouri": [-92.5, 38.4, "MO"], "Montana": [-109.6, 47.0, "MT"], "Nebraska": [-99.8, 41.5, "NE"],
  "Nevada": [-116.6, 39.3, "NV"],
  "New Hampshire": [-71.5, 43.8, "NH"],
  "New Jersey": [-74.4, 40.1, "NJ", "middle", 0, 9],
  "New Mexico": [-106.0, 34.5, "NM"], "New York": [-75.5, 43.0, "NY"], "North Carolina": [-79.4, 35.5, "NC"],
  "North Dakota": [-100.5, 47.4, "ND"], "Ohio": [-82.8, 40.4, "OH"], "Oklahoma": [-97.5, 35.5, "OK"],
  "Oregon": [-120.5, 43.9, "OR"], "Pennsylvania": [-77.6, 41.0, "PA"],
  "Rhode Island": [-71.6, 41.0, "RI", "start", 0.3],
  "South Carolina": [-80.9, 34.0, "SC"], "South Dakota": [-100.2, 44.4, "SD"], "Tennessee": [-86.3, 35.8, "TN"],
  "Texas": [-99.0, 31.5, "TX"], "Utah": [-111.7, 39.3, "UT"],
  "Vermont": [-72.6, 44.2, "VT"],
  "Virginia": [-79.4, 37.5, "VA"], "Washington": [-120.5, 47.4, "WA"], "West Virginia": [-80.6, 38.6, "WV"],
  "Wisconsin": [-89.8, 44.6, "WI"], "Wyoming": [-107.5, 43.0, "WY"],
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
          {/* State abbreviation labels — all states, no callout lines */}
          {Object.entries(STATE_LABELS).map(([name, entry]) => {
            const [lon, lat, abbr, anchor, dx, customSize] = entry;
            const stateData = STATE_DATA_BY_NAME[name];
            const isEnacted = stateData?.status === "enacted";
            const textAnchor = anchor || "middle";
            // Outside-placed labels (anchor="start") use dark color always for visibility
            const fill = (anchor && anchor !== "middle") || customSize ? "#3d4a5c" : (isEnacted ? "#fff" : "#3d4a5c");
            return (
              <Marker key={abbr} coordinates={[lon, lat]}>
                <text
                  textAnchor={textAnchor} dominantBaseline="central"
                  dx={dx || 0}
                  onClick={() => setSelected(stateData || null)}
                  style={{
                    fontFamily: T.mono, fontSize: customSize || 10, fontWeight: 700,
                    fill,
                    cursor: "pointer", pointerEvents: "all",
                  }}
                >{abbr}</text>
              </Marker>
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
const MonitorPage = ({ onRefresh, isMobile }) => {
  const [showAllTimeline, setShowAllTimeline] = useState(false);
  const [expCase, setExpCase] = useState(null);
  const [courtroomOpen, setCourtroomOpen] = useState(true);
  const [headlineCatFilt, setHeadlineCatFilt] = useState("All");
  const [hlPage, setHlPage] = useState(0);
  const [briefingRevealed, setBriefingRevealed] = useState(false);
  const [briefingAnimating, setBriefingAnimating] = useState(false);
  const [briefingCollapsing, setBriefingCollapsing] = useState(false);

  // Live data state
  const [briefing, setBriefing] = useState(null);
  const [briefingGeneratedAt, setBriefingGeneratedAt] = useState(null);
  const [briefingDate, setBriefingDate] = useState(null);
  const [cases, setCases] = useState(null);
  const [headlines, setHeadlines] = useState(null);
  const [gdeltVolume, setGdeltVolume] = useState(null);
  const [keyDates, setKeyDates] = useState(null);
  const [coverageIntel, setCoverageIntel] = useState(null);
  const [chartRange, setChartRange] = useState(7);
  const [hoverDay, setHoverDay] = useState(null);
  const [peDeals, setPeDeals] = useState([]);

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
        if (d.date) setBriefingDate(d.date);
      }
    }).catch(() => {});
    fetch("/api/cases").then(r => r.ok ? r.json() : null).then(d => {
      if (d?.length) setCases(d);
    }).catch(() => {});
    fetch("/api/gdelt-volume").then(r => r.ok ? r.json() : null).then(d => {
      if (d) setGdeltVolume(d);
    }).catch(() => {});
    fetch("/api/coverage-intel").then(r => r.ok ? r.json() : null).then(d => {
      if (d) setCoverageIntel(d);
    }).catch(() => {});
    fetch("/api/cslt-key-dates").then(r => r.ok ? r.json() : null).then(d => {
      if (d) setKeyDates(d);
    }).catch(() => {});
    fetch("/api/pe-tracker").then(r => r.ok ? r.json() : []).then(d => {
      if (d) setPeDeals(d);
    }).catch(() => {});
    fetchHeadlines();

    // Auto-refresh headlines every 2 minutes
    const id = setInterval(fetchHeadlines, 120000);
    return () => clearInterval(id);
  }, []);

  // Case filtering: extract upcoming dates + recent activity from cases data.
  const { recentActivity, upcomingCaseDates, totalTracked } = (() => {
    if (!cases?.length) return { recentActivity: [], upcomingCaseDates: [], totalTracked: 0 };
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
    const upcoming = [];
    let total = 0;

    for (const c of deduped.values()) {
      const g = c.case_group || "Other";
      if (c.is_active === 0 || c.is_active === '0' || /archived|dismissed|resolved|withdrawn/i.test(g)) continue;

      total++;
      const lastDate = c.last_event_date ? new Date(c.last_event_date) : null;

      // Collect nearest upcoming date per case
      if (c.soonest) {
        upcoming.push({ name: c.name, date: c.soonest.date, detail: c.soonest.text, caseData: c });
      }

      if (!c.soonest && (!lastDate || lastDate < sixMonthsAgo)) continue;
      if (lastDate && lastDate >= thirtyDaysAgo) {
        recent.push(c);
      }
    }

    recent.sort((a, b) => {
      const aLast = a.last_event_date ? new Date(a.last_event_date) : new Date(0);
      const bLast = b.last_event_date ? new Date(b.last_event_date) : new Date(0);
      return bLast - aLast;
    });

    // Sort upcoming by nearest date first
    upcoming.sort((a, b) => new Date(a.date) - new Date(b.date));

    return { recentActivity: recent, upcomingCaseDates: upcoming, totalTracked: total };
  })();

  // Briefing: API or mock
  const briefingSource = briefing || MOCK.briefing.map(([headline, body]) => ({ headline, body }));


  // Headlines: normalize, filter off-topic, deduplicate
  const hlRaw = headlines ? headlines
    .filter(h => h.category !== "Off-Topic")
    .map(h => ({
      src: h.source, title: h.title, cat: h.category, sev: h.severity,
      subCat: h.sub_category, time: timeAgo(h.published_at), url: h.url,
      isNew: isWithinHour(h.published_at),
    })) : MOCK.headlines;
  // Deduplicate: fuzzy title match, keep first (most recent) occurrence
  const hlSource = (() => {
    const kept = [];
    const normalize = t => (t || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2);
    for (const h of hlRaw) {
      const words = new Set(normalize(h.title));
      const isDupe = kept.some(k => {
        const kw = new Set(normalize(k.title));
        if (words.size === 0 || kw.size === 0) return false;
        const overlap = [...words].filter(w => kw.has(w)).length;
        return overlap / Math.min(words.size, kw.size) > 0.6;
      });
      if (!isDupe) kept.push(h);
    }
    return kept;
  })();
  const hlFiltered = hlSource.filter(h => headlineCatFilt === "All" || h.cat === headlineCatFilt);
  const HL_PER_PAGE = 8;
  const hlTotalPages = Math.max(1, Math.ceil(hlFiltered.length / HL_PER_PAGE));
  const hlPageClamped = Math.min(hlPage, hlTotalPages - 1);
  const hlPageItems = hlFiltered.slice(hlPageClamped * HL_PER_PAGE, (hlPageClamped + 1) * HL_PER_PAGE);

  return (
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 12, alignItems: "flex-start" }}>
      {/* ══ MAIN COLUMN ══ */}
      <div style={{ flex: 1, minWidth: 0, width: isMobile ? "100%" : "auto", display: "flex", flexDirection: "column", gap: 8 }}>

        {/* ══════════════════════════════════════════════════════════
            ABOVE THE FOLD — Briefing + Headlines (stacked)
           ══════════════════════════════════════════════════════════ */}

        {/* ── Briefing (premium branded panel, collapsed by default) ── */}
        {(() => {
          // Compute header parts
          let headerMonth = "", headerDay = "", headerPeriod = "AM", isStale = false;
          if (briefingGeneratedAt) {
            const n = briefingGeneratedAt.includes("T") ? briefingGeneratedAt : briefingGeneratedAt.replace(" ", "T") + "Z";
            const d = new Date(n);
            headerMonth = d.toLocaleString("en-US", { month: "short", timeZone: "America/New_York" }).toUpperCase();
            headerDay = d.toLocaleString("en-US", { day: "numeric", timeZone: "America/New_York" });
            const hour = parseInt(d.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" }));
            headerPeriod = hour < 12 ? "AM" : "PM";
            const todayET = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
            isStale = briefingDate && briefingDate !== todayET;
          }
          const handleExpand = () => {
            if (briefingAnimating || briefingCollapsing) return;
            setBriefingRevealed(true);
            setBriefingAnimating(true);
            setTimeout(() => setBriefingAnimating(false), briefingSource.length * 80 + 200);
          };
          const handleCollapse = () => {
            if (briefingAnimating || briefingCollapsing) return;
            setBriefingCollapsing(true);
            setTimeout(() => { setBriefingRevealed(false); setBriefingCollapsing(false); }, 150);
          };
          return (
            <div
              onClick={() => {
                if (briefingRevealed) handleCollapse();
                else handleExpand();
              }}
              style={{
                background: T.briefingBg,
                border: `1.5px solid ${T.accent}`,
                borderRadius: T.radius,
                overflow: "hidden",
                boxShadow: "0 2px 8px rgba(0,0,0,.08)",
                animation: "fadeIn 0.3s ease-in",
                cursor: "pointer",
              }}>
              {/* ── Branded header ── */}
              <div
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  padding: "14px 14px 10px",
                  borderBottom: `1px solid ${T.border}`,
                  userSelect: "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "nowrap" }}>
                  <span style={{ fontFamily: T.mono, fontSize: 16, fontWeight: 700, color: "#fff", background: T.accent, padding: "5px 10px", borderRadius: 4, letterSpacing: ".5px", flexShrink: 0, lineHeight: 1.3 }}>NIL</span>
                  <Mono style={{ fontSize: 21, fontWeight: 400, letterSpacing: "1.5px", color: T.text }}>
                    MONITOR
                    {briefingGeneratedAt && <>{" \u00B7 "}{headerMonth} {headerDay}{" \u00B7 "}{headerPeriod}</>}
                    {" "}NEWS BRIEF
                    {isStale && <span style={{ color: T.textDim }}>{" \u00B7 "}Latest available</span>}
                  </Mono>
                </div>
                <Mono style={{ fontSize: 18, fontWeight: 700, color: T.accent, letterSpacing: ".5px", marginTop: 6 }}>
                  {briefingRevealed ? "CLICK TO COLLAPSE" : "CLICK TO EXPAND"}
                </Mono>
              </div>
              {/* ── Panel body ── */}
              <div style={{ padding: "6px 14px 14px" }}>
                {/* ── Collapsed: short titles + Read briefing button ── */}
                {!briefingRevealed && (
                  <div>
                    <div style={{ paddingLeft: 6, marginTop: -2 }}>
                      {briefingSource.map((s, i) => (
                        <div key={i} style={{ fontFamily: T.sans, fontSize: 22, fontWeight: 600, lineHeight: 1.4, color: T.text, padding: "2px 0" }}>
                          <span style={{ fontFamily: T.mono, fontSize: 20, color: T.accent, marginRight: 8 }}>{"\u00BB"}</span>
                          {s.short_title || s.headline}
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                      <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: T.accent, flexShrink: 0 }} />
                      <Mono style={{ fontSize: 13, color: T.accent }}>
                        {briefingGeneratedAt ? `Generated ${(() => {
                          const n = briefingGeneratedAt.includes("T") ? briefingGeneratedAt : briefingGeneratedAt.replace(" ", "T") + "Z";
                          return new Date(n).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" }) + " · " + new Date(n).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                        })()}` : briefing ? "AI-generated" : "Sample briefing"}
                      </Mono>
                    </div>
                  </div>
                )}
                {/* ── Expanded: cascade reveal with full content ── */}
                {briefingRevealed && (
                  <div style={{ animation: briefingCollapsing ? "briefingFadeOut 150ms ease-in forwards" : "none" }}>
                    {briefingSource.map((s, i) => (
                      <div key={i} style={{
                        borderBottom: i < briefingSource.length - 1 ? `1px solid ${T.borderLight}` : "none",
                        animation: briefingAnimating ? `briefingSlideIn 200ms ease-out ${i * 80}ms both` : "none",
                        padding: i === 0 ? "0 0 10px 0" : "10px 0",
                      }}>
                        {s.url ? (
                          <a href={s.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ fontFamily: T.sans, fontSize: 22, fontWeight: 600, lineHeight: 1.4, color: T.accent, textDecoration: "underline", textDecorationColor: "rgba(220,74,45,.3)", textUnderlineOffset: "3px" }}
                            onMouseEnter={e => e.currentTarget.style.textDecorationColor = T.accent}
                            onMouseLeave={e => e.currentTarget.style.textDecorationColor = "rgba(220,74,45,.3)"}
                          >{s.headline} <span style={{ fontSize: 13, opacity: 0.5 }}>{"\u2197"}</span></a>
                        ) : (
                          <span style={{ fontFamily: T.sans, fontSize: 22, fontWeight: 600, lineHeight: 1.4, color: T.text }}>{s.headline}</span>
                        )}
                        <div style={{ fontFamily: T.sans, fontSize: 15, lineHeight: 1.6, color: T.textMid, padding: "6px 0 2px 0" }}>
                          {s.body}
                        </div>
                      </div>
                    ))}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                      <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: T.accent, flexShrink: 0 }} />
                      <Mono style={{ fontSize: 13, color: T.accent }}>
                        {briefingGeneratedAt ? `Generated ${(() => {
                          const n = briefingGeneratedAt.includes("T") ? briefingGeneratedAt : briefingGeneratedAt.replace(" ", "T") + "Z";
                          return new Date(n).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York", timeZoneName: "short" }) + " · " + new Date(n).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                        })()}` : briefing ? "AI-generated" : "Sample briefing"}
                      </Mono>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── Latest Headlines ── */}
        <Panel title="Latest Headlines" accent={T.accent} noPad style={{ animation: "fadeIn 0.3s ease-in" }}>
          <div className="pill-scroll" style={{ display: "flex", gap: 8, flexWrap: "nowrap", padding: isMobile ? "6px 12px" : "4px 16px", borderBottom: `1px solid ${T.borderLight}` }}>
            {[
              ["All", "All"], ["Legislation", "Legislation"], ["Litigation", "Litigation"],
              ["NCAA Governance", "Governance"], ["CSC / Enforcement", "CSC"],
              ["Revenue Sharing", "Rev. Share"], ["Business / Finance", "Business"],
              ["Roster / Portal", "Portal"], ["Realignment", "Realignment"],
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
                display: "flex", alignItems: "center", gap: 8, padding: isMobile ? "10px 12px" : "6px 16px",
                borderBottom: `1px solid ${T.borderLight}`,
                background: "transparent",
                textDecoration: "none", cursor: "pointer", minHeight: isMobile ? 44 : undefined,
              }}
              onMouseEnter={e => e.currentTarget.style.background = T.surfaceAlt}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              {!isMobile && <Mono style={{ flex: "0 0 96px", fontSize: 12, fontWeight: 600, color: T.textDim, textTransform: "uppercase", letterSpacing: ".3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.src}</Mono>}
              <div style={{ flex: 1, fontFamily: T.sans, fontSize: 15, fontWeight: h.sev === "critical" ? 600 : 500, color: T.text, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.title}</div>
              {h.isNew && <span style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: "#fff", background: T.green, padding: "2px 6px", borderRadius: 3, letterSpacing: ".5px", flexShrink: 0, textTransform: "uppercase", lineHeight: 1.3 }}>NEW</span>}
              <Mono style={{ flex: "0 0 48px", fontSize: 12, color: T.textDim, textAlign: "right" }}>{h.time}</Mono>
            </a>
          ))}
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, padding: "8px 16px", borderTop: `1px solid ${T.borderLight}` }}>
            <button onClick={() => setHlPage(hlPageClamped - 1)} disabled={hlPageClamped === 0} style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 600, color: hlPageClamped > 0 ? T.accent : T.borderLight, background: "transparent", border: "none", cursor: hlPageClamped > 0 ? "pointer" : "default", padding: "8px 16px" }}>← Prev</button>
            <Mono style={{ fontSize: 12, color: T.textDim }}>{hlPageClamped + 1} of {hlTotalPages}</Mono>
            <button onClick={() => setHlPage(hlPageClamped + 1)} disabled={hlPageClamped >= hlTotalPages - 1} style={{ fontFamily: T.mono, fontSize: 12, fontWeight: 600, color: hlPageClamped < hlTotalPages - 1 ? T.accent : T.borderLight, background: "transparent", border: "none", cursor: hlPageClamped < hlTotalPages - 1 ? "pointer" : "default", padding: "8px 16px" }}>Next →</button>
          </div>
        </Panel>

        {/* ══════════════════════════════════════════════════════════
            BELOW THE FOLD — Detail Sections
           ══════════════════════════════════════════════════════════ */}

        {/* ── Litigation ── */}
        <Panel
          title="The Courtroom"
          accent={T.accent}
          noPad
          onHeaderClick={undefined}
          right={
            <Mono style={{ fontSize: 11, color: T.textDim, fontWeight: 400 }}>
              {totalTracked} tracked cases &middot; Source: <a href="https://www.collegesportslitigationtracker.com/tracker" target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: T.textDim, textDecoration: "none" }}>CSLT</a>
            </Mono>
          }
        >
          {!courtroomOpen ? null : <>
          {/* ── UPCOMING KEY DATES ── */}
          {(() => {
            const daysUntil = (dateStr) => {
              const target = new Date(dateStr);
              const now = new Date(); now.setHours(0, 0, 0, 0);
              return Math.ceil((target - now) / 86400000);
            };
            const countdownLabel = (days) => days === 0 ? "TODAY" : days === 1 ? "1 DAY" : `${days} DAYS`;
            const typeLabel = (text) => {
              const t = (text || "").toLowerCase();
              if (/hearing|oral argument|conference/.test(t)) return "HEARING";
              if (/trial|jury/.test(t)) return "TRIAL";
              return "DEADLINE";
            };
            const top5 = upcomingCaseDates.slice(0, 5);
            return top5.length > 0 ? (
              <div style={{ borderBottom: `1px solid ${T.border}` }}>
                <div style={{ padding: "10px 16px 4px" }}>
                  <Mono style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1px", color: T.textDim, textTransform: "uppercase" }}>
                    Upcoming
                  </Mono>
                </div>
                {top5.map((item, i) => {
                  const days = daysUntil(item.date);
                  const snippet = item.detail
                    ? (item.detail.length > 60 ? item.detail.slice(0, 60) + "..." : item.detail)
                    : "";
                  const c = item.caseData;
                  const expandId = `up-${c.id}`;
                  const isOpen = expCase === expandId;
                  const meta = [c.court, c.judge && `Judge ${c.judge}`, c.case_number, c.filed_date].filter(Boolean).join(" · ");
                  const hasExpand = meta || c.description || c.last_event_text;
                  return (
                    <div key={`up${i}`} style={{ borderBottom: `1px solid ${T.borderLight}` }}>
                      <div
                        onClick={hasExpand ? () => setExpCase(isOpen ? null : expandId) : undefined}
                        style={{
                          display: "flex", alignItems: "center", gap: 8, padding: "6px 16px",
                          background: `${T.accent}08`,
                          ...(hasExpand ? { cursor: "pointer" } : {}),
                        }}
                        onMouseEnter={hasExpand ? e => { e.currentTarget.style.background = `${T.accent}10`; } : undefined}
                        onMouseLeave={hasExpand ? e => { e.currentTarget.style.background = `${T.accent}08`; } : undefined}
                      >
                        {hasExpand && <Mono style={{ fontSize: 11, color: T.textDim, transition: "transform .15s", transform: isOpen ? "rotate(90deg)" : "none", flexShrink: 0 }}>▸</Mono>}
                        <strong style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 600, color: T.accent, flexShrink: 0 }}>{item.name}</strong>
                        {snippet && <Mono style={{ fontSize: 13, color: T.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>&middot; {snippet}</Mono>}
                        <div style={{ flex: 1 }} />
                        <span style={{
                          fontFamily: T.mono, fontSize: 10, fontWeight: 600, letterSpacing: "0.5px",
                          color: T.textDim, background: `${T.textDim}15`,
                          padding: "3px 8px", borderRadius: 4, whiteSpace: "nowrap", flexShrink: 0,
                        }}>
                          {typeLabel(item.detail)}
                        </span>
                        <span style={{
                          fontFamily: T.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.5px",
                          color: days <= 3 ? "#fff" : T.accent,
                          background: days <= 3 ? T.accent : `${T.accent}18`,
                          padding: "3px 8px", borderRadius: 4, whiteSpace: "nowrap", flexShrink: 0,
                        }}>
                          {countdownLabel(days)}
                        </span>
                        <Mono style={{ fontSize: 13, color: T.accent, flexShrink: 0, whiteSpace: "nowrap", width: 48, textAlign: "right" }}>
                          {formatDate(item.date)}
                        </Mono>
                      </div>
                      {hasExpand && (
                        <div style={{
                          maxHeight: isOpen ? 500 : 0, overflow: "hidden",
                          transition: "max-height .2s ease, opacity .2s ease",
                          opacity: isOpen ? 1 : 0, background: `${T.accent}05`,
                        }}>
                          <div style={{ padding: "6px 16px 10px 30px" }}>
                            {meta && <Mono style={{ fontSize: 12, color: T.textDim, marginBottom: 6, display: "block" }}>{meta}</Mono>}
                            {c.description && <div style={{ fontFamily: T.sans, fontSize: 13, color: T.textMid, lineHeight: 1.5, marginBottom: 6 }}>{c.description}</div>}
                            {c.last_event_text && <Mono style={{ fontSize: 12, color: T.textDim, marginBottom: 6, display: "block" }}>Latest: {c.last_event_text}{c.last_event_date ? ` (${formatDate(c.last_event_date)})` : ""}</Mono>}
                            {c.cslt_url && (
                              <a href={c.cslt_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ textDecoration: "none" }}>
                                <Mono style={{ fontSize: 12, fontWeight: 600, color: T.accent }}>Full case detail →</Mono>
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null;
          })()}
          {/* ── RECENT ACTIVITY ── */}
          {(() => {
            const toTimestamp = (s) => { const d = new Date(s); return isNaN(d) ? 0 : d.getTime(); };
            const items = recentActivity.map(c => {
              const group = (c.case_group || "").replace(/\s*\(.*?\)\s*/g, "").trim();
              return {
                id: `cl-${c.id}`,
                sortTs: toTimestamp(c.last_event_date),
                name: c.name,
                detail: group,
                dateStr: c.last_event_date ? formatDate(c.last_event_date) : "",
                expandDetail: {
                  meta: [c.court, c.judge && `Judge ${c.judge}`, c.case_number, c.filed_date].filter(Boolean).join(" · "),
                  lastEvent: c.last_event_text || "",
                  lastEventDate: c.last_event_date || "",
                  description: c.description || "",
                  csltUrl: c.cslt_url,
                },
              };
            });
            items.sort((a, b) => b.sortTs - a.sortTs);

            const visible = showAllTimeline ? items : items.slice(0, 5);
            const remaining = items.length - 5;

            return items.length > 0 ? (
              <div style={{ borderBottom: `1px solid ${T.border}` }}>
                <div style={{ padding: "10px 16px 4px" }}>
                  <Mono style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1px", color: T.textDim, textTransform: "uppercase" }}>
                    Recent Activity
                  </Mono>
                </div>
                {visible.map((item, i) => {
                  const hasExpand = item.expandDetail && (item.expandDetail.meta || item.expandDetail.description || item.expandDetail.lastEvent);
                  const isOpen = expCase === item.id;
                  const snippet = item.detail
                    ? (item.detail.length > 80 ? item.detail.slice(0, 80) + "..." : item.detail)
                    : "";
                  return (
                    <div key={item.id} style={{ borderBottom: `1px solid ${T.borderLight}` }}>
                      <div
                        onClick={hasExpand ? () => setExpCase(isOpen ? null : item.id) : undefined}
                        style={{
                          display: "flex", alignItems: "center", gap: 8, padding: "6px 16px",
                          ...(hasExpand ? { cursor: "pointer" } : {}),
                        }}
                        onMouseEnter={hasExpand ? e => { e.currentTarget.style.background = T.surfaceAlt; } : undefined}
                        onMouseLeave={hasExpand ? e => { e.currentTarget.style.background = "transparent"; } : undefined}
                      >
                        {hasExpand && <Mono style={{ fontSize: 11, color: T.textDim, transition: "transform .15s", transform: isOpen ? "rotate(90deg)" : "none", flexShrink: 0 }}>▸</Mono>}
                        <strong style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 600, color: T.text, flexShrink: 0 }}>{item.name}</strong>
                        {snippet && <Mono style={{ fontSize: 13, color: T.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>&middot; {snippet}</Mono>}
                        <div style={{ flex: 1 }} />
                        <span style={{
                          fontFamily: T.mono, fontSize: 10, fontWeight: 600, letterSpacing: "0.5px",
                          color: T.textDim, background: `${T.textDim}15`,
                          padding: "3px 8px", borderRadius: 4, whiteSpace: "nowrap", flexShrink: 0,
                        }}>
                          FILING
                        </span>
                        <Mono style={{ fontSize: 13, color: T.textDim, flexShrink: 0, whiteSpace: "nowrap", width: 48, textAlign: "right" }}>
                          {item.dateStr}
                        </Mono>
                      </div>
                      {hasExpand && (
                        <div style={{
                          maxHeight: isOpen ? 500 : 0, overflow: "hidden",
                          transition: "max-height .2s ease, opacity .2s ease",
                          opacity: isOpen ? 1 : 0,
                        }}>
                          <div style={{ padding: "6px 16px 10px 30px" }}>
                            {item.expandDetail.meta && <Mono style={{ fontSize: 12, color: T.textDim, marginBottom: 6, display: "block" }}>{item.expandDetail.meta}</Mono>}
                            {item.expandDetail.description && <div style={{ fontFamily: T.sans, fontSize: 13, color: T.textMid, lineHeight: 1.5, marginBottom: 6 }}>{item.expandDetail.description}</div>}
                            {item.expandDetail.lastEvent && <Mono style={{ fontSize: 12, color: T.textDim, marginBottom: 6, display: "block" }}>Latest: {item.expandDetail.lastEvent}{item.expandDetail.lastEventDate ? ` (${formatDate(item.expandDetail.lastEventDate)})` : ""}</Mono>}
                            {item.expandDetail.csltUrl && (
                              <a href={item.expandDetail.csltUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ textDecoration: "none" }}>
                                <Mono style={{ fontSize: 12, fontWeight: 600, color: T.accent }}>Full case detail →</Mono>
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {remaining > 0 && (
                  <div
                    onClick={() => setShowAllTimeline(v => !v)}
                    style={{ padding: "8px 16px", cursor: "pointer", textAlign: "center" }}
                    onMouseEnter={e => e.currentTarget.style.background = T.surfaceAlt}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <Mono style={{ fontSize: 12, fontWeight: 600, color: T.accent }}>
                      {showAllTimeline ? "Show fewer \u2191" : "Show more \u2192"}
                    </Mono>
                  </div>
                )}
              </div>
            ) : null;
          })()}
          {/* ── Full tracker link ── */}
          {totalTracked > 0 && (
            <div style={{ padding: "10px 16px", background: T.surfaceAlt, borderTop: `1px solid ${T.borderLight}` }}>
              <a href="https://www.collegesportslitigationtracker.com/tracker" target="_blank" rel="noopener noreferrer" style={{ color: T.accent, textDecoration: "none", fontFamily: T.mono, fontSize: 13, fontWeight: 600, display: "block" }}>
                View all {totalTracked} cases on College Sports Litigation Tracker →
              </a>
              <Mono style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>Full case details, documents, and court filings</Mono>
            </div>
          )}
          </>}
        </Panel>

        {/* ── State NIL Legislation Map ── */}
        <StateLegislationMap />

        {/* ── Coverage Intelligence ── */}
        <Panel title="Coverage Intelligence" size="sm">
          {(() => {
            if (!coverageIntel) return <Mono style={{ fontSize: 12, color: T.textDim, padding: 12 }}>Loading coverage data...</Mono>;
            const { thisWeek, lastWeek, sourceBreadth, latestByCategory, daily } = coverageIntel;
            const CATS = ["Legislation", "Litigation", "NCAA Governance", "CSC / Enforcement", "Revenue Sharing", "Business / Finance", "Roster / Portal", "Realignment"];
            const CAT_SHORT = { "Legislation": "Legislation", "Litigation": "Litigation", "NCAA Governance": "Governance", "CSC / Enforcement": "CSC", "Revenue Sharing": "Rev. Sharing", "Business / Finance": "Business", "Roster / Portal": "Portal", "Realignment": "Realignment" };

            // ── Stat card computations ──
            const totalThisWeek = CATS.reduce((s, c) => s + (thisWeek[c] || 0), 0);

            // Coverage Shift: largest week-over-week increase
            let shiftCat = null, shiftPct = -Infinity;
            for (const c of CATS) {
              const tw = thisWeek[c] || 0, lw = lastWeek[c] || 0;
              if (tw === 0 && lw === 0) continue;
              const pct = lw > 0 ? ((tw - lw) / lw) * 100 : (tw > 0 ? 100 : 0);
              if (pct > shiftPct) { shiftPct = pct; shiftCat = c; }
            }

            // Dominant Topic: category with most headlines
            let domCat = null, domCount = 0;
            for (const c of CATS) {
              if ((thisWeek[c] || 0) > domCount) { domCount = thisWeek[c]; domCat = c; }
            }
            const domPct = totalThisWeek > 0 ? Math.round((domCount / totalThisWeek) * 100) : 0;

            // Quiet Zone: category with longest gap
            const now = new Date();
            let quietCat = null, quietDays = 0;
            for (const c of CATS) {
              const latest = latestByCategory[c];
              if (!latest) { quietCat = c; quietDays = 999; break; }
              const d = new Date(latest.includes("T") ? latest : latest.replace(" ", "T") + "Z");
              const days = Math.floor((now - d) / 86400000);
              if (days > quietDays) { quietDays = days; quietCat = c; }
            }

            // ── Chart data transformation ──
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - chartRange);
            const cutoffStr = cutoff.toISOString().split("T")[0];
            const filtered = daily.filter(r => r.day >= cutoffStr);

            // Pivot into { day: { cat: count } }
            const dayMap = {};
            const allDays = [];
            for (const r of filtered) {
              if (!dayMap[r.day]) { dayMap[r.day] = {}; allDays.push(r.day); }
              dayMap[r.day][r.category] = (dayMap[r.day][r.category] || 0) + r.count;
            }
            // Dedupe and sort
            const uniqueDays = [...new Set(allDays)].sort();

            // Compute stacked values
            const stacked = uniqueDays.map(day => {
              const vals = dayMap[day] || {};
              let cumulative = 0;
              const bands = CATS.map(cat => {
                const v = vals[cat] || 0;
                const y0 = cumulative;
                cumulative += v;
                return { cat, y0, y1: cumulative, count: v };
              });
              const total = cumulative;
              return { day, bands, total };
            });

            // Comparison line: prior period total per day
            const priorCutoff = new Date(cutoff);
            priorCutoff.setDate(priorCutoff.getDate() - chartRange);
            const priorStr = priorCutoff.toISOString().split("T")[0];
            const priorFiltered = daily.filter(r => r.day >= priorStr && r.day < cutoffStr);
            const priorDayTotals = {};
            for (const r of priorFiltered) {
              priorDayTotals[r.day] = (priorDayTotals[r.day] || 0) + r.count;
            }
            const priorDays = Object.keys(priorDayTotals).sort();

            // SVG dimensions
            const W = 700, H = 200, PX = 0, PY = 10;
            const maxY = Math.max(...stacked.map(s => s.total), ...Object.values(priorDayTotals), 1);
            const xStep = uniqueDays.length > 1 ? (W - PX * 2) / (uniqueDays.length - 1) : W;
            const yScale = (v) => PY + (H - PY * 2) * (1 - v / maxY);
            const fmtLabel = (d) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

            // Build stacked area paths (bottom to top)
            const areaPaths = CATS.map((cat, ci) => {
              if (uniqueDays.length === 0) return null;
              const topLine = stacked.map((s, i) => `${PX + i * xStep},${yScale(s.bands[ci].y1)}`);
              const bottomLine = stacked.map((s, i) => `${PX + i * xStep},${yScale(s.bands[ci].y0)}`).reverse();
              return `M${topLine.join(" L")} L${bottomLine.join(" L")} Z`;
            });

            // Prior period comparison line
            const priorLinePoints = priorDays.length > 0 && uniqueDays.length > 0
              ? priorDays.slice(0, uniqueDays.length).map((_, i) => {
                  const val = priorDayTotals[priorDays[i]] || 0;
                  const x = PX + i * (uniqueDays.length > 1 ? (W - PX * 2) / (Math.min(priorDays.length, uniqueDays.length) - 1) : 0);
                  return `${x},${yScale(val)}`;
                }).join(" ")
              : null;

            const midIdx = Math.floor(uniqueDays.length / 2);

            // Card styling
            const cardStyle = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, padding: "10px 14px", minWidth: 0 };
            const cardLabel = { fontFamily: T.mono, fontSize: 9, fontWeight: 700, letterSpacing: "1px", color: "#7c8698", textTransform: "uppercase", marginBottom: 4 };
            const cardValue = { fontFamily: T.mono, fontSize: 14, fontWeight: 700, lineHeight: 1.3, color: T.text };
            const cardSub = { fontFamily: T.mono, fontSize: 10, color: "#7c8698", marginTop: 2 };

            return (
              <div>
                {/* ── Stat Cards ── */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
                  <div style={cardStyle}>
                    <div style={cardLabel}>Coverage Shift</div>
                    {shiftCat ? (
                      <>
                        <div style={cardValue}>
                          {CAT_SHORT[shiftCat]} {shiftPct >= 0 ? `↑${Math.round(shiftPct)}%` : `↓${Math.round(Math.abs(shiftPct))}%`}
                        </div>
                        <div style={cardSub}>vs. last week</div>
                      </>
                    ) : <div style={{ ...cardValue, color: "#7c8698" }}>No data</div>}
                  </div>
                  <div style={cardStyle}>
                    <div style={cardLabel}>Dominant Topic</div>
                    {domCat ? (
                      <>
                        <div style={cardValue}>
                          {CAT_SHORT[domCat]} · {domPct}%
                        </div>
                        <div style={cardSub}>of coverage this week</div>
                      </>
                    ) : <div style={{ ...cardValue, color: "#7c8698" }}>No data</div>}
                  </div>
                  <div style={cardStyle}>
                    <div style={cardLabel}>Source Breadth</div>
                    <div style={cardValue}>{sourceBreadth}</div>
                    <div style={cardSub}>publications this week</div>
                  </div>
                  <div style={cardStyle}>
                    <div style={cardLabel}>Quiet Zone</div>
                    {quietCat && quietDays > 7 ? (
                      <>
                        <div style={cardValue}>
                          {CAT_SHORT[quietCat]}
                        </div>
                        <div style={cardSub}>{quietDays >= 999 ? "No coverage recorded" : `No coverage in ${quietDays}d`}</div>
                      </>
                    ) : <div style={cardValue}>All active this week</div>}
                  </div>
                </div>

                {/* ── Chart Label ── */}
                <Mono style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1px", color: T.textDim, textTransform: "uppercase", marginBottom: 10, display: "block" }}>Coverage by Category · Last 7 Days</Mono>

                {/* ── Stacked Area Chart ── */}
                {uniqueDays.length === 0 ? (
                  <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Mono style={{ fontSize: 12, color: T.textDim }}>No headline data for this period</Mono>
                  </div>
                ) : (
                  <div style={{ position: "relative" }}>
                    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 200, display: "block" }}
                      onMouseLeave={() => setHoverDay(null)}>
                      <defs>
                        {CATS.map((cat, ci) => (
                          <linearGradient key={cat} id={`cov-fill-${ci}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={CAT_COLORS[cat] || "#999"} stopOpacity="0.55" />
                            <stop offset="100%" stopColor={CAT_COLORS[cat] || "#999"} stopOpacity="0.2" />
                          </linearGradient>
                        ))}
                      </defs>
                      {/* Stacked areas */}
                      {areaPaths.map((path, ci) => path && (
                        <path key={CATS[ci]} d={path} fill={`url(#cov-fill-${ci})`} />
                      ))}
                      {/* Prior period comparison line */}
                      {priorLinePoints && (
                        <polyline points={priorLinePoints} fill="none" stroke={T.textDim} strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="4,3" strokeLinejoin="round" />
                      )}
                      {/* Hover overlay rects */}
                      {uniqueDays.map((day, i) => {
                        const x = PX + i * xStep - xStep / 2;
                        return (
                          <rect key={day} x={Math.max(0, x)} y={0} width={xStep} height={H}
                            fill="transparent" style={{ cursor: "pointer" }}
                            onMouseEnter={() => setHoverDay(i)}
                          />
                        );
                      })}
                      {/* Hover vertical line */}
                      {hoverDay !== null && hoverDay < uniqueDays.length && (
                        <line x1={PX + hoverDay * xStep} y1={PY} x2={PX + hoverDay * xStep} y2={H - PY}
                          stroke={T.text} strokeOpacity="0.15" strokeWidth="1" />
                      )}
                    </svg>

                    {/* Hover tooltip */}
                    {hoverDay !== null && hoverDay < stacked.length && (() => {
                      const s = stacked[hoverDay];
                      const xPos = PX + hoverDay * xStep;
                      const pctPos = (xPos / W) * 100;
                      const alignRight = pctPos > 70;
                      return (
                        <div style={{
                          position: "absolute", top: 4,
                          left: alignRight ? undefined : `${pctPos}%`,
                          right: alignRight ? `${100 - pctPos}%` : undefined,
                          background: T.navy, color: "#e2e8f0", borderRadius: 6,
                          padding: "8px 12px", fontSize: 12, fontFamily: T.mono,
                          pointerEvents: "none", zIndex: 10, minWidth: 160,
                          boxShadow: "0 4px 12px rgba(0,0,0,.25)",
                        }}>
                          <div style={{ fontWeight: 700, marginBottom: 4 }}>{fmtLabel(s.day)} · {s.total} articles</div>
                          {s.bands.filter(b => b.count > 0).sort((a, b) => b.count - a.count).map(b => (
                            <div key={b.cat} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 11, padding: "1px 0" }}>
                              <span style={{ color: CAT_COLORS[b.cat] }}>{CAT_SHORT[b.cat]}</span>
                              <span>{b.count}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* X-axis labels — positioned to match SVG data points */}
                    <svg viewBox={`0 0 ${W} 20`} style={{ width: "100%", height: 20, display: "block" }}>
                      <text x={PX} y="14" textAnchor="start" style={{ fontSize: 11, fontFamily: T.mono, fill: T.textDim }}>{fmtLabel(uniqueDays[0])}</text>
                      {uniqueDays.length > 2 && <text x={PX + midIdx * xStep} y="14" textAnchor="middle" style={{ fontSize: 11, fontFamily: T.mono, fill: T.textDim }}>{fmtLabel(uniqueDays[midIdx])}</text>}
                      <text x={PX + (uniqueDays.length - 1) * xStep} y="14" textAnchor="end" style={{ fontSize: 11, fontFamily: T.mono, fill: T.textDim }}>{fmtLabel(uniqueDays[uniqueDays.length - 1])}</text>
                    </svg>
                  </div>
                )}

                {/* ── Legend ── */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: 10 }}>
                  {CATS.map(cat => (
                    <div key={cat} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: CAT_COLORS[cat], flexShrink: 0 }} />
                      <Mono style={{ fontSize: 11, color: T.textDim }}>{CAT_SHORT[cat]}</Mono>
                    </div>
                  ))}
                  {priorLinePoints && (
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 14, height: 0, borderTop: `1.5px dashed ${T.textDim}`, flexShrink: 0 }} />
                      <Mono style={{ fontSize: 11, color: T.textDim }}>Prior {chartRange}d</Mono>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </Panel>

        {/* ── PE Tracker + Resources (side by side) ── */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
          <Panel title="PE Tracker" size="sm" noPad>
            {peDeals.length === 0 ? (
              <div style={{ padding: "12px 16px" }}>
                <Mono style={{ fontSize: 12, color: T.textDim }}>Loading deals...</Mono>
              </div>
            ) : (
              <div>
                {peDeals.filter(d => d.status !== 'dead').map((d, i) => {
                  const statusColors = { closed: T.textDim, announced: T.accent, pending: "#f59e0b", on_hold: "#7c8698", exploring: "#7c8698" };
                  return (
                    <a key={d.id || i} href={d.source_url} target="_blank" rel="noopener noreferrer"
                      style={{
                        display: "block", padding: "8px 14px", textDecoration: "none",
                        borderBottom: `1px solid ${T.borderLight}`, background: "transparent",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = T.surfaceAlt}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                        <Mono style={{ fontSize: 13, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.investor}</Mono>
                        <Mono style={{ fontSize: 10, fontWeight: 600, color: statusColors[d.status] || T.textDim, textTransform: "uppercase", letterSpacing: ".5px", flexShrink: 0 }}>{d.status === 'on_hold' ? 'On Hold' : d.status}</Mono>
                      </div>
                      <Mono style={{ fontSize: 12, color: T.textDim, marginTop: 2 }}>
                        {d.target}{d.conference && d.conference !== 'N/A' ? ` (${d.conference})` : ''}{d.amount && d.amount !== 'Not disclosed' ? ` · ${d.amount}` : ''}
                      </Mono>
                    </a>
                  );
                })}
              </div>
            )}
          </Panel>
          <Panel title="Resources" accent={T.textDim} size="sm">
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { heading: "Legal & Compliance", links: [
                  { label: "College Sports Litigation Tracker", href: "https://www.collegesportslitigationtracker.com" },
                  { label: "Troutman Pepper NIL Tracker", href: "https://www.troutman.com/state-and-federal-nil-legislation-tracker/" },
                  { label: "NIL Revolution Blog", href: "https://www.nilrevolution.com" },
                ]},
                { heading: "Data & Research", links: [
                  { label: "Knight-Newhouse College Athletics Database", href: "https://knightnewhousedata.org" },
                  { label: "nil-ncaa.com", href: "https://nil-ncaa.com" },
                  { label: "On3 NIL Valuations", href: "https://www.on3.com/nil/" },
                ]},
                { heading: "Governance & Policy", links: [
                  { label: "NCAA.org Governance", href: "https://www.ncaa.org/sports/2023/2/14/governance.aspx" },
                  { label: "Congress.gov", href: "https://www.congress.gov/search?q=%7B%22source%22%3A%22legislation%22%2C%22search%22%3A%22NCAA+OR+%22college+athlete%22+OR+NIL%22%7D" },
                ]},
                { heading: "Industry", links: [
                  { label: "AthleticDirectorU", href: "https://athleticdirectoru.com" },
                  { label: "NACDA", href: "https://nacda.com" },
                  { label: "D1.ticker", href: "https://d1ticker.com" },
                  { label: "Front Office Sports", href: "https://frontofficesports.com" },
                ]},
                { heading: "Follow", links: [
                  { label: "NIL Monitor X List", href: X_LIST_URL },
                ]},
              ].map((group, gi) => (
                <div key={gi}>
                  <div style={{ fontFamily: T.mono, fontSize: 9, fontWeight: 700, letterSpacing: "1px", color: "#7c8698", textTransform: "uppercase", marginBottom: 4 }}>{group.heading}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {group.links.map((r, i) => (
                      <a key={i} href={r.href} target="_blank" rel="noopener noreferrer"
                        style={{ textDecoration: "none", fontFamily: T.mono, fontSize: 12, color: T.textDim, display: "flex", alignItems: "center", gap: 6 }}
                        onMouseEnter={e => { e.currentTarget.style.color = T.accent; }}
                        onMouseLeave={e => { e.currentTarget.style.color = T.textDim; }}
                      >
                        <span style={{ color: T.accent }}>→</span> {r.label}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      {/* ══ SIDEBAR ══ */}
      <div style={{ flex: isMobile ? "none" : "0 0 340px", width: isMobile ? "100%" : undefined, display: "flex", flexDirection: "column", gap: 8, position: isMobile ? "static" : "sticky", top: isMobile ? undefined : 68 }}>
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
        A live dashboard that gives college athletics decision-makers a single place to answer: <strong style={{ color: T.text }}>did anything change that I need to know about?</strong>
      </p>
      <p style={{ fontFamily: T.sans, fontSize: 15, lineHeight: 1.7, color: T.textMid, margin: "0 0 12px" }}>
        We track the regulatory, legal, and governance landscape across five domains: state and federal legislation, active litigation, NCAA governance, College Sports Commission enforcement, and the news environment that shapes institutional attention.
      </p>
      <div style={{ marginBottom: 8 }} />
      <h3 style={{ fontFamily: T.sans, fontSize: 16, fontWeight: 700, color: T.text, margin: "0 0 8px" }}>Data Sources</h3>
      <div style={{ marginBottom: 16 }}>
        {[
          ["Google News RSS", "News aggregation (26 targeted queries)", "Free"],
          ["Bing News RSS", "News aggregation (22 targeted queries)", "Free"],
          ["NewsData.io", "News aggregation (87K+ sources)", "API"],
          ["GDELT", "Global news volume tracking (30-day trends)", "Free"],
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
          ["CSLT", "College sports litigation tracker (cases + key dates)", "Scrape"],
          ["Podcast Feeds", "5 NIL/college sports podcasts (latest episodes)", "RSS"],
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
        All data is aggregated automatically from public sources. An AI processing pipeline reads, categorizes, and routes information — generating the daily briefing, extracting deadlines from filings, detecting new cases, and tagging CSC activity. No editorial judgment on inclusion. All content links to original sources. State legislation data is updated periodically from the Troutman Pepper NIL tracker.
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
  const [isMobile, setIsMobile] = useState(false);

  // Tick every 60s so "Updated X min ago" stays fresh
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // Responsive breakpoint
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
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
        @keyframes briefingSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes briefingFadeOut { from { opacity: 1; } to { opacity: 0; } }
        .briefing-cta:hover { background: rgba(220,74,45,.15) !important; transform: translateX(2px); }
        .briefing-cta { transition: background 150ms ease, transform 150ms ease; }
        @media (max-width: 768px) {
          .pill-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
          .pill-scroll::-webkit-scrollbar { display: none; }
          .pill { min-height: 44px !important; padding: 10px 14px !important; }
        }
      `}</style>

      {/* ── Navigation ── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100, background: T.navy,
        padding: isMobile ? "0 12px" : "0 24px", display: "flex", alignItems: "center", height: 60,
        borderBottom: `1px solid ${T.navySoft}`,
      }}>
        {/* Left: brand + live + date */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginRight: isMobile ? 12 : 20 }}>
          <span style={{ fontFamily: T.mono, fontSize: 17, fontWeight: 700, color: "#fff", background: T.accent, padding: "5px 10px", borderRadius: 5, letterSpacing: ".5px" }}>NIL</span>
          {!isMobile && <span style={{ fontFamily: T.mono, fontSize: 17, fontWeight: 400, color: "#fff", letterSpacing: "1.5px" }}>MONITOR</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: isMobile ? 0 : 20 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: T.green, display: "inline-block", animation: "pulse-live 2s ease-in-out infinite" }} />
          <Mono style={{ fontSize: 13, fontWeight: 700, color: T.green, letterSpacing: ".5px" }}>LIVE</Mono>
        </div>
        {!isMobile && <Mono style={{ fontSize: 13, color: "rgba(255,255,255,.65)" }}>
          {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </Mono>}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        <button
          onClick={() => setShowInfo(true)}
          title="About NIL Monitor"
          style={{
            fontFamily: T.sans, fontSize: 20, color: "rgba(255,255,255,.4)",
            background: "transparent", border: "none", cursor: "pointer",
            padding: "12px", marginLeft: 4,
          }}
        >&#9432;</button>
      </nav>

      {/* ── Dashboard ── */}
      <main style={{ maxWidth: 1440, margin: "0 auto", padding: isMobile ? "12px 8px 40px" : "16px 16px 40px" }}>
        <MonitorPage onRefresh={setLastRefresh} isMobile={isMobile} />
      </main>

      {/* ── Info Modal ── */}
      {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
    </div>
  );
}
