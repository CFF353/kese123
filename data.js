// Kese kişisel finans takip — temiz başlangıç (boş veri)
// Kategoriler taksonomi olarak korunur; hesaplar, işlemler, bütçeler ve borçlar boş.

// Tek gerçek "bugün" kaynağı — tüm uygulama buradan tarih alır (gerçek sistem tarihi).
window.appToday = function appToday() { return new Date(); };

// Yerel (UTC değil) takvim günü anahtarı — toISOString gece yarısı UTC kaymasını önler
window.localYMD = function localYMD(d) {
  const x = (d instanceof Date) ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

// Transfer / kart-ödeme bacağı mı? İç para hareketi — gelir/gider olarak sayılmamalı
window.isTransferLeg = function isTransferLeg(t) {
  return !!(t && t.id && /^tx-(?:cardpay-|cardadv-)?(out|in)-\d+$/.test(t.id));
};

// Borç/kart anapara ödemesi mi? (nakitten çıkıp yükümlülüğü azaltır)
// Gider değildir ama "net birikim"den düşülmeli — para cepte kalmadı.
window.isDebtPayment = function isDebtPayment(t) {
  return !!(t && t.id && /^tx-(?:cardpay-out|pay)-\d+$/.test(t.id));
};

// ── Hızlı/toplu giriş metin ayrıştırıcı ──
// "market 250 tl" gibi serbest metinden tutar + kategori + işlem adı çıkarır.
// data.js'te tanımlı (plain JS, ilk yüklenen dosya) ki hem app.jsx hem bulk-add.jsx
// babel script scope ayrımına takılmadan window.parseQuickEntry'yi kullanabilsin.
window.QUICK_ADD_KEYWORDS = {
  market: ["market", "migros", "carrefour", "a101", "bim", "şok", "sok", "marketl", "bakkal", "manav"],
  yemek: ["yemek", "kafe", "kahve", "restoran", "yemeksepeti", "getir yemek", "getir ye", "lokanta", "burger", "pizza", "çay", "kahvaltı", "tatlı", "fast food"],
  ulasim: ["ulaşım", "taksi", "uber", "bitaksi", "otobüs", "metro", "metrobüs", "dolmuş", "benzin", "akbil", "otopark", "yakıt", "mazot", "uçak bileti", "otoyol", "hgs"],
  kira: ["kira", "aidat"],
  faturalar: ["fatura", "elektrik", "doğalgaz", "internet", "telefon faturası", "su parası", "su faturası", "vergi", "sigorta"],
  eglence: ["sinema", "konser", "eğlence", "oyun", "bilet", "tiyatro", "parti", "gece kulübü", "bar "],
  saglik: ["eczane", "doktor", "hastane", "ilaç", "sağlık", "diş", "muayene", "check-up", "gözlük"],
  egitim: ["kurs", "okul", "kitap", "eğitim", "udemy", "üniversite", "kırtasiye", "sertifika"],
  alisveris: ["giyim", "ayakkabı", "alışveriş", "zara", "hm ", "h&m", "trendyol", "hepsiburada", "kozmetik", "elektronik", "mobilya"],
  abonelik: ["abonelik", "spotify", "netflix", "youtube", "disney", "icloud", "amazon prime", "üyelik"],
  maas: ["maaş", "maas", "prim"],
  freelance: ["freelance", "proje geliri", "iş geliri"],
  yatirim: ["temettü", "kar payı", "faiz geliri", "kira geliri", "yatırım getirisi"],
  diger: ["diğer", "hediye", "bağış", "kayıp", "anne", "baba", "aile", "harçlık"],
};

window.parseQuickEntry = function parseQuickEntry(text, categories) {
  const t = (text || "").trim();
  if (!t) return null;
  const amtMatch = t.match(/(\d[\d.,]*)\s*(?:tl|₺|try)?\s*$/i) || t.match(/(\d[\d.,]*)\s*(?:tl|₺|try)?/i);
  let amount = null, rest = t;
  if (amtMatch) {
    let raw = amtMatch[1];
    raw = raw.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    amount = parseFloat(raw);
    rest = (t.slice(0, amtMatch.index) + t.slice(amtMatch.index + amtMatch[0].length))
      .replace(/\b(tl|₺|try)\b/gi, "").replace(/\s+/g, " ").trim();
  }
  const lower = rest.toLowerCase();
  let category = "diger";
  for (const [catId, kws] of Object.entries(window.QUICK_ADD_KEYWORDS)) {
    if (kws.some((k) => lower.includes(k))) { category = catId; break; }
  }
  const type = ["maas", "freelance", "yatirim"].includes(category) ? "income" : "expense";
  const label = (categories || []).find((c) => c.id === category)?.label || "İşlem";
  const name = rest ? rest.replace(/^./, (c) => c.toUpperCase()) : label;
  return { amount, name, category, type };
};

window.APP_DATA = (function () {  const fmt = (n) =>
    new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);

  const fmtShort = (n) => {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".", ",") + "M";
    if (abs >= 1_000) return (n / 1_000).toFixed(1).replace(".", ",") + "B";
    return Math.round(n).toString();
  };

  // Kategoriler — kullanıcı arayüzünde seçilebilir, taksonomi olarak korunur
  const categories = [
    { id: "market",     label: "Market",          color: "#22c55e", icon: "shopping-cart" },
    { id: "yemek",      label: "Yemek & Kafe",    color: "#f59e0b", icon: "utensils" },
    { id: "ulasim",     label: "Ulaşım",          color: "#3b82f6", icon: "car" },
    { id: "kira",       label: "Kira",            color: "#a855f7", icon: "home" },
    { id: "faturalar",  label: "Faturalar",       color: "#06b6d4", icon: "file-text" },
    { id: "eglence",    label: "Eğlence",         color: "#ec4899", icon: "music" },
    { id: "saglik",     label: "Sağlık",          color: "#ef4444", icon: "heart" },
    { id: "egitim",     label: "Eğitim",          color: "#10b981", icon: "book" },
    { id: "alisveris",  label: "Alışveriş",       color: "#f97316", icon: "bag" },
    { id: "abonelik",   label: "Abonelikler",     color: "#8b5cf6", icon: "repeat" },
    { id: "maas",       label: "Maaş",            color: "#84cc16", icon: "wallet" },
    { id: "freelance",  label: "Freelance",       color: "#14b8a6", icon: "briefcase" },
    { id: "yatirim",    label: "Yatırım Getirisi", color: "#0ea5e9", icon: "trending-up" },
    { id: "diger",      label: "Diğer",           color: "#64748b", icon: "more" },
  ];

  // Boş veri — kullanıcı kendi hesaplarını, işlemlerini, borçlarını ve bütçesini ekler.
  const accounts = [];
  const transactions = [];
  const budgets = [];
  const debts = [];

  // Boş tarih serileri — bilgisel grafikler için iskelet (son 12 ay etiketleri)
  const monthNames = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
  const today = appToday();
  const monthly = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    monthly.push({
      label: monthNames[d.getMonth()],
      year: d.getFullYear(),
      month: d.getMonth(),
      income: 0,
      expense: 0,
      net: 0,
    });
  }
  const netWorth = monthly.map((m) => ({ label: m.label, value: 0 }));

  return { fmt, fmtShort, accounts, categories, transactions, budgets, debts, monthly, netWorth };
})();
