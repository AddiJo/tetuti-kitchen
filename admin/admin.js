import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config.js";
import {
  displayPhone,
  errorMessage,
  esc,
  formatDate,
  formatRp,
  fromJakartaInput,
  isValidPhone,
  loginErrorMessage,
  normalizePhone,
  parseRupiah,
  priceLabel,
  toJakartaInput,
} from "./lib.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Paket gratis Supabase tidak punya batas sesi, jadi batas 12 jam tidak
// dipakai dijalankan di sini.
const IDLE_LIMIT_MS = 12 * 60 * 60 * 1000;
const LAST_ACTIVE_KEY = "tetuti-admin-last-active";
const IDLE_MESSAGE = "Sesi habis karena 12 jam tidak dipakai. Silakan masuk lagi.";

const FLOW = ["baru", "dikonfirmasi", "diproses", "siap", "selesai"];
const STATUS_LABEL = {
  baru: "Baru",
  dikonfirmasi: "Dikonfirmasi",
  diproses: "Diproses",
  siap: "Siap",
  selesai: "Selesai",
  batal: "Batal",
};
const NEXT_LABEL = {
  baru: "Konfirmasi pesanan",
  dikonfirmasi: "Tandai Diproses",
  diproses: "Tandai Siap",
  siap: "Tandai Selesai",
};
const FILTERS = ["aktif", ...FLOW, "batal"];
const FILTER_LABEL = { aktif: "Aktif", ...STATUS_LABEL };

const app = document.getElementById("app");
const topbar = document.getElementById("topbar");
const toastEl = document.getElementById("toast");
const cancelDialog = document.getElementById("cancel-dialog");

const state = {
  signedIn: false,
  menu: [],
  filter: "aktif",
  search: "",
  flash: null,
  cancelOrderId: null,
};

// Setiap render menaikkan nomor ini; hasil fetch yang datang setelah pindah
// halaman dibuang supaya tidak menimpa halaman yang sedang dibuka.
let renderSeq = 0;
let listSeq = 0;
let lastMark = 0;
let toastTimer = 0;

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
    .select("id, name, is_active, price, unit")
    .order("sort_order");
  if (error) toast(`Menu gagal dimuat. ${errorMessage(error)}`);
  else state.menu = data;
  return error;
}

async function enterAdmin() {
  state.signedIn = true;
  topbar.hidden = false;
  await loadMenu();
  route();
}

async function signOut(notice) {
  state.signedIn = false;
  localStorage.removeItem(LAST_ACTIVE_KEY);
  await supabase.auth.signOut({ scope: "local" });
  renderLogin(notice);
}

function renderLogin(notice) {
  state.signedIn = false;
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
      <div class="chips" role="group" aria-label="Filter status">
        ${FILTERS.map(
          (filter) => `<button type="button" class="chip" data-filter="${filter}"
            aria-pressed="${filter === state.filter}">${FILTER_LABEL[filter]}</button>`
        ).join("")}
      </div>
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

  app.querySelectorAll("[data-filter]").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.filter = chip.dataset.filter;
      app.querySelectorAll("[data-filter]").forEach((other) => {
        other.setAttribute("aria-pressed", String(other === chip));
      });
      loadOrders(seq);
    });
  });

  loadOrders(seq);
}

async function loadOrders(seq) {
  const mine = ++listSeq;
  let query = supabase
    .from("order_summaries")
    .select("id, code, customer_name, fulfillment, requested_at, status, item_count, items_label, total")
    .order("created_at", { ascending: false })
    .limit(100);

  if (state.filter === "aktif") query = query.not("status", "in", "(selesai,batal)");
  else query = query.eq("status", state.filter);

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
        : state.filter === "aktif"
          ? "Belum ada pesanan aktif. Catat pesanan dari chat WhatsApp lewat tombol di bawah."
          : `Belum ada pesanan berstatus ${FILTER_LABEL[state.filter]}.`
    }</p>`;
    return;
  }

  listEl.innerHTML = data.map(orderCard).join("");
}

function orderCard(order) {
  const details = [
    order.items_label || "Belum ada item",
    order.fulfillment === "antar" ? "Antar" : "Pickup",
    order.requested_at ? formatDate(order.requested_at) : "",
  ].filter(Boolean);

  const total =
    order.total != null
      ? `<strong>${formatRp(order.total)}</strong>`
      : `<span class="muted">${order.item_count ? "Harga belum lengkap" : "Belum ada item"}</span>`;

  return `
    <a class="order" href="#/pesanan/${esc(order.id)}">
      <span class="row between"><strong>${esc(order.customer_name)}</strong>${statusPill(order.status)}</span>
      <span class="small">${esc(details.join(" · "))}</span>
      <span class="row between small"><span class="code">${esc(order.code)}</span>${total}</span>
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
    result.data.order_items.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  return result;
}

async function renderDetail(id) {
  const seq = ++renderSeq;
  app.innerHTML = `<p class="page muted">Memuat…</p>`;
  const { data: order, error } = await fetchOrder(id);
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
        order.note
          ? `<div class="card"><span class="label">Catatan</span><p class="note">${esc(order.note)}</p></div>`
          : ""
      }
      <p class="small muted">
        Dicatat ${esc(formatDate(order.created_at))} · status terakhir ${esc(formatDate(order.status_changed_at))}
      </p>
      <p class="error" data-error hidden></p>
      <div class="sticky-actions">${actionsHtml(order, pos)}</div>
    </section>`;

  const errorEl = app.querySelector("[data-error]");

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
      <span>Baru</span><span>Konfirmasi</span><span>Proses</span><span>Siap</span><span>Selesai</span>
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
    return `<button class="btn full" type="button" data-status="siap"
      data-confirm="Buka kembali pesanan ini ke status Siap?">Buka kembali</button>`;
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
  renderDetail(state.cancelOrderId);
});

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

// Menu dan harga ---------------------------------------------------------------

async function renderMenu() {
  const seq = ++renderSeq;
  app.innerHTML = `<p class="page muted">Memuat…</p>`;
  const error = await loadMenu();
  if (seq !== renderSeq) return;
  if (error) return renderProblem(errorMessage(error));

  app.innerHTML = `
    <section class="page has-actions">
      ${flashHtml()}
      <h1>Menu &amp; harga</h1>
      <p class="small muted">
        Harga tampil di kartu situs. Kosongkan harga kalau situs cukup menulis “Harga via WhatsApp”.
        Pesanan yang sudah masuk tidak ikut berubah.
      </p>
      <form id="menu-form" class="stack" novalidate>
        ${state.menu.map(menuRow).join("")}
        <p class="error" data-error hidden></p>
        <div class="sticky-actions">
          <button class="btn primary full" type="submit">Simpan harga</button>
        </div>
      </form>
    </section>`;

  const form = app.querySelector("#menu-form");
  const errorEl = form.querySelector("[data-error]");
  const rows = [...form.querySelectorAll("[data-menu]")];
  const readRow = (row) => ({
    id: row.dataset.menu,
    price: parseRupiah(row.querySelector('[name="price"]').value),
    unit: row.querySelector('[name="unit"]').value.trim() || null,
  });

  form.addEventListener("input", (event) => {
    const row = event.target.closest("[data-menu]");
    if (!row) return;
    const { price, unit } = readRow(row);
    row.querySelector("[data-preview]").textContent = priceLabel(price, unit);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.hidden = true;

    const values = rows.map(readRow);
    const invalid = values.find((value) => value.price != null && (value.price < 1 || value.price > 100_000_000));
    if (invalid) {
      const name = state.menu.find((menu) => menu.id === invalid.id).name;
      return showError(errorEl, `Harga ${name} harus antara Rp1 dan Rp100.000.000. Kosongkan kalau belum ada harga.`);
    }

    const changed = values.filter((value) => {
      const menu = state.menu.find((entry) => entry.id === value.id);
      return menu.price !== value.price || menu.unit !== value.unit;
    });
    if (changed.length === 0) return toast("Tidak ada perubahan");

    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    for (const { id, price, unit } of changed) {
      const { error: updateError } = await supabase.from("menu_items").update({ price, unit }).eq("id", id);
      if (updateError) {
        submit.disabled = false;
        const partial = changed.length > 1 ? " Menu lain mungkin sudah tersimpan; muat ulang untuk memeriksa." : "";
        return showError(errorEl, errorMessage(updateError) + partial);
      }
    }
    toast("Harga disimpan");
    if (seq === renderSeq) renderMenu();
    else loadMenu();
  });
}

function menuRow(menu) {
  return `
    <div class="card" data-menu="${esc(menu.id)}">
      <div class="row between">
        <strong>${esc(menu.name)}</strong>
        ${menu.is_active ? "" : `<span class="small muted">Disembunyikan</span>`}
      </div>
      <div class="menu-fields">
        <label class="field">
          <span>Harga</span>
          <input class="input" name="price" inputmode="numeric" placeholder="Kosong"
            value="${esc(menu.price ?? "")}" />
        </label>
        <label class="field">
          <span>Satuan (opsional)</span>
          <input class="input" name="unit" maxlength="20" placeholder="pack, box, porsi"
            value="${esc(menu.unit ?? "")}" />
        </label>
      </div>
      <span class="small muted">Di situs: <span data-preview>${esc(priceLabel(menu.price, menu.unit))}</span></span>
    </div>`;
}

// Rute -----------------------------------------------------------------------

function route() {
  if (!state.signedIn) return renderLogin();
  const path = location.hash.replace(/^#/, "") || "/";
  const uuid = "([0-9a-f-]{36})";
  let match;

  const section = path === "/menu" ? "menu" : "pesanan";
  topbar.querySelectorAll("[data-nav]").forEach((link) => {
    if (link.dataset.nav === section) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  if (path === "/") return renderList();
  if (path === "/menu") return renderMenu();
  if (path === "/baru") return renderForm(null);
  if ((match = path.match(new RegExp(`^/pesanan/${uuid}$`)))) return renderDetail(match[1]);
  if ((match = path.match(new RegExp(`^/pesanan/${uuid}/ubah$`)))) return renderForm(match[1]);
  location.hash = "#/";
}

window.addEventListener("hashchange", () => {
  if (state.signedIn) route();
});

document.getElementById("logout").addEventListener("click", () => signOut("Anda sudah keluar."));

["pointerdown", "keydown"].forEach((type) => {
  document.addEventListener(type, noteActivity, { passive: true });
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) checkIdle();
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

  const access = await confirmAdmin();
  if (access !== true) return renderLogin(access);

  markActive();
  await enterAdmin();
}

boot();
