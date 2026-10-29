-- Faenas · esquema de base de datos (Supabase / Postgres)
-- Ejecutar entero en Supabase → SQL Editor. Después, seed.sql.
--
-- Seguridad: las tablas tienen RLS activado y SIN políticas, así que la clave
-- pública (anon) no puede leerlas ni escribirlas directamente. Todo pasa por
-- funciones RPC (security definer) que validan la sesión creada con el PIN.

create extension if not exists pgcrypto with schema extensions;

-- ─── Tablas ────────────────────────────────────────────────────────────────

create table if not exists houses (
  id    uuid primary key default gen_random_uuid(),
  slug  text unique not null,          -- va en el enlace: ?casa=<slug>
  name  text not null,
  prize text                           -- premio del mes (opcional)
);

create table if not exists members (
  id              uuid primary key default gen_random_uuid(),
  house_id        uuid not null references houses on delete cascade,
  name            text not null,
  emoji           text not null default '🙂',
  color           text not null default '#4f7cff',
  pin_hash        text,                -- null = aún no ha creado su PIN
  failed_attempts int not null default 0,
  locked_until    timestamptz,
  unique (house_id, name)
);

create table if not exists tasks (
  id          uuid primary key default gen_random_uuid(),
  house_id    uuid not null references houses on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  emoji       text not null default '🧹',
  points      int not null default 1 check (points between 1 and 20),
  days        smallint[] not null default '{1,2,3,4,5,6,7}', -- ISO: 1=lunes … 7=domingo
  assigned_to uuid references members on delete set null,    -- opcional; si otro la hace, +1 por cubrir
  active      boolean not null default true,
  sort        int not null default 0
);

create table if not exists completions (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks on delete cascade,
  member_id  uuid not null references members on delete cascade,
  done_on    date not null,
  points     int not null,
  covered    boolean not null default false,
  created_at timestamptz not null default now(),
  unique (task_id, done_on)
);

-- Horario semanal: si existe la fila, ese miembro está disponible en esa franja.
create table if not exists availability (
  member_id uuid not null references members on delete cascade,
  dow       smallint not null check (dow between 1 and 7),
  slot      text not null check (slot in ('manana', 'tarde', 'noche')),
  primary key (member_id, dow, slot)
);

create table if not exists sessions (
  token      uuid primary key default gen_random_uuid(),
  member_id  uuid not null references members on delete cascade,
  expires_at timestamptz not null default now() + interval '180 days'
);

alter table houses       enable row level security;
alter table members      enable row level security;
alter table tasks        enable row level security;
alter table completions  enable row level security;
alter table availability enable row level security;
alter table sessions     enable row level security;

revoke all on houses, members, tasks, completions, availability, sessions from anon, authenticated;

-- ─── Utilidades internas ───────────────────────────────────────────────────

create or replace function _me(p_token uuid) returns members
language plpgsql stable security definer set search_path = public as $$
declare v members;
begin
  select m.* into v
  from sessions s join members m on m.id = s.member_id
  where s.token = p_token and s.expires_at > now();
  if not found then raise exception 'sesion_caducada'; end if;
  return v;
end $$;

create or replace function _today() returns date
language sql stable as $$ select (now() at time zone 'Europe/Madrid')::date $$;

-- ─── Acceso ────────────────────────────────────────────────────────────────

-- Pantalla de entrada: quién vive en la casa del enlace.
create or replace function list_members(p_slug text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'house', h.name,
    'members', coalesce((
      select json_agg(json_build_object(
        'id', m.id, 'name', m.name, 'emoji', m.emoji, 'color', m.color,
        'has_pin', m.pin_hash is not null) order by m.name)
      from members m where m.house_id = h.id), '[]'))
  from houses h where h.slug = p_slug
$$;

-- Devuelve json (no lanza excepción) para que el contador de fallos no se deshaga.
create or replace function login(p_slug text, p_member uuid, p_pin text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v members; v_token uuid;
begin
  if p_pin !~ '^\d{4,6}$' then
    return json_build_object('ok', false, 'error', 'pin_formato');
  end if;

  select m.* into v from members m join houses h on h.id = m.house_id
  where m.id = p_member and h.slug = p_slug
  for update;
  if not found then return json_build_object('ok', false, 'error', 'no_existe'); end if;

  if v.locked_until > now() then
    return json_build_object('ok', false, 'error', 'bloqueado');
  end if;

  if v.pin_hash is null then
    update members set pin_hash = crypt(p_pin, gen_salt('bf')) where id = v.id;
  elsif v.pin_hash <> crypt(p_pin, v.pin_hash) then
    update members set
      failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end,
      locked_until    = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
    where id = v.id;
    return json_build_object('ok', false, 'error', 'pin_incorrecto');
  end if;

  update members set failed_attempts = 0, locked_until = null where id = v.id;
  insert into sessions (member_id) values (v.id) returning token into v_token;
  return json_build_object('ok', true, 'token', v_token);
end $$;

create or replace function logout(p_token uuid) returns void
language sql security definer set search_path = public as $$
  delete from sessions where token = p_token
$$;

create or replace function change_pin(p_token uuid, p_old text, p_new text) returns json
language plpgsql security definer set search_path = public, extensions as $$
declare v members;
begin
  v := _me(p_token);
  if p_new !~ '^\d{4,6}$' then return json_build_object('ok', false, 'error', 'pin_formato'); end if;
  if v.pin_hash <> crypt(p_old, v.pin_hash) then
    return json_build_object('ok', false, 'error', 'pin_incorrecto');
  end if;
  update members set pin_hash = crypt(p_new, gen_salt('bf')) where id = v.id;
  return json_build_object('ok', true);
end $$;

-- ─── Lectura ───────────────────────────────────────────────────────────────

-- Todo lo que pinta la app: casa, miembros, tareas, hechas en [p_from, p_to],
-- horarios y ranking del mes de p_month.
create or replace function get_state(p_token uuid, p_from date, p_to date, p_month date) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_me    members := _me(p_token);
  v_start date    := date_trunc('month', p_month)::date;
begin
  if p_to - p_from > 62 then raise exception 'rango_demasiado_grande'; end if;
  return json_build_object(
    'me',    v_me.id,
    'today', _today(),
    'house', (select json_build_object('name', h.name, 'prize', h.prize) from houses h where h.id = v_me.house_id),
    'members', (select coalesce(json_agg(json_build_object(
                  'id', m.id, 'name', m.name, 'emoji', m.emoji, 'color', m.color) order by m.name), '[]')
                from members m where m.house_id = v_me.house_id),
    'tasks', (select coalesce(json_agg(json_build_object(
                'id', t.id, 'name', t.name, 'emoji', t.emoji, 'points', t.points,
                'days', t.days, 'assigned_to', t.assigned_to) order by t.sort, t.name), '[]')
              from tasks t where t.house_id = v_me.house_id and t.active),
    'completions', (select coalesce(json_agg(json_build_object(
                      'task_id', c.task_id, 'member_id', c.member_id, 'done_on', c.done_on,
                      'points', c.points, 'covered', c.covered)), '[]')
                    from completions c join tasks t on t.id = c.task_id
                    where t.house_id = v_me.house_id and c.done_on between p_from and p_to),
    'availability', (select coalesce(json_agg(json_build_object(
                       'member_id', a.member_id, 'dow', a.dow, 'slot', a.slot)), '[]')
                     from availability a join members m on m.id = a.member_id
                     where m.house_id = v_me.house_id),
    'ranking', (select coalesce(json_agg(r order by r.points desc), '[]') from (
                  select m.id as member_id,
                         coalesce(sum(c.points), 0)::int        as points,
                         count(c.id)::int                       as done,
                         count(c.id) filter (where c.covered)::int as covered
                  from members m
                  left join completions c on c.member_id = m.id
                    and c.done_on >= v_start and c.done_on < v_start + interval '1 month'
                  where m.house_id = v_me.house_id
                  group by m.id) r)
  );
end $$;

-- ─── Escritura ─────────────────────────────────────────────────────────────

-- Marcar / desmarcar. Solo hoy y los 2 días anteriores; solo puedes desmarcar lo tuyo.
create or replace function toggle_task(p_token uuid, p_task uuid, p_date date) returns json
language plpgsql security definer set search_path = public as $$
declare v_me members := _me(p_token); v_task tasks; v_c completions; v_cover boolean;
begin
  select * into v_task from tasks where id = p_task and house_id = v_me.house_id and active;
  if not found then raise exception 'tarea_no_existe'; end if;
  if p_date > _today() or p_date < _today() - 2 then raise exception 'fecha_fuera_de_rango'; end if;
  if not (extract(isodow from p_date)::smallint = any (v_task.days)) then raise exception 'no_toca_ese_dia'; end if;

  select * into v_c from completions where task_id = p_task and done_on = p_date;
  if found then
    if v_c.member_id <> v_me.id then raise exception 'ya_hecha'; end if;
    delete from completions where id = v_c.id;
    return json_build_object('done', false);
  end if;

  v_cover := v_task.assigned_to is not null and v_task.assigned_to <> v_me.id;
  insert into completions (task_id, member_id, done_on, points, covered)
  values (p_task, v_me.id, p_date, v_task.points + case when v_cover then 1 else 0 end, v_cover);
  return json_build_object('done', true);
end $$;

create or replace function set_availability(p_token uuid, p_dow int, p_slot text, p_available boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_me members := _me(p_token);
begin
  if p_available then
    insert into availability (member_id, dow, slot) values (v_me.id, p_dow, p_slot) on conflict do nothing;
  else
    delete from availability where member_id = v_me.id and dow = p_dow and slot = p_slot;
  end if;
end $$;

-- Crear (p_id null) o editar una tarea. Cualquiera de la casa puede.
create or replace function upsert_task(
  p_token uuid, p_name text, p_emoji text, p_points int, p_days int[],
  p_assigned uuid default null, p_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_me members := _me(p_token); v_id uuid;
begin
  if p_days is null or cardinality(p_days) = 0 or not (p_days <@ array[1,2,3,4,5,6,7]) then
    raise exception 'dias_invalidos';
  end if;
  if p_assigned is not null and not exists (
    select 1 from members where id = p_assigned and house_id = v_me.house_id) then
    raise exception 'miembro_no_existe';
  end if;

  if p_id is null then
    insert into tasks (house_id, name, emoji, points, days, assigned_to, sort)
    values (v_me.house_id, trim(p_name), coalesce(nullif(p_emoji, ''), '🧹'), p_points, p_days::smallint[], p_assigned,
            coalesce((select max(sort) + 1 from tasks where house_id = v_me.house_id), 0))
    returning id into v_id;
  else
    update tasks set name = trim(p_name), emoji = coalesce(nullif(p_emoji, ''), '🧹'), points = p_points,
                     days = p_days::smallint[], assigned_to = p_assigned
    where id = p_id and house_id = v_me.house_id
    returning id into v_id;
    if v_id is null then raise exception 'tarea_no_existe'; end if;
  end if;
  return v_id;
end $$;

-- Archivar (no borra: los puntos ganados se conservan).
create or replace function archive_task(p_token uuid, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_me members := _me(p_token);
begin
  update tasks set active = false where id = p_id and house_id = v_me.house_id;
end $$;

create or replace function set_prize(p_token uuid, p_prize text) returns void
language plpgsql security definer set search_path = public as $$
declare v_me members := _me(p_token);
begin
  update houses set prize = nullif(trim(p_prize), '') where id = v_me.house_id;
end $$;

-- ─── Permisos ──────────────────────────────────────────────────────────────

revoke execute on function _me(uuid) from public, anon, authenticated;

grant execute on function
  list_members(text), login(text, uuid, text), logout(uuid), change_pin(uuid, text, text),
  get_state(uuid, date, date, date), toggle_task(uuid, uuid, date),
  set_availability(uuid, int, text, boolean), upsert_task(uuid, text, text, int, int[], uuid, uuid),
  archive_task(uuid, uuid), set_prize(uuid, text)
to anon;
