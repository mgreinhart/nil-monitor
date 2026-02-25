-- House Settlement key metrics
INSERT INTO house_settlement (key, value) VALUES
  ('phase', 'Final Approval Pending'),
  ('hearing_date', '2026-03-12'),
  ('rev_share_cap', '$20.5M'),
  ('cap_adjustment_date', '2026-07-01'),
  ('back_damages_total', '$2.78B'),
  ('back_damages_distributed', '$0'),
  ('opted_in', '62/70');

-- Pre-loaded deadlines
INSERT INTO deadlines (date, category, text, severity, source) VALUES
  ('2026-02-23', 'CSC / Enforcement', 'CSC Q1 reporting window closes', 'critical', 'pre-loaded'),
  ('2026-03-01', 'Revenue Sharing', 'Participation agreement signature deadline (Power 4)', 'critical', 'pre-loaded'),
  ('2026-03-12', 'Litigation', 'House v. NCAA final fairness hearing', 'critical', 'pre-loaded'),
  ('2026-03-15', 'Roster / Portal', 'Spring transfer portal window closes', 'important', 'pre-loaded'),
  ('2026-04-15', 'CSC / Enforcement', 'CSC Q2 reporting window opens', 'routine', 'pre-loaded'),
  ('2026-07-01', 'Revenue Sharing', 'Revenue-sharing cap annual adjustment', 'important', 'pre-loaded');

-- Cases are now populated entirely by the CSLT fetcher (fetch-cslt.js).
-- No seed data needed.

-- Private equity deals in college athletics
INSERT OR IGNORE INTO pe_deals (investor, target, conference, amount, announced_date, status, terms_summary, source_url) VALUES
  ('Otro Capital', 'University of Utah', 'Big 12', '~$500M', '2025-12', 'announced', 'Minority equity stake in new for-profit entity "Utah Brands & Entertainment LLC." University retains majority ownership. Exit clause allows Utah to repurchase after 5-7 years. First-ever PE deal with a college athletic department.', 'https://www.espn.com/college-sports/story/_/id/47267088/utah-private-equity-college-sports-otro-capital'),
  ('CAS (RedBird + Weatherford)', 'Big 12 Conference', 'Big 12', 'Up to $500M', '2025-12', 'pending', 'No equity stake sold. $25M into new "Big 12 Properties" entity. Each of 16 schools gets optional ~$30M credit line. Schools retain 100% ownership. Longform contract being drafted.', 'https://www.sportico.com/business/finance/2025/big-12-cas-redbird-private-equity-deal-500-million-1234879052/'),
  ('CVC Capital Partners', 'Big 12 Conference', 'Big 12', '$800M-$1B proposed', '2024-06', 'dead', 'Proposed 15-20% equity stake in the conference. Commissioner Yormark said Big 12 "not ready to go in that direction." Talks ended May 2025.', 'https://www.cbssports.com/college-football/news/big-12-considering-private-equity-investment-of-up-to-1-billion-for-as-much-as-20-of-conference/'),
  ('UC Investments', 'Big Ten Conference', 'Big Ten', '$2.4B for 10% stake', '2025-10', 'on_hold', '10% equity in new "Big Ten Enterprises" spinoff. Grant of rights extended to 2046. Tiered payouts: $190M for top schools, ~$100M for others. Paused after Michigan and USC boards opposed.', 'https://www.espn.com/college-sports/story/_/id/47003108/opposition-michigan-usc-pauses-24b-big-ten-deal'),
  ('Sixth Street', 'Florida State', 'ACC', '~$250M proposed', '2022-01', 'dead', '"Project Osceola" — would have created NewCo for Seminoles commercial rights. Fell apart late 2023 due to ACC exit lawsuit and House v. NCAA uncertainty.', 'https://www.sportico.com/business/finance/2024/florida-state-sixth-street-private-equity-talks-over-1234819808/'),
  ('Arctos Partners', 'Florida State', 'ACC', '~$75M proposed', '2022-06', 'dead', 'Reviewed term sheets during Project Osceola alongside Sixth Street. $75M initial purchase with non-exclusive IP license preference. Did not advance.', 'https://www.sportico.com/leagues/college-sports/2024/fsu-project-osceola-private-equity-jp-morgan-1234764861/'),
  ('Elevate / Velocity / Texas PSF', 'Multiple schools', 'Multi', '$500M fund', '2025-06', 'announced', 'Private credit (not equity). No ownership stake. Schools borrow upfront, repay over time. Capital for infrastructure, premium seating, NIL platforms. Claims 2 undisclosed Power 4 deals closed.', 'https://www.cnbc.com/2025/06/09/elevate-launches-500-million-college-sports-investment.html'),
  ('TBD (BAGS Initiative)', 'Boise State', 'Pac-12', 'Not disclosed', '2025-06', 'exploring', '"Bronco Athletics Growth Solutions" subsidiary of BSU Foundation. Exploring private credit, mixed-use development, stadium expansion. No specific PE firm announced.', 'https://frontofficesports.com/boise-state-expects-private-equity-investment-within-the-next-six-months/'),
  ('Clearlake / Charlesbank / Fortress', 'Learfield (~200 schools)', 'Multi', '$150M equity + $600M debt reduction', '2023-09', 'closed', 'Became majority owners of Learfield via $150M equity injection and $600M+ debt forgiveness. Learfield manages multimedia rights for ~200 schools (83% of Power 5). PE-owned infrastructure layer.', 'https://www.learfield.com/2023/09/learfield-announces-closing-of-recapitalization-transaction-and-equity-investment-positioning-the-company-for-continued-growth/'),
  ('KKR', 'Arctos Partners (acquisition)', 'N/A', '$1.4B + up to $550M', '2026-01', 'announced', 'KKR acquiring Arctos ($15B AUM, pro sports franchise stakes). Will form "KKR Solutions." Not in college athletics yet but Arctos reviewed FSU term sheets. KKR also owns Varsity Brands ($4.75B). Positions KKR/Arctos as potential college athletics entrant.', 'https://www.sportico.com/business/finance/2026/kkr-buys-arctos-price-sports-secondaries-1234883498/');
