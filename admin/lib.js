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

export function loginErrorMessage(error) {
  if (error.status === 429) {
    return "Terlalu banyak percobaan masuk. Tunggu beberapa menit lalu coba lagi.";
  }
  if (error.status === 400 || /invalid login credentials/i.test(error.message || "")) {
    return "Email atau sandi salah.";
  }
  return errorMessage(error);
}
