-- Fase 1 admin Tetuti: akun admin, daftar menu, pesanan masuk.
-- Semua tabel tertutup untuk publik. Hanya akun yang tercatat di public.admins
-- yang bisa membaca dan menulis.

-- Akun admin -----------------------------------------------------------------

create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Menu -----------------------------------------------------------------------
-- Harga, foto, dan teks kartu ditambahkan di migrasi fase 2. Di fase 1 menu
-- hanya dipakai sebagai pilihan saat mencatat item pesanan.

create type public.menu_category as enum ('camilan', 'hantaran', 'catering');

create table public.menu_items (
  id text primary key,
  name text not null check (btrim(name) <> ''),
  category public.menu_category not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.menu_items (id, name, category, sort_order) values
  ('sambal-crispy', 'Sambal Crispy', 'camilan', 1),
  ('paket-hantaran', 'Paket Hantaran', 'hantaran', 2),
  ('nasi-kotak', 'Nasi Kotak', 'catering', 3),
  ('sosis-solo', 'Sosis Solo', 'camilan', 4);

-- Pesanan --------------------------------------------------------------------

create type public.order_status as enum (
  'baru', 'dikonfirmasi', 'diproses', 'siap', 'selesai', 'batal'
);

create type public.fulfillment as enum ('antar', 'pickup');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  customer_name text not null check (btrim(customer_name) <> ''),
  customer_phone text not null check (customer_phone ~ '^62[0-9]{8,13}$'),
  fulfillment public.fulfillment not null,
  address text,
  requested_at timestamptz,
  note text,
  shipping_fee integer not null default 0 check (shipping_fee >= 0),
  status public.order_status not null default 'baru',
  cancel_reason text,
  created_at timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_address_for_delivery
    check (fulfillment = 'pickup' or nullif(btrim(address), '') is not null),
  constraint orders_cancel_reason
    check (status <> 'batal' or nullif(btrim(cancel_reason), '') is not null)
);

create index orders_status_created_idx on public.orders (status, created_at desc);
create index orders_created_idx on public.orders (created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  menu_item_id text references public.menu_items (id) on delete set null,
  -- Nama dan harga disalin ke item supaya pesanan lama tidak ikut berubah
  -- ketika menu diganti nama atau harganya.
  name text not null check (btrim(name) <> ''),
  quantity integer not null check (quantity > 0),
  unit_price integer check (unit_price is null or unit_price >= 0),
  created_at timestamptz not null default now()
);

create index order_items_order_idx on public.order_items (order_id);

-- Kode pesanan TK-DDMMYYYY-NN, urutan per hari menurut waktu Jakarta.

create table public.order_code_counters (
  day date primary key,
  last_seq integer not null
);

alter table public.order_code_counters enable row level security;
revoke all on public.order_code_counters from anon, authenticated;

create function public.assign_order_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  jakarta_day date := (now() at time zone 'Asia/Jakarta')::date;
  seq integer;
begin
  insert into public.order_code_counters as c (day, last_seq)
  values (jakarta_day, 1)
  on conflict (day) do update set last_seq = c.last_seq + 1
  returning c.last_seq into seq;

  new.code := 'TK-' || to_char(jakarta_day, 'DDMMYYYY') || '-'
    || lpad(seq::text, greatest(2, length(seq::text)), '0');
  new.status := 'baru';
  new.cancel_reason := null;
  new.created_at := now();
  new.status_changed_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create trigger orders_assign_code
  before insert on public.orders
  for each row execute function public.assign_order_code();

-- Status hanya bergerak satu langkah maju atau mundur. Batal bisa dari status
-- mana pun kecuali Selesai. Selesai dibuka kembali ke Siap, Batal ke Baru.

create function public.guard_order_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  flow constant text[] := array['baru', 'dikonfirmasi', 'diproses', 'siap', 'selesai'];
  old_pos integer := array_position(flow, old.status::text);
  new_pos integer := array_position(flow, new.status::text);
begin
  new.code := old.code;
  new.created_at := old.created_at;
  new.updated_at := now();

  if new.status = old.status then
    new.status_changed_at := old.status_changed_at;
    return new;
  end if;

  if new.status = 'batal' then
    if old.status = 'selesai' then
      raise exception 'Pesanan yang sudah selesai tidak bisa dibatalkan.';
    end if;
  elsif old.status = 'batal' then
    if new.status <> 'baru' then
      raise exception 'Pesanan batal hanya bisa dibuka kembali ke status Baru.';
    end if;
    new.cancel_reason := null;
  elsif abs(new_pos - old_pos) <> 1 then
    raise exception 'Status hanya boleh maju atau mundur satu langkah.';
  end if;

  if old.status = 'baru' and new.status = 'dikonfirmasi' then
    if not exists (select 1 from public.order_items where order_id = new.id) then
      raise exception 'Tambahkan minimal satu item sebelum mengonfirmasi pesanan.';
    end if;
    if exists (
      select 1 from public.order_items where order_id = new.id and unit_price is null
    ) then
      raise exception 'Isi harga semua item sebelum mengonfirmasi pesanan.';
    end if;
  end if;

  new.status_changed_at := now();
  return new;
end;
$$;

create trigger orders_guard_update
  before update on public.orders
  for each row execute function public.guard_order_update();

-- Item pesanan Selesai atau Batal terkunci. Setelah dikonfirmasi, setiap item
-- wajib punya harga.

create function public.guard_order_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_id uuid := coalesce(new.order_id, old.order_id);
  parent_status public.order_status;
begin
  select status into parent_status from public.orders where id = parent_id;

  if parent_status in ('selesai', 'batal') then
    raise exception 'Item pesanan yang sudah selesai atau batal tidak bisa diubah.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if tg_op = 'UPDATE' and new.order_id <> old.order_id then
    raise exception 'Item tidak bisa dipindah ke pesanan lain.';
  end if;

  if new.name is null and new.menu_item_id is not null then
    select name into new.name from public.menu_items where id = new.menu_item_id;
  end if;

  if parent_status is not null and parent_status <> 'baru' and new.unit_price is null then
    raise exception 'Item pada pesanan yang sudah dikonfirmasi wajib punya harga.';
  end if;

  return new;
end;
$$;

create trigger order_items_guard
  before insert or update or delete on public.order_items
  for each row execute function public.guard_order_item();

-- Ringkasan untuk daftar pesanan. Total kosong selama masih ada item tanpa harga.

create view public.order_summaries
with (security_invoker = true)
as
select
  o.*,
  count(i.id)::integer as item_count,
  string_agg(i.quantity || '× ' || i.name, ', ' order by i.created_at) as items_label,
  case
    when count(i.id) = 0 or bool_or(i.unit_price is null) then null
    else sum(i.quantity * i.unit_price)::integer + o.shipping_fee
  end as total
from public.orders o
left join public.order_items i on i.order_id = o.id
group by o.id;

-- Akses ---------------------------------------------------------------------

alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

revoke all on public.menu_items, public.orders, public.order_items, public.order_summaries
  from anon;
revoke all on public.menu_items, public.orders, public.order_items, public.order_summaries
  from authenticated;

grant select, insert, update on public.menu_items to authenticated;
grant select, insert, update on public.orders to authenticated;
grant select, insert, update, delete on public.order_items to authenticated;
grant select on public.order_summaries to authenticated;

create policy "admin membaca menu" on public.menu_items
  for select to authenticated using ((select public.is_admin()));
create policy "admin menambah menu" on public.menu_items
  for insert to authenticated with check ((select public.is_admin()));
create policy "admin mengubah menu" on public.menu_items
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admin membaca pesanan" on public.orders
  for select to authenticated using ((select public.is_admin()));
create policy "admin mencatat pesanan" on public.orders
  for insert to authenticated with check ((select public.is_admin()));
create policy "admin mengubah pesanan" on public.orders
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admin mengelola item pesanan" on public.order_items
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
