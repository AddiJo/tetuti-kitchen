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
};

export function errorMessage(error) {
  if (!error) return "Terjadi kesalahan.";
  const message = error.message || String(error);
  for (const [constraint, text] of Object.entries(CONSTRAINT_MESSAGES)) {
    if (message.includes(constraint)) return text;
  }
  // Pesan dari trigger database sudah berbahasa Indonesia.
  if (error.code === "P0001") return message;
  if (error.code === "PGRST301" || /jwt/i.test(message)) return "Sesi habis. Silakan masuk lagi.";
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
