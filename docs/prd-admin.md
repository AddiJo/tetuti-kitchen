# PRD — Admin Tetuti Kitchen

Status: fase 1 tayang di `tetuti.my.id/admin`: login, harga menu, pesanan situs otomatis, catat manual, detail, status. Bunyi pesanan baru menunggu migrasi Realtime. Fase 2 kelola menu sudah dibangun dan menunggu migrasi `20260929020000_kelola_menu.sql`.

Situs publik: [tetuti.my.id](https://www.tetuti.my.id/). Empat menu (Sambal Crispy, Paket Hantaran, Nasi Kotak, Sosis Solo). Nomor toko `081284966859`, area Jakarta, antar atau pickup, pre-order.

Sekarang pembeli memilih jumlah di kartu, lalu chat WhatsApp terbuka. Harga tertulis “Harga via WhatsApp”. Tidak ada pesanan yang tersimpan.

## Tujuan

Pesanan yang dibuat pembeli di situs langsung tampil di dashboard admin, lengkap dengan data pembeli dan harga, tanpa disalin dari chat. Pemilik toko mengatur harga menu dari admin, memproses pesanan sampai selesai, membuat tagihan, dan melihat rekap penjualan.

## Bukan tujuan

- Menarik pesanan dari chat WhatsApp (WhatsApp Business API).
- Login pembeli, keranjang tersimpan antar kunjungan, atau pembayaran di dalam situs.
- Pembeli melacak status pesanannya sendiri di situs.
- Notifikasi push ke HP saat halaman admin tertutup.
- Banyak akun, peran kasir/dapur, atau stok bahan baku.
- Ongkir otomatis dari peta.

## Pengguna

- Pemilik Tetuti Kitchen: satu akun admin.
- Pembeli: pengunjung situs tanpa akun.

## Urutan bangun

Halaman admin tidak boleh dibuka ke internet sebelum ada masuk akun, jadi masuk dan keluar akun ikut fase 1. Harga harus bisa diatur sebelum pesanan situs masuk, supaya pesanan membawa harga; karena itu ubah harga ditarik dari fase 2 ke fase 1.

| Fase | Modul | Selesai kalau |
| --- | --- | --- |
| 1 | Pesanan masuk: login, harga menu, pesanan situs otomatis, bunyi pesanan baru, catat manual, status | Pembeli memesan di situs dan pesanannya muncul sendiri di dashboard dengan bunyi. Harga yang diubah admin tampil di situs. |
| 2 | Kelola menu lengkap, buat tagihan | Menu bisa ditambah, disembunyikan, dan diberi foto dari admin. Dari pesanan terkonfirmasi bisa dibuat tagihan dan dikirim ke WhatsApp pembeli. |
| 3 | Atur ulang sandi, laporan penjualan | Sandi bisa diganti saat sudah masuk. Ada ringkasan hari ini, rekap periode, dan menu terlaris. |
| 4 | Pengaturan toko | Nama toko, nomor WhatsApp, area, dan info pembayaran di situs mengikuti isian admin. |

Urutan kerja sisa fase 1:

1. Harga menu diatur dari admin dan tampil di situs.
2. Pesanan dari situs tersimpan dan masuk otomatis ke dashboard.
3. Bunyi dan tanda di tab browser saat pesanan baru masuk.

## Fase 1 — Pesanan masuk

### Harga menu

Ubah harga dari subfitur “Kelola Menu & Harga” dikerjakan di fase 1. Tambah menu, foto, dan sembunyikan menu tetap fase 2.

- Admin punya halaman Menu: empat menu dengan kolom harga dan satuan (opsional, misalnya “per pack” atau “per box”).
- Harga dalam rupiah bulat. Kosong berarti belum ada harga.
- Situs membaca harga saat dibuka. Menu berharga tampil “Rp25.000 / pack”. Menu tanpa harga tetap bisa dipesan dan tertulis “Harga via WhatsApp”.
- Kalau harga gagal dimuat (internet lambat atau Supabase terganggu), kartu tetap tampil dengan “Harga via WhatsApp” dan tetap bisa dipesan.
- Teks kartu, badge, dan foto tetap dari `js/products.js` sampai fase 2.
- Mengubah harga tidak mengubah pesanan yang sudah masuk. Harga disalin ke pesanan saat pesanan dibuat.

### Pesanan dari situs

Pembeli tetap memilih jumlah di kartu. Tombol “Pesan” dan “Pesan semua” tidak lagi membuka WhatsApp, tapi membuka form pesanan.

Form pesanan:

- Ringkasan item: jumlah, harga satuan, subtotal. Item tanpa harga tertulis “Harga via WhatsApp”.
- Nama (wajib).
- Nomor WhatsApp (wajib). Boleh ditulis 08…, +62…, atau 62….
- Pickup atau antar (wajib).
- Alamat (wajib kalau antar).
- Catatan (opsional), misalnya tanggal acara atau level pedas.
- Keterangan: “Ongkir dan jadwal dikonfirmasi Tetuti Kitchen lewat WhatsApp.”
- Keterangan: “Data ini hanya dipakai untuk menghubungi Anda soal pesanan ini.”

Setelah dikirim, pembeli melihat layar terima kasih: kode pesanan, total sementara (tanpa ongkir), dan kalimat bahwa Tetuti Kitchen akan menghubungi lewat WhatsApp ke nomor yang diisi. WhatsApp tidak dibuka otomatis.

Kalau pengiriman gagal, pembeli melihat pesan gagal dan pilihan “Pesan lewat WhatsApp” yang membuka chat seperti sekarang, supaya pesanan tidak hilang.

Aturan pesanan dari situs:

- Masuk dengan status Baru dan sumber “Situs”. Pesanan manual bersumber “Admin”.
- Harga item diambil dari database saat pesanan dibuat, bukan dari angka yang dikirim browser.
- Hanya menu aktif. 1–10 baris item, jumlah per item 1–200.
- Nomor WhatsApp yang sama maksimal 6 pesanan per jam.
- Semua pesanan dari situs maksimal 60 per jam, untuk menahan banjir pesanan palsu.
- Form punya kolom jebakan yang tidak terlihat manusia. Pengiriman yang mengisinya dibuang.
- Pembeli tidak bisa membaca pesanan apa pun, termasuk miliknya sendiri. Yang dikembalikan hanya kode pesanan.
- Nomor WhatsApp tidak bisa dipastikan milik pembeli sampai admin menghubunginya. Pesanan palsu dibatalkan dengan alasan.

### Dashboard pesanan baru

- Pesanan baru dari situs muncul di daftar tanpa refresh selama halaman admin terbuka.
- Bunyi pendek saat pesanan baru masuk. Browser hanya mengizinkan bunyi setelah halaman pernah diklik, jadi kalau bunyi belum aktif, dashboard menampilkan tombol “Aktifkan bunyi”.
- Judul tab menunjukkan jumlah pesanan baru yang belum dibuka, misalnya “(2) Admin — Tetuti Kitchen”. Angka berkurang saat detail pesanan dibuka.
- Kartu pesanan situs yang belum dibuka diberi tanda “Baru masuk”.
- Kalau sambungan langsung terputus, daftar tetap diperbarui otomatis setiap 60 detik.
- Bunyi dan tanda hanya bekerja saat halaman admin terbuka di browser. Kalau HP terkunci atau tab ditutup, pesanan tetap tersimpan dan terlihat saat admin dibuka lagi.

### Daftar pesanan

- Daftar terbaru di atas.
- Setiap baris: kode pesanan, nama pembeli, ringkasan item, total kalau harga sudah ada, status, sumber, tanggal.
- Filter status. Pencarian nama atau kode.
- Daftar kosong menampilkan penjelasan, bukan halaman blank.

### Catat pesanan manual

Tetap ada untuk pembeli yang langsung chat tanpa lewat situs. Isiannya sama dengan form situs, ditambah waktu yang diminta, ongkir, dan harga per item yang boleh diisi manual.

### Detail pesanan

- Identitas: nama, nomor WhatsApp dengan tombol Buka WhatsApp, catatan.
- Pemenuhan: antar atau pickup, alamat bila antar, waktu yang diminta.
- Item: menu, jumlah, harga satuan, subtotal. Harga boleh kosong sampai konfirmasi.
- Total = jumlah subtotal + ongkir. Ongkir diisi admin setelah disepakati di chat.

### Ubah status

1. Baru — pesanan masuk, harga, ongkir, atau jadwal belum dikonfirmasi.
2. Dikonfirmasi — harga, ongkir, dan jadwal sudah disepakati.
3. Diproses — sedang dibuat atau menunggu diantar/diambil.
4. Selesai — sudah sampai ke pembeli.
5. Batal — wajib isi alasan. Pesanan batal tidak masuk omzet.

Status maju atau mundur satu langkah. Selesai dibuka kembali ke Diproses, Batal ke Baru. Pesanan tidak bisa dikonfirmasi sebelum semua item punya harga. Status Siap dihapus atas permintaan pemilik (29 Sep 2026); Diproses langsung ke Selesai.

Daftar pesanan memakai tab seperti marketplace: Semua, Baru, Dikonfirmasi, Diproses, Selesai, Dibatalkan. Tab yang masih perlu dikerjakan diberi jumlah, dan di bawah tab ada keterangan arti status.

### Masuk dan keluar akun

Login memakai Supabase Auth dengan email dan sandi.

- Satu akun. Pendaftaran akun baru dimatikan. Akun pemilik dibuat dari dashboard Supabase, lalu dicatat di tabel `admins`.
- Pesan salah login selalu sama, tidak membedakan email salah atau sandi salah.
- Sesi habis setelah 12 jam tidak dipakai, atau saat keluar. Pengaturan sesi Supabase hanya ada di paket Pro, jadi batas 12 jam dijalankan oleh kode halaman admin.
- Percobaan login dibatasi 10 kali per 5 menit per alamat IP (pengaturan Supabase, bawaannya 30). Kunci per akun tidak tersedia, jadi sandi admin wajib panjang dan unik.
- Keluar menghapus sesi di perangkat itu.

## Fase 2 — Menu lengkap dan tagihan

### Kelola menu

Teks kartu, badge, dan foto pindah dari `js/products.js` ke database. `js/products.js` tinggal jadi cadangan yang tampil kalau database tidak bisa dihubungi.

- Tambah menu: nama, kategori (camilan, hantaran, catering), badge, kalimat singkat, deskripsi, tiga sorotan, harga, satuan. Hanya nama yang wajib. Nama menjadi alamat tetap menu (`sambal-crispy`); mengganti nama kemudian tidak mengubah alamat itu.
- Upload foto: JPG atau PNG. Admin mengecilkan foto ke sisi terpanjang 1200 px dan mengubahnya ke JPG sebelum diunggah ke bucket `menu-foto`. Foto baru diunggah dulu; menu baru disimpan kalau unggahan berhasil, lalu foto lama dihapus. Foto yang gagal diunggah tidak menghapus foto lama.
- Sembunyikan menu: hilang dari situs, pesanan lama tetap menampilkan namanya.
- Hapus menu: hanya untuk menu yang belum pernah dipesan (misalnya menu uji), beserta fotonya. Menu yang sudah ada di pesanan ditolak database dan cukup disembunyikan, supaya riwayat pesanan dan laporan menu terlaris tetap utuh. (Permintaan pemilik, 29 Sep 2026.)
- Urutan: tombol naik/turun di daftar menu, sama dengan urutan kartu di situs.
- Harga diubah dari halaman ubah menu (dulu satu halaman harga untuk semua menu).

### Buat tagihan bayar

Tagihan hanya dari pesanan berstatus Dikonfirmasi, Diproses, atau Selesai.

- Buat tagihan: satu pesanan satu tagihan aktif. Isinya menyalin item, ongkir, dan total.
- Pilih cara bayar: transfer, QRIS, atau tunai. Sampai fase 4, admin mengisi instruksi singkat per tagihan.
- Kirim tagihan: membuka WhatsApp ke nomor pembeli dengan teks item, total, cara bayar, dan kode tagihan.
- Tandai lunas: nominal yang diterima dan waktu lunas. Tagihan lunas terkunci, kecuali lewat Batalkan lunas (dengan konfirmasi) yang mengembalikannya ke Terkirim untuk memperbaiki salah tandai. (Keputusan pemilik, 29 Sep 2026.)

Status tagihan: Draft, Terkirim, Lunas, Batal.

## Fase 3 — Sandi dan laporan

### Atur ulang sandi

- Hanya saat sudah masuk. Sandi lama, sandi baru, ulang sandi baru. Minimal 8 karakter.
- Setelah ganti sandi, sesi di perangkat lain habis.

### Laporan penjualan

Pesanan batal tidak dihitung. Omzet dari tagihan lunas. Hari ini mengikuti zona waktu Jakarta.

- Ringkasan hari ini: jumlah pesanan, belum selesai, omzet lunas, nominal belum dibayar.
- Rekap per periode: tabel harian jumlah pesanan dan omzet.
- Menu terlaris: peringkat menurut jumlah porsi, termasuk menu yang disembunyikan.
- Belum lunas: tagihan terkirim yang belum lunas, yang paling lama di atas.
- Sumber pesanan: berapa dari situs, berapa dicatat manual.

## Fase 4 — Pengaturan toko

| Isian | Nilai awal |
| --- | --- |
| Nama toko | Tetuti Kitchen |
| Tagline | 100% Homemade. Pedas nampol, renyahnya bikin nagih. |
| Kota | Jakarta |
| WhatsApp | 081284966859 |
| Jam | Pre-order via WhatsApp |
| Area | Siap antar / pickup |

- Info toko: ubah isian di atas. Nomor disimpan sebagai `62…`, tampil sebagai `08…`.
- Info pembayaran: transfer (bank, rekening, atas nama), QRIS (satu gambar), tunai (catatan). Minimal satu aktif. Menjadi pilihan saat buat tagihan.

## Data yang disimpan

Backend: Supabase (Postgres, Auth, Realtime, Storage) di region Singapore. Skema fase 1 ada di `supabase/migrations/`. Sketsa layar di `docs/wireframe-fase1.html`.

- Akun: Supabase Auth. Tabel `admins` menandai akun admin.
- Menu: identitas, nama, kategori, harga, satuan, aktif, urutan, badge, kalimat singkat, deskripsi, sorotan, foto. Foto hanya boleh dari folder `assets/` situs atau bucket `menu-foto` proyek ini.
- Pesanan: kode, sumber (situs/admin), pembeli, antar/pickup, alamat, catatan, item dengan harga saat dipesan, ongkir, status, alasan batal, waktu dibuat, waktu status terakhir, waktu pertama dibuka admin.
- Tagihan (fase 2), toko (fase 4).

Kode pesanan `TK-DDMMYYYY-NN`: tanggal Jakarta plus urutan harian, sama untuk pesanan situs dan manual.

Hak akses:

- Pengunjung tanpa login: hanya membaca isi kartu menu aktif (nama, harga, teks, foto), dan mengirim pesanan lewat satu fungsi database yang memeriksa semua aturan di atas. Tidak bisa membaca atau mengubah tabel lain, dan tidak bisa mengunggah, menghapus, atau melihat daftar foto.
- Admin: membaca dan mengubah semuanya lewat aturan RLS.

## Ukuran berhasil

- Pesanan yang dikirim pembeli di situs muncul di dashboard admin yang sedang terbuka dalam hitungan detik, dengan bunyi.
- Harga yang diubah admin tampil di situs pada kunjungan berikutnya.
- Harga di pesanan sama dengan harga menu saat pesanan dibuat, walaupun harga menu diubah kemudian.
- Pengunjung tanpa login tidak bisa membaca pesanan siapa pun.
- Pesanan ke-7 dari nomor yang sama dalam satu jam ditolak.
- Situs tetap bisa dipakai memesan lewat WhatsApp kalau database sedang tidak bisa dihubungi.
- Mengubah status tidak mengubah item atau total.
- Laporan tidak menghitung pesanan batal sebagai omzet.

## Keputusan

- Empat subfitur di peta yang tertutup (“Lihat semua”) diisi: info pelanggan, sembunyikan menu, tandai lunas, daftar belum lunas.
- Pesanan situs masuk otomatis ke admin. Setelah mengirim, pembeli tidak diarahkan ke WhatsApp; admin yang menghubungi. WhatsApp hanya dibuka pembeli kalau pengiriman gagal. (Keputusan pemilik, 28 Sep 2026.)
- Data pembeli: nama, WhatsApp, pickup/antar, alamat bila antar, catatan opsional.
- Menu tanpa harga tetap bisa dipesan dengan tulisan “Harga via WhatsApp”.
- Dashboard memperbarui sendiri, dengan bunyi dan angka di judul tab.
- Tidak ada notifikasi ke HP admin (Telegram, WhatsApp, atau web push) untuk saat ini. Pesanan baru hanya terdengar selama halaman admin terbuka. (Keputusan pemilik, 29 Sep 2026.)
- Catat pesanan manual tetap ada.
- Admin di `tetuti.my.id/admin`: HTML biasa dengan `supabase-js` dari CDN, tanpa framework, tidak diindeks Google.

## Langkah berikutnya

Sudah selesai dan tayang: proyek Supabase (Singapore), skema fase 1, akun admin, halaman `admin/` dengan login, daftar, catat manual, detail, dan status. Diuji dengan akun pemilik pada 28 Sep 2026; pesanan uji sudah dihapus.

Langkah 1 — harga menu:

- [x] Agen: migrasi kolom harga dan satuan, akses baca menu untuk pengunjung.
- [x] Pemilik: jalankan migrasi di SQL Editor.
- [x] Agen: halaman Menu di admin, harga tampil di kartu situs.
- [x] Uji, lalu pemilik mengisi harga asli, commit, dan push.

Langkah 2 — pesanan situs otomatis:

- [x] Agen: migrasi fungsi kirim pesanan (validasi, harga dari database, batas per nomor dan per jam), kolom sumber dan waktu dibuka.
- [x] Pemilik: jalankan migrasi.
- [x] Agen: form pesanan dan layar terima kasih di situs, penanda sumber di admin.
- [x] Uji dari HP sebagai pembeli, lalu commit dan push. (TK-29092026-01, 29 Sep 2026.)

Langkah 3 — bunyi pesanan baru:

- [ ] Pemilik: jalankan migrasi Realtime untuk tabel `orders`.
- [x] Agen: daftar memperbarui sendiri, bunyi, angka di judul tab, tanda “Baru masuk”.
- [ ] Uji dengan dua perangkat: pesan dari HP, dengar bunyi di admin.

Fase 2, langkah 1 — kelola menu:

- [x] Agen: migrasi teks kartu, foto, bucket `menu-foto` dan aksesnya; halaman daftar, tambah, dan ubah menu; situs membaca kartu dari database.
- [x] Pemilik: jalankan migrasi `20260929020000_kelola_menu.sql` sebelum push.
- [x] Pemilik: push, lalu uji ganti foto dan tambah menu. Tampil di situs (29 Sep 2026).
- [x] Agen: hapus menu yang belum pernah dipesan (migrasi `20260929030000_hapus_menu.sql`).
- [ ] Pemilik: jalankan migrasi hapus menu, push, lalu hapus menu uji.

Fase 2, langkah 2 — tagihan: dikerjakan setelah kelola menu, mengikuti urutan fase (keputusan pemilik, 29 Sep 2026). Sumber instruksi bayar belum diputuskan.
