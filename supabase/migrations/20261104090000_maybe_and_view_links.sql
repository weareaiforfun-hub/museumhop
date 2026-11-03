-- Maybe stops, and view-only links.
--
-- Maybe: a stop can be marked "maybe" (a detour if there's time). It stays in the route; the app draws it greyed and
-- dotted. Existing stops are all "sure".
alter table public.na_stops add column maybe boolean not null default false;
grant update (maybe) on public.na_stops to authenticated; -- stop columns are granted one by one

-- View-only links: one per night. Whoever opens it sees the night's routes (stop, time, place; crews optional) and
-- nothing else: no names, votes or notes, and no way to change anything. The person doesn't join the night; the page
-- reads the routes through na_view_night, so their visit leaves no trace in the group. The token is kept as is (not
-- hashed) so every member can copy the same link; only members can read it (na_view_link), and it only ever reads.
create table public.na_view_links (
  night_id uuid primary key references public.na_nights (id) on delete cascade,
  token text not null unique,
  crews boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.na_view_links enable row level security;
revoke all on public.na_view_links from anon, authenticated;

-- The night's view-only link (made on first use). p_new replaces it, which turns the old one off. Planners and
-- organisers only; returns null for anyone else.
create function public.na_view_link(p_night uuid, p_crews boolean default null, p_new boolean default false)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare v public.na_view_links;
begin
  if not public.na_can_write(p_night) then return null; end if;
  if p_new then delete from public.na_view_links where night_id = p_night; end if;
  insert into public.na_view_links (night_id, token, crews, created_by)
    values (p_night, encode(gen_random_bytes(24), 'hex'), coalesce(p_crews, true), auth.uid())
    on conflict (night_id) do update set crews = coalesce(p_crews, na_view_links.crews)
    returning * into v;
  return jsonb_build_object('token', v.token, 'crews', v.crews);
end $$;

-- Turns the view-only link off.
create function public.na_view_link_off(p_night uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.na_view_links where night_id = p_night and public.na_can_write(p_night);
$$;

-- What a view-only link shows: routes and their stops only. Callable signed out.
create function public.na_view_night(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', n.name, 'event_date', n.event_date,
    'routes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', r.kind,
        'title', case when r.kind = 'shared' then 'Our route' else coalesce(c.name, 'Crew') || '’s route' end,
        'color', coalesce(c.color, '#df664f'),
        'stops', coalesce((select jsonb_agg(jsonb_build_object('event_id', s.event_id, 'arrival', s.arrival, 'duration', s.duration, 'maybe', s.maybe, 'fixed', s.fixed) order by s.pos)
                           from public.na_stops s where s.route_id = r.id), '[]'::jsonb))
        order by r.kind desc, c.name)
      from public.na_routes r left join public.na_crews c on c.id = r.crew_id
      where r.night_id = n.id and (r.kind = 'shared' or (r.kind = 'crew' and v.crews))), '[]'::jsonb))
  from public.na_view_links v join public.na_nights n on n.id = v.night_id
  where v.token = p_token
$$;

revoke execute on function public.na_view_link(uuid, boolean, boolean) from public, anon;
revoke execute on function public.na_view_link_off(uuid) from public, anon;
revoke execute on function public.na_view_night(text) from public;
grant execute on function public.na_view_link(uuid, boolean, boolean) to authenticated;
grant execute on function public.na_view_link_off(uuid) to authenticated;
grant execute on function public.na_view_night(text) to anon, authenticated;
