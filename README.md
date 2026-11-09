# Maharashtra facility assessment review

The officer overview at index.html provides district, category and facility drill-down for all 54 PHC and 35 subcentre gap measures, plus reconciliation of 1,992 pending parent PHC links. explorer.html retains the full gap explorer and the facility directory as recorded before the latest mapping reconciliation. Links to older district, problem and directory views continue to work.

The facility list gives each reported gap, the assessment response and the associated operational remark when suitable for publication. Missing answers can be inspected separately. Category counts deduplicate facilities.

The public snapshot is based on the 5 November 2026 backup for FY 2026–27. The mapping register distinguishes unique backup-supported matches from suggested spellings and cases requiring district confirmation. Publishing the register does not change source facility records.

To rebuild officer-data.js, run python3 scripts/officer_snapshot.py SOURCE_DIR with the private remapped.json, review-counts.json, assessment-data.sql.gz and sc-data.sql.gz extracts in SOURCE_DIR. Only publish the generated dashboard assets. GitHub Pages serves the root of main.
