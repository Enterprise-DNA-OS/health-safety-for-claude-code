---
description: The incident register - open events first, the WorkSafe column loud - or one incident's full card with its investigation, actions and scene log.
---

1. One incident: `npm run safety -- incident <ref>` (a bare number works: "201" finds INC-201). The register: `npm run safety -- incidents` for open ones, `--all` for everything, `--site=` and `--kind=` to slice.
2. Present it as the pipeline it is: reported, WorkSafe told if notifiable, investigated, actions raised, closed. For each open event, say the next verb.
3. Anything notifiable with `NOT NOTIFIED` in the WorkSafe column stops the conversation: that is the `/notifiable` walkthrough, now.
4. An event open past a fortnight is going stale; past thirty days it fails `/compliance`. Say which and by how much.
5. If the operator asks "how are we trending", run `npm run safety -- trend`: near misses drying up while injuries hold is a reporting problem, not a safety improvement. Say so if the numbers show it.
