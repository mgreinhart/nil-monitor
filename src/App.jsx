import { useState, useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════════════════════════
   NIL MONITOR — Phase 1 Static Shell
   Dense, glanceable dashboard for college athletics decision-makers.
   Bloomberg terminal × news app. Information density over decoration.
   ═══════════════════════════════════════════════════════════════════ */

// ── Design Tokens ──────────────────────────────────────────────────
const T = {
  navy: "#0f1729",
  navySoft: "#1a2237",
  accent: "#3b82f6",
  accentDim: "#3b82f620",
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
  text: "#0f1729",
  textMid: "#3d4a5c",
  textDim: "#7c8698",
  border: "#e2e5ec",
  borderLight: "#edf0f4",
  mono: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
  sans: "'DM Sans', 'Inter', system-ui, sans-serif",
  radius: 5,
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

const CSC_TAG_COLORS = {
  "Guidance": "#3b82f6", "Investigation": "#ef4444", "Enforcement": "#dc2626",
  "Personnel": "#8b5cf6", "Rule Clarification": "#f59e0b",
};
const SEV = { critical: T.red, important: T.amber, routine: T.textDim };

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
  deadlines: [
    { date: "Feb 23", days: 4, cat: "CSC / Enforcement", text: "CSC Q1 reporting window closes", sev: "critical" },
    { date: "Mar 1", days: 10, cat: "Revenue Sharing", text: "Participation agreement signature deadline (Power 4)", sev: "critical" },
    { date: "Mar 12", days: 21, cat: "Litigation", text: "House v. NCAA final fairness hearing", sev: "critical" },
    { date: "Mar 15", days: 24, cat: "Roster / Portal", text: "Spring transfer portal window closes", sev: "important" },
    { date: "Apr 1", days: 41, cat: "Legislation", text: "TX HB 1247 committee hearing", sev: "routine" },
    { date: "Apr 15", days: 55, cat: "CSC / Enforcement", text: "CSC Q2 reporting window opens", sev: "routine" },
  ],
  house: {
    phase: "Final Approval Pending", hearing: "Mar 12",
    cap: "$20.5M", capAdj: "Jul 1, 2026",
    damages: "$2.78B", distributed: "$0",
    optedIn: "62/70", cscActions: "8",
  },
  cscFeed: [
    { time: "2h", tag: "Guidance", text: "Published 'valid business purpose' evaluation criteria memo" },
    { time: "1d", tag: "Investigation", text: "Confirmed active investigation into LSU collective reporting" },
    { time: "5d", tag: "Enforcement", text: "First formal warning to Group of 5 program for late NIL disclosures" },
    { time: "1w", tag: "Personnel", text: "Katie Medearis appointed Deputy Director of Enforcement" },
    { time: "2w", tag: "Rule Clarification", text: "5-business-day reporting window applies to verbal agreements" },
  ],
  cases: [
    { name: "House v. NCAA", court: "N.D. Cal.", judge: "Wilken", status: "Final Approval Pending", cat: "Settlement Implementation", lastFiling: "Feb 19", next: "Mar 12 — Fairness hearing", filings: 847, desc: "Class action settlement: revenue sharing ($20.5M cap), back-damages ($2.78B), College Sports Commission as enforcement body." },
    { name: "Williams v. Washington", court: "W.D. Wash.", judge: "Martinez", status: "Mediation", cat: "Contract Enforcement", lastFiling: "Feb 15", next: "Mar 17 — Mediation", filings: 23, desc: "First test of revenue-sharing contract enforceability. QB signed $4M deal, entered portal 4 days later." },
    { name: "Carter v. NCAA", court: "NLRB", judge: "Reg. Dir.", status: "Election Certified", cat: "Employment Classification", lastFiling: "Feb 17", next: "Mar 5 — Election", filings: 156, desc: "Dartmouth basketball union petition. NLRB certified election. NCAA appealing employee classification." },
    { name: "Tennessee v. NCAA", court: "E.D. Tenn.", judge: "Atchley", status: "Discovery", cat: "Governance", lastFiling: "Feb 10", next: "Apr 20 — Discovery deadline", filings: 89, desc: "State challenging NCAA governance authority. Antitrust claims in enforcement actions." },
    { name: "Duke v. Harper", court: "M.D.N.C.", judge: "Schroeder", status: "MTD Pending", cat: "Contract Enforcement", lastFiling: "Feb 8", next: "Mar 28 — MTD hearing", filings: 12, desc: "Duke seeking enforcement of multi-year revenue-sharing contract after player announced transfer intent." },
  ],
  states: {
    enacted: ["CA","FL","TX","AL","GA","CO","IL","OH","PA","MI","NC","NJ","NY","VA","TN","KY","MS","LA","SC","NE","NM","AZ","OR","MT","WV","MD","CT","AR","OK","KS","MO","IN","UT","NV"],
    active: ["TX","FL","WI","MN","IA","WA","MA","NH","HI"],
    introduced: ["VT","ME","RI","SD","WY","ND","ID"],
  },
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
  nilRevPosts: [
    { title: "CSC Valid Business Purpose Guidance: What Schools Need to Know", date: "Feb 19" },
    { title: "Contract Enforcement After Williams v. Washington", date: "Feb 15" },
    { title: "CSC Investigation Powers: Due Process and Rights", date: "Feb 10" },
    { title: "SPARTA and FTC: Federal Agent Regulation", date: "Feb 4" },
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

// ── State Grid Cartogram ───────────────────────────────────────────
const SG = {
  ME:[0,10],WI:[1,5],VT:[1,9],NH:[1,10],WA:[2,0],ID:[2,1],MT:[2,2],ND:[2,3],MN:[2,4],IL:[2,5],MI:[2,6],NY:[2,7],MA:[2,9],CT:[2,10],OR:[3,0],NV:[3,1],WY:[3,2],SD:[3,3],IA:[3,4],IN:[3,5],OH:[3,6],PA:[3,7],NJ:[3,8],RI:[3,10],CA:[4,0],UT:[4,1],CO:[4,2],NE:[4,3],MO:[4,4],KY:[4,5],WV:[4,6],VA:[4,7],MD:[4,8],DE:[4,9],AZ:[5,1],NM:[5,2],KS:[5,3],AR:[5,4],TN:[5,5],NC:[5,6],SC:[5,7],DC:[5,8],AK:[6,0],HI:[6,1],OK:[6,2],LA:[6,3],MS:[6,4],AL:[6,5],GA:[6,6],TX:[7,2],FL:[7,5]
};

// ── Shared Components ──────────────────────────────────────────────
const Mono = ({ children, style }) => <span style={{ fontFamily: T.mono, ...style }}>{children}</span>;

const Badge = ({ children, color = T.accent, small }) => (
  <span style={{
    fontFamily: T.mono, fontSize: small ? 8 : 9, fontWeight: 600, letterSpacing: ".4px",
    padding: small ? "1px 5px" : "2px 6px", borderRadius: 3,
    background: color + "15", color, whiteSpace: "nowrap", textTransform: "uppercase", lineHeight: 1.4,
  }}>{children}</span>
);

const SevDot = ({ s }) => (
  <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: SEV[s] || T.textDim, flexShrink: 0, marginTop: 5 }} />
);

const Pill = ({ active, children, onClick }) => (
  <button onClick={onClick} style={{
    fontFamily: T.mono, fontSize: 9, fontWeight: 600, padding: "3px 9px", borderRadius: 3,
    border: `1px solid ${active ? T.accent : T.border}`,
    background: active ? T.accentDim : "transparent",
    color: active ? T.accent : T.textDim, cursor: "pointer", whiteSpace: "nowrap", letterSpacing: ".3px",
  }}>{children}</button>
);

const Panel = ({ title, accent, children, style, right, noPad, className }) => (
  <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.radius, overflow: "hidden", display: "flex", flexDirection: "column", ...style }}>
    {title && (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderBottom: `1px solid ${T.border}`, background: T.surfaceAlt, minHeight: 30 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {accent && <div style={{ width: 3, height: 12, borderRadius: 1.5, background: accent, flexShrink: 0 }} />}
          <Mono style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: T.textDim }}>{title}</Mono>
        </div>
        {right}
      </div>
    )}
    <div style={{ padding: noPad ? 0 : "8px 10px", flex: 1, minHeight: 0 }}>{children}</div>
  </div>
);

const LiveBadge = () => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
    <span style={{ position: "relative", width: 7, height: 7, display: "inline-block" }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: T.green, animation: "livePulse 2s infinite" }} />
      <span style={{ position: "absolute", inset: 1, borderRadius: "50%", background: T.green }} />
    </span>
    <Mono style={{ fontSize: 9, fontWeight: 700, letterSpacing: "1px", color: T.green }}>LIVE</Mono>
  </span>
);

const Divider = () => <div style={{ height: 1, background: T.border, margin: 0 }} />;

// ── State Map Component ────────────────────────────────────────────
const StateMap = ({ selected, onSelect, compact }) => {
  const gc = (st) => {
    if (MOCK.states.active.includes(st)) return T.accent;
    if (MOCK.states.enacted.includes(st)) return T.green;
    if (MOCK.states.introduced.includes(st)) return T.amber;
    return T.borderLight;
  };
  const sz = compact ? 18 : 24;
  return (
    <div style={{ position: "relative", display: "grid", gridTemplateColumns: `repeat(11, ${sz}px)`, gridAutoRows: sz, gap: compact ? 1 : 2 }}>
      {Object.entries(SG).map(([st, [r, c]]) => {
        const color = gc(st);
        const isSel = st === selected;
        const isDark = color !== T.borderLight;
        return (
          <div key={st} onClick={() => onSelect?.(isSel ? null : st)} style={{
            gridRow: r + 1, gridColumn: c + 1,
            background: isSel ? T.navy : color,
            borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", fontFamily: T.mono,
            fontSize: compact ? 6 : 7.5, fontWeight: 700, letterSpacing: ".3px",
            color: isSel ? "#fff" : isDark ? "#fff" : T.textDim,
            transition: "all .12s",
            outline: isSel ? `2px solid ${T.accent}` : "none", outlineOffset: 1,
          }}>{st}</div>
        );
      })}
    </div>
  );
};

// ── Bar Chart ──────────────────────────────────────────────────────
const MiniBarChart = () => {
  const bars = useRef(Array.from({ length: 30 }, () => 15 + Math.random() * 70));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 1.5, height: 52 }}>
      {bars.current.map((h, i) => (
        <div key={i} style={{ flex: 1, height: `${h}%`, background: i === 29 ? T.accent : T.accent + "35", borderRadius: "1px 1px 0 0" }} />
      ))}
    </div>
  );
};

// ── Pages ──────────────────────────────────────────────────────────
const PAGES = ["Monitor", "States", "Cases", "Headlines", "About"];

// ╔═══════════════════════════════════════════════════════════════════
//  MONITOR PAGE — The Dashboard
// ╚═══════════════════════════════════════════════════════════════════
const MonitorPage = () => {
  const [timeFilt, setTimeFilt] = useState("24h");
  const [catFilt, setCatFilt] = useState("All");
  const [selState, setSelState] = useState(null);
  const [expCase, setExpCase] = useState(null);

  const times = ["Today", "24h", "3d", "7d", "30d"];
  const cats = ["All", ...Object.keys(CAT_COLORS).slice(0, 7)];
  const filtered = MOCK.timeline.filter(e => catFilt === "All" || e.cat === catFilt);

  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      {/* ══ MAIN COLUMN ══ */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>

        {/* ══════════════════════════════════════════════════════════
            ABOVE THE FOLD — Dense grid. The actual dashboard.
            Briefing + Deadlines + House numbers = one screen.
           ══════════════════════════════════════════════════════════ */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>

          {/* ── BRIEFING (tall left) ── */}
          <Panel title="Daily Briefing · Feb 19" accent={T.red} style={{ gridRow: "1 / 3" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {MOCK.briefing.map(([head, body], i) => (
                <div key={i} style={{ fontFamily: T.sans, fontSize: 11.5, lineHeight: 1.55, color: T.text }}>
                  <strong style={{ color: T.text }}>{head}</strong>{" "}
                  <span style={{ color: T.textMid }}>{body}</span>
                </div>
              ))}
            </div>
            <Mono style={{ display: "block", marginTop: 8, fontSize: 8, color: T.textDim }}>AI-generated · 6:14 AM EST · Sources: CourtListener, CSC.gov, LegiScan, ESPN</Mono>
          </Panel>

          {/* ── DEADLINES (top right) ── */}
          <Panel title="Deadlines" accent={T.red}>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {MOCK.deadlines.slice(0, 4).map((d, i) => (
                <div key={i} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: i < 3 ? `1px solid ${T.borderLight}` : "none", alignItems: "flex-start" }}>
                  <div style={{
                    fontFamily: T.mono, fontSize: 16, fontWeight: 700, lineHeight: 1, minWidth: 32, textAlign: "right",
                    color: d.sev === "critical" && d.days <= 7 ? T.red : d.days <= 14 ? T.amber : T.text,
                  }}>
                    {d.days}<span style={{ fontSize: 9, fontWeight: 500 }}>d</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: T.sans, fontSize: 11, color: T.text, lineHeight: 1.3 }}>{d.text}</div>
                    <div style={{ display: "flex", gap: 5, marginTop: 2, alignItems: "center" }}>
                      <Badge color={CAT_COLORS[d.cat]} small>{d.cat}</Badge>
                      <Mono style={{ fontSize: 8, color: T.textDim }}>{d.date}</Mono>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {/* ── HOUSE SETTLEMENT (bottom right) ── */}
          <Panel title="House v. NCAA" accent={T.green}>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 7 }}>
              <Badge color={T.amber}>{MOCK.house.phase}</Badge>
              <Mono style={{ fontSize: 8, color: T.textDim }}>Hearing: {MOCK.house.hearing}</Mono>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {[
                ["REV-SHARE CAP", MOCK.house.cap, `Adj: ${MOCK.house.capAdj}`],
                ["BACK DAMAGES", MOCK.house.damages, `Paid: ${MOCK.house.distributed}`],
                ["OPTED IN", MOCK.house.optedIn, "Power 4"],
                ["CSC ACTIONS", MOCK.house.cscActions, "2 new this mo."],
              ].map(([l, v, s], i) => (
                <div key={i} style={{ padding: "5px 7px", background: T.surfaceAlt, borderRadius: 3 }}>
                  <Mono style={{ fontSize: 7, fontWeight: 700, letterSpacing: "1px", color: T.textDim }}>{l}</Mono>
                  <div style={{ fontFamily: T.mono, fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.2 }}>{v}</div>
                  <Mono style={{ fontSize: 8, color: T.textDim }}>{s}</Mono>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* ══════════════════════════════════════════════════════════
            BELOW THE FOLD — Detail Sections
           ══════════════════════════════════════════════════════════ */}

        {/* ── Events Timeline ── */}
        <Panel title="Events Timeline" accent={T.accent} right={
          <div style={{ display: "flex", gap: 3 }}>
            {times.map(t => <Pill key={t} active={timeFilt === t} onClick={() => setTimeFilt(t)}>{t}</Pill>)}
          </div>
        }>
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 8 }}>
            {cats.map(c => <Pill key={c} active={catFilt === c} onClick={() => setCatFilt(c)}>{c}</Pill>)}
          </div>
          {filtered.map((e, i) => (
            <div key={i} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: `1px solid ${T.borderLight}`, alignItems: "flex-start" }}>
              <SevDot s={e.sev} />
              <Mono style={{ fontSize: 9, color: T.textDim, minWidth: 24, flexShrink: 0 }}>{e.time}</Mono>
              <Badge color={CAT_COLORS[e.cat]} small>{e.cat}</Badge>
              <span style={{ fontFamily: T.sans, fontSize: 11.5, color: T.text, flex: 1, lineHeight: 1.35 }}>{e.text}</span>
              <Mono style={{ fontSize: 8, color: T.textDim, flexShrink: 0 }}>{e.src}</Mono>
            </div>
          ))}
        </Panel>

        {/* ── CSC Activity Feed ── */}
        <Panel title="CSC Activity Feed" accent={T.red}>
          {MOCK.cscFeed.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 8, padding: "5px 0", borderBottom: i < MOCK.cscFeed.length - 1 ? `1px solid ${T.borderLight}` : "none", alignItems: "flex-start" }}>
              <Mono style={{ fontSize: 9, color: T.textDim, minWidth: 22, flexShrink: 0 }}>{item.time}</Mono>
              <Badge color={CSC_TAG_COLORS[item.tag]} small>{item.tag}</Badge>
              <span style={{ fontFamily: T.sans, fontSize: 11.5, color: T.text, flex: 1, lineHeight: 1.35 }}>{item.text}</span>
            </div>
          ))}
          <div style={{ marginTop: 8, padding: "6px 8px", background: T.surfaceAlt, borderRadius: 3, fontFamily: T.sans, fontSize: 10, color: T.textDim }}>
            <strong style={{ color: T.textMid }}>Key Personnel:</strong> Bryan Seeley (Exec. Dir.) · Katie Medearis (Deputy Dir., Enforcement)
          </div>
        </Panel>

        {/* ── Legislation Map ── */}
        <Panel title="Regulatory Landscape" accent="#6366f1" noPad>
          <div style={{ display: "flex" }}>
            <div style={{ flex: "0 0 50%", padding: "10px 12px", borderRight: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                {[["Enacted", T.green], ["Active", T.accent], ["Introduced", T.amber], ["None", T.borderLight]].map(([l, c]) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
                    <Mono style={{ fontSize: 8, color: T.textDim }}>{l}</Mono>
                  </div>
                ))}
              </div>
              <StateMap selected={selState} onSelect={setSelState} compact />
            </div>
            <div style={{ flex: 1, padding: "10px 12px", minWidth: 0 }}>
              {selState ? (
                <>
                  <div style={{ fontFamily: T.sans, fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 4 }}>{selState}</div>
                  <Badge color={MOCK.states.active.includes(selState) ? T.accent : MOCK.states.enacted.includes(selState) ? T.green : T.amber}>
                    {MOCK.states.active.includes(selState) ? "Active Bills" : MOCK.states.enacted.includes(selState) ? "Enacted" : "Introduced"}
                  </Badge>
                  <div style={{ marginTop: 8, fontFamily: T.sans, fontSize: 11, color: T.textDim, lineHeight: 1.5 }}>
                    Full state detail with current law provisions, active bills, sponsors, and hearing dates loads from LegiScan API data. View the States page for full detail.
                  </div>
                </>
              ) : (
                <>
                  <Mono style={{ fontSize: 10, fontWeight: 700, color: T.textMid, marginBottom: 6, display: "block" }}>Federal Bills</Mono>
                  {[
                    { bill: "S. 2439", title: "College Athletes Protection Act", sponsor: "Murphy (D-CT)", status: "In Committee", cos: 12 },
                    { bill: "H.R. 1147", title: "Student Athlete Level Playing Field Act", sponsor: "Gonzalez (R-OH)", status: "In Committee", cos: 8 },
                    { bill: "S. 3011", title: "NIL Federal Framework Act", sponsor: "Wicker (R-MS)", status: "Introduced", cos: 3 },
                  ].map((b, i) => (
                    <div key={i} style={{ padding: "6px 0", borderBottom: `1px solid ${T.borderLight}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <Mono style={{ fontSize: 10, fontWeight: 700, color: T.accent }}>{b.bill}</Mono>
                        <Badge color={b.status === "In Committee" ? T.amber : T.textDim} small>{b.status}</Badge>
                      </div>
                      <div style={{ fontFamily: T.sans, fontSize: 11, color: T.text }}>{b.title}</div>
                      <Mono style={{ fontSize: 8, color: T.textDim }}>{b.sponsor} · {b.cos} cosponsors</Mono>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </Panel>

        {/* ── Litigation ── */}
        <Panel title="The Courtroom" accent={T.accent}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {MOCK.cases.map((c, i) => (
              <div key={i} onClick={() => setExpCase(expCase === i ? null : i)} style={{
                border: `1px solid ${T.borderLight}`, borderRadius: 4, padding: "8px 10px",
                cursor: "pointer", background: expCase === i ? T.surfaceAlt : "transparent", transition: "background .1s",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 700, color: T.text }}>{c.name}</span>
                  <Badge color={T.amber}>{c.status}</Badge>
                  <Badge color={CAT_COLORS[c.cat]} small>{c.cat}</Badge>
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 3, fontFamily: T.mono, fontSize: 9, color: T.textDim, flexWrap: "wrap" }}>
                  <span>{c.court} · {c.judge}</span>
                  <span>Last: {c.lastFiling}</span>
                  <span>{c.filings} filings</span>
                </div>
                {c.next && <div style={{ marginTop: 3, fontFamily: T.sans, fontSize: 10.5, color: T.red, fontWeight: 600 }}>→ {c.next}</div>}
                {expCase === i && (
                  <div style={{ marginTop: 7, paddingTop: 7, borderTop: `1px solid ${T.border}`, fontFamily: T.sans, fontSize: 11.5, color: T.textMid, lineHeight: 1.5 }}>{c.desc}</div>
                )}
              </div>
            ))}
          </div>
        </Panel>

        {/* ── Outside View ── */}
        <Panel title="The Outside View" accent="#64748b">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <Mono style={{ fontSize: 8, fontWeight: 700, letterSpacing: "1px", color: T.textDim, textTransform: "uppercase", marginBottom: 6, display: "block" }}>News Volume · 30 Days</Mono>
              <MiniBarChart />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                <Mono style={{ fontSize: 7, color: T.textDim }}>30d ago</Mono>
                <Mono style={{ fontSize: 7, color: T.textDim }}>Today</Mono>
              </div>
            </div>
            <div>
              <Mono style={{ fontSize: 8, fontWeight: 700, letterSpacing: "1px", color: T.textDim, textTransform: "uppercase", marginBottom: 6, display: "block" }}>Google Trends</Mono>
              <div style={{ background: T.surfaceAlt, borderRadius: 3, padding: 12, textAlign: "center", height: 58, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Mono style={{ fontSize: 9, color: T.textDim }}>Live embed — NIL, transfer portal, House settlement</Mono>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <Mono style={{ fontSize: 8, fontWeight: 700, letterSpacing: "1px", color: T.textDim, textTransform: "uppercase", marginBottom: 6, display: "block" }}>Prediction Markets · Polymarket</Mono>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {[
                ["Federal NIL legislation by 2026", "18%", "↓3%", false],
                ["House settlement approved", "89%", "↑2%", true],
                ["NCAA restructured by 2027", "42%", "↑7%", true],
              ].map(([q, pct, chg, up], i) => (
                <div key={i} style={{ padding: "8px", background: T.surfaceAlt, borderRadius: 3 }}>
                  <div style={{ fontFamily: T.sans, fontSize: 10, color: T.textMid, lineHeight: 1.3, marginBottom: 4 }}>{q}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                    <Mono style={{ fontSize: 18, fontWeight: 700, color: T.text }}>{pct}</Mono>
                    <Mono style={{ fontSize: 9, color: up ? T.green : T.red }}>{chg}</Mono>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      {/* ══ SIDEBAR ══ */}
      <div style={{ flex: "0 0 280px", display: "flex", flexDirection: "column", gap: 10, position: "sticky", top: 56 }}>

        {/* X Feed */}
        <Panel title="Live Feed" accent={T.green} style={{ maxHeight: 420 }} right={<LiveBadge />}>
          <div style={{ overflow: "auto", maxHeight: 360 }}>
            {MOCK.xFeed.map((t, i) => (
              <div key={i} style={{ padding: "6px 0", borderBottom: `1px solid ${T.borderLight}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <Mono style={{ fontSize: 10, fontWeight: 700, color: T.accent }}>{t.handle}</Mono>
                  <Mono style={{ fontSize: 8, color: T.textDim }}>{t.time}</Mono>
                </div>
                <div style={{ fontFamily: T.sans, fontSize: 10.5, lineHeight: 1.4, color: T.text }}>{t.text}</div>
              </div>
            ))}
          </div>
          <Mono style={{ display: "block", textAlign: "center", marginTop: 4, fontSize: 8, color: T.textDim }}>Curated X List · 47 accounts</Mono>
        </Panel>

        {/* NIL Revolution */}
        <Panel title="NIL Revolution" accent={T.purple}>
          {MOCK.nilRevPosts.map((p, i) => (
            <div key={i} style={{ padding: "5px 0", borderBottom: i < MOCK.nilRevPosts.length - 1 ? `1px solid ${T.borderLight}` : "none" }}>
              <div style={{ fontFamily: T.sans, fontSize: 10.5, color: T.accent, lineHeight: 1.3, cursor: "pointer" }}>{p.title}</div>
              <Mono style={{ fontSize: 8, color: T.textDim }}>Troutman Pepper · {p.date}</Mono>
            </div>
          ))}
        </Panel>

        {/* Podcast */}
        <Panel title="Highway to NIL" accent={T.purple}>
          <div style={{ textAlign: "center", padding: "4px 0" }}>
            <div style={{ fontFamily: T.sans, fontSize: 11, color: T.text, lineHeight: 1.35, marginBottom: 4 }}>"Desk Drawer Tour: NIL Disputes, Eligibility, and the CSC Agreement"</div>
            <Mono style={{ fontSize: 8, color: T.textDim, marginBottom: 6, display: "block" }}>Feb 4, 2026 · 48 min</Mono>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 12px", background: "#1DB954", borderRadius: 14, cursor: "pointer" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21" /></svg>
              <span style={{ fontFamily: T.sans, fontSize: 10, fontWeight: 600, color: "white" }}>Spotify</span>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
};

// ╔═══════════════════════════════════════════════════════════════════
//  STATES PAGE
// ╚═══════════════════════════════════════════════════════════════════
const StatesPage = () => {
  const [sel, setSel] = useState(null);
  const [mode, setMode] = useState("map");
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <Pill active={mode === "map"} onClick={() => setMode("map")}>Map View</Pill>
        <Pill active={mode === "table"} onClick={() => setMode("table")}>Table View</Pill>
      </div>
      {mode === "map" ? (
        <Panel title="State NIL Legislation" accent="#6366f1" noPad>
          <div style={{ display: "flex" }}>
            <div style={{ flex: "0 0 55%", padding: 14, borderRight: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                {[["Enacted", T.green], ["Active", T.accent], ["Introduced", T.amber], ["None", T.borderLight]].map(([l, c]) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: c }} />
                    <Mono style={{ fontSize: 9, color: T.textDim }}>{l}</Mono>
                  </div>
                ))}
              </div>
              <StateMap selected={sel} onSelect={setSel} />
            </div>
            <div style={{ flex: 1, padding: 14 }}>
              {sel ? (
                <>
                  <div style={{ fontFamily: T.sans, fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 6 }}>{sel}</div>
                  <Badge color={MOCK.states.active.includes(sel) ? T.accent : MOCK.states.enacted.includes(sel) ? T.green : T.amber}>
                    {MOCK.states.active.includes(sel) ? "Active Bills" : MOCK.states.enacted.includes(sel) ? "Enacted" : "Introduced"}
                  </Badge>
                  <div style={{ marginTop: 10, fontFamily: T.sans, fontSize: 12, color: T.textDim, lineHeight: 1.6 }}>
                    Full state detail — current law, active bills, bill text, sponsors, hearings — loads from LegiScan API.
                  </div>
                </>
              ) : (
                <div style={{ fontFamily: T.sans, fontSize: 12, color: T.textDim }}>Select a state to view NIL legislation details.</div>
              )}
            </div>
          </div>
        </Panel>
      ) : (
        <Panel title="States with Active Legislation" accent="#6366f1">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                {["State", "Bills", "Status", "Last Action", "Date"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "5px 8px", fontFamily: T.mono, fontSize: 9, fontWeight: 700, color: T.textDim, textTransform: "uppercase", letterSpacing: ".5px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK.states.active.map((st, i) => (
                <tr key={st} style={{ borderBottom: `1px solid ${T.borderLight}` }}>
                  <td style={{ padding: "7px 8px", fontFamily: T.sans, fontSize: 12, fontWeight: 600, color: T.text }}>{st}</td>
                  <td style={{ padding: "7px 8px", fontFamily: T.mono, fontSize: 11 }}>{1 + (i % 3)}</td>
                  <td style={{ padding: "7px 8px" }}><Badge color={T.amber} small>In Committee</Badge></td>
                  <td style={{ padding: "7px 8px", fontFamily: T.sans, fontSize: 11, color: T.textDim }}>Referred to subcommittee</td>
                  <td style={{ padding: "7px 8px", fontFamily: T.mono, fontSize: 10, color: T.textDim }}>Feb {10 + i}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
};

// ╔═══════════════════════════════════════════════════════════════════
//  CASES PAGE
// ╚═══════════════════════════════════════════════════════════════════
const CasesPage = () => {
  const [filt, setFilt] = useState("All");
  const [exp, setExp] = useState(0);
  const caseCats = ["All", "Settlement Implementation", "Contract Enforcement", "Antitrust", "Employment Classification", "Governance"];
  const filtered = MOCK.cases.filter(c => filt === "All" || c.cat === filt);
  return (
    <div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
        {caseCats.map(c => <Pill key={c} active={filt === c} onClick={() => setFilt(c)}>{c}</Pill>)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map((c, i) => (
          <Panel key={i} noPad>
            <div onClick={() => setExp(exp === i ? null : i)} style={{ padding: "12px 14px", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
                <span style={{ fontFamily: T.sans, fontSize: 15, fontWeight: 700, color: T.text }}>{c.name}</span>
                <Badge color={T.amber}>{c.status}</Badge>
                <Badge color={CAT_COLORS[c.cat]}>{c.cat}</Badge>
              </div>
              <div style={{ display: "flex", gap: 16, fontFamily: T.mono, fontSize: 9, color: T.textDim, flexWrap: "wrap" }}>
                <span>Court: {c.court}</span><span>Judge: {c.judge}</span><span>Filings: {c.filings}</span><span>Last: {c.lastFiling}</span>
              </div>
              {c.next && <div style={{ marginTop: 5, fontFamily: T.sans, fontSize: 11.5, color: T.red, fontWeight: 600 }}>→ {c.next}</div>}
              {exp === i && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                  <div style={{ fontFamily: T.sans, fontSize: 12.5, color: T.textMid, lineHeight: 1.6, marginBottom: 10 }}>{c.desc}</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <Mono style={{ fontSize: 10, color: T.accent, cursor: "pointer" }}>CourtListener →</Mono>
                    <Mono style={{ fontSize: 10, color: T.accent, cursor: "pointer" }}>PACER Docket →</Mono>
                  </div>
                </div>
              )}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
};

// ╔═══════════════════════════════════════════════════════════════════
//  HEADLINES PAGE
// ╚═══════════════════════════════════════════════════════════════════
const HeadlinesPage = () => {
  const [cat, setCat] = useState("All");
  const allCats = ["All", ...Object.keys(CAT_COLORS).slice(0, 7)];
  const filtered = MOCK.headlines.filter(h => cat === "All" || h.cat === cat);
  return (
    <div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
        {allCats.map(c => <Pill key={c} active={cat === c} onClick={() => setCat(c)}>{c}</Pill>)}
      </div>
      <Panel noPad>
        {filtered.map((h, i) => (
          <div key={i} style={{ display: "flex", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${T.borderLight}`, alignItems: "center", cursor: "pointer" }}>
            <div style={{ flex: "0 0 56px" }}>
              <Mono style={{ fontSize: 10, fontWeight: 700, color: T.accent, display: "block" }}>{h.src}</Mono>
              <Mono style={{ fontSize: 8, color: T.textDim }}>{h.time}</Mono>
            </div>
            <Badge color={CAT_COLORS[h.cat]} small>{h.cat}</Badge>
            <div style={{ flex: 1, fontFamily: T.sans, fontSize: 12.5, color: T.text, lineHeight: 1.35 }}>{h.title}</div>
            <Mono style={{ fontSize: 10, color: T.accent }}>→</Mono>
          </div>
        ))}
      </Panel>
    </div>
  );
};

// ╔═══════════════════════════════════════════════════════════════════
//  ABOUT PAGE
// ╚═══════════════════════════════════════════════════════════════════
const AboutPage = () => (
  <div style={{ maxWidth: 680 }}>
    <Panel>
      <h2 style={{ fontFamily: T.sans, fontSize: 20, fontWeight: 700, color: T.text, margin: "0 0 10px" }}>What is NIL Monitor?</h2>
      <p style={{ fontFamily: T.sans, fontSize: 13, lineHeight: 1.7, color: T.textMid, margin: "0 0 12px" }}>
        A live dashboard that gives college athletics decision-makers a single place to answer: <strong style={{ color: T.text }}>did anything change overnight that I need to know about?</strong>
      </p>
      <p style={{ fontFamily: T.sans, fontSize: 13, lineHeight: 1.7, color: T.textMid, margin: "0 0 12px" }}>
        We track the regulatory, legal, and governance landscape across five domains: state and federal legislation, active litigation, NCAA governance, College Sports Commission enforcement, and the news environment that shapes institutional attention.
      </p>
      <p style={{ fontFamily: T.sans, fontSize: 13, lineHeight: 1.7, color: T.textMid, margin: "0 0 20px" }}>
        We don't compete with D1.ticker (editorial), Teamworks (operations), or Troutman Pepper (legal analysis). We are the <strong style={{ color: T.text }}>first screen</strong> — the check that determines how you spend the rest of your morning.
      </p>
      <h3 style={{ fontFamily: T.sans, fontSize: 15, fontWeight: 700, color: T.text, margin: "0 0 8px" }}>Data Sources</h3>
      <div style={{ marginBottom: 18 }}>
        {[
          ["X (Twitter) List", "Real-time curated feed", "Free embed"],
          ["LegiScan", "50-state + federal bill tracking", "Free API"],
          ["CourtListener / RECAP", "Federal court filings + alerts", "Free API"],
          ["NCAA.org", "Governance + rule changes", "RSS"],
          ["NewsData.io", "News aggregation (87K+ sources)", "Free API"],
          ["Google News RSS", "Supplemental headlines", "Free"],
          ["Congress.gov", "Federal bill detail", "Free API"],
          ["Google Trends", "Search interest", "Free embed"],
          ["Polymarket", "Prediction market odds", "Free API"],
          ["Spotify", "Highway to NIL podcast", "Free embed"],
          ["NIL Revolution", "Legal analysis (Troutman Pepper)", "RSS"],
        ].map(([src, what, method], i) => (
          <div key={i} style={{ display: "flex", padding: "4px 0", borderBottom: `1px solid ${T.borderLight}` }}>
            <Mono style={{ fontSize: 10, fontWeight: 600, color: T.text, flex: "0 0 170px" }}>{src}</Mono>
            <span style={{ fontFamily: T.sans, fontSize: 11, color: T.textDim, flex: 1 }}>{what}</span>
            <Mono style={{ fontSize: 9, color: T.green }}>{method}</Mono>
          </div>
        ))}
      </div>
      <h3 style={{ fontFamily: T.sans, fontSize: 15, fontWeight: 700, color: T.text, margin: "0 0 8px" }}>Methodology</h3>
      <p style={{ fontFamily: T.sans, fontSize: 13, lineHeight: 1.7, color: T.textMid, margin: 0 }}>
        All data is aggregated automatically from public sources. An AI processing pipeline reads, categorizes, and routes information — generating the daily briefing, extracting deadlines from filings, detecting new cases, and tagging CSC activity. No editorial judgment on inclusion. All content links to original sources. Zero manual maintenance after initial setup.
      </p>
    </Panel>
  </div>
);

// ╔═══════════════════════════════════════════════════════════════════
//  APP SHELL
// ╚═══════════════════════════════════════════════════════════════════
export default function NILMonitor() {
  const [page, setPage] = useState("Monitor");

  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: T.sans }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${T.bg}; }
        @keyframes livePulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.4; transform:scale(2); } }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 2px; }
        button { outline: none; }
        button:hover { filter: brightness(0.95); }
      `}</style>

      {/* ── Navigation ── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100, background: T.navy,
        padding: "0 16px", display: "flex", alignItems: "center", height: 44,
        borderBottom: `1px solid ${T.navySoft}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 24 }}>
          <Mono style={{ fontSize: 12, fontWeight: 700, color: "#fff", letterSpacing: ".6px" }}>NIL MONITOR</Mono>
          <LiveBadge />
        </div>
        <div style={{ display: "flex", gap: 0 }}>
          {PAGES.map(p => (
            <button key={p} onClick={() => setPage(p)} style={{
              fontFamily: T.sans, fontSize: 11.5, fontWeight: page === p ? 700 : 500,
              padding: "11px 12px", background: "transparent",
              color: page === p ? "#fff" : "rgba(255,255,255,.5)",
              border: "none", cursor: "pointer",
              borderBottom: page === p ? `2px solid ${T.accent}` : "2px solid transparent",
              transition: "all .12s",
            }}>{p}</button>
          ))}
        </div>
        <Mono style={{ marginLeft: "auto", fontSize: 8, color: "rgba(255,255,255,.3)" }}>
          Last refresh: 2 min ago · Feb 19, 2026 6:14 AM EST
        </Mono>
      </nav>

      {/* ── Page Content ── */}
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "12px 14px 40px" }}>
        {page === "Monitor" && <MonitorPage />}
        {page === "States" && <StatesPage />}
        {page === "Cases" && <CasesPage />}
        {page === "Headlines" && <HeadlinesPage />}
        {page === "About" && <AboutPage />}
      </main>
    </div>
  );
}
