// Video latar hero yang memutar tiap cuplikan bergantian. Klip mulai dalam
// keadaan bisu karena browser memblokir autoplay bersuara; begitu pengunjung
// menyalakan suara, pilihan itu dipakai lagi untuk klip berikutnya.
const REEL_CLIPS = [
  { src: "assets/video.mp4", title: "Sambal Crispy" },
  { src: "assets/sosis-solo.mp4", title: "Sosis Solo" },
];

function initReel() {
  const frame = document.querySelector("[data-reel]");
  const video = frame && frame.querySelector("[data-reel-video]");
  if (!frame || !video || REEL_CLIPS.length === 0) return;

  const soundBtn = frame.querySelector("[data-reel-sound]");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let index = 0;
  let visible = true;
  let wantsSound = false;
  let userPaused = reduced;

  const syncSound = () => {
    if (!soundBtn) return;
    const on = !video.muted && !video.paused;
    soundBtn.classList.toggle("is-on", on);
    soundBtn.setAttribute("aria-pressed", on ? "true" : "false");
    soundBtn.setAttribute("aria-label", on ? "Matikan suara video" : "Nyalakan suara video");
  };

  // play() bisa ditolak karena kebijakan autoplay atau karena keburu dipause
  // saat klip masih dimuat. Dua-duanya bukan alasan untuk berhenti mencoba,
  // cukup perbarui tombolnya.
  const tryPlay = () => {
    const attempt = video.play();
    if (attempt && attempt.catch) attempt.catch(syncSound);
  };

  const show = (next, autoplay = true) => {
    index = (next + REEL_CLIPS.length) % REEL_CLIPS.length;
    frame.classList.add("is-switching");
    video.src = REEL_CLIPS[index].src;
    video.muted = !wantsSound;
    video.load();
    if (autoplay) tryPlay();
  };

  video.addEventListener("loadeddata", () => frame.classList.remove("is-switching"));
  video.addEventListener("ended", () => show(index + 1));
  video.addEventListener("play", syncSound);
  video.addEventListener("pause", syncSound);

  if (soundBtn) {
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
  }

  // Jangan biarkan video (apalagi suaranya) jalan saat sedang tidak dilihat.
  const observer = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (!visible) video.pause();
      else if (!userPaused) tryPlay();
    },
    { threshold: 0.25 }
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
