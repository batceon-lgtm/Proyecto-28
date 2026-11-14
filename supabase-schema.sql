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

