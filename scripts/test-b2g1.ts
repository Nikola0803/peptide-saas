// Buy 2, Get 1 Free (after Cyber Monday): the cheapest floor(N/3) eligible
// single vials are free. Also checks the switch instant from BOGO.
// Run: npm run test:bogo
import assert from "node:assert/strict";
import {
  evaluateHalloweenBogo,
  evlvHalloweenPromotionOptions,
  multiBuyFreeUnits,
  EVLV_B2G1_STARTS_AT,
  EVLV_B2G1_ENDS_AT,
} from "../src/lib/halloween-bogo-promotion";

const cart = (lines: Record<number, number>) =>
  Object.entries(lines).map(([price, quantity]) => ({ unitPriceCents: Number(price), quantity }));
const evlv = evlvHalloweenPromotionOptions({ active: false, brandDomain: "evlvpeptides.com" });
const at = (iso: string) => new Date(iso).getTime();
const run = (lines: Record<number, number>, now = at("2026-12-02T12:00:00Z"), b3g2 = false) =>
  evaluateHalloweenBogo(cart(lines), { ...evlv, isWholesale: false, now, b3g2 });

const cases: [string, Record<number, number>, number][] = [
  ["2 vials: nothing free", { 9600: 1, 3000: 1 }, 0],
  ["3 vials: cheapest free", { 9600: 1, 8400: 1, 3000: 1 }, 3000],
  ["5 vials: 1 free", { 9600: 1, 8400: 1, 5250: 1, 3000: 1, 1250: 1 }, 1250],
  ["6 vials: 2 cheapest free", { 9600: 2, 3000: 4 }, 6000],
  ["22 vials: 7 cheapest free", { 3000: 22 }, 21000],
];
for (const [name, lines, expected] of cases) {
  const r = run(lines);
  assert.equal(r.kind, "b2g1", name);
  assert.equal(r.discountCents, expected, name);
  console.log(`ok - B2G1 ${name}: $${(expected / 100).toFixed(2)} free`);
}
const won = run({ 9600: 1, 8400: 1, 3000: 1 });
assert.ok(won.applies && won.code === "B2G1STOCKUP");

// Switch instant: 1 ms before = BOGO, at the instant = B2G1, at the end = nothing.
const before = run({ 9600: 1, 3000: 1 }, EVLV_B2G1_STARTS_AT.getTime() - 1);
assert.equal(before.kind, "bogo");
assert.equal(before.discountCents, 3000);
assert.ok(before.applies && before.code === "BOGOFRIDAY");
assert.equal(run({ 9600: 1, 3000: 1 }, EVLV_B2G1_STARTS_AT.getTime()).discountCents, 0);
assert.equal(run({ 9600: 1, 8400: 1, 3000: 1 }, EVLV_B2G1_STARTS_AT.getTime()).discountCents, 3000);
assert.equal(run({ 9600: 1, 8400: 1, 3000: 1 }, EVLV_B2G1_ENDS_AT.getTime()).discountCents, 0);
console.log("ok - switch: BOGO until Mon Nov 30 11:59:59 PM PT, B2G1 after, off Sun Dec 6 11:59:59 PM PT");

// Wholesale never.
assert.equal(evaluateHalloweenBogo(cart({ 3000: 3 }), { ...evlv, isWholesale: true, now: at("2026-12-02T12:00:00Z") }).discountCents, 0);

// Optional B3G2 tier: 5 -> 2 free, 8 -> 3, 10 -> 4; never less than plain B2G1.
assert.deepEqual([3, 4, 5, 6, 8, 10, 22].map((n) => multiBuyFreeUnits(n, "b2g1", true)), [1, 1, 2, 2, 3, 4, 8]);
for (let n = 0; n < 60; n++) assert.ok(multiBuyFreeUnits(n, "b2g1", true) >= multiBuyFreeUnits(n, "b2g1", false));
assert.equal(run({ 9600: 1, 8400: 1, 5250: 1, 3000: 1, 1250: 1 }, undefined, true).discountCents, 3000 + 1250);
console.log("ok - all B2G1 cases pass");
