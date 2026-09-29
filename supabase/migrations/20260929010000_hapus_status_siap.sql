-- Status Siap tidak dipakai lagi: Diproses langsung ke Selesai.
-- Nilai 'siap' tetap ada di tipe enum (Postgres tidak bisa menghapus nilai enum),
-- tapi tidak bisa dipilih lagi.

update public.orders set status = 'diproses' where status = 'siap';

create or replace function public.guard_order_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  flow constant text[] := array['baru', 'dikonfirmasi', 'diproses', 'selesai'];
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

  if new.status = 'siap' then
    raise exception 'Status Siap sudah tidak dipakai. Tandai Selesai dari Diproses.';
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
