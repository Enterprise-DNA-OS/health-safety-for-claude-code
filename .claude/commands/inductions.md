---
description: The training matrix - who is inducted, who is not, whose tickets are expiring - contractors included, and the one-command fix.
---

1. Run `npm run safety -- inductions`. The top table is site inductions for everyone active on the tools (contractors included: overlapping duties, HSWA s 34); the bottom is every other ticket expired or expiring inside 30 days.
2. `MISSING` and `EXPIRED` rows are today's work: those people work supervised or not at all until the induction runs. Run it and record it: `induct "<name>" --on=today` (two-year expiry by default, `--expires=` to override).
3. Other tickets: `training add "<name>" --course="working at heights" --on= --expires= --provider=`. When a ticket expires, ask the sharper question: has this person done that work since it expired? `person <name>` shows their incidents beside their tickets.
4. Expiring rows inside 30 days: book the refreshers now and log who was told.
5. A new starter is two commands, in this order: `add person "<name>" --role= --site=`, then `induct "<name>"` before their first shift.
