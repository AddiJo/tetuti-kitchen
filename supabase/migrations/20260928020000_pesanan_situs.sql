-- Pesanan dari situs publik masuk langsung ke tabel pesanan.
-- Pengunjung tidak mendapat akses tabel. Satu-satunya pintu adalah
-- public.submit_order, yang memeriksa isian, mengambil harga dari menu,
-- dan membatasi jumlah pesanan.

create type public.order_source as enum ('situs', 'admin');

alter table public.orders
  add column source public.order_source not null default 'admin',
  add column seen_at timestamptz;

create index orders_source_created_idx on public.orders (source, created_at desc);
create index orders_phone_created_idx on public.orders (customer_phone, created_at desc);

-- Kolom baru ikut ke ringkasan. View dibuat ulang karena o.* dibekukan saat
-- view pertama kali dibuat.

drop view public.order_summaries;

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

revoke all on public.order_summaries from anon, authenticated;
grant select on public.order_summaries to authenticated;

-- Pesanan dari situs ---------------------------------------------------------

create function public.submit_order(
  customer_name text,
  customer_phone text,
  fulfillment text,
  address text,
  note text,
  items jsonb,
  website text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  per_phone_limit constant integer := 6;
  global_limit constant integer := 60;
  clean_name text := btrim(coalesce(customer_name, ''));
  clean_phone text := regexp_replace(coalesce(customer_phone, ''), '\D', '', 'g');
  clean_address text := nullif(btrim(coalesce(address, '')), '');
  clean_note text := nullif(btrim(coalesce(note, '')), '');
  line_count integer;
  lines jsonb;
  new_order public.orders;
  unpriced boolean;
  subtotal integer;
begin
  -- Kolom jebakan: manusia tidak melihatnya, bot biasanya mengisinya.
  if nullif(btrim(coalesce(website, '')), '') is not null then
    raise exception 'Pesanan tidak bisa dikirim.';
  end if;

  if clean_phone like '0%' then
    clean_phone := '62' || substr(clean_phone, 2);
  elsif clean_phone like '8%' then
    clean_phone := '62' || clean_phone;
  end if;

  if clean_name = '' or char_length(clean_name) > 80 then
    raise exception 'Nama wajib diisi, maksimal 80 karakter.';
  end if;
  if clean_phone !~ '^62[0-9]{8,13}$' then
    raise exception 'Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890.';
  end if;
  if fulfillment is null or fulfillment not in ('antar', 'pickup') then
    raise exception 'Pilih pickup atau antar.';
  end if;
  if fulfillment = 'antar' and clean_address is null then
    raise exception 'Alamat wajib diisi untuk pesanan antar.';
  end if;
  if char_length(coalesce(clean_address, '')) > 300 then
    raise exception 'Alamat maksimal 300 karakter.';
  end if;
  if char_length(coalesce(clean_note, '')) > 500 then
    raise exception 'Catatan maksimal 500 karakter.';
  end if;

  if items is null or jsonb_typeof(items) <> 'array' then
    raise exception 'Pilih minimal satu menu.';
  end if;
  line_count := jsonb_array_length(items);
  if line_count < 1 or line_count > 10 then
    raise exception 'Satu pesanan berisi 1 sampai 10 menu.';
  end if;

  -- Baris dengan menu sama digabung. Jumlah yang bukan bilangan bulat ditolak.
  begin
    select jsonb_agg(jsonb_build_object('menu_item_id', id, 'quantity', qty))
    into lines
    from (
      select line ->> 'menu_item_id' as id, sum((line ->> 'quantity')::integer) as qty
      from jsonb_array_elements(items) as line
      group by line ->> 'menu_item_id'
    ) grouped;
  exception when others then
    raise exception 'Isi pesanan tidak valid.';
  end;

  if exists (
    select 1 from jsonb_to_recordset(lines) as s(menu_item_id text, quantity integer)
    where s.menu_item_id is null or s.quantity is null or s.quantity < 1 or s.quantity > 200
  ) then
    raise exception 'Jumlah setiap menu 1 sampai 200.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(lines) as s(menu_item_id text, quantity integer)
    left join public.menu_items m on m.id = s.menu_item_id and m.is_active
    where m.id is null
  ) then
    raise exception 'Ada menu yang sudah tidak tersedia. Muat ulang halaman lalu coba lagi.';
  end if;

  -- Satu per satu supaya batas tidak terlewati saat dua pesanan datang bersamaan.
  perform pg_advisory_xact_lock(hashtext('public.submit_order'));

  if (
    select count(*) from public.orders o
    where o.customer_phone = clean_phone and o.source = 'situs'
      and o.created_at > now() - interval '1 hour'
  ) >= per_phone_limit then
    raise exception 'Nomor ini sudah mengirim banyak pesanan dalam satu jam. Coba lagi nanti atau chat WhatsApp.';
  end if;
  if (
    select count(*) from public.orders o
    where o.source = 'situs' and o.created_at > now() - interval '1 hour'
  ) >= global_limit then
    raise exception 'Pesanan sedang ramai. Silakan pesan lewat WhatsApp.';
  end if;

  insert into public.orders (customer_name, customer_phone, fulfillment, address, note, source)
  values (
    clean_name,
    clean_phone,
    fulfillment::public.fulfillment,
    case when fulfillment = 'antar' then clean_address end,
    clean_note,
    'situs'
  )
  returning * into new_order;

  insert into public.order_items (order_id, menu_item_id, name, quantity, unit_price)
  select new_order.id, m.id, m.name, s.quantity, m.price
  from jsonb_to_recordset(lines) as s(menu_item_id text, quantity integer)
  join public.menu_items m on m.id = s.menu_item_id
  order by m.sort_order;

  select bool_or(m.price is null), sum(s.quantity * coalesce(m.price, 0))::integer
  into unpriced, subtotal
  from jsonb_to_recordset(lines) as s(menu_item_id text, quantity integer)
  join public.menu_items m on m.id = s.menu_item_id;

  return jsonb_build_object(
    'code', new_order.code,
    'subtotal', case when unpriced then null else subtotal end
  );
end;
$$;

revoke all on function public.submit_order(text, text, text, text, text, jsonb, text) from public;
grant execute on function public.submit_order(text, text, text, text, text, jsonb, text)
  to anon, authenticated;
