-- ============================================================
-- ACTUALIZACIÓN DE SCHEMA — Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Agregar columna guia_mp a pedidos (para sincronizar con Marco Postal)
alter table pedidos add column if not exists guia_mp text;
alter table pedidos add column if not exists departamento text;
create index if not exists idx_pedidos_guia_mp on pedidos(guia_mp) where guia_mp is not null;

-- 2. Nueva tabla: publicidad_saldo (actualizada por agent_facebook a las 23:55)
create table if not exists publicidad_saldo (
  id               uuid default gen_random_uuid() primary key,
  fecha            date not null unique,
  saldo_pendiente  numeric(10,2) not null default 0,  -- lo que falta cubrir → lo que muestra el dashboard
  deuda_facebook   numeric(10,2) not null default 0,  -- deuda total actual con FB
  ya_cubierto      numeric(10,2) not null default 0,  -- ya apartado de liquidaciones
  gasto_hoy        numeric(10,2) not null default 0,  -- gasto del día
  gasto_acumulado  numeric(10,2) not null default 0,  -- gasto total del período
  actualizado_at   timestamptz default now()
);

alter table publicidad_saldo enable row level security;

drop policy if exists "public_all" on publicidad_saldo;
create policy "public_all" on publicidad_saldo for all using (true) with check (true);

alter publication supabase_realtime add table publicidad_saldo;
