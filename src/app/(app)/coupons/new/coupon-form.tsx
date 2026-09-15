"use client";

import { useState } from "react";
import { createCoupon } from "../actions";

type ProductOption = { id: string; label: string };

const inputClass = "w-full text-sm border border-background-300 rounded px-2.5 py-1.5 bg-background-50";
const labelClass = "block text-xs font-medium text-foreground-600 mb-1";

export function CouponForm({ products }: { products: ProductOption[] }) {
  const [type, setType] = useState<"FIXED" | "PERCENT" | "BOGO">("PERCENT");
  const [bogoRewardType, setBogoRewardType] = useState<"FREE" | "PERCENT_OFF" | "FIXED_OFF">("FREE");

  return (
    <form action={createCoupon} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Coupon code</label>
          <input name="code" required placeholder="SUMMER20" className={`${inputClass} font-mono uppercase`} />
        </div>
        <div>
          <label className={labelClass}>Description (internal)</label>
          <input name="description" placeholder="Summer email blast" className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass}>Type</label>
        <div className="flex gap-2">
          {(["FIXED", "PERCENT", "BOGO"] as const).map((t) => (
            <label
              key={t}
              className={`flex-1 text-center text-sm rounded-md border px-3 py-1.5 cursor-pointer ${
                type === t ? "border-primary-500 bg-primary-50 text-primary-700 font-medium" : "border-background-300 text-foreground-700"
              }`}
            >
              <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} className="hidden" />
              {t === "FIXED" ? "Fixed amount" : t === "PERCENT" ? "Percent off" : "BOGO"}
            </label>
          ))}
        </div>
      </div>

      {type === "FIXED" && (
        <div>
          <label className={labelClass}>Amount off ($)</label>
          <input name="fixedAmountDollars" type="number" step="0.01" min="0" placeholder="10.00" className={inputClass} />
        </div>
      )}

      {type === "PERCENT" && (
        <div>
          <label className={labelClass}>Percent off (%)</label>
          <input name="percentOff" type="number" step="1" min="1" max="100" placeholder="20" className={inputClass} />
        </div>
      )}

      {type === "BOGO" && (
        <div className="space-y-3 rounded-md border border-background-200 p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Buy quantity</label>
              <input name="bogoBuyQuantity" type="number" min="1" step="1" defaultValue="1" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Get quantity</label>
              <input name="bogoGetQuantity" type="number" min="1" step="1" defaultValue="1" className={inputClass} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Trigger product</label>
              <select name="bogoTriggerProductId" className={inputClass} defaultValue="">
                <option value="">Any product in the cart</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Reward product</label>
              <select name="bogoRewardProductId" className={inputClass} defaultValue="">
                <option value="">Same as trigger product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[11px] text-foreground-500">
            Leave both as-is for a classic "buy 2 get 1 free, same item" coupon. Set a trigger and a different
            reward product for "buy any 2, get a specific product discounted."
          </p>

          <div>
            <label className={labelClass}>Reward</label>
            <div className="flex gap-2">
              {(["FREE", "PERCENT_OFF", "FIXED_OFF"] as const).map((rt) => (
                <label
                  key={rt}
                  className={`flex-1 text-center text-sm rounded-md border px-3 py-1.5 cursor-pointer ${
                    bogoRewardType === rt ? "border-primary-500 bg-primary-50 text-primary-700 font-medium" : "border-background-300 text-foreground-700"
                  }`}
                >
                  <input
                    type="radio"
                    name="bogoRewardType"
                    value={rt}
                    checked={bogoRewardType === rt}
                    onChange={() => setBogoRewardType(rt)}
                    className="hidden"
                  />
                  {rt === "FREE" ? "Free" : rt === "PERCENT_OFF" ? "% off" : "$ off"}
                </label>
              ))}
            </div>
          </div>

          {bogoRewardType === "PERCENT_OFF" && (
            <div>
              <label className={labelClass}>Reward percent off (%)</label>
              <input name="bogoRewardPercent" type="number" min="1" max="100" step="1" placeholder="50" className={inputClass} />
            </div>
          )}
          {bogoRewardType === "FIXED_OFF" && (
            <div>
              <label className={labelClass}>Reward amount off per unit ($)</label>
              <input name="bogoRewardFixedDollars" type="number" step="0.01" min="0" placeholder="5.00" className={inputClass} />
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={labelClass}>Minimum order ($)</label>
          <input name="minOrderDollars" type="number" step="0.01" min="0" placeholder="Optional" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Max redemptions</label>
          <input name="maxRedemptions" type="number" step="1" min="1" placeholder="Unlimited" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Expires</label>
          <input name="expiresAt" type="date" className={inputClass} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground-700">
        <input type="checkbox" name="allowStacking" className="rounded border-background-300" />
        Allow this coupon to be combined with other stackable coupons
      </label>
      <p className="text-[11px] text-foreground-500 -mt-2">
        Off by default. When off (the recommended setting), a customer can only use one coupon per order, and this
        one will always win alone -- it can never be combined with anything else, even another stacking-enabled coupon.
      </p>

      <button className="text-sm bg-primary-500 text-background-50 rounded-md px-3 py-1.5 font-medium hover:bg-primary-600">
        Create coupon
      </button>
    </form>
  );
}
