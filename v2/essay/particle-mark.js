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
        <svg viewBox="0 0 124 124">
          <path
            id="mark-outline"
            d="M91.9847 0 C109.666 0.00012687 124 14.3383 124 32.0253 C124 43.6308 117.828 53.793 108.589 59.4099 C106.83 60.4791 106.83 63.5209 108.589 64.5901 C117.828 70.2071 124 80.3692 124 91.9747 C124 109.662 109.666 124 91.9847 124 C80.3744 124 70.2085 117.817 64.5958 108.564 C63.5263 106.8 60.4727 106.8 59.4031 108.564 C53.7906 117.817 43.6255 124 32.0153 124 C14.3338 124 0.000124614 109.662 0 91.9747 C0 80.3693 6.17138 70.2071 15.4102 64.5901 C17.1689 63.5209 17.1688 60.4791 15.4102 59.4099 C6.17135 53.7929 0 43.6307 0 32.0253 C0.0000143084 14.3382 14.3337 0 32.0153 0 C43.6253 0.000115351 53.7906 6.18265 59.4032 15.4356 C60.4727 17.1989 63.5262 17.1989 64.5958 15.4356 C70.2085 6.18251 80.3745 0 91.9847 0 Z"
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
    const scaleX = (bounds.width - inset * 2) / 124;
    const scaleY = (bounds.height - inset * 2) / 124;
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
