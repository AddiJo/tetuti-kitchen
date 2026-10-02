-- Laporan dengan rentang tanggal pilihan admin (hari Jakarta, termasuk kedua
-- ujungnya), dibandingkan dengan periode sebelumnya yang sama panjang.
-- Aturan hitung sama dengan 20261001010000_laporan.sql: pesanan batal tidak
-- dihitung, omzet adalah nominal tagihan lunas di tanggal lunasnya.
-- Tren per hari sampai 62 hari, per minggu (mulai Senin) sampai 186 hari,
-- selebihnya per bulan.

drop function if exists public.sales_report();

create function public.sales_report(start_day date, end_day date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  span integer := end_day - start_day + 1;
  step text;
  since timestamptz := start_day::timestamp at time zone 'Asia/Jakarta';
  until timestamptz := (end_day + 1)::timestamp at time zone 'Asia/Jakarta';
  prev_since timestamptz := (start_day - span)::timestamp at time zone 'Asia/Jakarta';
  result jsonb;
begin
  if start_day is null or end_day is null or span < 1 then
    raise exception 'Tanggal awal harus sama dengan atau sebelum tanggal akhir.';
  end if;
  if span > 731 then
    raise exception 'Rentang laporan paling panjang dua tahun.';
  end if;
  step := case when span <= 62 then 'day' when span <= 186 then 'week' else 'month' end;

  with counted as (
    select o.id, o.source, (o.created_at at time zone 'Asia/Jakarta')::date as day
    from public.orders o
    where o.status <> 'batal' and o.created_at >= since and o.created_at < until
  ),
  paid as (
    select i.paid_amount, (i.paid_at at time zone 'Asia/Jakarta')::date as day
    from public.invoices i
    where i.status = 'lunas' and i.paid_at >= since and i.paid_at < until
  ),
  buckets as (
    select g::date as bucket_start
    from generate_series(
      date_trunc(step, start_day::timestamp), end_day::timestamp, ('1 ' || step)::interval
    ) g
  ),
  menu as (
    select
      coalesce(max(m.name), max(i.name)) as name,
      sum(i.quantity) as portions,
      count(distinct i.order_id) as orders
    from public.order_items i
    join counted c on c.id = i.order_id
    left join public.menu_items m on m.id = i.menu_item_id
    group by coalesce(i.menu_item_id, 'nama:' || i.name)
  ),
  unpaid as (
    select i.id, i.code, i.order_id, o.customer_name, i.total, i.sent_at
    from public.invoices i
    join public.orders o on o.id = i.order_id
    where i.status = 'terkirim'
  ),
  listed as (
    select s.*, i.code as invoice_code, i.status as invoice_status, i.paid_amount, i.paid_at
    from public.order_summaries s
    left join public.invoices i on i.order_id = s.id and i.status <> 'batal'
    where s.status <> 'batal' and s.created_at >= since and s.created_at < until
  )
  select jsonb_build_object(
    'start_day', start_day,
    'end_day', end_day,
    'prev_start_day', start_day - span,
    'prev_end_day', start_day - 1,
    'step', step,
    'orders', (select count(*) from counted),
    'revenue', (select coalesce(sum(paid_amount), 0) from paid),
    'prev_orders', (
      select count(*) from public.orders
      where status <> 'batal' and created_at >= prev_since and created_at < since
    ),
    'prev_revenue', (
      select coalesce(sum(paid_amount), 0) from public.invoices
      where status = 'lunas' and paid_at >= prev_since and paid_at < since
    ),
    'series', (
      select jsonb_agg(
        jsonb_build_object(
          'start', greatest(b.bucket_start, start_day),
          'orders', (
            select count(*) from counted c
            where date_trunc(step, c.day::timestamp)::date = b.bucket_start
          ),
          'revenue', (
            select coalesce(sum(paid_amount), 0) from paid p
            where date_trunc(step, p.day::timestamp)::date = b.bucket_start
          )
        )
        order by b.bucket_start
      )
      from buckets b
    ),
    'menu', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object('name', name, 'portions', portions, 'orders', orders)
          order by portions desc, name
        ),
        '[]'::jsonb
      )
      from menu
    ),
    'sources', jsonb_build_object(
      'situs', (select count(*) from counted where source = 'situs'),
      'admin', (select count(*) from counted where source = 'admin')
    ),
    'unpaid_total', (select coalesce(sum(total), 0) from unpaid),
    'unpaid', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', id, 'code', code, 'order_id', order_id,
            'customer_name', customer_name, 'total', total, 'sent_at', sent_at
          )
          order by sent_at, code
        ),
        '[]'::jsonb
      )
      from unpaid
    ),
    'list', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', id, 'code', code, 'created_at', created_at, 'customer_name', customer_name,
            'customer_phone', customer_phone, 'source', source, 'status', status,
            'items_label', items_label, 'total', total, 'invoice_code', invoice_code,
            'invoice_status', invoice_status, 'paid_amount', paid_amount, 'paid_at', paid_at
          )
          order by created_at desc
        ),
        '[]'::jsonb
      )
      from listed
    )
  )
  into result;
  return result;
end;
$$;

revoke all on function public.sales_report(date, date) from public, anon;
grant execute on function public.sales_report(date, date) to authenticated;
