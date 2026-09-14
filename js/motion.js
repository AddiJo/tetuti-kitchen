import { animate, inView, stagger, hover } from "https://cdn.jsdelivr.net/npm/motion@13.2.0/+esm";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeOut = [0.22, 1, 0.36, 1];

function cycleHeroShots() {
  const shots = [...document.querySelectorAll(".hero-shot")];
  if (shots.length < 2) return;

  const compact = window.matchMedia("(max-width: 620px)");

  // Tumpukan kartu: depth 0 = kartu paling depan, sisanya mengintip di bawahnya.
  const slotFor = (depth) => {
    const small = compact.matches;
    const baseY = small ? 6 : 14;
    const step = small ? 18 : 30;
    const scaleStep = small ? 0.05 : 0.06;
    const tilt = Math.min(1.6 * depth, 5) * (depth % 2 ? 1 : -1);

    return {
      y: baseY + depth * step,
      scale: Math.max(1 - depth * scaleStep, 0.6),
      rotate: depth === 0 ? 0 : tilt,
      zIndex: shots.length - depth,
    };
  };

  let offset = 0;

  const layout = () => {
    shots.forEach((el, i) => {
      const depth = (i + offset) % shots.length;
      const slot = slotFor(depth);
      el.style.zIndex = String(slot.zIndex);
      el.style.translate = `-50% ${slot.y}px`;
      el.style.scale = String(slot.scale);
      el.style.rotate = `${slot.rotate}deg`;
    });
  };

  layout();
  compact.addEventListener("change", layout);

  window.setInterval(() => {
    if (document.hidden) return;
    offset = (offset + shots.length - 1) % shots.length;
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
