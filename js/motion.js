import { animate, inView, stagger, hover } from "https://cdn.jsdelivr.net/npm/motion@13.2.0/+esm";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeOut = [0.22, 1, 0.36, 1];

function play() {
  if (reduced) {
    document.documentElement.classList.remove("js-motion");
    return;
  }

  animate(
    ".nav",
    { y: [-24, 0], opacity: [0, 1] },
    { duration: 0.6, ease: easeOut }
  );

  animate(
    ".hero-copy > *",
    { y: [28, 0], opacity: [0, 1] },
    { delay: stagger(0.08, { startDelay: 0.12 }), duration: 0.7, ease: easeOut }
  );

  animate(
    ".hero-shot",
    { opacity: [0, 1] },
    { delay: stagger(0.12, { startDelay: 0.2 }), duration: 0.8, ease: easeOut }
  );

  inView(
    "#menu",
    () => {
      animate(
        "#menu .section-head",
        { y: [24, 0], opacity: [0, 1] },
        { duration: 0.55, ease: easeOut }
      );
      animate(
        "#product-grid .card",
        { y: [40, 0], opacity: [0, 1] },
        { delay: stagger(0.12), duration: 0.65, ease: easeOut }
      );
    },
    { margin: "0px 0px -80px 0px" }
  );

  inView(
    "#cara-pesan",
    () => {
      animate(
        "#cara-pesan .section-head",
        { y: [24, 0], opacity: [0, 1] },
        { duration: 0.55, ease: easeOut }
      );
      animate(
        "#cara-pesan .step",
        { y: [32, 0], opacity: [0, 1] },
        { delay: stagger(0.1), duration: 0.6, ease: easeOut }
      );
    },
    { margin: "0px 0px -80px 0px" }
  );

  try {
    hover(".card", (el) => {
      animate(el, { y: -10 }, { type: "spring", stiffness: 320, damping: 22 });
      return () => animate(el, { y: 0 }, { type: "spring", stiffness: 280, damping: 24 });
    });

    hover(".btn", (el) => {
      animate(el, { scale: 1.04 }, { duration: 0.18 });
      return () => animate(el, { scale: 1 }, { duration: 0.18 });
    });
  } catch (err) {
    console.warn("Motion hover skipped", err);
  }

  animate(
    ".wa-float",
    { scale: [1, 1.08, 1] },
    { duration: 1.8, repeat: Infinity, ease: "easeInOut", delay: 1.2 }
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", play, { once: true });
} else {
  play();
}
