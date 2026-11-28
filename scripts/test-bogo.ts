// Black Friday BOGO: the cheapest floor(N/2) eligible single vials are free.
// Run: npm run test:bogo
import assert from "node:assert/strict";
import { evaluateHalloweenBogo } from "../src/lib/halloween-bogo-promotion";

const opts = { active: true, isWholesale: false };
const cart = (lines: Record<number, number>) =>
  Object.entries(lines).map(([price, quantity]) => ({ unitPriceCents: Number(price), quantity }));
const free = (lines: Record<number, number>) => evaluateHalloweenBogo(cart(lines), opts).discountCents;

const cases: [string, Record<number, number>, number][] = [
  ["1 vial: nothing free", { 9600: 1 }, 0],
  ["2 vials: cheaper one free", { 9600: 1, 3000: 1 }, 3000],
  ["4 mixed: 2 cheapest free", { 9600: 1, 8400: 1, 2800: 1, 1450: 1 }, 2800 + 1450],
  ["2 Reta 60 + 2 BPC 10: both BPC free", { 9600: 2, 3000: 2 }, 6000],
  ["6: 3 Glow + 3 GHK 100: 3 GHK free", { 8400: 3, 1250: 3 }, 3750],
  ["6 all different: 3 cheapest free", { 9600: 1, 8400: 1, 6750: 1, 3500: 1, 2300: 1, 1250: 1 }, 3500 + 2300 + 1250],
  ["10: 5 Reta 60 + 5 BPC 10: 5 BPC free", { 9600: 5, 3000: 5 }, 15000],
  ["10 same vial: 5 free", { 3000: 10 }, 15000],
  ["5 vials (odd): 2 cheapest free", { 9600: 1, 8400: 1, 5250: 1, 3000: 1, 1250: 1 }, 3000 + 1250],
];

for (const [name, lines, expected] of cases) {
  assert.equal(free(lines), expected, name);
  console.log(`ok - ${name}: $${(expected / 100).toFixed(2)} free`);
}

const r = evaluateHalloweenBogo(cart({ 9600: 1, 8400: 1, 2800: 1, 1450: 1 }), opts);
assert.ok(r.applies);
if (r.applies) {
  assert.equal(r.freeUnits, 2);
  assert.equal(r.totalCents, 9600 + 8400);
}
assert.equal(evaluateHalloweenBogo(cart({ 3000: 2 }), { ...opts, isWholesale: true }).discountCents, 0);
assert.equal(evaluateHalloweenBogo(cart({ 3000: 2 }), { ...opts, active: false }).discountCents, 0);
console.log("ok - all BOGO cases pass");
