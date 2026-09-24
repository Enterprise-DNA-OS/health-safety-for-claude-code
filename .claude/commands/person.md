---
description: One person's whole safety record - tickets and expiries, incidents they were involved in, actions they own - read it before the conversation.
---

1. Run `npm run safety -- person "<name>"` (partial names resolve; ambiguous ones list candidates).
2. The card answers the questions that matter before a conversation, a return-to-work, or a contractor renewal: are their tickets current, what has happened to them, what do they owe the list.
3. Cross-read tickets against incidents and say what you see: an expired ticket beside an incident doing that work is a finding, plainly stated, not an accusation.
4. Changes: `person set "<name>" --site= --role= --phone=`. Someone leaving is `person set "<name>" --status=former`, never a deletion: their training and incident history is the business's record, and notifiable-event records are kept five years (HSWA s 57).
5. New person: `add person "<name>" --role= --company= --site=`, then `induct "<name>"` before their first shift.
