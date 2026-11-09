-- The wish box in MuseumHop's "what's next" pop-up: "What should I build next?"
--
-- Anyone can send a wish through na_send_wish (no sign-in needed). Nobody can read the table with the public key;
-- Arian reads it on the stats page through na_wishes_report, which needs the report secret (see usage_report.sql).
-- Stored: the events picked, the free text, an email only if the sender typed one, which site sent it, and when.
-- Not stored: IP addresses, sign-ins or anything else about the sender. Wishes are deleted after a year.

create table public.na_wishes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  events text[] not null default '{}',
  wish text not null default '',
  email text,
  source text not null default '',
  check (cardinality(events) <= 5),
  check (char_length(wish) <= 1000),
  check (email is null or char_length(email) <= 200),
  check (char_length(source) <= 40),
  check (cardinality(events) > 0 or char_length(btrim(wish)) > 0)
);
create index na_wishes_created on public.na_wishes (created_at);
alter table public.na_wishes enable row level security;
revoke all on public.na_wishes from anon, authenticated;

create function public.na_send_wish(p_events text[], p_wish text, p_email text default null, p_source text default '', p_website text default '')
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_events text[];
  v_wish text := left(btrim(coalesce(p_wish, '')), 1000);
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  -- Honeypot: people never see the "website" field, bots fill it in. Pretend it worked.
  if coalesce(p_website, '') <> '' then return true; end if;
  select coalesce(array_agg(distinct e order by e), '{}') into v_events from unnest(coalesce(p_events, '{}')) e
    where e in ('idfa', 'ade', 'kingsday', 'monumentendag', 'other');
  if cardinality(v_events) = 0 and v_wish = '' then raise exception 'Pick an event or write a wish.'; end if;
  if v_email is not null and (char_length(v_email) > 200 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'That email address doesn''t look right.';
  end if;
  -- Spam brakes that need nothing about the sender: the same text twice in an hour counts once, and a flood waits.
  if v_wish <> '' and exists (select 1 from na_wishes where wish = v_wish and created_at > now() - interval '1 hour') then return true; end if;
  if (select count(*) from na_wishes where created_at > now() - interval '10 minutes') >= 40 then
    raise exception 'Lots of wishes are coming in right now. Please try again in a few minutes.';
  end if;
  insert into na_wishes (events, wish, email, source) values (v_events, v_wish, v_email, left(coalesce(p_source, ''), 40));
  return true;
end $$;
revoke all on function public.na_send_wish(text[], text, text, text, text) from public;
grant execute on function public.na_send_wish(text[], text, text, text, text) to anon, authenticated;

-- For the stats page: counts per event and the latest wishes. Answers only with the report secret.
create function public.na_wishes_report(_secret text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from na_report_secret where value = _secret) then return null; end if;
  return jsonb_build_object(
    'generated_at', now(),
    'total', (select count(*) from na_wishes),
    'with_text', (select count(*) from na_wishes where wish <> ''),
    'with_email', (select count(*) from na_wishes where email is not null),
    'last_7d', (select count(*) from na_wishes where created_at > now() - interval '7 days'),
    'by_event', (select coalesce(jsonb_object_agg(e, c), '{}') from (select e, count(*) c from na_wishes, unnest(events) e group by e) x),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object('at', created_at, 'events', events, 'wish', wish, 'email', email, 'source', source) order by created_at desc), '[]')
               from (select * from na_wishes order by created_at desc limit 300) w));
end $$;
revoke all on function public.na_wishes_report(text) from public;
grant execute on function public.na_wishes_report(text) to anon, authenticated;

select cron.schedule('museumhop-wishes-retention', '29 3 * * *', $job$
  delete from public.na_wishes where created_at < now() - interval '1 year';
$job$);
