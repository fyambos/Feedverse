const screenshotFiles = Array.from({ length: 25 }, (_, i) => `${i + 1}.png`);

function $(sel) {
  return document.querySelector(sel);
}

function buildGallery() {
  const container = $("#gallery");
  if (!container) return;

  // Prefer a curated subset for above-the-fold.
  const featured = [1, 2, 3, 4, 10, 14]
    .map((n) => `${n}.png`)
    .filter(Boolean);

  const files = featured.length ? featured : screenshotFiles;

  for (const f of files) {
    const img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.src = `/public/app-guide/${f}`.replace("/public/", "/");
    img.alt = `Feedverse app screenshot ${f.replace(".png", "")}`;

    img.addEventListener("click", () => {
      openLightbox(img.src, img.alt);
    });

    container.appendChild(img);
  }
}

function ensureLightbox() {
  let dialog = document.getElementById("lightbox");
  if (dialog) return dialog;

  dialog = document.createElement("dialog");
  dialog.id = "lightbox";
  dialog.className = "lightbox";

  const close = document.createElement("button");
  close.className = "lightbox-close";
  close.type = "button";
  close.setAttribute("aria-label", "Close");
  close.textContent = "×";

  const img = document.createElement("img");
  img.alt = "";

  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => {
    // Close when clicking the backdrop.
    if (e.target === dialog) dialog.close();
  });

  dialog.appendChild(close);
  dialog.appendChild(img);
  document.body.appendChild(dialog);
  return dialog;
}

function openLightbox(src, alt) {
  const dialog = ensureLightbox();
  const img = dialog.querySelector("img");
  if (!img) return;
  img.src = src;
  img.alt = alt || "";
  dialog.showModal();
}

function wireSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener("click", (e) => {
      const href = a.getAttribute("href") || "";
      if (href.length < 2) return;
      const el = document.getElementById(href.slice(1));
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

buildGallery();
wireSmoothScroll();
