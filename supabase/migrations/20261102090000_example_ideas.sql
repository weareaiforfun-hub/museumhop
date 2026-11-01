-- Lets a night's organiser add the example route ideas (fictional planners with themed routes) from the app.
-- Fictional planners are member rows with a random user id: nobody can sign in as them, and only this function
-- writes their routes and reactions. Runs once per night.
create function public.na_add_examples(p_night uuid, p_ideas jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare v_idea jsonb; v_stop jsonb; v_uid uuid; v_route uuid; v_i int := 0; v_n int := 0;
  v_colors text[] := array['#5b6b2f', '#0f6e86', '#a0522d', '#c2185b', '#1f7a5c', '#6e55a3'];
begin
  if public.na_role(p_night) is distinct from 'organiser' then raise exception 'only the organiser can add example routes'; end if;
  if exists (select 1 from na_members where night_id = p_night and fictional) then raise exception 'example routes were already added'; end if;
  if jsonb_typeof(p_ideas) <> 'array' or jsonb_array_length(p_ideas) > 6 then raise exception 'invalid example routes'; end if;
  perform set_config('na.quiet', 'on', true);
  for v_idea in select * from jsonb_array_elements(p_ideas) loop
    v_i := v_i + 1;
    v_uid := gen_random_uuid();
    v_route := gen_random_uuid();
    insert into na_members (night_id, user_id, display_name, color, role, fictional)
      values (p_night, v_uid, left(v_idea->>'name', 32), v_colors[1 + (v_i - 1) % 6], 'planner', true);
    insert into na_routes (id, night_id, kind, owner_user, title, description, practical)
      values (v_route, p_night, 'personal', v_uid, left(v_idea->>'title', 100), left(coalesce(v_idea->>'description', ''), 1500), left(coalesce(v_idea->>'practical', ''), 2000));
    v_n := 0;
    for v_stop in select * from jsonb_array_elements(v_idea->'route') loop
      v_n := v_n + 1;
      exit when v_n > 40;
      insert into na_stops (night_id, route_id, pos, event_id, arrival, duration, reason, practical, transfer, fixed, updated_by)
        values (p_night, v_route, v_n, v_stop->>'id', coalesce(v_stop->>'arrival', ''), coalesce((v_stop->>'duration')::int, 45),
          left(coalesce(v_stop->>'reason', ''), 500), left(coalesce(v_stop->>'practical', ''), 600), left(coalesce(v_stop->>'transfer', ''), 400),
          coalesce((v_stop->>'fixed')::boolean, false), v_uid);
      insert into na_reactions (night_id, user_id, event_id, reaction, note)
        values (p_night, v_uid, v_stop->>'id', 'up', left(format('%s · %s/%s · %s. %s', v_idea->>'title', v_n, jsonb_array_length(v_idea->'route'), v_stop->>'arrival', v_stop->>'reason'), 240))
        on conflict (night_id, user_id, event_id) do nothing;
    end loop;
    insert into na_reactions (night_id, user_id, event_id, reaction, note)
      select p_night, v_uid, a->>'id', 'up', left(coalesce(a->>'note', ''), 240) from jsonb_array_elements(coalesce(v_idea->'alternatives', '[]')) a
      on conflict (night_id, user_id, event_id) do nothing;
  end loop;
  perform set_config('na.quiet', 'off', true);
  insert into na_activity (night_id, user_id, kind, data) values (p_night, auth.uid(), 'examples_added', jsonb_build_object('count', v_i));
  return v_i;
end $$;
revoke execute on function public.na_add_examples(uuid, jsonb) from public, anon;
grant execute on function public.na_add_examples(uuid, jsonb) to authenticated;
