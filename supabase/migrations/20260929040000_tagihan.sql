-- Fase 2: tagihan bayar. Satu pesanan punya paling banyak satu tagihan aktif
-- (selain Batal). Item, ongkir, dan total disalin database dari pesanan saat
-- tagihan dibuat, jadi angka di tagihan tidak ikut berubah kalau pesanan diubah.
-- Sampai fase 4, instruksi bayar diketik admin di setiap tagihan.

create type public.invoice_status as enum ('draft', 'terkirim', 'lunas', 'batal');
create type public.payment_method as enum ('transfer', 'qris', 'tunai');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  order_id uuid not null references public.orders (id) on delete restrict,
  status public.invoice_status not null default 'draft',
  method public.payment_method not null,
  instructions text
    check (instructions is null or (btrim(instructions) <> '' and char_length(instructions) <= 500)),
  lines jsonb not null,
  subtotal integer not null check (subtotal >= 0),
  shipping_fee integer not null check (shipping_fee >= 0),
  total integer not null check (total >= 0),
  paid_amount integer check (paid_amount is null or paid_amount between 1 and 1000000000),
  paid_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_instructions_required
    check (method = 'tunai' or instructions is not null),
  constraint invoices_paid_fields check (
    (status = 'lunas' and paid_amount is not null and paid_at is not null)
    or (status <> 'lunas' and paid_amount is null and paid_at is null)
  )
);

create unique index invoices_one_active on public.invoices (order_id) where status <> 'batal';
create index invoices_order_idx on public.invoices (order_id, created_at desc);
create index invoices_status_idx on public.invoices (status, created_at desc);

-- Kode tagihan INV-DDMMYYYY-NN, urutan per hari menurut waktu Jakarta.

create table public.invoice_code_counters (
  day date primary key,
  last_seq integer not null
);

alter table public.invoice_code_counters enable row level security;
revoke all on public.invoice_code_counters from anon, authenticated;

create function public.prepare_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent public.orders;
  jakarta_day date := (now() at time zone 'Asia/Jakarta')::date;
  seq integer;
begin
  select * into parent from public.orders where id = new.order_id for update;
  if not found then
    raise exception 'Pesanan tidak ditemukan.';
  end if;
  if parent.status not in ('dikonfirmasi', 'diproses', 'selesai') then
    raise exception 'Tagihan hanya bisa dibuat untuk pesanan yang sudah dikonfirmasi.';
  end if;
  if exists (
    select 1 from public.invoices where order_id = parent.id and status <> 'batal'
  ) then
    raise exception 'Pesanan ini sudah punya tagihan aktif. Batalkan dulu tagihan lama.';
  end if;
  if exists (
    select 1 from public.order_items where order_id = parent.id and unit_price is null
  ) then
    raise exception 'Isi harga semua item sebelum membuat tagihan.';
  end if;

  select
    jsonb_agg(
      jsonb_build_object('name', name, 'quantity', quantity, 'unit_price', unit_price)
      order by created_at, id
    ),
    coalesce(sum(quantity * unit_price), 0)::integer
  into new.lines, new.subtotal
  from public.order_items
  where order_id = parent.id;

  if new.lines is null then
    raise exception 'Pesanan belum punya item.';
  end if;

  insert into public.invoice_code_counters as c (day, last_seq)
  values (jakarta_day, 1)
  on conflict (day) do update set last_seq = c.last_seq + 1
  returning c.last_seq into seq;

  new.code := 'INV-' || to_char(jakarta_day, 'DDMMYYYY') || '-'
    || lpad(seq::text, greatest(2, length(seq::text)), '0');
  new.shipping_fee := parent.shipping_fee;
  new.total := new.subtotal + parent.shipping_fee;
  new.status := 'draft';
  new.paid_amount := null;
  new.paid_at := null;
  new.sent_at := null;
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create trigger invoices_prepare
  before insert on public.invoices
  for each row execute function public.prepare_invoice();

-- Alur: Draft -> Terkirim -> Lunas, Draft/Terkirim -> Batal. Draft boleh
-- langsung Lunas (bayar tunai tanpa kirim tagihan). Lunas terkunci kecuali
-- Batalkan lunas, yang mengembalikan tagihan ke Terkirim. Batal final.

create function public.guard_invoice_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.code := old.code;
  new.order_id := old.order_id;
  new.lines := old.lines;
  new.subtotal := old.subtotal;
  new.shipping_fee := old.shipping_fee;
  new.total := old.total;
  new.created_at := old.created_at;
  new.updated_at := now();

  if old.status = 'batal' then
    raise exception 'Tagihan yang dibatalkan tidak bisa diubah. Buat tagihan baru.';
  end if;

  if new.status = 'draft' and old.status <> 'draft' then
    raise exception 'Tagihan yang sudah dikirim tidak bisa kembali ke draft.';
  end if;

  if old.status <> 'draft'
    and (new.method, new.instructions) is distinct from (old.method, old.instructions) then
    raise exception 'Cara bayar hanya bisa diubah selama tagihan masih draft.';
  end if;

  if old.status = 'lunas' then
    if new.status = 'terkirim' then
      new.paid_amount := null;
      new.paid_at := null;
      new.sent_at := old.sent_at;
      return new;
    end if;
    if new.status = 'lunas'
      and (new.paid_amount, new.paid_at, new.sent_at)
        is not distinct from (old.paid_amount, old.paid_at, old.sent_at) then
      return new;
    end if;
    raise exception 'Tagihan lunas terkunci. Batalkan lunas dulu untuk mengubahnya.';
  end if;

  if new.status = 'terkirim' and new.sent_at is null then
    new.sent_at := now();
  end if;
  if new.status = 'lunas' and new.paid_at > now() + interval '1 day' then
    raise exception 'Waktu lunas tidak boleh di masa depan.';
  end if;
  return new;
end;
$$;

create trigger invoices_guard_update
  before update on public.invoices
  for each row execute function public.guard_invoice_update();

-- Pesanan dan tagihan ------------------------------------------------------------
-- Pesanan yang tagihannya lunas tidak bisa diubah item, ongkir, atau dibatalkan
-- sebelum lunasnya dibatalkan. Pesanan yang dibatalkan ikut membatalkan tagihan
-- yang belum lunas.

create function public.guard_order_invoice()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.invoices where order_id = new.id and status = 'lunas'
  ) then
    return new;
  end if;
  if new.status = 'batal' and old.status <> 'batal' then
    raise exception 'Tagihan pesanan ini sudah lunas. Batalkan lunas dulu kalau pesanan memang dibatalkan.';
  end if;
  if new.shipping_fee <> old.shipping_fee then
    raise exception 'Tagihan pesanan ini sudah lunas, jadi ongkir tidak bisa diubah. Batalkan lunas dulu.';
  end if;
  return new;
end;
$$;

create trigger orders_invoice_guard
  before update on public.orders
  for each row execute function public.guard_order_invoice();

create function public.cancel_order_invoices()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.invoices set status = 'batal'
  where order_id = new.id and status in ('draft', 'terkirim');
  return null;
end;
$$;

create trigger orders_cancel_invoices
  after update of status on public.orders
  for each row
  when (new.status = 'batal' and old.status <> 'batal')
  execute function public.cancel_order_invoices();

create or replace function public.guard_order_item()
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

  if exists (
    select 1 from public.invoices where order_id = parent_id and status = 'lunas'
  ) then
    raise exception 'Tagihan pesanan ini sudah lunas, jadi item tidak bisa diubah. Batalkan lunas dulu.';
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

-- Akses ---------------------------------------------------------------------

alter table public.invoices enable row level security;
revoke all on public.invoices from anon, authenticated;
grant select, insert, update on public.invoices to authenticated;

create policy "admin membaca tagihan" on public.invoices
  for select to authenticated using ((select public.is_admin()));
create policy "admin membuat tagihan" on public.invoices
  for insert to authenticated with check ((select public.is_admin()));
create policy "admin mengubah tagihan" on public.invoices
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
