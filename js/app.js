const formatRupiah = (n) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

const qtyState = {};

function waLink(text) {
  const phone = window.TETUTI.whatsappNumber.replace(/\D/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function orderMessage(product, qty) {
  const total = product.price * qty;
  return [
    `Halo ${window.TETUTI.storeName}`,
    "",
    "Saya ingin pesan:",
    `• ${qty}x ${product.name} (${formatRupiah(product.price)})`,
    "",
    `Total: ${formatRupiah(total)}`,
    "",
    "Mohon info ketersediaan dan ongkirnya. Terima kasih.",
  ].join("\n");
}

function renderProducts(filter = "semua") {
  const root = document.getElementById("product-grid");
  const items = window.TETUTI_PRODUCTS.filter(
    (item) => filter === "semua" || item.category === filter
  );

  root.innerHTML = items
    .map((item) => {
      const qty = qtyState[item.id] || 1;
      return `
        <article class="card">
          <div class="card-media">
            ${item.badge ? `<span class="badge">${item.badge}</span>` : ""}
            <img src="${item.image}" alt="${item.name}" loading="lazy">
          </div>
          <div class="card-body">
            <h3 class="serif">${item.name}</h3>
            <p>${item.desc}</p>
            <div class="price">${formatRupiah(item.price)}</div>
            <div class="card-actions">
              <div class="qty">
                <button type="button" data-qty="${item.id}" data-delta="-1" aria-label="Kurangi">−</button>
                <span id="qty-${item.id}">${qty}</span>
                <button type="button" data-qty="${item.id}" data-delta="1" aria-label="Tambah">+</button>
              </div>
              <button class="btn btn-primary" type="button" data-order="${item.id}">Pesan</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function bindFilters() {
  document.querySelectorAll(".filter").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter").forEach((el) => el.classList.remove("active"));
      btn.classList.add("active");
      renderProducts(btn.dataset.filter);
    });
  });
}

function bindGrid() {
  document.getElementById("product-grid").addEventListener("click", (event) => {
    const qtyBtn = event.target.closest("[data-qty]");
    const orderBtn = event.target.closest("[data-order]");

    if (qtyBtn) {
      const id = qtyBtn.dataset.qty;
      const next = Math.max(1, (qtyState[id] || 1) + Number(qtyBtn.dataset.delta));
      qtyState[id] = next;
      const label = document.getElementById(`qty-${id}`);
      if (label) label.textContent = String(next);
    }

    if (orderBtn) {
      const product = window.TETUTI_PRODUCTS.find((item) => item.id === orderBtn.dataset.order);
      const qty = qtyState[product.id] || 1;
      window.open(waLink(orderMessage(product, qty)), "_blank", "noopener");
    }
  });
}

function hydrateBrand() {
  const { storeName, tagline, hours, area, whatsappNumber } = window.TETUTI;
  document.title = `${storeName} — ${tagline}`;
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

  const chat = waLink(
    `Halo ${storeName}, saya mau tanya menu dan ketersediaan hari ini.`
  );
  document.querySelectorAll("[data-wa-chat]").forEach((el) => {
    el.setAttribute("href", chat);
  });

  const phonePretty = whatsappNumber.replace(/^62/, "0");
  document.querySelectorAll("[data-phone]").forEach((el) => {
    el.textContent = phonePretty;
  });
}

hydrateBrand();
renderProducts();
bindFilters();
bindGrid();
