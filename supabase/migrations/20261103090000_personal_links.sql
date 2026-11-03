-- Personal links: a private link that opens your nights as you on any device, without an account.
--
-- Everyone starts as an anonymous sign-in that exists in one browser only. Asking for a personal link turns that
-- sign-in into a permanent one with a generated address (m-<uid>@users.museumhop.arian-shafa.xyz, which receives
-- no mail) and a random 256-bit secret as its password, stored only as a bcrypt hash. The link carries the uid and
-- the secret; another device signs in with them and becomes the same user, so every row already keyed on that uid
-- (membership, reactions, routes, votes) comes along and no data moves. Asking again replaces the secret, which
-- turns the previous link off; devices already signed in stay signed in.

create function public.na_personal_link()
returns text language plpgsql security definer set search_path = public, extensions, auth as $$
declare
  v_uid uuid := auth.uid();
  v_secret text := encode(gen_random_bytes(32), 'hex');
  v_email text := 'm-' || auth.uid() || '@users.museumhop.arian-shafa.xyz';
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from na_members where user_id = v_uid and not fictional) then
    raise exception 'Create or join a night first.';
  end if;
  update auth.users set
    email = v_email,
    encrypted_password = crypt(v_secret, gen_salt('bf', 10)),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    is_anonymous = false,
    updated_at = now()
  where id = v_uid and coalesce(email, '') in ('', v_email);
  if not found then raise exception 'This account already has another sign-in method.'; end if;
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (v_uid::text, v_uid, jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now())
    on conflict do nothing;
  return v_secret;
end $$;

-- The night an invite token opens, but only for someone who is already in it: lets a device that knows who you are
-- (a personal link, or a browser that lost its list of nights) open your night without joining it again.
create function public.na_member_night(p_token text)
returns uuid language sql stable security definer set search_path = public, extensions as $$
  select i.night_id from na_invites i
  join na_members m on m.night_id = i.night_id and m.user_id = auth.uid()
  where i.token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') and i.revoked_at is null
  limit 1
$$;

revoke execute on function public.na_personal_link() from public, anon;
revoke execute on function public.na_member_night(text) from public, anon;
grant execute on function public.na_personal_link() to authenticated;
grant execute on function public.na_member_night(text) to authenticated;

-- Retention, as promised on the "Your data" page: 30 days after a night's date, the night and everything in it go
-- (stops, reactions, routes, links all cascade), and personal-link sign-ins left without any night go with it.
select cron.schedule('museumhop-retention', '17 3 * * *', $job$
  delete from public.na_nights where event_date < current_date - 30;
  delete from auth.users u
    where u.email like 'm-%@users.museumhop.arian-shafa.xyz'
      and not exists (select 1 from public.na_members m where m.user_id = u.id);
$job$);
