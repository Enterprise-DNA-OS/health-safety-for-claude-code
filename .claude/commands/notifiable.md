---
description: The notifiable event walkthrough - the WorkSafe phone call, the preserved scene, the written notification, the investigation, and the record that has to survive five years.
---

Run this the moment an event might be notifiable (a death, a notifiable injury or illness, a notifiable incident: HSWA ss 23-25).

1. Show the state: `npm run safety -- incidents` and the incident card `incident <ref>`. If the event is not on the register yet, `/report-incident` first.
2. Walk the duties in order, checking each against the record:
   - **People first.** Nothing below matters until everyone is safe and cared for.
   - **Phone WorkSafe as soon as possible: 0800 030 040** (s 56). If the call has been made, record it now: `worksafe <ref> --on=<date of the call> --ref="<their reference>"`. If it has not, that is the whole answer: the operator makes the call before anything else.
   - **Preserve the scene** (s 55). Nothing moves except to help someone, make the site safe, or as police direct, until an inspector says so. `log <ref>` what was done at the scene.
   - **Written notification within 48 hours of the call** (s 56(3)): `npm run docs -- worksafe-notification-draft` renders the particulars from the record. A person reviews and sends it; it is a draft until they do.
3. Then the learning: `investigate <ref> --findings=`, `action add` for what changes, and only then `close <ref>`. The CLI refuses to close a notifiable event WorkSafe has not been told about, and refuses to close any investigation with no action and no reason.
4. Say plainly at the end: this record is kept at least five years (s 57). Nothing here deletes it.

Never state whether an event legally qualifies as notifiable: WorkSafe's triage line answers that. Record what happened, cite the sections, and keep the operator moving through the duties. Nothing here is legal advice.
