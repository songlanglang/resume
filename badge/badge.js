'use strict';
const motion = document.getElementById('badge-motion');
const tilt = document.getElementById('badge-tilt');
const flipper = document.getElementById('badge-flipper');
const flipButton = document.getElementById('flip');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const position = { x: 0, y: 0, vx: 0, vy: 0 };
let drag = null;
let frame = null;
let previousTime = 0;
let flipped = false;

function render() {
  const angle = Math.max(-20, Math.min(20, position.x * 0.12));
  motion.style.transform = `translate(${position.x}px, ${position.y}px) rotate(${angle}deg)`;
}
function settle(time) {
  const step = Math.min((time - previousTime) / 16.667 || 1, 2);
  previousTime = time;
  position.vx = (position.vx - position.x * 0.065 * step) * Math.pow(0.78, step);
  position.vy = (position.vy - position.y * 0.065 * step) * Math.pow(0.78, step);
  position.x += position.vx * step;
  position.y += position.vy * step;
  render();
  if (Math.abs(position.x) + Math.abs(position.y) + Math.abs(position.vx) + Math.abs(position.vy) > 0.1) {
    frame = requestAnimationFrame(settle);
  } else {
    resetPosition();
  }
}
function resetPosition() {
  cancelAnimationFrame(frame);
  frame = null;
  Object.assign(position, { x: 0, y: 0, vx: 0, vy: 0 });
  render();
  tilt.style.transform = '';
}
function release(event) {
  if (!drag || event.pointerId !== drag.id) return;
  drag = null;
  motion.classList.remove('dragging');
  tilt.style.transform = '';
  if (reducedMotion.matches) resetPosition();
  else {
    previousTime = performance.now();
    frame = requestAnimationFrame(settle);
  }
}
motion.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.button !== 0) return;
  cancelAnimationFrame(frame);
  drag = { id: event.pointerId, x: event.clientX - position.x, y: event.clientY - position.y };
  position.vx = 0;
  position.vy = 0;
  motion.setPointerCapture(event.pointerId);
  motion.classList.add('dragging');
});
motion.addEventListener('pointermove', (event) => {
  if (drag && event.pointerId === drag.id) {
    position.x = Math.max(-85, Math.min(85, event.clientX - drag.x));
    position.y = Math.max(-45, Math.min(65, event.clientY - drag.y));
    render();
  } else if (event.pointerType === 'mouse' && !reducedMotion.matches) {
    const bounds = motion.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    tilt.style.transform = `rotateX(${-y * 12}deg) rotateY(${x * 18}deg) rotateZ(-3deg)`;
  }
});
motion.addEventListener('pointerup', release);
motion.addEventListener('pointercancel', release);
motion.addEventListener('lostpointercapture', release);
motion.addEventListener('pointerleave', () => { if (!drag) tilt.style.transform = ''; });
flipButton.addEventListener('click', () => {
  flipped = !flipped;
  flipper.classList.toggle('flipped', flipped);
  flipButton.setAttribute('aria-pressed', String(flipped));
  document.querySelector('.badge-front').setAttribute('aria-hidden', String(flipped));
  document.querySelector('.badge-back').setAttribute('aria-hidden', String(!flipped));
  flipButton.textContent = flipped ? '翻到正面 ↻' : '翻到背面 ↻';
});
document.getElementById('reset').addEventListener('click', () => {
  if (drag && motion.hasPointerCapture(drag.id)) motion.releasePointerCapture(drag.id);
  drag = null;
  motion.classList.remove('dragging');
  resetPosition();
});
reducedMotion.addEventListener('change', resetPosition);
const resume = document.getElementById('resume-frame');
function sizeResume() {
  try {
    resume.style.height = `${resume.contentDocument.documentElement.scrollHeight + 8}px`;
  } catch {
    // The independent-reading link remains available if an embedding policy changes.
  }
}
resume.addEventListener('load', () => {
  sizeResume();
  const observer = new ResizeObserver(sizeResume);
  observer.observe(resume.contentDocument.body);
  resume.contentDocument.fonts.ready.then(sizeResume);
});
window.addEventListener('resize', sizeResume);
