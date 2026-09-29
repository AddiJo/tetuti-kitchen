import {
  displayPhone,
  formatDate,
  formatDay,
  formatRp,
  INVOICE_STAMP,
  METHOD_LABEL,
  pdfText,
} from "./lib.js";

// Invoice digambar langsung sebagai teks PDF, bukan tangkapan layar, supaya
// file kecil dan tetap tajam saat diperbesar di WhatsApp.
const JSPDF_URL = "https://cdn.jsdelivr.net/npm/jspdf@4.2.1/+esm";

const BRAND = [106, 16, 16];
const INK = [42, 22, 18];
const MUTED = [122, 92, 82];
const LINE = [228, 214, 200];
const PAPER = [255, 250, 244];
const STAMP_COLOR = { draft: [138, 90, 0], terkirim: [138, 90, 0], lunas: [47, 107, 58], batal: [161, 26, 26] };

const LEFT = 18;
const RIGHT = 192;
const BOTTOM = 280;
const LINE_FACTOR = 1.25;
const PT_TO_MM = 25.4 / 72;

function lineHeight(size) {
  return size * LINE_FACTOR * PT_TO_MM;
}

export function drawInvoicePdf(JsPDF, { invoice, order, store, logo }) {
  const doc = new JsPDF({ unit: "mm", format: "a4" });
  doc.setLineHeightFactor(LINE_FACTOR);
  doc.setProperties({ title: `${invoice.code} ${store.storeName}` });

  const text = (value, x, y, { size = 10, color = INK, bold = false, align = "left", width } = {}) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = width ? doc.splitTextToSize(pdfText(value), width) : [pdfText(value)];
    doc.text(lines, x, y, { align });
    return lines.length * lineHeight(size);
  };
  const measure = (value, size, width, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    return doc.splitTextToSize(pdfText(value), width).length * lineHeight(size);
  };
  const rule = (y, color = LINE, width = 0.25, from = LEFT) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(width);
    doc.line(from, y, RIGHT, y);
  };

  // Kop
  let brandX = LEFT;
  if (logo) {
    doc.addImage(logo, "JPEG", LEFT, 14, 16, 16);
    brandX = LEFT + 20;
  }
  text(store.storeName, brandX, 20, { size: 15, color: BRAND, bold: true });
  const contact = [
    store.siteUrl ? store.siteUrl.replace(/^https?:\/\//, "") : "",
    store.whatsappNumber ? `WhatsApp ${displayPhone(store.whatsappNumber)}` : "",
  ].filter(Boolean);
  contact.forEach((line, index) => text(line, brandX, 25 + index * 4, { size: 8.5, color: MUTED }));
  text("INVOICE", RIGHT, 21, { size: 20, color: BRAND, bold: true, align: "right" });
  text(invoice.code, RIGHT, 27, { size: 10, color: MUTED, align: "right" });
  rule(34, BRAND, 0.6);

  // Pembeli dan keterangan
  let left = 42;
  text("Kepada", LEFT, left, { size: 8.5, color: MUTED });
  left += 5;
  left += text(order.customer_name, LEFT, left, { size: 11, bold: true, width: 100 });
  left += text(displayPhone(order.customer_phone), LEFT, left, { size: 10 });
  const place = order.fulfillment === "antar" ? `Diantar ke ${order.address}` : "Diambil sendiri (pickup)";
  left += text(place, LEFT, left, { size: 10, width: 100 });

  const meta = [
    ["Tanggal", formatDay(invoice.created_at)],
    ["Pesanan", order.code],
    ...(order.requested_at ? [["Jadwal", formatDate(order.requested_at)]] : []),
  ];
  let right = 42;
  meta.forEach(([label, value]) => {
    text(label, 128, right, { size: 9, color: MUTED });
    text(value, 148, right, { size: 10 });
    right += 5;
  });
  text("Status", 128, right, { size: 9, color: MUTED });
  const stamp = INVOICE_STAMP[invoice.status];
  const stampColor = STAMP_COLOR[invoice.status];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  const stampWidth = doc.getTextWidth(stamp) + 5;
  doc.setDrawColor(...stampColor);
  doc.setLineWidth(0.35);
  doc.roundedRect(147, right - 3.6, stampWidth, 5.2, 1.2, 1.2, "S");
  text(stamp, 149.5, right, { size: 9.5, color: stampColor, bold: true });
  right += 5;

  let y = Math.max(left, right) + 6;
  const newPage = () => {
    doc.addPage();
    text(`${invoice.code} (lanjutan)`, RIGHT, 12, { size: 8.5, color: MUTED, align: "right" });
    y = 22;
  };
  const ensure = (height) => {
    if (y + height > BOTTOM) newPage();
  };

  // Tabel item
  const COL_QTY = 124;
  const COL_PRICE = 156;
  const ITEM_WIDTH = 92;
  const header = () => {
    text("Item", LEFT, y, { size: 8.5, color: MUTED, bold: true });
    text("Jml", COL_QTY, y, { size: 8.5, color: MUTED, bold: true, align: "right" });
    text("Harga", COL_PRICE, y, { size: 8.5, color: MUTED, bold: true, align: "right" });
    text("Jumlah", RIGHT, y, { size: 8.5, color: MUTED, bold: true, align: "right" });
    y += 2.5;
    rule(y);
    y += 5;
  };
  header();
  invoice.lines.forEach((line) => {
    const height = measure(line.name, 10, ITEM_WIDTH);
    if (y + height > BOTTOM) {
      newPage();
      header();
    }
    text(line.name, LEFT, y, { size: 10, width: ITEM_WIDTH });
    text(String(line.quantity), COL_QTY, y, { size: 10, align: "right" });
    text(formatRp(line.unit_price), COL_PRICE, y, { size: 10, align: "right" });
    text(formatRp(line.quantity * line.unit_price), RIGHT, y, { size: 10, align: "right" });
    y += height - lineHeight(10) + 2.5;
    rule(y);
    y += 5;
  });

  // Jumlah
  ensure(24);
  const sum = (label, amount) => {
    text(label, COL_PRICE, y, { size: 10, color: MUTED, align: "right" });
    text(formatRp(amount), RIGHT, y, { size: 10, align: "right" });
    y += 5;
  };
  sum("Subtotal", invoice.subtotal);
  if (invoice.shipping_fee) sum("Ongkir", invoice.shipping_fee);
  y -= 1.5;
  rule(y, INK, 0.5, 110);
  y += 6;
  text("Total", COL_PRICE, y, { size: 12, bold: true, align: "right" });
  text(formatRp(invoice.total), RIGHT, y, { size: 12, bold: true, align: "right" });
  y += 10;

  // Cara bayar
  const boxWidth = RIGHT - LEFT;
  const instructionsHeight = invoice.instructions ? measure(invoice.instructions, 10, boxWidth - 10) : 0;
  const boxHeight = 15 + instructionsHeight;
  ensure(boxHeight + 16);
  doc.setFillColor(...PAPER);
  doc.roundedRect(LEFT, y, boxWidth, boxHeight, 2, 2, "F");
  text("Cara bayar", LEFT + 5, y + 5.5, { size: 8.5, color: MUTED });
  text(METHOD_LABEL[invoice.method], LEFT + 5, y + 10.5, { size: 10.5, bold: true });
  if (invoice.instructions) {
    text(invoice.instructions, LEFT + 5, y + 15.5, { size: 10, width: boxWidth - 10 });
  }
  y += boxHeight + 8;

  if (invoice.status === "lunas") {
    const paid = `Diterima ${formatRp(invoice.paid_amount)} pada ${formatDay(invoice.paid_at)}. Terima kasih!`;
    y += text(paid, LEFT, y, { size: 10, color: STAMP_COLOR.lunas, bold: true, width: boxWidth }) + 3;
  }
  text(`Terima kasih sudah memesan di ${store.storeName}.`, 105, y, { size: 9, color: MUTED, align: "center" });

  return doc;
}

let libraryPromise = null;
let logoPromise = null;

// Logo dijadikan JPEG berlatar putih: halaman PDF memang putih, dan JPEG tidak
// perlu diurai ulang seperti PNG transparan.
function loadLogo() {
  logoPromise ??= new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 192;
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, 192, 192);
      context.drawImage(image, 0, 0, 192, 192);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    image.onerror = () => resolve(null);
    image.src = "/assets/logo-cabai.png";
  });
  return logoPromise;
}

export async function invoicePdfFile(invoice, order, store) {
  libraryPromise ??= import(JSPDF_URL).catch((error) => {
    libraryPromise = null;
    throw error;
  });
  const [{ jsPDF }, logo] = await Promise.all([libraryPromise, loadLogo()]);
  const doc = drawInvoicePdf(jsPDF, { invoice, order, store, logo });
  return new File([doc.output("blob")], `${invoice.code} ${store.storeName}.pdf`, { type: "application/pdf" });
}
