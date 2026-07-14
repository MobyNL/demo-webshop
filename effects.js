(function () {
  var ready = false;
  var queue = [];

  function executeQueued() {
    ready = true;
    queue.forEach(function (fn) { fn(); });
    queue = [];
  }

  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js';
  s.onload = executeQueued;
  document.head.appendChild(s);

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function fireConfetti() {
    if (prefersReducedMotion()) return;
    var colors = ['#ff6b9d', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3', '#1dd1a1'];
    window.confetti({ particleCount: 70, angle: 60, spread: 60, origin: { x: 0, y: 0.75 }, colors: colors });
    window.confetti({ particleCount: 70, angle: 120, spread: 60, origin: { x: 1, y: 0.75 }, colors: colors });
  }

  function fireExplosion() {
    if (prefersReducedMotion()) return;
    var colors = ['#ff4444', '#ff8800', '#ffcc00', '#ff0000', '#ff6600', '#cc2200'];
    window.confetti({
      particleCount: 100,
      spread: 360,
      startVelocity: 38,
      ticks: 55,
      origin: { x: 0.5, y: 0.5 },
      colors: colors,
      shapes: ['circle', 'square'],
      scalar: 0.9,
      gravity: 1.6
    });
  }

  window.triggerConfetti = function () {
    if (ready) fireConfetti();
    else queue.push(fireConfetti);
  };

  window.triggerExplosion = function () {
    if (ready) fireExplosion();
    else queue.push(fireExplosion);
  };
})();
