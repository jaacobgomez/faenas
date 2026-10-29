-- Faenas · datos iniciales. Ejecutar UNA vez, después de schema.sql.
-- Puntos y días son una propuesta: se cambian luego desde Ajustes en la app.
-- Días ISO: 1=lunes … 7=domingo.

do $$
declare
  v_papa uuid; v_mama uuid;
  todos smallint[] := '{1,2,3,4,5,6,7}';
  lxv   smallint[] := '{1,3,5}';
begin
  -- slug aleatorio: quien no tenga el enlace no puede ni ver la pantalla de entrada
  insert into houses (slug, name) values (left(replace(gen_random_uuid()::text, '-', ''), 12), 'Casa de papá')
  returning id into v_papa;
  insert into houses (slug, name) values (left(replace(gen_random_uuid()::text, '-', ''), 12), 'Casa de mamá')
  returning id into v_mama;

  insert into members (house_id, name, emoji, color) values
    (v_papa, 'Washu', '🐻', '#3b82f6'),
    (v_papa, 'Ani',   '🦄', '#a855f7'),
    (v_papa, 'Jacob', '⚡', '#16a34a'),
    (v_mama, 'Mami',  '🌻', '#ec4899'),
    (v_mama, 'Ani',   '🦄', '#a855f7'),
    (v_mama, 'Jacob', '⚡', '#16a34a');

  insert into tasks (house_id, name, emoji, points, days, sort) values
    (v_papa, 'Sacar la basura',       '🗑️', 2, todos,   1),
    (v_papa, 'Sacar el lavavajillas', '🍽️', 2, todos,   2),
    (v_papa, 'Hacer comida',          '🍳', 4, todos,   3),
    (v_papa, 'Poner lavadora',        '🫧', 2, lxv,     4),
    (v_papa, 'Tender ropa',           '👕', 3, lxv,     5),
    (v_papa, 'Hacer camas',           '🛏️', 1, todos,   6),
    (v_papa, 'Hacer compra',          '🛒', 5, '{6}',   7),
    (v_papa, 'Hacer sofás',           '🛋️', 1, todos,   8),

    (v_mama, 'Sacar la basura',       '🗑️', 2, todos,   1),
    (v_mama, 'Sacar el lavavajillas', '🍽️', 2, todos,   2),
    (v_mama, 'Tender ropa',           '👕', 3, lxv,     3),
    (v_mama, 'Hacer camas',           '🛏️', 1, todos,   4);
end $$;

-- Copia estos slugs: los enlaces serán  https://<tu-web>/?casa=<slug>
select name, slug from houses order by name;
