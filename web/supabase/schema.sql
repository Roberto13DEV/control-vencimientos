-- Control de Vencimientos · VENCE+ — esquema para Supabase (PostgreSQL)
-- Pégalo completo en Supabase → SQL Editor → New query → Run. Se ejecuta una sola vez.

-- ---------- Tablas ----------

-- Perfil de cada persona: se crea junto con su usuario de Supabase Auth
create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  usuario text not null unique check (char_length(usuario) between 3 and 50),
  nombre text check (char_length(nombre) <= 100),
  rol text not null default 'empleado' check (rol in ('admin', 'empleado')),
  area text,
  activo boolean not null default true,
  creado timestamptz not null default now()
);

-- Cada fila es una fecha de vencimiento; las fechas del mismo producto comparten producto_origen_id
create table public.productos (
  id bigint generated always as identity primary key,
  codigo text,
  producto text not null check (char_length(trim(producto)) > 0),
  categoria text,
  proveedor text,
  lote text,
  cantidad integer not null default 0 check (cantidad >= 0),
  tiene_cambio boolean not null default false,
  fecha_cambio date,
  cambio_reportado timestamptz,
  producto_origen_id bigint,
  usuario_id uuid default auth.uid() references public.perfiles(id) on delete set null,
  vencimiento date not null,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now(),
  -- Si tiene cambio con proveedor, el día de aviso es obligatorio y no puede ser después del vencimiento
  constraint cambio_con_fecha check (not tiene_cambio or fecha_cambio is not null),
  constraint aviso_antes_de_vencer check (fecha_cambio is null or fecha_cambio <= vencimiento)
);
create index productos_usuario_idx on public.productos (usuario_id);
create index productos_vencimiento_idx on public.productos (vencimiento);
create index productos_producto_idx on public.productos (producto);
create index productos_grupo_idx on public.productos (producto_origen_id);

-- Registro de movimientos (la página Historial muestra solo los ingresos)
create table public.historial (
  id bigint generated always as identity primary key,
  usuario_id uuid default auth.uid() references public.perfiles(id) on delete set null,
  usuario text not null,
  accion text not null,
  fecha timestamptz not null default now()
);
create index historial_fecha_idx on public.historial (fecha desc);

-- ---------- Funciones de apoyo para los permisos ----------

create function public.esta_activo() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and activo)
$$;

create function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from perfiles where id = auth.uid() and activo and rol = 'admin')
$$;

-- Cada persona puede cambiar solo su nombre visible (Mi perfil)
create function public.guardar_mi_nombre(nuevo text) returns void
language plpgsql security definer set search_path = public as $$
declare limpio text := nullif(left(trim(coalesce(nuevo, '')), 100), '');
begin
  if not esta_activo() then raise exception 'Usuario inactivo'; end if;
  update perfiles set nombre = limpio where id = auth.uid();
  insert into historial (usuario_id, usuario, accion)
  select id, usuario, 'Nombre actualizado: ' || coalesce(limpio, '(sin nombre)') from perfiles where id = auth.uid();
end $$;

-- ---------- Reglas automáticas ----------

-- Fecha de última modificación y, si cambia el día de aviso o el vencimiento, la alerta vuelve a quedar pendiente
create function public.productos_antes_de_actualizar() returns trigger
language plpgsql as $$
begin
  new.actualizado := now();
  if new.fecha_cambio is distinct from old.fecha_cambio or new.vencimiento <> old.vencimiento then
    new.cambio_reportado := null;
  end if;
  if not new.tiene_cambio then
    new.fecha_cambio := null;
  end if;
  return new;
end $$;
create trigger productos_antes_de_actualizar before update on public.productos
for each row execute function public.productos_antes_de_actualizar();

-- Un empleado no puede registrar productos a nombre de otra persona (el servidor con la clave secreta sí, p. ej. al eliminar un usuario)
create function public.productos_dueno() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not es_admin() and coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'INSERT' then new.usuario_id := auth.uid();
    elsif new.usuario_id is distinct from old.usuario_id then new.usuario_id := old.usuario_id;
    end if;
  end if;
  return new;
end $$;
create trigger productos_dueno before insert or update on public.productos
for each row execute function public.productos_dueno();

-- ---------- Permisos (Row Level Security) ----------

alter table public.perfiles enable row level security;
alter table public.productos enable row level security;
alter table public.historial enable row level security;

-- Perfiles: cada uno ve el suyo; el administrador ve todos. Los cambios los hace la función del servidor
create policy perfiles_ver on public.perfiles for select to authenticated
  using (id = auth.uid() or es_admin());

-- Productos: el empleado ve y edita solo los suyos; el administrador todo; solo el administrador elimina
create policy productos_ver on public.productos for select to authenticated
  using (esta_activo() and (es_admin() or usuario_id = auth.uid()));
create policy productos_crear on public.productos for insert to authenticated
  with check (esta_activo() and (es_admin() or usuario_id = auth.uid()));
create policy productos_editar on public.productos for update to authenticated
  using (esta_activo() and (es_admin() or usuario_id = auth.uid()))
  with check (es_admin() or usuario_id = auth.uid());
create policy productos_eliminar on public.productos for delete to authenticated
  using (es_admin());

-- Historial: cada uno registra sus propios movimientos; solo el administrador los ve
create policy historial_crear on public.historial for insert to authenticated
  with check (usuario_id = auth.uid());
create policy historial_ver on public.historial for select to authenticated
  using (es_admin());

-- Nadie sin iniciar sesión puede leer ni escribir nada
revoke all on public.perfiles, public.productos, public.historial from anon;
revoke execute on function public.guardar_mi_nombre(text) from anon;
