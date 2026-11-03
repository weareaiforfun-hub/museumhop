-- Lazy sign-in: the app now signs a visitor in (anonymously) only when they create or join a night, and tags that
-- sign-in with {"app": "museumhop"} in its user metadata. The daily retention job also removes tagged sign-ins that
-- never ended up in a night, a day after they were made. The tag matters because this project's auth is shared with
-- other apps: only MuseumHop's own sign-ins are touched.

select cron.schedule('museumhop-retention', '17 3 * * *', $job$
  delete from public.na_nights where event_date < current_date - 30;
  delete from auth.users u
    where u.email like 'm-%@users.museumhop.arian-shafa.xyz'
      and not exists (select 1 from public.na_members m where m.user_id = u.id);
  delete from auth.users u
    where u.is_anonymous and u.raw_user_meta_data ->> 'app' = 'museumhop'
      and u.created_at < now() - interval '1 day'
      and not exists (select 1 from public.na_members m where m.user_id = u.id);
$job$);

-- One-off: before this change every visitor got a sign-in on page load, untagged. Remove the ones from MuseumHop's
-- launch onward that never joined a night here or in the earlier planner (mn_ tables). They hold no data.
delete from auth.users u
  where u.is_anonymous and u.created_at >= '2026-11-01'
    and coalesce(u.raw_user_meta_data ->> 'app', '') = ''
    and not exists (select 1 from public.na_members m where m.user_id = u.id)
    and not exists (select 1 from public.mn_members m where m.user_id = u.id);
