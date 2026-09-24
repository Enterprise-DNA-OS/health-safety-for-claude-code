---
description: The site safety report and the printable hazard register, rendered from the data in the business's brand - the board pack and the site office wall, from one command each.
---

1. `npm run docs -- site-safety-report` renders one page per active site: the position line, incidents in the last 90 days with the WorkSafe column, open actions with their countdowns, and the high and critical hazards. This is the board pack and the pre-start handout.
2. `npm run docs -- hazard-register` renders each site's register sorted by risk, with the controls and the review dates, plus the what-to-do-if panel. Print it for the site office wall; that is what it is for.
3. Both read `brand.json`, so the business's name, logo and colours are already on them. Print to PDF from the browser.
4. If the operator wants commentary around the numbers (a monthly management report), write it to `drafts/` from `attention`, `trend` and `compliance` output only: the trend line, what got worse, what got fixed, the decisions needed. Facts from the commands; if a number is not in the output, it does not go in the report.

Nothing here sends. A person reads it, then sends it.
