#!/usr/bin/env node
// Loads supabase/seed.sql: Harbourline Civil Ltd, a fictional Tauranga civil
// contractor with a depot, two live sites, fourteen people, a hazard register,
// an inspection calendar, a training record, a substances inventory and a
// fortnight of events in every state. Every row has a derived id and inserts
// with ON CONFLICT DO NOTHING, so re-running it is harmless.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';

export async function seed(db) {
  const sql = readFileSync(path.join(REPO_ROOT, 'supabase', 'seed.sql'), 'utf8');
  await db.exec(sql);
  const [c] = await db.query(`
    select (select count(*) from people)         as people,
           (select count(*) from sites)          as sites,
           (select count(*) from hazards)        as hazards,
           (select count(*) from incidents)      as incidents,
           (select count(*) from actions)        as actions,
           (select count(*) from inspections)    as inspections,
           (select count(*) from trainings)      as trainings,
           (select count(*) from substances)     as substances,
           (select count(*) from toolbox_talks)  as toolbox_talks
  `);
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)]));
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const db = await getDb();
  try {
    const n = await seed(db);
    console.log(
      `seed: ${n.people} people, ${n.sites} sites, ${n.hazards} hazards, ${n.incidents} incidents, ` +
        `${n.actions} actions, ${n.inspections} inspections, ${n.trainings} trainings, ${n.substances} substances, ${n.toolbox_talks} toolbox talks`,
    );
  } finally {
    await db.close();
  }
}
