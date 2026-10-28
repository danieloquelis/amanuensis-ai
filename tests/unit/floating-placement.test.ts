import { test } from "node:test";
import assert from "node:assert/strict";
import { placeAround, placePin } from "@/shared/ui/floating-placement";

const area = { width: 1000, height: 600 };
const selection = { left: 300, top: 200, right: 500, bottom: 300 };
const panel = { width: 360, height: 280 };
/** A panel placed by its top edge, or by its bottom edge (growing upwards), as a top-left box. */
const boxOf = (place: { left: number; top: number } | { left: number; bottom: number }, size: typeof panel) =>
  "top" in place ? place : { left: place.left, top: area.height - place.bottom - size.height };
const overlaps = (box: { left: number; top: number }, size: typeof panel, rect: typeof selection) =>
  box.left < rect.right &&
  box.left + size.width > rect.left &&
  box.top < rect.bottom &&
  box.top + size.height > rect.top;

test("the assistant's pin sits just below the selection's right edge, clear of what is above the staff", () => {
  const pin = placePin(selection, area, { width: 40, height: 40 });
  assert.deepEqual(pin, { left: 460, top: 308 });
});

test("the composer opens below the selection when it fits, and never covers it", () => {
  const place = placeAround(selection, area, panel);
  assert.deepEqual(place, { left: 300, top: 308 });
  assert.equal(overlaps(boxOf(place, panel), panel, selection), false);
});

test("near the bottom, the composer opens just above the selection and grows upwards", () => {
  const low = { left: 300, top: 420, right: 500, bottom: 520 };
  const place = placeAround(low, area, panel);
  assert.deepEqual(place, { left: 300, bottom: 600 - 420 + 8 });
  assert.equal(overlaps(boxOf(place, panel), panel, low), false);
});

test("floating pieces stay inside the canvas at its right edge", () => {
  const edge = { left: 900, top: 100, right: 990, bottom: 160 };
  const place = placeAround(edge, area, panel);
  const pin = placePin(edge, area, { width: 40, height: 40 });
  assert.ok(boxOf(place, panel).left + panel.width <= area.width && pin.left + 40 <= area.width);
});
