# PRD — Admin Tetuti Kitchen

Status: draf untuk dibangun. Belum ada kode admin.

Situs publik tetap [tetuti.my.id](https://www.tetuti.my.id/): empat menu (Sambal Crispy, Paket Hantaran, Nasi Kotak, Sosis Solo), jumlah pesanan dipilih di kartu, lalu terbuka chat WhatsApp. Harga di situs tertulis “Harga via WhatsApp”. Nomor toko `081284966859`, area Jakarta, antar atau pickup, pre-order.

Admin dibuat supaya pesanan, harga, tagihan, dan rekap tidak hanya hidup di riwayat chat.

## Tujuan

Pemilik toko bisa mencatat pesanan yang masuk dari WhatsApp, mengubah statusnya, memasang harga menu, membuat tagihan, dan melihat rekap penjualan — dari satu halaman admin.

## Bukan tujuan

- Mengganti WhatsApp sebagai tempat ngobrol dengan pembeli.
- Menarik pesanan otomatis dari WhatsApp Business API.
- Login pembeli, keranjang tersimpan, atau pembayaran di dalam situs.
- Banyak akun, peran kasir/dapur, atau stok bahan baku.
- Ongkir otomatis dari peta.

## Pengguna

Satu orang: pemilik Tetuti Kitchen. Tidak ada peran kedua di versi ini.

## Urutan bangun

Peta fitur menaruh login di fase 3. Halaman admin tidak boleh dibuka ke internet sebelum ada masuk akun. Karena itu **masuk dan keluar akun ikut fase 1**. Atur ulang sandi tetap fase 3.

| Fase | Modul | Selesai kalau |
| --- | --- | --- |
| 1 | Pesanan masuk, plus masuk/keluar akun | Pesanan dari chat bisa dicatat, dibuka detailnya, dan statusnya diubah. Tanpa sandi yang benar, data pesanan tidak tampil. |
| 2 | Kelola menu & harga, buat tagihan | Harga dan foto menu yang disimpan admin tampil di situs. Dari pesanan terkonfirmasi bisa dibuat tagihan dan dikirim ke WhatsApp pembeli. |
| 3 | Atur ulang sandi, laporan penjualan | Sandi bisa diganti saat sudah masuk. Ada ringkasan hari ini, rekap periode, dan menu terlaris. |
| 4 | Pengaturan toko | Nama toko, nomor WhatsApp, area antar/pickup, dan info pembayaran di situs mengikuti isian admin. |

## Fase 1 — Pesanan masuk

Pembeli tetap memesan lewat situs → WhatsApp, seperti sekarang. Admin menyalin isi chat ke pesanan baru. Tidak ada pengambilan chat otomatis.

### Daftar pesanan

- Daftar terbaru di atas.
- Setiap baris: kode pesanan, nama pembeli, ringkasan item, total kalau harga sudah ada, status, tanggal.
- Filter status. Pencarian nama atau kode.
- Daftar kosong menampilkan tombol catat pesanan, bukan halaman blank.

### Detail pesanan

- Identitas: nama, nomor WhatsApp, catatan.
- Pemenuhan: antar atau pickup, alamat bila antar, waktu yang diminta.
- Item: menu, jumlah, harga satuan, subtotal. Harga boleh kosong saat pesanan baru dicatat, lalu diisi saat konfirmasi.
- Total = jumlah subtotal. Ongkir satu angka terpisah, boleh nol.

### Ubah status

Urutan status:

1. Baru — baru dicatat, harga atau stok belum dikonfirmasi.
2. Dikonfirmasi — harga, stok, dan jadwal sudah disepakati.
3. Diproses — sedang dibuat.
4. Siap — siap diantar atau diambil.
5. Selesai.
6. Batal — wajib isi alasan. Pesanan batal tidak masuk omzet.

Status boleh mundur satu langkah (misalnya Siap kembali ke Diproses), kecuali Selesai dan Batal yang hanya bisa dibuka lagi lewat aksi eksplisit “buka kembali”.

### Info pelanggan dan antar/pickup

Ini usulan untuk subfitur keempat yang tertutup di peta.

- Nama dan nomor WhatsApp wajib.
- Pilihan antar atau pickup wajib.
- Alamat wajib hanya jika antar.
- Catatan bebas untuk permintaan rasa, porsi acara, atau jam ambil.

### Masuk dan keluar akun

Login memakai Supabase Auth dengan email dan sandi.

- Satu akun. Pendaftaran akun baru dimatikan di pengaturan Supabase. Akun pemilik dibuat dari dashboard Supabase, lalu dicatat di tabel `admins`.
- Sandi tidak pernah tampil setelah disimpan.
- Pesan salah login selalu sama, tidak membedakan email salah atau sandi salah.
- Sesi habis setelah 12 jam tidak dipakai, atau saat keluar. Pengaturan sesi Supabase (time-box dan inactivity timeout) hanya ada di paket Pro, jadi batas 12 jam dijalankan oleh kode halaman admin: waktu aktivitas terakhir disimpan di perangkat, dan halaman keluar sendiri kalau sudah lewat 12 jam.
- Percobaan login yang berulang dibatasi oleh pembatas bawaan Supabase Auth: 10 percobaan per 5 menit per alamat IP (bawaannya 30, sudah diturunkan). Kunci per akun setelah lima salah sandi tidak tersedia, jadi tidak dibuat di fase 1. Karena itu sandi admin wajib panjang dan unik.
- Keluar menghapus sesi di perangkat itu.

Batas sesi dan pembatas login sudah dicek di dashboard Supabase (28 Sep 2026).

## Fase 2 — Menu, harga, dan tagihan

### Kelola menu & harga

Menu situs publik dibaca dari data yang disimpan admin, bukan lagi daftar tetap di `js/products.js`. Empat menu yang ada sekarang menjadi data awal.

- Tambah menu: nama, kategori (camilan, hantaran, catering), badge, kalimat singkat, deskripsi, tiga sorotan, harga, satuan (porsi, paket, atau box).
- Ubah harga: harga tersimpan dan langsung dipakai pesanan baru serta situs publik. Pesanan yang sudah dikonfirmasi tidak berubah saat harga menu diubah.
- Upload foto: JPG atau PNG, dipakai kartu menu. Foto yang gagal diunggah tidak menghapus foto lama.
- Sembunyikan menu (usulan subfitur keempat): menu nonaktif hilang dari situs, pesanan lama tetap menampilkan namanya.

Situs publik menampilkan harga. Ongkir dan jadwal tetap dikonfirmasi di WhatsApp, sama seperti kalimat yang sudah ada di halaman cara pesan.

### Buat tagihan bayar

Tagihan hanya dari pesanan berstatus Dikonfirmasi, Diproses, Siap, atau Selesai.

- Buat tagihan: satu pesanan satu tagihan aktif. Isinya menyalin item, ongkir, dan total. Kode tagihan terlihat di detail pesanan.
- Pilih cara bayar: transfer, QRIS, atau tunai. Detail rekening/QR menyusul di fase 4; sampai itu, admin mengisi instruksi singkat per tagihan.
- Kirim tagihan: membuka WhatsApp ke nomor pembeli dengan teks item, total, cara bayar, dan kode tagihan. Admin yang menekan kirim di WhatsApp.
- Tandai lunas (usulan subfitur keempat): nominal yang diterima dan waktu lunas. Tagihan yang sudah lunas tidak bisa diubah isinya. Batalkan pelunasan hanya lewat aksi terpisah.

Status tagihan: Draft, Terkirim, Lunas, Batal.

## Fase 3 — Sandi dan laporan

### Atur ulang sandi

- Hanya saat sudah masuk.
- Minta sandi lama, sandi baru, dan ulang sandi baru.
- Sandi baru minimal 8 karakter.
- Setelah ganti sandi, sesi lain dianggap habis.

### Laporan penjualan

Angka dihitung dari pesanan yang tidak batal. Omzet dihitung dari tagihan lunas. Pesanan tanpa tagihan lunas tampil sebagai belum dibayar, bukan sebagai pemasukan.

- Ringkasan hari ini: jumlah pesanan, pesanan belum selesai, omzet lunas, nominal belum dibayar.
- Rekap per periode: pilih tanggal mulai dan selesai, tabel harian jumlah pesanan dan omzet.
- Menu terlaris: peringkat menu menurut jumlah porsi pada periode yang sama, termasuk menu yang sudah disembunyikan.
- Belum lunas (usulan subfitur keempat): daftar tagihan terkirim yang belum ditandai lunas, diurutkan dari yang paling lama.

Hari ini mengikuti zona waktu Jakarta.

## Fase 4 — Pengaturan toko

Nilai awal diambil dari situs sekarang.

| Isian | Nilai awal |
| --- | --- |
| Nama toko | Tetuti Kitchen |
| Tagline | 100% Homemade. Pedas nampol, renyahnya bikin nagih. |
| Kota | Jakarta |
| WhatsApp | 081284966859 |
| Jam | Pre-order via WhatsApp |
| Area | Siap antar / pickup |

### Info toko

- Ubah nama, tagline, kota, nomor WhatsApp, jam, dan area.
- Nomor disimpan sebagai `62…` tanpa spasi. Di situs tampil sebagai `08…`.
- Simpan baru dianggap berhasil jika situs publik memakai nilai baru pada kunjungan berikutnya.

### Info pembayaran

- Minimal satu cara bayar aktif.
- Transfer: nama bank, nomor rekening, atas nama.
- QRIS: satu gambar QR.
- Tunai: catatan singkat, misalnya “dibayar saat pickup”.
- Cara bayar yang diisi di sini menjadi pilihan saat buat tagihan, menggantikan instruksi singkat di fase 2.

## Data yang disimpan

Backend: Supabase (Postgres, Auth, Storage). Skema fase 1 ada di `supabase/migrations/20260928000000_fase1_pesanan.sql`. Sketsa layarnya di `docs/wireframe-fase1.html`.

- Akun: dikelola Supabase Auth, sandi tersimpan dalam bentuk hash. Tabel `admins` menandai akun mana yang boleh membuka admin.
- Menu: identitas, teks kartu, harga, satuan, foto, aktif/nonaktif, urutan.
- Pesanan: kode, pembeli, antar/pickup, item, ongkir, status, alasan batal, waktu dibuat dan waktu status terakhir.
- Tagihan: kode, pesanan terkait, cara bayar, status, waktu kirim, waktu lunas, nominal diterima.
- Toko: isian info toko dan info pembayaran.

Kode pesanan berbentuk `TK-HHBBTTTT-01` (tanggal Jakarta plus urutan harian). Kode tagihan memakai kode pesanan ditambah `-INV`.

## Ukuran berhasil

- Pesanan yang dicatat masih ada setelah admin menutup browser dan masuk lagi.
- Mengubah status tidak mengubah item atau total.
- Mengubah harga menu tidak mengubah pesanan yang sudah dikonfirmasi.
- Teks tagihan yang dibuka ke WhatsApp sama dengan total di detail pesanan.
- Menu nonaktif tidak muncul di situs, dan pesanan lamanya tetap kebaca.
- Laporan hari ini tidak menghitung pesanan batal sebagai omzet.

## Keputusan yang dipakai di draf ini

Empat subfitur di peta tertutup (“Lihat semua”). Draf ini mengisinya dengan info pelanggan, sembunyikan menu, tandai lunas, dan daftar belum lunas. Ganti kalau maksud aslinya berbeda.

Pesanan fase 1 dicatat manual dari chat. Situs publik belum menyimpan pesanan sendiri.

Harga tampil di situs mulai fase 2. Ongkir tetap di luar harga menu.

Admin tinggal di situs yang sama, di `tetuti.my.id/admin`: halaman HTML biasa dengan `supabase-js` dari CDN, tanpa framework. Halaman ini tidak diindeks Google.

## Langkah berikutnya

Sudah selesai: PRD, skema fase 1 (lolos 24 uji di Postgres lokal), sketsa layar fase 1, dan `.vercelignore` untuk `docs/` dan `supabase/`. Semuanya belum di-commit.

Dikerjakan pemilik toko di dashboard Supabase:

- [x] Buat proyek Supabase baru, region Singapore (`ap-southeast-1`). Proyek awal di Mumbai sudah dihapus.
- [x] Authentication → Sign In / Providers: matikan pendaftaran akun baru.
- [x] Cek Authentication → Sessions: hanya paket Pro, batas 12 jam lewat kode admin.
- [x] Authentication → Rate Limits: sign-ups and sign-ins diturunkan dari 30 ke 10 per 5 menit per IP.
- [x] SQL Editor: jalankan `supabase/migrations/20260928000000_fase1_pesanan.sql`. Dicek: 5 tabel, 4 menu, RLS aktif di semua tabel.
- [x] Authentication → Users: buat akun pemilik (email dan sandi).
- [x] SQL Editor: tandai akun itu sebagai admin:
  `insert into public.admins (user_id) select id from auth.users where email = 'EMAIL_PEMILIK';`
- [x] Kirim ke agen: Project URL dan anon/publishable key. Dicek dari luar: pendaftaran ditolak, pengunjung tanpa login tidak bisa membaca atau menulis tabel mana pun. Kunci ini memang dipakai di browser dan aman dibagikan. **Jangan** kirim `service_role` key atau sandi database.

Dikerjakan agen setelah itu:

- [x] Bangun `admin/`: halaman masuk, daftar pesanan, catat pesanan, detail dan ubah status, sesuai sketsa.
- [x] Terjemahkan pesan error database ke kalimat Indonesia (misalnya alamat wajib untuk antar, format nomor WhatsApp).
- [x] Tambah `noindex` di halaman admin dan `Disallow: /admin` di `robots.txt`.
- [x] Uji halaman masuk dengan proyek Supabase asli (salah sandi menampilkan pesan Indonesia). Fungsi bantu lolos 18 uji.
- [x] Uji alur setelah masuk dengan akun pemilik (28 Sep 2026): catat pickup dan antar, validasi nomor dan alamat, isi harga, hapus item, status maju-mundur-selesai, batal beralasan, buka kembali, cari, filter, keluar otomatis setelah 12 jam.
- [x] Hapus pesanan uji (`UJI …`) lewat SQL Editor, nomor urut hari itu dikembalikan.

Dikerjakan pemilik toko:

- [ ] Commit dan push, lalu cek `tetuti.my.id/admin` dari HP.
- [ ] Pakai untuk pesanan asli selama beberapa hari, catat yang kurang, baru lanjut ke fase 2 (harga, foto menu, tagihan).
