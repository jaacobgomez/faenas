# Faenas

Tareas de casa compartidas (casa de papá y casa de mamá): checklist diario, encargos, lista de la compra, chat, puntos repartibles, ranking mensual y horario de cada uno.
Web instalable (PWA), sin build ni dependencias: HTML + JS + Supabase (RPC por REST).

## Puesta en marcha

1. **Supabase** → proyecto nuevo (o uno existente) → SQL Editor:
   - Ejecuta `supabase/schema.sql`.
   - Ejecuta `supabase/seed.sql` y **apunta los dos slugs** que devuelve.
   - Ejecuta `supabase/migracion-2.sql` (chat, compra, reparto de puntos y encargos). La app funciona sin ella, pero sin esas funciones.
2. **config.js**: pon la URL del proyecto y la clave `anon` / `publishable` (Project Settings → API).
3. **GitHub Pages**: sube esta carpeta a un repo → Settings → Pages → rama `main`, carpeta raíz.
4. Enlaces para la familia:
   - Casa de papá → `https://<usuario>.github.io/<repo>/?casa=<slug-papá>`
   - Casa de mamá → `https://<usuario>.github.io/<repo>/?casa=<slug-mamá>`
5. Cada uno abre su enlace, elige su nombre y **crea su PIN la primera vez**. Después, «Añadir a pantalla de inicio».
   En la app instalada, Jacob y Ani añaden la otra casa en Ajustes → «Añadir otra casa» (pegando el enlace).

## Reglas del juego

- Cada tarea tiene puntos y días. Se marca una vez por día: el primero que la hace se los lleva.
- Si una tarea tiene responsable y la hace otro, el que la cubre gana +1.
- Si la hacen varios, los puntos se reparten a partes iguales. Quien participa puede cambiar el grupo; los demás solo pueden apuntarse.
- Un encargo es una tarea de una sola vez: sigue en la lista desde su fecha hasta que alguien lo hace.
- El chat y la lista de la compra son de cada casa. El chat se actualiza con la app abierta; no hay notificaciones push.
- Se puede marcar hoy y los dos días anteriores. Solo puedes desmarcar lo tuyo.
- Ranking por mes. El premio se escribe en Ranking → «Premio del mes».
- 5 PIN fallidos → 15 min bloqueado.

## Probar en local

`python3 -m http.server 8000` en esta carpeta y abre `http://localhost:8000/?casa=<slug>`.
