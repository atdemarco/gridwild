// -----------------------------------------------------------------------------
// GridWild Outfitter: lightweight merch storefront
// -----------------------------------------------------------------------------

(function () {
  const PRODUCTS = [
    {
      id: "gw-backpack-ask",
      name: "GridWild Field Backpack",
      campaign: "GridWild Core",
      price: 68,
      image: "",
      description: `Durable field backpack with rear text: “ASK ME WHAT I'M LOOKING FOR”.`
    },
    {
      id: "gw-hat-core",
      name: "GridWild Survey Cap",
      campaign: "GridWild Core",
      price: 28,
      image: "",
      description: "Low-profile field cap for walks, surveys, and casual ecological lurking."
    },
    {
      id: "gw-patch-georgetown-ark",
      name: "Georgetown Ark Project Patch",
      campaign: "Georgetown Ark Project",
      price: 9,
      image: "",
      description: "Campaign patch for repping urban biodiversity and campus-scale conservation."
    },
    {
      id: "gw-shirt-fog",
      name: "Fog of War Cleared Tee",
      campaign: "GridWild Core",
      price: 34,
      image: "",
      description: "Soft field shirt for people who know every unmapped square is a dare."
    },
    {
      id: "gw-bottle-wildsumaco",
      name: "WildSumaco Expedition Bottle",
      campaign: "WildSumaco Research Station",
      price: 32,
      image: "",
      description: "Campaign-branded water bottle for cloud forest walks and field days."
    }
  ];

  let cart = {};

  function money(n) {
    return `$${Number(n || 0).toFixed(2)}`;
  }

  function cartCount() {
    return Object.values(cart).reduce((a, b) => a + b, 0);
  }

  function cartTotal() {
    return PRODUCTS.reduce((sum, p) => sum + p.price * (cart[p.id] || 0), 0);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderProduct(p) {
    const qty = cart[p.id] || 0;

    return `
      <div class="gw-shop-product">
        <div class="gw-shop-img">
          ${p.image
            ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}">`
            : `<div class="gw-shop-placeholder">IMAGE<br>PLACEHOLDER</div>`
          }
        </div>

        <div class="gw-shop-info">
          <div class="gw-shop-name">${escapeHtml(p.name)}</div>
          <div class="gw-shop-campaign">${escapeHtml(p.campaign)}</div>
          <div class="gw-shop-desc">${escapeHtml(p.description)}</div>

          <div class="gw-shop-buyrow">
            <span class="gw-shop-price">${money(p.price)}</span>

            <div class="gw-shop-stepper">
              <button class="gw-mini-btn gw-shop-minus" data-product-id="${p.id}">−</button>
              <span class="gw-shop-qty">${qty}</span>
              <button class="gw-mini-btn gw-shop-plus" data-product-id="${p.id}">+</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderCartSummary() {
    const count = cartCount();
    const total = cartTotal();

    return `
      <div class="gw-card gw-shop-cart">
        <div class="gw-card-title">Cart</div>

        <div class="gw-rowline">
          <span>Items</span>
          <span class="gw-muted">${count}</span>
        </div>

        <div class="gw-rowline">
          <span>Total</span>
          <span class="gw-shop-total">${money(total)}</span>
        </div>

        <button class="gw-mini-btn gw-shop-checkout" disabled title="Checkout is not enabled yet.">
          Checkout Coming Soon
        </button>

        <div class="gw-muted" style="font-size:11px;line-height:1.35;margin-top:8px;">
          Physical gear only. No in-game performance rewards, unlocks, or pay-to-win mechanics.
        </div>
      </div>
    `;
  }

  function renderOutfitterPage() {
    return `
      <div class="gw-card">
        <div class="gw-card-title">Outfitter</div>
        <div class="gw-muted" style="font-size:12px;line-height:1.4;">
          Field gear and campaign merch for repping GridWild in the real world.
        </div>
      </div>

      <div class="gw-shop-grid">
        ${PRODUCTS.map(renderProduct).join("")}
      </div>

      ${renderCartSummary()}
    `;
  }

  function bindOutfitter(root = document) {
    root.querySelectorAll(".gw-shop-plus").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.productId;
        cart[id] = (cart[id] || 0) + 1;
        refresh();
      });
    });

    root.querySelectorAll(".gw-shop-minus").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.productId;
        cart[id] = Math.max(0, (cart[id] || 0) - 1);
        if (cart[id] === 0) delete cart[id];
        refresh();
      });
    });
  }

  function refresh() {
    const host = document.getElementById("gwOutfitterBody");
    if (!host) return;

    host.innerHTML = renderOutfitterPage();
    bindOutfitter(host);
  }

  window.GridWildOutfitter = {
    renderButtonHtml() {
      return `
        <div class="gw-card">
          <div class="gw-card-title">Outfitter</div>
          <div class="gw-muted" style="font-size:12px;line-height:1.35;margin-bottom:10px;">
            Physical GridWild gear, campaign patches, and field merch.
          </div>
          <button class="gw-mini-btn" id="gwOpenOutfitterBtn">
            Open Outfitter
          </button>
        </div>
      `;
    },

    renderPageHtml() {
      return `<div id="gwOutfitterBody">${renderOutfitterPage()}</div>`;
    },

    bind(root = document) {
      const btn = root.getElementById
        ? root.getElementById("gwOpenOutfitterBtn")
        : document.getElementById("gwOpenOutfitterBtn");

      if (btn) {
        btn.onclick = () => {
          const body = document.getElementById("sheetMeBody");
          if (!body) return;

          body.innerHTML = `
            <div class="gw-card">
              <button class="gw-mini-btn" id="gwBackToMeBtn">← Back to ME</button>
            </div>
            ${window.GridWildOutfitter.renderPageHtml()}
          `;

          document.getElementById("gwBackToMeBtn")?.addEventListener("click", () => {
            if (typeof window.initGridWildMobilePanels === "function") {
              window.initGridWildMobilePanels();
            }
          });

          bindOutfitter(document);
        };
      }

      bindOutfitter(document);
    }
  };
})();