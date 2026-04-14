-- ============================================================
-- ACTUALIZACIÓN 2 — Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Campo envio_gratis en productos (marca qué combos ofrecen envío gratis)
alter table productos add column if not exists envio_gratis boolean not null default false;

-- 2. Campo envio_cobrado en pedidos (lo que pagó el cliente por envío)
--    Diferente de costo_envio (lo que cobra cadetería).
--    envio_gratis → envio_cobrado=0, costo_envio=244/317
--    normal MVD   → envio_cobrado=199, costo_envio=244
--    normal CAN   → envio_cobrado=285, costo_envio=317
alter table pedidos add column if not exists envio_cobrado numeric(10,2) not null default 0;

-- 3. Marcar los combos que tienen envío gratis (ajustar según corresponda)
-- Dejamos todos en false por defecto. Se configura desde la app en Productos > Editar.
