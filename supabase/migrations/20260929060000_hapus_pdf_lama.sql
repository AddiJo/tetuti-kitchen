-- PDF invoice dihapus 30 hari setelah pesanannya Selesai atau Batal, supaya
-- tautan lama yang bocor tidak membuka data pembeli selamanya.
-- Supabase menolak penghapusan file lewat SQL (file akan tertinggal di
-- penyimpanan), jadi file dihapus admin lewat Storage API saat dashboard
-- dibuka. Database hanya menentukan PDF mana yang sudah kedaluwarsa dan
-- mengizinkan kolom pdf_path dikosongkan, termasuk pada tagihan Batal.

create or replace function public.guard_invoice_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.code := old.code;
  new.order_id := old.order_id;
  new.lines := old.lines;
  new.subtotal := old.subtotal;
  new.shipping_fee := old.shipping_fee;
  new.total := old.total;
  new.created_at := old.created_at;
  new.updated_at := now();

  -- Tautan yang sudah dikirim ke pembeli tidak boleh pindah alamat.
  if old.pdf_path is not null and new.pdf_path is not null and new.pdf_path <> old.pdf_path then
    raise exception 'Alamat PDF tagihan tidak bisa diganti.';
  end if;

  if old.status = 'batal' then
    if new.pdf_path is null and old.pdf_path is not null
      and (new.status, new.method, new.instructions, new.paid_amount, new.paid_at, new.sent_at)
        is not distinct from
          (old.status, old.method, old.instructions, old.paid_amount, old.paid_at, old.sent_at) then
      return new;
    end if;
    raise exception 'Tagihan yang dibatalkan tidak bisa diubah. Buat tagihan baru.';
  end if;

  if new.status = 'draft' and old.status <> 'draft' then
    raise exception 'Tagihan yang sudah dikirim tidak bisa kembali ke draft.';
  end if;

  if old.status <> 'draft'
    and (new.method, new.instructions) is distinct from (old.method, old.instructions) then
    raise exception 'Cara bayar hanya bisa diubah selama tagihan masih draft.';
  end if;

  if old.status = 'lunas' then
    if new.status = 'terkirim' then
      new.paid_amount := null;
      new.paid_at := null;
      new.sent_at := old.sent_at;
      return new;
    end if;
    if new.status = 'lunas'
      and (new.paid_amount, new.paid_at, new.sent_at)
        is not distinct from (old.paid_amount, old.paid_at, old.sent_at) then
      return new;
    end if;
    raise exception 'Tagihan lunas terkunci. Batalkan lunas dulu untuk mengubahnya.';
  end if;

  if new.status = 'terkirim' and new.sent_at is null then
    new.sent_at := now();
  end if;
  if new.status = 'lunas' and new.paid_at > now() + interval '1 day' then
    raise exception 'Waktu lunas tidak boleh di masa depan.';
  end if;
  return new;
end;
$$;

-- Security invoker: aturan RLS tetap berlaku, jadi selain admin hasilnya kosong.
create function public.expired_invoice_pdfs()
returns table (id uuid, pdf_path text)
language sql
stable
security invoker
set search_path = ''
as $$
  select i.id, i.pdf_path
  from public.invoices i
  join public.orders o on o.id = i.order_id
  where i.pdf_path is not null
    and o.status in ('selesai', 'batal')
    and o.status_changed_at < now() - interval '30 days'
  order by o.status_changed_at
  limit 100;
$$;

revoke all on function public.expired_invoice_pdfs() from public, anon;
grant execute on function public.expired_invoice_pdfs() to authenticated;
