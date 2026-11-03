-- Usage report for the "MuseumHop" page in the umami dashboard (stats.arian-shafa.xyz).
--
-- Callable with the public key, but answers only with the report secret, which lives in na_report_secret (no one but
-- the service role can read it) and in umami's server-side environment. It returns counts only: no member names,
-- no notes, no invite tokens, no user ids. Test nights made by scripts/check-access.mjs are left out.

create table public.na_report_secret (
  id boolean primary key default true check (id),
  value text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
);
insert into public.na_report_secret default values;
alter table public.na_report_secret enable row level security;
revoke all on public.na_report_secret from anon, authenticated;

create function public.na_usage_report(_secret text)
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare v jsonb;
begin
  if not exists (select 1 from na_report_secret where value = _secret) then return null; end if;

  with nights as (select * from na_nights where name not like 'access-check%'),
  members as (select m.* from na_members m join nights n on n.id = m.night_id where not m.fictional),
  people as (select distinct on (user_id) user_id, joined_at from members order by user_id, joined_at),
  act as (select a.* from na_activity a join nights n on n.id = a.night_id
          where a.user_id is null or exists (select 1 from members m where m.user_id = a.user_id and m.night_id = a.night_id)),
  reacts as (select r.* from na_reactions r join members m on m.user_id = r.user_id and m.night_id = r.night_id),
  stops as (select s.*, ro.kind as route_kind from na_stops s join na_routes ro on ro.id = s.route_id join nights n on n.id = s.night_id),
  sizes as (select n.id, count(m.user_id) as size from nights n left join members m on m.night_id = n.id group by n.id),
  user_days as (select user_id, count(distinct (created_at at time zone 'Europe/Amsterdam')::date) as days from act where user_id is not null group by user_id)
  select jsonb_build_object(
    'generated_at', now(),
    'totals', jsonb_build_object(
      'nights', (select count(*) from nights),
      'people', (select count(*) from people),
      'group_nights', (select count(*) from sizes where size >= 2),
      'solo_nights', (select count(*) from sizes where size = 1),
      'avg_group_size', (select round(avg(size), 1) from sizes where size > 0),
      'personal_links', (select count(*) from auth.users u join people p on p.user_id = u.id where not u.is_anonymous),
      'emails_on_file', (select count(*) from na_recovery_emails e join people p on p.user_id = e.user_id),
      'reactions', (select count(*) from reacts),
      'reacting_people', (select count(distinct user_id) from reacts),
      'notes', (select count(*) from reacts where coalesce(note, '') <> ''),
      'shared_stops', (select count(*) from stops where route_kind = 'shared'),
      'personal_routes', (select count(*) from na_routes ro join members m on m.user_id = ro.owner_user and m.night_id = ro.night_id where ro.kind = 'personal'),
      'personal_stops', (select count(*) from stops where route_kind = 'personal'),
      'crews', (select count(*) from na_crews c join nights n on n.id = c.night_id),
      'meetups', (select count(*) from na_meetups mu join nights n on n.id = mu.night_id),
      'idea_votes', (select count(*) from na_idea_votes v join members m on m.user_id = v.user_id and m.night_id = v.night_id),
      'changes', (select count(*) from act),
      'active_people_24h', (select count(distinct user_id) from act where created_at > now() - interval '24 hours'),
      'active_people_7d', (select count(distinct user_id) from act where created_at > now() - interval '7 days'),
      'returning_people', (select count(*) from user_days where days >= 2),
      'locked_routes', (select count(*) from nights where route_locked_at is not null),
      'emails_sent_24h', (select count(*) from na_email_sends where kind = 'send'),
      'recoveries_24h', (select count(*) from na_email_sends where kind = 'recover')),
    'group_sizes', (select coalesce(jsonb_agg(jsonb_build_object('size', size, 'nights', c) order by size), '[]') from (select size, count(*) c from sizes group by size) x),
    'roles', (select coalesce(jsonb_object_agg(role, c), '{}') from (select role, count(*) c from members group by role) x),
    'reactions_by_kind', (select coalesce(jsonb_object_agg(reaction, c), '{}') from (select reaction, count(*) c from reacts group by reaction) x),
    'changes_by_kind', (select coalesce(jsonb_object_agg(kind, c), '{}') from (select kind, count(*) c from act group by kind) x),
    'daily', (select coalesce(jsonb_agg(d order by d->>'day'), '[]') from (
      select jsonb_build_object('day', day,
        'changes', count(*) filter (where src = 'act'),
        'active_people', count(distinct user_id) filter (where src = 'act'),
        'joins', count(*) filter (where src = 'join'),
        'nights', count(*) filter (where src = 'night')) d
      from (
        select (created_at at time zone 'Europe/Amsterdam')::date as day, user_id, 'act' as src from act
        union all select (joined_at at time zone 'Europe/Amsterdam')::date, user_id, 'join' from members
        union all select (created_at at time zone 'Europe/Amsterdam')::date, created_by, 'night' from nights
      ) u group by u.day) x),
    'hours', (select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'changes', c) order by h), '[]') from (
      select extract(hour from created_at at time zone 'Europe/Amsterdam')::int h, count(*) c from act group by 1) x),
    'top_events', (select coalesce(jsonb_agg(e order by (e->>'score')::int desc, e->>'event_id'), '[]') from (
      select jsonb_build_object('event_id', event_id,
        'must', count(*) filter (where kind = 'must'), 'up', count(*) filter (where kind = 'up'), 'skip', count(*) filter (where kind = 'skip'),
        'on_routes', count(*) filter (where kind = 'stop'),
        'score', 2 * count(*) filter (where kind = 'must') + count(*) filter (where kind = 'up') - count(*) filter (where kind = 'skip') + count(*) filter (where kind = 'stop')) e
      from (select event_id, reaction kind from reacts union all select event_id, 'stop' from stops) u
      group by event_id order by 2 * count(*) filter (where kind = 'must') + count(*) filter (where kind = 'up') + count(*) filter (where kind = 'stop') desc limit 15) x),
    'nights', (select coalesce(jsonb_agg(j order by j->>'created_at' desc), '[]') from (
      select jsonb_build_object('name', n.name, 'created_at', n.created_at, 'members', s.size,
        'reactions', (select count(*) from reacts r where r.night_id = n.id),
        'shared_stops', (select count(*) from stops st where st.night_id = n.id and st.route_kind = 'shared'),
        'personal_routes', (select count(*) from na_routes ro where ro.night_id = n.id and ro.kind = 'personal' and ro.owner_user in (select user_id from members m where m.night_id = n.id)),
        'crews', (select count(*) from na_crews c where c.night_id = n.id),
        'changes', (select count(*) from act a where a.night_id = n.id),
        'last_change', (select max(created_at) from act a where a.night_id = n.id),
        'hours_to_second_member', (select round(extract(epoch from (m.joined_at - n.created_at)) / 3600, 1) from members m where m.night_id = n.id order by m.joined_at offset 1 limit 1)) j
      from nights n join sizes s on s.id = n.id) x)
  ) into v;
  return v;
end $$;

revoke all on function public.na_usage_report(text) from public;
grant execute on function public.na_usage_report(text) to anon, service_role;
