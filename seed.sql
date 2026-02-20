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

-- Initial tracked cases
INSERT INTO cases (source_id, name, court, judge, status, category, filed_date, last_filing_date, filing_count, next_action, next_action_date, description) VALUES
  ('house-v-ncaa', 'House v. NCAA', 'N.D. Cal.', 'Wilken', 'Final Approval Pending', 'Settlement Implementation', '2020-06-15', '2026-02-19', 847, 'Fairness hearing', '2026-03-12', 'Class action settlement: revenue sharing ($20.5M cap), back-damages ($2.78B), College Sports Commission as enforcement body.'),
  ('williams-v-washington', 'Williams v. Washington', 'W.D. Wash.', 'Martinez', 'Mediation', 'Contract Enforcement', '2025-11-03', '2026-02-15', 23, 'Mediation', '2026-03-17', 'First test of revenue-sharing contract enforceability. QB signed $4M deal, entered portal 4 days later.'),
  ('carter-v-ncaa', 'Carter v. NCAA', 'NLRB', 'Reg. Dir.', 'Election Certified', 'Employment Classification', '2024-02-05', '2026-02-17', 156, 'Election', '2026-03-05', 'Dartmouth basketball union petition. NLRB certified election. NCAA appealing employee classification.'),
  ('tennessee-v-ncaa', 'Tennessee v. NCAA', 'E.D. Tenn.', 'Atchley', 'Discovery', 'Governance', '2024-12-19', '2026-02-10', 89, 'Discovery deadline', '2026-04-20', 'State challenging NCAA governance authority. Antitrust claims in enforcement actions.'),
  ('duke-v-harper', 'Duke v. Harper', 'M.D.N.C.', 'Schroeder', 'MTD Pending', 'Contract Enforcement', '2025-12-01', '2026-02-08', 12, 'MTD hearing', '2026-03-28', 'Duke seeking enforcement of multi-year revenue-sharing contract after player announced transfer intent.');
