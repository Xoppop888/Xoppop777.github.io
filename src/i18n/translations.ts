export type Lang = "ru" | "zh";

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
  zh: {
    nav_calculator: "计算器",
    nav_calculations: "我的计算",
    nav_admin: "管理后台",
    nav_login: "登录",
    nav_logout: "退出登录",
    nav_demo: "演示模式",

    landing_badge: "中国 → 俄罗斯",
    landing_title_1: "计算爱车的最终落地价格",
    landing_title_2: "从中国进口",
    landing_cta_start: "开始计算",
    landing_cta_how: "工作原理",
    landing_stat_photo: "拍照",
    landing_stat_photo_val: "10 秒",
    landing_stat_price: "价格",
    landing_stat_price_val: "1 分钟",
    landing_stat_calc: "计算",
    landing_stat_calc_val: "即时",

    landing_feat1_title: "车辆信息识别",
    landing_feat1_text: "上传车辆铭牌照片——系统自动识别车辆参数。每个字段均可核对并修改。",
    landing_feat2_title: "实时汇率",
    landing_feat2_text: "俄罗斯央行欧元汇率与含加价的人民币汇率。来源、日期、手动输入——全部透明可见。",
    landing_feat3_title: "全部费用明细",
    landing_feat3_text: "关税 + 报废处理费 + 运输费 + 报关代理费 + 其他费用。每一笔中间金额均清晰可见。",

    landing_step1_t: "1 · 拍摄铭牌照片",
    landing_step1_d: "AI 自动识别车辆信息，您可核对确认",
    landing_step2_t: "2 · 中国境内价格",
    landing_step2_d: "购车价格、发票及人民币费用",
    landing_step3_t: "3 · 计算结果",
    landing_step3_d: "汇率、关税、运输、代理费——以及最终总价",

    landing_trust1_t: "计算记录版本管理",
    landing_trust1_d: "每次计算都会保存当时的汇率与税率快照——后续更新税率不会影响已保存的历史计算结果。",
    landing_trust2_t: "数据安全保障",
    landing_trust2_d: "计算记录仅您本人可见。税率与汇率只能由管理员修改。",
    landing_trust3_t: "PDF 报告",
    landing_trust3_d: "包含汇率、来源及所用规则的完整明细——一份文件全部呈现（报告始终以俄语生成）。",

    landing_hero_desc: "上传车辆铭牌照片，输入车辆价格——系统将自动计算该车在俄罗斯的预估落地价格。",
    landing_whats_inside: "功能一览",
    landing_formula_label: "统一计算公式",
    landing_formula_title: "所有费用项一目了然",
    f_total: "总计", f_car: "车辆价格(₽)", f_duty: "关税", f_fee: "海关手续费",
    f_recycling: "报废处理费", f_excise: "消费税/增值税", f_delivery: "运输费", f_broker: "报关代理费", f_other: "其他费用",
  },
} as const;

export type TranslationKey = keyof typeof translations["ru"];
