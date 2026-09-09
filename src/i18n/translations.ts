export type Lang = "ru" | "en";

// Ключи сгруппированы по разделу интерфейса. Добавляя перевод для нового
// экрана — просто расширяйте оба объекта (ru и en) одинаковым набором ключей.
// PDF-отчет (см. src/components/PdfButton.tsx) НАМЕРЕННО не подключен к этому
// словарю и всегда формируется на русском — это сознательное решение, а не
// недосмотр: итоговый документ отправляется в госорганы/клиентам в РФ.
export const translations = {
  ru: {
    nav_calculator: "Калькулятор",
    nav_calculations: "Мои расчеты",
    nav_admin: "Админ",
    nav_login: "Войти",
    nav_logout: "Выйти",
    nav_demo: "демо-режим",

    landing_badge: "Китай → Россия",
    landing_title_1: "Рассчитайте конечную стоимость автомобиля",
    landing_title_2: "из Китая",
    landing_cta_start: "Начать расчет",
    landing_cta_how: "Как это работает",
    landing_stat_photo: "Фото",
    landing_stat_photo_val: "10 сек",
    landing_stat_price: "Цена",
    landing_stat_price_val: "1 мин",
    landing_stat_calc: "Расчет",
    landing_stat_calc_val: "сразу",

    landing_feat1_title: "Распознавание автомобиля",
    landing_feat1_text: "Загрузите фото шильдика — характеристики определятся автоматически. Каждое поле можно проверить и исправить.",
    landing_feat2_title: "Актуальные курсы",
    landing_feat2_text: "Курс EUR ЦБ РФ и расчетный курс CNY с надбавкой. Источники, даты и ручной ввод — всё прозрачно.",
    landing_feat3_title: "Полная стоимость",
    landing_feat3_text: "Таможня + утильсбор + доставка + брокер + дополнительные расходы. Все промежуточные суммы видны.",

    landing_step1_t: "1 · Фото шильдика",
    landing_step1_d: "AI распознает автомобиль, вы проверяете данные",
    landing_step2_t: "2 · Цена в Китае",
    landing_step2_d: "Цена покупки, инвойс и расходы в юанях",
    landing_step3_t: "3 · Расчет",
    landing_step3_d: "Курсы, таможня, доставка, брокер — и итог",

    landing_trust1_t: "Версионирование расчетов",
    landing_trust1_d: "Каждый расчет сохраняет snapshot курсов и тарифов — старые расчеты не меняются при обновлении ставок.",
    landing_trust2_t: "Данные под защитой",
    landing_trust2_d: "Расчеты видны только вам. Тарифы и курсы изменяются только администратором.",
    landing_trust3_t: "PDF-отчет",
    landing_trust3_d: "Полная детализация с курсами, источниками и примененными правилами — одним файлом.",

    landing_hero_desc: "Загрузите фото шильдика, укажите цену автомобиля — система автоматически рассчитает ориентировочную стоимость автомобиля в России.",
    landing_whats_inside: "Что внутри",
    landing_formula_label: "Единая формула",
    landing_formula_title: "Все слагаемые — на одном экране",
    f_total: "ИТОГ", f_car: "автомобиль в ₽", f_duty: "пошлина", f_fee: "таможенный сбор",
    f_recycling: "утильсбор", f_excise: "акциз / НДС", f_delivery: "доставка", f_broker: "брокер", f_other: "прочие расходы",
  },
  en: {
    nav_calculator: "Calculator",
    nav_calculations: "My calculations",
    nav_admin: "Admin",
    nav_login: "Log in",
    nav_logout: "Log out",
    nav_demo: "demo mode",

    landing_badge: "China → Russia",
    landing_title_1: "Calculate the final cost of a car",
    landing_title_2: "from China",
    landing_cta_start: "Start calculation",
    landing_cta_how: "How it works",
    landing_stat_photo: "Photo",
    landing_stat_photo_val: "10 sec",
    landing_stat_price: "Price",
    landing_stat_price_val: "1 min",
    landing_stat_calc: "Calculation",
    landing_stat_calc_val: "instant",

    landing_feat1_title: "Vehicle recognition",
    landing_feat1_text: "Upload a photo of the nameplate — specs are filled in automatically. Every field can be checked and corrected.",
    landing_feat2_title: "Live exchange rates",
    landing_feat2_text: "CBR RF EUR rate and a computed CNY rate with markup. Sources, dates, and manual entry — all transparent.",
    landing_feat3_title: "Full cost breakdown",
    landing_feat3_text: "Customs + recycling fee + delivery + broker + extra costs. Every intermediate amount is visible.",

    landing_step1_t: "1 · Nameplate photo",
    landing_step1_d: "AI recognizes the vehicle, you verify the data",
    landing_step2_t: "2 · Price in China",
    landing_step2_d: "Purchase price, invoice and costs in CNY",
    landing_step3_t: "3 · Calculation",
    landing_step3_d: "Rates, customs, delivery, broker — and the total",

    landing_trust1_t: "Calculation versioning",
    landing_trust1_d: "Every calculation stores a snapshot of rates and tariffs — old calculations don't change when rates are updated.",
    landing_trust2_t: "Your data is protected",
    landing_trust2_d: "Calculations are visible only to you. Tariffs and rates are changed only by an administrator.",
    landing_trust3_t: "PDF report",
    landing_trust3_d: "Full breakdown with rates, sources and applied rules — as a single file (always generated in Russian).",

    landing_hero_desc: "Upload a photo of the nameplate, enter the car's price — the system automatically calculates the estimated cost of the car in Russia.",
    landing_whats_inside: "What's inside",
    landing_formula_label: "One unified formula",
    landing_formula_title: "Every line item on one screen",
    f_total: "TOTAL", f_car: "car in ₽", f_duty: "duty", f_fee: "customs fee",
    f_recycling: "recycling fee", f_excise: "excise / VAT", f_delivery: "delivery", f_broker: "broker", f_other: "other costs",
  },
} as const;

export type TranslationKey = keyof typeof translations["ru"];
