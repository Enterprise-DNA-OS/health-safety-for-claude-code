#!/usr/bin/env node
// End-to-end smoke test on a throwaway embedded database.
// Runs migrate, seed, then every CLI command that matters, and asserts on the JSON.
// Passes on Windows and Linux. No network, no Postgres install.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = mkdtempSync(path.join(tmpdir(), 'safety-smoke-'));
const env = { ...process.env, DATA_DIR: dataDir };
delete env.DATABASE_URL; // the smoke test always runs embedded
delete env.SAFETY_PERSON;

let step = 0;
function run(label, args, { json = true, expectFail = false } = {}) {
  step++;
  const argv = [path.join(root, 'scripts', args[0]), ...args.slice(1), ...(json ? ['--json'] : [])];
  const res = spawnSync(process.execPath, argv, { cwd: root, env, encoding: 'utf8' });
  const ok = expectFail ? res.status !== 0 : res.status === 0;
  if (!ok) {
    console.error(`\nFAIL step ${step} (${label}): exit ${res.status}\n--- stdout\n${res.stdout}\n--- stderr\n${res.stderr}`);
    process.exit(1);
  }
  console.log(`  ok  ${String(step).padStart(2)}  ${label}`);
  if (!json || expectFail) return { stdout: res.stdout, stderr: res.stderr };
  try {
    return JSON.parse(res.stdout);
  } catch {
    console.error(`\nFAIL step ${step} (${label}): output is not JSON\n${res.stdout}\n${res.stderr}`);
    process.exit(1);
  }
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`\nFAIL assertion: ${msg}`);
    process.exit(1);
  }
}

const n = (v) => Number(v ?? 0);

function addDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// Local date, the same way the CLI computes "today". Never UTC: New Zealand is
// twelve hours ahead of it.
const todayIso = (() => {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
})();

console.log(`smoke: data dir ${dataDir}`);
try {
  run('migrate', ['migrate.mjs'], { json: false });
  run('migrate again (idempotent)', ['migrate.mjs'], { json: false });
  run('seed', ['seed.mjs'], { json: false });
  run('seed again (idempotent)', ['seed.mjs'], { json: false });

  // ---- the business ---------------------------------------------------------

  const people = run('people', ['safety.mjs', 'people']);
  assert(people.length === 14, `fourteen active people (${people.length})`);
  assert(people.some((p) => p.role === 'contractor' && p.company), 'contractors carry their company');

  const sites = run('sites', ['safety.mjs', 'sites']);
  assert(sites.length === 3, `three sites (${sites.length})`);
  const omokoroa = sites.find((s) => s.site.startsWith('Omokoroa'));
  assert(n(omokoroa.unreported_notifiable) === 1, 'the unreported notifiable event shows on its site line');

  const person = run('person card', ['safety.mjs', 'person', 'Ryan']);
  assert(person.person.full_name === 'Ryan Duffell', 'resolved by partial name');
  assert(person.trainings.some((t) => t.course === 'working at heights' && t.ticket_status === 'expired'),
    'his working-at-heights ticket shows expired, 45 days before the fall');
  assert(person.incidents.length >= 1, 'with his incident attached');

  const noSuch = run('an unknown person exits 1', ['safety.mjs', 'person', 'nobody at all'], { json: false, expectFail: true });
  assert(/No person matches/.test(noSuch.stderr), 'and says so plainly');

  const ambiguous = run('an ambiguous name exits 1 and lists candidates', ['safety.mjs', 'person', 'a'], { json: false, expectFail: true });
  assert(/matches \d+ person records/.test(ambiguous.stderr), 'with the candidates listed');

  // ---- the registers ---------------------------------------------------------

  const hazards = run('hazards', ['safety.mjs', 'hazards']);
  assert(hazards.length === 9, `nine open hazards (${hazards.length})`);
  assert(hazards[0].score >= hazards[hazards.length - 1].score, 'highest risk first');
  const haz101 = hazards.find((h) => h.ref === 'HAZ-101');
  assert(haz101.band === 'high' && haz101.control_level === 'ppe', 'the PPE-only high excavation hazard is there');
  const haz102 = hazards.find((h) => h.ref === 'HAZ-102');
  assert(haz102.band === 'critical' && haz102.score === 20, 'the plant interface scores critical');

  const hazAll = run('hazards --all includes closed', ['safety.mjs', 'hazards', '--all']);
  assert(hazAll.length === 10, `ten with the closed one (${hazAll.length})`);

  const bySite = run('hazards filtered by site', ['safety.mjs', 'hazards', '--site=Pyes Pa']);
  assert(bySite.every((h) => h.site === 'Pyes Pa Ridge Subdivision'), 'site filter holds');

  const hazCard = run('hazard card by bare number', ['safety.mjs', 'hazard', '101']);
  assert(hazCard.hazard.ref === 'HAZ-101', 'HAZ-101 resolves from "101"');
  assert(hazCard.incidents.length === 2, 'with the near miss and the collapse it caused attached: the repeat-offender view no dashboard has');

  const incidents = run('incidents (open)', ['safety.mjs', 'incidents']);
  assert(incidents.length === 3, `three open incidents (${incidents.length})`);
  const incAll = run('incidents --all', ['safety.mjs', 'incidents', '--all']);
  assert(incAll.length === 8, `eight on the register (${incAll.length})`);

  const inc201 = run('incident card', ['safety.mjs', 'incident', 'INC-201']);
  assert(inc201.incident.notifiable === true && !inc201.incident.worksafe_notified_on, 'INC-201 is notifiable and unreported');
  assert(inc201.actions.length === 2, 'with its two corrective actions');
  assert(inc201.notes.length === 2, 'and the scene log');

  const byKind = run('incidents filtered by kind', ['safety.mjs', 'incidents', '--kind=near_miss', '--all']);
  assert(byKind.length === 2 && byKind.every((i) => i.kind === 'near_miss'), 'two near misses');

  // ---- actions, inductions, inspections, substances, talks -------------------

  const actions = run('actions', ['safety.mjs', 'actions']);
  assert(actions.length === 6, `six open actions (${actions.length})`);
  assert(actions.filter((a) => n(a.days_to_due) < 0).length === 2, 'two overdue');

  const inductions = run('inductions', ['safety.mjs', 'inductions']);
  assert(inductions.inductions.length === 13, `thirteen people on the tools (${inductions.inductions.length})`);
  assert(inductions.inductions.some((i) => i.person === 'Grant Molloy' && i.induction === 'MISSING'), 'the new starter has none');
  assert(inductions.inductions.some((i) => i.person === 'Wiremu Beattie' && i.induction === 'EXPIRED'), 'the contractor is expired');
  assert(inductions.other_tickets.some((t) => t.person === 'Ryan Duffell' && t.ticket_status === 'expired'), 'the expired heights ticket surfaces');

  const inspections = run('inspections due', ['safety.mjs', 'inspections']);
  assert(inspections.some((i) => i.kind === 'site_inspection' && n(i.days_to_due) < 0), 'the overdue site inspection shows');

  const substances = run('substances', ['safety.mjs', 'substances']);
  assert(substances.length === 5, `five in use (${substances.length})`);
  assert(substances.some((s) => s.sds === 'MISSING') && substances.some((s) => s.sds === 'STALE'), 'the SDS gaps are loud');

  const toolbox = run('toolbox per site', ['safety.mjs', 'toolbox']);
  assert(toolbox.find((t) => t.site.startsWith('Omokoroa')).days_since === 16, 'Omokoroa has been quiet 16 days');

  const trend = run('trend', ['safety.mjs', 'trend']);
  assert(trend.length >= 2, 'the twelve-month trend has months in it');

  // ---- attention and compliance -----------------------------------------------

  const attention = run('attention', ['safety.mjs', 'attention']);
  assert(attention.length >= 12, `the attention list is loud (${attention.length})`);
  assert(attention[0].reason === 'notifiable_unreported', 'the unreported notifiable event outranks everything');
  for (const reason of ['notifiable_unreported', 'action_overdue', 'induction_missing', 'induction_expired', 'hazard_uncontrolled', 'hazard_review_overdue', 'investigation_stale', 'inspection_overdue', 'sds_gap', 'training_expiring', 'toolbox_quiet']) {
    assert(attention.some((a) => a.reason === reason), `attention carries ${reason}`);
  }

  const compliance = run('compliance', ['safety.mjs', 'compliance']);
  assert(compliance.length === 8, 'eight rules in the book');
  const failed = compliance.filter((r) => r.breaches.length);
  assert(failed.map((r) => r.key).sort().join(',') === 'actions,controls,engagement,inductions,notifiable,reviews,substances',
    `the seeded breaches are exactly the story (${failed.map((r) => r.key).join(',')})`);
  assert(!failed.some((r) => r.key === 'investigations'), 'the 26-day investigation has four days before that rule fails');

  const oneRule = run('one compliance rule', ['safety.mjs', 'compliance', 'notifiable']);
  assert(oneRule.length === 1 && oneRule[0].breaches.length === 1, 'run one rule on its own');

  run('stats', ['safety.mjs', 'stats']);

  // ---- the WorkSafe gate, end to end ----------------------------------------------

  const blockedClose = run('closing an unreported notifiable event is refused', ['safety.mjs', 'close', 'INC-201'], { json: false, expectFail: true });
  assert(/WorkSafe has not been notified/.test(blockedClose.stderr), 'and the refusal cites s 56');

  const wrongWorksafe = run('worksafe on a non-notifiable incident is refused', ['safety.mjs', 'worksafe', 'INC-204'], { json: false, expectFail: true });
  assert(/not a notifiable event/.test(wrongWorksafe.stderr), 'notification is for notifiable events');

  const notified = run('record the WorkSafe notification', ['safety.mjs', 'worksafe', 'INC-201', '--on=today', '--ref=WSN-2026-51002']);
  assert(notified.worksafe_ref === 'WSN-2026-51002', 'with their reference');

  run('record the findings', ['safety.mjs', 'investigate', 'INC-201',
    '--findings=Ryan reached past the gated edge to guide the lift; his working at heights ticket had expired 45 days earlier and the refresher was never booked. Gate latch stiffness was known from the last scaffold check.']);

  const closed = run('now it closes', ['safety.mjs', 'close', 'INC-201']);
  assert(closed.status === 'closed', 'closed with WorkSafe told, findings and actions on the record');

  const attentionAfter = run('the top attention item clears', ['safety.mjs', 'attention']);
  assert(!attentionAfter.some((a) => a.reason === 'notifiable_unreported'), 'no unreported notifiable event left');

  // ---- an incident with nothing learned cannot close --------------------------------

  const fresh = run('report a near miss', ['safety.mjs', 'report', 'Matapihi Depot', '--kind=near_miss',
    '--title=Forklift tine clipped the racking upright', '--by=Rachel']);
  assert(/^INC-\d+$/.test(fresh.ref), `the ref is minted (${fresh.ref})`);
  assert(fresh.notifiable === false, 'a near miss is not notifiable');

  const noAction = run('closing with no action is refused', ['safety.mjs', 'close', fresh.ref, '--findings=Rack leg bent.'], { json: false, expectFail: true });
  assert(/no corrective action/.test(noAction.stderr), 'an investigation that changes nothing is not finished');

  const noNote = run('--no-action without the reason is refused', ['safety.mjs', 'close', fresh.ref, '--findings=x', '--no-action'], { json: false, expectFail: true });
  assert(/needs the reason/.test(noNote.stderr), 'no action is a decision, and decisions get recorded');

  run('action add', ['safety.mjs', 'action', 'add', 'Bolt rack protection to the upright', `--incident=${fresh.ref}`, '--owner=Kevin', '--due=' + addDays(todayIso, 7)]);
  run('close with the action recorded', ['safety.mjs', 'close', fresh.ref, '--findings=Speed and a blind corner; protection ordered.']);
  run('action done', ['safety.mjs', 'action', 'done', 'Bolt rack protection']);

  // ---- reporting a notifiable event prints the duty ----------------------------------

  const notifiableOut = run('reporting a notifiable event prints the s 55/56 duties', ['safety.mjs', 'report', 'Matapihi Depot',
    '--kind=notifiable_incident', '--title=Yard crane sling failed under a suspended load', '--by=Rachel'], { json: false });
  assert(/0800 030 040/.test(notifiableOut.stdout) && /s 56/.test(notifiableOut.stdout), 'phone number and section cited');
  assert(/Preserve the site/.test(notifiableOut.stdout), 'and the scene preservation duty');
  const yardRef = (notifiableOut.stdout.match(/INC-\d+/) || [])[0];
  run('notify and record it', ['safety.mjs', 'worksafe', yardRef, '--on=today']);

  // ---- the hazard gates ------------------------------------------------------------------

  const noControls = run('a high hazard with no controls is refused', ['safety.mjs', 'hazard', 'add', 'Matapihi Depot',
    '--title=Unrestrained gas cylinders in the container', '--category=substance', '--likelihood=4', '--consequence=4'], { json: false, expectFail: true });
  assert(/does not go on the register with no controls/.test(noControls.stderr), 'and the refusal explains the hierarchy');

  const newHaz = run('with controls it registers', ['safety.mjs', 'hazard', 'add', 'Matapihi Depot',
    '--title=Unrestrained gas cylinders in the container', '--category=substance', '--likelihood=4', '--consequence=4',
    '--controls=Cylinders chained upright in the cage, valves capped', '--control-level=engineering', '--owner=Kevin']);
  assert(/^HAZ-\d+$/.test(newHaz.ref), `the ref is minted (${newHaz.ref})`);
  assert(newHaz.status === 'controlled', 'and lands controlled');

  const badRating = run('a rating outside 1-5 is refused', ['safety.mjs', 'hazard', 'add', 'Matapihi Depot',
    '--title=x', '--likelihood=7', '--consequence=2'], { json: false, expectFail: true });
  assert(/1-5/.test(badRating.stderr), 'the matrix is 5x5');

  run('hazard review', ['safety.mjs', 'hazard', 'review', 'HAZ-103', '--note=Walked the TMP with the KiwiCone crew; signage moved for the school term.', '--review=' + addDays(todayIso, 90)]);
  const reviewed = run('the review overdue clears', ['safety.mjs', 'compliance', 'reviews']);
  assert(reviewed[0].breaches.length === 0, 'no review overdue now');

  // ---- people, inductions, substances, talks move ---------------------------------------------

  run('induct the new starter', ['safety.mjs', 'induct', 'Grant Molloy', '--on=today']);
  run('re-induct the contractor', ['safety.mjs', 'induct', 'Wiremu Beattie', '--on=today']);
  const inductionsAfter = run('inductions clear', ['safety.mjs', 'compliance', 'inductions']);
  assert(inductionsAfter[0].breaches.length === 0, 'nobody on the tools without a current induction');

  run('training add', ['safety.mjs', 'training', 'add', 'Ryan Duffell', '--course=working at heights', '--on=today', '--expires=' + addDays(todayIso, 730), '--provider=Vertical Horizonz']);

  run('record the SDS', ['safety.mjs', 'substance', 'sds', 'Denso', '--dated=' + addDays(todayIso, -100)]);
  run('substance add', ['safety.mjs', 'substance', 'add', 'Two-stroke fuel mix', '--site=Matapihi Depot', '--quantity=20 L', '--location=Workshop store', '--sds-dated=' + addDays(todayIso, -50)]);

  run('toolbox talk at the quiet site', ['safety.mjs', 'talk', 'Omokoroa Stormwater', '--topic=INC-201: the scaffold, the gate and expired tickets', '--by=Steve', '--attendees=6']);
  const engagement = run('engagement clears', ['safety.mjs', 'compliance', 'engagement']);
  assert(engagement[0].breaches.length === 0, 'every site has talked inside a fortnight');

  run('inspection done', ['safety.mjs', 'inspection', 'done', 'Omokoroa Stormwater', '--kind=site_inspection',
    '--findings=Trench shields in place, spoil back from the edge. Gate latch on the scaffold top lift still stiff.', '--by=Steve', '--next=' + addDays(todayIso, 7)]);
  run('inspection add', ['safety.mjs', 'inspection', 'add', 'Matapihi Depot', '--kind=emergency_drill', '--due=' + addDays(todayIso, 30)]);

  run('log a call', ['safety.mjs', 'log', 'INC-202', 'Physio signed Sione back to full duties from Monday.', '--by=Steve']);
  run('add person', ['safety.mjs', 'add', 'person', 'Tessa Bright', '--role=worker', '--site=Matapihi Depot']);
  run('person set former', ['safety.mjs', 'person', 'set', 'Dale Hartmann', '--status=former']);

  // ---- import ------------------------------------------------------------------

  const peopleCsv = path.join(dataDir, 'people.csv');
  const hazardsCsv = path.join(dataDir, 'hazards.csv');
  const incidentsCsv = path.join(dataDir, 'incidents.csv');
  writeFileSync(peopleCsv, [
    'Name,Role,Company,Site,Phone',
    '"Mere Ratima",Supervisor,,Katikati Depot,021 555 0200',
    '"Josh Cardno",Subcontractor,"Cardno Sparks Ltd",Katikati Depot,021 555 0201',
    '"Kevin Bruce",Worker,,Matapihi Depot,',
  ].join('\n'));
  writeFileSync(hazardsCsv, [
    'Hazard,Site,Likelihood,Consequence,Controls,Control Type,ID',
    '"Live switchboard work in the pump shed",Katikati Depot,3,5,"Isolation and lockout by the electrician",Isolation,EP-H-901',
    '"Wasp nests along the access track",Katikati Depot,3,2,"Marked and sprayed each spring",Administration,EP-H-902',
  ].join('\n'));
  writeFileSync(incidentsCsv, [
    'Title,Type,Site,Person,Date,Days Lost,WorkSafe Notified,Status,ID',
    '"Arc flash near miss at the switchboard",Near Miss,Katikati Depot,"Josh Cardno",' + addDays(todayIso, -30) + ',0,,Closed,EP-I-801',
    '"Hand crushed in pipe roller",Notifiable Injury,Katikati Depot,"Mere Ratima",' + addDays(todayIso, -90) + ',12,' + addDays(todayIso, -90) + ',Closed,EP-I-802',
    '"Digger rollover on the batter",Serious Harm,Katikati Depot,,' + addDays(todayIso, -10) + ',0,,,EP-I-803',
  ].join('\n'));

  const dry = run('import dry run writes nothing', ['safety.mjs', 'import', 'ecoportal', `--people=${peopleCsv}`, `--hazards=${hazardsCsv}`, `--incidents=${incidentsCsv}`, '--dry-run']);
  assert(n(dry.people) === 2 && n(dry.people_updated) === 1, 'the dry run counts what it would do');
  assert(n(dry.sites) === 1, 'and the new site');
  assert(n(dry.unreported_notifiable) === 1, 'and flags the imported notifiable event with no notification date');

  const imported = run('import for real', ['safety.mjs', 'import', 'ecoportal', `--people=${peopleCsv}`, `--hazards=${hazardsCsv}`, `--incidents=${incidentsCsv}`]);
  assert(n(imported.people) === 2 && n(imported.hazards) === 2 && n(imported.incidents) === 3, 'and the real run does it');

  const mere = run('the imported person reads back', ['safety.mjs', 'person', 'Mere Ratima']);
  assert(mere.person.role === 'supervisor', 'with her role mapped');

  const importedAttention = run('the imported unreported notifiable surfaces', ['safety.mjs', 'attention']);
  assert(importedAttention.some((a) => a.reason === 'notifiable_unreported' && /rollover/i.test(a.detail)), 'at the top of the list');

  const missingFile = run('a missing import file fails loudly', ['safety.mjs', 'import', 'csv', `--people=${path.join(dataDir, 'not-there.csv')}`], { json: false, expectFail: true });
  assert(/No people file/.test(missingFile.stderr), 'it exits non zero rather than importing nothing quietly');

  // ---- export --------------------------------------------------------------------

  const outFile = path.join(dataDir, 'dump.json');
  const dump = run('export', ['safety.mjs', 'export', `--out=${outFile}`]);
  assert(existsSync(outFile), 'the export file is on disk');
  const parsed = JSON.parse(readFileSync(outFile, 'utf8'));
  assert(parsed.incidents.length === n(dump.counts.incidents), 'the counts match the file');

  // ---- the branded HTML -----------------------------------------------------------

  const views = run('npm run view', ['view.mjs'], { json: false });
  assert(/views[\\/]safety-board\.html/.test(views.stdout) && /views[\\/]registers\.html/.test(views.stdout), 'both views rendered');
  const boardHtml = readFileSync(path.join(root, 'views', 'safety-board.html'), 'utf8');
  assert(boardHtml.includes('Needs a decision') && boardHtml.includes('Open incidents'), 'the board has its sections');
  const registersHtml = readFileSync(path.join(root, 'views', 'registers.html'), 'utf8');
  assert(registersHtml.includes('hazard register') && registersHtml.includes('Site inductions'), 'the registers page has its sections');

  const docsOut = run('npm run docs', ['docs.mjs'], { json: false });
  assert(/worksafe-notification-draft/.test(docsOut.stdout), 'the WorkSafe notification drafts rendered');
  assert(/incident-report/.test(docsOut.stdout), 'the incident reports rendered');
  assert(/site-safety-report/.test(docsOut.stdout), 'the site safety reports rendered');
  assert(/hazard-register/.test(docsOut.stdout), 'the printable hazard registers rendered');
  const draftFiles = docsOut.stdout.split('\n').filter((l) => l.includes('worksafe-notification-draft'));
  assert(draftFiles.length >= 1, 'a draft per unreported notifiable event');
  const draft = readFileSync(path.join(root, draftFiles[0].replace(/^doc: /, '').trim()), 'utf8');
  assert(draft.includes('draft') && draft.includes('0800 030 040'), 'the draft says it is a draft and carries the phone number');

  // ---- the human readable side ------------------------------------------------------

  run('people (text)', ['safety.mjs', 'people'], { json: false });
  run('person (text)', ['safety.mjs', 'person', 'Wiremu'], { json: false });
  run('sites (text)', ['safety.mjs', 'sites'], { json: false });
  run('site (text)', ['safety.mjs', 'site', 'Pyes Pa'], { json: false });
  run('hazards (text)', ['safety.mjs', 'hazards'], { json: false });
  run('hazard (text)', ['safety.mjs', 'hazard', 'HAZ-101'], { json: false });
  run('incidents (text)', ['safety.mjs', 'incidents', '--all'], { json: false });
  run('incident (text)', ['safety.mjs', 'incident', 'INC-207'], { json: false });
  run('actions (text)', ['safety.mjs', 'actions'], { json: false });
  run('inductions (text)', ['safety.mjs', 'inductions'], { json: false });
  run('inspections (text)', ['safety.mjs', 'inspections', '--all'], { json: false });
  run('substances (text)', ['safety.mjs', 'substances'], { json: false });
  run('toolbox (text)', ['safety.mjs', 'toolbox'], { json: false });
  run('trend (text)', ['safety.mjs', 'trend'], { json: false });
  run('attention (text)', ['safety.mjs', 'attention'], { json: false });
  run('compliance (text)', ['safety.mjs', 'compliance'], { json: false });
  run('stats (text)', ['safety.mjs', 'stats'], { json: false });
  run('help', ['safety.mjs', 'help'], { json: false });
  run('an unknown command exits 1', ['safety.mjs', 'nonsense'], { json: false, expectFail: true });

  console.log(`\n${step} checks, PASS`);
} finally {
  if (existsSync(dataDir)) {
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // Windows can hold the handle briefly; a leftover temp dir is harmless.
    }
  }
}
