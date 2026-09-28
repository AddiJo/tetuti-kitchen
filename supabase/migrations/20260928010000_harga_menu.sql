-- Harga menu diatur dari admin dan dibaca situs publik.
-- Pengunjung tanpa login hanya bisa membaca kolom kartu dari menu yang aktif.

alter table public.menu_items
  add column price integer check (price is null or price between 1 and 100000000),
  add column unit text check (unit is null or (btrim(unit) <> '' and char_length(unit) <= 20));

grant select (id, name, category, is_active, price, unit, sort_order)
  on public.menu_items to anon;

create policy "pengunjung membaca menu aktif" on public.menu_items
  for select to anon using (is_active);
