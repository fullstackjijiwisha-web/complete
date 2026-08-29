/* Sentinel live rail — lazy iframes + smooth horizontal scrolling.

   Fifty cross-origin apps mounted at once would stall the page, so a frame is
   created only when its card comes near the viewport, and torn down again when
   it drifts far away. Everything else here is about making the rail feel
   smooth: pointer dragging with inertia handed back to native scrolling,
   vertical wheel translated to horizontal, and keyboard paging. */
(function () {
  "use strict";
  const rail = document.getElementById("rail");
  if (!rail) return;

  const cards = Array.from(rail.querySelectorAll(".rail-card"));
  const countEl = document.getElementById("rail-count");
  if (countEl) countEl.textContent = String(cards.length);

  /* ---- lazy mount / unmount ---- */
  function mount(card) {
    if (card.dataset.mounted === "1") return;
    card.dataset.mounted = "1";
    const holder = card.querySelector(".rc-frame");
    const frame = document.createElement("iframe");
    frame.src = card.dataset.src;
    frame.loading = "lazy";
    frame.title = card.querySelector(".rc-screen").textContent;
    frame.setAttribute("referrerpolicy", "no-referrer");
    // Least privilege: the preview needs to run its own scripts and nothing else.
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    frame.addEventListener("load", function () {
      const sk = holder.querySelector(".rc-skeleton");
      if (sk) sk.remove();
    });
    holder.appendChild(frame);
  }

  function unmount(card) {
    if (card.dataset.mounted !== "1") return;
    card.dataset.mounted = "0";
    const holder = card.querySelector(".rc-frame");
    const frame = holder.querySelector("iframe");
    if (frame) frame.remove();
    if (!holder.querySelector(".rc-skeleton")) {
      const sk = document.createElement("div");
      sk.className = "rc-skeleton";
      sk.setAttribute("aria-hidden", "true");
      holder.appendChild(sk);
    }
  }

  if ("IntersectionObserver" in window) {
    // Mount a screen ahead of arrival so it has loaded by the time it is read.
    const near = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) mount(e.target); });
    }, { root: rail, rootMargin: "60% 0px" });
    // Keep a wider band alive than the mount band, so a card being scrolled
    // back and forth across the edge is not torn down and rebuilt each time.
    const far = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (!e.isIntersecting) unmount(e.target); });
    }, { root: rail, rootMargin: "180% 0px" });
    cards.forEach(function (c) { near.observe(c); far.observe(c); });
  } else {
    cards.slice(0, 6).forEach(mount);
  }

  /* ---- arrows ---- */
  const prev = document.getElementById("rail-prev");
  const next = document.getElementById("rail-next");
  function page(dir) {
    const card = cards[0];
    const step = card ? card.getBoundingClientRect().width + 18 : rail.clientWidth * 0.8;
    rail.scrollBy({ left: dir * step * 2, behavior: "smooth" });
  }
  if (prev) prev.addEventListener("click", function () { page(-1); });
  if (next) next.addEventListener("click", function () { page(1); });

  function syncArrows() {
    const max = rail.scrollWidth - rail.clientWidth - 2;
    if (prev) prev.disabled = rail.scrollLeft <= 2;
    if (next) next.disabled = rail.scrollLeft >= max;
  }
  rail.addEventListener("scroll", syncArrows, { passive: true });
  window.addEventListener("resize", syncArrows);
  syncArrows();

  /* ---- drag to scroll ---- */
  let dragging = false, startX = 0, startScroll = 0, moved = 0;
  rail.addEventListener("pointerdown", function (e) {
    if (e.button !== 0) return;
    dragging = true; moved = 0;
    startX = e.clientX;
    startScroll = rail.scrollLeft;
    rail.classList.add("dragging");
  });
  rail.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    const dx = e.clientX - startX;
    moved = Math.abs(dx);
    rail.scrollLeft = startScroll - dx;
    if (moved > 4) e.preventDefault();
  });
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    rail.classList.remove("dragging");
  }
  rail.addEventListener("pointerup", endDrag);
  rail.addEventListener("pointercancel", endDrag);
  rail.addEventListener("pointerleave", endDrag);
  // A drag that ends on a link must not also follow it.
  rail.addEventListener("click", function (e) {
    if (moved > 6) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  /* ---- vertical wheel scrolls the rail horizontally, but only while there is
     rail left to travel, so the page keeps scrolling past the section ---- */
  rail.addEventListener("wheel", function (e) {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const max = rail.scrollWidth - rail.clientWidth;
    const atStart = rail.scrollLeft <= 0 && e.deltaY < 0;
    const atEnd = rail.scrollLeft >= max - 1 && e.deltaY > 0;
    if (atStart || atEnd) return;
    e.preventDefault();
    rail.scrollLeft += e.deltaY;
  }, { passive: false });

  /* ---- keyboard ---- */
  rail.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight") { e.preventDefault(); page(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); page(-1); }
  });
})();
