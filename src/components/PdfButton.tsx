import { useRef, useState } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { FileDown } from "lucide-react";
import type { CalculationInput } from "../lib/types";
import type { FullCalculation } from "../lib/engine/customsEngine";
import { D, fmtRub, fmtRub2, fmtCny, fmtRate, fmtDate, fmtDateTime } from "../lib/money";
import { ENGINE_LABELS, DRIVE_LABELS, VEHICLE_LABELS, IMPORTER_LABELS } from "../lib/types";
import { useToast } from "./ui";

const P = "#101319";
const M = "#5b6472";
const LINE = "#dfe3ea";
const GOLD = "#c07f14";

function Row({ k, v, strong, note }: { k: string; v: string; strong?: boolean; note?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "7px 0", borderBottom: `1px solid ${LINE}` }}>
      <div>
        <span style={{ fontSize: 12.5, color: strong ? P : M, fontWeight: strong ? 700 : 500 }}>{k}</span>
        {note && <div style={{ fontSize: 9.5, color: M, marginTop: 2 }}>{note}</div>}
      </div>
      <span style={{ fontSize: 13, fontWeight: strong ? 800 : 600, color: P, fontVariantNumeric: "tabular-nums" }}>{v}</span>
    </div>
  );
}

export default function PdfButton({ input, result }: { input: CalculationInput; result: FullCalculation }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const b = result.breakdown;
  const car = input.car;

  const download = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      const canvas = await html2canvas(ref.current, { scale: 2, backgroundColor: "#ffffff", logging: false });
      const pdf = new jsPDF("p", "mm", "a4");
      const pageW = 210;
      const pageH = 297;
      const imgH = (canvas.height * pageW) / canvas.width;
      const img = canvas.toDataURL("image/jpeg", 0.92);
      let rendered = 0;
      let page = 0;
      while (rendered < imgH) {
        if (page > 0) pdf.addPage();
        pdf.addImage(img, "JPEG", 0, -rendered, pageW, imgH);
        rendered += pageH;
        page += 1;
      }
      pdf.save(`auto-china-${car.brand || "auto"}-${car.model || "calc"}.pdf`);
      toast("success", "PDF с расчетом скачан");
    } catch {
      toast("error", "Не удалось сформировать PDF. Попробуйте еще раз.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => void download()}
        disabled={busy}
        className="w-full inline-flex items-center justify-center gap-2 font-semibold rounded-[10px] text-[15px] px-7 h-[52px] border border-ink-500 text-ink-100 hover:border-gold-500 hover:text-gold-400 transition-all cursor-pointer disabled:opacity-50"
      >
        <FileDown size={18} /> {busy ? "Формируем PDF..." : "Скачать PDF"}
      </button>

      {/* скрытый «лист» для рендера */}
      <div style={{ position: "fixed", left: -10000, top: 0, width: 794, background: "#ffffff", zIndex: -1 }}>
        <div ref={ref} style={{ width: 794, padding: "44px 48px", fontFamily: "'Manrope', sans-serif", color: P, background: "#ffffff" }}>
          {/* шапка */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 18, borderBottom: `3px solid ${GOLD}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="8" fill="#101319" />
                <path d="M8 21l3-9h10l3 9" stroke="#F2AE3C" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="11.5" cy="22" r="1.9" fill="#F2AE3C" />
                <circle cx="20.5" cy="22" r="1.9" fill="#F2AE3C" />
              </svg>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: 0.5 }}>AUTO·CHINA CALCULATOR</div>
                <div style={{ fontSize: 10.5, color: M, fontWeight: 600, letterSpacing: 1.4, textTransform: "uppercase" }}>Расчет стоимости автомобиля из Китая</div>
              </div>
            </div>
            <div style={{ textAlign: "right", fontSize: 11, color: M, fontWeight: 600 }}>
              <div>{fmtDateTime(new Date().toISOString())}</div>
              <div style={{ marginTop: 2 }}>Версия правил: {b.rule_version}</div>
            </div>
          </div>

          {/* автомобиль */}
          <div style={{ display: "flex", gap: 20, marginTop: 22 }}>
            {input.image_data ? (
              <img src={input.image_data} alt="Шильдик" style={{ width: 220, height: 140, objectFit: "cover", borderRadius: 10, border: `1px solid ${LINE}` }} />
            ) : (
              <div style={{ width: 220, height: 140, borderRadius: 10, background: "#f0f2f5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: M }}>
                Фото шильдика не загружено
              </div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: GOLD, letterSpacing: 1.6, textTransform: "uppercase" }}>Ваш автомобиль</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>
                {car.brand} {car.model} {car.modification}
              </div>
              <div style={{ fontSize: 12, color: M, fontWeight: 600, marginTop: 6 }}>
                {[
                  car.production_year ? `${car.production_year} г.` : null,
                  car.engine_volume_cc ? `${car.engine_volume_cc} см³` : null,
                  car.power_hp ? `${car.power_hp} л.с.` : null,
                  car.power_kw ? `${car.power_kw} кВт` : null,
                ].filter(Boolean).join(" • ")}
              </div>
              <table style={{ marginTop: 10, fontSize: 11.5, borderCollapse: "collapse", width: "100%" }}>
                <tbody>
                  {[
                    ["VIN", car.vin || "—"],
                    ["Тип двигателя", ENGINE_LABELS[car.engine_type]],
                    ["Топливо", car.fuel_type || "—"],
                    ["Привод / КПП", `${DRIVE_LABELS[car.drive_type]} / ${car.transmission}`],
                    ["Тип ТС", VEHICLE_LABELS[car.vehicle_type]],
                    ["Импортер", IMPORTER_LABELS[car.importer_type]],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ color: M, padding: "3px 0", width: 150 }}>{k}</td>
                      <td style={{ fontWeight: 600 }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* курсы */}
          <div style={{ display: "flex", gap: 14, marginTop: 20 }}>
            {[
              { t: "Курс CNY (ВТБ)", v: `1 CNY = ${fmtRate(input.cny_rate)} ₽`, s: `${input.cny_rate_source === "VTB" ? "ВТБ (AI-поиск)" : input.cny_rate_source === "Manual" ? "ручной ввод" : input.cny_rate_source === "Demo" ? "DEMO" : input.cny_rate_source} · надбавка +${input.cny_markup}% от инвойса · ${fmtDateTime(input.cny_fetched_at)}` },
              { t: "Курс EUR (ЦБ РФ)", v: `1 EUR = ${fmtRate(input.eur_rate)} ₽`, s: `${input.eur_rate_source === "Manual" ? "ручной ввод" : input.eur_rate_source === "Demo" ? "DEMO" : "ЦБ РФ"} · ${fmtDate(input.eur_fetched_at)}` },
            ].map((c) => (
              <div key={c.t} style={{ flex: 1, border: `1px solid ${LINE}`, borderRadius: 10, padding: "12px 16px" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: M, letterSpacing: 1.2, textTransform: "uppercase" }}>{c.t}</div>
                <div style={{ fontSize: 17, fontWeight: 800, marginTop: 4 }}>{c.v}</div>
                <div style={{ fontSize: 10, color: M, fontWeight: 600, marginTop: 3 }}>{c.s}</div>
              </div>
            ))}
          </div>

          {/* расчет */}
          <div style={{ marginTop: 22 }}>
            <Row k="Стоимость автомобиля в Китае" v={`${fmtCny(input.china_price_cny)} · ${fmtRub2(result.car_base_rub)}`} />
            <Row
              k={`Надбавка ${input.cny_markup}% от инвойса`}
              v={`${fmtCny(result.invoice_markup_cny)} · +${fmtRub2(result.invoice_markup_rub)}`}
              note="коммерческая надбавка к стоимости автомобиля, рассчитывается от инвойса"
            />
            <Row
              k="Стоимость по инвойсу"
              v={`${fmtCny(input.price_equals_invoice ? input.china_price_cny : input.invoice_price_cny)}`}
              note={input.price_equals_invoice ? "совпадает с ценой автомобиля" : "указана отдельным инвойсом"}
            />
            {D(result.china_costs_rub).gt(0) && <Row k="Дополнительные расходы в Китае" v={fmtRub2(result.china_costs_rub)} />}
            <Row k="Таможенная пошлина" v={fmtRub2(b.customs_duty)} note={b.applied_rules.find((r) => r.kind === "duty")?.formula_text} />
            <Row k="Таможенный сбор" v={fmtRub2(b.customs_fee)} note={b.applied_rules.find((r) => r.kind === "fee")?.name} />
            <Row k="Утилизационный сбор" v={fmtRub2(b.recycling_fee)} note={`база ${fmtRub(b.recycling.base_rub)} × коэффициент ${b.recycling.coefficient}`} />
            <Row k="Акциз" v={b.excise_applied ? fmtRub2(b.excise) : "Не применяется"} note={b.excise_applied ? undefined : b.excise_reason} />
            <Row k="НДС" v={b.vat_applied ? fmtRub2(b.vat) : "Не применяется"} note={b.vat_applied ? undefined : b.vat_reason} />
            <Row k="Доставка (весь маршрут)" v={fmtRub2(result.delivery_total_rub)} />
            <Row k="Услуги брокера" v={fmtRub2(result.broker_cost_rub)} />
            {D(result.other_costs_rub).gt(0) && <Row k="Прочие расходы" v={fmtRub2(result.other_costs_rub)} />}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, padding: "14px 18px", background: "#101319", borderRadius: 12 }}>
              <div>
                <div style={{ color: "#F2AE3C", fontSize: 10.5, fontWeight: 800, letterSpacing: 1.6, textTransform: "uppercase" }}>Итоговая стоимость в России</div>
                <div style={{ color: "#8b95a9", fontSize: 10.5, fontWeight: 600, marginTop: 3 }}>Удорожание: +{fmtRate(result.uplift_percent)}%</div>
              </div>
              <div style={{ color: "#F2AE3C", fontSize: 27, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmtRub(result.total_cost_rub)}</div>
            </div>
          </div>

          <p style={{ marginTop: 20, fontSize: 9.5, color: M, lineHeight: 1.55, borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
            Расчет является предварительным и не является официальным таможенным расчетом. Итоговые платежи зависят от документов,
            таможенной стоимости, характеристик автомобиля и действующего законодательства.
          </p>
        </div>
      </div>
    </>
  );
}
