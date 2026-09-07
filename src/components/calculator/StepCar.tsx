import { useRef, useState } from "react";
import { Upload, Camera, ScanLine, Trash2, RefreshCw, ShieldCheck, AlertTriangle, ImagePlus } from "lucide-react";
import { logError } from "../../lib/logger";
import type { CarData, OcrConfidence, OcrResult } from "../../lib/types";
import { emptyCar, ENGINE_LABELS, DRIVE_LABELS, VEHICLE_LABELS, IMPORTER_LABELS } from "../../lib/types";
import { getRecognitionProvider } from "../../lib/providers/recognition";
import { compressImage } from "../../lib/db";
import { Button, Field, SelectInput, TextInput, Badge, useToast } from "../ui";

const CONFIDENCE_THRESHOLD = 0.7;
const ACCEPTED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

const numOrEmpty = (v: number | null) => (v === null ? "" : String(v));

export default function StepCar({
  car,
  onChange,
  image,
  onImage,
  confidence,
  ocrDemo,
  onRecognized,
}: {
  car: CarData;
  onChange: (c: CarData) => void;
  image: string | null;
  onImage: (d: string | null) => void;
  confidence: OcrConfidence | null;
  ocrDemo: boolean;
  onRecognized: (r: OcrResult) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [drag, setDrag] = useState(false);
  const toast = useToast();
  const provider = useRef(getRecognitionProvider());

  const set = (patch: Partial<CarData>) => onChange({ ...car, ...patch });

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      toast("error", "Поддерживаются только JPG, JPEG, PNG и WEBP");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast("error", "Файл больше 10 МБ — уменьшите изображение");
      return;
    }
    try {
      const data = await compressImage(file);
      onImage(data);
      setAnalyzing(true);
      try {
        const result = await provider.current.analyze(data);
        onRecognized(result);
        toast("success", result.demo ? "Распознано (демо-режим OCR). Проверьте данные." : "Шильдик распознан. Проверьте данные.");
      } catch (e) {
        logError("ocr", e);
        const msg = e instanceof Error && e.message.includes("Войдите") ? e.message : "Не удалось распознать данные с фотографии. Введите характеристики автомобиля вручную.";
        toast("error", msg);
      } finally {
        setAnalyzing(false);
      }
    } catch {
      toast("error", "Не удалось прочитать файл изображения");
    }
  };

  const warn = (key: keyof OcrConfidence): string | undefined => {
    if (!confidence) return undefined;
    const val = confidence[key];
    const filled =
      key === "brand" ? car.brand : key === "model" ? car.model : car[key] !== null && car[key] !== undefined;
    return val > 0 && val < CONFIDENCE_THRESHOLD && filled ? "Проверьте значение" : undefined;
  };

  const showConfidence = confidence !== null;

  return (
    <div className="anim-fade-up">
      <h2 className="font-display text-lg sm:text-xl font-semibold text-ink-50">1. Данные автомобиля</h2>
      <p className="text-[13.5px] text-ink-300 mt-1 mb-6">
        Загрузите фото шильдика — характеристики определятся автоматически, затем проверьте их вручную.
      </p>

      {/* ---- Upload zone ---- */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void handleFile(e.dataTransfer.files?.[0]);
        }}
        className={`relative overflow-hidden rounded-2xl border-2 border-dashed transition-colors ${
          drag ? "border-gold-500 bg-gold-900/15" : "border-ink-600 bg-ink-850"
        }`}
      >
        <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void handleFile(e.target.files?.[0])} />
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void handleFile(e.target.files?.[0])} />
        <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => void handleFile(e.target.files?.[0])} />

        {image ? (
          <div className="relative">
            <img src={image} alt="Шильдик автомобиля" className="w-full max-h-[340px] object-contain bg-ink-950/60" />
            {analyzing && (
              <div className="absolute inset-0 bg-ink-950/55 overflow-hidden">
                <div className="scanline" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                  <ScanLine size={30} className="text-gold-400 pulse-soft" />
                  <p className="font-display text-[15px] font-semibold text-ink-50">Анализируем шильдик...</p>
                  <p className="text-[12.5px] text-ink-300">AI распознает марку, модель, VIN и характеристики</p>
                </div>
              </div>
            )}
            <div className="absolute top-3 right-3 flex gap-2">
              <Button size="sm" variant="dark" onClick={() => fileRef.current?.click()}>
                <RefreshCw size={14} /> Заменить
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  onImage(null);
                  onRecognized({ data: emptyCar(), confidence: { brand: 0, model: 0, production_year: 0, engine_volume_cc: 0, power_hp: 0 }, demo: false });
                }}
              >
                <Trash2 size={14} />
              </Button>
            </div>
            {confidence && !analyzing && (
              <div className="absolute bottom-3 left-3">
                <Badge tone={confidence.model >= CONFIDENCE_THRESHOLD ? "ok" : "gold"}>
                  <ShieldCheck size={12} /> OCR{ocrDemo ? " · DEMO" : ""} · модель {(confidence.model * 100).toFixed(0)}%
                </Badge>
              </div>
            )}
          </div>
        ) : (
          <div className="px-6 py-10 sm:py-14 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-2xl bg-ink-750 border border-ink-600 flex items-center justify-center mb-4">
              <ScanLine size={28} className="text-gold-400" />
            </div>
            <p className="font-display text-[15px] font-semibold text-ink-50">Загрузите фото шильдика автомобиля</p>
            <p className="text-[12.5px] text-ink-400 mt-1.5 max-w-sm">
              JPG, JPEG, PNG или WEBP, до 10 МБ. Шильдик обычно находится в проеме водительской двери или под капотом.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mt-6 w-full sm:w-auto">
              <Button size="lg" onClick={() => fileRef.current?.click()}>
                <Upload size={18} /> Загрузить фото
              </Button>
              <Button size="lg" variant="outline" onClick={() => camRef.current?.click()}>
                <Camera size={18} /> Сделать фото
              </Button>
              <Button size="lg" variant="outline" onClick={() => galleryRef.current?.click()}>
                <ImagePlus size={18} /> Выбрать из галереи
              </Button>
            </div>
            <button
              onClick={() => {
                onChange({
                  ...emptyCar(),
                  brand: "BMW",
                  model: "X5",
                  modification: "xDrive40i",
                  production_year: 2024,
                  engine_volume_cc: 2998,
                  power_hp: 340,
                  power_kw: 250,
                });
                onRecognized({
                  data: emptyCar(),
                  confidence: { brand: 0.97, model: 0.94, production_year: 0.9, engine_volume_cc: 0.88, power_hp: 0.92 },
                  demo: true,
                });
                toast("info", "Заполнен пример: BMW X5 xDrive40i");
              }}
              className="mt-4 text-[12.5px] font-semibold text-ink-400 hover:text-gold-400 transition-colors underline underline-offset-4 cursor-pointer"
            >
              Нет фото? Заполнить пример вручную
            </button>
          </div>
        )}
      </div>

      {/* ---- Form ---- */}
      <div className="card p-5 sm:p-6 mt-6">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
          <h3 className="font-display text-[15px] font-semibold text-ink-50">
            {showConfidence ? "Проверьте распознанные данные" : "Характеристики автомобиля"}
          </h3>
          {showConfidence && (
            <Badge tone="gold">
              <AlertTriangle size={12} /> поля с пометкой требуют проверки
            </Badge>
          )}
        </div>

        {showConfidence && (
          <div className="flex items-start gap-2.5 rounded-xl border border-gold-700/40 bg-gold-900/20 p-3.5 mb-5 anim-fade-up">
            <AlertTriangle size={16} className="text-gold-400 shrink-0 mt-0.5" />
            <p className="text-[12.5px] text-gold-300 font-semibold leading-snug">
              Проверьте данные автомобиля перед расчетом. Распознавание может содержать ошибки.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="Марка" warning={warn("brand")}>
            <TextInput value={car.brand} onChange={(v) => set({ brand: v })} placeholder="BMW" warning={!!warn("brand")} />
          </Field>
          <Field label="Модель" warning={warn("model")}>
            <TextInput value={car.model} onChange={(v) => set({ model: v })} placeholder="X5" warning={!!warn("model")} />
          </Field>
          <Field label="Модификация">
            <TextInput value={car.modification} onChange={(v) => set({ modification: v })} placeholder="xDrive40i" />
          </Field>
          <Field label="Год выпуска" warning={warn("production_year")}>
            <TextInput
              value={numOrEmpty(car.production_year)}
              onChange={(v) => set({ production_year: v ? Math.min(2100, Math.max(1900, parseInt(v.replace(/\D/g, ""), 10) || 0)) || null : null })}
              placeholder="2024"
              inputMode="numeric"
              maxLength={4}
              warning={!!warn("production_year")}
            />
          </Field>
          <Field label="VIN" className="sm:col-span-2">
            <TextInput value={car.vin} onChange={(v) => set({ vin: v.toUpperCase().slice(0, 17) })} placeholder="WBAJB0C51KB123456" maxLength={17} />
          </Field>
          <Field label="Объем двигателя, см³" warning={warn("engine_volume_cc")} hint={car.engine_type === "electric" ? "Для электромобиля не требуется" : undefined}>
            <TextInput
              value={numOrEmpty(car.engine_volume_cc)}
              onChange={(v) => set({ engine_volume_cc: v ? parseInt(v.replace(/\D/g, ""), 10) || null : null })}
              placeholder="2998"
              inputMode="numeric"
              warning={!!warn("engine_volume_cc")}
            />
          </Field>
          <Field label="Мощность, л.с." warning={warn("power_hp")}>
            <TextInput
              value={numOrEmpty(car.power_hp)}
              onChange={(v) => {
                const hp = v ? parseInt(v.replace(/\D/g, ""), 10) || null : null;
                set({ power_hp: hp, power_kw: hp && !car.power_kw ? Math.round(hp * 0.7355) : car.power_kw });
              }}
              placeholder="340"
              inputMode="numeric"
              warning={!!warn("power_hp")}
            />
          </Field>
          <Field label="Мощность, кВт">
            <TextInput
              value={numOrEmpty(car.power_kw)}
              onChange={(v) => set({ power_kw: v ? parseInt(v.replace(/\D/g, ""), 10) || null : null })}
              placeholder="250"
              inputMode="numeric"
            />
          </Field>
          <Field label="Тип двигателя">
            <SelectInput
              value={car.engine_type}
              onChange={(v) => set({ engine_type: v as CarData["engine_type"], vehicle_type: v === "electric" ? "electric" : car.vehicle_type === "electric" ? "passenger" : car.vehicle_type })}
              options={Object.entries(ENGINE_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </Field>
          <Field label="Тип топлива">
            <SelectInput
              value={car.fuel_type}
              onChange={(v) => set({ fuel_type: v })}
              options={["АИ-92", "АИ-95", "АИ-98", "Дизель", "Электро", "АИ-95 + электро", "Газ"].map((f) => ({ value: f, label: f }))}
            />
          </Field>
          <Field label="Экологический класс" hint="Если указан на шильдике">
            <TextInput value={car.eco_class} onChange={(v) => set({ eco_class: v })} placeholder="Евро-6" />
          </Field>
          <Field label="Привод">
            <SelectInput
              value={car.drive_type}
              onChange={(v) => set({ drive_type: v as CarData["drive_type"] })}
              options={Object.entries(DRIVE_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </Field>
          <Field label="Коробка передач">
            <SelectInput
              value={car.transmission}
              onChange={(v) => set({ transmission: v })}
              options={["Автомат", "Робот", "Вариатор", "Механика"].map((t) => ({ value: t, label: t }))}
            />
          </Field>
          <Field label="Тип транспортного средства">
            <SelectInput
              value={car.vehicle_type}
              onChange={(v) => set({ vehicle_type: v as CarData["vehicle_type"] })}
              options={Object.entries(VEHICLE_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </Field>
          <Field label="Статус импортера" hint="Влияет на пошлину, утильсбор, акциз и НДС">
            <SelectInput
              value={car.importer_type}
              onChange={(v) => set({ importer_type: v as CarData["importer_type"] })}
              options={Object.entries(IMPORTER_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}
