import { animate, inView, stagger, hover } from "https://cdn.jsdelivr.net/npm/motion@13.2.0/+esm";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeOut = [0.22, 1, 0.36, 1];

function cycleHeroShots() {
  const shots = [...document.querySelectorAll(".hero-shot")];
  if (shots.length < 2) return;

  const compact = window.matchMedia("(max-width: 620px)").matches;
  const layouts = compact
    ? [
        { x: "0%", y: 18, scale: 0.9, rotate: -8, zIndex: 2 },
        { x: "26%", y: 0, scale: 0.86, rotate: 7, zIndex: 1 },
        { x: "10%", y: 34, scale: 1, rotate: 2, zIndex: 3 },
      ]
    : [
        { x: "0%", y: 32, scale: 0.9, rotate: -9, zIndex: 2 },
        { x: "36%", y: 0, scale: 0.86, rotate: 8, zIndex: 1 },
        { x: "18%", y: 64, scale: 1, rotate: 2, zIndex: 3 },
      ];

  let offset = 0;

  const layout = (duration) => {
    shots.forEach((el, i) => {
      const slot = layouts[(i + offset) % layouts.length];
      el.style.zIndex = String(slot.zIndex);
      animate(
        el,
        {
          x: slot.x,
          y: slot.y,
          scale: slot.scale,
          rotate: slot.rotate,
        },
        { duration, ease: easeOut }
      );
    });
  };

  layout(0.01);

  window.setInterval(() => {
    if (document.hidden) return;
    offset = (offset + 1) % shots.length;
    layout(0.8);
  }, 3000);
}

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

  window.setTimeout(cycleHeroShots, 900);

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
