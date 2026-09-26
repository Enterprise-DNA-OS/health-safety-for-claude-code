<h1 align="center">Health and Safety for Claude Code</h1>

<p align="center">
  <strong>The open-source health and safety system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your ecoPortal data brought across.<br/><a href="https://calendly.com/sam-mckay/discovery-call?utm_source=github&utm_medium=readme&utm_campaign=ecoportal">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/ecoportal?utm_source=github&utm_medium=readme&utm_campaign=ecoportal">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#compliance-checked-against-the-data">Compliance</a> &bull;
  <a href="#ten-questions-ecoportal-cannot-answer">Ten questions</a> &bull;
  <a href="#instead-of-ecoportal">Instead of ecoPortal</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Health and Safety for Claude Code does the job you pay ecoPortal, SiteDocs or Donesafe for, as a Postgres database and a set of Claude Code commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) and run the safety system in plain language. It runs the right query, and it can answer questions the incumbent's dashboard cannot.

A New Zealand business on the tools carries the same record everywhere: the hazards and what controls them, the incidents and what changed because of them, who is inducted and whose tickets expire, what chemicals are on site, when the crew was last talked to. The platforms that hold it quote each business privately, price by the module (their own reviewers note it "can become expensive to add modules"), and charge a setup project before the first record lands; published instals start around US$5,000 and the per-module subscription runs on top, every year.

This repo is that record over Postgres, with the asking done by the agent you already have:

```
/attention                        everything that wants a decision this morning, worst first
/report-incident                  something happened: on the record, notifiable duties surfaced
/notifiable                       the WorkSafe walkthrough: the call, the scene, the form, the record
/incidents                        the event register, the WorkSafe column loud
/hazards                          the risk register on the 5x5, weak controls called out
/actions                          what changes because of all of it, overdue first
/inductions                       who is on the tools without a ticket, contractors included
/inspections                      the calendar: site walks, plant checks, drills
/substances                       the hazardous substances inventory and its SDS gaps
/toolbox                          which crew has gone unheard, and this morning's talk recorded
/compliance                       eight rules from the Act and the Regulations, run against your records
/weekly-review                    the Monday review, written from three commands
```

The sharp edges are deliberate, because this is the domain where soft edges hurt people:

- **A notifiable event cannot be closed until WorkSafe has been notified** and the date is on the record (HSWA 2015 s 56). The CLI refuses, and there is no force flag. Reporting one prints the two duties on the spot: phone 0800 030 040 as soon as possible, preserve the scene (s 55).
- **An investigation that changes nothing is not finished.** Closing an incident with no corrective action recorded is refused, unless the reason nothing changes is itself recorded.
- **A high or critical hazard cannot enter the register bare.** Controls get recorded or the hazard does not land, and PPE-only on a high hazard stays loud on the attention list until the hierarchy has been worked (GRWM Regulations 2016 reg 6).

**Nothing here connects to WorkSafe and nothing sends.** The notification drafts to a folder with the particulars filled from the record; a person makes the call and sends the form. Nothing here is legal advice.

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your safety record sits in plain Postgres tables you own. Any tool can read them. No export request, no access ending when a subscription does.
- No per-module pricing, no seat count, no setup project. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/health-safety-for-claude-code.git
cd health-safety-for-claude-code
npm install
npm run demo
```

`npm run demo` creates the database, loads Harbourline Civil (a demo Tauranga contractor with a depot, two live sites, fourteen people and a fortnight gone slightly wrong: a notifiable injury from two days ago that WorkSafe has not been told about, the injured worker's height ticket expired 45 days before the fall, a corrective action six days overdue, a high excavation hazard on PPE alone, a contractor with an expired induction and a site sixteen days without a toolbox talk), then prints the attention list, the incident register and the compliance check.

Then open the folder in Claude Code and type:

```
/attention
```

Try `/incidents`, `/hazards`, `/inductions`, `/compliance`, `incident INC-201`, `person Ryan`, `/weekly-review`. When you are ready for real data, delete `.data/` and start with `/import`.

Fill in the "Who this is for" block in [CLAUDE.md](CLAUDE.md), especially who makes the WorkSafe call, and put your name and colours in [brand.json](brand.json) so every report and register carries them.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee. A business shares one database: each person clones the repo, points at the same `DATABASE_URL`, sets `SAFETY_PERSON` to their own name, and works in their own Claude Code.

## The commands

| Command | What it does |
|---|---|
| `/attention` | Everything that wants a decision, worst first: an unreported notifiable event outranks all. |
| `/report-incident` | Something happened: on the record the moment it is safe, with the WorkSafe duties surfaced if it is notifiable. |
| `/notifiable` | The notifiable event walkthrough: the call, the preserved scene, the written form, the five-year record. |
| `/incidents` | The event register, open first, the WorkSafe column loud. `incident <ref>` is the full card. |
| `/hazards` | The risk register on the 5x5, highest first, weak controls called out against the hierarchy. |
| `/actions` | Corrective actions, overdue first, the ones born from notifiable events flagged. |
| `/inductions` | The training matrix: who is on the tools without a current induction (contractors count), whose tickets expire. |
| `/inspections` | The calendar: site walks, audits, plant checks, drills. Closing one schedules the next. |
| `/substances` | The hazardous substances inventory with the SDS state per line. |
| `/toolbox` | Toolbox talks per site: who has gone unheard, this morning's talk recorded in one command. |
| `/site` | One site's whole position before the visit. |
| `/person` | One person's tickets, incidents and actions before the conversation. |
| `/weekly-review` | The Monday review, written from three commands. |
| `/compliance` | Eight rules from the Act and the Regulations, run against your records, each with its source. |
| `/draft-worksafe-notification` | The written notification drafted from the record. The phone call comes first; a person sends. |
| `/draft-site-report` | The board pack and the printable hazard register for the site office wall. |
| `/log` | A conversation, a decision, a scene fact, onto the record the moment it happens. |
| `/import` | Bring the business across from ecoPortal, SiteDocs or plain CSV. The import is the first audit. |
| `/customise` | Add a field, change a rule, rename things, in plain language. Writes and applies the migration. |
| `/new-view` | Add a read-only HTML dashboard from a description. |

Everything the commands do, the CLI does: `npm run safety -- help`. Any command takes `--json`.

### Documents and views, in your brand

```bash
npm run docs    # WorkSafe notification drafts, incident reports, site safety reports, printable hazard registers
npm run view    # the safety board and the registers, as read-only HTML dashboards
```

Both read [brand.json](brand.json), so your business's name, logo and colours are one file away. Documents land in `docs-out/`, views in `views/`. Print either to PDF from the browser; the hazard register is made for the site office wall. `/new-view` adds a view, `documents.json` adds a document.

## Compliance, checked against the data

`/compliance` runs the rules in [docs/compliance.md](docs/compliance.md) against your records and reports what is breached, each rule citing its source. The CLI enforces the sharpest ones at the gate: a notifiable event will not close with WorkSafe untold, an incident will not close with nothing changed and no reason, a high hazard will not register bare.

1. Every notifiable event reported to WorkSafe, as soon as possible (HSWA 2015 s 56; s 55 preserves the site).
2. No incident investigation open past thirty days (s 30, s 36: an event unexplained is a risk you chose not to understand).
3. No corrective action overdue (ss 30, 36: an overdue action is a risk you knew about, dated, in your own records).
4. No high or critical hazard held by administration or PPE alone (GRWM Regulations 2016 reg 6: the hierarchy of controls).
5. No hazard control review overdue (GRWM reg 8).
6. Nobody on the tools with a missing or expired site induction, contractors included (s 36(3)(f), GRWM reg 9, s 34).
7. Every in-use hazardous substance on the inventory with a current SDS (Hazardous Substances Regulations 2017 regs 2.5, 2.7).
8. Every active site with a toolbox talk inside the last fortnight (ss 58-61: worker engagement; the fortnight is your own standard).

Nothing there is legal advice. It is the rule book you point the system at, and you change it to match your business.

## Ten questions ecoPortal cannot answer

Every one of these is answered by the demo data today. Yours will be different, and that is the point.

1. Is there a notifiable event on our books right now that WorkSafe has not been told about, and how many days has it been?
2. Which corrective actions are overdue, who owns each one, and which of them came out of an event that hurt someone?
3. Who is on site this week with an expired induction or none at all, including the subcontractors?
4. Which high or critical hazards are held by PPE or paperwork alone, against the hierarchy of controls?
5. Which hazards have caused more than one incident, and did the control level actually climb after each?
6. Was anyone hurt doing work their expired ticket covers, and whose tickets expire in the next 60 days?
7. Which sites have gone longest without a toolbox talk, and does that line up with where the incidents are?
8. Which in-use substances have no current safety data sheet on the inventory?
9. Is our near-miss reporting drying up while injuries hold, per site, over twelve months?
10. Which inspections are overdue right now, and what did the last one find that never became an action?

## Your first hour: ten things to ask for

Open the folder in Claude Code and say these in your own words. Each one changes the system to fit your business.

1. "Put our sites and people in, and make me the owner of everything at the yard."
2. "Put our logo and colours on the reports and the hazard register, and change the business name to ours."
3. "Our inductions expire yearly, not two-yearly. Change the default and the check together."
4. "Add a permit-to-work table for hot works and confined space, with a command that shows open permits."
5. "Import our ecoPortal exports, then show me what the old system never told us."
6. "Add a compliance rule: no excavation hazard without a service location record on file."
7. "Track our vehicles and plant with WOF, rego and service expiries, like the training matrix."
8. "Build a page per supervisor for Monday: their site's hazards, actions and talks."
9. "When I report a notifiable event, render the WorkSafe draft in the same breath."
10. "Write a command that drafts the monthly board health and safety report from the trend and the attention list."

`/customise` writes the migration, applies it, updates every command that touches the change, and runs the tests.

## Instead of ecoPortal

Export your registers from ecoPortal (or SiteDocs, or anything that exports CSV), run one command, and the record comes with you. Step by step, with what maps and what deliberately does not carry over: [docs/replace-ecoportal.md](docs/replace-ecoportal.md).

```bash
npm run safety -- import ecoportal --people=people.csv --hazards=hazards.csv --incidents=incidents.csv --trainings=training.csv --dry-run
npm run safety -- import ecoportal --people=people.csv --hazards=hazards.csv --incidents=incidents.csv --trainings=training.csv
```

The import is the first audit: any imported notifiable event with no regulator-notified date lands at the top of the attention list the moment it finishes.

## Architecture

```
health-safety-for-claude-code/
  CLAUDE.md                 how the business wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  brand.json                your business's name, logo and colours on every report and register
  views.json                the HTML dashboards npm run view renders
  documents.json            the paperwork npm run docs renders
  .claude/commands/         the slash commands
  scripts/safety.mjs        the CLI the commands drive
  scripts/view.mjs          read-only HTML dashboards from the SQL views
  scripts/docs.mjs          the documents, one HTML file per record
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema, tables and views
  supabase/seed.sql         demo data
  docs/compliance.md        the rules /compliance checks, each with its source
  docs/replace-ecoportal.md moving off the incumbent
  docs/why-no-front-end.md  the honest trade-offs
  exports/                  whole database dumps
  drafts/                   anything written for a person to send
```

## Built with Claude Code

This repository was built with Claude Code as the primary development tool, from the schema to the commands, and it is meant to be extended the same way. Ask for a new command and it writes one.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end, no WorkSafe credentials, nothing that sends, and the notifiable gate stays.

## Want it installed and run for you?

Enterprise DNA installs Health and Safety for Claude Code for your business, migrates your ecoPortal data, writes your industry's rules and rituals in as commands, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: https://calendly.com/sam-mckay/discovery-call?utm_source=github&utm_medium=readme&utm_campaign=ecoportal
- Read more: https://enterprisedna.co/omni/instead-of/ecoportal?utm_source=github&utm_medium=readme&utm_campaign=ecoportal

## License

MIT. Copyright (c) 2026 Enterprise DNA.
