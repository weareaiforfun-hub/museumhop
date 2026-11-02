-- MuseumHop (lives in the shared to-one project, so its tables and functions carry the na_ prefix).
-- One "night" per friend group. Everyone signs in anonymously today; because membership is keyed on auth.uid(),
-- upgrading an anonymous user to a real account later keeps all their data. Nights are reachable only through an
-- invite token (stored hashed), and every table is scoped by night_id, so strangers' groups never see each other.
-- Every table has an opaque uuid primary key: Realtime DELETE events carry only the primary key and can't be
-- filtered, so this keeps them free of anything meaningful.

create table public.na_nights (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Museumnacht 2026' check (char_length(name) between 1 and 80),
  event_date date not null default '2026-11-07',
  vote_deadline timestamptz,
  route_locked_at timestamptz,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.na_members (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.na_nights(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  display_name text not null check (char_length(display_name) between 1 and 32),
  color text not null default '#2f6db5' check (color ~ '^#[0-9a-fA-F]{6}$'),
  role text not null default 'planner' check (role in ('organiser', 'planner', 'viewer')),
  fictional boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (night_id, user_id)
);

create table public.na_invites (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.na_nights(id) on delete cascade,
  token_hash text not null unique,
  role text not null default 'planner' check (role in ('planner', 'viewer')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table public.na_crews (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.na_nights(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  color text not null default '#2f6db5' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_at timestamptz not null default now()
);

create table public.na_crew_members (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.na_nights(id) on delete cascade,
  crew_id uuid not null references public.na_crews(id) on delete cascade,
  user_id uuid not null,
  unique (night_id, user_id) -- one crew per person per night
);

-- Shared route (one per night), personal routes (one per person; these are the "route ideas") and crew routes.
create table public.na_routes (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.na_nights(id) on delete cascade,
  kind text not null check (kind in ('shared', 'personal', 'crew')),
  owner_user uuid,
  crew_id uuid references public.na_crews(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 100),
  description text not null default '' check (char_length(description) <= 1500),
  practical text not null default '' check (char_length(practical) <= 2000),
  updated_at timestamptz not null default now(),
  check ((kind = 'personal') = (owner_user is not null)),
  check ((kind = 'crew') = (crew_id is not null))
);
create unique index na_routes_shared on public.na_routes (night_id) where kind = 'shared';
create unique index na_routes_personal on public.na_routes (night_id, owner_user) where kind = 'personal';
create unique index na_routes_crew on public.na_routes (crew_id) where kind = 'crew';

-- One row per stop, ordered by a fractional position: a move rewrites only `pos`, a time change only
-- `arrival`/`duration`, so concurrent edits by different people both survive.
create table public.na_stops (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.na_nights(id) on delete cascade,
  route_id uuid not null references public.na_routes(id) on delete cascade,
  pos double precision not null,
  event_id text not null check (event_id ~ '^[a-z0-9:_-]{1,160}$'),
  arrival text not null default '' check (arrival = '' or arrival ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  duration int not null default 45 check (duration between 10 and 240),
  reason text not null default '' check (char_length(reason) <= 500),
  practical text not null default '' check (char_length(practical) <= 600),
  transfer text not null default '' check (char_length(transfer) <= 400),
  fixed boolean not null default false,
  updated_by uuid not null default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (route_id, event_id)
);
create index na_stops_route on public.na_stops (route_id, pos);

create table public.na_reactions (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.na_nights(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  event_id text not null check (event_id ~ '^[a-z0-9:_-]{1,160}$'),
  reaction text not null check (reaction in ('must', 'up', 'skip')),
  note text not null default '' check (char_length(note) <= 240),
  updated_at timestamptz not null default now(),
  unique (night_id, user_id, event_id)
);

create table public.na_idea_votes (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.na_nights(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  route_id uuid not null references public.na_routes(id) on delete cascade,
  unique (night_id, user_id)
);

create table public.na_meetups (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.na_nights(id) on delete cascade,
  at text not null check (at ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  event_id text not null check (event_id ~ '^[a-z0-9:_-]{1,160}$'),
  note text not null default '' check (char_length(note) <= 240),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.na_meetup_crews (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.na_nights(id) on delete cascade,
  meetup_id uuid not null references public.na_meetups(id) on delete cascade,
  crew_id uuid not null references public.na_crews(id) on delete cascade,
  confirmed_at timestamptz,
  arrived_at timestamptz,
  unique (meetup_id, crew_id)
);

-- Who changed what, written only by triggers. Feeds the activity list.
create table public.na_activity (
  id uuid primary key default gen_random_uuid(),
  night_id uuid not null references public.na_nights(id) on delete cascade,
  user_id uuid,
  kind text not null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index na_activity_night on public.na_activity (night_id, created_at desc);

/* ---------- access helpers ---------- */

-- The caller's role in a night, or null. Security definer avoids RLS recursion on na_members.
create function public.na_role(n uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from na_members where night_id = n and user_id = auth.uid();
$$;

create function public.na_can_write(n uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.na_role(n) in ('organiser', 'planner'), false);
$$;

-- Who may change a route and its stops.
create function public.na_can_edit_route(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case ro.kind
    when 'shared' then public.na_can_write(ro.night_id)
      and (nt.route_locked_at is null or nt.route_locked_at > now() or public.na_role(ro.night_id) = 'organiser')
    when 'personal' then ro.owner_user = auth.uid() and public.na_role(ro.night_id) is not null
    when 'crew' then public.na_can_write(ro.night_id)
      and exists (select 1 from na_crew_members cm where cm.crew_id = ro.crew_id and cm.user_id = auth.uid())
  end
  from na_routes ro join na_nights nt on nt.id = ro.night_id where ro.id = r;
$$;

/* ---------- row level security ---------- */

alter table public.na_nights enable row level security;
alter table public.na_members enable row level security;
alter table public.na_invites enable row level security;
alter table public.na_crews enable row level security;
alter table public.na_crew_members enable row level security;
alter table public.na_routes enable row level security;
alter table public.na_stops enable row level security;
alter table public.na_reactions enable row level security;
alter table public.na_idea_votes enable row level security;
alter table public.na_meetups enable row level security;
alter table public.na_meetup_crews enable row level security;
alter table public.na_activity enable row level security;

create policy "members read night" on public.na_nights for select using (public.na_role(id) is not null);
create policy "organiser edits night" on public.na_nights for update
  using (public.na_role(id) = 'organiser') with check (public.na_role(id) = 'organiser');

create policy "members read members" on public.na_members for select using (public.na_role(night_id) is not null);
create policy "edit own member row" on public.na_members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Invites are read through the organiser's own view only; joining goes through na_join_night.
create policy "organiser reads invites" on public.na_invites for select using (public.na_role(night_id) = 'organiser');

create policy "members read crews" on public.na_crews for select using (public.na_role(night_id) is not null);
create policy "planners add crews" on public.na_crews for insert with check (public.na_can_write(night_id));
create policy "planners edit crews" on public.na_crews for update
  using (public.na_can_write(night_id)) with check (public.na_can_write(night_id));
create policy "planners remove crews" on public.na_crews for delete using (public.na_can_write(night_id));

create policy "members read crew members" on public.na_crew_members for select using (public.na_role(night_id) is not null);
create policy "planners add crew members" on public.na_crew_members for insert with check (
  public.na_can_write(night_id)
  and exists (select 1 from na_crews c where c.id = crew_id and c.night_id = na_crew_members.night_id)
  and exists (select 1 from na_members m where m.night_id = na_crew_members.night_id and m.user_id = na_crew_members.user_id));
create policy "planners remove crew members" on public.na_crew_members for delete using (public.na_can_write(night_id));

create policy "members read routes" on public.na_routes for select using (public.na_role(night_id) is not null);
create policy "add own personal or crew route" on public.na_routes for insert with check (
  (kind = 'personal' and owner_user = auth.uid() and public.na_role(night_id) is not null)
  or (kind = 'crew' and public.na_can_write(night_id)
      and exists (select 1 from na_crews c where c.id = crew_id and c.night_id = na_routes.night_id)));
create policy "editors update routes" on public.na_routes for update
  using (public.na_can_edit_route(id)) with check (public.na_can_edit_route(id));
create policy "owners remove personal routes" on public.na_routes for delete using (kind = 'personal' and owner_user = auth.uid());

create policy "members read stops" on public.na_stops for select using (public.na_role(night_id) is not null);
create policy "editors add stops" on public.na_stops for insert with check (
  public.na_can_edit_route(route_id) and exists (select 1 from na_routes r where r.id = route_id and r.night_id = na_stops.night_id));
create policy "editors update stops" on public.na_stops for update
  using (public.na_can_edit_route(route_id)) with check (public.na_can_edit_route(route_id));
create policy "editors remove stops" on public.na_stops for delete using (public.na_can_edit_route(route_id));

create policy "members read reactions" on public.na_reactions for select using (public.na_role(night_id) is not null);
create policy "add own reaction" on public.na_reactions for insert
  with check (user_id = auth.uid() and public.na_can_write(night_id));
create policy "edit own reaction" on public.na_reactions for update
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.na_can_write(night_id));
create policy "remove own reaction" on public.na_reactions for delete using (user_id = auth.uid());

create policy "members read idea votes" on public.na_idea_votes for select using (public.na_role(night_id) is not null);
create policy "cast own idea vote" on public.na_idea_votes for insert with check (
  user_id = auth.uid() and public.na_can_write(night_id)
  and exists (select 1 from na_routes r where r.id = route_id and r.night_id = na_idea_votes.night_id and r.kind = 'personal'));
create policy "change own idea vote" on public.na_idea_votes for update
  using (user_id = auth.uid()) with check (user_id = auth.uid()
    and exists (select 1 from na_routes r where r.id = route_id and r.night_id = na_idea_votes.night_id and r.kind = 'personal'));
create policy "remove own idea vote" on public.na_idea_votes for delete using (user_id = auth.uid());

create policy "members read meetups" on public.na_meetups for select using (public.na_role(night_id) is not null);
create policy "planners add meetups" on public.na_meetups for insert with check (public.na_can_write(night_id) and created_by = auth.uid());
create policy "planners edit meetups" on public.na_meetups for update
  using (public.na_can_write(night_id)) with check (public.na_can_write(night_id));
create policy "planners remove meetups" on public.na_meetups for delete using (public.na_can_write(night_id));

-- A crew's confirmation / arrival can only be set by a member of that crew.
create policy "members read meetup crews" on public.na_meetup_crews for select using (public.na_role(night_id) is not null);
create policy "crew members confirm" on public.na_meetup_crews for insert with check (
  public.na_can_write(night_id)
  and exists (select 1 from na_crew_members cm where cm.crew_id = na_meetup_crews.crew_id and cm.user_id = auth.uid())
  and exists (select 1 from na_meetups mt where mt.id = meetup_id and mt.night_id = na_meetup_crews.night_id));
create policy "crew members update confirmation" on public.na_meetup_crews for update
  using (exists (select 1 from na_crew_members cm where cm.crew_id = na_meetup_crews.crew_id and cm.user_id = auth.uid()))
  with check (exists (select 1 from na_crew_members cm where cm.crew_id = na_meetup_crews.crew_id and cm.user_id = auth.uid()));
create policy "crew members withdraw" on public.na_meetup_crews for delete
  using (exists (select 1 from na_crew_members cm where cm.crew_id = na_meetup_crews.crew_id and cm.user_id = auth.uid()));

create policy "members read activity" on public.na_activity for select using (public.na_role(night_id) is not null);

/* ---------- guards and activity triggers ---------- */

create function public.na_touch_stop() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' and (select count(*) from na_stops where route_id = new.route_id) >= 40 then
    raise exception 'A route can have at most 40 stops.';
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;
create trigger na_stops_touch before insert or update on public.na_stops for each row execute function public.na_touch_stop();

create function public.na_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; v_kind text; v_data jsonb := '{}';
begin
  if current_setting('na.quiet', true) = 'on' then return null; end if;
  r := case when tg_op = 'DELETE' then old else new end;
  -- Rows removed because their whole night is being deleted.
  if not exists (select 1 from na_nights where id = r.night_id) then return null; end if;
  if tg_table_name = 'na_stops' then
    if tg_op = 'UPDATE' and old.pos is not distinct from new.pos and old.arrival is not distinct from new.arrival
       and old.duration is not distinct from new.duration then return null; end if;
    v_kind := case tg_op when 'INSERT' then 'stop_add' when 'DELETE' then 'stop_remove'
              else case when old.pos is distinct from new.pos then 'stop_move' else 'stop_time' end end;
    v_data := jsonb_build_object('event_id', r.event_id, 'route_id', r.route_id,
      'route_kind', (select kind from na_routes where id = r.route_id), 'arrival', r.arrival, 'duration', r.duration,
      'changed', case when tg_op = 'UPDATE' and old.arrival is not distinct from new.arrival then 'duration' else 'arrival' end);
  elsif tg_table_name = 'na_reactions' then
    if tg_op = 'UPDATE' and old.reaction = new.reaction then return null; end if;
    v_kind := case when tg_op = 'DELETE' then 'reaction_clear' else 'reaction' end;
    v_data := jsonb_build_object('event_id', r.event_id, 'reaction', r.reaction);
  elsif tg_table_name = 'na_members' then
    if tg_op <> 'INSERT' then return null; end if;
    v_kind := 'member_join'; v_data := jsonb_build_object('name', r.display_name);
  elsif tg_table_name = 'na_crews' then
    if tg_op <> 'INSERT' then return null; end if;
    v_kind := 'crew_add'; v_data := jsonb_build_object('name', r.name);
  elsif tg_table_name = 'na_meetups' then
    if tg_op <> 'INSERT' then return null; end if;
    v_kind := 'meetup_add'; v_data := jsonb_build_object('event_id', r.event_id, 'at', r.at);
  end if;
  insert into na_activity (night_id, user_id, kind, data) values (r.night_id, auth.uid(), v_kind, v_data);
  return null;
end $$;
create trigger na_stops_log after insert or update or delete on public.na_stops for each row execute function public.na_log();
create trigger na_reactions_log after insert or update or delete on public.na_reactions for each row execute function public.na_log();
create trigger na_members_log after insert on public.na_members for each row execute function public.na_log();
create trigger na_crews_log after insert on public.na_crews for each row execute function public.na_log();
create trigger na_meetups_log after insert on public.na_meetups for each row execute function public.na_log();

/* ---------- RPCs ---------- */

-- Create a night with its shared route and a planner invite; the caller becomes organiser. Returns the invite token.
create function public.na_create_night(p_name text, p_display_name text, p_color text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_night uuid; v_token text := encode(gen_random_bytes(32), 'hex');
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into na_nights (name, created_by) values (coalesce(nullif(trim(p_name), ''), 'Museumnacht 2026'), auth.uid())
    returning id into v_night;
  insert into na_members (night_id, user_id, display_name, color, role)
    values (v_night, auth.uid(), trim(p_display_name), p_color, 'organiser');
  insert into na_routes (night_id, kind, title) values (v_night, 'shared', 'Our route');
  insert into na_invites (night_id, token_hash, role) values (v_night, encode(digest(v_token, 'sha256'), 'hex'), 'planner');
  return v_token;
end $$;

-- Join (or rename yourself in) the night an invite token points to. Returns the night id.
create function public.na_join_night(p_token text, p_display_name text, p_color text, p_fictional boolean default false)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_invite na_invites;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into v_invite from na_invites
    where token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') and revoked_at is null;
  if v_invite.id is null then raise exception 'invite not found'; end if;
  if not exists (select 1 from na_members where night_id = v_invite.night_id and user_id = auth.uid())
     and (select count(*) from na_members where night_id = v_invite.night_id) >= 100 then
    raise exception 'This group is full.';
  end if;
  insert into na_members (night_id, user_id, display_name, color, role, fictional)
    values (v_invite.night_id, auth.uid(), trim(p_display_name), p_color, v_invite.role, p_fictional)
    on conflict (night_id, user_id) do update set display_name = excluded.display_name, color = excluded.color;
  return v_invite.night_id;
end $$;

-- Replace the shared route's stops with a copy of a personal route (a "route idea"), as one transaction and one
-- activity entry. Returns the number of stops.
create function public.na_adopt_route(p_route uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_src na_routes; v_shared uuid; v_n int;
begin
  select * into v_src from na_routes where id = p_route and kind = 'personal';
  if v_src.id is null then raise exception 'route idea not found'; end if;
  select id into v_shared from na_routes where night_id = v_src.night_id and kind = 'shared';
  if not public.na_can_edit_route(v_shared) then raise exception 'not allowed to change the shared route'; end if;
  select count(*) into v_n from na_stops where route_id = p_route;
  if v_n = 0 then raise exception 'Add at least one stop before using this route.'; end if;
  perform set_config('na.quiet', 'on', true);
  delete from na_stops where route_id = v_shared;
  insert into na_stops (night_id, route_id, pos, event_id, arrival, duration, reason, practical, transfer, fixed)
    select night_id, v_shared, pos, event_id, arrival, duration, reason, practical, transfer, fixed from na_stops where route_id = p_route;
  perform set_config('na.quiet', 'off', true);
  insert into na_activity (night_id, user_id, kind, data)
    values (v_src.night_id, auth.uid(), 'route_adopt', jsonb_build_object('route_id', p_route, 'title', v_src.title));
  return v_n;
end $$;

revoke execute on function public.na_create_night(text, text, text) from public, anon;
revoke execute on function public.na_join_night(text, text, text, boolean) from public, anon;
revoke execute on function public.na_adopt_route(uuid) from public, anon;
grant execute on function public.na_create_night(text, text, text) to authenticated;
grant execute on function public.na_join_night(text, text, text, boolean) to authenticated;
grant execute on function public.na_adopt_route(uuid) to authenticated;

alter publication supabase_realtime add table
  public.na_nights, public.na_members, public.na_crews, public.na_crew_members, public.na_routes, public.na_stops,
  public.na_reactions, public.na_idea_votes, public.na_meetups, public.na_meetup_crews, public.na_activity;

-- Row policies decide WHICH rows someone may update; these grants decide WHICH columns. Without them a member could
-- promote their own role, or move a stop or route into another night.
revoke update on public.na_nights, public.na_members, public.na_routes, public.na_stops, public.na_reactions,
  public.na_idea_votes, public.na_crews, public.na_meetups, public.na_meetup_crews from anon, authenticated;
grant update (name, vote_deadline, route_locked_at) on public.na_nights to authenticated;
grant update (display_name, color) on public.na_members to authenticated;
grant update (title, description, practical, updated_at) on public.na_routes to authenticated;
grant update (pos, arrival, duration, reason, practical, transfer, fixed) on public.na_stops to authenticated;
grant update (reaction, note, updated_at) on public.na_reactions to authenticated;
grant update (route_id) on public.na_idea_votes to authenticated;
grant update (name, color) on public.na_crews to authenticated;
grant update (at, event_id, note) on public.na_meetups to authenticated;
grant update (confirmed_at, arrived_at) on public.na_meetup_crews to authenticated;
