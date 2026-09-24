-- Demo data for health-safety-for-claude-code.
-- Harbourline Civil Ltd, a fictional Tauranga civil construction contractor: a
-- depot and two live sites, twelve staff and two contractors, a hazard
-- register, an inspection calendar, a training record, a hazardous substances
-- inventory and a fortnight of events in every state.
--
-- Deliberately messy, so the attention list has something to say:
--   a notifiable injury two days old that WorkSafe has NOT been notified about
--   the injured worker's working-at-heights ticket expired 45 days before the fall
--   a corrective action from a lost-time injury six days overdue
--   a guardrail repair from an inspection nine days overdue
--   a high excavation hazard controlled by PPE alone
--   a traffic management hazard whose review is 21 days overdue
--   a contractor on site with an expired induction, a new starter with none
--   a first aid certificate expiring in 12 days
--   a site inspection nine days overdue and a site 16 days without a toolbox talk
--   a primer with no safety data sheet and a curing compound whose SDS is six years old
--
-- Dates are relative to current_date. Ids are derived from names with
-- seed_uuid, and every insert is ON CONFLICT DO NOTHING, so running it twice
-- changes nothing.
--
-- Names, sites and events are DEMO VALUES for a fictional business. No real
-- person, company or event is depicted, and nothing here is legal advice.

create or replace function seed_uuid(seed text) returns uuid language sql immutable as $$
  select (substr(m, 1, 8) || '-' || substr(m, 9, 4) || '-4' || substr(m, 13, 3)
          || '-8' || substr(m, 16, 3) || '-' || substr(m, 19, 12))::uuid
  from (select md5(seed) as m) s
$$;

-- People ------------------------------------------------------------------------

insert into people (id, full_name, role, company, email, phone, status, started_on) values
  (seed_uuid('person:rachel'),   'Rachel Nand',      'manager',    null, 'rachel@harbourlinecivil.example.nz',  '027 555 0101', 'active', current_date - 2900),
  (seed_uuid('person:marcus'),   'Marcus Tuilagi',   'supervisor', null, 'marcus@harbourlinecivil.example.nz',  '027 555 0102', 'active', current_date - 2100),
  (seed_uuid('person:steve'),    'Steve Callaghan',  'supervisor', null, 'steve@harbourlinecivil.example.nz',   '027 555 0103', 'active', current_date - 1500),
  (seed_uuid('person:piotr'),    'Piotr Nowak',      'worker',     null, null, '021 555 0104', 'active', current_date - 900),
  (seed_uuid('person:hemi'),     'Hemi Walker',      'worker',     null, null, '021 555 0105', 'active', current_date - 800),
  (seed_uuid('person:danielle'), 'Danielle Priest',  'worker',     null, null, '021 555 0106', 'active', current_date - 1200),
  (seed_uuid('person:sione'),    'Sione Fifita',     'worker',     null, null, '021 555 0107', 'active', current_date - 600),
  (seed_uuid('person:ryan'),     'Ryan Duffell',     'worker',     null, null, '021 555 0108', 'active', current_date - 400),
  (seed_uuid('person:ana'),      'Ana Kirifi',       'worker',     null, null, '021 555 0109', 'active', current_date - 700),
  (seed_uuid('person:grant'),    'Grant Molloy',     'worker',     null, null, '021 555 0110', 'active', current_date - 6),
  (seed_uuid('person:kevin'),    'Kevin Bruce',      'worker',     null, null, '021 555 0111', 'active', current_date - 1900),
  (seed_uuid('person:lisa'),     'Lisa Trainor',     'office',     null, 'accounts@harbourlinecivil.example.nz', '07 555 0112', 'active', current_date - 2200),
  (seed_uuid('person:wiremu'),   'Wiremu Beattie',   'contractor', 'KiwiCone Traffic Management', null, '021 555 0113', 'active', current_date - 300),
  (seed_uuid('person:dale'),     'Dale Hartmann',    'contractor', 'Hartmann Drainage',           null, '021 555 0114', 'active', current_date - 150)
on conflict do nothing;

-- Sites ---------------------------------------------------------------------------

insert into sites (id, name, address, manager_id, status) values
  (seed_uuid('site:depot'),    'Matapihi Depot',              '14 Te Maire Road, Matapihi, Tauranga', seed_uuid('person:rachel'), 'active'),
  (seed_uuid('site:pyespa'),   'Pyes Pa Ridge Subdivision',   'Stage 3, Pyes Pa Road, Tauranga',      seed_uuid('person:marcus'), 'active'),
  (seed_uuid('site:omokoroa'), 'Omokoroa Stormwater Upgrade', 'Prole Road, Omokoroa',                 seed_uuid('person:steve'),  'active')
on conflict do nothing;

update people set site_id = seed_uuid('site:pyespa')
  where id in (seed_uuid('person:marcus'), seed_uuid('person:piotr'), seed_uuid('person:hemi'), seed_uuid('person:grant'), seed_uuid('person:wiremu')) and site_id is null;
update people set site_id = seed_uuid('site:omokoroa')
  where id in (seed_uuid('person:steve'), seed_uuid('person:sione'), seed_uuid('person:ryan'), seed_uuid('person:ana'), seed_uuid('person:dale')) and site_id is null;
update people set site_id = seed_uuid('site:depot')
  where id in (seed_uuid('person:rachel'), seed_uuid('person:danielle'), seed_uuid('person:kevin'), seed_uuid('person:lisa')) and site_id is null;

-- Hazards ---------------------------------------------------------------------------
-- likelihood x consequence: 1-4 low, 5-9 moderate, 10-16 high, 17-25 critical.

insert into hazards (id, ref, site_id, title, category, description, likelihood, consequence, controls, control_level, owner_id, identified_on, review_due_on, status) values
  (seed_uuid('haz:101'), 'HAZ-101', seed_uuid('site:pyespa'),   'Open excavation near live services',        'excavation', 'Stage 3 trenching runs within 2 m of a marked 11kV cable and a live water main.', 3, 4,
   'Hi-vis and steel caps mandatory in the trench zone.', 'ppe', seed_uuid('person:marcus'), current_date - 18, current_date + 30, 'open'),
  (seed_uuid('haz:102'), 'HAZ-102', seed_uuid('site:pyespa'),   'Mobile plant and people in the same area',  'plant', 'Two 20T diggers and truck movements share the cut with ground crew.', 4, 5,
   'Exclusion zones fenced, spotter for every lift, reversing cameras, all plant induction-locked.', 'engineering', seed_uuid('person:marcus'), current_date - 60, current_date + 60, 'controlled'),
  (seed_uuid('haz:103'), 'HAZ-103', seed_uuid('site:omokoroa'), 'Live road traffic through the work zone',   'traffic', 'Prole Road stays open past the trench line; school buses morning and afternoon.', 3, 5,
   'TMP with stop/go, speed restriction to 30 km/h, KiwiCone crew on both approaches.', 'administration', seed_uuid('person:steve'), current_date - 90, current_date - 21, 'controlled'),
  (seed_uuid('haz:104'), 'HAZ-104', seed_uuid('site:omokoroa'), 'Work at height on the pump station scaffold', 'height', 'Fixed scaffold, 3.2 m working deck on the wet well.', 3, 4,
   'Certified scaffold, weekly tag inspection, harness points fitted, ladder access gated.', 'engineering', seed_uuid('person:steve'), current_date - 45, current_date + 45, 'controlled'),
  (seed_uuid('haz:105'), 'HAZ-105', seed_uuid('site:pyespa'),   'Silica dust from concrete cutting',         'substance', 'Kerb and pipe cutting, dry days.', 3, 3,
   'Wet cutting required, cutting rostered away from crew, P2 respirators.', 'administration', seed_uuid('person:marcus'), current_date - 30, current_date + 90, 'controlled'),
  (seed_uuid('haz:106'), 'HAZ-106', seed_uuid('site:omokoroa'), 'Manual handling of pipe and fittings',      'manual', '600mm concrete pipe sections and heavy fittings between the truck and the trench.', 3, 2,
   'Excavator lifts anything over 25 kg, two-person rule on fittings, lifting in the induction.', 'engineering', seed_uuid('person:steve'), current_date - 120, current_date + 60, 'controlled'),
  (seed_uuid('haz:107'), 'HAZ-107', seed_uuid('site:depot'),    'Overhead power lines above the yard gantry', 'electrical', '11kV lines cross the north corner of the yard.', 2, 5,
   'No-go zone marked and fenced, height limiter on the yard crane, Powerco stand-over for any work inside 4 m.', 'isolation', seed_uuid('person:rachel'), current_date - 200, current_date + 120, 'controlled'),
  (seed_uuid('haz:108'), 'HAZ-108', seed_uuid('site:depot'),    'Bulk fuel storage and refuelling',          'substance', '2000 L diesel cube plus day tanks on both sites.', 2, 3,
   'Bunded tank, spill kits at each refuel point, no-smoking zone signed.', 'engineering', seed_uuid('person:rachel'), current_date - 300, current_date + 180, 'controlled'),
  (seed_uuid('haz:109'), 'HAZ-109', seed_uuid('site:omokoroa'), 'Working alone at the pump station after hours', 'other', 'Commissioning checks sometimes run past the crew leaving.', 2, 4,
   'Nobody works the wet well alone; after-hours checks call in and out with the supervisor.', 'administration', seed_uuid('person:steve'), current_date - 70, current_date + 100, 'controlled'),
  (seed_uuid('haz:110'), 'HAZ-110', seed_uuid('site:depot'),    'Workshop noise over 85 dB',                 'other', 'Grinders and the steel bench.', 2, 2,
   'Job rotated, grade 5 earmuffs at the bench, signage.', 'ppe', seed_uuid('person:rachel'), current_date - 400, null, 'closed')
on conflict do nothing;

-- Incidents ---------------------------------------------------------------------------
-- THE LOUD ONE: INC-201 is a notifiable injury from two days ago and
-- worksafe_notified_on is still null. Everything in the demo points at it.

insert into incidents (id, ref, site_id, person_id, reported_by, hazard_id, kind, notifiable, occurred_on, title, description, days_lost, worksafe_notified_on, worksafe_ref, status, findings, closed_on) values
  (seed_uuid('inc:201'), 'INC-201', seed_uuid('site:omokoroa'), seed_uuid('person:ryan'), seed_uuid('person:steve'), seed_uuid('haz:104'),
   'notifiable_injury', true, current_date - 2,
   'Fall from pump station scaffold, fractured wrist',
   'Ryan came off the scaffold deck reaching past the gated edge to guide a pipe lift. Fell approx 2.4 m onto the wet well slab, fractured right wrist, taken to Tauranga Hospital and admitted for surgery. Scene taped off, scaffold tagged out.', 2, null, null,
   'open', null, null),
  (seed_uuid('inc:202'), 'INC-202', seed_uuid('site:omokoroa'), seed_uuid('person:sione'), seed_uuid('person:steve'), seed_uuid('haz:106'),
   'lost_time', false, current_date - 26,
   'Back strain lifting a 600mm pipe fitting',
   'Sione lifted a flanged fitting from the truck deck alone instead of waiting for the excavator. Four days off work on the physio''s advice.', 4, null, null,
   'investigating', 'Fitting weighed 38 kg, over the two-person threshold. Crew say waiting for the excavator costs 20 minutes each time.', null),
  (seed_uuid('inc:203'), 'INC-203', seed_uuid('site:pyespa'), seed_uuid('person:hemi'), seed_uuid('person:marcus'), seed_uuid('haz:102'),
   'near_miss', false, current_date - 5,
   'Digger slew within a metre of ground crew',
   'The 20T slewed its counterweight through the marked walkway while Hemi was walking the pipe string. No contact. Exclusion fence had been moved for the morning''s pour and not reinstated.', 0, null, null,
   'open', null, null),
  (seed_uuid('inc:204'), 'INC-204', seed_uuid('site:omokoroa'), seed_uuid('person:ana'), seed_uuid('person:steve'), null,
   'first_aid', false, current_date - 12,
   'Laceration to left hand on pipe strap',
   'Ana cut her palm on a frayed lifting strap while unhooking. First aid on site, two steri-strips, back to work.', 0, null, null,
   'closed', 'Strap was past its service date. All slings and straps on both sites inspected the same week; three retired.', current_date - 9),
  (seed_uuid('inc:205'), 'INC-205', seed_uuid('site:pyespa'), null, seed_uuid('person:marcus'), seed_uuid('haz:101'),
   'near_miss', false, current_date - 40,
   'Potholing struck abandoned duct beside marked cable',
   'Hydro-vac uncovered an unrecorded duct 400 mm from the marked 11kV alignment. Work stopped, Powerco located and confirmed dead.', 0, null, null,
   'closed', 'Service plans for stage 3 incomplete. Pothole-before-dig now mandatory within 5 m of any marked service.', current_date - 35),
  (seed_uuid('inc:206'), 'INC-206', seed_uuid('site:depot'), null, seed_uuid('person:rachel'), null,
   'property', false, current_date - 20,
   'Truck reversed into the yard gate post',
   'Six-wheeler clipped the south gate post turning for the washdown. Post replaced, no injury.', 0, null, null,
   'closed', 'Mirror blind spot plus a gate pinch point. Reverse-in parking banned on the washdown apron.', current_date - 18),
  (seed_uuid('inc:207'), 'INC-207', seed_uuid('site:pyespa'), null, seed_uuid('person:marcus'), seed_uuid('haz:101'),
   'notifiable_incident', true, current_date - 100,
   'Uncontrolled trench wall collapse, nobody in the trench',
   'A 1.9 m unbattered face let go overnight after rain. Nobody in the trench; classed a notifiable incident (uncontrolled collapse). WorkSafe notified by phone the same morning.', 0, current_date - 100, 'WSN-2026-44718',
   'closed', 'Face had been left unbattered over the weekend against the dig plan. Shields now stay in any trench over 1.5 m regardless of programme.', current_date - 88),
  (seed_uuid('inc:208'), 'INC-208', seed_uuid('site:depot'), seed_uuid('person:kevin'), seed_uuid('person:rachel'), null,
   'medical', false, current_date - 60,
   'Grinding spark burn to forearm',
   'Kevin took a spark burn through a worn glove at the steel bench. GP visit, dressed, no time lost.', 0, null, null,
   'closed', 'Glove stock was mixed grades. Workshop now stocks cut-and-heat rated gloves only.', current_date - 55)
on conflict do nothing;

-- Corrective actions --------------------------------------------------------------------

insert into actions (id, title, incident_id, hazard_id, inspection_id, owner_id, due_on, status, done_on, note) values
  (seed_uuid('act:scaffold'),  'Engineer inspection and re-certification of pump station scaffold before any reuse', seed_uuid('inc:201'), null, null, seed_uuid('person:steve'),  current_date + 1,  'open', null, 'Scaffold stays tagged out until this closes.'),
  (seed_uuid('act:edge'),      'Review edge protection and gate interlock on all working decks',                     seed_uuid('inc:201'), null, null, seed_uuid('person:rachel'), current_date + 7,  'open', null, null),
  (seed_uuid('act:lifter'),    'Buy pipe lifter and write the two-person fitting SOP into the induction',            seed_uuid('inc:202'), null, null, seed_uuid('person:steve'),  current_date - 6,  'open', null, 'Quote approved, not ordered.'),
  (seed_uuid('act:fence'),     'Reinstate-before-work rule: exclusion fence checked at every pre-start',             seed_uuid('inc:203'), null, null, seed_uuid('person:marcus'), current_date + 2,  'open', null, null),
  (seed_uuid('act:tmp'),       'Refresh the Prole Road TMP with council and re-brief the KiwiCone crew',             null, seed_uuid('haz:103'), null, seed_uuid('person:steve'),  current_date + 3,  'open', null, null),
  (seed_uuid('act:straps'),    'Inspect and re-tag every sling and strap on both sites',                             seed_uuid('inc:204'), null, null, seed_uuid('person:steve'),  current_date - 10, 'done', current_date - 9, 'Three straps retired.'),
  (seed_uuid('act:pothole'),   'Make pothole-before-dig mandatory within 5 m of marked services',                    seed_uuid('inc:205'), null, null, seed_uuid('person:marcus'), current_date - 36, 'done', current_date - 35, 'Written into the dig plan.'),
  (seed_uuid('act:shields'),   'Trench shields in every trench over 1.5 m, no programme exceptions',                 seed_uuid('inc:207'), null, null, seed_uuid('person:marcus'), current_date - 90, 'done', current_date - 88, null),
  (seed_uuid('act:gloves'),    'Replace workshop glove stock with cut-and-heat rated gloves',                        seed_uuid('inc:208'), null, null, seed_uuid('person:rachel'), current_date - 50, 'done', current_date - 52, null)
on conflict do nothing;

-- Inspections ---------------------------------------------------------------------------

insert into inspections (id, site_id, kind, due_on, done_on, done_by, findings, status) values
  (seed_uuid('insp:omok-site'),  seed_uuid('site:omokoroa'), 'site_inspection', current_date - 9,  null, null, null, 'due'),
  (seed_uuid('insp:pyespa-site'),seed_uuid('site:pyespa'),   'site_inspection', current_date - 3,  current_date - 3, seed_uuid('person:marcus'), 'Access ramp guardrail damaged by the loader; needs replacing. Housekeeping good. Fence line moved for the pour (see INC-203).', 'done'),
  (seed_uuid('insp:pyespa-next'),seed_uuid('site:pyespa'),   'site_inspection', current_date + 4,  null, null, null, 'due'),
  (seed_uuid('insp:depot-plant'),seed_uuid('site:depot'),    'plant_check',     current_date - 10, current_date - 10, seed_uuid('person:kevin'), 'All plant WOF and service current. Yard crane height limiter tested.', 'done'),
  (seed_uuid('insp:drill'),      seed_uuid('site:depot'),    'emergency_drill', current_date + 20, null, null, null, 'due'),
  (seed_uuid('insp:scaffold'),   seed_uuid('site:omokoroa'), 'scaffold_check',  current_date - 30, current_date - 30, seed_uuid('person:steve'), 'Tag current, ties sound. Gate latch stiff on the top lift.', 'done')
on conflict do nothing;

insert into actions (id, title, incident_id, hazard_id, inspection_id, owner_id, due_on, status, done_on, note) values
  (seed_uuid('act:guardrail'), 'Replace damaged guardrail on the Pyes Pa access ramp', null, null, seed_uuid('insp:pyespa-site'), seed_uuid('person:marcus'), current_date - 1, 'open', null, 'Loader clipped it; barrier taped in the meantime.')
on conflict do nothing;

-- Training and inductions -----------------------------------------------------------------
-- Site inductions run two years here. Wiremu's has expired; Grant has none yet.
-- Ryan's working-at-heights ticket expired 45 days before his fall.

insert into trainings (id, person_id, course, completed_on, expires_on, provider) values
  (seed_uuid('tr:rachel-ind'),   seed_uuid('person:rachel'),   'site induction',     current_date - 400, current_date + 330, 'internal'),
  (seed_uuid('tr:marcus-ind'),   seed_uuid('person:marcus'),   'site induction',     current_date - 300, current_date + 430, 'internal'),
  (seed_uuid('tr:steve-ind'),    seed_uuid('person:steve'),    'site induction',     current_date - 350, current_date + 380, 'internal'),
  (seed_uuid('tr:piotr-ind'),    seed_uuid('person:piotr'),    'site induction',     current_date - 200, current_date + 530, 'internal'),
  (seed_uuid('tr:hemi-ind'),     seed_uuid('person:hemi'),     'site induction',     current_date - 250, current_date + 480, 'internal'),
  (seed_uuid('tr:danielle-ind'), seed_uuid('person:danielle'), 'site induction',     current_date - 500, current_date + 230, 'internal'),
  (seed_uuid('tr:sione-ind'),    seed_uuid('person:sione'),    'site induction',     current_date - 180, current_date + 550, 'internal'),
  (seed_uuid('tr:ryan-ind'),     seed_uuid('person:ryan'),     'site induction',     current_date - 390, current_date + 340, 'internal'),
  (seed_uuid('tr:ana-ind'),      seed_uuid('person:ana'),      'site induction',     current_date - 280, current_date + 450, 'internal'),
  (seed_uuid('tr:kevin-ind'),    seed_uuid('person:kevin'),    'site induction',     current_date - 600, current_date + 130, 'internal'),
  (seed_uuid('tr:dale-ind'),     seed_uuid('person:dale'),     'site induction',     current_date - 140, current_date + 590, 'internal'),
  (seed_uuid('tr:wiremu-ind'),   seed_uuid('person:wiremu'),   'site induction',     current_date - 760, current_date - 30,  'internal'),
  (seed_uuid('tr:rachel-fa'),    seed_uuid('person:rachel'),   'first aid',          current_date - 600, current_date + 130, 'Red Cross'),
  (seed_uuid('tr:steve-fa'),     seed_uuid('person:steve'),    'first aid',          current_date - 500, current_date + 230, 'Red Cross'),
  (seed_uuid('tr:danielle-fa'),  seed_uuid('person:danielle'), 'first aid',          current_date - 718, current_date + 12,  'Red Cross'),
  (seed_uuid('tr:ryan-heights'), seed_uuid('person:ryan'),     'working at heights', current_date - 775, current_date - 45,  'Vertical Horizonz'),
  (seed_uuid('tr:hemi-heights'), seed_uuid('person:hemi'),     'working at heights', current_date - 200, current_date + 530, 'Vertical Horizonz'),
  (seed_uuid('tr:dale-confined'),seed_uuid('person:dale'),     'confined space',     current_date - 100, current_date + 265, 'Vertical Horizonz'),
  (seed_uuid('tr:wiremu-tc'),    seed_uuid('person:wiremu'),   'traffic control (TTM)', current_date - 200, current_date + 900, 'Waka Kotahi approved'),
  (seed_uuid('tr:kevin-crane'),  seed_uuid('person:kevin'),    'yard crane operation', current_date - 300, current_date + 430, 'internal')
on conflict do nothing;

-- Hazardous substances ---------------------------------------------------------------------

insert into substances (id, site_id, name, quantity, location, sds_dated_on, status) values
  (seed_uuid('sub:diesel'),   seed_uuid('site:depot'),    'Diesel',                        '2000 L cube + day tanks', 'Bunded tank, north yard', current_date - 200,  'in_use'),
  (seed_uuid('sub:primer'),   seed_uuid('site:omokoroa'), 'Denso bitumen primer',          '4 x 20 L',                'Site container',          null,                 'in_use'),
  (seed_uuid('sub:cure'),     seed_uuid('site:pyespa'),   'Concrete curing compound',      '60 L',                    'Stage 3 container',       current_date - 2200,  'in_use'),
  (seed_uuid('sub:hydraulic'),seed_uuid('site:depot'),    'Hydraulic oil ISO 46',          '400 L',                   'Workshop store',          current_date - 300,   'in_use'),
  (seed_uuid('sub:lpg'),      seed_uuid('site:depot'),    'LPG (forklift and cutting)',    '6 x 9 kg',                'Cage, workshop wall',     current_date - 100,   'in_use'),
  (seed_uuid('sub:oldpaint'), seed_uuid('site:depot'),    'Line marking paint (solvent)',  'removed',                 'was: workshop store',     current_date - 900,   'removed')
on conflict do nothing;

-- Toolbox talks -------------------------------------------------------------------------------

insert into toolbox_talks (id, site_id, held_on, led_by, topic, attendees) values
  (seed_uuid('talk:pyespa-1'),   seed_uuid('site:pyespa'),   current_date - 2,  seed_uuid('person:marcus'), 'Exclusion zones after INC-203: fence goes back before work starts', 7),
  (seed_uuid('talk:pyespa-2'),   seed_uuid('site:pyespa'),   current_date - 9,  seed_uuid('person:marcus'), 'Pothole-before-dig within 5 m of services', 6),
  (seed_uuid('talk:depot-1'),    seed_uuid('site:depot'),    current_date - 6,  seed_uuid('person:rachel'), 'Yard traffic plan and the washdown apron', 5),
  (seed_uuid('talk:omokoroa-1'), seed_uuid('site:omokoroa'), current_date - 16, seed_uuid('person:steve'),  'School bus windows and the stop/go crew', 6),
  (seed_uuid('talk:omokoroa-2'), seed_uuid('site:omokoroa'), current_date - 23, seed_uuid('person:steve'),  'Wet well access and gas testing', 6),
  (seed_uuid('talk:depot-2'),    seed_uuid('site:depot'),    current_date - 13, seed_uuid('person:rachel'), 'Glove grades at the steel bench', 4)
on conflict do nothing;

-- The log ---------------------------------------------------------------------------------------

insert into notes (id, incident_id, by_id, noted_on, note) values
  (seed_uuid('note:ryan-1'), seed_uuid('inc:201'), seed_uuid('person:steve'),  current_date - 2, 'Scene taped off, scaffold tagged out, photos taken before anything moved. Ryan in surgery this afternoon; family called.'),
  (seed_uuid('note:ryan-2'), seed_uuid('inc:201'), seed_uuid('person:rachel'), current_date - 1, 'Crew stood down from the scaffold. Statements from Steve and Ana on file.'),
  (seed_uuid('note:sione'),  seed_uuid('inc:202'), seed_uuid('person:steve'),  current_date - 20, 'Physio cleared Sione for light duties. Pipe lifter quote with Rachel.')
on conflict do nothing;

insert into notes (id, hazard_id, by_id, noted_on, note) values
  (seed_uuid('note:tmp'), seed_uuid('haz:103'), seed_uuid('person:steve'), current_date - 15, 'Council want the TMP refreshed before the school term starts. Booked with KiwiCone.')
on conflict do nothing;
