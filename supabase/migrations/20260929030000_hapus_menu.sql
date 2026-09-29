-- Admin boleh menghapus menu yang belum pernah dipesan. Menu yang sudah ada di
-- pesanan cukup disembunyikan, supaya riwayat pesanan dan laporan menu terlaris
-- tetap utuh. Sebelumnya hapus menu mengosongkan kaitan item pesanan; sekarang
-- penghapusan ditolak selama masih ada item yang merujuk menu itu.

alter table public.order_items
  drop constraint order_items_menu_item_id_fkey,
  add constraint order_items_menu_item_id_fkey
    foreign key (menu_item_id) references public.menu_items (id) on delete restrict;

grant delete on public.menu_items to authenticated;

create policy "admin menghapus menu" on public.menu_items
  for delete to authenticated using ((select public.is_admin()));
