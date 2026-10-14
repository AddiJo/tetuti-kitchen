-- Fase 4: info toko dan cara bayar diatur dari halaman admin oleh semua admin.
-- Situs publik hanya bisa membaca nama toko, teks hero, kota, dan WhatsApp.
-- Rekening, QRIS, dan catatan tunai hanya dibaca admin; pembeli melihatnya
-- lewat tagihan yang dikirim kepadanya.

create table public.store_settings (
  -- Hanya ada satu baris.
  id boolean primary key default true check (id),
  store_name text not null check (btrim(store_name) <> '' and char_length(store_name) <= 60),
  hero_kicker text
    check (hero_kicker is null or (btrim(hero_kicker) <> '' and char_length(hero_kicker) <= 40)),
  hero_title text not null check (btrim(hero_title) <> '' and char_length(hero_title) <= 80),
  city text not null check (btrim(city) <> '' and char_length(city) <= 40),
  whatsapp_number text not null check (whatsapp_number ~ '^62[0-9]{8,13}$'),
  qris_path text check (qris_path is null or qris_path ~ '^qris-[a-f0-9]{32}\.png$'),
  tunai_enabled boolean not null default true,
  tunai_note text
    check (tunai_note is null or (btrim(tunai_note) <> '' and char_length(tunai_note) <= 200)),
  updated_at timestamptz not null default now()
);

insert into public.store_settings (store_name, hero_kicker, hero_title, city, whatsapp_number, tunai_note)
values (
  'Tetuti Kitchen',
  '100% Homemade',
  'Pedas nampol, renyahnya bikin nagih',
  'Jakarta',
  '6281284966859',
  'Dibayar saat pickup atau saat diantar.'
);

create function public.touch_store_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.updated_at := now();
  return new;
end;
$$;

create trigger store_settings_touch
  before update on public.store_settings
  for each row execute function public.touch_store_settings();

alter table public.store_settings enable row level security;
revoke all on public.store_settings from anon, authenticated;
grant select (store_name, hero_kicker, hero_title, city, whatsapp_number)
  on public.store_settings to anon;
grant select on public.store_settings to authenticated;
grant update (store_name, hero_kicker, hero_title, city, whatsapp_number, qris_path, tunai_enabled, tunai_note)
  on public.store_settings to authenticated;

create policy "pengunjung membaca info toko" on public.store_settings
  for select to anon using (true);
create policy "admin membaca pengaturan toko" on public.store_settings
  for select to authenticated using ((select public.is_admin()));
create policy "admin mengubah pengaturan toko" on public.store_settings
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Rekening transfer --------------------------------------------------------------
-- Tagihan menyimpan salinan teks rekening, jadi mengubah atau menghapus
-- rekening di sini tidak mengubah tagihan yang sudah dibuat.

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  bank text not null check (btrim(bank) <> '' and char_length(bank) <= 30),
  account_number text not null check (account_number ~ '^[0-9]{5,20}$'),
  holder text not null check (btrim(holder) <> '' and char_length(holder) <= 60),
  created_at timestamptz not null default now()
);

insert into public.bank_accounts (bank, account_number, holder)
values ('BRI', '440701021532539', 'Sugiastuti');

alter table public.bank_accounts enable row level security;
revoke all on public.bank_accounts from anon, authenticated;
grant select, insert, delete on public.bank_accounts to authenticated;

create policy "admin mengelola rekening" on public.bank_accounts
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Gambar QRIS ----------------------------------------------------------------------
-- Bucket privat: admin mengambil gambarnya untuk dicetak di invoice, dan
-- pembeli melihatnya di dalam PDF invoice yang dikirim kepadanya.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('toko', 'toko', false, 1048576, array['image/png']);

create policy "admin mengunggah qris" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'toko'
    and (select public.is_admin())
    and name ~ '^qris-[a-f0-9]{32}\.png$'
  );

create policy "admin membuka qris" on storage.objects
  for select to authenticated
  using (bucket_id = 'toko' and (select public.is_admin()));

create policy "admin menghapus qris" on storage.objects
  for delete to authenticated
  using (bucket_id = 'toko' and (select public.is_admin()));
