---
description: The written WorkSafe notification for a notifiable event, drafted from the record into docs-out/. The phone call comes first and a person sends the form - nothing here notifies anyone.
---

1. Confirm the phone call happened first: `npm run safety -- incident <ref>`. The duty is phone as soon as possible (0800 030 040, HSWA s 56), written within 48 hours of that. If the call has not been made, stop and say so: the call outranks the paperwork.
2. Render the draft: `npm run docs -- worksafe-notification-draft`. One page per notifiable event still un-notified lands in `docs-out/worksafe-notification-draft/`, carrying the particulars WorkSafe's form asks for: what happened, where and when, who was involved and their employer, what has been done at the scene, all from the record.
3. Check it against the scene log (`incident <ref>` shows the notes). A gap in the draft is a gap in the record: `log <ref> "..."` the missing fact, then re-render. Never type a fact straight into the draft.
4. A person completes WorkSafe's actual form (worksafe.govt.nz, or the number they give on the phone) from this page and sends it. Then record the reference: `worksafe <ref> --ref="<their reference>"`.

Nothing here connects to WorkSafe or sends anything, deliberately. The record keeps the person honest; the person does the notifying. Nothing here is legal advice.
