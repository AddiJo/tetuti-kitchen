import { animate, inView, stagger, hover } from "https://cdn.jsdelivr.net/npm/motion@13.2.0/+esm";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeOut = [0.22, 1, 0.36, 1];

function cycleHeroShots() {
  const shots = [...document.querySelectorAll(".hero-shot")];
  if (shots.length < 2) return;

  const layoutsFor = () =>
    window.matchMedia("(max-width: 620px)").matches
      ? [
          { x: "-82%", y: 28, scale: 0.86, rotate: -9, zIndex: 2 },
          { x: "-18%", y: 16, scale: 0.84, rotate: 9, zIndex: 1 },
          { x: "-50%", y: 40, scale: 1, rotate: 1, zIndex: 3 },
        ]
      : [
          { x: "-88%", y: 48, scale: 0.86, rotate: -10, zIndex: 2 },
          { x: "-8%", y: 28, scale: 0.84, rotate: 10, zIndex: 1 },
          { x: "-50%", y: 56, scale: 1, rotate: 1, zIndex: 3 },
        ];

  let offset = 0;

  const layout = () => {
    const layouts = layoutsFor();
    shots.forEach((el, i) => {
      const slot = layouts[(i + offset) % layouts.length];
      el.style.zIndex = String(slot.zIndex);
      el.style.translate = `${slot.x} ${slot.y}px`;
      el.style.scale = String(slot.scale);
      el.style.rotate = `${slot.rotate}deg`;
    });
  };

  window.setInterval(() => {
    if (document.hidden) return;
    offset = (offset + 1) % shots.length;
    layout();
  }, 3000);
}

function play() {
  if (reduced) {
    document.documentElement.classList.remove("js-motion");
    return;
  }

  cycleHeroShots();

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
    "#cuplikan",
    () => {
      animate(
        "#cuplikan .section-head",
        { y: [24, 0], opacity: [0, 1] },
        { duration: 0.55, ease: easeOut }
      );
      animate(
        "#cuplikan .video-frame",
        { y: [32, 0], opacity: [0, 1] },
        { duration: 0.65, ease: easeOut }
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
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", play, { once: true });
} else {
  play();
}
