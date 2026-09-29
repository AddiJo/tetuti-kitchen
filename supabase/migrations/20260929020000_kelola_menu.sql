-- Fase 2: teks kartu dan foto menu pindah dari js/products.js ke database.
-- Foto disimpan di bucket publik menu-foto. Siapa pun bisa membuka foto lewat
-- alamatnya, tapi hanya admin yang bisa mengunggah dan menghapus.

create function public.valid_highlights(items text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(items) <= 3
    and not exists (
      select 1 from unnest(items) as item
      where item is null or btrim(item) = '' or char_length(item) > 60
    );
$$;

-- Foto hanya boleh dari folder assets situs atau bucket menu-foto proyek ini,
-- supaya isian menu tidak bisa dipakai memuat alamat lain di situs.
alter table public.menu_items
  add column badge text
    check (badge is null or (btrim(badge) <> '' and char_length(badge) <= 20)),
  add column hook text
    check (hook is null or (btrim(hook) <> '' and char_length(hook) <= 60)),
  add column description text
    check (description is null or (btrim(description) <> '' and char_length(description) <= 300)),
  add column highlights text[] not null default '{}'
    check (public.valid_highlights(highlights)),
  add column image_url text
    check (
      image_url is null
      or image_url ~ '^assets/[a-z0-9-]+\.jpg$'
      or image_url ~ '^https://vmqrwjzjxetjbrqfhnhr\.supabase\.co/storage/v1/object/public/menu-foto/[a-z0-9-]+\.jpg$'
    ),
  add column updated_at timestamptz not null default now(),
  add constraint menu_items_id_format
    check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 60),
  add constraint menu_items_name_length check (char_length(name) <= 60);

update public.menu_items set
  badge = 'Best seller',
  hook = 'Pedas, renyah, nagih!',
  description = 'Bumbu pilihan yang bikin ketagihan. Digoreng garing sampai sempurna, tanpa pengawet dan pewarna buatan.',
  highlights = array['Pedas nampol', 'Renyah maksimal', 'Teman nasi, bubur, mie, ayam & telur'],
  image_url = 'assets/sambal-crispy.jpg'
where id = 'sambal-crispy';

update public.menu_items set
  badge = 'Hampers',
  hook = 'Lezat, renyah, nagih!',
  description = 'Aneka kue lezat dalam satu paket, kemasan cantik untuk hantaran spesial dan momen penting.',
  highlights = array['Isi beragam', 'Kemasan cantik', 'Siap saji untuk segala momen'],
  image_url = 'assets/paket-hantaran.jpg'
where id = 'paket-hantaran';

update public.menu_items set
  badge = 'Catering',
  hook = 'Gurih, lezat, fresh',
  description = 'Porsi puas, lauk melimpah. Cocok untuk acara keluarga, arisan, dan catering.',
  highlights = array['Lauk melimpah', 'Bumbu asli, gurih mantap', 'Harga ramah, aman di kantong'],
  image_url = 'assets/nasi-kotak.jpg'
where id = 'nasi-kotak';

update public.menu_items set
  badge = 'Baru',
  hook = 'Gurih, renyah, nagih!',
  description = 'Kulit tipis renyah dengan isian daging berbumbu. Digoreng garing, enak untuk camilan dan lauk.',
  highlights = array['Isian daging melimpah', 'Renyah di luar, lembut di dalam', 'Cocok untuk acara & camilan'],
  image_url = 'assets/sosis-solo.jpg'
where id = 'sosis-solo';

create function public.touch_menu_item()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create trigger menu_items_touch
  before update on public.menu_items
  for each row execute function public.touch_menu_item();

grant select (badge, hook, description, highlights, image_url)
  on public.menu_items to anon;

-- Foto menu --------------------------------------------------------------------
-- Admin mengecilkan foto dan mengubahnya ke JPG sebelum diunggah.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('menu-foto', 'menu-foto', true, 2097152, array['image/jpeg']);

create policy "admin mengunggah foto menu" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'menu-foto' and (select public.is_admin()));

create policy "admin melihat daftar foto menu" on storage.objects
  for select to authenticated
  using (bucket_id = 'menu-foto' and (select public.is_admin()));

create policy "admin menghapus foto menu" on storage.objects
  for delete to authenticated
  using (bucket_id = 'menu-foto' and (select public.is_admin()));
