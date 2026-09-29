const qtyState = {};
const priceState = {};
let heroInView = true;
// Isi awal dari js/products.js; diganti isi database begitu termuat.
let products = window.TETUTI_PRODUCTS.slice();

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

// Sama dengan pratinjau harga di halaman admin (admin/lib.js).
function priceLabel(id) {
  const entry = priceState[id];
  if (!entry || entry.price == null) return "Harga via WhatsApp";
  const amount = rupiah.format(entry.price);
  return entry.unit ? `${amount} / ${entry.unit}` : amount;
}

const MENU_COLUMNS = "id,name,category,badge,hook,description,highlights,image_url,price,unit";

// Kalau Supabase lambat atau gagal, kartu dari js/products.js tetap tampil
// dengan tulisan "Harga via WhatsApp".
async function loadMenu() {
  const { supabaseUrl, supabaseKey } = window.TETUTI;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/menu_items?select=${MENU_COLUMNS}&order=sort_order,name`,
      { headers: { apikey: supabaseKey }, signal: controller.signal }
    );
    if (!response.ok) return;
    const rows = await response.json();
    products = rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      badge: row.badge,
      hook: row.hook,
      desc: row.description,
      highlights: row.highlights,
      image: row.image_url,
    }));
    rows.forEach((row) => {
      priceState[row.id] = { price: row.price, unit: row.unit };
    });
    renderProducts({ live: true });
    document.dispatchEvent(new CustomEvent("tetuti:cards"));
    injectStructuredData();
    syncCheckout();
  } catch {
    // Tetap dengan kartu bawaan.
  } finally {
    clearTimeout(timer);
    document.querySelectorAll("[data-price].is-loading").forEach((el) => {
      el.textContent = priceLabel(el.dataset.price);
      el.classList.remove("is-loading");
    });
  }
}

function waLink(text) {
  const phone = window.TETUTI.whatsappNumber.replace(/\D/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function cartLines() {
  return products.map((product) => ({
    product,
    qty: qtyState[product.id] || 0,
  })).filter((line) => line.qty > 0);
}

function orderMessage(lines) {
  const items = lines.map((line) => {
    const price = priceState[line.product.id]?.price;
    return `• ${line.qty}x ${line.product.name}${price == null ? "" : ` (${priceLabel(line.product.id)})`}`;
  });
  return [
    `Halo ${window.TETUTI.storeName}`,
    "",
    "Saya ingin pesan:",
    ...items,
    "",
    "Mohon info harga, ketersediaan, dan ongkirnya. Terima kasih.",
  ].join("\n");
}

function renderProducts({ live = false } = {}) {
  const root = document.getElementById("product-grid");
  // Animasi masuk kartu hanya jalan sekali. Kartu pengganti yang datang
  // sesudahnya langsung ditampilkan supaya tidak tertahan transparan.
  const first = root.querySelector(".card");
  const shown = Boolean(first) && getComputedStyle(first).opacity !== "0";

  if (products.length === 0) {
    root.innerHTML = `<p class="grid-empty">Menu sedang disiapkan. Tanya menu hari ini lewat WhatsApp.</p>`;
    return;
  }

  root.innerHTML = products.map((item, index) => {
    const qty = qtyState[item.id] || 0;
    const id = esc(item.id);
    const points = (item.highlights || [])
      .map((line) => `<li>${esc(line)}</li>`)
      .join("");
    const media = item.image
      ? `<img src="${esc(item.image)}" alt="${esc(item.name)}">`
      : `<img class="no-photo" src="assets/logo-cabai.svg" alt="">`;
    return `
      <article class="card card-${index}${shown ? " is-live" : ""}">
        <div class="card-media">
          ${item.badge ? `<span class="badge">${esc(item.badge)}</span>` : ""}
          ${media}
        </div>
        <div class="card-body">
          ${item.hook ? `<p class="hook">${esc(item.hook)}</p>` : ""}
          <h3>${esc(item.name)}</h3>
          ${item.desc ? `<p>${esc(item.desc)}</p>` : ""}
          ${points ? `<ul class="highlights">${points}</ul>` : ""}
          <div class="price${live ? "" : " is-loading"}" data-price="${id}">${esc(priceLabel(item.id))}</div>
          <div class="card-actions">
            <div class="qty">
              <button type="button" data-qty="${id}" data-delta="-1" aria-label="Kurangi" ${qty === 0 ? "disabled" : ""}>−</button>
              <span id="qty-${id}">${qty}</span>
              <button type="button" data-qty="${id}" data-delta="1" aria-label="Tambah">+</button>
            </div>
            <button class="btn btn-primary" type="button" data-order="${id}">Pesan</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function syncCheckout() {
  const lines = cartLines();
  const bar = document.querySelector(".checkout");
  const summary = document.querySelector(".checkout-summary");
  const button = document.querySelector("[data-checkout]");
  const hasCart = lines.length > 0;

  if (bar) {
    bar.hidden = !hasCart;
    bar.classList.toggle("is-visible", hasCart);
  }

  if (summary) {
    summary.textContent = hasCart
      ? lines.map((line) => `${line.qty}× ${line.product.name}`).join(" · ")
      : "";
  }

  if (button) button.disabled = !hasCart;

  document.body.classList.toggle("has-checkout", hasCart);
  updateDock();
}

function bindGrid() {
  document.getElementById("product-grid").addEventListener("click", (event) => {
    const qtyBtn = event.target.closest("[data-qty]");
    const orderBtn = event.target.closest("[data-order]");

    if (qtyBtn) {
      const id = qtyBtn.dataset.qty;
      const next = Math.max(0, (qtyState[id] || 0) + Number(qtyBtn.dataset.delta));
      qtyState[id] = next;
      const label = document.getElementById(`qty-${id}`);
      if (label) label.textContent = String(next);
      const minus = qtyBtn.parentElement?.querySelector("[data-delta='-1']");
      if (minus) minus.disabled = next === 0;
      syncCheckout();
    }

    if (orderBtn) {
      const product = products.find((item) => item.id === orderBtn.dataset.order);
      if (product) openOrder([{ product, qty: qtyState[product.id] || 1 }]);
    }
  });

  document.querySelector("[data-checkout]")?.addEventListener("click", () => {
    const lines = cartLines();
    if (lines.length) openOrder(lines);
  });
}

// Form pesanan ----------------------------------------------------------------

let orderLines = [];

function normalizePhone(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  return digits;
}

function linesSubtotal(lines) {
  if (lines.some((line) => priceState[line.product.id]?.price == null)) return null;
  return lines.reduce((sum, line) => sum + priceState[line.product.id].price * line.qty, 0);
}

function openOrder(lines) {
  const sheet = document.getElementById("order-sheet");
  const form = sheet.querySelector("[data-order-form]");
  orderLines = lines.map((line) => ({ ...line }));

  sheet.querySelector("[data-order-lines]").innerHTML = orderLines
    .map((line) => {
      const price = priceState[line.product.id]?.price;
      const amount = price == null ? "Harga via WhatsApp" : rupiah.format(price * line.qty);
      return `<li><span>${line.qty}× ${esc(line.product.name)}</span><span>${amount}</span></li>`;
    })
    .join("");

  const subtotal = linesSubtotal(orderLines);
  sheet.querySelector("[data-order-total]").textContent =
    subtotal == null
      ? "Harga sebagian menu dikonfirmasi lewat WhatsApp."
      : `Total sementara ${rupiah.format(subtotal)}, belum termasuk ongkir.`;

  form.hidden = false;
  sheet.querySelector("[data-order-done]").hidden = true;
  sheet.querySelector("[data-order-error]").hidden = true;
  form.querySelector('[type="submit"]').disabled = false;
  sheet.showModal();
}

function showOrderError(text, withWhatsApp) {
  const el = document.querySelector("[data-order-error]");
  el.textContent = text;
  if (withWhatsApp) {
    const link = document.createElement("a");
    link.href = waLink(orderMessage(orderLines));
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Pesan lewat WhatsApp";
    el.append(" ", link);
  }
  el.hidden = false;
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

async function sendOrder(payload) {
  const { supabaseUrl, supabaseKey } = window.TETUTI;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/submit_order`, {
      method: "POST",
      headers: { apikey: supabaseKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    if (response.ok && body) return { data: body };
    // Pesan dari fungsi database (kode P0001) sudah berbahasa Indonesia.
    return { error: body?.code === "P0001" ? body.message : "Pesanan gagal dikirim." };
  } catch {
    return { error: "Tidak tersambung ke server. Periksa internet lalu coba lagi." };
  } finally {
    clearTimeout(timer);
  }
}

function clearOrderedQty(lines) {
  lines.forEach(({ product }) => {
    qtyState[product.id] = 0;
    const label = document.getElementById(`qty-${product.id}`);
    if (label) label.textContent = "0";
    const minus = document.querySelector(`[data-qty="${product.id}"][data-delta="-1"]`);
    if (minus) minus.disabled = true;
  });
  syncCheckout();
}

function bindOrderSheet() {
  const sheet = document.getElementById("order-sheet");
  const form = sheet.querySelector("[data-order-form]");
  const fields = form.elements;
  const addressEl = form.querySelector("[data-address]");
  const done = sheet.querySelector("[data-order-done]");

  const syncAddress = () => {
    addressEl.hidden = fields.fulfillment.value !== "antar";
  };
  form.querySelectorAll('[name="fulfillment"]').forEach((radio) => {
    radio.addEventListener("change", syncAddress);
  });

  sheet.querySelectorAll("[data-sheet-close]").forEach((button) => {
    button.addEventListener("click", () => sheet.close());
  });
  sheet.addEventListener("click", (event) => {
    if (event.target === sheet) sheet.close();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    sheet.querySelector("[data-order-error]").hidden = true;

    const name = fields.name.value.trim();
    const phone = normalizePhone(fields.phone.value);
    const fulfillment = fields.fulfillment.value;
    const address = fields.address.value.trim();

    if (!name) return showOrderError("Nama wajib diisi.");
    if (!/^62[0-9]{8,13}$/.test(phone)) {
      return showOrderError("Nomor WhatsApp tidak valid. Contoh: 0812 3456 7890.");
    }
    if (fulfillment === "antar" && !address) {
      return showOrderError("Alamat wajib diisi untuk pesanan antar.");
    }

    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.textContent = "Mengirim…";
    const result = await sendOrder({
      customer_name: name,
      customer_phone: phone,
      fulfillment,
      address: fulfillment === "antar" ? address : null,
      note: fields.note.value.trim() || null,
      items: orderLines.map((line) => ({ menu_item_id: line.product.id, quantity: line.qty })),
      website: fields.website.value,
    });
    submit.disabled = false;
    submit.textContent = "Kirim pesanan";

    if (result.error) return showOrderError(result.error, true);

    sheet.querySelector("[data-order-code]").textContent = result.data.code;
    sheet.querySelector("[data-order-done-total]").textContent =
      result.data.subtotal == null
        ? "Harga dan ongkir dikonfirmasi lewat WhatsApp."
        : `Total sementara ${rupiah.format(result.data.subtotal)}, belum termasuk ongkir.`;
    sheet.querySelector("[data-order-phone]").textContent = phone.replace(/^62/, "0");
    form.hidden = true;
    done.hidden = false;
    clearOrderedQty(orderLines);
    fields.note.value = "";
  });
}

function hydrateBrand() {
  const { storeName, tagline, hours, area, whatsappNumber } = window.TETUTI;
  document.querySelectorAll("[data-store]").forEach((el) => {
    el.textContent = storeName;
  });
  document.querySelectorAll("[data-tagline]").forEach((el) => {
    el.textContent = tagline;
  });
  document.querySelectorAll("[data-hours]").forEach((el) => {
    el.textContent = hours;
  });
  document.querySelectorAll("[data-area]").forEach((el) => {
    el.textContent = area;
  });

  const chat = waLink(`Halo ${storeName}, saya mau tanya menu dan ketersediaan.`);
  document.querySelectorAll("[data-wa-chat]").forEach((el) => {
    el.setAttribute("href", chat);
  });

  document.querySelectorAll("[data-phone]").forEach((el) => {
    el.textContent = whatsappNumber.replace(/^62/, "0");
  });
}

// Data terstruktur untuk Google, dibangun dari config + daftar produk supaya
// tidak perlu diperbarui manual setiap ada produk baru.
function injectStructuredData() {
  const { siteUrl, storeName, tagline, city, whatsappNumber } = window.TETUTI;
  const absolute = (path) => (/^https?:/.test(path) ? path : `${siteUrl}/${path.replace(/^\//, "")}`);
  const phone = whatsappNumber.replace(/\D/g, "");

  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FoodEstablishment",
        "@id": `${siteUrl}/#business`,
        name: storeName,
        description: tagline,
        url: `${siteUrl}/`,
        image: absolute("assets/og-image.jpg"),
        logo: absolute("assets/logo-cabai.png"),
        telephone: `+${phone}`,
        servesCuisine: "Indonesian",
        areaServed: city,
        availableLanguage: "id",
        sameAs: [`https://wa.me/${phone}`],
        hasMenu: { "@id": `${siteUrl}/#menu` },
      },
      {
        // Dipakai MenuItem, bukan Product, karena Product wajib punya harga
        // sementara harga di sini ditanyakan lewat WhatsApp.
        "@type": "Menu",
        "@id": `${siteUrl}/#menu`,
        name: `Menu ${storeName}`,
        hasMenuSection: [...new Set(products.map((item) => item.category))].map(
          (category) => ({
            "@type": "MenuSection",
            name: category.charAt(0).toUpperCase() + category.slice(1),
            hasMenuItem: products.filter((item) => item.category === category).map(
              (item) => ({
                "@type": "MenuItem",
                name: item.name,
                description: item.desc || undefined,
                image: item.image ? absolute(item.image) : undefined,
              })
            ),
          })
        ),
      },
    ],
  };

  document.getElementById("structured-data")?.remove();
  const script = document.createElement("script");
  script.id = "structured-data";
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

// Hero ditarik ke belakang navbar, jadi tingginya perlu diketahui CSS.
function syncNavHeight() {
  const nav = document.querySelector(".nav");
  if (!nav) return;

  const apply = () => {
    document.documentElement.style.setProperty("--nav-h", `${Math.round(nav.offsetHeight)}px`);
  };

  apply();
  window.addEventListener("resize", apply, { passive: true });
}

function updateDock() {
  const dock = document.querySelector(".wa-dock");
  const navChat = document.querySelector(".nav-chat");
  if (!dock) return;

  const showDock = !heroInView && cartLines().length === 0;
  dock.classList.toggle("is-visible", showDock);
  dock.setAttribute("aria-hidden", showDock ? "false" : "true");
  dock.tabIndex = showDock ? 0 : -1;
  if (navChat) {
    navChat.classList.toggle("is-hidden", showDock);
    navChat.setAttribute("aria-hidden", showDock ? "true" : "false");
    navChat.tabIndex = showDock ? -1 : 0;
  }
}

function bindWaDock() {
  const hero = document.getElementById("beranda");
  if (!hero) return;

  const observer = new IntersectionObserver(
    ([entry]) => {
      heroInView = entry.isIntersecting;
      updateDock();
    },
    { threshold: 0.18 }
  );
  observer.observe(hero);
}

function bindNavSpy() {
  const links = [...document.querySelectorAll(".nav-text[href^='#']")];
  const sections = links
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  const setActive = (id) => {
    links.forEach((link) => {
      const on = link.getAttribute("href") === `#${id}`;
      link.classList.toggle("is-active", on);
      if (on) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  };

  const update = () => {
    const marker = window.scrollY + Math.min(220, window.innerHeight * 0.28);
    let current = sections[0]?.id || "beranda";
    sections.forEach((section) => {
      if (section.offsetTop <= marker) current = section.id;
    });
    setActive(current);
  };

  links.forEach((link) => {
    link.addEventListener("click", () => {
      const id = link.getAttribute("href")?.slice(1);
      if (id) setActive(id);
    });
  });

  update();
  window.addEventListener("scroll", update, { passive: true });
}

hydrateBrand();
injectStructuredData();
syncNavHeight();
renderProducts();
loadMenu();
bindGrid();
bindOrderSheet();
bindWaDock();
bindNavSpy();
syncCheckout();
