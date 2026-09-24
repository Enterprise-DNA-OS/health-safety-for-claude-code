---
description: The inspection calendar - site inspections, audits, plant checks, drills - overdue first, and closing one schedules the next.
---

1. Run `npm run safety -- inspections` (`--all` for done history).
2. Overdue rows first: an inspection skipped is the week the guardrail stays broken. Do it, then record it with what was actually found:
   ```
   npm run safety -- inspection done "<site>" --kind=<kind> --findings="..." --by= --next=<date>
   ```
   "All clear" is a finding too. `--next=` schedules the next one in the same breath; a calendar that does not roll forward stops.
3. Every finding that needs fixing becomes an action while it is fresh: `action add "..." --inspection-site="<site>" --owner= --due=`. An inspection whose findings never became actions is the gap `/compliance` cannot see; read the last findings back and check.
4. Scheduling: `inspection add "<site>" --kind=<site_inspection|audit|plant_check|scaffold_check|emergency_drill> --due=`.
