// Swipe controls: LEFT, RIGHT and UP (forward). A quick tap also counts as UP. The swipe fires as
// soon as the finger has moved far enough, so it feels instant. Arrow keys / WASD work on a
// computer.
export function attachSwipes(el, onSwipe, { threshold = 22 } = {}) {
  let start = null;
  const down = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY, t: performance.now(), fired: false, id: e.pointerId };
  };
  const move = (e) => {
    if (!start || start.fired || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) < threshold) return;
    start.fired = true;
    if (Math.abs(dx) > Math.abs(dy) * 0.85) onSwipe(dx < 0 ? "left" : "right");
    else if (dy < 0) onSwipe("up");
    else onSwipe("down");
  };
  const up = (e) => {
    if (!start || e.pointerId !== start.id) return;
    if (!start.fired && performance.now() - start.t < 300) onSwipe("up");
    start = null;
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", () => { start = null; });
  el.style.touchAction = "none";
  window.addEventListener("keydown", (e) => {
    const k = { ArrowLeft: "left", a: "left", ArrowRight: "right", d: "right", ArrowUp: "up", w: "up", " ": "up" }[e.key];
    if (k) { e.preventDefault(); onSwipe(k); }
  });
}
