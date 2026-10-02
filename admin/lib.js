const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000;

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const dateTime = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const longDay = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  day: "numeric",
  month: "long",
  year: "numeric",
});

// Tanggal laporan sudah berupa hari Jakarta (YYYY-MM-DD), jadi dibaca sebagai UTC.
const reportDay = new Intl.DateTimeFormat("id-ID", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
});
const reportDate = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", day: "numeric", month: "short" });
const reportMonth = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", month: "short" });
const reportLongMonth = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", month: "long", year: "numeric" });
const reportFullDate = new Intl.DateTimeFormat("id-ID", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

export function formatRp(amount) {
  return rupiah.format(amount);
}

// Sama dengan tulisan harga di kartu situs (js/app.js).
export function priceLabel(price, unit) {
  if (price == null) return "Harga via WhatsApp";
  return unit ? `${formatRp(price)} / ${unit}` : formatRp(price);
}

export function formatDate(iso) {
  return iso ? dateTime.format(new Date(iso)) : "";
}

export function formatDay(iso) {
  return iso ? longDay.format(new Date(iso)) : "";
}

const utcDay = (day) => new Date(`${day}T00:00:00Z`);

// Label sumbu grafik (pendek) dan label keterangan titik (lengkap).
export function bucketLabel(start, step) {
  return step === "month" ? reportMonth.format(utcDay(start)) : reportDate.format(utcDay(start));
}

export function bucketTitle(start, step) {
  if (step === "month") return reportLongMonth.format(utcDay(start));
  if (step === "week") return `Minggu mulai ${reportDate.format(utcDay(start))}`;
  return reportDay.format(utcDay(start));
}

export function formatRange(start, end) {
  if (start === end) return reportFullDate.format(utcDay(start));
  return `${reportFullDate.format(utcDay(start))} – ${reportFullDate.format(utcDay(end))}`;
}

export function shortNumber(value) {
  return compact.format(value);
}

export function jakartaToday(now = new Date()) {
  return new Date(now.getTime() + JAKARTA_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(day, count) {
  const date = utcDay(day);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

export function daySpan(start, end) {
  return Math.round((utcDay(end) - utcDay(start)) / 86_400_000) + 1;
}

export const REPORT_MAX_DAYS = 731;

export const REPORT_PRESETS = [
  { id: "hari-ini", label: "Hari ini" },
  { id: "7-hari", label: "7 hari" },
  { id: "30-hari", label: "30 hari" },
  { id: "bulan-ini", label: "Bulan ini" },
  { id: "bulan-lalu", label: "Bulan lalu" },
  { id: "90-hari", label: "90 hari" },
  { id: "tahun-ini", label: "Tahun ini" },
];

export function presetRange(id, today) {
  const month = today.slice(0, 7);
  switch (id) {
    case "hari-ini":
      return { start: today, end: today };
    case "7-hari":
      return { start: addDays(today, -6), end: today };
    case "bulan-ini":
      return { start: `${month}-01`, end: today };
    case "bulan-lalu": {
      const end = addDays(`${month}-01`, -1);
      return { start: `${end.slice(0, 7)}-01`, end };
    }
    case "90-hari":
      return { start: addDays(today, -89), end: today };
    case "tahun-ini":
      return { start: `${today.slice(0, 4)}-01-01`, end: today };
    default:
      return { start: addDays(today, -29), end: today };
  }
}

export function rangeProblem(start, end, today) {
  if (!start || !end) return "Isi tanggal awal dan tanggal akhir.";
  if (start > end) return "Tanggal awal harus sama dengan atau sebelum tanggal akhir.";
  if (end > today) return "Tanggal akhir tidak boleh melewati hari ini.";
  if (daySpan(start, end) > REPORT_MAX_DAYS) return "Rentang laporan paling panjang dua tahun.";
  return null;
}

// Persen naik/turun dibanding periode sebelumnya; kosong kalau pembandingnya nol.
export function percentChange(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// Garis bantu sumbu Y: kelipatan 1, 2, 2,5, atau 5 yang menutup nilai terbesar.
// Untuk hitungan (whole) langkahnya bilangan bulat.
export function niceTicks(max, count = 4, whole = false) {
  if (!(max > 0)) return Array.from({ length: count + 1 }, (_, i) => i);
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  let step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough);
  if (whole) step = Math.max(1, Math.ceil(step));
  const ticks = [];
  for (let i = 0; i <= count; i++) ticks.push(Math.round(step * i * 1000) / 1000);
  return ticks;
}

// Sel CSV untuk Excel berbahasa Indonesia (pemisah titik koma). Teks yang
// diawali = + - @ diberi tanda kutip tunggal supaya tidak dijalankan sebagai
// rumus, karena nama dan catatan pembeli diketik bebas dari situs.
export function csvCell(value) {
  if (value == null) return "";
  if (typeof value === "number") return String(value);
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvText(rows) {
  return `\ufeff${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}

// Menerima 0812…, 812…, +62 812…, atau 62812…; hasilnya selalu 62… tanpa spasi.
export function normalizePhone(raw) {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  return digits;
}

export function isValidPhone(phone) {
  return /^62[0-9]{8,13}$/.test(phone);
}

export function displayPhone(phone) {
  return String(phone ?? "").replace(/^62/, "0");
}

// Input datetime-local tidak membawa zona waktu; semua jam di admin dibaca
// sebagai jam Jakarta (UTC+7, tanpa pergantian musim).
export function toJakartaInput(iso) {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + JAKARTA_OFFSET_MS).toISOString().slice(0, 16);
}

export function fromJakartaInput(value) {
  return value ? `${value}:00+07:00` : null;
}

export function parseRupiah(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits === "" ? null : Number(digits);
}

const CONSTRAINT_MESSAGES = {
  invoices_pdf_path_format: "Alamat PDF invoice tidak valid. Muat ulang halaman lalu coba lagi.",
  orders_address_for_delivery: "Alamat wajib diisi untuk pesanan antar.",
  orders_customer_phone_check: "Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890.",
  orders_customer_name_check: "Nama pembeli wajib diisi.",
  orders_cancel_reason: "Alasan batal wajib diisi.",
  orders_shipping_fee_check: "Ongkir tidak boleh minus.",
  order_items_quantity_check: "Jumlah item minimal 1.",
  order_items_unit_price_check: "Harga tidak boleh minus.",
  order_items_name_check: "Nama item wajib diisi.",
  menu_items_price_check: "Harga menu harus antara Rp1 dan Rp100.000.000.",
  menu_items_unit_check: "Satuan maksimal 20 karakter.",
  menu_items_pkey: "Sudah ada menu dengan nama mirip. Pakai nama lain.",
  menu_items_id_format: "Nama menu harus mengandung huruf atau angka.",
  menu_items_name_check: "Nama menu wajib diisi.",
  menu_items_name_length: "Nama menu maksimal 60 karakter.",
  menu_items_badge_check: "Label foto maksimal 20 karakter.",
  menu_items_hook_check: "Kalimat singkat maksimal 60 karakter.",
  menu_items_description_check: "Deskripsi maksimal 300 karakter.",
  menu_items_highlights_check: "Sorotan maksimal 3, masing-masing maksimal 60 karakter.",
  menu_items_image_url_check: "Alamat foto tidak dikenali. Unggah ulang fotonya.",
  invoices_instructions_required: "Isi instruksi bayar, misalnya nomor rekening tujuan.",
  invoices_instructions_check: "Instruksi bayar maksimal 500 karakter.",
  invoices_paid_fields: "Isi nominal yang diterima dan waktu lunas.",
  invoices_paid_amount_check: "Nominal yang diterima harus lebih dari Rp0.",
  invoices_one_active: "Pesanan ini sudah punya tagihan aktif. Batalkan dulu tagihan lama.",
  order_items_menu_item_id_fkey:
    "Menu ini sudah pernah dipesan, jadi tidak bisa dihapus. Hapus centang Tampilkan di situs untuk menyembunyikannya.",
};

// Nama menu menjadi alamat tetap menu itu, misalnya "Sambal Crispy" -> "sambal-crispy".
export function slugify(name) {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/, "");
}

export function uniqueSlug(name, taken) {
  const base = slugify(name) || "menu";
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

export const METHOD_LABEL = { transfer: "Transfer bank", qris: "QRIS", tunai: "Tunai" };
export const INVOICE_STATUS_LABEL = { draft: "Draft", terkirim: "Terkirim", lunas: "Lunas", batal: "Batal" };

// Baris item dengan bentuk yang sama seperti salinan database di invoices.lines.
export function invoiceLines(items) {
  return items.map((item) => ({ name: item.name, quantity: item.quantity, unit_price: item.unit_price }));
}

export function invoiceMessage(invoice, order) {
  const lines = invoice.lines.map(
    (line) =>
      `${line.quantity}× ${line.name} @ ${formatRp(line.unit_price)} = ${formatRp(line.quantity * line.unit_price)}`
  );
  return [
    `Halo Kak ${order.customer_name}, berikut tagihan pesanan Tetuti Kitchen.`,
    "",
    `Tagihan: ${invoice.code}`,
    `Pesanan: ${order.code}`,
    "",
    ...lines,
    ...(invoice.shipping_fee ? [`Ongkir: ${formatRp(invoice.shipping_fee)}`] : []),
    `*Total: ${formatRp(invoice.total)}*`,
    "",
    `Cara bayar: ${METHOD_LABEL[invoice.method]}`,
    ...(invoice.instructions ? [invoice.instructions] : []),
    "",
    invoice.method === "tunai"
      ? "Terima kasih!"
      : "Setelah membayar, mohon kirim bukti pembayaran di chat ini. Terima kasih!",
  ].join("\n");
}

// Status yang dibaca pembeli di dokumen; Draft dan Terkirim sama-sama belum dibayar.
export const INVOICE_STAMP = { draft: "Belum dibayar", terkirim: "Belum dibayar", lunas: "Lunas", batal: "Dibatalkan" };

// Keterangan singkat yang ikut terkirim bersama file PDF.
export function invoiceCaption(invoice, order) {
  const what = invoice.status === "lunas" ? `invoice lunas ${invoice.code}` : `invoice ${invoice.code}`;
  return `Halo Kak ${order.customer_name}, berikut ${what} untuk pesanan ${order.code} di Tetuti Kitchen. Total ${formatRp(invoice.total)}.`;
}

export function invoiceLinkMessage(invoice, order, url) {
  let closing = "Setelah membayar, mohon kirim bukti pembayaran di chat ini. Terima kasih!";
  if (invoice.status === "lunas") closing = "Pembayaran sudah kami terima. Terima kasih!";
  else if (invoice.method === "tunai") closing = "Terima kasih!";
  return [invoiceCaption(invoice, order), "", "Invoice (PDF):", url, "", closing].join("\n");
}

const PDF_REPLACEMENTS = { "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...", "\u202f": " " };

// Huruf bawaan PDF hanya memuat Latin-1; karakter lain (emoji, kutip miring
// dari keyboard HP) diganti padanannya atau dibuang supaya tidak jadi huruf acak.
export function pdfText(value) {
  return String(value ?? "")
    .replace(/[^\x00-\xff]/gu, (char) => PDF_REPLACEMENTS[char] ?? "")
    .replace(/ {2,}/g, " ");
}

export function waLink(phone, text) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

// Foto bawaan tersimpan sebagai "assets/…" relatif terhadap situs.
export function menuImageSrc(url) {
  if (!url) return "";
  return url.startsWith("assets/") ? `/${url}` : url;
}

export function errorMessage(error) {
  if (!error) return "Terjadi kesalahan.";
  const message = error.message || String(error);
  for (const [constraint, text] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (message.includes(constraint)) return text;
  }
  // Pesan dari trigger database sudah berbahasa Indonesia.
  if (error.code === "P0001") return message;
  if (error.code === "PGRST301" || /jwt/i.test(message)) return "Sesi habis. Silakan masuk lagi.";
  if (/row-level security/i.test(message)) return "Akses ditolak. Keluar lalu masuk lagi dengan akun admin.";
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "Tidak tersambung ke server. Periksa internet lalu coba lagi.";
  }
  return `Gagal: ${message}`;
}

export const PASSWORD_MIN = 8;
// Supabase Auth menolak sandi lebih dari 72 karakter.
export const PASSWORD_MAX = 72;

export function passwordChangeProblem({ current, next, repeat }) {
  if (!current || !next || !repeat) return "Isi sandi lama, sandi baru, dan ulangi sandi baru.";
  if (next.length < PASSWORD_MIN) return `Sandi baru minimal ${PASSWORD_MIN} karakter.`;
  if (next.length > PASSWORD_MAX) return `Sandi baru maksimal ${PASSWORD_MAX} karakter.`;
  if (next !== repeat) return "Ulangi sandi baru belum sama dengan sandi baru.";
  if (next === current) return "Sandi baru harus berbeda dari sandi lama.";
  return null;
}

// Tanpa huruf yang mudah tertukar (I, l, O, 0, 1) karena sandi sementara
// dibacakan atau diketik ulang dari chat.
const PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
// Byte di atas batas ini dibuang supaya setiap huruf punya peluang yang sama.
const PASSWORD_BYTE_LIMIT = 256 - (256 % PASSWORD_CHARS.length);

export function randomPassword(fill = (bytes) => crypto.getRandomValues(bytes)) {
  for (;;) {
    const bytes = fill(new Uint8Array(12));
    if (bytes.some((byte) => byte >= PASSWORD_BYTE_LIMIT)) continue;
    const chars = Array.from(bytes, (byte) => PASSWORD_CHARS[byte % PASSWORD_CHARS.length]).join("");
    if (/[A-Z]/.test(chars) && /[a-z]/.test(chars) && /[0-9]/.test(chars)) {
      return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`;
    }
  }
}

export function currentPasswordErrorMessage(error) {
  if (error.status === 429) return "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.";
  if (error.status === 400 || /invalid login credentials/i.test(error.message || "")) {
    return "Sandi lama salah.";
  }
  return errorMessage(error);
}

export function passwordErrorMessage(error) {
  if (error.status === 429) return "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.";
  if (error.code === "same_password") return "Sandi baru harus berbeda dari sandi lama.";
  if (error.code === "invalid_credentials") return "Sandi lama salah.";
  if (error.code === "weak_password") {
    if (error.reasons?.includes("pwned")) {
      return "Sandi ini pernah bocor di internet, jadi ditolak. Pakai sandi lain.";
    }
    return "Sandi baru terlalu lemah. Pakai gabungan huruf besar, huruf kecil, angka, dan simbol.";
  }
  if (error.code === "reauthentication_needed" || error.code === "reauth_nonce_missing") {
    return "Supabase meminta Anda masuk ulang dulu. Keluar, masuk lagi, lalu ganti sandi.";
  }
  return errorMessage(error);
}

export function loginErrorMessage(error) {
  if (error.status === 429) {
    return "Terlalu banyak percobaan masuk. Tunggu beberapa menit lalu coba lagi.";
  }
  if (error.status === 400 || /invalid login credentials/i.test(error.message || "")) {
    return "Email atau sandi salah.";
  }
  return errorMessage(error);
}
