#!/usr/bin/env node
// health-safety-for-claude-code: the one CLI. Claude Code slash commands call
// this; so can you.
//
//   node scripts/safety.mjs <command> [args] [--flags] [--json]
//
// Run with no arguments (or `help`) for the command list.
//
// This system is a New Zealand business's health and safety record: hazards,
// incidents, corrective actions, inspections, inductions, hazardous substances
// and toolbox talks. The sharp edges are deliberate: a notifiable event cannot
// be closed until WorkSafe has been notified and the date is on the record
// (HSWA 2015 s 56), an investigation cannot close without a corrective action
// (or a recorded reason), and a high or critical hazard cannot enter the
// register without controls. Nothing here connects to WorkSafe and nothing
// sends: notifications draft to a folder and a person makes the call.
// Nothing here is legal advice.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick } from './lib/csv.mjs';
import { table, isoDate, short, truncate, heading } from './lib/format.mjs';

// ---------------------------------------------------------------------------
// Argument parsing

const BOOL_FLAGS = new Set(['json', 'help', 'all', 'dry-run', 'force', 'no-action', 'overdue']);

function parseArgv(argv) {
  const args = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      flags.help = true;
      continue;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      let name;
      let value;
      if (eq > -1) {
        name = a.slice(2, eq);
        value = a.slice(eq + 1);
      } else {
        name = a.slice(2);
        const next = argv[i + 1];
        if (BOOL_FLAGS.has(name) || next === undefined || next.startsWith('--')) value = true;
        else value = argv[++i];
      }
      flags[name] = value;
    } else {
      args.push(a);
    }
  }
  return { args, flags };
}

class CliError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

const num = (v) => Number(v ?? 0);
const str = (v) => (v === true || v === undefined || v === null ? '' : String(v));

// ---------------------------------------------------------------------------
// Dates

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDate(v, what = 'date') {
  if (!v || v === true) return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const lower = s.toLowerCase();
  if (lower === 'today') return today();
  if (lower === 'yesterday') return addDays(today(), -1);
  if (lower === 'tomorrow') return addDays(today(), 1);
  // New Zealand writes DD/MM/YYYY, so the first number is the day unless the
  // second one is too big to be a month.
  const slash = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (slash) {
    const a = Number(slash[1]);
    const b = Number(slash[2]);
    const [day, month] = b > 12 ? [b, a] : [a, b];
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new CliError(`"${v}" is not a ${what}. Use YYYY-MM-DD.`);
  return isoDate(d);
}

// ---------------------------------------------------------------------------
// The domain's spine

const INCIDENT_KINDS = ['near_miss', 'first_aid', 'medical', 'lost_time', 'notifiable_injury', 'notifiable_incident', 'death', 'property', 'environment'];
const NOTIFIABLE_KINDS = new Set(['notifiable_injury', 'notifiable_incident', 'death']);
const HAZARD_CATEGORIES = ['plant', 'height', 'excavation', 'traffic', 'manual', 'electrical', 'substance', 'environment', 'psychosocial', 'other'];
const CONTROL_LEVELS = ['elimination', 'substitution', 'isolation', 'engineering', 'administration', 'ppe'];
const INSPECTION_KINDS = ['site_inspection', 'audit', 'plant_check', 'scaffold_check', 'emergency_drill', 'other'];
const PERSON_ROLES = ['manager', 'supervisor', 'worker', 'contractor', 'office'];

const WORKSAFE_DUTY = [
  'THIS IS A NOTIFIABLE EVENT. Two duties start now (Health and Safety at Work Act 2015):',
  '  1. Notify WorkSafe as soon as possible: 0800 030 040, then confirm in writing within 48 hours (s 56).',
  '  2. Preserve the site. Nothing at the scene moves until a WorkSafe inspector says so, except to help',
  '     someone, make the site safe, or as police direct (s 55).',
  'Record the call the moment it is made: worksafe <ref> --on=today --ref="<their reference>"',
  'Draft the written notification from the record: npm run docs (worksafe-notification-draft). A person sends it.',
].join('\n');

function bandOf(l, c) {
  const s = l * c;
  return s >= 17 ? 'critical' : s >= 10 ? 'high' : s >= 5 ? 'moderate' : 'low';
}

// ---------------------------------------------------------------------------
// Lookups: full id, first 4+ characters of an id, exact ref or name, then
// contains. One hit wins. Several hits list the candidates and exit 1.

const RESOLVERS = {
  person: {
    from: 'people c left join sites st on st.id = c.site_id',
    cols: 'c.*, st.name as site_name',
    exact: "lower(c.full_name) = lower($1) or lower(coalesce(c.email, '')) = lower($1) or lower(coalesce(c.external_ref, '')) = lower($1)",
    fuzzy: 'c.full_name ilike $1 or c.company ilike $1',
    label: (r) => `${r.full_name} (${r.role}${r.company ? `, ${r.company}` : ''})`,
    order: 'c.full_name',
    listing: 'people --all',
  },
  site: {
    from: 'sites c',
    cols: 'c.*',
    exact: "lower(c.name) = lower($1) or lower(coalesce(c.external_ref, '')) = lower($1)",
    fuzzy: 'c.name ilike $1 or c.address ilike $1',
    label: (r) => `${r.name} (${r.status})`,
    order: 'c.name',
    listing: 'sites',
  },
  hazard: {
    from: 'hazards c left join sites st on st.id = c.site_id',
    cols: 'c.*, st.name as site_name',
    exact: "lower(coalesce(c.ref, '')) = lower($1) or lower(coalesce(c.ref, '')) = lower('HAZ-' || $1) or lower(coalesce(c.external_ref, '')) = lower($1)",
    fuzzy: 'c.ref ilike $1 or c.title ilike $1 or st.name ilike $1',
    label: (r) => `${r.ref}  ${truncate(r.title, 44)} (${r.status})`,
    order: 'c.identified_on desc',
    listing: 'hazards --all',
  },
  incident: {
    from: 'incidents c left join sites st on st.id = c.site_id',
    cols: 'c.*, st.name as site_name',
    exact: "lower(coalesce(c.ref, '')) = lower($1) or lower(coalesce(c.ref, '')) = lower('INC-' || $1) or lower(coalesce(c.external_ref, '')) = lower($1)",
    fuzzy: 'c.ref ilike $1 or c.title ilike $1 or st.name ilike $1',
    label: (r) => `${r.ref}  ${truncate(r.title, 44)} (${r.kind}, ${r.status})`,
    order: 'c.occurred_on desc',
    listing: 'incidents --all',
  },
  action: {
    from: 'actions c left join people p on p.id = c.owner_id',
    cols: 'c.*, p.full_name as owner_name',
    exact: 'lower(c.title) = lower($1)',
    fuzzy: 'c.title ilike $1 or p.full_name ilike $1',
    label: (r) => `${short(r.id)}  ${truncate(r.title, 54)} (${r.status})`,
    order: 'c.due_on nulls last',
    listing: 'actions --all',
  },
  substance: {
    from: 'substances c left join sites st on st.id = c.site_id',
    cols: 'c.*, st.name as site_name',
    exact: 'lower(c.name) = lower($1)',
    fuzzy: 'c.name ilike $1 or st.name ilike $1',
    label: (r) => `${short(r.id)}  ${r.name} at ${r.site_name || '(no site)'} (${r.status})`,
    order: 'c.name',
    listing: 'substances --all',
  },
};

const ID_RE = /^[0-9a-f]{4,8}(-[0-9a-f-]*)?$/i;

async function resolve(db, kind, q, { optional = false } = {}) {
  const spec = RESOLVERS[kind];
  q = String(q ?? '').trim();
  if (!q || q === 'true') {
    if (optional) return null;
    throw new CliError(`Give me a ${kind} name, reference or id.`);
  }
  const select = `select ${spec.cols} from ${spec.from}`;
  let rows = [];
  if (ID_RE.test(q)) {
    rows = await db.query(`${select} where c.id::text like $1 order by ${spec.order}`, [q.toLowerCase() + '%']);
    if (rows.length === 1) return rows[0];
  }
  if (!rows.length) rows = await db.query(`${select} where ${spec.exact} order by ${spec.order}`, [q]);
  if (rows.length === 1) return rows[0];
  if (!rows.length) rows = await db.query(`${select} where ${spec.fuzzy} order by ${spec.order}`, [`%${q}%`]);
  if (rows.length === 1) return rows[0];
  if (!rows.length) {
    if (optional) return null;
    throw new CliError(`No ${kind} matches "${q}". Run \`${spec.listing}\` to see what exists.`);
  }
  throw new CliError(
    `"${q}" matches ${rows.length} ${kind} records. Use a reference, an id, or a longer name:\n` +
      rows.map((r) => `  ${short(r.id)}  ${spec.label(r)}`).join('\n'),
  );
}

// The person doing the work: --by, SAFETY_PERSON, or the only active person.
async function whoIs(db, flags, { optional = true } = {}) {
  const named = flags.by || process.env.SAFETY_PERSON;
  if (named && named !== true) return resolve(db, 'person', named);
  const rows = await db.query("select * from people where status = 'active'");
  if (rows.length === 1) return rows[0];
  if (optional) return null;
  throw new CliError('Several people work here. Pass --by= (or set SAFETY_PERSON).');
}

async function nextRef(db, prefix, tableName, start) {
  const [r] = await db.query(
    `select coalesce(max(substring(ref from ${prefix.length + 2})::int), ${start}) + 1 as n from ${tableName} where ref ~ '^${prefix}-[0-9]+$'`,
  );
  return `${prefix}-${r.n}`;
}

// ---------------------------------------------------------------------------
// Shared column sets

const INCIDENT_COLS = [
  { key: 'ref', label: 'ref' },
  { key: 'site', label: 'site', width: 24 },
  { key: 'kind', label: 'kind' },
  { key: 'notifiable', label: 'notifiable', format: (v) => (v ? 'YES' : '') },
  { key: 'occurred_on', label: 'occurred', format: (v) => isoDate(v) },
  { key: 'person', label: 'who', width: 16 },
  { key: 'title', label: 'what', width: 44 },
  { key: 'days_lost', label: 'days lost', align: 'right', format: (v) => (num(v) ? String(v) : '') },
  { key: 'worksafe_notified_on', label: 'worksafe', format: (v, r) => (r.notifiable ? (v ? isoDate(v) : 'NOT NOTIFIED') : '') },
  { key: 'status', label: 'status' },
];

const HAZARD_COLS = [
  { key: 'ref', label: 'ref' },
  { key: 'site', label: 'site', width: 24 },
  { key: 'title', label: 'hazard', width: 42 },
  { key: 'category', label: 'category' },
  { key: 'score', label: 'risk', align: 'right', format: (v, r) => `${v}/25 ${r.band}` },
  { key: 'control_level', label: 'control', format: (v) => v || 'NONE' },
  { key: 'review_due_on', label: 'review due', format: (v) => isoDate(v) },
  { key: 'owner', label: 'owner', width: 16 },
  { key: 'status', label: 'status' },
];

// ---------------------------------------------------------------------------
// Reads

async function cmdPeople(db, args, flags) {
  const rows = await db.query(
    `select p.full_name, p.role, coalesce(p.company, '') as company, coalesce(st.name, '') as site, p.status,
            coalesce(i.induction, '') as induction
     from people p
     left join sites st on st.id = p.site_id
     left join v_inductions i on i.person_id = p.id
     where p.status = 'active' or $1 order by p.full_name`,
    [Boolean(flags.all)],
  );
  return {
    json: rows,
    text:
      heading(`People (${rows.length})`) +
      '\n' +
      table(rows, [
        { key: 'full_name', label: 'name', width: 22 },
        { key: 'role', label: 'role' },
        { key: 'company', label: 'company', width: 26 },
        { key: 'site', label: 'usual site', width: 26 },
        { key: 'induction', label: 'induction' },
        { key: 'status', label: 'status' },
      ]),
  };
}

async function cmdPerson(db, args) {
  const p = await resolve(db, 'person', args.join(' '));
  const trainings = await db.query('select * from v_trainings where person_id = $1 order by expires_on nulls last', [p.id]);
  const incidents = await db.query('select * from v_incidents where incident_id in (select id from incidents where person_id = $1) order by occurred_on desc', [p.id]);
  const actions = await db.query("select * from v_actions where action_id in (select id from actions where owner_id = $1) and status = 'open' order by due_on nulls last", [p.id]);
  const json = { person: p, trainings, incidents, open_actions: actions };
  let text = heading(p.full_name) + `\n  ${p.role}${p.company ? ` | ${p.company}` : ''}${p.site_name ? ` | usually at ${p.site_name}` : ''} | ${p.status}`;
  if (p.email || p.phone) text += `\n  ${p.email || ''} ${p.phone || ''}`.trimEnd();
  text += '\n' + heading('Tickets') + '\n' + table(trainings, [
    { key: 'course', label: 'course', width: 26 },
    { key: 'completed_on', label: 'completed', format: (v) => isoDate(v) },
    { key: 'expires_on', label: 'expires', format: (v) => isoDate(v) },
    { key: 'ticket_status', label: 'status', format: (v) => (v === 'current' ? 'current' : v.toUpperCase()) },
    { key: 'provider', label: 'provider', width: 20 },
  ]);
  if (incidents.length) {
    text += '\n' + heading('Incidents involving them') + '\n' + table(incidents, INCIDENT_COLS.filter((c) => c.key !== 'person'));
  }
  if (actions.length) {
    text += '\n' + heading('Their open actions') + '\n' + table(actions, [
      { key: 'title', label: 'action', width: 52 },
      { key: 'source', label: 'from', width: 24 },
      { key: 'due_on', label: 'due', format: (v) => isoDate(v) },
    ]);
  }
  return { json, text };
}

async function cmdSites(db) {
  const rows = await db.query('select * from v_site_position order by site');
  return {
    json: rows,
    text:
      heading('Sites') +
      '\n' +
      table(rows, [
        { key: 'site', label: 'site', width: 30 },
        { key: 'manager', label: 'manager', width: 18 },
        { key: 'people', label: 'people', align: 'right' },
        { key: 'high_hazards', label: 'high hazards', align: 'right', format: (v) => (num(v) ? String(v) : '') },
        { key: 'incidents_90d', label: 'incidents 90d', align: 'right', format: (v) => (num(v) ? String(v) : '') },
        { key: 'unreported_notifiable', label: 'UNREPORTED', align: 'right', format: (v) => (num(v) ? String(v) : '') },
        { key: 'overdue_actions', label: 'overdue actions', align: 'right', format: (v) => (num(v) ? String(v) : '') },
        { key: 'days_since_toolbox', label: 'last talk', align: 'right', format: (v) => (v === null || v === undefined ? 'never' : `${v}d ago`) },
        { key: 'next_inspection_due', label: 'next inspection', format: (v) => isoDate(v) },
      ]),
  };
}

async function cmdSite(db, args) {
  const s = await resolve(db, 'site', args.join(' '));
  const [position] = await db.query('select * from v_site_position where site_id = $1', [s.id]);
  const hazards = await db.query("select * from v_hazards where site_id = $1 and status <> 'closed' order by score desc", [s.id]);
  const incidents = await db.query('select * from v_incidents where site_id = $1 order by occurred_on desc limit 15', [s.id]);
  const actions = await db.query("select * from v_actions where site = $1 and status = 'open' order by due_on nulls last", [s.name]);
  const inspections = await db.query("select * from v_inspections where site_id = $1 and status = 'due' order by due_on nulls last", [s.id]);
  const json = { site: s, position, hazards, incidents, open_actions: actions, inspections_due: inspections };
  let text = heading(s.name) + `\n  ${s.address || ''}`.trimEnd();
  if (position) {
    text += `\n  ${position.manager} | ${position.people} people | last toolbox talk ${position.days_since_toolbox === null ? 'never' : position.days_since_toolbox + ' days ago'}`;
    if (num(position.unreported_notifiable)) text += `\n  ${position.unreported_notifiable} NOTIFIABLE EVENT(S) NOT YET REPORTED TO WORKSAFE`;
  }
  text += '\n' + heading('Open hazards, highest risk first') + '\n' + table(hazards, HAZARD_COLS.filter((c) => c.key !== 'site'));
  text += '\n' + heading('Recent incidents') + '\n' + table(incidents, INCIDENT_COLS.filter((c) => c.key !== 'site'));
  if (actions.length) {
    text += '\n' + heading('Open actions') + '\n' + table(actions, [
      { key: 'title', label: 'action', width: 52 },
      { key: 'owner', label: 'owner', width: 16 },
      { key: 'due_on', label: 'due', format: (v) => isoDate(v) },
      { key: 'days_to_due', label: 'left', align: 'right', format: (v) => (v === null || v === undefined ? '' : num(v) < 0 ? `${Math.abs(num(v))}d AGO` : `${v}d`) },
    ]);
  }
  if (inspections.length) {
    text += '\n' + heading('Inspections due') + '\n' + table(inspections, [
      { key: 'kind', label: 'kind' },
      { key: 'due_on', label: 'due', format: (v) => isoDate(v) },
      { key: 'days_to_due', label: 'left', align: 'right', format: (v) => (v === null || v === undefined ? '' : num(v) < 0 ? `${Math.abs(num(v))}d AGO` : `${v}d`) },
    ]);
  }
  return { json, text };
}

async function cmdHazards(db, args, flags) {
  const where = ["(status <> 'closed' or $1)"];
  const params = [Boolean(flags.all)];
  if (flags.site) {
    const s = await resolve(db, 'site', flags.site);
    params.push(s.id);
    where.push(`site_id = $${params.length}`);
  }
  if (flags.band) {
    params.push(str(flags.band));
    where.push(`band = $${params.length}`);
  }
  const rows = await db.query(`select * from v_hazards where ${where.join(' and ')} order by score desc, review_due_on nulls last`, params);
  return {
    json: rows,
    text:
      heading(`The hazard register (${rows.length}${flags.all ? ', including closed' : ' open'})`) +
      '\n' +
      table(rows, HAZARD_COLS) +
      '\n\n  Risk is likelihood x consequence on a 5x5: 1-4 low, 5-9 moderate, 10-16 high, 17-25 critical.\n  A high or critical hazard on administration or PPE alone is on the attention list (GRWM reg 6).',
  };
}

async function cmdHazard(db, args) {
  const h = await resolve(db, 'hazard', args.join(' '));
  const [row] = await db.query('select * from v_hazards where hazard_id = $1', [h.id]);
  const incidents = await db.query('select * from v_incidents where hazard_id = $1 order by occurred_on desc', [h.id]);
  const actions = await db.query('select * from v_actions where hazard_id = $1 order by due_on nulls last', [h.id]);
  const hnotes = await db.query('select n.noted_on, n.note, p.full_name as by from notes n left join people p on p.id = n.by_id where n.hazard_id = $1 order by n.noted_on desc', [h.id]);
  const json = { hazard: row, incidents, actions, notes: hnotes };
  let text = heading(`${row.ref}  ${row.title}`) + `\n  ${row.site} | ${row.category} | owner: ${row.owner} | ${row.status}`;
  text += `\n  risk: ${row.likelihood} x ${row.consequence} = ${row.score}/25 (${row.band})`;
  text += `\n  controls (${row.control_level || 'NO LEVEL RECORDED'}): ${row.controls || 'NONE RECORDED'}`;
  if (row.review_due_on) text += `\n  review due ${isoDate(row.review_due_on)}${num(row.days_to_review) < 0 ? ` (${Math.abs(num(row.days_to_review))} days AGO)` : ''}`;
  if (incidents.length) text += '\n' + heading('Incidents this hazard has caused') + '\n' + table(incidents, INCIDENT_COLS.filter((c) => c.key !== 'site'));
  if (actions.length) {
    text += '\n' + heading('Actions') + '\n' + table(actions, [
      { key: 'title', label: 'action', width: 52 },
      { key: 'owner', label: 'owner', width: 16 },
      { key: 'due_on', label: 'due', format: (v) => isoDate(v) },
      { key: 'status', label: 'status' },
    ]);
  }
  if (hnotes.length) {
    text += '\n' + heading('The log') + '\n' + table(hnotes, [
      { key: 'noted_on', label: 'date', format: (v) => isoDate(v) },
      { key: 'by', label: 'by', width: 16 },
      { key: 'note', label: 'note', width: 70 },
    ]);
  }
  return { json, text };
}

async function cmdIncidents(db, args, flags) {
  const where = ["(status <> 'closed' or $1)"];
  const params = [Boolean(flags.all)];
  if (flags.site) {
    const s = await resolve(db, 'site', flags.site);
    params.push(s.id);
    where.push(`site_id = $${params.length}`);
  }
  if (flags.kind) {
    if (!INCIDENT_KINDS.includes(str(flags.kind))) throw new CliError(`--kind= is one of: ${INCIDENT_KINDS.join(', ')}`);
    params.push(str(flags.kind));
    where.push(`kind = $${params.length}`);
  }
  const rows = await db.query(`select * from v_incidents where ${where.join(' and ')} order by occurred_on desc`, params);
  const unreported = rows.filter((r) => r.notifiable && !r.worksafe_notified_on);
  return {
    json: rows,
    text:
      heading(`Incidents (${rows.length}${flags.all ? '' : ' open'})`) +
      '\n' +
      table(rows, INCIDENT_COLS) +
      (unreported.length
        ? `\n\n  ${unreported.length} NOTIFIABLE EVENT(S) NOT YET REPORTED TO WORKSAFE. 0800 030 040, then: worksafe <ref> --on=today`
        : ''),
  };
}

async function cmdIncident(db, args) {
  const i = await resolve(db, 'incident', args.join(' '));
  const [row] = await db.query('select * from v_incidents where incident_id = $1', [i.id]);
  const actions = await db.query('select * from v_actions where incident_id = $1 order by due_on nulls last', [i.id]);
  const inotes = await db.query('select n.noted_on, n.note, p.full_name as by from notes n left join people p on p.id = n.by_id where n.incident_id = $1 order by n.noted_on desc', [i.id]);
  const json = { incident: row, actions, notes: inotes };
  let text = heading(`${row.ref}  ${row.title}`) + `\n  ${row.site} | ${row.kind}${row.notifiable ? ' | NOTIFIABLE' : ''} | occurred ${isoDate(row.occurred_on)} (${row.days_ago} days ago) | ${row.status}`;
  if (row.person) text += `\n  who: ${row.person}${num(row.days_lost) ? ` (${row.days_lost} days lost so far)` : ''}`;
  if (row.reported_by) text += ` | reported by ${row.reported_by}`;
  if (row.hazard_ref) text += `\n  register entry: ${row.hazard_ref}`;
  if (i.description) text += `\n  ${i.description}`;
  if (row.notifiable) {
    text += row.worksafe_notified_on
      ? `\n  WorkSafe notified ${isoDate(row.worksafe_notified_on)}${row.worksafe_ref ? ` (${row.worksafe_ref})` : ''}`
      : `\n  WORKSAFE HAS NOT BEEN NOTIFIED. 0800 030 040 now, then: worksafe ${row.ref} --on=today`;
  }
  if (row.findings) text += `\n  findings: ${row.findings}`;
  if (row.closed_on) text += `\n  closed ${isoDate(row.closed_on)}`;
  if (actions.length) {
    text += '\n' + heading('Corrective actions') + '\n' + table(actions, [
      { key: 'title', label: 'action', width: 56 },
      { key: 'owner', label: 'owner', width: 16 },
      { key: 'due_on', label: 'due', format: (v) => isoDate(v) },
      { key: 'status', label: 'status' },
    ]);
  }
  if (inotes.length) {
    text += '\n' + heading('The log') + '\n' + table(inotes, [
      { key: 'noted_on', label: 'date', format: (v) => isoDate(v) },
      { key: 'by', label: 'by', width: 16 },
      { key: 'note', label: 'note', width: 70 },
    ]);
  }
  return { json, text };
}

async function cmdActions(db, args, flags) {
  const rows = await db.query(
    `select * from v_actions where (status = 'open' or $1) ${flags.overdue ? 'and due_on < current_date' : ''} order by due_on nulls last`,
    [Boolean(flags.all)],
  );
  return {
    json: rows,
    text:
      heading(flags.all ? 'Actions, all' : `Open corrective actions (${rows.length})`) +
      '\n' +
      table(rows, [
        { key: 'title', label: 'action', width: 52 },
        { key: 'source', label: 'from', width: 26 },
        { key: 'from_notifiable', label: '', format: (v) => (v ? 'NOTIFIABLE' : '') },
        { key: 'site', label: 'site', width: 24 },
        { key: 'owner', label: 'owner', width: 16 },
        { key: 'due_on', label: 'due', format: (v) => isoDate(v) },
        { key: 'days_to_due', label: 'left', align: 'right', format: (v) => (v === null || v === undefined ? '' : num(v) < 0 ? `${Math.abs(num(v))}d AGO` : `${v}d`) },
        { key: 'status', label: 'status' },
      ]) +
      '\n\n  An action written down and left overdue is a risk you knew about, dated, in your own records.',
  };
}

async function cmdInductions(db, args, flags) {
  const rows = await db.query('select * from v_inductions order by case induction when \'MISSING\' then 1 when \'EXPIRED\' then 2 when \'expiring\' then 3 else 4 end, person');
  const expiring = await db.query("select * from v_trainings where person_status = 'active' and ticket_status in ('expiring','expired') and lower(course) not like '%induction%' order by expires_on", []);
  return {
    json: { inductions: rows, other_tickets: expiring },
    text:
      heading('Site inductions, everyone active on the tools') +
      '\n' +
      table(rows, [
        { key: 'person', label: 'name', width: 22 },
        { key: 'role', label: 'role' },
        { key: 'company', label: 'company', width: 26 },
        { key: 'site', label: 'usual site', width: 26 },
        { key: 'inducted_on', label: 'inducted', format: (v) => isoDate(v) },
        { key: 'expires_on', label: 'expires', format: (v) => isoDate(v) },
        { key: 'induction', label: 'status' },
      ]) +
      (expiring.length
        ? '\n' + heading('Other tickets expired or expiring inside 30 days') + '\n' + table(expiring, [
            { key: 'person', label: 'name', width: 22 },
            { key: 'course', label: 'course', width: 26 },
            { key: 'expires_on', label: 'expires', format: (v) => isoDate(v) },
            { key: 'ticket_status', label: 'status', format: (v) => v.toUpperCase() },
          ])
        : ''),
  };
}

async function cmdInspections(db, args, flags) {
  const rows = await db.query(
    `select * from v_inspections where (status = 'due' or $1) order by due_on nulls last`,
    [Boolean(flags.all)],
  );
  return {
    json: rows,
    text:
      heading(flags.all ? 'Inspections, all' : 'Inspections due') +
      '\n' +
      table(rows, [
        { key: 'site', label: 'site', width: 28 },
        { key: 'kind', label: 'kind' },
        { key: 'due_on', label: 'due', format: (v) => isoDate(v) },
        { key: 'days_to_due', label: 'left', align: 'right', format: (v) => (v === null || v === undefined ? '' : num(v) < 0 ? `${Math.abs(num(v))}d AGO` : `${v}d`) },
        { key: 'done_on', label: 'done', format: (v) => isoDate(v) },
        { key: 'done_by', label: 'by', width: 16 },
        { key: 'findings', label: 'findings', width: 44 },
      ]),
  };
}

async function cmdSubstances(db, args, flags) {
  const where = ["(status = 'in_use' or $1)"];
  const params = [Boolean(flags.all)];
  if (flags.site) {
    const s = await resolve(db, 'site', flags.site);
    params.push(s.id);
    where.push(`site_id = $${params.length}`);
  }
  const rows = await db.query(`select * from v_substances where ${where.join(' and ')} order by case sds when 'MISSING' then 1 when 'STALE' then 2 else 3 end, name`, params);
  return {
    json: rows,
    text:
      heading('The hazardous substances inventory') +
      '\n' +
      table(rows, [
        { key: 'name', label: 'substance', width: 30 },
        { key: 'site', label: 'site', width: 26 },
        { key: 'quantity', label: 'quantity', width: 22 },
        { key: 'location', label: 'location', width: 26 },
        { key: 'sds_dated_on', label: 'SDS dated', format: (v) => isoDate(v) },
        { key: 'sds', label: 'SDS' },
        { key: 'status', label: 'status' },
      ]) +
      '\n\n  The inventory and a current safety data sheet per substance are the Hazardous Substances\n  Regulations 2017 floor. An SDS older than five years is stale.',
  };
}

async function cmdToolbox(db, args, flags) {
  if (flags.site) {
    const s = await resolve(db, 'site', flags.site);
    const rows = await db.query('select t.held_on, p.full_name as led_by, t.topic, t.attendees from toolbox_talks t left join people p on p.id = t.led_by where t.site_id = $1 order by t.held_on desc limit 20', [s.id]);
    return {
      json: rows,
      text: heading(`Toolbox talks at ${s.name}`) + '\n' + table(rows, [
        { key: 'held_on', label: 'date', format: (v) => isoDate(v) },
        { key: 'led_by', label: 'led by', width: 18 },
        { key: 'topic', label: 'topic', width: 56 },
        { key: 'attendees', label: 'attendees', align: 'right' },
      ]),
    };
  }
  const rows = await db.query('select * from v_toolbox order by days_since desc nulls first');
  return {
    json: rows,
    text:
      heading('Last toolbox talk per site') +
      '\n' +
      table(rows, [
        { key: 'site', label: 'site', width: 28 },
        { key: 'last_talk_on', label: 'last talk', format: (v) => isoDate(v) },
        { key: 'days_since', label: 'days ago', align: 'right', format: (v) => (v === null || v === undefined ? 'NEVER' : String(v)) },
        { key: 'led_by', label: 'led by', width: 18 },
        { key: 'topic', label: 'topic', width: 48 },
      ]) +
      '\n\n  Worker engagement is a duty, not a nicety (HSWA Part 3). A site quiet past a fortnight is on the attention list.',
  };
}

async function cmdAttention(db) {
  const rows = await db.query(`
    select * from v_attention
    order by case reason
      when 'notifiable_unreported' then 1
      when 'action_overdue' then 2
      when 'induction_missing' then 3
      when 'induction_expired' then 4
      when 'hazard_uncontrolled' then 5
      when 'hazard_review_overdue' then 6
      when 'investigation_stale' then 7
      when 'inspection_overdue' then 8
      when 'sds_gap' then 9
      when 'training_expiring' then 10
      when 'toolbox_quiet' then 11
      else 12 end,
      days desc nulls last
  `);
  return {
    json: rows,
    text:
      heading(`Needs a decision (${rows.length})`) +
      '\n' +
      table(rows, [
        { key: 'reason', label: 'why' },
        { key: 'label', label: 'record', width: 24 },
        { key: 'site', label: 'site', width: 26 },
        { key: 'owner', label: 'owner', width: 16 },
        { key: 'days', label: 'days', align: 'right' },
        { key: 'detail', label: 'detail', width: 72 },
      ]),
  };
}

async function cmdTrend(db) {
  const rows = await db.query('select * from v_trend');
  return {
    json: rows,
    text:
      heading('Twelve months, month by month') +
      '\n' +
      table(rows, [
        { key: 'month', label: 'month' },
        { key: 'near_misses', label: 'near misses', align: 'right' },
        { key: 'injuries', label: 'injuries', align: 'right' },
        { key: 'notifiable', label: 'notifiable', align: 'right' },
        { key: 'days_lost', label: 'days lost', align: 'right' },
      ]) +
      '\n\n  Near misses drying up while injuries hold is a reporting problem, not a safety improvement.',
  };
}

async function cmdStats(db) {
  const [c] = await db.query(`
    select (select count(*) from people where status = 'active')                                          as people,
           (select count(*) from sites where status = 'active')                                           as sites,
           (select count(*) from hazards where status <> 'closed')                                        as open_hazards,
           (select count(*) from v_hazards where status <> 'closed' and band in ('high','critical'))      as high_hazards,
           (select count(*) from incidents where status <> 'closed')                                      as open_incidents,
           (select count(*) from incidents where notifiable and worksafe_notified_on is null)             as unreported_notifiable,
           (select count(*) from actions where status = 'open')                                           as open_actions,
           (select count(*) from actions where status = 'open' and due_on < current_date)                 as overdue_actions,
           (select count(*) from v_inductions where induction in ('MISSING','EXPIRED'))                   as induction_gaps,
           (select count(*) from v_substances where status = 'in_use' and sds in ('MISSING','STALE'))     as sds_gaps,
           (select count(*) from v_attention)                                                             as attention_items
  `);
  const json = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)]));
  return {
    json,
    text:
      heading('The business') +
      `\n  ${json.people} active people across ${json.sites} sites` +
      `\n  ${json.open_hazards} open hazards (${json.high_hazards} high or critical), ${json.open_incidents} open incidents` +
      (json.unreported_notifiable ? `\n  ${json.unreported_notifiable} NOTIFIABLE EVENT(S) NOT REPORTED TO WORKSAFE` : '') +
      `\n  ${json.open_actions} open actions (${json.overdue_actions} overdue), ${json.induction_gaps} induction gaps, ${json.sds_gaps} SDS gaps` +
      `\n  ${json.attention_items} items on the attention list`,
  };
}

// ---------------------------------------------------------------------------
// The incident pipeline: report -> investigate -> close, with the WorkSafe
// gate in the middle for notifiable events.

async function cmdReport(db, args, flags) {
  const kind = str(flags.kind);
  if (!INCIDENT_KINDS.includes(kind)) throw new CliError(`What kind was it? --kind= is one of: ${INCIDENT_KINDS.join(', ')}\nNot sure whether it is notifiable? Report the worst honest reading; you can reclassify with evidence, and WorkSafe's own triage line (0800 030 040) will tell you.`);
  const site = await resolve(db, 'site', args.join(' ') || str(flags.site));
  const title = str(flags.title);
  if (!title) throw new CliError('What happened, in one line? --title="Fall from pump station scaffold"');
  const person = flags.person ? await resolve(db, 'person', flags.person) : null;
  const by = await whoIs(db, flags);
  const hazard = flags.hazard ? await resolve(db, 'hazard', flags.hazard) : null;
  const notifiable = NOTIFIABLE_KINDS.has(kind);
  const ref = await nextRef(db, 'INC', 'incidents', 200);
  const [row] = await db.query(
    `insert into incidents (ref, site_id, person_id, reported_by, hazard_id, kind, notifiable, occurred_on, title, description, days_lost)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) returning *`,
    [ref, site.id, person?.id || null, by?.id || null, hazard?.id || null, kind, notifiable,
     parseDate(flags.on) || today(), title, str(flags.description) || null, Number(flags['days-lost'] || 0)],
  );
  let text = `${ref} on the register: ${kind}${person ? `, ${person.full_name}` : ''} at ${site.name}, "${title}".`;
  if (notifiable) text += `\n\n${WORKSAFE_DUTY}`;
  else text += `\nNext: action add "<what changes because of this>" --incident=${ref} --owner= --due=, then close ${ref} --findings="..."`;
  if (!hazard) text += `\nIf the register already names this hazard, link it: hazard evidence keeps the review honest (report again with --hazard=HAZ-xxx, or log it).`;
  return { json: row, text };
}

async function cmdWorksafe(db, args, flags) {
  const i = await resolve(db, 'incident', args[0]);
  if (!i.notifiable) {
    throw new CliError(
      `${i.ref} is a ${i.kind}, not a notifiable event. WorkSafe notification is for a death, a notifiable\n` +
        `injury or illness, or a notifiable incident (HSWA ss 23-25). If this one actually qualifies, reclassify\n` +
        `it first with evidence, then record the notification.`,
    );
  }
  const on = parseDate(flags.on) || today();
  const [row] = await db.query(
    `update incidents set worksafe_notified_on = $1, worksafe_ref = coalesce($2, worksafe_ref) where id = $3 returning *`,
    [on, str(flags.ref) || null, i.id],
  );
  return {
    json: row,
    text: `${i.ref}: WorkSafe notified ${on}${row.worksafe_ref ? `, reference ${row.worksafe_ref}` : ''}.\n` +
      `Confirm in writing within 48 hours of the call (s 56(3)): npm run docs renders the draft, a person sends it.\n` +
      `Keep this record five years (s 57). Next: investigate ${i.ref} --findings="..."`,
  };
}

async function cmdInvestigate(db, args, flags) {
  const i = await resolve(db, 'incident', args[0]);
  if (i.status === 'closed') throw new CliError(`${i.ref} is closed. Reopen it deliberately if the investigation is genuinely live again (status is just a column, but say why in the log).`);
  const findings = str(flags.findings);
  if (!findings) throw new CliError(`What did the investigation find? investigate ${i.ref} --findings="what actually happened and why"`);
  const [row] = await db.query(
    `update incidents set status = 'investigating', findings = $1 where id = $2 returning *`,
    [findings, i.id],
  );
  return {
    json: row,
    text: `${i.ref}: findings recorded.\nNext: action add "<what changes>" --incident=${i.ref} --owner= --due=, then close ${i.ref}.`,
  };
}

async function cmdClose(db, args, flags) {
  const i = await resolve(db, 'incident', args[0]);
  if (i.status === 'closed') throw new CliError(`${i.ref} is already closed.`);
  if (i.notifiable && !i.worksafe_notified_on) {
    throw new CliError(
      `${i.ref} is a notifiable event and WorkSafe has not been notified. It does not close, and there is no\n` +
        `--force. Notify as soon as possible (0800 030 040, HSWA s 56), then record it:\n` +
        `  worksafe ${i.ref} --on=<date of the call> --ref="<their reference>"`,
    );
  }
  const [{ n: actionCount }] = await db.query('select count(*)::int as n from actions where incident_id = $1', [i.id]);
  if (!Number(actionCount) && !flags['no-action']) {
    throw new CliError(
      `${i.ref} has no corrective action recorded. An investigation that changes nothing is not finished.\n` +
        `  action add "<what changes because of this>" --incident=${i.ref} --owner= --due=\n` +
        `If nothing genuinely needs to change, say why: close ${i.ref} --no-action --note="the reason"`,
    );
  }
  if (flags['no-action'] && !str(flags.note)) {
    throw new CliError('--no-action needs the reason in --note=. "No action" is a decision, and decisions get recorded.');
  }
  const findings = str(flags.findings) || i.findings;
  if (!findings) {
    throw new CliError(`Close ${i.ref} with what on the record? investigate ${i.ref} --findings="..." first, or pass --findings= here.`);
  }
  const [row] = await db.query(
    `update incidents set status = 'closed', closed_on = $1, findings = $2, note = coalesce($3, note) where id = $4 returning *`,
    [parseDate(flags.on) || today(), findings, str(flags.note) || null, i.id],
  );
  return {
    json: row,
    text: `${i.ref} closed.` + (i.notifiable ? ` The record stays at least five years (HSWA s 57); nothing here deletes it.` : ''),
  };
}

// ---------------------------------------------------------------------------
// Hazards

async function cmdHazardWrite(db, args, flags) {
  const sub = args[0];
  if (sub === 'add') {
    const site = await resolve(db, 'site', args.slice(1).join(' ') || str(flags.site));
    const title = str(flags.title);
    if (!title) throw new CliError('hazard add <site> --title="..." --category= --likelihood=1-5 --consequence=1-5 [--controls= --control-level= --owner= --review=]');
    const category = str(flags.category) || 'other';
    if (!HAZARD_CATEGORIES.includes(category)) throw new CliError(`--category= is one of: ${HAZARD_CATEGORIES.join(', ')}`);
    const likelihood = Number(flags.likelihood);
    const consequence = Number(flags.consequence);
    if (!(likelihood >= 1 && likelihood <= 5) || !(consequence >= 1 && consequence <= 5)) {
      throw new CliError('Rate it: --likelihood=1-5 and --consequence=1-5. Risk is the product, banded 1-4 low, 5-9 moderate, 10-16 high, 17-25 critical.');
    }
    const band = bandOf(likelihood, consequence);
    const controls = str(flags.controls) || null;
    const controlLevel = str(flags['control-level']) || null;
    if (controlLevel && !CONTROL_LEVELS.includes(controlLevel)) throw new CliError(`--control-level= is one of: ${CONTROL_LEVELS.join(', ')} (the hierarchy, best first)`);
    if ((band === 'high' || band === 'critical') && !controls) {
      throw new CliError(
        `A ${band} hazard (${likelihood * consequence}/25) does not go on the register with no controls recorded.\n` +
          `Say what is actually in place right now, however weak: --controls="..." --control-level=${CONTROL_LEVELS.join('|')}.\n` +
          `If the honest answer is PPE alone, record that; the attention list will keep saying it until the\n` +
          `hierarchy has been worked (GRWM Regulations 2016 reg 6: elimination first, PPE last).`,
      );
    }
    const owner = flags.owner ? await resolve(db, 'person', flags.owner) : await whoIs(db, flags);
    const ref = await nextRef(db, 'HAZ', 'hazards', 100);
    const [row] = await db.query(
      `insert into hazards (ref, site_id, title, category, description, likelihood, consequence, controls, control_level, owner_id, review_due_on, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning *`,
      [ref, site.id, title, category, str(flags.description) || null, likelihood, consequence, controls, controlLevel,
       owner?.id || null, parseDate(flags.review) || addDays(today(), 90), controls ? 'controlled' : 'open'],
    );
    let text = `${ref} on the register: ${band} (${likelihood * consequence}/25), "${title}" at ${site.name}. Review due ${isoDate(row.review_due_on)}.`;
    if ((band === 'high' || band === 'critical') && (controlLevel === 'ppe' || controlLevel === 'administration')) {
      text += `\nControl is ${controlLevel} on a ${band} hazard. The hierarchy asks for better and the attention list will keep saying so.`;
    }
    return { json: row, text };
  }
  if (sub === 'control') {
    const h = await resolve(db, 'hazard', args.slice(1).join(' '));
    const controls = str(flags.controls);
    const controlLevel = str(flags['control-level']);
    if (!controls || !controlLevel) throw new CliError(`hazard control ${h.ref} --controls="what is in place" --control-level=${CONTROL_LEVELS.join('|')}`);
    if (!CONTROL_LEVELS.includes(controlLevel)) throw new CliError(`--control-level= is one of: ${CONTROL_LEVELS.join(', ')}`);
    const [row] = await db.query(
      `update hazards set controls = $1, control_level = $2, status = 'controlled', review_due_on = coalesce($3, review_due_on) where id = $4 returning *`,
      [controls, controlLevel, parseDate(flags.review), h.id],
    );
    return { json: row, text: `${h.ref}: controls updated (${controlLevel}). Review due ${isoDate(row.review_due_on)}.` };
  }
  if (sub === 'review') {
    const h = await resolve(db, 'hazard', args.slice(1).join(' '));
    const next = parseDate(flags.review) || addDays(parseDate(flags.on) || today(), 90);
    const [row] = await db.query(
      `update hazards set review_due_on = $1, note = coalesce($2, note) where id = $3 returning *`,
      [next, str(flags.note) || null, h.id],
    );
    return { json: row, text: `${h.ref} reviewed. Next review ${isoDate(next)}.${str(flags.note) ? '' : ' (A review with no note recorded is a date change, not a review; pass --note= with what you found.)'}` };
  }
  if (sub === 'close') {
    const h = await resolve(db, 'hazard', args.slice(1).join(' '));
    if (!str(flags.note)) throw new CliError(`Closing a hazard says the risk is gone, not just quiet. Say why: hazard close ${h.ref} --note="eliminated because ..."`);
    const [row] = await db.query(`update hazards set status = 'closed', note = $1 where id = $2 returning *`, [str(flags.note), h.id]);
    return { json: row, text: `${h.ref} closed: ${str(flags.note)}` };
  }
  throw new CliError('hazard add <site> --title= --category= --likelihood= --consequence= [--controls= --control-level=] | hazard control <ref> | hazard review <ref> | hazard close <ref> --note=');
}

// ---------------------------------------------------------------------------
// Actions

async function cmdAction(db, args, flags) {
  const sub = args[0];
  if (sub === 'add') {
    const title = args.slice(1).join(' ');
    if (!title) throw new CliError('action add "what changes" --incident=|--hazard=|--inspection-site= --owner= --due=');
    const incident = flags.incident ? await resolve(db, 'incident', flags.incident) : null;
    const hazard = flags.hazard ? await resolve(db, 'hazard', flags.hazard) : null;
    let inspectionId = null;
    if (flags['inspection-site']) {
      const s = await resolve(db, 'site', flags['inspection-site']);
      const [insp] = await db.query('select * from inspections where site_id = $1 order by coalesce(done_on, due_on) desc limit 1', [s.id]);
      if (!insp) throw new CliError(`${s.name} has no inspections on record.`);
      inspectionId = insp.id;
    }
    const owner = flags.owner ? await resolve(db, 'person', flags.owner) : await whoIs(db, flags);
    const [row] = await db.query(
      `insert into actions (title, incident_id, hazard_id, inspection_id, owner_id, due_on, note) values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [title, incident?.id || null, hazard?.id || null, inspectionId, owner?.id || null, parseDate(flags.due), str(flags.note) || null],
    );
    return { json: row, text: `Action on the list: "${title}"${owner ? `, ${owner.full_name}` : ''}${row.due_on ? `, due ${isoDate(row.due_on)}` : ' (no due date: give it one, undated actions die)'}.` };
  }
  if (sub === 'done') {
    const a = await resolve(db, 'action', args.slice(1).join(' '));
    const [row] = await db.query(`update actions set status = 'done', done_on = $1, note = coalesce($2, note) where id = $3 returning *`, [parseDate(flags.on) || today(), str(flags.note) || null, a.id]);
    return { json: row, text: `Done: "${a.title}".` };
  }
  throw new CliError('action add "title" [--incident= --hazard= --owner= --due=], or action done <match>');
}

// ---------------------------------------------------------------------------
// Training, inspections, substances, talks

async function cmdInduct(db, args, flags) {
  const p = await resolve(db, 'person', args.join(' '));
  const on = parseDate(flags.on) || today();
  const expires = parseDate(flags.expires) || addDays(on, 730);
  const [row] = await db.query(
    `insert into trainings (person_id, course, completed_on, expires_on, provider) values ($1, 'site induction', $2, $3, $4) returning *`,
    [p.id, on, expires, str(flags.provider) || 'internal'],
  );
  return { json: row, text: `${p.full_name} inducted ${on}, expires ${expires}.` };
}

async function cmdTraining(db, args, flags) {
  if (args[0] !== 'add') throw new CliError('training add <person> --course="working at heights" --on= [--expires= --provider=]');
  const p = await resolve(db, 'person', args.slice(1).join(' '));
  const course = str(flags.course);
  if (!course) throw new CliError('Which ticket? --course="working at heights"');
  const [row] = await db.query(
    `insert into trainings (person_id, course, completed_on, expires_on, provider) values ($1, $2, $3, $4, $5) returning *`,
    [p.id, course, parseDate(flags.on) || today(), parseDate(flags.expires), str(flags.provider) || null],
  );
  return { json: row, text: `${p.full_name}: ${course} recorded${row.expires_on ? `, expires ${isoDate(row.expires_on)}` : ''}.` };
}

async function cmdInspection(db, args, flags) {
  const sub = args[0];
  if (sub === 'add') {
    const site = await resolve(db, 'site', args.slice(1).join(' '));
    const kind = str(flags.kind) || 'site_inspection';
    if (!INSPECTION_KINDS.includes(kind)) throw new CliError(`--kind= is one of: ${INSPECTION_KINDS.join(', ')}`);
    const due = parseDate(flags.due);
    if (!due) throw new CliError('When is it due? --due=YYYY-MM-DD');
    const [row] = await db.query(
      `insert into inspections (site_id, kind, due_on, status) values ($1, $2, $3, 'due') returning *`,
      [site.id, kind, due],
    );
    return { json: row, text: `${kind} at ${site.name} on the calendar, due ${due}.` };
  }
  if (sub === 'done') {
    const site = await resolve(db, 'site', args.slice(1).join(' '));
    const params = [site.id];
    let where = `site_id = $1 and status = 'due'`;
    if (flags.kind) {
      params.push(str(flags.kind));
      where += ` and kind = $${params.length}`;
    }
    const rows = await db.query(`select * from inspections where ${where} order by due_on nulls last`, params);
    if (!rows.length) throw new CliError(`Nothing due at ${site.name}. \`inspections --all\` shows what exists; \`inspection add\` schedules one.`);
    if (rows.length > 1) {
      throw new CliError(
        `${site.name} has ${rows.length} inspections due. Say which: --kind=\n` +
          rows.map((r) => `  ${r.kind} due ${isoDate(r.due_on)}`).join('\n'),
      );
    }
    const findings = str(flags.findings);
    if (!findings) throw new CliError('What did you find? --findings="..." ("all clear" is a finding too). Anything that needs fixing becomes an action: action add.');
    const by = flags.by ? await whoIs(db, flags) : await whoIs(db, flags);
    const [row] = await db.query(
      `update inspections set status = 'done', done_on = $1, done_by = $2, findings = $3 where id = $4 returning *`,
      [parseDate(flags.on) || today(), by?.id || null, findings, rows[0].id],
    );
    let next = null;
    if (flags.next) {
      next = parseDate(flags.next);
      await db.query(`insert into inspections (site_id, kind, due_on, status) values ($1, $2, $3, 'due')`, [site.id, rows[0].kind, next]);
    }
    return {
      json: row,
      text: `${rows[0].kind} at ${site.name} done.${next ? ` Next one due ${next}.` : ' Schedule the next: inspection add.'}\nFindings that need fixing become actions: action add "..." --inspection-site="${site.name}" --owner= --due=`,
    };
  }
  throw new CliError('inspection add <site> --kind= --due=, or inspection done <site> [--kind=] --findings= [--next=]');
}

async function cmdSubstance(db, args, flags) {
  const sub = args[0];
  if (sub === 'add') {
    const name = args.slice(1).join(' ');
    if (!name) throw new CliError('substance add "<name>" --site= [--quantity= --location= --sds-dated=]');
    const site = flags.site ? await resolve(db, 'site', flags.site) : null;
    const sds = parseDate(flags['sds-dated']);
    const [row] = await db.query(
      `insert into substances (site_id, name, quantity, location, sds_dated_on) values ($1, $2, $3, $4, $5) returning *`,
      [site?.id || null, name, str(flags.quantity) || null, str(flags.location) || null, sds],
    );
    return {
      json: row,
      text: `${name} on the inventory${site ? ` at ${site.name}` : ''}.` +
        (sds ? '' : '\nNo SDS date recorded: get the safety data sheet and record it (substance sds "' + name + '" --dated=). The inventory and a current SDS are the Hazardous Substances Regulations 2017 floor.'),
    };
  }
  if (sub === 'sds') {
    const s = await resolve(db, 'substance', args.slice(1).join(' '));
    const dated = parseDate(flags.dated);
    if (!dated) throw new CliError('When is the SDS dated? --dated=YYYY-MM-DD (the issue date on the sheet, not today)');
    const [row] = await db.query(`update substances set sds_dated_on = $1 where id = $2 returning *`, [dated, s.id]);
    return { json: row, text: `${s.name}: SDS dated ${dated} on record.` };
  }
  if (sub === 'remove') {
    const s = await resolve(db, 'substance', args.slice(1).join(' '));
    const [row] = await db.query(`update substances set status = 'removed', note = coalesce($1, note) where id = $2 returning *`, [str(flags.note) || null, s.id]);
    return { json: row, text: `${s.name} marked removed from site. The row stays: the inventory is history too.` };
  }
  throw new CliError('substance add "<name>" --site= [--sds-dated=] | substance sds <name> --dated= | substance remove <name>');
}

async function cmdTalk(db, args, flags) {
  const site = await resolve(db, 'site', args.join(' ') || str(flags.site));
  const topic = str(flags.topic);
  if (!topic) throw new CliError('What was the talk about? talk <site> --topic="..." [--attendees= --on= --by=]');
  const by = await whoIs(db, flags);
  const [row] = await db.query(
    `insert into toolbox_talks (site_id, held_on, led_by, topic, attendees) values ($1, $2, $3, $4, $5) returning *`,
    [site.id, parseDate(flags.on) || today(), by?.id || null, topic, flags.attendees ? Number(flags.attendees) : null],
  );
  return { json: row, text: `Toolbox talk at ${site.name} on the record: "${topic}".` };
}

// ---------------------------------------------------------------------------
// The log, add, person set

async function cmdLog(db, args, flags) {
  const first = str(args[0]);
  let incident = null;
  let hazard = null;
  let site = null;
  let person = null;
  if (/^(inc-)?\d{3,}$/i.test(first) && /^inc/i.test(first)) incident = await resolve(db, 'incident', first, { optional: true });
  if (!incident && /^(haz-)?\d{3,}$/i.test(first) && /^haz/i.test(first)) hazard = await resolve(db, 'hazard', first, { optional: true });
  if (!incident && !hazard && /^\d{3,}$/.test(first)) incident = await resolve(db, 'incident', first, { optional: true });
  if (!incident && !hazard) {
    site = await resolve(db, 'site', first, { optional: true });
    if (!site) person = await resolve(db, 'person', first, { optional: true });
  }
  if (!incident && !hazard && !site && !person) {
    throw new CliError(`"${first}" matches no incident, hazard, site or person. log <INC-ref | HAZ-ref | site | person> "what happened"`);
  }
  const note = args.slice(1).join(' ');
  if (!note) throw new CliError('What happened? log <target> "what was said or done"');
  const by = await whoIs(db, flags);
  const [row] = await db.query(
    `insert into notes (site_id, incident_id, hazard_id, person_id, by_id, noted_on, note) values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [site?.id || null, incident?.id || null, hazard?.id || null, person?.id || null, by?.id || null, parseDate(flags.on) || today(), note],
  );
  const target = incident?.ref || hazard?.ref || site?.name || person?.full_name;
  return { json: row, text: `Logged against ${target}.` };
}

async function cmdAdd(db, args, flags) {
  const kind = args[0];
  const name = args.slice(1).join(' ');
  if (!name) throw new CliError(`add ${kind || 'person|site'} "<name>" [--flags]`);
  if (kind === 'person') {
    const role = str(flags.role) || 'worker';
    if (!PERSON_ROLES.includes(role)) throw new CliError(`--role= is one of: ${PERSON_ROLES.join(', ')}`);
    const site = flags.site ? await resolve(db, 'site', flags.site) : null;
    const [row] = await db.query(
      `insert into people (full_name, role, company, email, phone, site_id, started_on) values ($1, $2, $3, $4, $5, $6, $7) returning *`,
      [name, role, str(flags.company) || null, str(flags.email) || null, str(flags.phone) || null, site?.id || null, parseDate(flags.started) || today()],
    );
    return {
      json: row,
      text: `${name} added (${role}${row.company ? `, ${row.company}` : ''}).\nNobody works before the induction: induct "${name}" --on=today` ,
    };
  }
  if (kind === 'site') {
    const manager = flags.manager ? await resolve(db, 'person', flags.manager) : null;
    const [row] = await db.query(
      `insert into sites (name, address, manager_id) values ($1, $2, $3) returning *`,
      [name, str(flags.address) || null, manager?.id || null],
    );
    return { json: row, text: `${name} added.\nGive it a calendar and a voice: inspection add "${name}" --due=, talk "${name}" --topic= after the first pre-start.` };
  }
  throw new CliError('add person "<name>" [--role= --company= --site= --phone=], or add site "<name>" [--address= --manager=]');
}

async function cmdPersonSet(db, args, flags) {
  const p = await resolve(db, 'person', args.join(' '));
  const site = flags.site ? await resolve(db, 'site', flags.site) : null;
  const role = str(flags.role) || null;
  if (role && !PERSON_ROLES.includes(role)) throw new CliError(`--role= is one of: ${PERSON_ROLES.join(', ')}`);
  const [row] = await db.query(
    `update people set role = coalesce($1, role), company = coalesce($2, company), email = coalesce($3, email),
       phone = coalesce($4, phone), site_id = coalesce($5, site_id), status = coalesce($6, status), note = coalesce($7, note)
     where id = $8 returning *`,
    [role, str(flags.company) || null, str(flags.email) || null, str(flags.phone) || null, site?.id || null,
     str(flags.status) || null, str(flags.note) || null, p.id],
  );
  let text = `${p.full_name} updated.`;
  if (str(flags.status) === 'former') text += ' Their records stay: training, incidents and notes are the business\'s history, and notifiable-event records are kept five years (HSWA s 57).';
  return { json: row, text };
}

// ---------------------------------------------------------------------------
// Compliance: the rule book, run against the records. docs/compliance.md
// carries each rule's source; this is the executable half.

const RULES = [
  {
    key: 'notifiable',
    title: 'Every notifiable event reported to WorkSafe, as soon as possible',
    source: 'HSWA 2015 s 56: notify WorkSafe as soon as possible after becoming aware of a notifiable event, then in writing within 48 hours. s 55: preserve the site',
    sql: `select ref || ' ' || site as label, kind || ' occurred ' || to_char(occurred_on, 'YYYY-MM-DD') || ' (' || days_ago || ' days ago) and WorkSafe has not been notified' as detail
          from v_incidents where notifiable and worksafe_notified_on is null`,
    fix: 'Phone 0800 030 040 now, then worksafe <ref> --on=today --ref="<their reference>". The written notification drafts with npm run docs.',
  },
  {
    key: 'investigations',
    title: 'No incident investigation open past thirty days',
    source: 'HSWA 2015 s 30: risks dealt with so far as reasonably practicable. An event month-old and unexplained is a risk you have chosen not to understand',
    sql: `select ref || ' ' || site as label, kind || ' from ' || to_char(occurred_on, 'YYYY-MM-DD') || ' still ' || status || ' after ' || days_open || ' days' as detail
          from v_incidents where status <> 'closed' and days_open > 30 order by days_open desc`,
    fix: 'investigate <ref> --findings="..." with what is actually known, action add what changes, then close it.',
  },
  {
    key: 'actions',
    title: 'No corrective action overdue',
    source: 'HSWA 2015 s 30 and s 36 (primary duty of care). An action written down and left overdue is a risk you knew about, dated, in your own records; it is the first exhibit after the next event',
    sql: `select title as label, 'due ' || to_char(due_on, 'YYYY-MM-DD') || ' (' || abs(days_to_due) || ' days ago), owner ' || owner || ', from ' || source as detail
          from v_actions where status = 'open' and due_on < current_date order by due_on`,
    fix: 'Do it and action done <match>, or re-date it deliberately with the reason in the log. Silence is the one wrong answer.',
  },
  {
    key: 'controls',
    title: 'No high or critical hazard held by administration or PPE alone',
    source: 'GRWM Regulations 2016 reg 6: the hierarchy of controls. Elimination, substitution, isolation and engineering come before administration and PPE, and the duty is to work down from the top',
    sql: `select ref || ' ' || site as label, band || ' (' || score || '/25): "' || title || '" controlled by ' || coalesce(control_level, 'nothing recorded') as detail
          from v_hazards where status <> 'closed' and band in ('high','critical') and (control_level is null or control_level in ('administration','ppe')) order by score desc`,
    fix: 'Work the hierarchy: what would eliminate, substitute, isolate or engineer this down? hazard control <ref> --controls= --control-level= when it changes.',
  },
  {
    key: 'reviews',
    title: 'No hazard control review overdue',
    source: 'GRWM Regulations 2016 reg 8: control measures reviewed, and revised when they are not fit. A register nobody re-reads is a register in name only',
    sql: `select ref || ' ' || site as label, band || ' hazard "' || title || '" review was due ' || to_char(review_due_on, 'YYYY-MM-DD') || ' (' || abs(days_to_review) || ' days ago)' as detail
          from v_hazards where status <> 'closed' and review_due_on < current_date order by review_due_on`,
    fix: 'Walk it, look at the control working (or not), then hazard review <ref> --note="what you found" --review=<next date>.',
  },
  {
    key: 'inductions',
    title: 'Nobody on the tools with a missing or expired site induction',
    source: 'HSWA 2015 s 36(3)(f) and GRWM Regulations 2016 reg 9: information, training, instruction and supervision. Contractors count: overlapping duties (s 34) do not care whose payroll someone is on',
    sql: `select person as label, case when induction = 'MISSING' then role || case when company <> '' then ' (' || company || ')' else '' end || ': no site induction on record'
          else 'induction expired ' || to_char(expires_on, 'YYYY-MM-DD') end as detail
          from v_inductions where induction in ('MISSING','EXPIRED') order by induction, person`,
    fix: 'Run the induction today and record it: induct "<name>" --on=today. Until then they work supervised or not at all.',
  },
  {
    key: 'substances',
    title: 'Every in-use hazardous substance on the inventory with a current safety data sheet',
    source: 'Health and Safety at Work (Hazardous Substances) Regulations 2017: an inventory of hazardous substances (reg 2.5) and an SDS no more than five years old available for each (reg 2.7)',
    sql: `select name || ' at ' || site as label, case when sds = 'MISSING' then 'no SDS on the inventory' else 'SDS dated ' || to_char(sds_dated_on, 'YYYY-MM-DD') || ', older than five years' end as detail
          from v_substances where status = 'in_use' and sds in ('MISSING','STALE') order by sds, name`,
    fix: 'Get the current SDS from the supplier (they must provide it) and record its issue date: substance sds "<name>" --dated=.',
  },
  {
    key: 'engagement',
    title: 'Every active site with a toolbox talk inside the last fortnight',
    source: 'HSWA 2015 ss 58-61: engage with workers on health and safety matters, and have worker participation practices. The fortnight is this business\'s own standard; the duty is ongoing',
    sql: `select site as label, case when last_talk_on is null then 'no toolbox talk on record' else 'last talk ' || to_char(last_talk_on, 'YYYY-MM-DD') || ' (' || days_since || ' days ago)' end as detail
          from v_toolbox where last_talk_on is null or days_since > 14`,
    fix: 'Hold one at the next pre-start on something real from this list, then talk <site> --topic= --attendees=.',
  },
];

async function cmdCompliance(db, args) {
  const only = args[0];
  const rules = only ? RULES.filter((r) => r.key === only) : RULES;
  if (!rules.length) throw new CliError(`No rule "${only}". Rules: ${RULES.map((r) => r.key).join(', ')}`);
  const results = [];
  for (const rule of rules) {
    const breaches = await db.query(rule.sql);
    results.push({ key: rule.key, title: rule.title, source: rule.source, fix: rule.fix, breaches });
  }
  let text = heading('The rule book, run against the records');
  for (const r of results) {
    text += `\n\n${r.breaches.length ? 'FAIL' : ' ok '} ${r.key}: ${r.title}`;
    text += `\n      ${r.source}`;
    for (const b of r.breaches) text += `\n      - ${b.label}: ${b.detail}`;
    if (r.breaches.length) text += `\n      fix: ${r.fix}`;
  }
  const failed = results.filter((r) => r.breaches.length).length;
  text += `\n\n${results.length - failed} of ${results.length} rules pass. Sources and the fuller reading: docs/compliance.md. None of this is legal advice.`;
  return { json: results, text };
}

// ---------------------------------------------------------------------------
// Import and export

function mapIncidentKind(v) {
  const s = String(v || '').trim().toLowerCase();
  if (s.includes('death') || s.includes('fatal')) return 'death';
  if (s.includes('notifiable') && s.includes('incident')) return 'notifiable_incident';
  if (s.includes('notifiable') || s.includes('serious harm') || s.includes('serious injury')) return 'notifiable_injury';
  if (s.includes('lost time') || s.includes('lti')) return 'lost_time';
  if (s.includes('medical') || s.includes('mti')) return 'medical';
  if (s.includes('first aid') || s.includes('fai')) return 'first_aid';
  if (s.includes('near') || s.includes('close call')) return 'near_miss';
  if (s.includes('property') || s.includes('damage')) return 'property';
  if (s.includes('environment') || s.includes('spill')) return 'environment';
  return 'near_miss';
}

function mapControlLevel(v) {
  const s = String(v || '').trim().toLowerCase();
  for (const level of CONTROL_LEVELS) if (s.includes(level)) return level;
  if (s.includes('engineer')) return 'engineering';
  if (s.includes('admin') || s.includes('procedure') || s.includes('training')) return 'administration';
  if (s.includes('ppe') || s.includes('protective')) return 'ppe';
  return null;
}

function clampRating(v, dflt = 3) {
  const n = Number(String(v ?? '').replace(/\D/g, '').slice(0, 1));
  return n >= 1 && n <= 5 ? n : dflt;
}

async function cmdImport(db, args, flags) {
  const source = args[0];
  if (!['ecoportal', 'sitedocs', 'csv'].includes(source || '')) {
    throw new CliError('import ecoportal|sitedocs|csv --people=file.csv [--hazards=file.csv] [--incidents=file.csv] [--trainings=file.csv] [--dry-run]');
  }
  const dryRun = Boolean(flags['dry-run']);
  const readCsv = (flag) => {
    const file = str(flags[flag]);
    if (!file) return null;
    if (!existsSync(file)) throw new CliError(`No ${flag} file at ${file}.`);
    return parseCsv(readFileSync(file, 'utf8'));
  };
  const peopleRows = readCsv('people');
  const hazardRows = readCsv('hazards');
  const incidentRows = readCsv('incidents');
  const trainingRows = readCsv('trainings');
  if (!peopleRows && !hazardRows && !incidentRows && !trainingRows) {
    throw new CliError('Nothing to import. Pass at least one of --people= --hazards= --incidents= --trainings=.');
  }

  const counts = { people: 0, people_updated: 0, sites: 0, hazards: 0, incidents: 0, trainings: 0, skipped: 0, unreported_notifiable: 0 };
  const skips = [];
  const pendingPeople = new Map();
  const pendingSites = new Map();

  const findPerson = async (name) => {
    if (!name) return null;
    const rows = await db.query('select * from people where lower(full_name) = lower($1)', [name]);
    if (rows.length === 1) return rows[0];
    return pendingPeople.get(name.toLowerCase()) || null;
  };
  const findOrCreateSite = async (name) => {
    if (!name) return null;
    const rows = await db.query('select * from sites where lower(name) = lower($1)', [name]);
    if (rows.length === 1) return rows[0];
    const pending = pendingSites.get(name.toLowerCase());
    if (pending) return pending;
    counts.sites++;
    if (dryRun) {
      const fake = { id: null, name, __pending: true };
      pendingSites.set(name.toLowerCase(), fake);
      return fake;
    }
    const [created] = await db.query('insert into sites (name) values ($1) returning *', [name]);
    pendingSites.set(name.toLowerCase(), created);
    return created;
  };

  if (peopleRows) {
    for (const row of peopleRows) {
      const name = pick(row, 'Name', 'Full Name', 'Person', 'Worker', 'Employee Name', 'Employee');
      if (!name) {
        counts.skipped++;
        skips.push('person row with no name column value');
        continue;
      }
      const roleRaw = String(pick(row, 'Role', 'Position', 'Type') || '').toLowerCase();
      const role = roleRaw.includes('contract') || roleRaw.includes('sub') ? 'contractor'
        : roleRaw.includes('manag') ? 'manager'
        : roleRaw.includes('super') || roleRaw.includes('foreman') ? 'supervisor'
        : roleRaw.includes('office') || roleRaw.includes('admin') ? 'office'
        : 'worker';
      const site = await findOrCreateSite(pick(row, 'Site', 'Location', 'Default Site'));
      const existing = await findPerson(name);
      if (existing) {
        counts.people_updated++;
        if (!dryRun) {
          await db.query(
            `update people set role = $1, company = coalesce($2, company), email = coalesce($3, email), phone = coalesce($4, phone), site_id = coalesce($5, site_id) where id = $6`,
            [role, pick(row, 'Company', 'Employer') || null, pick(row, 'Email') || null, pick(row, 'Phone', 'Mobile') || null, site?.id || null, existing.id],
          );
        }
      } else {
        counts.people++;
        if (dryRun) {
          pendingPeople.set(name.toLowerCase(), { id: null, full_name: name, __pending: true });
        } else {
          const [created] = await db.query(
            `insert into people (full_name, role, company, email, phone, site_id) values ($1, $2, $3, $4, $5, $6) returning *`,
            [name, role, pick(row, 'Company', 'Employer') || null, pick(row, 'Email') || null, pick(row, 'Phone', 'Mobile') || null, site?.id || null],
          );
          pendingPeople.set(name.toLowerCase(), created);
        }
      }
    }
  }

  if (hazardRows) {
    for (const row of hazardRows) {
      const title = pick(row, 'Hazard', 'Title', 'Risk', 'Description', 'Hazard Description');
      if (!title) {
        counts.skipped++;
        skips.push('hazard row with no title column value');
        continue;
      }
      const site = await findOrCreateSite(pick(row, 'Site', 'Location'));
      counts.hazards++;
      if (!dryRun) {
        const ref = await nextRef(db, 'HAZ', 'hazards', 100);
        await db.query(
          `insert into hazards (ref, site_id, title, category, description, likelihood, consequence, controls, control_level, review_due_on, status, external_ref)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) on conflict (external_ref) do nothing`,
          [ref, site?.id || null, truncate(title, 120), 'other', pick(row, 'Details', 'Notes') || null,
           clampRating(pick(row, 'Likelihood')), clampRating(pick(row, 'Consequence', 'Severity')),
           pick(row, 'Controls', 'Control Measures', 'Current Controls') || null,
           mapControlLevel(pick(row, 'Control Level', 'Control Type', 'Hierarchy')),
           pick(row, 'Review Due', 'Next Review') ? parseDate(pick(row, 'Review Due', 'Next Review')) : addDays(today(), 90),
           'open', pick(row, 'ID', 'Ref', 'Reference') || null],
        );
      }
    }
  }

  if (incidentRows) {
    for (const row of incidentRows) {
      const title = pick(row, 'Title', 'Incident', 'Summary', 'Description', 'Event');
      if (!title) {
        counts.skipped++;
        skips.push('incident row with no title column value');
        continue;
      }
      const site = await findOrCreateSite(pick(row, 'Site', 'Location'));
      const person = await findPerson(pick(row, 'Person', 'Injured Person', 'Worker', 'Name'));
      const kind = mapIncidentKind(pick(row, 'Type', 'Kind', 'Category', 'Severity') || title);
      const notifiable = NOTIFIABLE_KINDS.has(kind);
      const notifiedRaw = pick(row, 'WorkSafe Notified', 'Notified Date', 'Regulator Notified');
      const statusRaw = String(pick(row, 'Status') || '').toLowerCase();
      counts.incidents++;
      if (notifiable && !notifiedRaw) counts.unreported_notifiable++;
      if (!dryRun) {
        const ref = await nextRef(db, 'INC', 'incidents', 200);
        await db.query(
          `insert into incidents (ref, site_id, person_id, kind, notifiable, occurred_on, title, description, days_lost, worksafe_notified_on, worksafe_ref, status, findings, closed_on, external_ref)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) on conflict (external_ref) do nothing`,
          [ref, site?.id || null, person?.id || null, kind, notifiable,
           pick(row, 'Date', 'Occurred', 'Incident Date') ? parseDate(pick(row, 'Date', 'Occurred', 'Incident Date')) : today(),
           truncate(title, 140), pick(row, 'Details', 'Description', 'Notes') || null,
           Number(String(pick(row, 'Days Lost', 'LTI Days') || '0').replace(/\D/g, '') || 0),
           notifiedRaw ? parseDate(notifiedRaw) : null, pick(row, 'WorkSafe Ref', 'Regulator Ref') || null,
           statusRaw.includes('closed') || statusRaw.includes('complete') ? 'closed' : 'open',
           pick(row, 'Findings', 'Investigation', 'Root Cause') || null,
           statusRaw.includes('closed') || statusRaw.includes('complete') ? (pick(row, 'Date', 'Occurred', 'Incident Date') ? parseDate(pick(row, 'Date', 'Occurred', 'Incident Date')) : today()) : null,
           pick(row, 'ID', 'Ref', 'Reference') || null],
        );
      }
    }
  }

  if (trainingRows) {
    for (const row of trainingRows) {
      const name = pick(row, 'Person', 'Name', 'Worker', 'Employee');
      const person = await findPerson(name);
      if (!person) {
        counts.skipped++;
        skips.push(`training for "${name || '(no name)'}" matches nobody on file`);
        continue;
      }
      const course = pick(row, 'Course', 'Training', 'Ticket', 'Competency') || 'site induction';
      counts.trainings++;
      if (!dryRun && !person.__pending) {
        await db.query(
          `insert into trainings (person_id, course, completed_on, expires_on, provider) values ($1, $2, $3, $4, $5)`,
          [person.id, course,
           pick(row, 'Completed', 'Date', 'Completed On') ? parseDate(pick(row, 'Completed', 'Date', 'Completed On')) : today(),
           pick(row, 'Expires', 'Expiry', 'Expires On') ? parseDate(pick(row, 'Expires', 'Expiry', 'Expires On')) : null,
           pick(row, 'Provider') || null],
        );
      }
    }
  }

  const json = { ...counts, dry_run: dryRun, skips };
  let text = `${dryRun ? 'DRY RUN, nothing written. Would import' : 'Imported'}: ` +
    `${counts.people} new people (${counts.people_updated} updated), ${counts.sites} new sites, ` +
    `${counts.hazards} hazards, ${counts.incidents} incidents, ${counts.trainings} training records.`;
  if (counts.unreported_notifiable) {
    text += `\n${counts.unreported_notifiable} imported notifiable event(s) carry no WorkSafe notification date. They will sit at the top of the attention list until the date is on the record; if they were reported, record it (worksafe <ref> --on=), and if they were not, that is worth knowing today.`;
  }
  if (skips.length) text += `\nSkipped ${counts.skipped}:\n` + skips.map((x) => `  - ${x}`).join('\n');
  text += dryRun ? '\nRun again without --dry-run to write it.' : '\nCheck it: stats, attention, compliance.';
  return { json, text };
}

async function cmdExport(db, args, flags) {
  const tables = ['people', 'sites', 'hazards', 'incidents', 'actions', 'inspections', 'trainings', 'substances', 'toolbox_talks', 'notes'];
  const out = {};
  for (const t of tables) out[t] = await db.query(`select * from ${t} order by created_at`);
  const counts = Object.fromEntries(tables.map((t) => [t, out[t].length]));
  const file = str(flags.out) || path.join(REPO_ROOT, 'exports', `safety-export-${today()}.json`);
  const dir = path.dirname(file);
  const { mkdirSync } = await import('node:fs');
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(out, null, 2));
  return {
    json: { file, counts },
    text: `Exported the whole database to ${file}.\n  ` + Object.entries(counts).map(([t, n]) => `${t}: ${n}`).join(', ') +
      '\nPlain JSON of plain tables. Notifiable-event records are part of your five-year retention (HSWA s 57).',
  };
}

// ---------------------------------------------------------------------------
// Help and dispatch

const HELP = `
Health and Safety for Claude Code: the CLI behind the slash commands.

  node scripts/safety.mjs <command> [args] [--flags]     (or: npm run safety -- <command>)

The incident pipeline (report it, tell WorkSafe if it is notifiable, learn from it, close it):
  report <site> --kind= --title= [--person= --hazard= --on= --description= --days-lost=]
  worksafe <ref> --on= [--ref=]            record the WorkSafe notification (notifiable events only)
  investigate <ref> --findings=            what actually happened and why
  action add "what changes" --incident=|--hazard=|--inspection-site= --owner= --due=
  action done <match>
  close <ref> [--findings=]                refuses: notifiable + WorkSafe untold, or no action recorded

Reads:
  attention                 everything that wants a decision, worst first
  incidents [--site= --kind= --all]        incident <ref>       the full card
  hazards [--site= --band= --all]          hazard <ref>         the full card
  actions [--all --overdue]  |  inductions  |  inspections [--all]
  substances [--site= --all] |  toolbox [--site=]  |  trend  |  sites  |  site <name>
  people [--all]  |  person <name>  |  stats
  compliance [rule]         the rule book run against the records, sources cited

Writes:
  hazard add <site> --title= --category= --likelihood=1-5 --consequence=1-5 [--controls= --control-level=]
  hazard control <ref> --controls= --control-level=     hazard review <ref> --note= [--review=]
  induct <person> [--on= --expires=]                    training add <person> --course= [--expires=]
  inspection add <site> --kind= --due=                  inspection done <site> --findings= [--next=]
  substance add "<name>" --site= [--sds-dated=]         substance sds <name> --dated=
  talk <site> --topic= [--attendees=]                   log <target> "what was said"
  add person "<name>" [--role= --company= --site=]      add site "<name>" [--address=]
  person set <name> [--status=former --site= --role=]
  import ecoportal|sitedocs|csv --people= [--hazards= --incidents= --trainings=] [--dry-run]
  export [--out=file.json]

Risk is likelihood x consequence on a 5x5 matrix: 1-4 low, 5-9 moderate, 10-16 high, 17-25 critical.
Any command takes --json. Names and refs match case-insensitively ("201" finds INC-201); an ambiguous
one lists the candidates rather than guessing.
A notifiable event cannot close until the WorkSafe notification date is on the record (HSWA s 56).
Nothing connects to WorkSafe and nothing sends: notifications draft to docs-out/, a person makes the call.
Nothing here is legal advice.
`;

const COMMANDS = {
  people: cmdPeople,
  person: async (db, args, flags) => (args[0] === 'set' ? cmdPersonSet(db, args.slice(1), flags) : cmdPerson(db, args, flags)),
  sites: cmdSites,
  site: cmdSite,
  hazards: cmdHazards,
  hazard: async (db, args, flags) =>
    ['add', 'control', 'review', 'close'].includes(args[0]) ? cmdHazardWrite(db, args, flags) : cmdHazard(db, args, flags),
  incidents: cmdIncidents,
  incident: cmdIncident,
  report: cmdReport,
  worksafe: cmdWorksafe,
  investigate: cmdInvestigate,
  close: cmdClose,
  actions: cmdActions,
  action: cmdAction,
  inductions: cmdInductions,
  induct: cmdInduct,
  training: cmdTraining,
  inspections: cmdInspections,
  inspection: cmdInspection,
  substances: cmdSubstances,
  substance: cmdSubstance,
  toolbox: cmdToolbox,
  talk: cmdTalk,
  log: cmdLog,
  add: cmdAdd,
  attention: cmdAttention,
  trend: cmdTrend,
  compliance: cmdCompliance,
  stats: cmdStats,
  import: cmdImport,
  export: cmdExport,
};

async function main() {
  const { args, flags } = parseArgv(process.argv.slice(2));
  const [command, ...rest] = args;
  if (!command || command === 'help' || flags.help) {
    process.stdout.write(HELP);
    return 0;
  }
  const fn = COMMANDS[command];
  if (!fn) {
    process.stderr.write(`Unknown command "${command}".\n\n${HELP}`);
    return 1;
  }
  const db = await getDb();
  try {
    const result = await fn(db, rest, flags);
    if (flags.json) process.stdout.write(JSON.stringify(result.json, null, 2) + '\n');
    else process.stdout.write(result.text.replace(/^\n/, '') + '\n');
    return 0;
  } catch (e) {
    if (e instanceof CliError) {
      process.stderr.write(`${e.message}\n`);
      return e.code;
    }
    if (/relation "?\w+"? does not exist/.test(e.message)) {
      process.stderr.write('The database has no tables yet. Run: npm run migrate\n');
      return 1;
    }
    throw e;
  } finally {
    await db.close();
  }
}

process.exitCode = await main();
