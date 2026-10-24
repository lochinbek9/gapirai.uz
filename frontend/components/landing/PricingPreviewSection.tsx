"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { getPlans, PlanDef } from "@/lib/api";

export default function PricingPreviewSection() {
  const [plans, setPlans] = useState<PlanDef[] | null>(null);

  useEffect(() => {
    getPlans()
      .then((res) => setPlans(res.plans.filter((p) => !p.id.endsWith("_yearly"))))
      .catch(() => setPlans(null));
  }, []);

  if (!plans || plans.length === 0) return null;

  return (
    <section className="w-full max-w-4xl mt-14 px-4 z-10">
      <h2 className="text-lg sm:text-2xl font-semibold text-ui-ink text-center mb-2">
        Tarif rejalari
      </h2>
      <p className="text-xs sm:text-sm text-ui-muted text-center mb-6 sm:mb-8">
        Bepul tarifda oyiga 5 daqiqa dublyaj.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className="glass-card rounded-2xl p-5 border border-ui-rule text-left"
          >
            <h3 className="text-sm font-semibold text-ui-ink mb-1">{plan.name}</h3>
            <p className="text-xl font-semibold text-ui-ink mb-3">
              {plan.price === 0 ? "Bepul" : `${plan.price.toLocaleString("uz-UZ")} so'm`}
              {plan.price > 0 && <span className="text-xs font-medium text-ui-muted">/oy</span>}
            </p>
            <ul className="space-y-1.5 text-xs text-ui-muted">
              <li className="flex items-center gap-1.5">
                <Check aria-hidden="true" className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> Oyiga {plan.monthly_minutes} daqiqa dublyaj
              </li>
              <li className="flex items-center gap-1.5">
                <Check aria-hidden="true" className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> {plan.max_resolution} gacha sifat
              </li>
            </ul>
          </div>
        ))}
      </div>
      <div className="flex justify-center mt-6">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-ui-ground hover:bg-black/[0.06] dark:hover:bg-white/[0.06] border border-ui-rule text-ui-ink font-semibold text-xs transition"
        >
          Barcha tariflarni ko'rish
        </Link>
      </div>
    </section>
  );
}
