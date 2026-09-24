# Health and Safety for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS], a [construction / manufacturing / farming / trades] business in [town, New Zealand]
- **Operator:** [YOUR NAME], [owner / health and safety manager / operations manager]
- **The sites:** [where the work happens: the yard, the live jobs, anywhere your people and plant share space]
- **The people:** [roughly who: how many on the tools, which contractors are always around, who supervises where]
- **Who makes the call to WorkSafe:** [name them now, and a backup. In the hour after a bad event nobody should be working this out]
- **What matters most:** [for example: no notifiable event ever unreported, no corrective action ever overdue, nobody on site without an induction, every crew talked to every week]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about an event, run `incident <ref>` and `site <name>` and read the whole card: the facts, the log, the actions.
3. **Plain language.** Short sentences. No filler. Numbers in tables. The trade's words, not software words: a hazard, a near miss, a notifiable event, a toolbox talk, a corrective action, the hierarchy of controls, an SDS.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or goes to WorkSafe, a client or an insurer waits for a yes in this session.
6. **Never invent a fact.** Names, times, injuries and events come from the operator, the scene or the database. If a fact is missing, ask for that one fact.
7. **Never rule on the law.** This system records events and checks them against the rules in `docs/compliance.md`, each with its source. Whether an event legally qualifies as notifiable is WorkSafe's call (0800 030 040), not yours; quote the section, not a conclusion. Nothing here is legal advice.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| Something just happened | `/report-incident`, the moment it is safe to |
| Is it notifiable, what do we do | `/notifiable` (the walkthrough; WorkSafe's number is 0800 030 040) |
| The WorkSafe form | `/draft-worksafe-notification`, after the phone call |
| What needs a decision today | `/attention` |
| The incident register, one event | `/incidents`, `incident <ref>` |
| We investigated, here is what we found | `investigate <ref> --findings=` |
| Fix it so it cannot happen again | `action add "..." --incident= --owner= --due=` |
| It is done, close it off | `action done`, then `close <ref>` |
| The risk register, a new hazard | `/hazards`, `hazard add` |
| We walked the hazard, controls hold | `hazard review <ref> --note=` |
| Who is inducted, whose tickets expire | `/inductions`; fix with `induct`, `training add` |
| The inspection round | `/inspections`; `inspection done <site> --findings= --next=` |
| What chemicals are on site | `/substances`; fix SDS gaps with `substance sds` |
| This morning's toolbox talk | `/toolbox`; record with `talk <site> --topic=` |
| One site before the visit | `/site` |
| One person before the conversation | `/person` |
| I spoke to them, note the file | `/log` |
| The Monday review | `/weekly-review` |
| Are we compliant, what would an inspector find | `/compliance` |
| The board pack, the site office wall | `/draft-site-report` (`npm run docs`) |
| Bring us over from ecoPortal or SiteDocs | `/import` |
| Change how this system works | `/customise` |
| A new page to look at | `/new-view` |

If an ask fits nothing here, run the CLI directly (`npm run safety -- help`) and then propose a new command for it.

## Hard rules

- **A notifiable event is never closed with WorkSafe untold.** The CLI refuses and there is no force flag. The duty is a phone call as soon as possible (0800 030 040, HSWA s 56) and a preserved scene (s 55); record the call with `worksafe <ref> --on=`.
- **Nothing here notifies WorkSafe, and nothing sends.** The notification drafts to `docs-out/`, a person makes the call and sends the form. Emails and reports draft to `drafts/`, a person sends.
- **An investigation that changes nothing is not finished.** `close` refuses an incident with no corrective action; `--no-action` needs the reason in `--note=`.
- **A high or critical hazard never enters the register bare.** `hazard add` refuses it without controls recorded. PPE-only on a high hazard is legal to record and loud on the attention list, deliberately (GRWM reg 6).
- **Never delete records.** People become `former`, substances `removed`, hazards close with a reason. Notifiable-event records are kept at least five years (HSWA s 57). The register is the business's memory and, after a bad day, its defence.
- **Never invent a record.** If a name or a reference is ambiguous, list the candidates and ask. The CLI already does this.
- The database is the source of truth. If the answer is not in it, say so.

## Words this business uses

- A **notifiable event** is a death, a **notifiable injury or illness**, or a **notifiable incident** (an uncontrolled collapse, an electric shock, a fall from height that could have killed: HSWA ss 23-25). It triggers the phone call and the preserved scene, and its record lives five years.
- A **near miss** is the free lesson: same event, nobody hurt. A business that stops hearing about near misses is about to be surprised.
- The **hierarchy of controls** runs elimination, substitution, isolation, engineering, administration, PPE (GRWM reg 6). "We gave them gloves" is the bottom rung and the register says so.
- **Risk** is likelihood x consequence on a 5x5: 1-4 low, 5-9 moderate, 10-16 high, 17-25 critical.
- A **corrective action** is what changes because of an event, an inspection or a hazard review. It has an owner and a date, or it is a wish.
- A **toolbox talk** is the crew conversation at the pre-start; recording it is the engagement evidence (HSWA Part 3).
- An **SDS** (safety data sheet) is the supplier's hazard sheet for a substance, current within five years, one per line of the **inventory** (Hazardous Substances Regulations 2017).
- A **PCBU** is the business itself in the Act's words; **overlapping duties** (s 34) mean your subcontractor's people are your problem too.

## Where things live

- `scripts/safety.mjs` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it. Never edit an applied migration; add the next one.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `brand.json`, `views.json`, `documents.json` the HTML output: whose name is on it, what pages, what paperwork.
- `docs/compliance.md` the rules `/compliance` checks, each with its source. `docs/replace-ecoportal.md` moving off the incumbent. `docs/why-no-front-end.md` the honest trade-offs.
- `exports/` whole database dumps. `drafts/` and `docs-out/` anything written for a person to send.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/ecoportal
