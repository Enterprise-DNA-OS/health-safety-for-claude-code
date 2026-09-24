# The rule book `/compliance` runs

Eight rules, each with its source, each checked against the live records by `npm run safety -- compliance`. The CLI enforces the sharpest ones at the gate; the rest are checks that report. Change any of them to match your business: the rule, the threshold and the check live together (`/customise` edits both).

**None of this is legal advice.** These are the rules this business has told the system to enforce, with the sources they came from. The law is WorkSafe's to interpret (worksafe.govt.nz), and the sections below are the reading list, not the reading.

## 1. Every notifiable event reported to WorkSafe, as soon as possible

**Source:** Health and Safety at Work Act 2015, s 56 (duty to notify WorkSafe of a notifiable event as soon as possible after becoming aware of it, then in writing within 48 hours if required), ss 23-25 (what counts: a death, a notifiable injury or illness, a notifiable incident). s 55 requires the site be preserved until an inspector allows otherwise.

**The check:** any incident of a notifiable kind with no `worksafe_notified_on` date.

**The gate:** `close` refuses a notifiable event with WorkSafe untold, and there is no `--force`. The phone number is 0800 030 040.

## 2. No incident investigation open past thirty days

**Source:** HSWA 2015 s 30 (risks dealt with so far as reasonably practicable) and s 36 (the primary duty of care). An event a month old with no findings is a risk the business has chosen not to understand, and the next event will read that way.

**The check:** any incident not closed whose event date is more than 30 days back. (The attention list starts nagging at 14.)

**The gate:** `close` refuses an incident with no findings recorded, and refuses one with no corrective action unless `--no-action --note=` records why nothing changes.

## 3. No corrective action overdue

**Source:** HSWA 2015 ss 30 and 36. An action written down and left overdue is a hazard the business identified, dated, and did not fix, in its own records. After an event it is the first exhibit.

**The check:** any open action with `due_on` in the past. Actions born from notifiable events are flagged separately on the attention list.

## 4. No high or critical hazard held by administration or PPE alone

**Source:** Health and Safety at Work (General Risk and Workplace Management) Regulations 2016, reg 6: the hierarchy of controls. Elimination, then substitution, isolation and engineering controls; administrative controls and PPE only so far as the higher levels are not reasonably practicable.

**The check:** any open hazard scoring 10+ on the 5x5 whose recorded control level is `administration`, `ppe` or nothing.

**The gate:** `hazard add` refuses a high or critical hazard with no controls recorded at all.

## 5. No hazard control review overdue

**Source:** GRWM Regulations 2016, reg 8: control measures must be reviewed (and revised when they are not fit for purpose), including after a notifiable event or when new information arrives. A register nobody re-reads is a register in name only.

**The check:** any open hazard with `review_due_on` in the past. `hazard review` records the walk and sets the next date.

## 6. Nobody on the tools with a missing or expired site induction

**Source:** HSWA 2015 s 36(3)(f) and GRWM Regulations 2016 reg 9: the information, training, instruction and supervision necessary to protect people from the risks of their work. Contractors count: PCBUs with overlapping duties must consult, cooperate and coordinate (s 34), and an un-inducted subcontractor on your site is your problem too.

**The check:** any active person with a role on the tools (everyone but `office`) whose latest `site induction` training row is missing or expired. Inductions default to two years here; change it to match your business.

## 7. Every in-use hazardous substance on the inventory, with a current safety data sheet

**Source:** Health and Safety at Work (Hazardous Substances) Regulations 2017: an inventory of the hazardous substances at the workplace (reg 2.5) and a safety data sheet, no more than five years old, obtained and available for each (reg 2.7). The supplier must provide the SDS.

**The check:** any `in_use` substance with no SDS date, or one more than five years old.

**Beyond the floor:** some substances need certified handlers, tracking or location compliance certificates. That is a compliance certifier conversation, not a database row; the inventory tells you which conversation to have.

## 8. Every active site with a toolbox talk inside the last fortnight

**Source:** HSWA 2015 ss 58-61: engage with workers on health and safety matters and have worker participation practices. The duty is ongoing; the fortnight is this business's own standard, and you should change it to yours.

**The check:** any active site whose last recorded toolbox talk is more than 14 days back, or that has none.

## Keeping records

Records of notifiable events are kept at least five years (HSWA s 57). Nothing in this system deletes: people become `former`, substances become `removed`, hazards close with a reason, and the rows stay. `npm run safety -- export` dumps the whole database as plain JSON whenever you want a copy somewhere else.
