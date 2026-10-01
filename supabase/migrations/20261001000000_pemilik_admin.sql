-- Satu admin menjadi pemilik. Hanya pemilik yang boleh melihat, menambah, dan
-- mencabut akun admin (lewat Edge Function kelola-admin). Admin lain adalah
-- staf: akses pesanan, menu, dan tagihan tetap sama seperti sebelumnya.

alter table public.admins add column is_owner boolean not null default false;

create unique index admins_satu_pemilik on public.admins (is_owner) where is_owner;

-- Admin yang paling dulu terdaftar menjadi pemilik.
update public.admins
set is_owner = true
where user_id = (select user_id from public.admins order by created_at, user_id limit 1);

create function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = auth.uid() and is_owner);
$$;

revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;
