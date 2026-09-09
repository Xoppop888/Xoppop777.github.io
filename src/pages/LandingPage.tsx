import { Link } from "react-router-dom";
import { ScanLine, LineChart, Layers, ArrowRight, Camera, Coins, Calculator, ShieldCheck, Database, FileCheck2 } from "lucide-react";
import { Button, Badge } from "../components/ui";
import { useApp } from "../state/AppContext";
import { useLanguage } from "../state/LanguageContext";

const PLATE_ROWS = [
  { k: "Марка / модель", v: "BMW X5 xDrive40i", w: "72%" },
  { k: "VIN", v: "WBAJB0C51KB•••••6", w: "58%" },
  { k: "Год выпуска", v: "2024", w: "64%" },
  { k: "Двигатель", v: "2 998 см³ · 340 л.с.", w: "81%" },
];

function PlateScan() {
  return (
    <div className="relative">
      <div className="card p-5 card-hover">
        <div className="flex items-center justify-between mb-4">
          <Badge tone="gold">
            <ScanLine size={12} /> AI-распознавание
          </Badge>
          <span className="text-[11px] font-bold text-ok-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-ok-500 pulse-soft" /> онлайн
          </span>
        </div>
        <div className="relative rounded-xl overflow-hidden border border-ink-600 bg-ink-950 aspect-[16/10]">
          {/* стилизованный шильдик */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-[76%] rounded-lg border-2 border-ink-500 bg-gradient-to-br from-ink-700 to-ink-800 px-5 py-4 rotate-[-2deg] shadow-2xl">
              <p className="font-display text-[13px] font-bold tracking-[0.18em] text-ink-100">BMW · X5</p>
              <div className="mt-2 space-y-1 font-mono text-[10px] text-ink-300">
                <p>VIN: WBAJB0C51KB123456</p>
                <p>YEAR: 2024 · 2998 cm³ · 250 kW</p>
                <p>TYPE: xDrive40i · AWD · AT</p>
              </div>
            </div>
          </div>
          <div className="scanline" />
          <div className="absolute top-2 left-2 w-5 h-5 border-t-2 border-l-2 border-gold-500 rounded-tl" />
          <div className="absolute top-2 right-2 w-5 h-5 border-t-2 border-r-2 border-gold-500 rounded-tr" />
          <div className="absolute bottom-2 left-2 w-5 h-5 border-b-2 border-l-2 border-gold-500 rounded-bl" />
          <div className="absolute bottom-2 right-2 w-5 h-5 border-b-2 border-r-2 border-gold-500 rounded-br" />
        </div>
        <div className="mt-4 space-y-2.5">
          {PLATE_ROWS.map((r, i) => (
            <div key={r.k} className={`anim-fade-up anim-d${i + 1} flex items-center gap-3`}>
              <div className="flex-1">
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span className="text-ink-400 uppercase tracking-wider">{r.k}</span>
                  <span className="text-ok-400 tnum">{r.w}</span>
                </div>
                <div className="flex items-center justify-between gap-3 mt-0.5">
                  <span className="text-[13px] font-bold text-ink-100">{r.v}</span>
                  <div className="w-16 h-1 rounded-full bg-ink-700 overflow-hidden">
                    <div className="h-full bg-ok-500 rounded-full" style={{ width: r.w }} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute -bottom-5 -right-3 sm:-right-6 card px-4 py-3 shadow-2xl anim-fade-up anim-d4">
        <p className="text-[10.5px] font-bold uppercase tracking-wider text-ink-400">Итог в России</p>
        <p className="font-display text-xl font-bold text-gold-400 tnum">7 412 900 ₽</p>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { isDemo } = useApp();
  const { t } = useLanguage();
  return (
    <div>
      {/* ===================== HERO ===================== */}
      <section className="max-w-[1240px] mx-auto px-4 sm:px-6 pt-12 sm:pt-20 pb-16 grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-10 items-center">
        <div>
          <div className="flex items-center gap-2.5 mb-6 anim-fade-up">
            <Badge tone="gold">{t("landing_badge")}</Badge>
            {isDemo && <Badge tone="neutral">{t("nav_demo")}</Badge>}
          </div>
          <h1 className="font-display text-[30px] sm:text-[42px] lg:text-[46px] leading-[1.12] font-bold text-ink-50 anim-fade-up anim-d1">
            {t("landing_title_1")}{" "}
            <span className="text-gold-500">{t("landing_title_2")}</span>
          </h1>
          <p className="text-[15px] sm:text-base text-ink-300 leading-relaxed mt-5 max-w-xl anim-fade-up anim-d2">
            {t("landing_hero_desc")}
          </p>
          <div className="flex flex-col sm:flex-row gap-3.5 mt-8 anim-fade-up anim-d3">
            <Link to="/calculator">
              <Button size="lg" className="w-full sm:w-auto px-9">
                {t("landing_cta_start")} <ArrowRight size={18} />
              </Button>
            </Link>
            <Button
              size="lg"
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}
            >
              {t("landing_cta_how")}
            </Button>
          </div>
          <div className="flex items-center gap-5 mt-9 anim-fade-up anim-d4">
            {[
              { k: t("landing_stat_photo"), d: t("landing_stat_photo_val") },
              { k: t("landing_stat_price"), d: t("landing_stat_price_val") },
              { k: t("landing_stat_calc"), d: t("landing_stat_calc_val") },
            ].map((s, i) => (
              <div key={s.k} className="flex items-center gap-5">
                <div>
                  <p className="font-display text-[13px] font-bold text-ink-100">{s.k}</p>
                  <p className="text-[11px] text-ink-400 font-semibold">{s.d}</p>
                </div>
                {i < 2 && <ArrowRight size={15} className="text-ink-500" />}
              </div>
            ))}
          </div>
        </div>
        <div className="anim-fade-up anim-d2 lg:pl-4">
          <PlateScan />
        </div>
      </section>

      {/* ===================== ПРЕИМУЩЕСТВА ===================== */}
      <section className="border-y border-ink-800 bg-ink-850/50">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 py-16">
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-gold-400 mb-8">{t("landing_whats_inside")}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-ink-700 rounded-2xl overflow-hidden border border-ink-700">
            {[
              {
                icon: <Camera size={22} />,
                title: t("landing_feat1_title"),
                text: t("landing_feat1_text"),
              },
              {
                icon: <LineChart size={22} />,
                title: t("landing_feat2_title"),
                text: t("landing_feat2_text"),
              },
              {
                icon: <Layers size={22} />,
                title: t("landing_feat3_title"),
                text: t("landing_feat3_text"),
              },
            ].map((f, i) => (
              <div key={f.title} className={`bg-ink-900 p-7 sm:p-8 ${i === 1 ? "md:bg-ink-850" : ""} group hover:bg-ink-850 transition-colors`}>
                <span className="w-12 h-12 rounded-xl bg-gold-900/60 border border-gold-700/40 text-gold-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  {f.icon}
                </span>
                <h3 className="font-display text-[16px] font-bold text-ink-50 mt-5">{f.title}</h3>
                <p className="text-[13.5px] text-ink-300 leading-relaxed mt-2.5">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== ФОРМУЛА ===================== */}
      <section id="how" className="max-w-[1240px] mx-auto px-4 sm:px-6 py-16">
        <div className="card p-6 sm:p-10 relative overflow-hidden">
          <div className="absolute -right-20 -top-20 w-72 h-72 rounded-full bg-gold-500/5 blur-2xl" />
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-gold-400">{t("landing_formula_label")}</p>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-ink-50 mt-3">{t("landing_formula_title")}</h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-6 font-display text-[13px] sm:text-[15px] font-semibold">
            {[
              [t("f_total"), "text-gold-400 text-lg"],
              ["=", "text-ink-500"],
              [t("f_car"), "text-ink-100"],
              ["+", "text-ink-500"],
              [t("f_duty"), "text-ink-100"],
              ["+", "text-ink-500"],
              [t("f_fee"), "text-ink-100"],
              ["+", "text-ink-500"],
              [t("f_recycling"), "text-ink-100"],
              ["+", "text-ink-500"],
              [t("f_excise"), "text-ink-300"],
              ["+", "text-ink-500"],
              [t("f_delivery"), "text-ink-100"],
              ["+", "text-ink-500"],
              [t("f_broker"), "text-ink-100"],
              ["+", "text-ink-500"],
              [t("f_other"), "text-ink-100"],
            ].map(([t, c], i) => (
              <span key={i} className={c}>
                {t}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-9">
            {[
              { icon: <Camera size={17} />, t: t("landing_step1_t"), d: t("landing_step1_d") },
              { icon: <Coins size={17} />, t: t("landing_step2_t"), d: t("landing_step2_d") },
              { icon: <Calculator size={17} />, t: t("landing_step3_t"), d: t("landing_step3_d") },
            ].map((s) => (
              <div key={s.t} className="rounded-xl border border-ink-700 bg-ink-800/60 p-4.5">
                <p className="flex items-center gap-2 font-display text-[13.5px] font-bold text-ink-50">
                  <span className="text-gold-400">{s.icon}</span> {s.t}
                </p>
                <p className="text-[12.5px] text-ink-300 mt-1.5 leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== НАДЕЖНОСТЬ ===================== */}
      <section className="max-w-[1240px] mx-auto px-4 sm:px-6 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: <Database size={18} />, t: t("landing_trust1_t"), d: t("landing_trust1_d") },
            { icon: <ShieldCheck size={18} />, t: t("landing_trust2_t"), d: t("landing_trust2_d") },
            { icon: <FileCheck2 size={18} />, t: t("landing_trust3_t"), d: t("landing_trust3_d") },
          ].map((x) => (
            <div key={x.t} className="flex gap-3.5">
              <span className="w-10 h-10 rounded-[10px] bg-ink-750 border border-ink-600 text-gold-400 flex items-center justify-center shrink-0">
                {x.icon}
              </span>
              <div>
                <p className="font-display text-[13.5px] font-bold text-ink-50">{x.t}</p>
                <p className="text-[12.5px] text-ink-300 leading-relaxed mt-1">{x.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===================== CTA ===================== */}
      <section className="max-w-[1240px] mx-auto px-4 sm:px-6 pb-20">
        <div className="rounded-2xl border border-gold-700/40 bg-gradient-to-br from-ink-800 via-ink-850 to-ink-900 px-6 sm:px-12 py-12 sm:py-14 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-transparent via-gold-500 to-transparent" />
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-7">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-ink-50 leading-tight">
                Узнайте реальную цену <span className="text-gold-400">до покупки</span>
              </h2>
              <p className="text-[14px] text-ink-300 mt-3 max-w-lg">
                Гостевой расчет — без регистрации. Сохранение истории и PDF — после входа.
              </p>
            </div>
            <Link to="/calculator" className="shrink-0">
              <Button size="lg" className="px-9">
                Рассчитать стоимость автомобиля <ArrowRight size={18} />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
