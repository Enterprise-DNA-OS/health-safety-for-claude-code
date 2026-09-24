---
description: Everything that wants a decision this morning, worst first. Unreported notifiable events, overdue actions, induction gaps, weak controls on high hazards, stale reviews and investigations, SDS gaps, quiet sites.
---

1. Run `npm run safety -- attention`.
2. The list is already ordered by how much each item can cost. Read it in that order and do not reorder it by ease:
   - **A notifiable event WorkSafe has not been told about** outranks everything. The duty is "as soon as possible" (HSWA s 56) and every day since the event is a fact on the record. Phone 0800 030 040, then `worksafe <ref> --on= --ref=`.
   - **An overdue corrective action** is a risk the business knew about, dated, in its own records. From a notifiable event it is worse; the list flags those.
   - **Someone on the tools with no induction, or an expired one** works supervised or not at all until it is run. Contractors count (s 34).
   - **A high or critical hazard on PPE or paperwork alone** breaches the hierarchy (GRWM reg 6). Ask what would engineer it down.
   - **A stale review or investigation** is the register going quiet on the risks it exists for.
   - **An SDS gap, an overdue inspection, a quiet site** are the floor cracking: cheap today, expensive after an event.
3. For each item, say the one action: the command to run, the call to make, or the talk to hold. Name the owner.
4. Anything that needs paper is drafted, never sent: `npm run docs`, a person sends or makes the call.

If the operator asks "what should I do today", pick the top three and say why those three.
