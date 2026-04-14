-- ============================================================
-- MultiVenta UY — Schema completo
-- Ejecutar en: Supabase > SQL Editor
-- ============================================================

-- Habilitar extensión UUID
create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- TABLA: productos
-- ─────────────────────────────────────────────────────────────
create table if not exists productos (
  id                  uuid default gen_random_uuid() primary key,
  nombre              text not null,
  precio_venta        numeric(10,2) not null default 0,
  costo_producto      numeric(10,2) not null default 0,
  costo_envio_default numeric(10,2) not null default 0,
  tipo                text not null default 'simple'
                        check (tipo in ('simple','combo')),
  activo              boolean not null default true,
  created_at          timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- TABLA: pedidos
-- ─────────────────────────────────────────────────────────────
create table if not exists pedidos (
  id               uuid default gen_random_uuid() primary key,
  fecha_pedido     date not null default current_date,
  fecha_entrega    date,
  nombre_cliente   text not null,
  telefono         text,
  direccion        text,
  producto_id      uuid references productos(id) on delete set null,
  nombre_producto  text not null,
  precio_venta     numeric(10,2) not null,
  costo_producto   numeric(10,2) not null default 0,
  costo_envio      numeric(10,2) not null default 0,
  estado           text not null default 'pendiente'
                     check (estado in ('pendiente','enviado','entregado','cancelado')),
  notas            text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- TABLA: liquidaciones  (una por semana lunes-domingo)
-- ─────────────────────────────────────────────────────────────
create table if not exists liquidaciones (
  id                   uuid default gen_random_uuid() primary key,
  semana_inicio        date not null unique,   -- Lunes
  semana_fin           date not null,          -- Domingo
  dinero_recibido_real numeric(10,2),          -- ingresado manualmente
  notas                text,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────
-- TRIGGER: updated_at automático
-- ─────────────────────────────────────────────────────────────
create or replace function _set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_pedidos_updated_at on pedidos;
create trigger trg_pedidos_updated_at
  before update on pedidos
  for each row execute function _set_updated_at();

drop trigger if exists trg_liquidaciones_updated_at on liquidaciones;
create trigger trg_liquidaciones_updated_at
  before update on liquidaciones
  for each row execute function _set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (acceso público con anon key)
-- ─────────────────────────────────────────────────────────────
alter table productos    enable row level security;
alter table pedidos      enable row level security;
alter table liquidaciones enable row level security;

drop policy if exists "public_all" on productos;
drop policy if exists "public_all" on pedidos;
drop policy if exists "public_all" on liquidaciones;

create policy "public_all" on productos    for all using (true) with check (true);
create policy "public_all" on pedidos      for all using (true) with check (true);
create policy "public_all" on liquidaciones for all using (true) with check (true);

-- ─────────────────────────────────────────────────────────────
-- REALTIME
-- ─────────────────────────────────────────────────────────────
alter publication supabase_realtime add table pedidos;
alter publication supabase_realtime add table productos;
alter publication supabase_realtime add table liquidaciones;

-- ─────────────────────────────────────────────────────────────
-- DATOS INICIALES (productos de ejemplo)
-- ─────────────────────────────────────────────────────────────
insert into productos (nombre, precio_venta, costo_producto, costo_envio_default, tipo)
values
  ('Combo Express',          1099, 350, 244, 'combo'),
  ('Combo Pro',              1489, 450, 244, 'combo'),
  ('Combo Cocina Practica',   699, 280, 199, 'simple'),
  ('Combo Lonchera',          990, 320, 244, 'combo')
on conflict do nothing;
