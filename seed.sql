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
