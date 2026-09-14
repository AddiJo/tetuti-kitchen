import { animate, inView, stagger, hover } from "https://cdn.jsdelivr.net/npm/motion@13.2.0/+esm";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const easeOut = [0.22, 1, 0.36, 1];

function cycleHeroShots() {
  const shots = [...document.querySelectorAll(".hero-shot")];
  if (shots.length < 2) return;

  const compact = window.matchMedia("(max-width: 620px)");
  const total = shots.length;

  // Tumpukan kartu lurus: depth 0 = kartu paling depan, sisanya mengintip di bawahnya.
  const slotFor = (depth) => {
    const small = compact.matches;
    const baseY = small ? 6 : 14;
    const step = small ? 18 : 30;
    const scaleStep = small ? 0.05 : 0.06;

    return {
      y: baseY + depth * step,
      scale: Math.max(1 - depth * scaleStep, 0.6),
      zIndex: total - depth,
    };
  };

  let front = 0;
  const depthOf = (index) => (index - front + total) % total;

  const settle = (el, depth, duration) => {
    const slot = slotFor(depth);
    el.style.zIndex = String(slot.zIndex);
    return animate(
      el,
      { x: 0, y: slot.y, scale: slot.scale, rotate: 0, opacity: 1 },
      { duration, ease: easeOut }
    );
  };

  const layout = (duration = 0) => {
    shots.forEach((el, i) => settle(el, depthOf(i), duration));
  };

  layout();
  compact.addEventListener("change", () => layout(0.3));

  const shuffle = async () => {
    const leaving = shots[front];
    front = (front + 1) % total;

    // Kartu di belakang naik satu tingkat.
    shots.forEach((el, i) => {
      if (el !== leaving) settle(el, depthOf(i), 0.5);
    });

    // Kartu lama meluncur keluar ke kiri...
    await animate(
      leaving,
      { x: "-130%", rotate: -4, opacity: 0 },
      { duration: 0.4, ease: [0.4, 0, 1, 1] }
    ).finished;

    // ...lalu masuk lagi dari kanan sebagai kartu paling belakang.
    const back = slotFor(total - 1);
    leaving.style.zIndex = String(back.zIndex);
    await animate(
      leaving,
      {
        x: ["120%", 0],
        y: back.y,
        scale: back.scale,
        rotate: 0,
        opacity: [0, 1],
      },
      { duration: 0.55, ease: easeOut }
    ).finished;
  };

  window.setInterval(() => {
    if (document.hidden) return;
    shuffle();
  }, 3400);
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
