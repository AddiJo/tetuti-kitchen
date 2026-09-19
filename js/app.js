const qtyState = {};
let heroInView = true;

function waLink(text) {
  const phone = window.TETUTI.whatsappNumber.replace(/\D/g, "");
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function cartLines() {
  return window.TETUTI_PRODUCTS.map((product) => ({
    product,
    qty: qtyState[product.id] || 0,
  })).filter((line) => line.qty > 0);
}

function orderMessage(lines) {
  const items = lines.map((line) => `• ${line.qty}x ${line.product.name}`);
  return [
    `Halo ${window.TETUTI.storeName}`,
    "",
    "Saya ingin pesan:",
    ...items,
    "",
    "Mohon info harga, ketersediaan, dan ongkirnya. Terima kasih.",
  ].join("\n");
}

function renderProducts() {
  const root = document.getElementById("product-grid");
  root.innerHTML = window.TETUTI_PRODUCTS.map((item, index) => {
    const qty = qtyState[item.id] || 0;
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
              <button type="button" data-qty="${item.id}" data-delta="-1" aria-label="Kurangi" ${qty === 0 ? "disabled" : ""}>−</button>
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

  if (button) {
    if (hasCart) {
      button.setAttribute("href", waLink(orderMessage(lines)));
      button.setAttribute("target", "_blank");
      button.setAttribute("rel", "noopener");
    } else {
      button.setAttribute("href", "#");
      button.removeAttribute("target");
    }
  }

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
      const product = window.TETUTI_PRODUCTS.find((item) => item.id === orderBtn.dataset.order);
      const qty = qtyState[product.id] || 1;
      window.open(waLink(orderMessage([{ product, qty }])), "_blank", "noopener");
    }
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
  const absolute = (path) => `${siteUrl}/${path.replace(/^\//, "")}`;
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
      },
      {
        "@type": "ItemList",
        name: `Menu ${storeName}`,
        itemListElement: window.TETUTI_PRODUCTS.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "Product",
            name: item.name,
            description: item.desc,
            image: absolute(item.image),
            category: item.category,
            brand: { "@type": "Brand", name: storeName },
          },
        })),
      },
    ],
  };

  const script = document.createElement("script");
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
bindGrid();
bindWaDock();
bindNavSpy();
syncCheckout();
