# Moving off ecoPortal

ecoPortal (and SiteDocs, Donesafe and the rest of the safety-platform family) holds four things you need back: your people, your hazard and risk registers, your incident history, and your training records. All of them export, and one command brings them across.

## 1. Export from ecoPortal

Each register in ecoPortal exports from its own list view (the export lands as XLSX or CSV; save XLSX as CSV). Pull:

- **People / users** with name, role, company (for contractors), site and contact columns.
- **The hazard or risk register** with the hazard title, site, likelihood, consequence, controls and control type columns.
- **The incident / event register** with title, type, site, person, date, days lost, status, and any regulator-notified column it has.
- **Training / competency records** with person, course, completed and expiry columns.

ecoPortal users know the export ritual: reviewers on record note that exports need "quite a bit of formatting" before they are report-ready. Here the raw export is enough; the mapping below does the formatting.

SiteDocs and other platforms: same four exports, same command with `sitedocs` (or `csv`) as the source.

## 2. Dry run, then import

```bash
npm run safety -- import ecoportal --people=people.csv --hazards=hazards.csv --incidents=incidents.csv --trainings=training.csv --dry-run
npm run safety -- import ecoportal --people=people.csv --hazards=hazards.csv --incidents=incidents.csv --trainings=training.csv
```

The dry run prints exactly what the real run will create, update and skip; nothing is skipped silently. Column names are matched generously (`Name`/`Full Name`/`Worker`, `Hazard`/`Risk`/`Title`, `Likelihood`/`Consequence`/`Severity`, and so on). Sites are created from the site columns as they appear.

Then prove it landed:

```bash
npm run safety -- stats
npm run safety -- attention
npm run safety -- compliance
```

## What maps

| ecoPortal | Here |
|---|---|
| Users, contractors | `people`, with role and company mapped |
| Sites / locations | `sites`, created from the site columns |
| Risk register entries | `hazards`, with likelihood x consequence re-scored on the 5x5 and control text carried across |
| Incident / event reports | `incidents`, with the kind mapped (near miss, first aid, LTI, notifiable) and days lost |
| Regulator-notified dates | `worksafe_notified_on`, where the export carries them |
| Training and competencies | `trainings`, with expiry dates |

## What deliberately does not carry over

- **Workflow state, approvals and sign-off chains.** ecoPortal's routing (who approved what form, which step a report is on) is its product, not your data. Here an incident's state is the pipeline: reported, notified, investigated, closed.
- **Form layouts and custom form templates.** The questions your forms asked live on in the answers (the register rows); the form builder itself does not. New recurring questions become columns (`/customise`) or commands, which is cheaper than a form builder.
- **Attached photos and files.** They stay in your document store; the register keeps facts and references. Put file paths or URLs in notes where they matter.
- **Dashboards.** `npm run view` renders the safety board and the registers from the same data, in your brand, and `/new-view` adds pages the vendor never offered.

## The import is the first audit

Any imported notifiable event with no regulator-notified date lands at the top of `attention` the moment the import finishes. If it was reported and the export just did not carry the date, record it: `worksafe <ref> --on=<date> --ref=<reference>`. If it was not reported, you have just learned the most important thing the old system never surfaced.

Records of notifiable events are kept at least five years (HSWA s 57), so import the incident history even if you only plan to work forward.
