---
description: Bring the business across from ecoPortal, SiteDocs or plain CSV - people, hazards, incidents, training - dry run first, and imported notifiable events with no notification date surface immediately.
---

1. Read [docs/replace-ecoportal.md](../../docs/replace-ecoportal.md) with the operator: which exports to pull from the incumbent, what maps, what deliberately does not carry over.
2. Dry run first, always:
   ```
   npm run safety -- import ecoportal --people=people.csv --hazards=hazards.csv --incidents=incidents.csv --trainings=training.csv --dry-run
   ```
   Read the counts and the skips back to the operator. A skipped row is named, never silent.
3. Run it for real (drop `--dry-run`), then prove it landed: `stats`, `attention`, `compliance`.
4. **The import is the first audit.** Any imported notifiable event with no WorkSafe notification date in the export lands at the top of the attention list. If it was reported, record the date (`worksafe <ref> --on=`); if it was not, the operator just learned the most important thing the old system never told them.
5. Column names are matched generously (Name/Full Name/Worker, Hazard/Risk/Title, and so on). If a file's headers match nothing, show the operator the first row and map it together, then use `csv` as the source.
