-- Email for personal links: "email me my link", and getting a new link by email on a device that lost it.
--
-- The address itself is never stored. The museumhop-email Edge Function keeps a keyed fingerprint (HMAC) of it to
-- find you again, and the night's invite token encrypted with a key only the function has, so an emailed link can
-- open your night. Only the function (service role) can touch these tables; members can't even read their own row.

create table public.na_recovery_emails (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email_hmac text not null,
  night_token_enc text not null,
  created_at timestamptz not null default now()
);
create index na_recovery_emails_hmac on public.na_recovery_emails (email_hmac);

-- One row per email sent, for rate limits (per address and per person); kept for a day.
create table public.na_email_sends (
  id bigint generated always as identity primary key,
  email_hmac text not null,
  user_id uuid,
  kind text not null check (kind in ('send', 'recover')),
  sent_at timestamptz not null default now()
);
create index na_email_sends_recent on public.na_email_sends (email_hmac, sent_at);

alter table public.na_recovery_emails enable row level security;
alter table public.na_email_sends enable row level security;
revoke all on public.na_recovery_emails, public.na_email_sends from anon, authenticated;

-- Whether a personal link secret is the current one for that person (used before emailing a link someone already has).
create function public.na_link_valid(p_uid uuid, p_secret text)
returns boolean language sql stable security definer set search_path = public, extensions, auth as $$
  select exists (select 1 from auth.users where id = p_uid and encrypted_password is not null
    and encrypted_password = crypt(p_secret, encrypted_password))
$$;

-- A new personal link secret for someone, without their session (recovery by email). Same effect as na_personal_link.
create function public.na_rotate_link(p_uid uuid)
returns text language plpgsql security definer set search_path = public, extensions, auth as $$
declare v_secret text := encode(gen_random_bytes(32), 'hex');
begin
  update auth.users set encrypted_password = crypt(v_secret, gen_salt('bf', 10)), updated_at = now()
    where id = p_uid and email = 'm-' || p_uid || '@users.museumhop.arian-shafa.xyz';
  if not found then raise exception 'no personal link account'; end if;
  return v_secret;
end $$;

revoke execute on function public.na_link_valid(uuid, text) from public, anon, authenticated;
revoke execute on function public.na_rotate_link(uuid) from public, anon, authenticated;
grant execute on function public.na_link_valid(uuid, text) to service_role;
grant execute on function public.na_rotate_link(uuid) to service_role;

-- Retention: the send log only needs a day; recovery emails go with their sign-in (cascade) when its nights are gone.
select cron.schedule('museumhop-email-log', '41 * * * *', $job$
  delete from public.na_email_sends where sent_at < now() - interval '1 day';
$job$);
