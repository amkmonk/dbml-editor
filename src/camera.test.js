import { test } from "node:test";
import assert from "node:assert/strict";
import { centerOn, clampZoom, contentCenter, zoomAround } from "./camera.js";

test("масштаб ограничен", () => {
  assert.equal(clampZoom(0.01), 0.25);
  assert.equal(clampZoom(9), 3);
  assert.equal(clampZoom(1.2), 1.2);
});

test("zoom вокруг точки оставляет её на месте", () => {
  const next = zoomAround(10, 20, 1, 2, 100, 80);
  assert.equal(10 + 90 * 1, 100);
  assert.equal(next.panX + 90 * 2, 100);
  assert.equal(next.panY + 60 * 2, 80);
});

test("центрирование ставит точку в середину окна", () => {
  const next = centerOn(800, 600, 1, 200, 100);
  assert.equal(next.panX + 200, 400);
  assert.equal(next.panY + 100, 300);
});

test("центр содержимого по зонам", () => {
  const mid = contentCenter([
    { x: 0, y: 0, w: 100, h: 50 },
    { x: 100, y: 50, w: 100, h: 50 },
  ]);
  assert.deepEqual(mid, { x: 100, y: 50 });
  assert.equal(contentCenter([]), null);
});
