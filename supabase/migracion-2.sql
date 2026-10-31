-- Faenas · migración 2: chat, lista de la compra, puntos compartidos y encargos.
-- Ejecutar UNA vez en Supabase → SQL Editor, encima de lo que ya hay (no borra nada).
-- Se puede repetir sin miedo: si se ejecuta dos veces, no duplica ni pierde datos.

-- ─── Tablas ────────────────────────────────────────────────────────────────

-- Quién más ayudó en una tarea hecha. El que la marcó sigue en completions.member_id.
create table if not exists completion_helpers (
  completion_id uuid not null references completions on delete cascade,
  member_id     uuid not null references members on delete cascade,
  primary key (completion_id, member_id)
);

create table if not exists messages (
  id         uuid primary key default gen_random_uuid(),
  house_id   uuid not null references houses on delete cascade,
  member_id  uuid not null references members on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists messages_house_created on messages (house_id, created_at desc);

create table if not exists shopping_items (
  id         uuid primary key default gen_random_uuid(),
  house_id   uuid not null references houses on delete cascade,
  name       text not null check (char_length(name) between 1 and 60),
  added_by   uuid references members on delete set null,
  bought_by  uuid references members on delete set null,
  bought_at  timestamptz,
  cleared_at timestamptz,               -- ya no está en la lista; se guarda para sugerirlo otra vez
  created_at timestamptz not null default now()
);
create index if not exists shopping_house on shopping_items (house_id, cleared_at);

-- Encargo: tarea de una sola vez. Aparece desde esa fecha hasta que alguien la hace.
alter table tasks   add column if not exists once_on date;
alter table members add column if not exists chat_read_at timestamptz not null default now();

alter table completion_helpers enable row level security;
alter table messages           enable row level security;
alter table shopping_items     enable row level security;

revoke all on completion_helpers, messages, shopping_items from anon, authenticated;

-- ─── Lectura ───────────────────────────────────────────────────────────────

-- Igual que antes, más: ayudantes de cada tarea, reparto de puntos en el ranking,
-- encargos, lista de la compra y mensajes sin leer.
create or replace function get_state(p_token uuid, p_from date, p_to date, p_month date) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_me    members := _me(p_token);
  v_start date    := date_trunc('month', p_month)::date;
begin
  if p_to - p_from > 62 then raise exception 'rango_demasiado_grande'; end if;
  return json_build_object(
    'version', 2,
    'me',    v_me.id,
    'today', _today(),
    'house', (select json_build_object('name', h.name, 'prize', h.prize) from houses h where h.id = v_me.house_id),
    'members', (select coalesce(json_agg(json_build_object(
                  'id', m.id, 'name', m.name, 'emoji', m.emoji, 'color', m.color) order by m.name), '[]')
                from members m where m.house_id = v_me.house_id),
    'tasks', (select coalesce(json_agg(json_build_object(
                'id', t.id, 'name', t.name, 'emoji', t.emoji, 'points', t.points,
                'days', t.days, 'assigned_to', t.assigned_to, 'once_on', t.once_on,
                'once_done_on', case when t.once_on is not null then
                  (select min(c.done_on) from completions c where c.task_id = t.id) end)
                order by t.sort, t.name), '[]')
              from tasks t where t.house_id = v_me.house_id and t.active),
    'completions', (select coalesce(json_agg(json_build_object(
                      'task_id', c.task_id, 'member_id', c.member_id, 'done_on', c.done_on,
                      'points', c.points, 'covered', c.covered,
                      'helpers', (select coalesce(json_agg(ch.member_id), '[]')
                                  from completion_helpers ch where ch.completion_id = c.id))), '[]')
                    from completions c join tasks t on t.id = c.task_id
                    where t.house_id = v_me.house_id and c.done_on between p_from and p_to),
    'availability', (select coalesce(json_agg(json_build_object(
                       'member_id', a.member_id, 'dow', a.dow, 'slot', a.slot)), '[]')
                     from availability a join members m on m.id = a.member_id
                     where m.house_id = v_me.house_id),
    'ranking', (select coalesce(json_agg(r order by r.points desc), '[]') from (
                  select m.id as member_id,
                         round(coalesce(sum(p.share), 0), 1)::float8 as points,
                         count(p.id)::int                            as done,
                         count(p.id) filter (where p.covered and p.member_id = m.id)::int as covered,
                         count(p.id) filter (where p.people > 1)::int as shared
                  from members m
                  left join (
                    select c.id, c.member_id, c.covered, x.member, x.people,
                           c.points::numeric / x.people as share
                    from completions c
                    cross join lateral (
                      select u.member, count(*) over () as people from (
                        select c.member_id as member
                        union select ch.member_id from completion_helpers ch where ch.completion_id = c.id
                      ) u
                    ) x
                    where c.done_on >= v_start and c.done_on < v_start + interval '1 month'
                  ) p on p.member = m.id
                  where m.house_id = v_me.house_id
                  group by m.id) r),
    'shopping', (select coalesce(json_agg(json_build_object(
                   'id', s.id, 'name', s.name, 'added_by', s.added_by, 'bought_by', s.bought_by,
                   'bought', s.bought_at is not null) order by s.created_at), '[]')
                 from shopping_items s where s.house_id = v_me.house_id and s.cleared_at is null),
    'suggestions', (select coalesce(json_agg(q.name), '[]') from (
                      select min(s.name) as name
                      from shopping_items s
                      where s.house_id = v_me.house_id and s.cleared_at is not null
                        and not exists (select 1 from shopping_items o
                                        where o.house_id = s.house_id and o.cleared_at is null
                                          and lower(o.name) = lower(s.name))
                      group by lower(s.name)
                      order by count(*) desc, max(s.created_at) desc
                      limit 8) q),
    'unread', (select count(*)::int from messages g
               where g.house_id = v_me.house_id and g.member_id <> v_me.id and g.created_at > v_me.chat_read_at)
  );
end $$;

-- ─── Puntos compartidos ────────────────────────────────────────────────────

-- Fija quién ayudó en una tarea ya hecha; los puntos se reparten a partes iguales.
-- Quien participa puede cambiar el grupo; quien no participa solo puede apuntarse a sí mismo.
-- El que la marcó no se puede quitar: para eso, que la desmarque.
create or replace function set_helpers(p_token uuid, p_task uuid, p_date date, p_members uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me members := _me(p_token); v_task tasks; v_c completions;
  v_old uuid[]; v_new uuid[]; v_cover boolean;
begin
  select * into v_task from tasks where id = p_task and house_id = v_me.house_id;
  if not found then raise exception 'tarea_no_existe'; end if;
  if p_date > _today() or p_date < _today() - 2 then raise exception 'fecha_fuera_de_rango'; end if;
  select * into v_c from completions where task_id = p_task and done_on = p_date for update;
  if not found then raise exception 'no_hecha'; end if;

  select coalesce(array_agg(member_id), '{}') into v_old from completion_helpers where completion_id = v_c.id;
  select coalesce(array_agg(distinct u), '{}') into v_new from unnest(coalesce(p_members, '{}')) u where u <> v_c.member_id;

  if exists (select 1 from unnest(v_new) u
             where not exists (select 1 from members m where m.id = u and m.house_id = v_me.house_id)) then
    raise exception 'miembro_no_existe';
  end if;
  if v_me.id <> v_c.member_id and not v_me.id = any (v_old)
     and not (v_new @> v_old and v_new <@ (v_old || v_me.id)) then
    raise exception 'solo_participantes';
  end if;

  delete from completion_helpers where completion_id = v_c.id;
  insert into completion_helpers (completion_id, member_id) select v_c.id, u from unnest(v_new) u;

  -- Si el responsable de la tarea ha participado, ya nadie le ha cubierto.
  v_cover := v_task.assigned_to is not null and v_task.assigned_to <> v_c.member_id
             and not v_task.assigned_to = any (v_new);
  update completions
  set covered = v_cover,
      points  = points - case when covered then 1 else 0 end + case when v_cover then 1 else 0 end
  where id = v_c.id;
end $$;

-- ─── Encargos ──────────────────────────────────────────────────────────────

-- Como toggle_task, pero un encargo se marca cualquier día desde su fecha.
create or replace function toggle_task(p_token uuid, p_task uuid, p_date date) returns json
language plpgsql security definer set search_path = public as $$
declare v_me members := _me(p_token); v_task tasks; v_c completions; v_cover boolean;
begin
  select * into v_task from tasks where id = p_task and house_id = v_me.house_id and active;
  if not found then raise exception 'tarea_no_existe'; end if;
  if p_date > _today() or p_date < _today() - 2 then raise exception 'fecha_fuera_de_rango'; end if;
  if v_task.once_on is not null then
    if p_date < v_task.once_on then raise exception 'no_toca_ese_dia'; end if;
  elsif not (extract(isodow from p_date)::smallint = any (v_task.days)) then
    raise exception 'no_toca_ese_dia';
  end if;

  select * into v_c from completions where task_id = p_task and done_on = p_date;
  if found then
    if v_c.member_id <> v_me.id then raise exception 'ya_hecha'; end if;
    delete from completions where id = v_c.id;
    return json_build_object('done', false);
  end if;
  if v_task.once_on is not null and exists (select 1 from completions where task_id = p_task) then
    raise exception 'ya_hecha';
  end if;

  v_cover := v_task.assigned_to is not null and v_task.assigned_to <> v_me.id;
  insert into completions (task_id, member_id, done_on, points, covered)
  values (p_task, v_me.id, p_date, v_task.points + case when v_cover then 1 else 0 end, v_cover);
  return json_build_object('done', true);
end $$;

create or replace function upsert_once(
  p_token uuid, p_name text, p_emoji text, p_points int, p_date date,
  p_assigned uuid default null, p_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_me members := _me(p_token); v_id uuid;
begin
  if p_date is null then raise exception 'fecha_invalida'; end if;
  if p_assigned is not null and not exists (
    select 1 from members where id = p_assigned and house_id = v_me.house_id) then
    raise exception 'miembro_no_existe';
  end if;

  if p_id is null then
    insert into tasks (house_id, name, emoji, points, days, assigned_to, once_on, sort)
    values (v_me.house_id, trim(p_name), coalesce(nullif(p_emoji, ''), '📌'), p_points, '{1,2,3,4,5,6,7}', p_assigned, p_date,
            coalesce((select max(sort) + 1 from tasks where house_id = v_me.house_id), 0))
    returning id into v_id;
  else
    update tasks set name = trim(p_name), emoji = coalesce(nullif(p_emoji, ''), '📌'), points = p_points,
                     assigned_to = p_assigned, once_on = p_date
    where id = p_id and house_id = v_me.house_id and once_on is not null
    returning id into v_id;
    if v_id is null then raise exception 'tarea_no_existe'; end if;
  end if;
  return v_id;
end $$;

-- ─── Chat ──────────────────────────────────────────────────────────────────

-- Sin p_after: los últimos 100. Con p_after: solo lo posterior. Marca el chat como leído.
create or replace function get_messages(p_token uuid, p_after timestamptz default null) returns json
language plpgsql security definer set search_path = public as $$
declare v_me members := _me(p_token); v_out json;
begin
  select coalesce(json_agg(json_build_object(
           'id', q.id, 'member_id', q.member_id, 'body', q.body, 'created_at', q.created_at)
           order by q.created_at), '[]') into v_out
  from (select * from messages g
        where g.house_id = v_me.house_id and (p_after is null or g.created_at > p_after)
        order by g.created_at desc limit 100) q;
  update members set chat_read_at = now() where id = v_me.id;
  return v_out;
end $$;

create or replace function send_message(p_token uuid, p_body text) returns json
language plpgsql security definer set search_path = public as $$
declare v_me members := _me(p_token); v_body text := trim(p_body); v_m messages;
begin
  if v_body is null or char_length(v_body) not between 1 and 1000 then raise exception 'mensaje_invalido'; end if;
  insert into messages (house_id, member_id, body) values (v_me.house_id, v_me.id, v_body) returning * into v_m;
  return json_build_object('id', v_m.id, 'member_id', v_m.member_id, 'body', v_m.body, 'created_at', v_m.created_at);
end $$;

-- Solo se pueden borrar los mensajes propios.
create or replace function delete_message(p_token uuid, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_me members := _me(p_token);
begin
  delete from messages where id = p_id and member_id = v_me.id;
end $$;

-- ─── Lista de la compra ────────────────────────────────────────────────────

-- Añadir algo que ya está en la lista no lo duplica: si estaba comprado, vuelve a pendiente.
create or replace function add_shopping(p_token uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare v_me members := _me(p_token); v_name text := trim(p_name); v_id uuid;
begin
  if v_name is null or char_length(v_name) not between 1 and 60 then raise exception 'producto_invalido'; end if;
  select id into v_id from shopping_items
  where house_id = v_me.house_id and cleared_at is null and lower(name) = lower(v_name) limit 1;
  if found then
    update shopping_items set bought_at = null, bought_by = null where id = v_id;
  else
    insert into shopping_items (house_id, name, added_by) values (v_me.house_id, v_name, v_me.id);
  end if;
end $$;

create or replace function toggle_shopping(p_token uuid, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_me members := _me(p_token);
begin
  update shopping_items
  set bought_at = case when bought_at is null then now() end,
      bought_by = case when bought_at is null then v_me.id end
  where id = p_id and house_id = v_me.house_id and cleared_at is null;
end $$;

create or replace function remove_shopping(p_token uuid, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_me members := _me(p_token);
begin
  delete from shopping_items where id = p_id and house_id = v_me.house_id and cleared_at is null;
end $$;

-- Quita lo comprado de la lista; se queda como sugerencia para la próxima vez.
create or replace function clear_bought(p_token uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_me members := _me(p_token);
begin
  update shopping_items set cleared_at = now()
  where house_id = v_me.house_id and cleared_at is null and bought_at is not null;
end $$;

-- ─── Permisos ──────────────────────────────────────────────────────────────

-- Por defecto, una función nueva la puede ejecutar cualquiera; se deja solo lo necesario.
revoke execute on function
  set_helpers(uuid, uuid, date, uuid[]), upsert_once(uuid, text, text, int, date, uuid, uuid),
  get_messages(uuid, timestamptz), send_message(uuid, text), delete_message(uuid, uuid),
  add_shopping(uuid, text), toggle_shopping(uuid, uuid), remove_shopping(uuid, uuid), clear_bought(uuid)
from public;

grant execute on function
  set_helpers(uuid, uuid, date, uuid[]), upsert_once(uuid, text, text, int, date, uuid, uuid),
  get_messages(uuid, timestamptz), send_message(uuid, text), delete_message(uuid, uuid),
  add_shopping(uuid, text), toggle_shopping(uuid, uuid), remove_shopping(uuid, uuid), clear_bought(uuid)
to anon;
