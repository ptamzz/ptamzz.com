(() => {
  const ESSAY_INDEX_PATHS = ["/essay", "/essay/", "/essays", "/essays/"];
  const HOME_TARGET = {
    href: "/",
    label: "Return to home",
    useHistoryBack: false,
  };

  // Where the mark should send a reader, given how they arrived.
  // Pure so the behaviour can be tested without a browser.
  function resolveReturnTarget(referrer, origin) {
    if (!referrer) {
      return HOME_TARGET;
    }

    let parsed;
    try {
      parsed = new URL(referrer);
    } catch {
      return HOME_TARGET;
    }

    if (parsed.origin !== origin) {
      return HOME_TARGET;
    }

    if (!ESSAY_INDEX_PATHS.includes(parsed.pathname)) {
      return HOME_TARGET;
    }

    return {
      href: parsed.pathname,
      label: "Return to all essays",
      useHistoryBack: true,
    };
  }

  if (typeof module === "object" && module.exports) {
    module.exports = { ESSAY_INDEX_PATHS, HOME_TARGET, resolveReturnTarget };
    return;
  }

  let mark = document.querySelector(".particle-mark");

  if (!mark) {
    const created = document.createElement("a");
    created.className = "home-mark";
    created.href = "/";
    created.setAttribute("aria-label", "Return to home");
    created.innerHTML = `
      <span class="particle-mark" aria-hidden="true">
        <svg viewBox="0 0 160 172">
          <path
            id="mark-outline"
            d="M80 40 C72 25 61 16 44 16 C24 16 10 32 10 52 C10 68 19 79 32 86 C19 93 10 104 10 120 C10 140 25 156 45 156 C62 156 72 146 80 132 C88 146 98 156 115 156 C135 156 150 140 150 120 C150 104 141 93 128 86 C141 79 150 68 150 52 C150 32 136 16 116 16 C99 16 88 25 80 40 Z"
          ></path>
        </svg>
        <canvas></canvas>
      </span>`;
    document.body.prepend(created);
    mark = created.querySelector(".particle-mark");
  }

  const homeLink = mark.closest(".home-mark");
  const target = resolveReturnTarget(document.referrer, window.location.origin);

  homeLink.href = target.href;
  homeLink.setAttribute("aria-label", target.label);

  if (target.useHistoryBack) {
    homeLink.addEventListener("click", (event) => {
      if (window.history.length > 1) {
        event.preventDefault();
        window.history.back();
      }
    });
  }

  const canvas = mark.querySelector("canvas");
  const context = canvas.getContext("2d");
  const outline = mark.querySelector("#mark-outline");
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const pointer = { x: -1000, y: -1000 };
  const inset = 10;
  let particles = [];
  let pixelRatio = 1;

  function setup() {
    const bounds = mark.getBoundingClientRect();
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(bounds.width * pixelRatio);
    canvas.height = Math.round(bounds.height * pixelRatio);

    const length = outline.getTotalLength();
    const scaleX = (bounds.width - inset * 2) / 160;
    const scaleY = (bounds.height - inset * 2) / 172;
    const count = Math.max(90, Math.round(length * scaleX * 0.58));

    particles = Array.from({ length: count }, (_, index) => {
      const point = outline.getPointAtLength((index / count) * length);
      const x = inset + point.x * scaleX;
      const y = inset + point.y * scaleY;
      return { baseX: x, baseY: y, x, y };
    });
  }

  function draw() {
    const bounds = mark.getBoundingClientRect();
    const localX = pointer.x - bounds.left;
    const localY = pointer.y - bounds.top;
    const radius = Math.max(22, bounds.width * 0.18);
    const pointerX = pointer.x < 0 ? 0.5 : pointer.x / window.innerWidth;
    const pointerY = pointer.y < 0 ? 0.5 : pointer.y / window.innerHeight;
    const hueShift = reducedMotion ? 0 : (pointerX - 0.5) * 14;
    const lightShift = reducedMotion ? 0 : (0.5 - pointerY) * 4;

    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, bounds.width, bounds.height);

    for (const particle of particles) {
      let targetX = particle.baseX;
      let targetY = particle.baseY;

      if (!reducedMotion) {
        const dx = particle.baseX - localX;
        const dy = particle.baseY - localY;
        const distance = Math.hypot(dx, dy);

        if (distance < radius && distance > 0) {
          const disruption = (1 - distance / radius) * 8;
          targetX += (dx / distance) * disruption;
          targetY += (dy / distance) * disruption;
        }
      }

      particle.x += (targetX - particle.x) * 0.14;
      particle.y += (targetY - particle.y) * 0.14;
      const gradientPosition =
        (particle.baseX / bounds.width) * 0.65 +
        (particle.baseY / bounds.height) * 0.35;
      const hue = 345 - gradientPosition * 55 + hueShift;
      context.fillStyle = `hsla(${hue}, 72%, ${58 + lightShift}%, 0.54)`;
      context.beginPath();
      context.arc(particle.x, particle.y, 1.5, 0, Math.PI * 2);
      context.fill();
    }

    requestAnimationFrame(draw);
  }

  window.addEventListener("pointermove", (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  });
  window.addEventListener("pointerleave", () => {
    pointer.x = -1000;
    pointer.y = -1000;
  });
  window.addEventListener("resize", setup);

  setup();
  draw();
})();
