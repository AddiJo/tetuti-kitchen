-- Fase 3: laporan penjualan, dihitung di database menurut hari Jakarta.
-- Pesanan batal tidak dihitung. Omzet adalah nominal yang diterima dari
-- tagihan lunas, dihitung di tanggal lunasnya (keputusan pemilik, 1 Okt 2026).
-- Security invoker: aturan RLS tetap berlaku, jadi selain admin hasilnya nol.

create function public.sales_report()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with period as (
    select
      d.today,
      d.today - 29 as first_day,
      (d.today - 29)::timestamp at time zone 'Asia/Jakarta' as since
    from (select (now() at time zone 'Asia/Jakarta')::date as today) d
  ),
  counted as (
    select o.id, o.source, (o.created_at at time zone 'Asia/Jakarta')::date as day
    from public.orders o, period p
    where o.status <> 'batal' and o.created_at >= p.since
  ),
  paid as (
    select i.paid_amount, (i.paid_at at time zone 'Asia/Jakarta')::date as day
    from public.invoices i, period p
    where i.status = 'lunas' and i.paid_at >= p.since
  ),
  days as (
    select g::date as day
    from period p, generate_series(p.first_day::timestamp, p.today::timestamp, interval '1 day') g
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
  )
  select jsonb_build_object(
    'today', p.today,
    'first_day', p.first_day,
    'orders_today', (select count(*) from counted c where c.day = p.today),
    'open_orders', (
      select count(*) from public.orders where status in ('baru', 'dikonfirmasi', 'diproses')
    ),
    'paid_today', (select coalesce(sum(paid_amount), 0) from paid where paid.day = p.today),
    'unpaid_total', (select coalesce(sum(total), 0) from unpaid),
    'days', (
      select jsonb_agg(
        jsonb_build_object(
          'day', d.day,
          'orders', (select count(*) from counted c where c.day = d.day),
          'revenue', (select coalesce(sum(paid_amount), 0) from paid where paid.day = d.day)
        )
        order by d.day desc
      )
      from days d
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
    )
  )
  from period p;
$$;

revoke all on function public.sales_report() from public, anon;
grant execute on function public.sales_report() to authenticated;
