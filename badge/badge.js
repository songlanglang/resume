'use strict';
const stage = document.getElementById('stage');
const motion = document.getElementById('badge-motion');
const tilt = document.getElementById('badge-tilt');
const flipper = document.getElementById('badge-flipper');
const flipButton = document.getElementById('flip');
const clip = stage.querySelector('.clip');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const canvas = document.createElement('canvas');
canvas.className = 'rope-canvas';
canvas.setAttribute('aria-hidden', 'true');
stage.insertBefore(canvas, motion);
const context = canvas.getContext('2d');
const segmentCount = 7;
const ropeLength = 85;
const segmentLength = ropeLength / segmentCount;
const attachment = { x: 0, y: -213 };
// Card inverse mass is one. I = (width² + height²) / 12 for a rectangle.
const inverseInertia = 12 / (290 * 290 + 410 * 410);
const body = { x: 0, y: 310, previousX: 0, previousY: 310, angle: 0, previousAngle: 0 };
const nodes = [];
let drag = null;
let frame = null;
let previousTime = 0;
let accumulator = 0;
let quietFrames = 0;
let flipped = false;
let stageWidth = 0;
const fixedStep = 1 / 120;

function localPoint(point) {
  const cosine = Math.cos(body.angle);
  const sine = Math.sin(body.angle);
  return { x: point.x * cosine - point.y * sine, y: point.x * sine + point.y * cosine };
}
function attachmentPoint() {
  const offset = localPoint(attachment);
  return { x: body.x + offset.x, y: body.y + offset.y, offset };
}
function pointerPoint(event) {
  const bounds = stage.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * stage.clientWidth / bounds.width,
    y: (event.clientY - bounds.top) * stage.clientHeight / bounds.height
  };
}
function resetPosition() {
  cancelAnimationFrame(frame);
  frame = null;
  stageWidth = stage.clientWidth;
  Object.assign(body, { x: stageWidth / 2, y: 310, previousX: stageWidth / 2, previousY: 310, angle: 0, previousAngle: 0 });
  nodes.length = 0;
  for (let index = 0; index < segmentCount; index++) {
    const y = 12 + index * segmentLength;
    nodes.push({ x: stageWidth / 2, y, previousX: stageWidth / 2, previousY: y });
  }
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(stageWidth * ratio);
  canvas.height = Math.round(stage.clientHeight * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  accumulator = 0;
  quietFrames = 0;
  tilt.style.transform = '';
  render();
}
function drawRope() {
  context.clearRect(0, 0, stageWidth, stage.clientHeight);
  const end = attachmentPoint();
  const points = [...nodes, end];
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index];
    const next = points[index + 1];
    context.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
  }
  context.lineTo(end.x, end.y);
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.strokeStyle = '#4566ef';
  context.lineWidth = 16;
  context.shadowColor = '#365eff40';
  context.shadowBlur = 6;
  context.shadowOffsetX = 2;
  context.stroke();
  context.shadowBlur = 0;
  context.shadowOffsetX = 0;
  context.strokeStyle = '#91aeff';
  context.lineWidth = 10;
  context.stroke();
  context.strokeStyle = '#4768ff';
  context.lineWidth = 7;
  context.stroke();
  // Short transverse threads make bending and stretching visible.
  context.strokeStyle = '#ffffff55';
  context.lineWidth = 1;
  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index];
    const next = points[index + 1];
    const angle = Math.atan2(next.y - point.y, next.x - point.x);
    context.beginPath();
    context.moveTo(point.x - Math.sin(angle) * 5, point.y + Math.cos(angle) * 5);
    context.lineTo(point.x + Math.sin(angle) * 5, point.y - Math.cos(angle) * 5);
    context.stroke();
  }
}
function render() {
  motion.style.transform = `translate(${body.x - stageWidth / 2}px, ${body.y - 310}px) rotate(${body.angle}rad)`;
  const end = attachmentPoint();
  clip.style.transform = `translate(${end.x - 12}px, ${end.y - 2}px) rotate(${body.angle}rad)`;
  drawRope();
}
function solveRope() {
  nodes[0].x = stageWidth / 2;
  nodes[0].y = 12;
  for (let index = 0; index < segmentCount - 1; index++) {
    const first = nodes[index];
    const second = nodes[index + 1];
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    const length = Math.hypot(dx, dy) || 1;
    const correction = (length - segmentLength) / length;
    const firstWeight = index === 0 ? 0 : 1;
    const divisor = firstWeight + 1;
    first.x += dx * correction * firstWeight / divisor;
    first.y += dy * correction * firstWeight / divisor;
    second.x -= dx * correction / divisor;
    second.y -= dy * correction / divisor;
  }
  const last = nodes[nodes.length - 1];
  const end = attachmentPoint();
  const dx = end.x - last.x;
  const dy = end.y - last.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = dx / length;
  const ny = dy / length;
  const cross = end.offset.x * ny - end.offset.y * nx;
  // Light rope nodes yield to the heavier badge, including its angular inertia.
  const ropeInverseMass = 8;
  const correction = (length - segmentLength) / (ropeInverseMass + 1 + cross * cross * inverseInertia);
  last.x += nx * correction * ropeInverseMass;
  last.y += ny * correction * ropeInverseMass;
  body.x -= nx * correction;
  body.y -= ny * correction;
  body.angle -= cross * correction * inverseInertia;
}
function solveGrab() {
  if (!drag) return;
  const offset = localPoint(drag.local);
  const errorX = body.x + offset.x - drag.target.x;
  const errorY = body.y + offset.y - drag.target.y;
  // Solve the 2D point constraint with a 2×2 effective mass matrix.
  const a = 1 + offset.y * offset.y * inverseInertia;
  const b = -offset.x * offset.y * inverseInertia;
  const d = 1 + offset.x * offset.x * inverseInertia;
  const determinant = a * d - b * b;
  const impulseX = (d * errorX - b * errorY) / determinant;
  const impulseY = (a * errorY - b * errorX) / determinant;
  body.x -= impulseX * 0.75;
  body.y -= impulseY * 0.75;
  body.angle -= (offset.x * impulseY - offset.y * impulseX) * inverseInertia * 0.75;
}
function integrate() {
  const oldX = body.x;
  const oldY = body.y;
  const oldAngle = body.angle;
  body.x += Math.max(-6, Math.min(6, (body.x - body.previousX) * 0.985));
  body.y += Math.max(-6, Math.min(6, (body.y - body.previousY) * 0.985)) + 1800 * fixedStep * fixedStep;
  body.angle += Math.max(-0.025, Math.min(0.025, (body.angle - body.previousAngle) * 0.975));
  body.previousX = oldX;
  body.previousY = oldY;
  body.previousAngle = oldAngle;
  for (const node of nodes.slice(1)) {
    const x = node.x;
    const y = node.y;
    node.x += (node.x - node.previousX) * 0.98;
    node.y += (node.y - node.previousY) * 0.98 + 1800 * fixedStep * fixedStep;
    node.previousX = x;
    node.previousY = y;
  }
  for (let iteration = 0; iteration < 24; iteration++) {
    solveGrab();
    solveRope();
    body.angle = Math.max(-0.75, Math.min(0.75, body.angle));
  }
}
function animate(time) {
  accumulator += Math.min((time - previousTime) / 1000, 0.04);
  previousTime = time;
  while (accumulator >= fixedStep) {
    integrate();
    accumulator -= fixedStep;
  }
  render();
  const speed = Math.hypot(body.x - body.previousX, body.y - body.previousY) + Math.abs(body.angle - body.previousAngle) * 200;
  const atRest = Math.abs(body.x - stageWidth / 2) < 0.5 && Math.abs(body.angle) < 0.003;
  quietFrames = !drag && speed < 0.02 && atRest ? quietFrames + 1 : 0;
  if (quietFrames > 90) resetPosition();
  else frame = requestAnimationFrame(animate);
}
function wake() {
  if (frame !== null) return;
  previousTime = performance.now();
  frame = requestAnimationFrame(animate);
}
function release(event) {
  if (!drag || event.pointerId !== drag.id) return;
  drag = null;
  motion.classList.remove('dragging');
  if (reducedMotion.matches) resetPosition();
}
motion.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.button !== 0) return;
  const point = pointerPoint(event);
  const dx = point.x - body.x;
  const dy = point.y - body.y;
  drag = {
    id: event.pointerId,
    local: { x: dx * Math.cos(body.angle) + dy * Math.sin(body.angle), y: -dx * Math.sin(body.angle) + dy * Math.cos(body.angle) },
    target: point
  };
  tilt.style.transform = 'rotateX(0deg) rotateY(0deg)';
  motion.setPointerCapture(event.pointerId);
  motion.classList.add('dragging');
  wake();
});
motion.addEventListener('pointermove', (event) => {
  if (!drag || drag.id !== event.pointerId) return;
  const point = pointerPoint(event);
  // A hand can pull against a taut strap but cannot extend it indefinitely.
  const reach = ropeLength + Math.hypot(drag.local.x - attachment.x, drag.local.y - attachment.y);
  const dx = point.x - stageWidth / 2;
  const dy = point.y - 12;
  const distance = Math.hypot(dx, dy) || 1;
  const scale = Math.min(1, reach / distance);
  drag.target = { x: stageWidth / 2 + dx * scale, y: 12 + dy * scale };
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) motion.addEventListener(name, release);
function cancelDrag() {
  const pointerId = drag?.id;
  drag = null;
  if (pointerId !== undefined && motion.hasPointerCapture(pointerId)) motion.releasePointerCapture(pointerId);
  motion.classList.remove('dragging');
  resetPosition();
}
document.getElementById('reset').addEventListener('click', cancelDrag);
window.addEventListener('blur', () => { if (drag) cancelDrag(); });
reducedMotion.addEventListener('change', cancelDrag);
new ResizeObserver(() => { if (stage.clientWidth !== stageWidth) cancelDrag(); }).observe(stage);
flipButton.addEventListener('click', () => {
  flipped = !flipped;
  flipper.classList.toggle('flipped', flipped);
  flipButton.setAttribute('aria-pressed', String(flipped));
  document.querySelector('.badge-front').setAttribute('aria-hidden', String(flipped));
  document.querySelector('.badge-back').setAttribute('aria-hidden', String(!flipped));
  flipButton.textContent = flipped ? '翻到正面 ↻' : '翻到背面 ↻';
});
resetPosition();

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
