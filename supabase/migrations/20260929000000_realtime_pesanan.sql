-- Dashboard admin menerima kabar pesanan baru tanpa dimuat ulang.
-- Realtime tetap mengikuti RLS, jadi hanya akun admin yang menerima isinya.

alter publication supabase_realtime add table public.orders;
