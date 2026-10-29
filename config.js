// Supabase → Project Settings → API. La clave "anon"/"publishable" es pública por diseño:
// las tablas están cerradas y todo pasa por funciones que piden sesión (ver supabase/schema.sql).
export const SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
export const SUPABASE_KEY = 'TU-CLAVE-ANON-O-PUBLISHABLE';
