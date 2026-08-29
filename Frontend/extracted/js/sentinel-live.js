/* Sentinel, running live at the foot of the landing page.

   The frame is mounted only when the section is approached, so the landing
   page is not paying for a second application on first paint. The role picker
   reloads the frame with ?as=<role>, which is how Sentinel signs a session in
   from the URL — an iframe on another origin cannot be handed its storage. */
(function () {
  "use strict";
  const frame = document.getElementById("sentinel-frame");
  const stage = document.getElementById("sentinel-live");
  if (!frame || !stage) return;

  const base = frame.dataset.base;
  const select = document.getElementById("sentinel-role");
  const openLink = document.getElementById("sentinel-open");
  const skeleton = document.getElementById("sentinel-skeleton");

  function urlFor(role) {
    return base + "/dashboard?as=" + encodeURIComponent(role);
  }

  let mounted = false;
  function mount() {
    if (mounted) return;
    mounted = true;
    frame.src = urlFor(select ? select.value : "posh_admin");
  }

  frame.addEventListener("load", function () {
    // about:blank fires load too; only clear once a real screen is in.
    if (frame.src && frame.src.indexOf("about:blank") === -1 && skeleton) {
      skeleton.style.display = "none";
    }
  });

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { mount(); io.disconnect(); }
      });
    }, { rootMargin: "300px 0px" });
    io.observe(stage);
  } else {
    mount();
  }

  if (select) {
    select.addEventListener("change", function () {
      if (skeleton) skeleton.style.display = "";
      mounted = true;
      frame.src = urlFor(select.value);
      if (openLink) openLink.href = urlFor(select.value);
    });
  }
})();
