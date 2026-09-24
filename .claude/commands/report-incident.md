---
description: Record an incident the moment it is safe to - a near miss, an injury, plant or environmental damage - and if it is notifiable, surface the WorkSafe duties immediately.
---

The operator will describe what happened in their own words. Get it on the record fast and completely.

1. Work out the kind honestly: `near_miss`, `first_aid`, `medical`, `lost_time`, `notifiable_injury`, `notifiable_incident`, `death`, `property`, `environment`. If in doubt between two, take the worse honest reading: reclassifying down with evidence is easy, and WorkSafe's triage line (0800 030 040) will tell you whether it qualifies.
2. Run it:
   ```
   npm run safety -- report "<site>" --kind=<kind> --title="<one line>" --person="<who was hurt or involved>" --by="<who is reporting>" --description="<what happened, plainly>" [--hazard=HAZ-xxx] [--days-lost=]
   ```
3. **If it is notifiable, the CLI prints the two duties. Repeat them to the operator now:** phone WorkSafe as soon as possible (0800 030 040, s 56) and preserve the scene (s 55). Then `/notifiable` walks the rest.
4. Link it to the hazard register (`--hazard=`) if the register already names this hazard; if it does not, that is a finding in itself: `hazard add` after the dust settles.
5. Log everything that happens at the scene as it happens: `log <ref> "scene taped off, photos taken"`. Those notes become the WorkSafe notification draft and the investigation record.

Facts come from the operator and the scene. Never invent a name, a time, or an injury. If a fact is missing, ask for that one fact.
