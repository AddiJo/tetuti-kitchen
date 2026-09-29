-- Invoice PDF dikirim ke WhatsApp pembeli sebagai tautan, karena tautan
-- WhatsApp ke nomor tertentu tidak bisa membawa file.
-- File disimpan di bucket publik invoice-pdf dengan folder acak 32 huruf hex,
-- jadi hanya pemegang tautan yang bisa membukanya. Pengunjung tidak punya izin
-- melihat daftar isi bucket, dan hanya admin yang bisa mengunggah dan menghapus.
-- Satu tagihan punya satu tautan tetap; file ditimpa saat dikirim ulang atau
-- statusnya berubah, jadi tautan lama di chat pembeli selalu menampilkan status terbaru.

alter table public.invoices
  add column pdf_path text,
  add constraint invoices_pdf_path_format
    check (pdf_path is null or pdf_path ~ ('^[a-f0-9]{32}/' || code || '\.pdf$'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('invoice-pdf', 'invoice-pdf', true, 1048576, array['application/pdf']);

create policy "admin mengunggah invoice pdf" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'invoice-pdf'
    and (select public.is_admin())
    and name ~ '^[a-f0-9]{32}/INV-[0-9]{8}-[0-9]+\.pdf$'
  );

create policy "admin menimpa invoice pdf" on storage.objects
  for update to authenticated
  using (bucket_id = 'invoice-pdf' and (select public.is_admin()))
  with check (
    bucket_id = 'invoice-pdf'
    and (select public.is_admin())
    and name ~ '^[a-f0-9]{32}/INV-[0-9]{8}-[0-9]+\.pdf$'
  );

create policy "admin melihat daftar invoice pdf" on storage.objects
  for select to authenticated
  using (bucket_id = 'invoice-pdf' and (select public.is_admin()));

create policy "admin menghapus invoice pdf" on storage.objects
  for delete to authenticated
  using (bucket_id = 'invoice-pdf' and (select public.is_admin()));
