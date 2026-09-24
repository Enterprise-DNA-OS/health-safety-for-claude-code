---
description: The hazard register scored on the 5x5 matrix, highest risk first - or add, control, review and close hazards with the hierarchy of controls enforced.
---

1. The register: `npm run safety -- hazards` (`--site=`, `--band=high`, `--all` for closed too). One hazard: `hazard <ref>`, which also shows every incident it has caused: the repeat-offender view.
2. Adding one: rate it honestly with the operator. Likelihood 1-5 x consequence 1-5; 10 and up is high, 17 and up is critical.
   ```
   npm run safety -- hazard add "<site>" --title="..." --category=<plant|height|excavation|traffic|manual|electrical|substance|environment|psychosocial|other> --likelihood=N --consequence=N --controls="what is actually in place" --control-level=<elimination|substitution|isolation|engineering|administration|ppe> --owner=
   ```
   The CLI refuses a high or critical hazard with no controls recorded. Record what is truly in place, however weak; the attention list keeps the pressure on until the hierarchy has been worked.
3. When a control improves: `hazard control <ref> --controls= --control-level=`. When it is reviewed: `hazard review <ref> --note="what you found" --review=<next date>`. A review with no note is a date change, not a review.
4. The hierarchy conversation is the value: for every high or critical hazard on `administration` or `ppe`, ask what would eliminate, substitute, isolate or engineer it down (GRWM reg 6). Put the good answers in as actions: `action add "..." --hazard=<ref>`.
5. `hazard close` needs the reason: closed means the risk is gone, not just quiet.
