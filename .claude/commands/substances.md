---
description: The hazardous substances inventory with the safety data sheet state per line - the Hazardous Substances Regulations 2017 floor, kept current in three commands.
---

1. Run `npm run safety -- substances` (`--site=` to slice, `--all` for removed history). MISSING and STALE SDS rows sort to the top.
2. The floor is the Hazardous Substances Regulations 2017: an inventory of what is on site (reg 2.5) and a safety data sheet no more than five years old available for each (reg 2.7). The supplier must provide the SDS; ask them.
3. Fix a gap the day it shows: `substance sds "<name>" --dated=<the issue date printed on the sheet>`. The date is the sheet's, not today's.
4. New substance on site: `substance add "<name>" --site= --quantity= --location= --sds-dated=`. Gone from site: `substance remove "<name>"`; the row stays, because the inventory is history too.
5. If a substance is dangerous enough to need more than an SDS (certified handler, tracking, location compliance certificate), say so and stop: that is a conversation with a compliance certifier, not a database row. Nothing here is legal advice.
