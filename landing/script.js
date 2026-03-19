// ══════════════════════════════════════════════════════════════════════════
// Companion Landing Page — Script
// ══════════════════════════════════════════════════════════════════════════

(function () {
  "use strict";

  // ── Theme Toggle ───────────────────────────────────────────────────────
  var toggle = document.getElementById("theme-toggle");
  var html = document.documentElement;

  function setTheme(dark) {
    html.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }

  var saved = localStorage.getItem("theme");
  if (saved === "dark") {
    html.classList.add("dark");
  } else if (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    html.classList.add("dark");
  }

  toggle.addEventListener("click", function () {
    setTheme(!html.classList.contains("dark"));
  });

  // ── Tab Switching ──────────────────────────────────────────────────────
  var tabBtns = document.querySelectorAll(".tab-btn");
  var tabPanels = document.querySelectorAll(".install-panel");

  tabBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = btn.dataset.tab;
      tabBtns.forEach(function (b) { b.classList.remove("active"); });
      tabPanels.forEach(function (p) { p.classList.remove("active"); });
      btn.classList.add("active");
      var panel = document.getElementById("tab-" + target);
      if (panel) panel.classList.add("active");
    });
  });

  // ── Copy Buttons ───────────────────────────────────────────────────────
  document.querySelectorAll(".copy-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var codeBlock = btn.closest(".code-block-lg");
      if (!codeBlock) return;
      var code = codeBlock.querySelector("code");
      if (!code) return;
      var text = code.textContent.replace(/^#.*$/gm, "").replace(/\n{2,}/g, "\n").trim();
      navigator.clipboard.writeText(text).then(function () {
        btn.textContent = "Copied!";
        setTimeout(function () { btn.textContent = "Copy"; }, 2000);
      });
    });
  });

  // ── Scroll Reveal ──────────────────────────────────────────────────────
  var reveals = document.querySelectorAll(
    ".feature-card, .comparison-card, .step-card, .pricing-card, .faq-item, .cta-inner"
  );
  reveals.forEach(function (el) { el.classList.add("reveal"); });

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) entry.target.classList.add("visible");
      });
    },
    { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
  );
  reveals.forEach(function (el) { observer.observe(el); });

  // ── Smooth Scroll ──────────────────────────────────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener("click", function (e) {
      var target = document.querySelector(link.getAttribute("href"));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  // ── Nav Scroll Shadow ──────────────────────────────────────────────────
  var nav = document.getElementById("nav");
  var navScrolled = false;
  window.addEventListener("scroll", function () {
    var scrolled = window.scrollY > 20;
    if (scrolled !== navScrolled) {
      navScrolled = scrolled;
      nav.style.boxShadow = scrolled ? "0 1px 8px rgba(0,0,0,0.06)" : "none";
    }
  }, { passive: true });

  // ════════════════════════════════════════════════════════════════════════
  // ── SePay Payment Flow ─────────────────────────────────────────────────
  // ════════════════════════════════════════════════════════════════════════

  var PAY_API = "https://pay.theio.vn";
  var BANK_ID = "tpbank";
  var BANK_ACCOUNT = "04162263666";
  var BANK_NAME = "NGUYEN VIET NAM";

  var PRODUCTS = {
    "CMP-MONTHLY": { name: "Companion Pro — Monthly", price: 375000, priceUSD: 15, polarUrl: "https://polar.sh/nhadaututheky/products/companion-pro-monthly" },
    "CMP-QUARTERLY": { name: "Companion Pro — Quarterly", price: 975000, priceUSD: 39, polarUrl: "https://polar.sh/nhadaututheky/products/companion-pro-quarterly" },
  };

  var payState = {
    product: null,
    orderCode: null,
    pollTimer: null,
  };

  // Expose to global scope for onclick handlers
  window.openPayment = function (product) {
    payState.product = product;
    payState.orderCode = null;

    var info = PRODUCTS[product];
    if (!info) return;

    // Update modal title + prices
    var title = document.getElementById("pay-title");
    title.textContent = "Get " + info.name.split(" — ")[0];

    var vndEl = document.getElementById("pay-price-vnd");
    var usdEl = document.getElementById("pay-price-usd");
    var polarLink = document.getElementById("pay-polar-link");
    if (vndEl) vndEl.textContent = info.price.toLocaleString("vi-VN") + " VND";
    if (usdEl) usdEl.textContent = "$" + info.priceUSD + " USD";
    if (polarLink) polarLink.href = info.polarUrl;

    showPayStep(1);
    document.getElementById("pay-modal").hidden = false;
    document.body.style.overflow = "hidden";
  };

  window.closePayment = function () {
    document.getElementById("pay-modal").hidden = true;
    document.body.style.overflow = "";
    if (payState.pollTimer) {
      clearInterval(payState.pollTimer);
      payState.pollTimer = null;
    }
  };

  window.showPayStep = function (step) {
    for (var i = 1; i <= 4; i++) {
      var el = document.getElementById("pay-step-" + i);
      if (el) el.hidden = (i !== step);
    }
  };

  window.createOrder = async function () {
    var email = document.getElementById("pay-email-input").value.trim();
    if (!email) {
      document.getElementById("pay-email-input").focus();
      return;
    }

    var name = document.getElementById("pay-name-input").value.trim();
    var info = PRODUCTS[payState.product];

    try {
      var res = await fetch(PAY_API + "/order/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product: payState.product,
          email: email,
          name: name,
        }),
      });

      var data = await res.json();
      if (!data.success) throw new Error(data.error || "Order creation failed");

      payState.orderCode = data.orderCode;
      var amount = data.amount || info.price;

      // Generate VietQR
      var qrUrl = "https://img.vietqr.io/image/" + BANK_ID + "-" + BANK_ACCOUNT + "-compact.png"
        + "?amount=" + amount
        + "&addInfo=" + encodeURIComponent(data.orderCode)
        + "&accountName=" + encodeURIComponent(BANK_NAME);

      document.getElementById("pay-qr-img").src = qrUrl;
      document.getElementById("pay-detail-amount").textContent = amount.toLocaleString("vi-VN") + "đ";
      document.getElementById("pay-detail-code").textContent = data.orderCode;
      document.getElementById("pay-status").innerHTML =
        '<span class="pay-spinner"></span> Waiting for payment...';

      showPayStep(3);
      startPolling(email);

    } catch (err) {
      console.error("Payment error:", err);
      // Fallback: show QR with client-generated order code
      var fallbackCode = "CMP-" + payState.product.toUpperCase() + "-" + generateCode(6);
      payState.orderCode = fallbackCode;

      var qrUrl = "https://img.vietqr.io/image/" + BANK_ID + "-" + BANK_ACCOUNT + "-compact.png"
        + "?amount=" + info.price
        + "&addInfo=" + encodeURIComponent(fallbackCode)
        + "&accountName=" + encodeURIComponent(BANK_NAME);

      document.getElementById("pay-qr-img").src = qrUrl;
      document.getElementById("pay-detail-amount").textContent = info.price.toLocaleString("vi-VN") + "đ";
      document.getElementById("pay-detail-code").textContent = fallbackCode;
      document.getElementById("pay-status").innerHTML =
        '<span class="pay-spinner"></span> Scan QR and transfer. We\'ll process manually.';

      showPayStep(3);
    }
  };

  function startPolling(email) {
    if (payState.pollTimer) clearInterval(payState.pollTimer);

    payState.pollTimer = setInterval(async function () {
      try {
        var res = await fetch(PAY_API + "/order/" + payState.orderCode);
        var data = await res.json();

        if (data.status === "delivered" || data.status === "completed") {
          clearInterval(payState.pollTimer);
          payState.pollTimer = null;
          document.getElementById("pay-success-email").textContent = email;
          showPayStep(4);
        } else if (data.status === "underpaid") {
          document.getElementById("pay-status").innerHTML =
            '<span style="color:var(--red)">Amount too low. Please transfer the exact amount shown above.</span>';
        }
      } catch (e) {
        // Silently continue polling
      }
    }, 5000);
  }

  function generateCode(len) {
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var result = "";
    for (var i = 0; i < len; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // Close modal on Escape
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") window.closePayment();
  });

})();
