-- Ejecutar una sola vez en Supabase > SQL Editor.
create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.guests add column if not exists attending boolean;
alter table public.guests add column if not exists confirmed_at timestamptz;

alter table public.guests enable row level security;

-- La tabla no se expone directamente al navegador.
revoke all on table public.guests from anon, authenticated;

create or replace function public.register_guest(p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := trim(p_name);
  v_normalized text := lower(trim(p_name));
  v_guest public.guests;
begin
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'El nombre debe tener entre 2 y 80 caracteres';
  end if;

  insert into public.guests (name, normalized_name)
  values (v_name, v_normalized)
  on conflict (normalized_name) do update
    set name = excluded.name, updated_at = now()
  returning id, name, created_at, updated_at into v_guest;

  return jsonb_build_object('id', v_guest.id, 'name', v_guest.name);
end;
$$;

revoke all on function public.register_guest(text) from public;
grant execute on function public.register_guest(text) to anon, authenticated;

create or replace function public.confirm_guest_attendance(p_name text, p_attending boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_normalized text := lower(trim(p_name));
  v_guest public.guests;
begin
  update public.guests
     set attending = p_attending,
         confirmed_at = now(),
         updated_at = now()
   where normalized_name = v_normalized
  returning id, name, attending, confirmed_at into v_guest;

  if v_guest.id is null then
    raise exception 'Invitado no encontrado';
  end if;

  return jsonb_build_object('id', v_guest.id, 'name', v_guest.name, 'attending', v_guest.attending, 'confirmed_at', v_guest.confirmed_at);
end;
$$;

revoke all on function public.confirm_guest_attendance(text, boolean) from public;
grant execute on function public.confirm_guest_attendance(text, boolean) to anon, authenticated;

create or replace function public.get_attendance_summary()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'confirmed', count(*) filter (where attending is true),
    'declined', count(*) filter (where attending is false),
    'pending', count(*) filter (where attending is null)
  )
  from public.guests;
$$;

revoke all on function public.get_attendance_summary() from public;
grant execute on function public.get_attendance_summary() to authenticated;

create or replace function public.list_guests()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'name', name,
        'attending', attending,
        'created_at', created_at,
        'updated_at', updated_at
      ) order by name
    ), '[]'::jsonb
  )
  from public.guests;
$$;

revoke all on function public.list_guests() from public;
grant execute on function public.list_guests() to authenticated;

create table if not exists public.song_suggestions (
  id uuid primary key default gen_random_uuid(),
  guest_name text not null,
  song_title text not null,
  artist text,
  spotify_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

alter table public.song_suggestions enable row level security;
revoke all on table public.song_suggestions from anon, authenticated;

create or replace function public.register_song_suggestion(
  p_guest_name text,
  p_song_title text,
  p_artist text default null,
  p_spotify_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest_name text := trim(p_guest_name);
  v_song_title text := trim(p_song_title);
  v_artist text := nullif(trim(coalesce(p_artist, '')), '');
  v_spotify_url text := nullif(trim(coalesce(p_spotify_url, '')), '');
  v_id uuid;
begin
  if length(v_guest_name) < 2 or length(v_guest_name) > 80 then
    raise exception 'El nombre del invitado no es válido';
  end if;
  if length(v_song_title) < 1 or length(v_song_title) > 160 then
    raise exception 'El nombre de la canción es obligatorio';
  end if;
  if v_artist is not null and length(v_artist) > 120 then
    raise exception 'El nombre del artista es demasiado largo';
  end if;
  if v_spotify_url is not null and v_spotify_url not like 'https://open.spotify.com/%' then
    raise exception 'El enlace debe ser de Spotify';
  end if;

  insert into public.song_suggestions (guest_name, song_title, artist, spotify_url)
  values (v_guest_name, v_song_title, v_artist, v_spotify_url)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'song_title', v_song_title, 'artist', v_artist, 'spotify_url', v_spotify_url);
end;
$$;

revoke all on function public.register_song_suggestion(text, text, text, text) from public;
grant execute on function public.register_song_suggestion(text, text, text, text) to anon, authenticated;

create or replace function public.list_song_suggestions()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'guest_name', guest_name, 'song_title', song_title,
    'artist', artist, 'spotify_url', spotify_url, 'status', status, 'created_at', created_at
  ) order by created_at desc), '[]'::jsonb)
  from public.song_suggestions;
$$;

revoke all on function public.list_song_suggestions() from public;
grant execute on function public.list_song_suggestions() to authenticated;

create or replace function public.list_public_song_suggestions()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'song_title', song_title,
    'artist', artist,
    'spotify_url', spotify_url
  ) order by created_at desc), '[]'::jsonb)
  from public.song_suggestions;
$$;

revoke all on function public.list_public_song_suggestions() from public;
grant execute on function public.list_public_song_suggestions() to anon, authenticated;

create table if not exists public.spotify_playlists (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  spotify_url text not null,
  created_at timestamptz not null default now()
);

alter table public.spotify_playlists enable row level security;
revoke all on table public.spotify_playlists from anon, authenticated;

create or replace function public.add_spotify_playlist(p_title text, p_spotify_url text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text := trim(p_title);
  v_url text := trim(p_spotify_url);
  v_id uuid;
begin
  if length(v_title) < 1 or length(v_title) > 120 then
    raise exception 'El nombre de la playlist es obligatorio';
  end if;
  if v_url !~ '^https://open\.spotify\.com/([^/]+/)?playlist/[A-Za-z0-9]+' then
    raise exception 'El enlace debe ser una playlist pública de Spotify';
  end if;
  insert into public.spotify_playlists (title, spotify_url)
  values (v_title, v_url)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'title', v_title, 'spotify_url', v_url);
end;
$$;

revoke all on function public.add_spotify_playlist(text, text) from public;
grant execute on function public.add_spotify_playlist(text, text) to authenticated;

create or replace function public.list_spotify_playlists()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'title', title, 'spotify_url', spotify_url
  ) order by created_at desc), '[]'::jsonb)
  from public.spotify_playlists;
$$;

revoke all on function public.list_spotify_playlists() from public;
grant execute on function public.list_spotify_playlists() to anon, authenticated;

create table if not exists public.dedications (
  id uuid primary key default gen_random_uuid(),
  guest_name text not null,
  guest_key text not null,
  guest_token text not null,
  target text not null check (target in ('general', 'fabian', 'alexander')),
  message text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dedications_guest_key_token_idx
  on public.dedications (guest_key, guest_token);

alter table public.dedications enable row level security;
revoke all on table public.dedications from anon, authenticated;

create or replace function public.add_dedication(
  p_guest_name text,
  p_guest_token text,
  p_target text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guest_name text := trim(p_guest_name);
  v_guest_key text := lower(trim(p_guest_name));
  v_token text := trim(p_guest_token);
  v_message text := trim(p_message);
  v_id uuid;
begin
  if length(v_guest_name) < 2 or length(v_guest_name) > 80 then raise exception 'El nombre del invitado no es válido'; end if;
  if length(v_token) < 16 or length(v_token) > 128 then raise exception 'Sesión de invitado no válida'; end if;
  if p_target not in ('general', 'fabian', 'alexander') then raise exception 'Destinatario no válido'; end if;
  if length(v_message) < 1 or length(v_message) > 500 then raise exception 'La dedicatoria debe tener entre 1 y 500 caracteres'; end if;

  perform pg_advisory_xact_lock(hashtext(v_guest_key || ':' || v_token));
  if (select count(*) from public.dedications where guest_key = v_guest_key and guest_token = v_token) >= 6 then
    raise exception 'Solo puedes publicar hasta 6 dedicatorias';
  end if;

  insert into public.dedications (guest_name, guest_key, guest_token, target, message)
  values (v_guest_name, v_guest_key, v_token, p_target, v_message)
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;

revoke all on function public.add_dedication(text, text, text, text) from public;
grant execute on function public.add_dedication(text, text, text, text) to anon, authenticated;

create or replace function public.list_dedications(p_guest_name text default null, p_guest_token text default null)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'target', target, 'message', message,
    'created_at', created_at,
    'can_edit', (guest_key = lower(trim(coalesce(p_guest_name, ''))) and guest_token = coalesce(p_guest_token, ''))
  ) order by created_at desc), '[]'::jsonb)
  from public.dedications
  where guest_key = lower(trim(coalesce(p_guest_name, '')))
    and guest_token = coalesce(p_guest_token, '');
$$;

revoke all on function public.list_dedications(text, text) from public;
grant execute on function public.list_dedications(text, text) to anon, authenticated;

create or replace function public.list_all_dedications()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'guest_name', guest_name,
    'target', target,
    'message', message,
    'created_at', created_at
  ) order by created_at desc), '[]'::jsonb)
  from public.dedications;
$$;

revoke all on function public.list_all_dedications() from public;
grant execute on function public.list_all_dedications() to authenticated;

create or replace function public.update_dedication(
  p_id uuid,
  p_guest_name text,
  p_guest_token text,
  p_target text,
  p_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if p_target not in ('general', 'fabian', 'alexander') then raise exception 'Destinatario no válido'; end if;
  if length(trim(p_message)) < 1 or length(trim(p_message)) > 500 then raise exception 'La dedicatoria debe tener entre 1 y 500 caracteres'; end if;
  update public.dedications set target = p_target, message = trim(p_message), updated_at = now()
   where id = p_id and guest_key = lower(trim(p_guest_name)) and guest_token = trim(p_guest_token)
   returning id into v_id;
  if v_id is null then raise exception 'Solo puedes editar tus propias dedicatorias'; end if;
  return jsonb_build_object('id', v_id);
end;
$$;

revoke all on function public.update_dedication(uuid, text, text, text, text) from public;
grant execute on function public.update_dedication(uuid, text, text, text, text) to anon, authenticated;

create or replace function public.delete_dedication(p_id uuid, p_guest_name text, p_guest_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  delete from public.dedications
   where id = p_id and guest_key = lower(trim(p_guest_name)) and guest_token = trim(p_guest_token)
   returning id into v_id;
  if v_id is null then raise exception 'Solo puedes eliminar tus propias dedicatorias'; end if;
  return jsonb_build_object('id', v_id);
end;
$$;

revoke all on function public.delete_dedication(uuid, text, text) from public;
grant execute on function public.delete_dedication(uuid, text, text) to anon, authenticated;

