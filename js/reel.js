// Satu bingkai video yang memutar cuplikan bergantian. Klip mulai dalam keadaan
// bisu karena browser memblokir autoplay bersuara; begitu pengunjung menyalakan
// suara, pilihan itu dipakai lagi untuk klip berikutnya.
const REEL_CLIPS = [
  { src: "assets/video.mp4", title: "Sambal Crispy" },
  { src: "assets/sosis-solo.mp4", title: "Sosis Solo" },
];

function initReel() {
  const frame = document.querySelector("[data-reel]");
  const video = frame && frame.querySelector("[data-reel-video]");
  if (!frame || !video || REEL_CLIPS.length === 0) return;

  const titleEl = frame.querySelector("[data-reel-title]");
  const dotsEl = frame.querySelector("[data-reel-dots]");
  const soundBtn = frame.querySelector("[data-reel-sound]");
  const soundLabel = frame.querySelector("[data-reel-sound-label]");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let index = 0;
  let visible = true;
  let wantsSound = false;
  let userPaused = reduced;

  const dots = REEL_CLIPS.map((clip, i) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "reel-dot";
    dot.setAttribute("aria-label", `Putar ${clip.title}`);
    dot.addEventListener("click", () => {
      userPaused = false;
      show(i);
    });
    dotsEl.append(dot);
    return dot;
  });

  const syncSound = () => {
    const on = !video.muted;
    soundBtn.classList.toggle("is-on", on);
    soundBtn.setAttribute("aria-pressed", on ? "true" : "false");
    soundLabel.textContent = video.paused
      ? "Putar video"
      : on
        ? "Matikan suara"
        : "Nyalakan suara";
  };

  // play() bisa ditolak karena kebijakan autoplay atau karena keburu dipause
  // saat klip masih dimuat. Dua-duanya bukan alasan untuk berhenti mencoba,
  // cukup perbarui label tombolnya.
  const tryPlay = () => {
    const attempt = video.play();
    if (attempt && attempt.catch) attempt.catch(syncSound);
  };

  function show(next, autoplay = true) {
    index = (next + REEL_CLIPS.length) % REEL_CLIPS.length;
    const clip = REEL_CLIPS[index];

    frame.classList.add("is-switching");
    titleEl.textContent = clip.title;
    dots.forEach((dot, i) => {
      dot.classList.toggle("is-active", i === index);
    });

    video.src = clip.src;
    video.muted = !wantsSound;
    video.load();
    if (autoplay) tryPlay();
  }

  // Rasio tiap klip berbeda (potret dan lanskap), jadi bingkainya ikut
  // menyesuaikan begitu ukuran aslinya diketahui.
  video.addEventListener("loadedmetadata", () => {
    const ratio = video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
    frame.style.setProperty("--reel-ar", String(ratio));
    frame.classList.toggle("is-landscape", ratio > 1);
    frame.classList.remove("is-switching");
  });

  video.addEventListener("ended", () => show(index + 1));
  video.addEventListener("play", syncSound);
  video.addEventListener("pause", syncSound);

  video.addEventListener("click", () => {
    if (video.paused) {
      userPaused = false;
      tryPlay();
    } else {
      userPaused = true;
      video.pause();
    }
  });

  soundBtn.addEventListener("click", () => {
    if (video.paused) {
      wantsSound = true;
      video.muted = false;
      userPaused = false;
      tryPlay();
    } else {
      wantsSound = video.muted;
      video.muted = !wantsSound;
    }
    syncSound();
  });

  // Jangan biarkan video (apalagi suaranya) jalan saat sedang tidak dilihat.
  const observer = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (!visible) video.pause();
      else if (!userPaused) tryPlay();
    },
    { threshold: 0.4 }
  );
  observer.observe(frame);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) video.pause();
    else if (visible && !userPaused) tryPlay();
  });

  show(0, !reduced);
  syncSound();
}

initReel();
