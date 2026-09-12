import { animate, inView, stagger, hover } from "https://cdn.jsdelivr.net/npm/motion@13.2.0/+esm";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeOut = [0.22, 1, 0.36, 1];

function cycleHeroShots() {
  const shots = [...document.querySelectorAll(".hero-shot")];
  if (shots.length < 2) return;

  const compact = window.matchMedia("(max-width: 620px)").matches;
  const layouts = compact
    ? [
        { x: "-6%", y: 28, scale: 0.86, rotate: -9, zIndex: 2 },
        { x: "34%", y: 16, scale: 0.84, rotate: 9, zIndex: 1 },
        { x: "12%", y: 40, scale: 1, rotate: 1, zIndex: 3 },
      ]
    : [
        { x: "-10%", y: 48, scale: 0.86, rotate: -10, zIndex: 2 },
        { x: "38%", y: 28, scale: 0.84, rotate: 10, zIndex: 1 },
        { x: "12%", y: 56, scale: 1, rotate: 1, zIndex: 3 },
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
    ".hero-shot",
    { opacity: [0, 1] },
    { delay: stagger(0.12, { startDelay: 0.15 }), duration: 0.8, ease: easeOut }
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
