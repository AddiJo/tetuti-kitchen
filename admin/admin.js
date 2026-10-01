import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config.js";
import {
  currentPasswordErrorMessage,
  displayPhone,
  errorMessage,
  esc,
  formatDate,
  formatDay,
  formatRp,
  fromJakartaInput,
  invoiceCaption,
  invoiceLinkMessage,
  INVOICE_STAMP,
  INVOICE_STATUS_LABEL,
  invoiceLines,
  invoiceMessage,
  isValidPhone,
  loginErrorMessage,
  menuImageSrc,
  METHOD_LABEL,
  normalizePhone,
  parseRupiah,
  PASSWORD_MAX,
  PASSWORD_MIN,
  passwordChangeProblem,
  passwordErrorMessage,
  priceLabel,
  randomPassword,
  toJakartaInput,
  uniqueSlug,
  waLink,
} from "./lib.js";
import { invoicePdfFile } from "./invoice-pdf.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Paket gratis Supabase tidak punya batas sesi, jadi batas 12 jam tidak
// dipakai dijalankan di sini.
const IDLE_LIMIT_MS = 12 * 60 * 60 * 1000;
const LAST_ACTIVE_KEY = "tetuti-admin-last-active";
const SOUND_KEY = "tetuti-admin-sound";
const IDLE_MESSAGE = "Sesi habis karena 12 jam tidak dipakai. Silakan masuk lagi.";
const REVOKED_MESSAGE = "Sesi di perangkat ini sudah diakhiri, misalnya karena sandi diganti. Silakan masuk lagi.";

const FLOW = ["baru", "dikonfirmasi", "diproses", "selesai"];
const STATUS_LABEL = {
  baru: "Baru",
  dikonfirmasi: "Dikonfirmasi",
  diproses: "Diproses",
  selesai: "Selesai",
  batal: "Batal",
};
const NEXT_LABEL = {
  baru: "Konfirmasi pesanan",
  dikonfirmasi: "Tandai Diproses",
  diproses: "Tandai Selesai",
};
const TABS = [
  { id: "semua", label: "Semua", hint: "Semua pesanan, yang terbaru di atas." },
  {
    id: "baru",
    label: "Baru",
    hint: "Pesanan masuk. Hubungi pembeli untuk menyepakati harga, ongkir, dan jadwal, lalu konfirmasi.",
  },
  { id: "dikonfirmasi", label: "Dikonfirmasi", hint: "Sudah disepakati. Tandai Diproses saat mulai dibuat." },
  {
    id: "diproses",
    label: "Diproses",
    hint: "Sedang dibuat atau menunggu diantar/diambil. Tandai Selesai setelah sampai ke pembeli.",
  },
  { id: "selesai", label: "Selesai", hint: "Pesanan sudah diterima pembeli." },
  { id: "batal", label: "Dibatalkan", hint: "Pesanan yang dibatalkan, beserta alasannya." },
];
// Hanya status yang masih perlu dikerjakan diberi angka, seperti tab marketplace.
const COUNTED = ["baru", "dikonfirmasi", "diproses"];

const app = document.getElementById("app");
const topbar = document.getElementById("topbar");
const toastEl = document.getElementById("toast");
const cancelDialog = document.getElementById("cancel-dialog");
const paidDialog = document.getElementById("paid-dialog");
const soundToggle = document.getElementById("sound-toggle");
const menuToggle = document.getElementById("menu-toggle");
const navMenu = document.getElementById("nav-menu");

const BASE_TITLE = document.title;

const state = {
  signedIn: false,
  // Pesanan situs yang belum dibuka admin, dan yang sudah pernah terlihat
  // supaya bunyi hanya untuk yang benar-benar baru.
  unseen: 0,
  knownIds: null,
  menu: [],
  filter: "semua",
  search: "",
  flash: null,
  cancelOrderId: null,
  paidInvoice: null,
  // Browser memakai judul halaman sebagai nama file saat Simpan sebagai PDF.
  printTitle: null,
};

// Setiap render menaikkan nomor ini; hasil fetch yang datang setelah pindah
// halaman dibuang supaya tidak menimpa halaman yang sedang dibuka.
let renderSeq = 0;
let listSeq = 0;
let lastMark = 0;
let toastTimer = 0;
let audioCtx = null;
let soundOn = localStorage.getItem(SOUND_KEY) !== "off";
let ordersChannel = null;
let pollTimer = 0;
let checkSeq = 0;

// Umum ----------------------------------------------------------------------

function showError(el, text) {
  el.textContent = text;
  el.hidden = false;
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function toast(text) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 2600);
}

function setMenu(open) {
  navMenu.hidden = !open;
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Tutup menu" : "Buka menu");
}

function flashHtml() {
  const flash = state.flash;
  state.flash = null;
  return flash ? `<p class="notice ${flash.tone}">${esc(flash.text)}</p>` : "";
}

function renderProblem(text, href = "#/") {
  app.innerHTML = `
    <section class="page">
      <p class="notice error">${esc(text)}</p>
      <a class="btn full" href="${esc(href)}">Kembali</a>
    </section>`;
}

function statusPill(status) {
  return `<span class="status s-${status}">${STATUS_LABEL[status]}</span>`;
}

// Sesi -----------------------------------------------------------------------

function markActive() {
  lastMark = Date.now();
  localStorage.setItem(LAST_ACTIVE_KEY, String(lastMark));
}

function idleExpired() {
  const last = Number(localStorage.getItem(LAST_ACTIVE_KEY));
  return last > 0 && Date.now() - last > IDLE_LIMIT_MS;
}

function checkIdle() {
  if (state.signedIn && idleExpired()) signOut(IDLE_MESSAGE);
}

function noteActivity() {
  if (!state.signedIn) return;
  if (idleExpired()) return checkIdle();
  if (Date.now() - lastMark > 60_000) markActive();
}

async function confirmAdmin() {
  const { data, error } = await supabase.rpc("is_admin");
  if (error || data !== true) {
    await supabase.auth.signOut({ scope: "local" });
    return error ? errorMessage(error) : "Akun ini tidak punya akses admin.";
  }
  return true;
}

async function loadMenu() {
  const { data, error } = await supabase
    .from("menu_items")
    .select("id, name, category, is_active, price, unit, sort_order, badge, hook, description, highlights, image_url")
    .order("sort_order")
    .order("name");
  if (error) toast(`Menu gagal dimuat. ${errorMessage(error)}`);
  else state.menu = data;
  return error;
}

async function enterAdmin() {
  state.signedIn = true;
  topbar.hidden = false;
  await loadMenu();
  route();
  startWatching();
  cleanupExpiredPdfs();
}

// Pesanan baru -----------------------------------------------------------------

// Browser baru mengizinkan bunyi setelah halaman disentuh, jadi AudioContext
// dibuat atau dilanjutkan dari klik/ketukan pertama.
async function unlockSound() {
  if (!audioCtx) {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    audioCtx = new Context();
    audioCtx.addEventListener("statechange", syncBell);
  }
  if (audioCtx.state === "suspended") await audioCtx.resume().catch(() => {});
  syncBell();
}

function soundLocked() {
  const supported = Boolean(window.AudioContext || window.webkitAudioContext);
  return soundOn && supported && audioCtx?.state !== "running";
}

function syncBell() {
  const locked = soundLocked();
  const label = locked
    ? "Ketuk untuk menyalakan bunyi pesanan baru"
    : soundOn
      ? "Matikan bunyi pesanan baru"
      : "Nyalakan bunyi pesanan baru";
  soundToggle.classList.toggle("is-muted", !soundOn);
  soundToggle.classList.toggle("is-locked", locked);
  soundToggle.setAttribute("aria-label", label);
  soundToggle.title = label;
}

function playChime() {
  if (!soundOn) return;
  if (audioCtx?.state === "running") {
    const start = audioCtx.currentTime;
    [0, 0.18, 0.5, 0.68].forEach((offset, index) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = index % 2 ? 1320 : 880;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.3, start + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.16);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(start + offset);
      osc.stop(start + offset + 0.18);
    });
  }
  navigator.vibrate?.([200, 100, 200]);
}

function syncTitle() {
  document.title = state.unseen ? `(${state.unseen}) ${BASE_TITLE}` : BASE_TITLE;
}

async function checkNewOrders() {
  if (!state.signedIn) return;
  const mine = ++checkSeq;
  const { data, error } = await supabase
    .from("orders")
    .select("id, customer_name")
    .eq("source", "situs")
    .is("seen_at", null)
    .not("status", "in", "(selesai,batal)")
    .order("created_at", { ascending: false })
    .limit(50);
  if (mine !== checkSeq || error || !state.signedIn) return;

  const fresh = state.knownIds ? data.filter((order) => !state.knownIds.has(order.id)) : [];
  state.knownIds = new Set([...(state.knownIds ?? []), ...data.map((order) => order.id)]);
  state.unseen = data.length;
  syncTitle();

  if (fresh.length) {
    playChime();
    toast(fresh.length === 1 ? `Pesanan baru dari ${fresh[0].customer_name}` : `${fresh.length} pesanan baru masuk`);
    const path = location.hash.replace(/^#/, "") || "/";
    if (path === "/") loadOrders(renderSeq);
  }
}

// Realtime memberi kabar seketika; pemeriksaan berkala menutup celah saat
// sambungan putus atau tab sempat tertidur.
function startWatching() {
  stopWatching();
  checkNewOrders();
  pollTimer = setInterval(checkNewOrders, 60_000);
  ordersChannel = supabase
    .channel("pesanan-baru")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, () => checkNewOrders())
    .subscribe();
}

function stopWatching() {
  clearInterval(pollTimer);
  if (ordersChannel) {
    supabase.removeChannel(ordersChannel);
    ordersChannel = null;
  }
  state.knownIds = null;
  state.unseen = 0;
  syncTitle();
}

async function signOut(notice) {
  state.signedIn = false;
  localStorage.removeItem(LAST_ACTIVE_KEY);
  await supabase.auth.signOut({ scope: "local" });
  renderLogin(notice);
}

function renderLogin(notice) {
  state.signedIn = false;
  stopWatching();
  setMenu(false);
  topbar.hidden = true;
  renderSeq += 1;
  app.innerHTML = `
    <section class="page login">
      <h1>Admin Tetuti Kitchen</h1>
      ${notice ? `<p class="notice">${esc(notice)}</p>` : ""}
      <form id="login-form" class="stack" novalidate>
        <label class="field">
          <span>Email</span>
          <input type="email" name="email" autocomplete="username" required />
        </label>
        <label class="field">
          <span>Sandi</span>
          <input type="password" name="password" autocomplete="current-password" required />
        </label>
        <p class="error" data-error hidden></p>
        <button class="btn primary full" type="submit">Masuk</button>
      </form>
    </section>`;

  const form = app.querySelector("#login-form");
  const errorEl = form.querySelector("[data-error]");
  const button = form.querySelector("button");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    if (!email || !password) return showError(errorEl, "Isi email dan sandi.");

    button.disabled = true;
    button.textContent = "Masuk…";
    const reset = (text) => {
      button.disabled = false;
      button.textContent = "Masuk";
      showError(errorEl, text);
    };

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return reset(loginErrorMessage(error));

    const access = await confirmAdmin();
    if (access !== true) return reset(access);

    markActive();
    await enterAdmin();
  });
}

// Daftar pesanan -------------------------------------------------------------

function renderList() {
  const seq = ++renderSeq;
  app.innerHTML = `
    <section class="page has-actions">
      ${flashHtml()}
      <h1>Pesanan</h1>
      <input class="input" type="search" data-search placeholder="Cari nama atau kode"
        aria-label="Cari nama atau kode pesanan" value="${esc(state.search)}" />
      <div class="tabs" role="tablist" aria-label="Status pesanan">
        ${TABS.map(
          (tab) => `<button type="button" class="tab" role="tab" data-filter="${tab.id}"
            aria-selected="${tab.id === state.filter}">${tab.label}<span class="count" data-count="${tab.id}"></span></button>`
        ).join("")}
      </div>
      <p class="small muted" data-tab-hint></p>
      <div class="list" data-list><p class="muted">Memuat…</p></div>
      <div class="sticky-actions">
        <a class="btn primary full" href="#/baru">+ Catat pesanan</a>
      </div>
    </section>`;
  let searchTimer = 0;
  app.querySelector("[data-search]").addEventListener("input", (event) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = event.target.value;
      loadOrders(seq);
    }, 300);
  });

  const hintEl = app.querySelector("[data-tab-hint]");
  const selectTab = (tabEl) => {
    app.querySelectorAll("[data-filter]").forEach((other) => {
      other.setAttribute("aria-selected", String(other === tabEl));
    });
    hintEl.textContent = TABS.find((tab) => tab.id === state.filter).hint;
    tabEl.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  app.querySelectorAll("[data-filter]").forEach((tabEl) => {
    tabEl.addEventListener("click", () => {
      state.filter = tabEl.dataset.filter;
      selectTab(tabEl);
      loadOrders(seq);
    });
  });

  selectTab(app.querySelector(`[data-filter="${state.filter}"]`));
  loadOrders(seq);
}

async function loadCounts(seq) {
  const { data, error } = await supabase.from("orders").select("status").in("status", COUNTED).limit(1000);
  if (seq !== renderSeq || error) return;
  const counts = Object.fromEntries(COUNTED.map((status) => [status, 0]));
  data.forEach((row) => {
    counts[row.status] += 1;
  });
  app.querySelectorAll("[data-count]").forEach((el) => {
    const count = counts[el.dataset.count];
    el.textContent = count ? ` (${count})` : "";
  });
}

async function loadOrders(seq) {
  const mine = ++listSeq;
  let query = supabase
    .from("order_summaries")
    .select("id, code, source, seen_at, customer_name, fulfillment, requested_at, status, item_count, items_label, total")
    .order("created_at", { ascending: false })
    .limit(100);

  if (state.filter !== "semua") query = query.eq("status", state.filter);
  loadCounts(seq);

  // Karakter ini punya arti khusus di filter PostgREST.
  const term = state.search.replace(/[,()*%"\\]/g, " ").trim();
  if (term) query = query.or(`customer_name.ilike."*${term}*",code.ilike."*${term}*"`);

  const { data, error } = await query;
  if (seq !== renderSeq || mine !== listSeq) return;

  const listEl = app.querySelector("[data-list]");
  if (error) {
    listEl.innerHTML = `<p class="notice error">${esc(errorMessage(error))}</p>`;
    return;
  }
  if (data.length === 0) {
    listEl.innerHTML = `<p class="empty">${
      term
        ? "Tidak ada pesanan yang cocok."
        : state.filter === "semua"
          ? "Belum ada pesanan. Pesanan dari situs muncul di sini; pesanan dari chat bisa dicatat lewat tombol di bawah."
          : `Tidak ada pesanan di tab ${TABS.find((tab) => tab.id === state.filter).label}.`
    }</p>`;
    return;
  }

  const { data: bills } = await supabase
    .from("invoices")
    .select("order_id, status")
    .in("order_id", data.map((order) => order.id))
    .in("status", ["terkirim", "lunas"]);
  if (seq !== renderSeq || mine !== listSeq) return;
  const billStatus = new Map((bills ?? []).map((bill) => [bill.order_id, bill.status]));

  listEl.innerHTML = data.map((order) => orderCard(order, billStatus.get(order.id))).join("");
}

function orderCard(order, bill) {
  const details = [
    order.items_label || "Belum ada item",
    order.fulfillment === "antar" ? "Antar" : "Pickup",
    order.requested_at ? formatDate(order.requested_at) : "",
  ].filter(Boolean);

  const total =
    order.total != null
      ? `<strong>${formatRp(order.total)}</strong>`
      : `<span class="muted">${order.item_count ? "Harga belum lengkap" : "Belum ada item"}</span>`;

  const unseen = order.source === "situs" && !order.seen_at && !["selesai", "batal"].includes(order.status);
  return `
    <a class="order${unseen ? " unseen" : ""}" href="#/pesanan/${esc(order.id)}">
      <span class="row between">
        <span class="row"><strong>${esc(order.customer_name)}</strong>${unseen ? `<span class="tag new">Baru masuk</span>` : ""}</span>
        ${statusPill(order.status)}
      </span>
      <span class="small">${esc(details.join(" · "))}</span>
      <span class="row between small">
        <span class="row"><span class="code">${esc(order.code)}</span>${order.source === "situs" ? `<span class="tag">Situs</span>` : ""}${
          bill === "lunas"
            ? `<span class="tag paid">Lunas</span>`
            : bill === "terkirim"
              ? `<span class="tag unpaid">Belum bayar</span>`
              : ""
        }</span>
        ${total}
      </span>
    </a>`;
}

// Detail pesanan -------------------------------------------------------------

async function fetchOrder(id) {
  const result = await supabase
    .from("orders")
    .select("*, order_items(id, menu_item_id, name, quantity, unit_price, created_at)")
    .eq("id", id)
    .maybeSingle();
  if (result.data) {
    // Urutan sama dengan salinan item di tagihan (created_at, lalu id).
    const key = (item) => [item.created_at, item.id];
    result.data.order_items.sort((a, b) => {
      const [x, y] = [key(a), key(b)];
      return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0;
    });
  }
  return result;
}

async function renderDetail(id) {
  const seq = ++renderSeq;
  app.innerHTML = `<p class="page muted">Memuat…</p>`;
  const [{ data: order, error }, { data: invoices, error: invoiceError }] = await Promise.all([
    fetchOrder(id),
    fetchInvoices(id),
  ]);
  if (seq !== renderSeq) return;
  if (error) return renderProblem(errorMessage(error));
  if (!order) return renderProblem("Pesanan tidak ditemukan.");

  const items = order.order_items;
  const pos = FLOW.indexOf(order.status);
  const locked = order.status === "selesai" || order.status === "batal";
  const unpriced = items.some((item) => item.unit_price == null);
  const subtotal = items.reduce((sum, item) => sum + (item.unit_price ?? 0) * item.quantity, 0);
  const total = items.length && !unpriced ? subtotal + order.shipping_fee : null;

  const place =
    order.fulfillment === "antar" ? `Antar · ${esc(order.address)}` : "Pickup";
  const when = order.requested_at ? ` · ${esc(formatDate(order.requested_at))}` : "";

  app.innerHTML = `
    <section class="page has-actions">
      <div class="row between">
        <a class="back" href="#/">‹ Pesanan</a>
        ${locked ? "" : `<a class="back" href="#/pesanan/${esc(order.id)}/ubah">Ubah</a>`}
      </div>
      ${flashHtml()}
      <div class="row between">
        <h1 class="code">${esc(order.code)}</h1>
        ${statusPill(order.status)}
      </div>
      ${
        order.status === "batal"
          ? `<p class="notice">Dibatalkan: ${esc(order.cancel_reason)}</p>`
          : progressHtml(pos)
      }
      <div class="card">
        <strong>${esc(order.customer_name)}</strong>
        <span>${esc(displayPhone(order.customer_phone))} ·
          <a href="https://wa.me/${esc(order.customer_phone)}" target="_blank" rel="noopener">Buka WhatsApp</a></span>
        <span class="muted">${place}${when}</span>
      </div>
      <div class="card">
        ${
          items.length
            ? items.map(itemLine).join("")
            : `<p class="muted">Belum ada item. Buka Ubah untuk menambahkan.</p>`
        }
        ${
          order.fulfillment === "antar" || order.shipping_fee
            ? `<div class="line muted"><span>Ongkir</span><span>${formatRp(order.shipping_fee)}</span></div>`
            : ""
        }
        <div class="line total">
          <span>Total</span>
          <span>${total == null ? "Lengkapi harga dulu" : formatRp(total)}</span>
        </div>
      </div>
      ${
        invoiceError
          ? `<p class="notice error">Tagihan gagal dimuat. ${esc(errorMessage(invoiceError))}</p>`
          : invoiceSection(order, invoices, total)
      }
      ${
        order.note
          ? `<div class="card"><span class="label">Catatan</span><p class="note">${esc(order.note)}</p></div>`
          : ""
      }
      <p class="small muted">
        ${order.source === "situs" ? "Masuk dari situs" : "Dicatat admin"} ${esc(formatDate(order.created_at))} · status terakhir ${esc(formatDate(order.status_changed_at))}
      </p>
      <p class="error" data-error hidden></p>
      <div class="sticky-actions">${actionsHtml(order, pos)}</div>
    </section>`;

  const errorEl = app.querySelector("[data-error]");

  if (order.source === "situs" && !order.seen_at) {
    supabase
      .from("orders")
      .update({ seen_at: new Date().toISOString() })
      .eq("id", order.id)
      .is("seen_at", null)
      .then(({ error: seenError }) => {
        if (!seenError) checkNewOrders();
      });
  }

  app.querySelectorAll("[data-status]").forEach((button) => {
    button.addEventListener("click", async () => {
      const next = button.dataset.status;
      if (button.dataset.confirm && !window.confirm(button.dataset.confirm)) return;
      if (next === "dikonfirmasi" && items.length === 0) {
        return showError(errorEl, "Tambahkan minimal satu item sebelum mengonfirmasi pesanan.");
      }
      if (next === "dikonfirmasi" && unpriced) {
        return showError(errorEl, "Isi harga semua item dulu lewat Ubah, baru konfirmasi pesanan.");
      }
      await changeStatus(order.id, { status: next }, errorEl);
    });
  });

  if (!invoiceError) bindInvoiceActions(order, invoices, errorEl);

  const cancelButton = app.querySelector("[data-cancel]");
  if (cancelButton) {
    cancelButton.addEventListener("click", () => {
      state.cancelOrderId = order.id;
      const form = cancelDialog.querySelector("form");
      form.reset();
      form.querySelector("[data-error]").hidden = true;
      cancelDialog.showModal();
    });
  }
}

function progressHtml(pos) {
  return `
    <div class="steps" aria-label="Tahap ${pos + 1} dari ${FLOW.length}">
      ${FLOW.map((status, index) => `<span class="${index <= pos ? "done" : ""}"></span>`).join("")}
    </div>
    <div class="step-labels">
      <span>Baru</span><span>Konfirmasi</span><span>Proses</span><span>Selesai</span>
    </div>`;
}

function itemLine(item) {
  const price =
    item.unit_price == null
      ? `<em class="muted">Harga belum diisi</em>`
      : formatRp(item.unit_price * item.quantity);
  const unit = item.unit_price == null ? "" : ` <small class="muted">@ ${formatRp(item.unit_price)}</small>`;
  return `<div class="line"><span>${item.quantity}× ${esc(item.name)}${unit}</span><span>${price}</span></div>`;
}

function actionsHtml(order, pos) {
  if (order.status === "selesai") {
    return `<button class="btn full" type="button" data-status="diproses"
      data-confirm="Buka kembali pesanan ini ke status Diproses?">Buka kembali</button>`;
  }
  if (order.status === "batal") {
    return `<button class="btn full" type="button" data-status="baru"
      data-confirm="Buka kembali pesanan ini ke status Baru?">Buka kembali</button>`;
  }
  const prev = FLOW[pos - 1];
  const next = FLOW[pos + 1];
  return `
    <div class="row">
      ${prev ? `<button class="btn" type="button" data-status="${prev}">‹ ${STATUS_LABEL[prev]}</button>` : ""}
      <button class="btn primary full" type="button" data-status="${next}">${NEXT_LABEL[order.status]}</button>
    </div>
    <button class="btn ghost full" type="button" data-cancel>Batalkan pesanan…</button>`;
}

async function changeStatus(id, changes, errorEl) {
  app.querySelectorAll(".sticky-actions button").forEach((button) => {
    button.disabled = true;
  });
  const { error } = await supabase.from("orders").update(changes).eq("id", id);
  if (error) {
    app.querySelectorAll(".sticky-actions button").forEach((button) => {
      button.disabled = false;
    });
    showError(errorEl, errorMessage(error));
    return false;
  }
  toast(`Status: ${STATUS_LABEL[changes.status]}`);
  await renderDetail(id);
  return true;
}

cancelDialog.querySelector("form").addEventListener("submit", async (event) => {
  if (event.submitter?.value !== "confirm") return;
  event.preventDefault();
  const form = event.currentTarget;
  const errorEl = form.querySelector("[data-error]");
  const reason = form.elements.reason.value.trim();
  if (!reason) return showError(errorEl, "Alasan batal wajib diisi.");

  event.submitter.disabled = true;
  const { error } = await supabase
    .from("orders")
    .update({ status: "batal", cancel_reason: reason })
    .eq("id", state.cancelOrderId);
  event.submitter.disabled = false;
  if (error) return showError(errorEl, errorMessage(error));

  cancelDialog.close();
  toast("Pesanan dibatalkan");
  refreshSentPdfs("order_id", state.cancelOrderId);
  renderDetail(state.cancelOrderId);
});

// Tagihan --------------------------------------------------------------------

const INVOICE_ELIGIBLE = ["dikonfirmasi", "diproses", "selesai"];
const PDF_LABEL = { draft: "Kirim PDF ke WhatsApp", terkirim: "Kirim ulang PDF", lunas: "Kirim PDF lunas" };
const DEFAULT_INSTRUCTIONS = { transfer: "BRI 440701021532539 a.n. Sugiastuti" };
const INSTRUCTION_HINT = {
  transfer: DEFAULT_INSTRUCTIONS.transfer,
  qris: "Kode QRIS kami kirim di chat ini.",
  tunai: "Dibayar saat pickup atau saat diantar.",
};

function fetchInvoices(orderId) {
  return supabase
    .from("invoices")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
}

function invoicePill(status) {
  return `<span class="status i-${status}">${INVOICE_STATUS_LABEL[status]}</span>`;
}

function orderTotal(order) {
  const items = order.order_items;
  if (items.length === 0 || items.some((item) => item.unit_price == null)) return null;
  return items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0) + order.shipping_fee;
}

// Tagihan menyimpan salinan isi pesanan. Kalau pesanan diubah sesudahnya,
// admin diminta membuat ulang tagihan supaya pembeli tidak menerima angka lama.
function invoiceOutdated(invoice, order) {
  return (
    invoice.shipping_fee !== order.shipping_fee ||
    JSON.stringify(invoice.lines) !== JSON.stringify(invoiceLines(order.order_items))
  );
}

function invoiceSection(order, invoices, total) {
  const active = invoices.find((invoice) => invoice.status !== "batal");
  const cancelled = invoices.filter((invoice) => invoice.status === "batal");
  const eligible = INVOICE_ELIGIBLE.includes(order.status);
  if (!active && !cancelled.length && order.status === "batal") return "";

  let body;
  if (active) {
    body = activeInvoiceHtml(active, order, total);
  } else if (!eligible) {
    body = `<p class="small muted">Konfirmasi pesanan dulu, baru tagihan bisa dibuat.</p>`;
  } else {
    body = `
      <p class="small muted">Belum ada tagihan. Tagihan berisi item, ongkir, total, dan cara bayar,
        lalu dikirim ke WhatsApp pembeli.</p>
      <a class="btn primary" href="#/pesanan/${esc(order.id)}/tagihan">Buat tagihan</a>`;
  }

  const history = cancelled.length
    ? `<p class="small muted">Tagihan dibatalkan: ${cancelled
        .map((invoice) => `<a href="#/tagihan/${esc(invoice.id)}">${esc(invoice.code)}</a>`)
        .join(", ")}</p>`
    : "";

  return `
    <div class="card invoice">
      <div class="row between">
        <span class="label">Tagihan</span>
        ${active ? invoicePill(active.status) : ""}
      </div>
      ${body}
      ${history}
    </div>`;
}

function activeInvoiceHtml(invoice, order, total) {
  const outdated =
    invoice.status !== "lunas" && invoiceOutdated(invoice, order)
      ? `<p class="notice">Isi pesanan berubah sejak tagihan dibuat${
          total == null ? "" : ` (total sekarang ${esc(formatRp(total))})`
        }. Buat ulang supaya pembeli menerima angka terbaru.</p>
        <button class="btn" type="button" data-invoice-redo>Buat ulang tagihan</button>`
      : "";

  const cancel = `<button class="btn ghost" type="button" data-invoice-cancel>Batalkan tagihan</button>`;
  let meta;
  let actions;
  let more;
  if (invoice.status === "draft") {
    meta = "Belum dikirim ke pembeli.";
    actions = `
      <button class="btn primary" type="button" data-invoice-pdf>${PDF_LABEL.draft}</button>
      <button class="btn" type="button" data-invoice-paid>Tandai lunas</button>`;
    more = `<a class="btn" href="#/pesanan/${esc(order.id)}/tagihan">Ubah</a>${cancel}`;
  } else if (invoice.status === "terkirim") {
    meta = `Dikirim ${esc(formatDate(invoice.sent_at))}. Menunggu pembayaran.`;
    actions = `
      <button class="btn primary" type="button" data-invoice-paid>Tandai lunas</button>
      <button class="btn" type="button" data-invoice-pdf>${PDF_LABEL.terkirim}</button>`;
    more = cancel;
  } else {
    const differs = invoice.paid_amount !== invoice.total ? ` dari tagihan ${esc(formatRp(invoice.total))}` : "";
    meta = `Diterima ${esc(formatRp(invoice.paid_amount))}${differs} · ${esc(formatDate(invoice.paid_at))}.`;
    actions = `<button class="btn" type="button" data-invoice-pdf>${PDF_LABEL.lunas}</button>`;
    more = `<button class="btn ghost" type="button" data-invoice-unpay>Batalkan lunas…</button>`;
  }

  return `
    <div class="line"><a class="code" href="#/tagihan/${esc(invoice.id)}" title="Lihat invoice">${esc(
      invoice.code
    )}</a><strong>${esc(formatRp(invoice.total))}</strong></div>
    <span class="small">${esc(METHOD_LABEL[invoice.method])}${
      invoice.instructions ? ` · ${esc(invoice.instructions)}` : ""
    }</span>
    <span class="small muted">${meta}${
      invoice.pdf_path
        ? ` · <a href="${esc(pdfLink(invoice.pdf_path))}" target="_blank" rel="noopener">Buka PDF</a>`
        : ""
    }</span>
    ${outdated}
    <div class="invoice-actions">${actions}</div>
    <details class="invoice-more">
      <summary>Lainnya</summary>
      <div class="invoice-actions">${more}</div>
    </details>`;
}

async function updateInvoice(invoiceId, changes, errorEl) {
  const { error } = await supabase.from("invoices").update(changes).eq("id", invoiceId);
  if (error) showError(errorEl, errorMessage(error));
  return !error;
}

const pdfCache = new Map();

// PDF disiapkan begitu halaman tampil. Safari hanya mengizinkan menu Bagikan
// sesaat setelah tombol diketuk, jadi file harus sudah jadi saat itu.
function invoicePdf(invoice, order) {
  const key = `${invoice.id}:${invoice.updated_at}`;
  if (!pdfCache.has(key)) {
    const store = window.TETUTI ?? { storeName: "Tetuti Kitchen" };
    const file = invoicePdfFile(invoice, order, store).catch((error) => {
      pdfCache.delete(key);
      throw error;
    });
    pdfCache.set(key, file);
  }
  return pdfCache.get(key);
}

const PDF_BUCKET = "invoice-pdf";
const INVOICE_WITH_ORDER = "*, orders(code, customer_name, customer_phone, fulfillment, address, requested_at)";

function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function pdfLink(path) {
  return `${window.TETUTI?.siteUrl ?? location.origin}/i/${path}`;
}

async function uploadInvoicePdf(invoice, order, path) {
  const file = await invoicePdf(invoice, order);
  const { error } = await supabase.storage
    .from(PDF_BUCKET)
    .upload(path, file, { contentType: "application/pdf", cacheControl: "60", upsert: true });
  if (error) throw error;
}

// Tautan WhatsApp ke nomor tertentu hanya bisa membawa teks, jadi PDF diunggah
// dulu dan pembeli menerima tautannya. Jendela chat dibuka saat tombol diketuk
// supaya tidak diblokir browser, lalu diarahkan setelah unggahan selesai.
// Hasil true berarti tagihan berubah dan halaman perlu dimuat ulang.
async function sendInvoiceLink(invoice, order, button, errorEl) {
  button.disabled = true;
  const chat = window.open("", "_blank");
  if (chat) {
    chat.opener = null;
    chat.document.title = "Menyiapkan invoice…";
  }
  const path = invoice.pdf_path ?? `${randomHex(16)}/${invoice.code}.pdf`;
  const changes = invoice.pdf_path ? {} : { pdf_path: path };
  if (invoice.status === "draft") changes.status = "terkirim";
  else if (invoice.status === "terkirim") changes.sent_at = new Date().toISOString();

  try {
    await uploadInvoicePdf(invoice, order, path);
    if (Object.keys(changes).length) {
      const { error } = await supabase.from("invoices").update(changes).eq("id", invoice.id);
      if (error) throw error;
    }
  } catch (error) {
    chat?.close();
    button.disabled = false;
    showError(errorEl, `Invoice gagal dikirim. ${errorMessage(error)}`);
    return false;
  }

  const url = waLink(order.customer_phone, invoiceLinkMessage(invoice, order, pdfLink(path)));
  if (chat) chat.location.href = url;
  else location.href = url;
  toast(invoice.status === "draft" ? "Invoice dikirim, tagihan ditandai terkirim" : "Invoice dikirim");
  return true;
}

// Tautan yang sudah dikirim tetap sama; isinya diperbarui supaya cap Lunas atau
// Dibatalkan juga terlihat oleh pembeli.
async function refreshSentPdfs(column, value) {
  const { data, error } = await supabase
    .from("invoices")
    .select(INVOICE_WITH_ORDER)
    .eq(column, value)
    .not("pdf_path", "is", null);
  let failed = Boolean(error);
  for (const invoice of data ?? []) {
    try {
      await uploadInvoicePdf(invoice, invoice.orders, invoice.pdf_path);
    } catch {
      failed = true;
    }
  }
  if (failed) toast("Status tersimpan, tapi PDF di tautan pembeli belum diperbarui. Kirim ulang PDF.");
}

const PDF_CLEANUP_KEY = "tetuti-admin-pdf-cleanup";
const PDF_CLEANUP_EVERY_MS = 24 * 60 * 60 * 1000;
const PDF_CLEANUP_BATCH = 100;

// Supabase menolak penghapusan file lewat SQL, jadi PDF kedaluwarsa (30 hari
// setelah pesanan Selesai atau Batal) dihapus dari sini saat dashboard dibuka.
// File dihapus dulu, baru alamatnya dikosongkan, supaya tidak ada file publik
// yang tertinggal tanpa catatan.
async function cleanupExpiredPdfs() {
  const last = Number(localStorage.getItem(PDF_CLEANUP_KEY)) || 0;
  if (Date.now() - last < PDF_CLEANUP_EVERY_MS) return;
  const { data, error } = await supabase.rpc("expired_invoice_pdfs");
  if (error) return;
  if (data.length) {
    const { error: removeError } = await supabase.storage
      .from(PDF_BUCKET)
      .remove(data.map((row) => row.pdf_path));
    if (removeError) return;
    const { error: clearError } = await supabase
      .from("invoices")
      .update({ pdf_path: null })
      .in("id", data.map((row) => row.id));
    if (clearError || data.length === PDF_CLEANUP_BATCH) return;
  }
  localStorage.setItem(PDF_CLEANUP_KEY, String(Date.now()));
}

// Menu Bagikan tidak bisa memilih nomor tujuan, jadi admin memilih chat pembeli
// sendiri. Browser tanpa berbagi file mengunduh PDF lalu membuka chat pembeli.
// Hasil true berarti status tagihan berubah dan halaman perlu dimuat ulang.
async function shareInvoicePdf(invoice, order, button, errorEl) {
  button.disabled = true;
  const caption = invoiceCaption(invoice, order);
  let shared;
  try {
    const file = await invoicePdf(invoice, order);
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text: caption });
      shared = true;
    } else {
      const url = URL.createObjectURL(file);
      Object.assign(document.createElement("a"), { href: url, download: file.name }).click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      Object.assign(document.createElement("a"), {
        href: waLink(order.customer_phone, caption),
        target: "_blank",
        rel: "noopener",
      }).click();
      shared = false;
    }
  } catch (error) {
    button.disabled = false;
    if (error.name === "AbortError") return false;
    if (error.name === "NotAllowedError") {
      showError(errorEl, "PDF sudah siap. Tekan tombolnya sekali lagi.");
    } else {
      showError(errorEl, `PDF gagal dibuat. ${errorMessage(error)}`);
    }
    return false;
  }

  const done = shared ? "PDF invoice dibagikan" : "PDF diunduh, lampirkan di chat WhatsApp pembeli";
  if (invoice.status === "lunas") {
    button.disabled = false;
    toast(done);
    return false;
  }
  const changes = invoice.status === "draft" ? { status: "terkirim" } : { sent_at: new Date().toISOString() };
  if (!(await updateInvoice(invoice.id, changes, errorEl))) {
    button.disabled = false;
    return false;
  }
  toast(invoice.status === "draft" ? `${done}. Tagihan ditandai terkirim.` : done);
  return true;
}

function bindInvoiceActions(order, invoices, errorEl) {
  const active = invoices.find((invoice) => invoice.status !== "batal");
  if (!active) return;
  const reload = () => renderDetail(order.id);

  const pdfButton = app.querySelector("[data-invoice-pdf]");
  if (pdfButton) {
    invoicePdf(active, order).catch(() => {});
    pdfButton.addEventListener("click", async () => {
      if (await sendInvoiceLink(active, order, pdfButton, errorEl)) reload();
    });
  }

  app.querySelector("[data-invoice-cancel]")?.addEventListener("click", async () => {
    if (!window.confirm(`Batalkan tagihan ${active.code}? Pesanan tidak ikut dibatalkan.`)) return;
    if (await updateInvoice(active.id, { status: "batal" }, errorEl)) {
      toast("Tagihan dibatalkan");
      refreshSentPdfs("id", active.id);
      reload();
    }
  });

  app.querySelector("[data-invoice-unpay]")?.addEventListener("click", async () => {
    if (!window.confirm(`Batalkan status lunas ${active.code}? Tagihan kembali ke Terkirim.`)) return;
    if (await updateInvoice(active.id, { status: "terkirim" }, errorEl)) {
      toast("Status lunas dibatalkan");
      refreshSentPdfs("id", active.id);
      reload();
    }
  });

  app.querySelector("[data-invoice-redo]")?.addEventListener("click", async (event) => {
    if (!window.confirm(`Batalkan ${active.code} dan buat tagihan baru dari isi pesanan sekarang?`)) return;
    event.currentTarget.disabled = true;
    if (!(await updateInvoice(active.id, { status: "batal" }, errorEl))) return;
    refreshSentPdfs("id", active.id);
    const { error } = await supabase
      .from("invoices")
      .insert({ order_id: order.id, method: active.method, instructions: active.instructions });
    if (error) {
      state.flash = {
        tone: "error",
        text: `Tagihan lama dibatalkan, tapi tagihan baru gagal dibuat: ${errorMessage(error)}`,
      };
    } else {
      toast("Tagihan baru dibuat. Kirim ulang ke pembeli.");
    }
    reload();
  });

  app.querySelector("[data-invoice-paid]")?.addEventListener("click", () => {
    state.paidInvoice = { id: active.id, orderId: order.id };
    const form = paidDialog.querySelector("form");
    form.reset();
    form.elements.amount.value = String(active.total);
    form.elements.paid_at.value = toJakartaInput(new Date().toISOString());
    form.querySelector("[data-total]").textContent = formatRp(active.total);
    form.querySelector("[data-error]").hidden = true;
    paidDialog.showModal();
  });
}

paidDialog.querySelector("form").addEventListener("submit", async (event) => {
  if (event.submitter?.value !== "confirm") return;
  event.preventDefault();
  const form = event.currentTarget;
  const errorEl = form.querySelector("[data-error]");
  const amount = parseRupiah(form.elements.amount.value);
  const paidAt = fromJakartaInput(form.elements.paid_at.value);
  if (!amount || amount < 1) return showError(errorEl, "Isi nominal yang diterima.");
  if (!paidAt) return showError(errorEl, "Isi waktu lunas.");

  event.submitter.disabled = true;
  const { error } = await supabase
    .from("invoices")
    .update({ status: "lunas", paid_amount: amount, paid_at: paidAt })
    .eq("id", state.paidInvoice.id);
  event.submitter.disabled = false;
  if (error) return showError(errorEl, errorMessage(error));

  paidDialog.close();
  toast("Tagihan lunas");
  refreshSentPdfs("id", state.paidInvoice.id);
  renderDetail(state.paidInvoice.orderId);
});

async function renderInvoiceForm(orderId) {
  const seq = ++renderSeq;
  const back = `#/pesanan/${orderId}`;
  app.innerHTML = `<p class="page muted">Memuat…</p>`;
  const [{ data: order, error }, { data: invoices, error: invoiceError }] = await Promise.all([
    fetchOrder(orderId),
    fetchInvoices(orderId),
  ]);
  if (seq !== renderSeq) return;
  if (error || invoiceError) return renderProblem(errorMessage(error || invoiceError), back);
  if (!order) return renderProblem("Pesanan tidak ditemukan.");

  const active = invoices.find((invoice) => invoice.status !== "batal");
  if (active && active.status !== "draft") {
    return renderProblem(
      "Tagihan ini sudah dikirim, jadi cara bayarnya tidak bisa diubah. Batalkan tagihan dulu kalau perlu membuat yang baru.",
      back
    );
  }
  const total = orderTotal(order);
  if (!active && !INVOICE_ELIGIBLE.includes(order.status)) {
    return renderProblem("Tagihan hanya bisa dibuat untuk pesanan yang sudah dikonfirmasi.", back);
  }
  if (!active && total == null) {
    return renderProblem("Isi harga semua item dulu, baru tagihan bisa dibuat.", back);
  }

  const draft = active ?? {
    code: "INV-…",
    lines: invoiceLines(order.order_items),
    shipping_fee: order.shipping_fee,
    total,
    method: "transfer",
    instructions: DEFAULT_INSTRUCTIONS.transfer,
  };

  app.innerHTML = `
    <section class="page has-actions">
      <a class="back" href="${esc(back)}">‹ Detail</a>
      <h1>${active ? `Ubah <span class="code">${esc(active.code)}</span>` : "Buat tagihan"}</h1>
      <p class="small muted">
        Pesanan <span class="code">${esc(order.code)}</span> · ${esc(order.customer_name)} · Total ${esc(formatRp(draft.total))}
      </p>
      <form id="invoice-form" class="stack" novalidate>
        <fieldset class="seg">
          <legend class="sr-only">Cara bayar</legend>
          ${Object.entries(METHOD_LABEL)
            .map(
              ([value, label]) =>
                `<label><input type="radio" name="method" value="${value}" /> <span>${label}</span></label>`
            )
            .join("")}
        </fieldset>
        <label class="field">
          <span data-instructions-label>Instruksi bayar</span>
          <textarea class="input" name="instructions" rows="3" maxlength="500"></textarea>
        </label>
        <div class="field">
          <span>Ringkasan tagihan</span>
          <pre class="wa-preview" data-preview></pre>
          ${active ? "" : `<span class="small muted">Nomor tagihan dibuat saat disimpan.</span>`}
        </div>
        <p class="error" data-error hidden></p>
        <div class="sticky-actions">
          <button class="btn primary full" type="submit">Simpan sebagai draft</button>
        </div>
      </form>
    </section>`;

  const form = app.querySelector("#invoice-form");
  const fields = form.elements;
  const errorEl = form.querySelector("[data-error]");
  const previewEl = form.querySelector("[data-preview]");
  const labelEl = form.querySelector("[data-instructions-label]");
  fields.method.value = draft.method;
  fields.instructions.value = draft.instructions ?? "";

  const read = () => ({
    method: fields.method.value,
    instructions: fields.instructions.value.trim() || null,
  });
  const sync = () => {
    const { method, instructions } = read();
    fields.instructions.placeholder = INSTRUCTION_HINT[method];
    labelEl.textContent = method === "tunai" ? "Instruksi bayar (opsional)" : "Instruksi bayar";
    previewEl.textContent = invoiceMessage({ ...draft, method, instructions }, order);
  };
  // Rekening bawaan ikut diganti saat cara bayar diganti, kecuali admin sudah
  // menulis instruksinya sendiri.
  let lastMethod = draft.method;
  fields.method.forEach((radio) =>
    radio.addEventListener("change", () => {
      const untouched = fields.instructions.value.trim() === (DEFAULT_INSTRUCTIONS[lastMethod] ?? "");
      if (untouched) fields.instructions.value = DEFAULT_INSTRUCTIONS[radio.value] ?? "";
      lastMethod = radio.value;
    })
  );
  form.addEventListener("input", sync);
  form.addEventListener("change", sync);
  sync();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    const values = read();
    if (values.method !== "tunai" && !values.instructions) {
      return showError(
        errorEl,
        values.method === "transfer"
          ? `Isi rekening tujuan, misalnya ${DEFAULT_INSTRUCTIONS.transfer}.`
          : "Isi instruksi bayar, misalnya bahwa kode QRIS dikirim di chat."
      );
    }

    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    const { error: saveError } = active
      ? await supabase.from("invoices").update(values).eq("id", active.id)
      : await supabase.from("invoices").insert({ ...values, order_id: order.id });
    submit.disabled = false;
    if (saveError) return showError(errorEl, errorMessage(saveError));

    toast(active ? "Tagihan disimpan" : "Tagihan dibuat. Kirim ke pembeli dari halaman detail.");
    if (seq === renderSeq) location.hash = back;
  });
}

async function renderInvoiceDoc(id) {
  const seq = ++renderSeq;
  app.innerHTML = `<p class="page muted">Memuat…</p>`;
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select(INVOICE_WITH_ORDER)
    .eq("id", id)
    .maybeSingle();
  if (seq !== renderSeq) return;
  if (error) return renderProblem(errorMessage(error));
  if (!invoice) return renderProblem("Tagihan tidak ditemukan.");

  const order = invoice.orders;
  const store = window.TETUTI ?? { storeName: "Tetuti Kitchen" };
  state.printTitle = `${invoice.code} ${store.storeName}`;

  const contact = [
    store.siteUrl ? store.siteUrl.replace(/^https?:\/\//, "") : "",
    store.whatsappNumber ? `WhatsApp ${displayPhone(store.whatsappNumber)}` : "",
  ].filter(Boolean);
  const place =
    order.fulfillment === "antar" ? `Diantar ke ${esc(order.address)}` : "Diambil sendiri (pickup)";
  const rows = invoice.lines
    .map(
      (line) => `
        <tr>
          <td>${esc(line.name)}</td>
          <td class="num">${line.quantity}</td>
          <td class="num">${esc(formatRp(line.unit_price))}</td>
          <td class="num">${esc(formatRp(line.quantity * line.unit_price))}</td>
        </tr>`
    )
    .join("");
  const paid =
    invoice.status === "lunas"
      ? `<p class="doc-paid">Diterima ${esc(formatRp(invoice.paid_amount))} pada ${esc(formatDay(invoice.paid_at))}. Terima kasih!</p>`
      : "";

  app.innerHTML = `
    <section class="page invoice-page">
      <div class="no-print stack">
        <a class="back" href="#/pesanan/${esc(invoice.order_id)}">‹ Detail pesanan</a>
        ${
          invoice.status === "draft"
            ? `<p class="notice">Tagihan masih Draft. Kalau PDF dikirim dengan cara lain, tekan Tandai terkirim.</p>`
            : ""
        }
        ${
          invoice.status === "batal"
            ? `<p class="notice error">Tagihan ini sudah dibatalkan. Jangan dikirim ke pembeli.</p>`
            : `<button class="btn primary full" type="button" data-invoice-pdf>${PDF_LABEL[invoice.status]}</button>
              <p class="small muted">Chat pembeli langsung terbuka dengan tautan PDF invoice ini.</p>`
        }
        <div class="row">
          ${invoice.status === "batal" ? "" : `<button class="btn full" type="button" data-invoice-share>Bagikan file PDF</button>`}
          <button class="btn full" type="button" data-print>Cetak</button>
        </div>
        ${invoice.status === "draft" ? `<button class="btn full" type="button" data-mark-sent>Tandai terkirim</button>` : ""}
        <p class="error" data-error hidden></p>
      </div>

      <article class="doc">
        <header class="doc-head">
          <div class="doc-brand">
            <img src="/assets/logo-cabai.png" alt="" width="44" height="44" />
            <div>
              <strong>${esc(store.storeName)}</strong>
              ${contact.map((text) => `<span>${esc(text)}</span>`).join("")}
            </div>
          </div>
          <div class="doc-title">
            <h1>Invoice</h1>
            <span class="code">${esc(invoice.code)}</span>
          </div>
        </header>

        <div class="doc-meta">
          <div>
            <span class="label">Kepada</span>
            <strong>${esc(order.customer_name)}</strong>
            <span>${esc(displayPhone(order.customer_phone))}</span>
            <span>${place}</span>
          </div>
          <dl>
            <dt>Tanggal</dt><dd>${esc(formatDay(invoice.created_at))}</dd>
            <dt>Pesanan</dt><dd>${esc(order.code)}</dd>
            ${order.requested_at ? `<dt>Jadwal</dt><dd>${esc(formatDate(order.requested_at))}</dd>` : ""}
            <dt>Status</dt><dd><span class="doc-stamp d-${invoice.status}">${INVOICE_STAMP[invoice.status]}</span></dd>
          </dl>
        </div>

        <table class="doc-items">
          <thead>
            <tr><th>Item</th><th class="num">Jml</th><th class="num">Harga</th><th class="num">Jumlah</th></tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr><td colspan="3">Subtotal</td><td class="num">${esc(formatRp(invoice.subtotal))}</td></tr>
            ${
              invoice.shipping_fee
                ? `<tr><td colspan="3">Ongkir</td><td class="num">${esc(formatRp(invoice.shipping_fee))}</td></tr>`
                : ""
            }
            <tr class="grand"><td colspan="3">Total</td><td class="num">${esc(formatRp(invoice.total))}</td></tr>
          </tfoot>
        </table>

        <div class="doc-pay">
          <span class="label">Cara bayar</span>
          <strong>${esc(METHOD_LABEL[invoice.method])}</strong>
          ${invoice.instructions ? `<p class="note">${esc(invoice.instructions)}</p>` : ""}
        </div>
        ${paid}
        <p class="doc-foot">Terima kasih sudah memesan di ${esc(store.storeName)}.</p>
      </article>
    </section>`;

  const errorEl = app.querySelector("[data-error]");
  app.querySelector("[data-print]").addEventListener("click", () => window.print());
  const pdfButton = app.querySelector("[data-invoice-pdf]");
  const shareButton = app.querySelector("[data-invoice-share]");
  if (pdfButton) {
    invoicePdf(invoice, order).catch(() => {});
    pdfButton.addEventListener("click", async () => {
      if (await sendInvoiceLink(invoice, order, pdfButton, errorEl)) renderInvoiceDoc(invoice.id);
    });
    shareButton.addEventListener("click", async () => {
      if (await shareInvoicePdf(invoice, order, shareButton, errorEl)) renderInvoiceDoc(invoice.id);
    });
  }
  const markSent = app.querySelector("[data-mark-sent]");
  markSent?.addEventListener("click", async () => {
    markSent.disabled = true;
    if (await updateInvoice(invoice.id, { status: "terkirim" }, errorEl)) {
      toast("Tagihan ditandai terkirim");
      renderInvoiceDoc(invoice.id);
    } else {
      markSent.disabled = false;
    }
  });
}

// Catat dan ubah pesanan ------------------------------------------------------

function blankItem() {
  const first = state.menu.find((menu) => menu.is_active);
  return {
    id: null,
    menu_item_id: first ? first.id : "",
    name: "",
    quantity: 1,
    unit_price: first?.price ?? null,
  };
}

function menuOptions(item) {
  const options = state.menu
    .filter((menu) => menu.is_active || menu.id === item.menu_item_id)
    .map(
      (menu) =>
        `<option value="${esc(menu.id)}" ${menu.id === item.menu_item_id ? "selected" : ""}>${esc(menu.name)}</option>`
    );
  if (!item.menu_item_id && item.name) {
    options.unshift(`<option value="" selected>${esc(item.name)}</option>`);
  }
  return options.join("");
}

async function renderForm(id) {
  const seq = ++renderSeq;
  let order = null;

  if (id) {
    app.innerHTML = `<p class="page muted">Memuat…</p>`;
    const { data, error } = await fetchOrder(id);
    if (seq !== renderSeq) return;
    if (error) return renderProblem(errorMessage(error));
    if (!data) return renderProblem("Pesanan tidak ditemukan.");
    if (data.status === "selesai" || data.status === "batal") {
      return renderProblem(
        "Pesanan yang sudah selesai atau batal tidak bisa diubah. Buka kembali dulu dari halaman detail.",
        `#/pesanan/${id}`
      );
    }
    order = data;
  }

  const original = order ? order.order_items : [];
  const items = order ? original.map((item) => ({ ...item })) : [blankItem()];
  const backHref = id ? `#/pesanan/${id}` : "#/";

  app.innerHTML = `
    <section class="page has-actions">
      <a class="back" href="${esc(backHref)}">‹ ${id ? "Detail" : "Pesanan"}</a>
      <h1>${id ? `Ubah <span class="code">${esc(order.code)}</span>` : "Pesanan baru"}</h1>
      <form id="order-form" class="stack" novalidate>
        <label class="field">
          <span>Nama pembeli</span>
          <input class="input" name="customer_name" autocomplete="off" required />
        </label>
        <label class="field">
          <span>WhatsApp</span>
          <input class="input" name="customer_phone" type="tel" inputmode="tel" placeholder="0812 3456 7890" required />
        </label>
        <fieldset class="seg">
          <legend class="sr-only">Cara terima</legend>
          <label><input type="radio" name="fulfillment" value="pickup" /> <span>Pickup</span></label>
          <label><input type="radio" name="fulfillment" value="antar" /> <span>Antar</span></label>
        </fieldset>
        <div class="stack" data-delivery hidden>
          <label class="field">
            <span>Alamat antar</span>
            <textarea class="input" name="address" rows="2"></textarea>
          </label>
          <label class="field">
            <span>Ongkir</span>
            <input class="input" name="shipping_fee" inputmode="numeric" placeholder="0" />
          </label>
        </div>
        <label class="field">
          <span>Waktu diminta (opsional)</span>
          <input class="input" name="requested_at" type="datetime-local" />
        </label>
        <div class="box">
          <span class="label">Item</span>
          <div class="items" data-items></div>
          <button type="button" class="link-btn" data-add-item>+ Tambah item</button>
          <div class="line total"><span>Total</span><span data-total></span></div>
        </div>
        <label class="field">
          <span>Catatan</span>
          <textarea class="input" name="note" rows="3" placeholder="Level pedas, jam ambil, dll."></textarea>
        </label>
        <p class="error" data-error hidden></p>
        <div class="sticky-actions">
          <button class="btn primary full" type="submit">${id ? "Simpan perubahan" : "Simpan sebagai Baru"}</button>
        </div>
      </form>
    </section>`;

  const form = app.querySelector("#order-form");
  const fields = form.elements;
  const itemsEl = form.querySelector("[data-items]");
  const deliveryEl = form.querySelector("[data-delivery]");
  const totalEl = form.querySelector("[data-total]");
  const errorEl = form.querySelector("[data-error]");

  fields.customer_name.value = order?.customer_name ?? "";
  fields.customer_phone.value = order ? displayPhone(order.customer_phone) : "";
  fields.fulfillment.value = order?.fulfillment ?? "pickup";
  fields.address.value = order?.address ?? "";
  fields.shipping_fee.value = order?.shipping_fee ? String(order.shipping_fee) : "";
  fields.requested_at.value = toJakartaInput(order?.requested_at);
  fields.note.value = order?.note ?? "";

  const isDelivery = () => fields.fulfillment.value === "antar";

  const updateTotal = () => {
    if (items.length === 0 || items.some((item) => item.unit_price == null)) {
      totalEl.textContent = "Harga belum lengkap";
      totalEl.classList.add("muted");
      return;
    }
    const fee = isDelivery() ? parseRupiah(fields.shipping_fee.value) ?? 0 : 0;
    const sum = items.reduce((total, item) => total + item.unit_price * (item.quantity || 0), 0);
    totalEl.textContent = formatRp(sum + fee);
    totalEl.classList.remove("muted");
  };

  const renderItems = () => {
    itemsEl.innerHTML = items.length
      ? items
          .map(
            (item, index) => `
        <div class="item-row" data-index="${index}">
          <select class="input" data-field="menu_item_id" aria-label="Menu">${menuOptions(item)}</select>
          <input class="input" data-field="quantity" type="number" min="1" inputmode="numeric"
            aria-label="Jumlah" value="${esc(item.quantity)}" />
          <input class="input" data-field="unit_price" inputmode="numeric" placeholder="Harga"
            aria-label="Harga satuan" value="${esc(item.unit_price ?? "")}" />
          <button type="button" class="icon-btn" data-remove aria-label="Hapus item">×</button>
        </div>`
          )
          .join("")
      : `<p class="muted small">Belum ada item.</p>`;
    updateTotal();
  };

  const syncDelivery = () => {
    deliveryEl.hidden = !isDelivery();
    updateTotal();
  };

  itemsEl.addEventListener("input", (event) => {
    const row = event.target.closest("[data-index]");
    if (!row) return;
    const item = items[Number(row.dataset.index)];
    const field = event.target.dataset.field;
    if (field === "quantity") item.quantity = Number(event.target.value);
    if (field === "unit_price") item.unit_price = parseRupiah(event.target.value);
    if (field === "menu_item_id") {
      item.menu_item_id = event.target.value;
      item.unit_price = state.menu.find((menu) => menu.id === item.menu_item_id)?.price ?? null;
      row.querySelector('[data-field="unit_price"]').value = item.unit_price ?? "";
    }
    updateTotal();
  });

  itemsEl.addEventListener("click", (event) => {
    const row = event.target.closest("[data-remove]")?.closest("[data-index]");
    if (!row) return;
    items.splice(Number(row.dataset.index), 1);
    renderItems();
  });

  form.querySelector("[data-add-item]").addEventListener("click", () => {
    items.push(blankItem());
    renderItems();
  });

  form.querySelectorAll('input[name="fulfillment"]').forEach((radio) => {
    radio.addEventListener("change", syncDelivery);
  });
  fields.shipping_fee.addEventListener("input", updateTotal);

  renderItems();
  syncDelivery();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.hidden = true;

    const values = {
      customer_name: fields.customer_name.value.trim(),
      customer_phone: normalizePhone(fields.customer_phone.value),
      fulfillment: fields.fulfillment.value,
      address: isDelivery() ? fields.address.value.trim() : null,
      shipping_fee: isDelivery() ? parseRupiah(fields.shipping_fee.value) ?? 0 : 0,
      requested_at: fromJakartaInput(fields.requested_at.value),
      note: fields.note.value.trim() || null,
    };

    const problem = validateOrder(values, items, order);
    if (problem) return showError(errorEl, problem);

    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    const result = id ? await updateOrder(id, values, items, original) : await createOrder(values, items);
    submit.disabled = false;

    if (result.error) {
      const partial = result.partial
        ? " Sebagian perubahan mungkin sudah tersimpan; buka detail pesanan untuk memeriksa."
        : "";
      return showError(errorEl, errorMessage(result.error) + partial);
    }
    toast(id ? "Perubahan disimpan" : "Pesanan dicatat");
    location.hash = `#/pesanan/${result.id}`;
  });
}

function validateOrder(values, items, order) {
  if (!values.customer_name) return "Nama pembeli wajib diisi.";
  if (!isValidPhone(values.customer_phone)) {
    return "Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890.";
  }
  if (values.fulfillment === "antar" && !values.address) {
    return "Alamat wajib diisi untuk pesanan antar.";
  }
  if (items.length === 0) return "Tambahkan minimal satu item.";
  if (items.some((item) => !item.menu_item_id && !item.name)) return "Pilih menu untuk setiap item.";
  if (items.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1)) {
    return "Jumlah setiap item minimal 1.";
  }
  if (order && order.status !== "baru" && items.some((item) => item.unit_price == null)) {
    return "Pesanan sudah dikonfirmasi, jadi setiap item wajib punya harga.";
  }
  return null;
}

function itemRow(item, orderId) {
  const menu = state.menu.find((entry) => entry.id === item.menu_item_id);
  return {
    order_id: orderId,
    menu_item_id: item.menu_item_id || null,
    name: menu ? menu.name : item.name,
    quantity: item.quantity,
    unit_price: item.unit_price,
  };
}

async function createOrder(values, items) {
  const { data, error } = await supabase.from("orders").insert(values).select("id").single();
  if (error) return { error };

  const { error: itemsError } = await supabase
    .from("order_items")
    .insert(items.map((item) => itemRow(item, data.id)));
  if (itemsError) {
    state.flash = {
      tone: "error",
      text: `Pesanan tersimpan, tapi item gagal disimpan: ${errorMessage(itemsError)} Buka Ubah untuk menambahkan item.`,
    };
  }
  return { id: data.id };
}

async function updateOrder(id, values, items, original) {
  const { error } = await supabase.from("orders").update(values).eq("id", id);
  if (error) return { error };

  const kept = new Set(items.filter((item) => item.id).map((item) => item.id));
  const removed = original.filter((item) => !kept.has(item.id)).map((item) => item.id);
  if (removed.length) {
    const { error: deleteError } = await supabase.from("order_items").delete().in("id", removed);
    if (deleteError) return { error: deleteError, partial: true };
  }

  for (const item of items.filter((entry) => entry.id)) {
    const before = original.find((entry) => entry.id === item.id);
    const sameMenu = before.menu_item_id === item.menu_item_id;
    if (sameMenu && before.quantity === item.quantity && before.unit_price === item.unit_price) continue;

    const { order_id: _unused, ...changes } = itemRow(item, id);
    // Nama yang sudah tersalin tetap dipakai selama menunya tidak diganti.
    if (sameMenu) changes.name = before.name;
    const { error: updateError } = await supabase.from("order_items").update(changes).eq("id", item.id);
    if (updateError) return { error: updateError, partial: true };
  }

  const added = items.filter((item) => !item.id).map((item) => itemRow(item, id));
  if (added.length) {
    const { error: insertError } = await supabase.from("order_items").insert(added);
    if (insertError) return { error: insertError, partial: true };
  }

  return { id };
}

// Menu -------------------------------------------------------------------------

const PHOTO_BUCKET = "menu-foto";
const PHOTO_MAX_PX = 1200;
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const CATEGORY_LABEL = { camilan: "Camilan", hantaran: "Hantaran", catering: "Catering" };

async function renderMenu() {
  const seq = ++renderSeq;
  app.innerHTML = `<p class="page muted">Memuat…</p>`;
  const error = await loadMenu();
  if (seq !== renderSeq) return;
  if (error) return renderProblem(errorMessage(error));

  app.innerHTML = `
    <section class="page">
      ${flashHtml()}
      <div class="row between">
        <h1>Menu</h1>
        <a class="btn primary" href="#/menu/baru">+ Tambah menu</a>
      </div>
      <p class="small muted">
        Urutan di sini sama dengan urutan kartu di situs. Menu yang disembunyikan tidak tampil di situs,
        tapi tetap tercatat di pesanan lama.
      </p>
      <div class="list">
        ${
          state.menu.length
            ? state.menu.map(menuRow).join("")
            : `<p class="empty">Belum ada menu. Tambahkan menu pertama.</p>`
        }
      </div>
    </section>`;

  app.querySelectorAll("[data-move]").forEach((button) => {
    button.addEventListener("click", async () => {
      const from = state.menu.findIndex((menu) => menu.id === button.dataset.id);
      const to = from + Number(button.dataset.move);
      if (from < 0 || to < 0 || to >= state.menu.length) return;

      const ordered = state.menu.slice();
      [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
      app.querySelectorAll("[data-move]").forEach((el) => {
        el.disabled = true;
      });
      const moveError = await saveMenuOrder(ordered);
      if (seq !== renderSeq) return;
      if (moveError) {
        await loadMenu();
        state.flash = { tone: "error", text: `Urutan gagal disimpan. ${errorMessage(moveError)}` };
      }
      renderMenu();
    });
  });
}

// Nomor urut ditulis ulang 1..n supaya menu dengan nomor sama tetap bisa digeser.
async function saveMenuOrder(ordered) {
  for (const [index, menu] of ordered.entries()) {
    if (menu.sort_order === index + 1) continue;
    const { error } = await supabase.from("menu_items").update({ sort_order: index + 1 }).eq("id", menu.id);
    if (error) return error;
    menu.sort_order = index + 1;
  }
  return null;
}

function menuRow(menu, index, list) {
  const src = menuImageSrc(menu.image_url);
  return `
    <div class="menu-row${menu.is_active ? "" : " is-hidden"}">
      <a class="menu-link" href="#/menu/${esc(menu.id)}">
        ${
          src
            ? `<img class="thumb" src="${esc(src)}" alt="" loading="lazy" />`
            : `<span class="thumb empty-thumb" aria-hidden="true"></span>`
        }
        <span class="menu-text">
          <strong>${esc(menu.name)}</strong>
          <span class="small muted">${esc(priceLabel(menu.price, menu.unit))} · ${esc(CATEGORY_LABEL[menu.category])}</span>
          ${menu.is_active ? "" : `<span class="tag muted-tag">Disembunyikan</span>`}
        </span>
      </a>
      <span class="move">
        <button type="button" class="icon-btn" data-move="-1" data-id="${esc(menu.id)}"
          aria-label="Naikkan ${esc(menu.name)}" ${index === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="icon-btn" data-move="1" data-id="${esc(menu.id)}"
          aria-label="Turunkan ${esc(menu.name)}" ${index === list.length - 1 ? "disabled" : ""}>↓</button>
      </span>
    </div>`;
}

// Foto dari HP bisa belasan MB. Dikecilkan dan dijadikan JPG sebelum diunggah;
// bagian transparan PNG diisi warna latar kartu situs.
async function preparePhoto(file) {
  if (!/^image\/(jpeg|png)$/.test(file.type)) throw new Error("Pilih foto berformat JPG atau PNG.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {
      throw new Error("Foto tidak bisa dibaca. Coba foto lain.");
    });
    const scale = Math.min(1, PHOTO_MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ead9c8";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.55]) {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= PHOTO_MAX_BYTES) return blob;
    }
    throw new Error("Foto terlalu besar. Coba foto lain.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function photoPath(url) {
  const prefix = supabase.storage.from(PHOTO_BUCKET).getPublicUrl("").data.publicUrl;
  return url?.startsWith(prefix) ? url.slice(prefix.length) : null;
}

async function renderMenuForm(id) {
  const seq = ++renderSeq;
  app.innerHTML = `<p class="page muted">Memuat…</p>`;
  const loadError = await loadMenu();
  if (seq !== renderSeq) return;
  if (loadError) return renderProblem(errorMessage(loadError), "#/menu");

  const menu = id ? state.menu.find((entry) => entry.id === id) : null;
  if (id && !menu) return renderProblem("Menu tidak ditemukan.", "#/menu");
  const highlights = [0, 1, 2].map((index) => menu?.highlights?.[index] ?? "");

  // Menu yang sudah ada di pesanan ditolak database kalau dihapus.
  let orderedCount = 0;
  if (menu) {
    const { count } = await supabase
      .from("order_items")
      .select("id", { count: "exact", head: true })
      .eq("menu_item_id", menu.id);
    if (seq !== renderSeq) return;
    orderedCount = count ?? 0;
  }
  const deleteHtml = !menu
    ? ""
    : orderedCount > 0
      ? `<p class="small muted">Menu ini ada di ${orderedCount} item pesanan, jadi tidak bisa dihapus.
          Hapus centang Tampilkan di situs untuk menyembunyikannya.</p>`
      : `<button class="btn danger-outline full" type="button" data-delete>Hapus menu…</button>`;

  app.innerHTML = `
    <section class="page has-actions">
      <a class="back" href="#/menu">‹ Menu</a>
      <h1>${menu ? esc(menu.name) : "Menu baru"}</h1>
      <form id="menu-form" class="stack" novalidate>
        <div class="photo-field">
          <div class="photo-frame">
            <img data-photo-preview alt="" hidden />
            <span class="muted small" data-photo-empty>Belum ada foto</span>
          </div>
          <div class="stack">
            <label class="btn photo-btn">
              <input class="sr-only" type="file" accept="image/jpeg,image/png" data-photo />
              <span data-photo-label>Pilih foto</span>
            </label>
            <span class="small muted">JPG atau PNG. Foto tegak 3:4 paling pas di kartu situs.</span>
          </div>
        </div>
        <label class="field">
          <span>Nama menu</span>
          <input class="input" name="name" maxlength="60" autocomplete="off" required />
        </label>
        <label class="field">
          <span>Kategori</span>
          <select class="input" name="category">
            ${Object.entries(CATEGORY_LABEL)
              .map(([value, label]) => `<option value="${value}">${label}</option>`)
              .join("")}
          </select>
        </label>
        <div class="menu-fields">
          <label class="field">
            <span>Harga</span>
            <input class="input" name="price" inputmode="numeric" placeholder="Kosong" />
          </label>
          <label class="field">
            <span>Satuan (opsional)</span>
            <input class="input" name="unit" maxlength="20" placeholder="pack, box, porsi" />
          </label>
        </div>
        <span class="small muted">Di situs: <span data-preview></span></span>
        <label class="field">
          <span>Label di foto (opsional)</span>
          <input class="input" name="badge" maxlength="20" placeholder="Best seller, Baru, Hampers" />
        </label>
        <label class="field">
          <span>Kalimat singkat (opsional)</span>
          <input class="input" name="hook" maxlength="60" placeholder="Pedas, renyah, nagih!" />
        </label>
        <label class="field">
          <span>Deskripsi (opsional)</span>
          <textarea class="input" name="description" rows="3" maxlength="300"></textarea>
        </label>
        <fieldset class="box">
          <legend class="label">Sorotan (opsional, maksimal 3)</legend>
          ${highlights
            .map(
              (_, index) =>
                `<input class="input" name="highlight" maxlength="60" aria-label="Sorotan ${index + 1}" />`
            )
            .join("")}
        </fieldset>
        <label class="check">
          <input type="checkbox" name="is_active" />
          <span>Tampilkan di situs</span>
        </label>
        ${deleteHtml}
        <p class="error" data-error hidden></p>
        <div class="sticky-actions">
          <button class="btn primary full" type="submit">${menu ? "Simpan perubahan" : "Tambah menu"}</button>
        </div>
      </form>
    </section>`;

  const form = app.querySelector("#menu-form");
  const fields = form.elements;
  const errorEl = form.querySelector("[data-error]");
  const previewEl = form.querySelector("[data-preview]");
  const photoInput = form.querySelector("[data-photo]");
  const photoImg = form.querySelector("[data-photo-preview]");
  const photoEmpty = form.querySelector("[data-photo-empty]");
  const photoLabel = form.querySelector("[data-photo-label]");
  let photoBlob = null;
  let photoUrl = null;

  fields.name.value = menu?.name ?? "";
  fields.category.value = menu?.category ?? "camilan";
  fields.price.value = menu?.price ?? "";
  fields.unit.value = menu?.unit ?? "";
  fields.badge.value = menu?.badge ?? "";
  fields.hook.value = menu?.hook ?? "";
  fields.description.value = menu?.description ?? "";
  form.querySelectorAll('[name="highlight"]').forEach((input, index) => {
    input.value = highlights[index];
  });
  fields.is_active.checked = menu ? menu.is_active : true;

  const showPhoto = (src) => {
    photoImg.hidden = !src;
    photoEmpty.hidden = Boolean(src);
    if (src) photoImg.src = src;
    photoLabel.textContent = src ? "Ganti foto" : "Pilih foto";
  };
  showPhoto(menuImageSrc(menu?.image_url));

  const syncPreview = () => {
    previewEl.textContent = priceLabel(parseRupiah(fields.price.value), fields.unit.value.trim() || null);
  };
  syncPreview();
  fields.price.addEventListener("input", syncPreview);
  fields.unit.addEventListener("input", syncPreview);

  photoInput.addEventListener("change", async () => {
    const file = photoInput.files[0];
    photoInput.value = "";
    if (!file) return;
    errorEl.hidden = true;
    photoLabel.textContent = "Menyiapkan foto…";
    try {
      photoBlob = await preparePhoto(file);
    } catch (problem) {
      showPhoto(photoUrl || menuImageSrc(menu?.image_url));
      return showError(errorEl, problem.message);
    }
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    photoUrl = URL.createObjectURL(photoBlob);
    showPhoto(photoUrl);
  });

  form.querySelector("[data-delete]")?.addEventListener("click", async (event) => {
    if (!window.confirm(`Hapus ${menu.name}? Menu dan fotonya hilang permanen.`)) return;
    errorEl.hidden = true;
    const button = event.currentTarget;
    button.disabled = true;
    const { data, error } = await supabase.from("menu_items").delete().eq("id", menu.id).select("id");
    if (error || data.length === 0) {
      button.disabled = false;
      return showError(errorEl, error ? errorMessage(error) : "Menu tidak terhapus. Muat ulang lalu coba lagi.");
    }
    const path = photoPath(menu.image_url);
    if (path) await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    if (photoUrl) URL.revokeObjectURL(photoUrl);

    await loadMenu();
    toast("Menu dihapus");
    if (seq === renderSeq) location.hash = "#/menu";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.hidden = true;

    const values = {
      name: fields.name.value.trim(),
      category: fields.category.value,
      price: parseRupiah(fields.price.value),
      unit: fields.unit.value.trim() || null,
      badge: fields.badge.value.trim() || null,
      hook: fields.hook.value.trim() || null,
      description: fields.description.value.trim() || null,
      highlights: [...form.querySelectorAll('[name="highlight"]')]
        .map((input) => input.value.trim())
        .filter(Boolean),
      is_active: fields.is_active.checked,
    };

    if (!values.name) return showError(errorEl, "Nama menu wajib diisi.");
    if (values.price != null && (values.price < 1 || values.price > 100_000_000)) {
      return showError(errorEl, "Harga harus antara Rp1 dan Rp100.000.000. Kosongkan kalau belum ada harga.");
    }

    const taken = new Set(state.menu.map((entry) => entry.id));
    taken.add("baru");
    const menuId = menu ? menu.id : uniqueSlug(values.name, taken);
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;

    let uploaded = null;
    if (photoBlob) {
      submit.textContent = "Mengunggah foto…";
      const path = `${menuId}-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(path, photoBlob, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (uploadError) {
        submit.disabled = false;
        submit.textContent = menu ? "Simpan perubahan" : "Tambah menu";
        return showError(errorEl, `Foto gagal diunggah, menu belum disimpan. ${errorMessage(uploadError)}`);
      }
      uploaded = path;
      values.image_url = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
    }

    submit.textContent = "Menyimpan…";
    const { error } = menu
      ? await supabase.from("menu_items").update(values).eq("id", menu.id)
      : await supabase.from("menu_items").insert({
          ...values,
          id: menuId,
          sort_order: Math.max(0, ...state.menu.map((entry) => entry.sort_order)) + 1,
        });

    if (error) {
      if (uploaded) await supabase.storage.from(PHOTO_BUCKET).remove([uploaded]);
      submit.disabled = false;
      submit.textContent = menu ? "Simpan perubahan" : "Tambah menu";
      return showError(errorEl, errorMessage(error));
    }

    const oldPath = uploaded ? photoPath(menu?.image_url) : null;
    if (oldPath) await supabase.storage.from(PHOTO_BUCKET).remove([oldPath]);
    if (photoUrl) URL.revokeObjectURL(photoUrl);

    await loadMenu();
    toast(menu ? "Menu disimpan" : "Menu ditambahkan");
    if (seq === renderSeq) location.hash = "#/menu";
  });
}

// Akun -----------------------------------------------------------------------

// Token yang tersimpan tetap terlihat sah setelah sesinya diakhiri dari
// perangkat lain; baru ketahuan saat dicek ke server Auth.
async function sessionRevoked() {
  const { error } = await supabase.auth.getUser();
  // Akun yang aksesnya dicabut ikut terhapus, jadi pemiliknya tidak ditemukan.
  return error?.name === "AuthSessionMissingError" || error?.code === "user_not_found";
}

async function checkRevoked() {
  if (state.signedIn && (await sessionRevoked()) && state.signedIn) signOut(REVOKED_MESSAGE);
}

// Membuat dan menghapus akun butuh kunci rahasia, jadi dikerjakan Edge
// Function kelola-admin (supabase/functions/kelola-admin), bukan di browser.
async function callAdmins(body) {
  const { data, error } = await supabase.functions.invoke("kelola-admin", { body });
  if (!error) return { admins: data.admins };
  const response = error.context instanceof Response ? error.context : null;
  const payload = response ? await response.json().catch(() => null) : null;
  if (payload?.error) return { error: payload.error };
  if (response?.status === 404) return { error: "Fungsi kelola-admin belum dipasang di Supabase." };
  if (response?.status === 401) return { error: "Sesi habis. Silakan masuk lagi." };
  return {
    error: "Fungsi kelola akun tidak bisa dihubungi. Periksa internet, lalu pastikan kelola-admin sudah dipasang di Supabase.",
  };
}

function adminRowHtml(account) {
  const seen = account.last_sign_in_at ? `Terakhir masuk ${formatDate(account.last_sign_in_at)}` : "Belum pernah masuk";
  return `
    <div class="admin-row">
      <span class="admin-who">
        <span class="row"><strong>${esc(account.email ?? "(tanpa email)")}</strong>${
          account.self ? `<span class="tag">Anda</span>` : ""
        }</span>
        <span class="small muted">${esc(seen)}</span>
      </span>
      ${account.self ? "" : `<button class="btn ghost" type="button" data-remove="${esc(account.id)}">Cabut akses</button>`}
    </div>`;
}

function bindAdminAccounts(seq) {
  const listEl = app.querySelector("[data-admins]");
  const listError = app.querySelector("[data-admins-error]");
  const form = app.querySelector("#add-admin-form");
  const errorEl = form.querySelector("[data-error]");
  const submit = form.querySelector('button[type="submit"]');
  let accounts = [];

  const show = (list) => {
    accounts = list;
    listEl.innerHTML = list.map(adminRowHtml).join("");
  };

  callAdmins({ action: "list" }).then((result) => {
    if (seq !== renderSeq) return;
    if (result.error) {
      listEl.innerHTML = "";
      return showError(listError, result.error);
    }
    show(result.admins);
  });

  listEl.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-remove]");
    if (!button) return;
    const account = accounts.find((item) => item.id === button.dataset.remove);
    const name = account?.email ?? "akun ini";
    if (!window.confirm(`Cabut akses ${name}? Akunnya dihapus dan langsung tidak bisa membuka admin.`)) return;
    button.disabled = true;
    listError.hidden = true;
    const result = await callAdmins({ action: "remove", user_id: button.dataset.remove });
    if (seq !== renderSeq) return;
    if (result.error) {
      button.disabled = false;
      return showError(listError, result.error);
    }
    show(result.admins);
    toast(`Akses ${name} dicabut`);
  });

  form.querySelector("[data-generate]").addEventListener("click", () => {
    form.elements.password.value = randomPassword();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    form.querySelector("[data-created]")?.remove();
    const email = form.elements.email.value.trim().toLowerCase();
    const password = form.elements.password.value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError(errorEl, "Email tidak valid.");
    if (password.length < PASSWORD_MIN) {
      return showError(errorEl, `Sandi sementara minimal ${PASSWORD_MIN} karakter.`);
    }
    if (password.length > PASSWORD_MAX) {
      return showError(errorEl, `Sandi sementara maksimal ${PASSWORD_MAX} karakter.`);
    }

    submit.disabled = true;
    submit.textContent = "Menambah akun…";
    const result = await callAdmins({ action: "create", email, password });
    submit.disabled = false;
    submit.textContent = "Tambah akun";
    if (seq !== renderSeq) return;
    if (result.error) return showError(errorEl, result.error);

    show(result.admins);
    form.reset();
    // Sandi sementara hanya tampil di sini, jadi admin perlu menyalinnya sekarang.
    submit.insertAdjacentHTML(
      "beforebegin",
      `<p class="notice ok" data-created>Akun <strong>${esc(email)}</strong> dibuat dengan sandi sementara
        <span class="code">${esc(password)}</span>. Kirim ke orangnya, lalu minta dia mengganti sandi di halaman Akun.</p>`
    );
  });
}

async function renderAccount() {
  const seq = ++renderSeq;
  app.innerHTML = `<p class="page muted">Memuat…</p>`;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (seq !== renderSeq) return;
  const email = session?.user?.email ?? "";

  app.innerHTML = `
    <section class="page">
      <h1>Akun</h1>
      <p class="small muted">Masuk sebagai <strong>${esc(email)}</strong></p>
      <form id="password-form" class="card stack" novalidate>
        <h2>Ganti sandi</h2>
        <input type="email" name="username" autocomplete="username" value="${esc(email)}" hidden readonly />
        <label class="field">
          <span>Sandi lama</span>
          <input class="input" type="password" name="current" autocomplete="current-password" required />
        </label>
        <label class="field">
          <span>Sandi baru</span>
          <input class="input" type="password" name="next" autocomplete="new-password" required />
          <span class="small muted">Minimal ${PASSWORD_MIN} karakter, maksimal ${PASSWORD_MAX}.</span>
        </label>
        <label class="field">
          <span>Ulangi sandi baru</span>
          <input class="input" type="password" name="repeat" autocomplete="new-password" required />
        </label>
        <p class="small muted">Setelah sandi diganti, perangkat lain yang masih masuk akan dikeluarkan.</p>
        <p class="error" data-error hidden></p>
        <button class="btn primary full" type="submit">Ganti sandi</button>
      </form>
      <div class="card stack">
        <h2>Akun admin</h2>
        <p class="small muted">Semua akun admin punya akses yang sama, termasuk menambah dan mencabut akun.</p>
        <div class="admin-list" data-admins><p class="small muted">Memuat…</p></div>
        <p class="error" data-admins-error hidden></p>
      </div>
      <form id="add-admin-form" class="card stack" novalidate>
        <h2>Tambah akun</h2>
        <label class="field">
          <span>Email</span>
          <input class="input" type="email" name="email" autocomplete="off" required />
        </label>
        <div class="field">
          <label class="label" for="new-admin-password">Sandi sementara</label>
          <div class="row">
            <input class="input" id="new-admin-password" type="text" name="password" autocomplete="off" spellcheck="false" required />
            <button class="btn" type="button" data-generate>Buat acak</button>
          </div>
          <span class="small muted">Berikan email dan sandi ini ke orangnya, lalu minta dia menggantinya di halaman Akun.</span>
        </div>
        <p class="error" data-error hidden></p>
        <button class="btn primary full" type="submit">Tambah akun</button>
      </form>
    </section>`;

  bindAdminAccounts(seq);

  const form = app.querySelector("#password-form");
  const fields = form.elements;
  const errorEl = form.querySelector("[data-error]");
  const button = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    const values = { current: fields.current.value, next: fields.next.value, repeat: fields.repeat.value };
    const problem = passwordChangeProblem(values);
    if (problem) return showError(errorEl, problem);

    button.disabled = true;
    button.textContent = "Mengganti sandi…";
    const done = () => {
      button.disabled = false;
      button.textContent = "Ganti sandi";
    };

    // Masuk ulang memastikan sandi lama benar dan memberi sesi baru, karena
    // Supabase bisa meminta sesi yang belum lama dibuat untuk ganti sandi.
    const { error: checkError } = await supabase.auth.signInWithPassword({ email, password: values.current });
    if (checkError) {
      done();
      return showError(errorEl, currentPasswordErrorMessage(checkError));
    }
    const { error: updateError } = await supabase.auth.updateUser({
      password: values.next,
      current_password: values.current,
    });
    if (updateError) {
      done();
      return showError(errorEl, passwordErrorMessage(updateError));
    }
    markActive();

    const { error: othersError } = await supabase.auth.signOut({ scope: "others" });
    form.reset();
    done();
    if (othersError) {
      return showError(
        errorEl,
        "Sandi sudah diganti, tapi perangkat lain gagal dikeluarkan. Tekan Keluar di perangkat itu."
      );
    }
    toast("Sandi diganti. Perangkat lain sudah dikeluarkan.");
  });
}

// Rute -----------------------------------------------------------------------

function route() {
  if (!state.signedIn) return renderLogin();
  const path = location.hash.replace(/^#/, "") || "/";
  const uuid = "([0-9a-f-]{36})";
  let match;
  state.printTitle = null;

  const section =
    path === "/akun" ? "akun" : path === "/menu" || path.startsWith("/menu/") ? "menu" : "pesanan";
  topbar.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === section) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  if (path === "/") return renderList();
  if (path === "/akun") return renderAccount();
  if (path === "/menu") return renderMenu();
  if (path === "/menu/baru") return renderMenuForm(null);
  if ((match = path.match(/^\/menu\/([a-z0-9-]+)$/))) return renderMenuForm(match[1]);
  if (path === "/baru") return renderForm(null);
  if ((match = path.match(new RegExp(`^/pesanan/${uuid}$`)))) return renderDetail(match[1]);
  if ((match = path.match(new RegExp(`^/pesanan/${uuid}/ubah$`)))) return renderForm(match[1]);
  if ((match = path.match(new RegExp(`^/pesanan/${uuid}/tagihan$`)))) return renderInvoiceForm(match[1]);
  if ((match = path.match(new RegExp(`^/tagihan/${uuid}$`)))) return renderInvoiceDoc(match[1]);
  location.hash = "#/";
}

window.addEventListener("beforeprint", () => {
  if (state.printTitle) document.title = state.printTitle;
});
window.addEventListener("afterprint", syncTitle);

window.addEventListener("hashchange", () => {
  if (state.signedIn) route();
});

document.getElementById("logout").addEventListener("click", () => signOut("Anda sudah keluar."));

menuToggle.addEventListener("click", () => setMenu(navMenu.hidden));
navMenu.addEventListener("click", (event) => {
  if (event.target.closest("a, button")) setMenu(false);
});
document.addEventListener("click", (event) => {
  if (!navMenu.hidden && !event.target.closest("#nav-menu, #menu-toggle")) setMenu(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || navMenu.hidden) return;
  setMenu(false);
  menuToggle.focus();
});

// Titik kuning berarti bunyi menyala tapi belum diizinkan browser; ketukan
// pada lonceng saat itu menyalakan bunyi, bukan mematikannya.
["pointerdown", "keydown"].forEach((type) => {
  soundToggle.addEventListener(type, () => {
    soundToggle.dataset.wasLocked = String(soundLocked());
  });
});
soundToggle.addEventListener("click", async () => {
  if (soundToggle.dataset.wasLocked !== "true") soundOn = !soundOn;
  delete soundToggle.dataset.wasLocked;
  localStorage.setItem(SOUND_KEY, soundOn ? "on" : "off");
  if (soundOn) {
    await unlockSound();
    playChime();
  }
  syncBell();
  toast(soundOn ? "Bunyi pesanan baru menyala" : "Bunyi pesanan baru dimatikan");
});
syncBell();

["pointerdown", "keydown"].forEach((type) => {
  document.addEventListener(type, noteActivity, { passive: true });
  document.addEventListener(type, unlockSound, { passive: true });
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  checkIdle();
  checkRevoked();
  checkNewOrders();
});
setInterval(checkIdle, 60_000);

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT" && state.signedIn) {
    state.signedIn = false;
    renderLogin("Sesi berakhir. Silakan masuk lagi.");
  }
});

async function boot() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return renderLogin();
  if (idleExpired()) return signOut(IDLE_MESSAGE);
  if (await sessionRevoked()) return signOut(REVOKED_MESSAGE);

  const access = await confirmAdmin();
  if (access !== true) return renderLogin(access);

  markActive();
  await enterAdmin();
}

boot();
