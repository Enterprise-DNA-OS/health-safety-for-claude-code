-- health-safety-for-claude-code: core schema.
-- A New Zealand business's health and safety system: the people (workers and
-- contractors), the sites, the hazard register with a 5x5 risk matrix and the
-- hierarchy of controls, the incident register with the notifiable-event gate
-- (HSWA 2015 s 56), the corrective actions, the inspection calendar, the
-- training and induction record, the hazardous substances inventory and the
-- toolbox talks.
--
-- Runs unchanged on PGlite (embedded) and on Postgres / Supabase.
--
-- The sharp edges are deliberate:
--   * an incident of a notifiable kind is flagged notifiable and the CLI will
--     not let it close until the WorkSafe notification date is on the record
--   * risk is likelihood x consequence, scored in the views, banded the way a
--     site actually talks (low, moderate, high, critical)
--   * nothing here connects to WorkSafe and nothing sends: the notification
--     drafts to a folder and a person makes the call.

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

-- People ------------------------------------------------------------------------
-- Workers, supervisors, managers, office staff and contractors, one table.
-- Contractors carry their company name; HSWA overlapping duties (s 34) do not
-- care whose payroll someone is on, and neither does the induction check.

create table if not exists people (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  role          text not null default 'worker',   -- manager | supervisor | worker | contractor | office
  company       text,                             -- contractors: who they work for
  email         text,
  phone         text,
  site_id       uuid,                             -- usual site (fk added after sites)
  status        text not null default 'active',   -- active | former
  started_on    date,
  note          text,
  external_ref  text unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists people_name_lower_idx on people (lower(full_name));

-- Sites ---------------------------------------------------------------------------

create table if not exists sites (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  address       text,
  manager_id    uuid references people(id) on delete set null,
  status        text not null default 'active',   -- active | closed
  note          text,
  external_ref  text unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists sites_name_lower_idx on sites (lower(name));

do $$
begin
  if not exists (select 1 from information_schema.table_constraints where constraint_name = 'people_site_fk') then
    alter table people add constraint people_site_fk foreign key (site_id) references sites(id) on delete set null;
  end if;
end
$$;

-- Hazards ---------------------------------------------------------------------------
-- The risk register. likelihood and consequence are 1 to 5; the views score and
-- band them (1-4 low, 5-9 moderate, 10-16 high, 17-25 critical). control_level
-- is where the control sits on the hierarchy (GRWM Regulations 2016 reg 6):
-- elimination first, PPE last. A high or critical hazard cannot enter the
-- register without controls recorded; the CLI refuses.

create table if not exists hazards (
  id             uuid primary key default gen_random_uuid(),
  ref            text unique,                      -- HAZ-101
  site_id        uuid references sites(id) on delete set null,
  title          text not null,
  category       text not null default 'other',    -- plant | height | excavation | traffic | manual | electrical | substance | environment | psychosocial | other
  description    text,
  likelihood     int not null check (likelihood between 1 and 5),
  consequence    int not null check (consequence between 1 and 5),
  controls       text,                             -- what is actually in place
  control_level  text check (control_level in ('elimination','substitution','isolation','engineering','administration','ppe')),
  owner_id       uuid references people(id) on delete set null,
  identified_on  date not null default current_date,
  review_due_on  date,
  status         text not null default 'open',     -- open | controlled | closed
  note           text,
  external_ref   text unique,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists hazards_site_idx on hazards (site_id);
create index if not exists hazards_status_idx on hazards (status);

-- Incidents ---------------------------------------------------------------------------
-- The event register. kind carries the severity ladder a NZ business reports
-- against; the three notifiable kinds MUST carry notifiable = true (the check
-- enforces it) and the CLI will not close one until worksafe_notified_on is
-- recorded (HSWA s 56: notify WorkSafe as soon as possible; s 55: preserve the
-- site). Records of notifiable events are kept at least five years (s 57), so
-- nothing here deletes.

create table if not exists incidents (
  id                    uuid primary key default gen_random_uuid(),
  ref                   text unique,               -- INC-201
  site_id               uuid references sites(id) on delete set null,
  person_id             uuid references people(id) on delete set null,   -- who was hurt or involved
  reported_by           uuid references people(id) on delete set null,
  hazard_id             uuid references hazards(id) on delete set null,  -- the register entry it points back to
  kind                  text not null default 'near_miss',
    -- near_miss | first_aid | medical | lost_time | notifiable_injury | notifiable_incident | death | property | environment
  notifiable            boolean not null default false,
  occurred_on           date not null default current_date,
  title                 text not null,
  description           text,
  days_lost             int not null default 0,
  worksafe_notified_on  date,
  worksafe_ref          text,
  status                text not null default 'open',   -- open | investigating | closed
  findings              text,
  closed_on             date,
  note                  text,
  external_ref          text unique,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint incidents_notifiable_kinds check (
    kind not in ('notifiable_injury','notifiable_incident','death') or notifiable
  )
);
create index if not exists incidents_site_idx on incidents (site_id);
create index if not exists incidents_status_idx on incidents (status);
create index if not exists incidents_kind_idx on incidents (kind);

-- Corrective actions ----------------------------------------------------------------
-- What changes because of an incident, a hazard or an inspection. An action
-- written down and left overdue is worse than none: it is a risk you knew
-- about, dated, in your own records.

create table if not exists actions (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  incident_id    uuid references incidents(id) on delete set null,
  hazard_id      uuid references hazards(id) on delete set null,
  inspection_id  uuid,                             -- fk added after inspections
  owner_id       uuid references people(id) on delete set null,
  due_on         date,
  status         text not null default 'open',     -- open | done
  done_on        date,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists actions_status_idx on actions (status);

-- Inspections ---------------------------------------------------------------------------
-- Site inspections, audits, plant checks, drills. Follows the calendar pattern:
-- due until done, and done can schedule the next one.

create table if not exists inspections (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid not null references sites(id) on delete cascade,
  kind         text not null default 'site_inspection',   -- site_inspection | audit | plant_check | scaffold_check | emergency_drill | other
  due_on       date,
  done_on      date,
  done_by      uuid references people(id) on delete set null,
  findings     text,
  status       text not null default 'due',   -- due | done
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists inspections_site_idx on inspections (site_id);

do $$
begin
  if not exists (select 1 from information_schema.table_constraints where constraint_name = 'actions_inspection_fk') then
    alter table actions add constraint actions_inspection_fk foreign key (inspection_id) references inspections(id) on delete set null;
  end if;
end
$$;

-- Training and inductions ------------------------------------------------------------
-- One row per ticket per person. The site induction is course = 'site induction';
-- the induction views and the compliance check key on it. expires_on drives the
-- expiring list.

create table if not exists trainings (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references people(id) on delete cascade,
  course        text not null,                    -- 'site induction', 'first aid', 'working at heights', ...
  completed_on  date not null default current_date,
  expires_on    date,
  provider      text,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists trainings_person_idx on trainings (person_id);

-- Hazardous substances -----------------------------------------------------------------
-- The inventory the Hazardous Substances Regulations 2017 require, with the SDS
-- date beside each line. An SDS older than five years is stale; a missing one
-- is a gap the compliance check reports.

create table if not exists substances (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid references sites(id) on delete set null,
  name          text not null,
  quantity      text,
  location      text,
  sds_dated_on  date,
  status        text not null default 'in_use',   -- in_use | removed
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists substances_site_idx on substances (site_id);

-- Toolbox talks ---------------------------------------------------------------------------
-- The engagement record (HSWA Part 3). A site that has not had a talk in a
-- fortnight shows on the attention list.

create table if not exists toolbox_talks (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references sites(id) on delete cascade,
  held_on     date not null default current_date,
  led_by      uuid references people(id) on delete set null,
  topic       text not null,
  attendees   int,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists talks_site_idx on toolbox_talks (site_id);

-- The log ---------------------------------------------------------------------------------
-- Calls, conversations, decisions, against a site, an incident, a hazard or a
-- person. Evidence of engagement, in the record.

create table if not exists notes (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid references sites(id) on delete set null,
  incident_id  uuid references incidents(id) on delete set null,
  hazard_id    uuid references hazards(id) on delete set null,
  person_id    uuid references people(id) on delete set null,   -- who it is about
  by_id        uuid references people(id) on delete set null,   -- who wrote it
  noted_on     date not null default current_date,
  note         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists notes_incident_idx on notes (incident_id);
create index if not exists notes_hazard_idx on notes (hazard_id);

-- updated_at triggers ------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['people','sites','hazards','incidents','actions','inspections','trainings','substances']
  loop
    execute format('drop trigger if exists %I on %I', t || '_updated_at', t);
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()', t || '_updated_at', t);
  end loop;
end
$$;

-- =====================================================================================
-- Views: the questions a safety manager asks every morning, as SQL anyone can read.
-- =====================================================================================

-- The risk register, scored and banded. 1-4 low, 5-9 moderate, 10-16 high, 17-25 critical.
create or replace view v_hazards as
select
  h.id as hazard_id,
  h.ref,
  coalesce(st.name, '(no site)') as site,
  h.site_id,
  h.title,
  h.category,
  h.likelihood,
  h.consequence,
  (h.likelihood * h.consequence) as score,
  case
    when h.likelihood * h.consequence >= 17 then 'critical'
    when h.likelihood * h.consequence >= 10 then 'high'
    when h.likelihood * h.consequence >= 5  then 'moderate'
    else 'low'
  end as band,
  h.controls,
  h.control_level,
  coalesce(p.full_name, 'unassigned') as owner,
  h.identified_on,
  h.review_due_on,
  (h.review_due_on - current_date) as days_to_review,
  h.status
from hazards h
left join sites st on st.id = h.site_id
left join people p on p.id = h.owner_id;

-- The incident register with the WorkSafe state loud.
create or replace view v_incidents as
select
  i.id as incident_id,
  i.ref,
  coalesce(st.name, '(no site)') as site,
  i.site_id,
  coalesce(p.full_name, '') as person,
  coalesce(rb.full_name, '') as reported_by,
  i.kind,
  i.notifiable,
  i.occurred_on,
  (current_date - i.occurred_on) as days_ago,
  i.title,
  i.days_lost,
  i.worksafe_notified_on,
  i.worksafe_ref,
  i.status,
  case when i.status <> 'closed' then (current_date - i.occurred_on) end as days_open,
  i.findings,
  i.closed_on,
  i.hazard_id,
  hz.ref as hazard_ref
from incidents i
left join sites st on st.id = i.site_id
left join people p on p.id = i.person_id
left join people rb on rb.id = i.reported_by
left join hazards hz on hz.id = i.hazard_id;

-- Corrective actions with their source named.
create or replace view v_actions as
select
  a.id as action_id,
  a.title,
  case
    when a.incident_id is not null then 'incident ' || coalesce(i.ref, '')
    when a.hazard_id is not null then 'hazard ' || coalesce(h.ref, '')
    when a.inspection_id is not null then 'inspection: ' || coalesce(ins.kind, '')
    else 'standalone'
  end as source,
  coalesce(st.name, st2.name, st3.name, '') as site,
  coalesce(i.notifiable, false) as from_notifiable,
  coalesce(p.full_name, 'unassigned') as owner,
  a.due_on,
  (a.due_on - current_date) as days_to_due,
  a.status,
  a.done_on,
  a.incident_id,
  a.hazard_id,
  a.inspection_id
from actions a
left join incidents i on i.id = a.incident_id
left join hazards h on h.id = a.hazard_id
left join inspections ins on ins.id = a.inspection_id
left join sites st on st.id = i.site_id
left join sites st2 on st2.id = h.site_id
left join sites st3 on st3.id = ins.site_id
left join people p on p.id = a.owner_id;

-- Every ticket with its countdown.
create or replace view v_trainings as
select
  t.id as training_id,
  p.full_name as person,
  p.role,
  p.status as person_status,
  t.course,
  t.completed_on,
  t.expires_on,
  (t.expires_on - current_date) as days_to_expiry,
  case
    when t.expires_on is null then 'current'
    when t.expires_on < current_date then 'expired'
    when t.expires_on <= current_date + 30 then 'expiring'
    else 'current'
  end as ticket_status,
  t.provider,
  t.person_id
from trainings t
join people p on p.id = t.person_id;

-- One line per active person: their latest site induction and where it stands.
create or replace view v_inductions as
select
  p.id as person_id,
  p.full_name as person,
  p.role,
  coalesce(p.company, '') as company,
  coalesce(st.name, '') as site,
  ind.completed_on as inducted_on,
  ind.expires_on,
  (ind.expires_on - current_date) as days_to_expiry,
  case
    when ind.completed_on is null then 'MISSING'
    when ind.expires_on is not null and ind.expires_on < current_date then 'EXPIRED'
    when ind.expires_on is not null and ind.expires_on <= current_date + 30 then 'expiring'
    else 'current'
  end as induction
from people p
left join sites st on st.id = p.site_id
left join lateral (
  select t.completed_on, t.expires_on
  from trainings t
  where t.person_id = p.id and lower(t.course) like '%induction%'
  order by t.completed_on desc
  limit 1
) ind on true
where p.status = 'active' and p.role <> 'office';

-- The inspection calendar, overdue first.
create or replace view v_inspections as
select
  ins.id as inspection_id,
  st.name as site,
  ins.kind,
  ins.due_on,
  (ins.due_on - current_date) as days_to_due,
  ins.done_on,
  coalesce(p.full_name, '') as done_by,
  ins.findings,
  ins.status,
  ins.site_id
from inspections ins
join sites st on st.id = ins.site_id
left join people p on p.id = ins.done_by;

-- The substances inventory with the SDS state.
create or replace view v_substances as
select
  s.id as substance_id,
  coalesce(st.name, '(no site)') as site,
  s.name,
  s.quantity,
  s.location,
  s.sds_dated_on,
  case
    when s.sds_dated_on is null then 'MISSING'
    when s.sds_dated_on < current_date - 1826 then 'STALE'
    else 'current'
  end as sds,
  s.status,
  s.site_id
from substances s
left join sites st on st.id = s.site_id;

-- Last toolbox talk per active site.
create or replace view v_toolbox as
select
  st.id as site_id,
  st.name as site,
  tk.held_on as last_talk_on,
  (current_date - tk.held_on) as days_since,
  coalesce(p.full_name, '') as led_by,
  tk.topic,
  tk.attendees
from sites st
left join lateral (
  select * from toolbox_talks t where t.site_id = st.id order by t.held_on desc limit 1
) tk on true
left join people p on p.id = tk.led_by
where st.status = 'active';

-- One line per site: the whole safety position.
create or replace view v_site_position as
select
  st.id as site_id,
  st.name as site,
  st.status,
  coalesce(m.full_name, 'unassigned') as manager,
  (select count(*) from people p where p.site_id = st.id and p.status = 'active') as people,
  (select count(*) from v_hazards h where h.site_id = st.id and h.status <> 'closed' and h.band in ('high','critical')) as high_hazards,
  (select count(*) from incidents i where i.site_id = st.id and i.occurred_on >= current_date - 90) as incidents_90d,
  (select count(*) from incidents i where i.site_id = st.id and i.notifiable and i.worksafe_notified_on is null) as unreported_notifiable,
  (select count(*) from v_actions a where a.site = st.name and a.status = 'open') as open_actions,
  (select count(*) from v_actions a where a.site = st.name and a.status = 'open' and a.due_on < current_date) as overdue_actions,
  (select max(t.held_on) from toolbox_talks t where t.site_id = st.id) as last_toolbox_on,
  (current_date - (select max(t.held_on) from toolbox_talks t where t.site_id = st.id)) as days_since_toolbox,
  (select min(i.due_on) from inspections i where i.site_id = st.id and i.status = 'due') as next_inspection_due
from sites st
left join people m on m.id = st.manager_id;

-- Twelve months of incidents, month by month. The trend the board asks about.
create or replace view v_trend as
select
  to_char(date_trunc('month', i.occurred_on), 'YYYY-MM') as month,
  count(*) filter (where i.kind = 'near_miss') as near_misses,
  count(*) filter (where i.kind in ('first_aid','medical','lost_time','notifiable_injury','death')) as injuries,
  count(*) filter (where i.notifiable) as notifiable,
  coalesce(sum(i.days_lost), 0) as days_lost
from incidents i
where i.occurred_on >= date_trunc('month', current_date) - interval '11 months'
group by 1
order by 1;

-- Everything that wants a decision, one union, worst first. An unreported
-- notifiable event outranks everything, because HSWA s 56 says "as soon as
-- possible" and every day is evidence.
create or replace view v_attention as
-- A notifiable event WorkSafe has not been told about.
select 'notifiable_unreported' as reason, i.ref as label, i.site, i.reported_by as owner,
       i.days_ago as days,
       'NOTIFIABLE (' || i.kind || ') occurred ' || to_char(i.occurred_on, 'YYYY-MM-DD') || ' and WorkSafe has not been notified: ' || i.title as detail
from v_incidents i
where i.notifiable and i.worksafe_notified_on is null
union all
-- A corrective action past its date.
select 'action_overdue', a.title, a.site, a.owner,
       abs(a.days_to_due),
       'due ' || to_char(a.due_on, 'YYYY-MM-DD') || ' (' || a.source || ')' ||
       case when a.from_notifiable then ' FROM A NOTIFIABLE EVENT' else '' end
from v_actions a
where a.status = 'open' and a.due_on < current_date
union all
-- Someone on site with no current induction.
select 'induction_' || lower(ind.induction), ind.person, ind.site, ind.person,
       case when ind.induction = 'EXPIRED' then abs(ind.days_to_expiry) end,
       case when ind.induction = 'MISSING'
            then ind.role || case when ind.company <> '' then ' (' || ind.company || ')' else '' end || ' with no site induction on record'
            else 'induction expired ' || to_char(ind.expires_on, 'YYYY-MM-DD') end
from v_inductions ind
where ind.induction in ('MISSING','EXPIRED')
union all
-- A high or critical hazard held by PPE or paperwork alone.
select 'hazard_uncontrolled', h.ref, h.site, h.owner,
       (current_date - h.identified_on),
       h.band || ' (' || h.score || '/25): ' || h.title || ' is controlled by ' ||
       coalesce(h.control_level, 'nothing recorded') || ': the hierarchy asks for better (GRWM reg 6)'
from v_hazards h
where h.status <> 'closed' and h.band in ('high','critical')
  and (h.control_level is null or h.control_level in ('administration','ppe'))
union all
-- A hazard review past its date.
select 'hazard_review_overdue', h.ref, h.site, h.owner,
       abs(h.days_to_review),
       h.band || ' hazard "' || h.title || '" review was due ' || to_char(h.review_due_on, 'YYYY-MM-DD')
from v_hazards h
where h.status <> 'closed' and h.review_due_on < current_date
union all
-- An investigation open past a fortnight.
select 'investigation_stale', i.ref, i.site, i.reported_by,
       i.days_open,
       i.kind || ' from ' || to_char(i.occurred_on, 'YYYY-MM-DD') || ' still ' || i.status || ': ' || i.title
from v_incidents i
where i.status <> 'closed' and i.days_open > 14
union all
-- An inspection past its date.
select 'inspection_overdue', ins.kind, ins.site, ins.done_by,
       abs(ins.days_to_due),
       ins.kind || ' was due ' || to_char(ins.due_on, 'YYYY-MM-DD')
from v_inspections ins
where ins.status = 'due' and ins.due_on < current_date
union all
-- A substance without a current safety data sheet.
select 'sds_gap', s.name, s.site, null,
       case when s.sds_dated_on is not null then (current_date - s.sds_dated_on) end,
       case when s.sds = 'MISSING' then 'no safety data sheet on the inventory'
            else 'safety data sheet dated ' || to_char(s.sds_dated_on, 'YYYY-MM-DD') || ', older than five years' end
from v_substances s
where s.status = 'in_use' and s.sds in ('MISSING','STALE')
union all
-- A ticket expiring inside 30 days.
select 'training_expiring', t.person, '', t.person,
       t.days_to_expiry,
       t.course || ' expires ' || to_char(t.expires_on, 'YYYY-MM-DD')
from v_trainings t
where t.person_status = 'active' and t.ticket_status = 'expiring'
union all
-- A site gone quiet: no toolbox talk in a fortnight.
select 'toolbox_quiet', tb.site, tb.site, tb.led_by,
       tb.days_since,
       case when tb.last_talk_on is null then 'no toolbox talk on record'
            else 'last toolbox talk ' || to_char(tb.last_talk_on, 'YYYY-MM-DD') || ' (' || tb.days_since || ' days ago)' end
from v_toolbox tb
where tb.last_talk_on is null or tb.days_since > 14;
