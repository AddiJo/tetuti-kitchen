const qtyState = {};

function waLink(text) {
  const phone = window.TETUTI.whatsappNumber.replace(/\D/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function orderMessage(product, qty) {
  return [
    `Halo ${window.TETUTI.storeName}`,
    "",
    "Saya ingin pesan:",
    `• ${qty}x ${product.name}`,
    "",
    "Mohon info harga, ketersediaan, dan ongkirnya. Terima kasih.",
  ].join("\n");
}

function renderProducts() {
  const root = document.getElementById("product-grid");
  root.innerHTML = window.TETUTI_PRODUCTS.map((item, index) => {
    const qty = qtyState[item.id] || 1;
    const points = (item.highlights || [])
      .map((line) => `<li>${line}</li>`)
      .join("");
    return `
      <article class="card card-${index}">
        <div class="card-media">
          <span class="badge">${item.badge}</span>
          <img src="${item.image}" alt="${item.name}">
        </div>
        <div class="card-body">
          <p class="hook">${item.hook}</p>
          <h3>${item.name}</h3>
          <p>${item.desc}</p>
          <ul class="highlights">${points}</ul>
          <div class="price">Harga via WhatsApp</div>
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
  }).join("");
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
  document.title = `${storeName} — Homemade`;
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

hydrateBrand();
renderProducts();
bindGrid();
