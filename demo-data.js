// Demo / test data generator for Kese
// Kullanıcı Ayarlar > "Örnek veri yükle" ile çağırır.

window.generateDemoData = function generateDemoData() {
  const today = appToday(); // gerçek bugün — demo verisi buna göre üretilir

  const accounts = [
    { id: "a1", name: "Garanti BBVA", type: "Vadesiz Hesap", number: "TR** **** **** 4421", balance: 42180.55, color: "#1eb980" },
    { id: "a2", name: "İş Bankası", type: "Maaş Hesabı", number: "TR** **** **** 8810", balance: 18540.20, color: "#3a7bd5" },
    { id: "a3", name: "Akbank Axess", type: "Kredi Kartı", number: "**** **** **** 2298", balance: -7842.10, limit: 25000, color: "#e74c3c" },
    { id: "a4", name: "Yapı Kredi World", type: "Kredi Kartı", number: "**** **** **** 5530", balance: -3120.40, limit: 18000, color: "#8b5cf6" },
    { id: "a5", name: "Papara", type: "E-Cüzdan", number: "@aliveli", balance: 1842.30, color: "#f5a623" },
  ];

  const merchants = {
    market: ["Migros", "BİM", "A101", "ŞOK", "Carrefour", "Macrocenter"],
    yemek: ["Starbucks", "Kahve Dünyası", "Yemeksepeti", "Getir Yemek", "Big Chefs", "Burger King", "Köfteci Yusuf"],
    ulasim: ["İstanbulkart", "BiTaksi", "Uber", "Shell", "Opet", "BP"],
    faturalar: ["Türk Telekom", "BEDAŞ Elektrik", "İGDAŞ Doğalgaz", "İSKİ Su", "Vodafone"],
    eglence: ["Cinemaximum", "Zorlu PSM", "IF Performance"],
    saglik: ["Eczane Hayat", "Acıbadem Hastanesi", "Eczane Merkez"],
    egitim: ["Udemy", "Domestika", "Kitapyurdu"],
    alisveris: ["Trendyol", "Hepsiburada", "Zara", "LC Waikiki", "MediaMarkt", "IKEA"],
    abonelik: ["Spotify", "Netflix", "YouTube Premium", "iCloud", "Notion", "ChatGPT Plus"],
    freelance: ["Beta Studios", "Gama Tasarım Ofisi"],
  };

  const subAmounts = { Spotify: -59.99, Netflix: -149.99, "YouTube Premium": -57.99, iCloud: -29.99, Notion: -310, "ChatGPT Plus": -680 };

  function rand(min, max) { return Math.random() * (max - min) + min; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  const transactions = [];
  let tid = 1;

  // Recurring monthly for last 4 months: salary, freelance, rent, subscriptions, bills
  for (let m = 0; m < 4; m++) {
    const month = new Date(today.getFullYear(), today.getMonth() - m, 1);
    // Gelecek tarihli işlem üretme — bugünden sonraki günler "planlı ödeme"dir, kayıtlı işlem değil
    const pushIfPast = (day, tx) => {
      const dt = new Date(month.getFullYear(), month.getMonth(), day);
      if (dt > today) return;
      transactions.push({ id: "t" + tid++, date: dt.toISOString(), ...tx });
    };
    pushIfPast(15, { name: "Acme Teknoloji A.Ş.", note: "Maaş ödemesi", category: "maas", account: "a2", amount: 62500 });
    if (Math.random() > 0.4) {
      pushIfPast(5 + Math.floor(rand(0, 4)), { name: pick(merchants.freelance), note: "Proje teslimi", category: "freelance", account: "a1", amount: Math.round(rand(4000, 12000)) });
    }
    pushIfPast(1, { name: "Ev sahibi - Mehmet B.", note: "Kira ödemesi", category: "kira", account: "a1", amount: -18500 });
    Object.entries(subAmounts).forEach(([name, amt], i) => {
      pushIfPast(8 + i, { name, note: "Aylık abonelik", category: "abonelik", account: "a3", amount: amt });
    });
    ["Türk Telekom", "BEDAŞ Elektrik", "İGDAŞ Doğalgaz", "İSKİ Su", "Vodafone"].forEach((b, i) => {
      pushIfPast(20 + i, { name: b, note: "Aylık fatura", category: "faturalar", account: "a1", amount: -Math.round(rand(180, 1200)) });
    });
  }

  // Everyday spending for last 90 days
  for (let d = 0; d < 90; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() - d);
    const txCount = Math.floor(rand(1, 5));
    for (let i = 0; i < txCount; i++) {
      const catId = pick(["market", "market", "yemek", "yemek", "ulasim", "ulasim", "eglence", "alisveris", "saglik"]);
      const mch = pick(merchants[catId]);
      let amt;
      if (catId === "market") amt = -Math.round(rand(80, 850));
      else if (catId === "yemek") amt = -Math.round(rand(45, 380));
      else if (catId === "ulasim") amt = -Math.round(rand(20, 450));
      else if (catId === "eglence") amt = -Math.round(rand(120, 950));
      else if (catId === "alisveris") amt = -Math.round(rand(180, 2800));
      else amt = -Math.round(rand(60, 1500));
      transactions.push({ id: "t" + tid++, date: date.toISOString(), name: mch, note: "", category: catId, account: pick(["a1", "a2", "a3", "a4"]), amount: amt });
    }
  }

  transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

  const budgets = [
    { category: "market", limit: 4500 },
    { category: "yemek", limit: 3000 },
    { category: "ulasim", limit: 2500 },
    { category: "kira", limit: 18500 },
    { category: "faturalar", limit: 3500 },
    { category: "eglence", limit: 2000 },
    { category: "alisveris", limit: 5000 },
    { category: "abonelik", limit: 1500 },
    { category: "saglik", limit: 1000 },
  ];

  const iso = (y, m, d) => new Date(y, m, d).toISOString().slice(0, 10);

  const debts = [
    { id: "d1", name: "Konut Kredisi", lender: "Garanti BBVA", type: "Konut Kredisi", principal: 1250000, remaining: 982540, monthly: 18420, rate: 2.89, term: 120, paid: 21, nextPayment: iso(today.getFullYear(), today.getMonth(), 5), color: "#a855f7" },
    { id: "d2", name: "Araç Kredisi", lender: "İş Bankası", type: "Taşıt Kredisi", principal: 480000, remaining: 312180, monthly: 12850, rate: 3.15, term: 48, paid: 18, nextPayment: iso(today.getFullYear(), today.getMonth(), 12), color: "#3b82f6" },
    { id: "d4", name: "Arkadaş Borcu - Selin", lender: "Kişisel", type: "Faizsiz (Kişisel)", principal: 8000, remaining: 3000, monthly: 1000, rate: 0, term: 8, paid: 5, nextPayment: iso(today.getFullYear(), today.getMonth(), 15), color: "#22c55e" },
  ];

  // Scheduled / recurring payments — next dates in the near future
  const Y = today.getFullYear();
  const M = today.getMonth();
  const scheduled = [
    { id: "s1", name: "Ev Kirası", amount: -18500, category: "kira", account: "a1", frequency: "monthly", nextDate: iso(Y, M + 1, 1), autopay: false, active: true },
    { id: "s2", name: "Maaş", amount: 62500, category: "maas", account: "a2", frequency: "monthly", nextDate: iso(Y, M + 1, 15), autopay: true, active: true },
    { id: "s3", name: "Konut Kredisi Taksiti", amount: -18420, category: "faturalar", account: "a1", frequency: "monthly", nextDate: iso(Y, M, 5) < iso(Y, M, today.getDate()) ? iso(Y, M + 1, 5) : iso(Y, M, 5), autopay: true, active: true },
    { id: "s4", name: "Araç Kredisi Taksiti", amount: -12850, category: "faturalar", account: "a2", frequency: "monthly", nextDate: iso(Y, M + 1, 12), autopay: true, active: true },
    { id: "s5", name: "Netflix", amount: -149.99, category: "abonelik", account: "a3", frequency: "monthly", nextDate: iso(Y, M, 28), autopay: true, active: true },
    { id: "s6", name: "Spotify", amount: -59.99, category: "abonelik", account: "a3", frequency: "monthly", nextDate: iso(Y, M, 29), autopay: true, active: true },
    { id: "s7", name: "ChatGPT Plus", amount: -680, category: "abonelik", account: "a3", frequency: "monthly", nextDate: iso(Y, M + 1, 8), autopay: true, active: true },
    { id: "s8", name: "Elektrik Faturası", amount: -650, category: "faturalar", account: "a1", frequency: "monthly", nextDate: iso(Y, M + 1, 20), autopay: false, active: true },
    { id: "s9", name: "Doğalgaz Faturası", amount: -890, category: "faturalar", account: "a1", frequency: "monthly", nextDate: iso(Y, M + 1, 22), autopay: false, active: true },
    { id: "s10", name: "Spor Salonu", amount: -750, category: "saglik", account: "a1", frequency: "monthly", nextDate: iso(Y, M, 30), autopay: false, active: true },
    { id: "s11", name: "Yıllık Sigorta (Kasko)", amount: -8400, category: "diger", account: "a1", frequency: "yearly", nextDate: iso(Y, M + 2, 3), autopay: false, active: true },
  ];

  const goals = [
    { id: "g1", name: "Acil Durum Fonu", target: 120000, saved: 64000, deadline: iso(Y, M + 8, 1), color: "#22c55e", icon: "shield", priority: "Yüksek" },
    { id: "g2", name: "Yaz Tatili - İtalya", target: 60000, saved: 22500, deadline: iso(Y, M + 4, 15), color: "#0ea5e9", icon: "plane", priority: "Orta" },
    { id: "g3", name: "Yeni MacBook", target: 75000, saved: 18000, deadline: iso(Y, M + 6, 1), color: "#a855f7", icon: "laptop", priority: "Düşük" },
    { id: "g4", name: "Ev Peşinatı", target: 800000, saved: 145000, deadline: iso(Y + 2, M, 1), color: "#f59e0b", icon: "home", priority: "Yüksek" },
  ];

  // 12 aylık net değer anlık görüntüleri (geçmiş — borçlar azaldıkça net değer iyileşiyor)
  const snapshots = [];
  // Bugünkü gerçek değerlere yakınsayan bir geçmiş üret
  const endAssets = accounts.reduce((s, a) => s + Math.max(0, a.balance), 0);     // ~62.5k
  const endCard = -accounts.reduce((s, a) => s + Math.min(0, a.balance), 0);       // ~10.9k
  const endLoans = debts.filter((d) => !d.type.includes("Kart")).reduce((s, d) => s + d.remaining, 0); // ~1.3M
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Y, M - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    // i ay önce: varlık daha düşük, krediler daha yüksek
    const assets = Math.round((endAssets - i * 2400) * 100) / 100;
    const card = Math.round((endCard + i * 600) * 100) / 100;
    const loans = Math.round((endLoans + i * 14500) * 100) / 100;
    const liabilities = card + loans;
    snapshots.push({ ym, date: iso(d.getFullYear(), d.getMonth(), 1), assets: Math.max(0, assets), liabilities, netWorth: Math.max(0, assets) - liabilities });
  }

  // Yatırım portföyü — hisse, fon, altın, döviz, kripto
  const holdings = [
    { id: "h1", name: "THYAO", fullName: "Türk Hava Yolları", type: "Hisse", quantity: 850, avgCost: 245.50, price: 312.80, currency: "TRY", color: "#e11d48" },
    { id: "h2", name: "ASELS", fullName: "Aselsan", type: "Hisse", quantity: 400, avgCost: 58.20, price: 71.40, currency: "TRY", color: "#0ea5e9" },
    { id: "h3", name: "GARAN", fullName: "Garanti BBVA", type: "Hisse", quantity: 1200, avgCost: 92.10, price: 128.60, currency: "TRY", color: "#16a34a" },
    { id: "h4", name: "AAPL", fullName: "Apple Inc.", type: "Yabancı Hisse", quantity: 12, avgCost: 6850, price: 7640, currency: "TRY", color: "#64748b" },
    { id: "h5", name: "İGL Fonu", fullName: "İş Portföy Teknoloji", type: "Fon", quantity: 15000, avgCost: 4.82, price: 6.15, currency: "TRY", color: "#a855f7" },
    { id: "h6", name: "Gram Altın", fullName: "Has Altın", type: "Altın", quantity: 95, avgCost: 2380, price: 3120, currency: "TRY", color: "#f59e0b" },
    { id: "h7", name: "USD", fullName: "Amerikan Doları", type: "Döviz", quantity: 3200, avgCost: 32.10, price: 38.45, currency: "TRY", color: "#22c55e" },
    { id: "h8", name: "BTC", fullName: "Bitcoin", type: "Kripto", quantity: 0.18, avgCost: 1850000, price: 2640000, currency: "TRY", color: "#f7931a" },
    { id: "h9", name: "ETH", fullName: "Ethereum", type: "Kripto", quantity: 1.4, avgCost: 98000, price: 124500, currency: "TRY", color: "#627eea" },
  ];

  return { accounts, transactions, budgets, debts, scheduled, goals, snapshots, holdings };
};