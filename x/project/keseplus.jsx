// Kese+ — Profesyonel Finansal Komuta Merkezi
// Teşhis, KPI'lar, net değer kompozisyonu, borç portföyü, projeksiyon, aksiyonlar
// ─────────────────────────────────────────────────────────

const { useMemo: useMemoKP, useState: useStateKP } = React;

function KesePlusView({ ctx }) {
  const { showBalances, accounts, debts, transactions, snapshots, goals } = ctx;
  const fmt = APP_DATA.fmt, fmtS = APP_DATA.fmtShort;
  const today = appToday();
  const monthName = (n) => { const d = new Date(today.getFullYear(), today.getMonth() + n, 1); return `${["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"][d.getMonth()]} ${d.getFullYear()}`; };
  const [kpTab, setKpTab] = useStateKP("genel");

  const M = useMemoKP(() => {
    const isLeg = (t) => isTransferLeg(t);
    const isDebtPay = (t) => isDebtPayment(t);

    // Varlık / yükümlülük
    const cashAccts = accounts.filter((a) => !a.type.includes("Kart"));
    const cardAccts = accounts.filter((a) => a.type.includes("Kart"));
    const liquidCash = cashAccts.reduce((s, a) => s + Math.max(0, a.balance), 0);
    const cardDebt = -cardAccts.reduce((s, a) => s + Math.min(0, a.balance), 0);
    const cardLimit = cardAccts.reduce((s, a) => s + (a.limit || 0), 0);
    const cardUtil = cardLimit ? cardDebt / cardLimit * 100 : 0;
    const loanDebt = debts.reduce((s, d) => s + (d.remaining || 0), 0);
    const totalDebt = cardDebt + loanDebt;
    const totalAssets = liquidCash;
    const netWorth = totalAssets - totalDebt;

    // Aylık gelir/gider — gerçek veri olan aylara göre
    const monthsBack = 6;
    const series = [];
    const TRM = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];
    for (let i = monthsBack - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const s = new Date(d.getFullYear(), d.getMonth(), 1);
      const e = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const txs = transactions.filter((t) => { const dt = new Date(t.date); return dt >= s && dt <= e; });
      const inc = txs.filter((t) => !isLeg(t) && !isDebtPay(t) && t.amount > 0).reduce((a, t) => a + t.amount, 0);
      const exp = -txs.filter((t) => !isLeg(t) && !isDebtPay(t) && t.amount < 0).reduce((a, t) => a + t.amount, 0);
      series.push({ inc, exp, net: inc - exp, label: TRM[d.getMonth()] });
    }
    const incMonths = Math.max(1, series.filter((m) => m.inc > 0).length);
    const actMonths = Math.max(1, series.filter((m) => m.inc > 0 || m.exp > 0).length);
    const totalInc = series.reduce((s, m) => s + m.inc, 0);
    const totalExp = series.reduce((s, m) => s + m.exp, 0);
    const monthlyIncome = totalInc / incMonths;
    const monthlyExpense = totalExp / actMonths;

    // Pasif gelir (yatırım kategorisinden) — finansal bağımsızlık oranı için
    const passiveIds = new Set(["yatirim"]);
    const totalPassive = transactions.filter((t) => !isLeg(t) && !isDebtPay(t) && t.amount > 0 && passiveIds.has(t.category)
      && new Date(t.date) >= new Date(today.getFullYear(), today.getMonth() - monthsBack + 1, 1)).reduce((a, t) => a + t.amount, 0);
    const passiveIncomeMo = totalPassive / incMonths;

    // Faiz / taşıma maliyeti
    const cardInterestMo = cardAccts.reduce((s, a) => s + Math.max(0, -a.balance) * ((a.rate || 4.25) / 100), 0);
    const loanInterestMo = debts.reduce((s, d) => s + (d.remaining || 0) * ((d.rate || 0) / 100), 0);
    const carryingMo = cardInterestMo + loanInterestMo;
    const carryingYr = carryingMo * 12;

    // Oranlar
    const cardMinPay = cardDebt * 0.20;
    const loanMonthly = debts.reduce((s, d) => s + (d.monthly || 0), 0);
    const monthlyDebtService = cardMinPay + loanMonthly;
    const dsr = monthlyIncome ? monthlyDebtService / monthlyIncome * 100 : 0;
    const emergencyMonths = monthlyExpense ? liquidCash / monthlyExpense : 0;
    const savingsRate = monthlyIncome ? (monthlyIncome - monthlyExpense) / monthlyIncome * 100 : 0;
    const runway = monthlyExpense ? liquidCash / monthlyExpense : 0;
    const leverage = liquidCash > 0 ? totalDebt / liquidCash : Infinity;

    // Sağlık skoru (0-100)
    const savePts = Math.max(0, Math.min(100, savingsRate * 4));
    const emgPts = Math.max(0, Math.min(100, emergencyMonths / 6 * 100));
    const dsrPts = Math.max(0, Math.min(100, (1 - dsr / 60) * 100));
    const utilPts = Math.max(0, Math.min(100, (1 - cardUtil / 100) * 100));
    const nwPts = netWorth >= 0 ? 100 : Math.max(0, 100 - (-netWorth / Math.max(1, monthlyIncome * 6)) * 100);
    const score = Math.round(savePts * 0.22 + emgPts * 0.28 + dsrPts * 0.20 + utilPts * 0.12 + nwPts * 0.18);
    const grade = score >= 75 ? "Güçlü" : score >= 55 ? "İyi" : score >= 35 ? "Geliştirilmeli" : "Kırılgan";
    const gradeColor = score >= 75 ? "var(--pos)" : score >= 55 ? "#0ea5e9" : score >= 35 ? "var(--warn)" : "var(--neg)";

    // Borç portföyü (kart + kredi) faiz maliyetiyle
    const debtPortfolio = [
      ...cardAccts.filter((a) => -a.balance > 0).map((a) => ({
        name: a.name, type: "Kredi Kartı", color: a.color, balance: -a.balance,
        rate: a.rate || 4.25, interestMo: Math.max(0, -a.balance) * ((a.rate || 4.25) / 100),
      })),
      ...debts.map((d) => ({
        name: d.name, type: d.type || "Kredi", color: d.color || "#a855f7", balance: d.remaining,
        rate: d.rate || 0, interestMo: (d.remaining || 0) * ((d.rate || 0) / 100),
      })),
    ].sort((a, b) => b.interestMo - a.interestMo);

    // Projeksiyon — mevcut tempoda (aylık faaliyet farkı borç eritmeye gider)
    const monthlyNet = monthlyIncome - monthlyExpense;
    const proj = (months) => netWorth + monthlyNet * months;

    // Dikey analiz (common-size) — bu dönem gider kalemlerinin gelire oranı
    const curMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const curTx = transactions.filter((t) => new Date(t.date) >= curMonthStart && !isLeg(t) && !isDebtPay(t));
    const curIncome = curTx.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
    const baseInc = curIncome || monthlyIncome || 1;
    const catMap = {};
    curTx.forEach((t) => { if (t.amount < 0) catMap[t.category] = (catMap[t.category] || 0) + -t.amount; });
    const commonSize = Object.entries(catMap).map(([id, amt]) => {
      const cat = APP_DATA.categories.find((c) => c.id === id) || { label: id, color: "#64748b" };
      return { label: cat.label, color: cat.color, amount: amt, pctIncome: amt / baseInc * 100 };
    }).sort((a, b) => b.amount - a.amount);
    const curExpense = commonSize.reduce((s, c) => s + c.amount, 0);

    // 24 aylık GERÇEKÇİ net değer projeksiyonu (borç-farkındalıklı, ay ay simülasyon)
    // Her ay: faaliyet fazlası önce en yüksek faizli borca gider (faiz azalır), borç bitince nakde eklenir.
    const projMonths = 24;
    const simDebts = debtPortfolio.map((d) => ({ bal: d.balance, rate: d.rate / 100 }));
    let simAssets = liquidCash;
    const projReal = [netWorth];
    let debtFreeMonth = simDebts.length === 0 ? 0 : null;
    let positiveMonth = netWorth >= 0 ? 0 : null;
    let interestPaid24 = 0;
    for (let i = 1; i <= projMonths; i++) {
      // faiz tahakkuku
      simDebts.forEach((d) => { if (d.bal > 0) { const it = d.bal * d.rate; d.bal += it; interestPaid24 += it; } });
      // aylık fazla = gelir - gider (faiz zaten borca eklendi; fazlayı borca/nakde dağıt)
      let pool = monthlyNet;
      if (pool > 0) {
        const open = simDebts.filter((d) => d.bal > 0.5).sort((a, b) => b.rate - a.rate);
        for (const d of open) { if (pool <= 0) break; const pay = Math.min(pool, d.bal); d.bal -= pay; pool -= pay; }
        if (pool > 0) simAssets += pool; // borç bittiyse kalan nakde
      } else {
        simAssets += pool; // negatifse nakitten düşer
      }
      const debtSum = simDebts.reduce((s, d) => s + Math.max(0, d.bal), 0);
      const nw = simAssets - debtSum;
      projReal.push(nw);
      if (debtFreeMonth === null && debtSum < 1) debtFreeMonth = i;
      if (positiveMonth === null && nw >= 0) positiveMonth = i;
    }
    const projEnd = projReal[projMonths];

    return {
      liquidCash, cardDebt, cardLimit, cardUtil, loanDebt, totalDebt, totalAssets, netWorth,
      monthlyIncome, monthlyExpense, monthlyNet, cardInterestMo, loanInterestMo, carryingMo, carryingYr,
      dsr, emergencyMonths, savingsRate, runway, leverage, monthlyDebtService,
      score, grade, gradeColor, debtPortfolio, series, actMonths,
      proj6: proj(6), proj12: proj(12),
      projReal, projMonths, debtFreeMonth, positiveMonth, projEnd, interestPaid24,
      commonSize, curIncome: baseInc, curExpense, passiveIncomeMo,
    };
  }, [accounts, debts, transactions, goals]);

  if (accounts.length === 0 && transactions.length === 0) {
    return (
      <div className="view view-keseplus">
        <div className="kp-hero kp-hero-empty">
          <div className="kp-badge">KESE+</div>
          <h1>Profesyonel finansal komuta merkezi</h1>
          <p>Hesap ve işlem ekledikçe burada sağlık skorun, faiz sızıntın, borç portföyün ve net değer projeksiyonun profesyonel bir panelde toplanır.</p>
        </div>
      </div>
    );
  }

  const m = M;

  const pct = (v) => `%${v.toFixed(0)}`;
  const money = (v) => showBalances ? `₺${fmt(v)}` : "••••";
  const moneyS = (v) => showBalances ? `₺${fmtS(v)}` : "••";
  const xRatio = (v) => v === Infinity ? "∞" : `${v.toFixed(2)}×`;

  // ── Kurumsal finansal oranlar ──
  const loanMonthlyTotal = debts.reduce((s, d) => s + (d.monthly || 0), 0);
  const shortTermLiab = m.cardDebt + Math.min(m.loanDebt, loanMonthlyTotal * 12);
  const currentRatio = shortTermLiab ? m.liquidCash / shortTermLiab : Infinity;
  const debtToAssets = m.totalAssets ? m.totalDebt / m.totalAssets : Infinity;
  const debtToIncome = m.monthlyIncome ? m.totalDebt / (m.monthlyIncome * 12) : Infinity;
  const interestCoverage = m.carryingMo ? m.monthlyIncome / m.carryingMo : Infinity;
  const netMargin = m.monthlyIncome ? m.monthlyNet / m.monthlyIncome * 100 : 0;
  const expenseRatio = m.monthlyIncome ? m.monthlyExpense / m.monthlyIncome * 100 : 0;
  const equityNeg = m.netWorth < 0;

  // Yeni: borçsuzluk (özkaynak/varlık), finansal bağımsızlık, serbest nakit akışı
  // Borç karşılama: varlığın borcun ne kadarını karşıladığı (sınırlı, patlamaz)
  const debtCoverage = m.totalDebt > 0 ? (m.totalAssets / m.totalDebt) * 100 : (m.totalAssets > 0 ? 999 : 0);
  const fiRatio = m.monthlyExpense ? m.passiveIncomeMo / m.monthlyExpense * 100 : 0;
  const freeCashFlow = m.monthlyIncome - m.monthlyExpense - m.monthlyDebtService;
  const fcfMargin = m.monthlyIncome ? freeCashFlow / m.monthlyIncome * 100 : 0;

  // Kredi notu (kurumsal derecelendirme tarzı)
  const ratingScale = [
    { min: 88, g: "AAA", t: "Birinci sınıf", inv: true },
    { min: 78, g: "AA", t: "Yüksek kalite", inv: true },
    { min: 68, g: "A", t: "Üst-orta kalite", inv: true },
    { min: 58, g: "BBB", t: "Orta kalite", inv: true },
    { min: 48, g: "BB", t: "Spekülatif", inv: false },
    { min: 38, g: "B", t: "Yüksek spekülatif", inv: false },
    { min: 28, g: "CCC", t: "Önemli risk", inv: false },
    { min: 0, g: "D", t: "Kritik / temerrüt riski", inv: false },
  ];
  const rating = ratingScale.find((r) => m.score >= r.min);

  const ratioCats = [
    {
      title: "Likidite oranları", sub: "Kısa vadeli ödeme gücü", icon: "wallet",
      rows: [
        { l: "Cari oran", v: xRatio(currentRatio), f: "Likit varlık ÷ kısa vadeli borç", bm: "Hedef ≥ 1,5×", src: "std", zone: currentRatio >= 1.5 ? "ok" : currentRatio >= 1 ? "warn" : "bad", plain: currentRatio >= 1.5 ? "Kısa vadeli borçlarını nakitle rahatça karşılarsın." : currentRatio >= 1 ? "Tamponun ince — borcuna yakın nakdin var." : "Kısa vadeli borcun nakdini aşıyor, acil ödeme gücün yok.", exp: "Kısa vadede ödenmesi gereken her 1 TL borç için elinde kaç TL likit (nakit) var? 1,5× = borcunun 1,5 katı nakdin var demek (sağlıklı). 1× altı: yaklaşan borçları nakitle karşılayamıyorsun, varlık satman veya yeni borç gerekir. Şirketlerin bilançosundaki 'current ratio'nun aynısı." },
        { l: "Likidite tamponu", v: `${m.emergencyMonths.toFixed(1)} ay`, f: "Nakit ÷ aylık gider", bm: "Hedef 3–6 ay", src: "kf", zone: m.emergencyMonths >= 3 ? "ok" : m.emergencyMonths >= 1 ? "warn" : "bad", plain: m.emergencyMonths >= 3 ? "Gelirin kesilse bile aylarca idare edersin." : m.emergencyMonths >= 1 ? "Az bir tamponun var ama yeterli değil." : "Neredeyse hiç nakit tamponun yok — acil durumda anında borca düşersin.", exp: "Hiç gelirin olmasa, mevcut nakdinle normal harcamalarını kaç ay sürdürebilirsin? Kişisel finansın en önemli güvenlik metriği. 3-6 ay tavsiye edilir; bu kadar tamponun yoksa beklenmedik bir gider (sağlık, araç) seni borca iter." },
        { l: "Runway", v: `${m.runway.toFixed(1)} ay`, f: "Gelirsiz dayanma süresi", bm: "Hedef ≥ 6 ay", src: "kf", zone: m.runway >= 6 ? "ok" : m.runway >= 3 ? "warn" : "bad", plain: m.runway >= 6 ? "Gelirin dursa bile uzun süre ayakta kalırsın." : m.runway >= 3 ? "Gelir kesilirse birkaç ay dayanırsın, sınırlı." : "Gelirin dursa neredeyse anında sıkışırsın.", exp: "Startup dünyasından gelir: gelir akışın bugün dursa, mevcut nakdin 'pistin' kaç ay daha uçmana yeter? Likidite tamponuyla benzer ama 'işini/gelirini kaybetme' senaryosuna odaklanır. 6+ ay rahat bir güvenlik marjıdır." },
      ],
    },
    {
      title: "Borçluluk & kaldıraç", sub: "Solvency / ödeme kabiliyeti", icon: "scale",
      rows: [
        { l: "Borç / varlık", v: debtToAssets === Infinity ? "∞" : xRatio(debtToAssets), f: "Toplam borç ÷ toplam varlık", bm: "Sağlıklı < 0,5×", src: "std", zone: debtToAssets < 0.5 ? "ok" : debtToAssets < 1 ? "warn" : "bad", plain: debtToAssets < 0.5 ? "Varlıkların borcunu rahatça karşılıyor." : debtToAssets < 1 ? "Borcun varlığına yaklaşıyor, dikkatli ol." : "Borcun varlığını kat kat aşıyor — net değerin derin negatif.", exp: "Sahip olduğun her 1 TL varlığa karşı ne kadar borcun var? 0,5× = varlıklarının yarısı kadar borç (sağlıklı). 1× üstü = borcun varlığını aşıyor, yani net değerin NEGATİF. Şirketlerin 'kaldıraç' ölçüsünün temelidir." },
        { l: "Borç / yıllık gelir", v: debtToIncome === Infinity ? "∞" : xRatio(debtToIncome), f: "Toplam borç ÷ yıllık gelir", bm: "İdeal < 1,0×", src: "kf", zone: debtToIncome < 1 ? "ok" : debtToIncome < 2 ? "warn" : "bad", plain: debtToIncome < 1 ? "Bir yıllık gelirinle tüm borcunu kapatabilirsin." : debtToIncome < 2 ? "Borcunu kapatmak birkaç yılını alır." : "Borcun gelirine göre çok ağır, kapatmak uzun yıllar sürer.", exp: "Toplam borcun yıllık gelirinin kaç katı? 1× altı = bir yıllık gelirinle tüm borcunu kapatabilirsin (ideal). 2× üstü = borç yükü ağır, kapatmak yıllar alır. Kredi başvurularında bankaların baktığı kilit orandır." },
        { l: "Faiz karşılama", v: interestCoverage === Infinity ? "∞" : xRatio(interestCoverage), f: "Gelir ÷ faiz gideri", bm: "Güçlü ≥ 3×", src: "std", zone: interestCoverage >= 3 ? "ok" : interestCoverage >= 1.5 ? "warn" : "bad", plain: interestCoverage >= 3 ? "Gelirin faiz yükünü rahatça karşılıyor." : interestCoverage >= 1.5 ? "Faizi karşılıyorsun ama marjın dar." : "Gelirin faizi bile zor karşılıyor — tehlikeli bölge.", exp: "Gelirin, ödediğin faizin kaç katı? 3× = gelirin faiz yükünün 3 katı (güçlü, faizi rahat çeviriyorsun). 1× altı = gelirin faizini bile karşılamıyor (tehlike). Şirket tahvil notlarında kullanılan 'interest coverage ratio'." },
      ],
    },
    {
      title: "Kârlılık oranları", sub: "Faaliyet verimliliği", icon: "sparkles",
      rows: [
        { l: "Net faaliyet marjı", v: pct(netMargin), f: "(Gelir − gider) ÷ gelir", bm: "Hedef ≥ %20", src: "std", zone: netMargin >= 20 ? "ok" : netMargin >= 0 ? "warn" : "bad", plain: netMargin >= 20 ? "Harcamalarından sonra ciddi bir fazlan kalıyor." : netMargin >= 0 ? "Az bir fazlan kalıyor, harcaman gelirine yakın." : "Gelirinden fazla harcıyorsun — açık veriyorsun.", exp: "Her 100 TL gelirinin kaçı, giderler düşüldükten sonra elinde kalıyor? %20 = gelirinin beşte birini gider yapmadın (kâr). Bir şirketin net kâr marjının kişisel karşılığı. Not: Bu KÂR oranıdır, nakit değil — borç ödemeleri dahil değildir." },
        { l: "Tasarruf oranı", v: pct(m.savingsRate), f: "Faaliyet fazlası ÷ gelir", bm: "Hedef ≥ %20", src: "kf", zone: m.savingsRate >= 20 ? "ok" : m.savingsRate >= 0 ? "warn" : "bad", plain: m.savingsRate >= 20 ? "Gelirinin önemli bir kısmını tasarrufa/borç kapatmaya ayırıyorsun." : m.savingsRate >= 0 ? "Az miktarda fazla üretiyorsun." : "Fazla üretemiyorsun, harcaman gelirini aşıyor.", exp: "Gelirinin yüzde kaçını harcamayıp 'fazla' olarak ürettin? FIRE (erken emeklilik) hareketinin temel metriği. %20+ servet biriktirmenin başlangıcıdır. Bu fazla borç ödemesine de gidebilir — yani illa nakit birikmez ama net değerini artırır." },
        { l: "Net değer", v: `${m.netWorth < 0 ? "−" : ""}${moneyS(Math.abs(m.netWorth))}`, f: "Varlık − yükümlülük (özkaynak)", bm: equityNeg ? "Negatif özkaynak" : "Pozitif ✓", src: "std", zone: m.netWorth >= 0 ? "ok" : "bad", plain: m.netWorth >= 0 ? "Varlıkların borcunu aşıyor — pozitif servetin var." : "Borcun varlığını aşıyor — net değerin negatif.", exp: "Tüm varlıklarını satıp tüm borçlarını ödesen cebinde ne kalır? Bu senin gerçek 'servetin'. Negatifse borcun varlığını aşıyor demek. Finansal ilerlemenin TEK gerçek ölçüsü: amaç bu sayıyı her ay yukarı taşımak." },
      ],
    },
    {
      title: "Verimlilik oranları", sub: "Maliyet & borç yükü", icon: "flow",
      rows: [
        { l: "Gider oranı", v: pct(expenseRatio), f: "Gider ÷ gelir", bm: "İyi < %70", src: "std", zone: expenseRatio < 70 ? "ok" : expenseRatio < 90 ? "warn" : "bad", plain: expenseRatio < 70 ? "Harcaman gelirinin sağlıklı bir kısmında kalıyor." : expenseRatio < 90 ? "Harcaman gelirine yaklaşıyor, tasarrufa az yer kalıyor." : "Neredeyse tüm gelirini harcıyorsun.", exp: "Gelirinin yüzde kaçını harcıyorsun? %70 altı = gelirinin en az %30'unu harcamadan tutuyorsun (iyi). %90 üstü = neredeyse her kuruşu harcıyorsun, tasarrufa yer kalmıyor. Net faaliyet marjının tersi gibidir." },
        { l: "Borç servis oranı", v: pct(m.dsr), f: "Aylık borç ödemesi ÷ gelir", bm: "Sağlıklı < %30", src: "std", zone: m.dsr < 30 ? "ok" : m.dsr < 43 ? "warn" : "bad", plain: m.dsr < 30 ? "Borç ödemelerin gelirine göre hafif — bankalar seni güvenli borçlu sayar." : m.dsr < 43 ? "Borç ödemelerin gelirinin önemli bir kısmını alıyor." : "Borç ödemelerin gelirinin çok büyük kısmını yiyor — riskli borçlu sayılırsın.", exp: "Aylık gelirinin yüzde kaçı borç taksitlerine/asgari ödemelere gidiyor? Bankaların kredi onayında kullandığı GERÇEK eşik: %43 üstü 'riskli borçlu' sayılır, kredi alman zorlaşır. %30 altı sağlıklıdır. (DSR = Debt Service Ratio)" },
        { l: "Faiz yükü oranı", v: m.monthlyIncome ? pct(m.carryingMo / m.monthlyIncome * 100) : "—", f: "Aylık faiz ÷ gelir", bm: "Düşük < %5", src: "kf", zone: m.monthlyIncome && m.carryingMo / m.monthlyIncome * 100 < 5 ? "ok" : "warn", plain: (m.monthlyIncome && m.carryingMo / m.monthlyIncome * 100 < 5) ? "Faize giden pay gelirine göre düşük." : "Faize giden pay dikkat çekici — en pahalı borcu önceliklendir.", exp: "Gelirinin yüzde kaçı SADECE faize gidiyor (anapara değil)? Bu para tamamen 'kayıp' — hiçbir şey satın almıyor, sadece borcu taşıyorsun. %5 altı kabul edilebilir; yüksekse en pahalı borcu önce kapatman gerekir." },
      ],
    },
    {
      title: "Bağımsızlık & nakit", sub: "Servet sağlığı ve serbest nakit", icon: "sparkles",
      rows: [
        { l: "Borç karşılama", v: m.totalDebt > 0 ? `%${Math.min(999, debtCoverage).toFixed(0)}` : "Borçsuz ✓", f: "Likit varlık ÷ toplam borç", bm: "Hedef ≥ %100", src: "std", zone: debtCoverage >= 100 ? "ok" : debtCoverage >= 30 ? "warn" : "bad", plain: debtCoverage >= 100 ? "İstersen bugün tüm borcunu nakitle kapatabilirsin." : debtCoverage >= 30 ? "Borcunun bir kısmını nakitle kapatabilirsin, tamamını değil." : "Nakdin borcunun çok küçük bir kısmını karşılıyor.", exp: "Likit nakdin, toplam borcunun yüzde kaçını anında kapatabilir? %100 = bugün istesen tüm borcunu nakitle kapatabilirsin. Düşükse borç sana 'kilitli' — kapatmak için zaman ve gelir gerekir." },
        { l: "Finansal bağımsızlık", v: pct(fiRatio), f: "Pasif gelir ÷ toplam gider", bm: "Özgürlük = %100", src: "kf", zone: fiRatio >= 100 ? "ok" : fiRatio >= 25 ? "warn" : "bad", plain: fiRatio >= 100 ? "Çalışmadan da geçinebilirsin — finansal özgürlük seviyesindesin." : fiRatio >= 25 ? "Pasif gelirin giderinin bir kısmını karşılıyor, yolun var." : "Pasif gelirin neredeyse yok — tamamen aktif gelirine bağımlısın.", exp: "Çalışmadan elde ettiğin pasif gelir (kira, temettü, faiz), giderlerinin yüzde kaçını karşılıyor? %100 = çalışmasan da geçinebilirsin (finansal özgürlük / FIRE hedefi). Yatırım/temettü geliri ekledikçe bu oran yükselir." },
        { l: "Serbest nakit akışı", v: `${freeCashFlow < 0 ? "−" : "+"}${moneyS(Math.abs(freeCashFlow))}`, f: "Gelir − gider − borç servisi", bm: "Pozitif olmalı", src: "std", zone: freeCashFlow > 0 ? "ok" : freeCashFlow === 0 ? "warn" : "bad", plain: freeCashFlow > 0 ? "Her şey ödendikten sonra elinde harcanabilir para kalıyor." : freeCashFlow === 0 ? "Serbest nakdin sıfıra yakın, marjın yok." : "Açığını borçla kapatıyorsun — serbest nakdin negatif.", exp: "Tüm giderler VE borç ödemeleri yapıldıktan sonra elinde gerçekten serbest kalan para. Şirketlerin en önemli sağlık göstergesi (Free Cash Flow). Pozitifse: yatırıma/birikime yönlendirebileceğin para var. Negatifse: açığı borçla kapatıyorsun." },
      ],
    },
  ];

  // KPI tanımları (renk kodlu, hedefe göre)
  const kpis = [
    { l: "Likidite tamponu", v: `${m.emergencyMonths.toFixed(1)} ay`, hint: "Hedef 3–6 ay", zone: m.emergencyMonths >= 3 ? "ok" : m.emergencyMonths >= 1 ? "warn" : "bad", icon: "wallet", bar: Math.min(100, m.emergencyMonths / 6 * 100) },
    { l: "Yıllık faiz yükü", v: moneyS(m.carryingYr), hint: `aylık ${moneyS(m.carryingMo)}`, zone: m.carryingYr < m.monthlyIncome ? "ok" : m.carryingYr < m.monthlyIncome * 3 ? "warn" : "bad", icon: "flow", bar: Math.min(100, m.monthlyIncome ? m.carryingYr / (m.monthlyIncome * 6) * 100 : 0) },
    { l: "Borç servis oranı", v: pct(m.dsr), hint: "Sağlıklı <%30", zone: m.dsr < 30 ? "ok" : m.dsr < 43 ? "warn" : "bad", icon: "scale", bar: Math.min(100, m.dsr * 1.5) },
    { l: "Kart kullanımı", v: pct(m.cardUtil), hint: "İdeal <%30", zone: m.cardUtil < 30 ? "ok" : m.cardUtil < 70 ? "warn" : "bad", icon: "card", bar: Math.min(100, m.cardUtil) },
    { l: "Tasarruf oranı", v: pct(m.savingsRate), hint: "Hedef %20+", zone: m.savingsRate >= 20 ? "ok" : m.savingsRate >= 0 ? "warn" : "bad", icon: "sparkles", bar: Math.max(0, Math.min(100, m.savingsRate * 2.5)) },
    { l: "Borç / likit", v: m.leverage === Infinity ? "∞" : `${m.leverage.toFixed(1)}×`, hint: "Düşük daha iyi", zone: m.leverage <= 2 ? "ok" : m.leverage <= 5 ? "warn" : "bad", icon: "debt", bar: Math.min(100, (m.leverage === Infinity ? 10 : m.leverage) / 10 * 100) },
  ];

  // Akıllı aksiyonlar
  const actions = [];
  if (m.emergencyMonths < 1) actions.push({ icon: "wallet", color: "var(--neg)", t: "Acil fon kur", d: `Likit tamponun ${m.emergencyMonths.toFixed(1)} ay — kritik düşük. İlk hedef: 1 maaşlık (${moneyS(m.monthlyIncome)}) nakit yastık.` });
  if (m.debtPortfolio[0]) actions.push({ icon: "trendingDown", color: "var(--warn)", t: `En pahalı borcu vur: ${m.debtPortfolio[0].name}`, d: `Aylık ${moneyS(m.debtPortfolio[0].interestMo)} faiz üretiyor (%${m.debtPortfolio[0].rate}/ay). Ekstra ödeme buraya gitmeli.` });
  if (m.carryingYr > 0) actions.push({ icon: "flow", color: "#0ea5e9", t: "Faiz sızıntısını izle", d: `Yılda ${moneyS(m.carryingYr)} sadece borcu taşımaya gidiyor — hiçbir şey satın almıyor.` });
  if (m.cardUtil >= 70) actions.push({ icon: "card", color: "var(--neg)", t: "Kart kullanımını düşür", d: `Kullanımın %${m.cardUtil.toFixed(0)} — kredi notunu ve faizini olumsuz etkiler.` });
  if (m.savingsRate >= 20 && m.emergencyMonths >= 3) actions.push({ icon: "target", color: "var(--pos)", t: "Birikime geç", d: "Borç ve tampon kontrol altında — yatırım/hedeflere ağırlık verebilirsin." });

  return (
    <div className="view view-keseplus">
      {/* Teşhis başlığı */}
      <div className="kp-hero">
        <div className="kp-hero-l">
          <div className="kp-badge">KESE+</div>
          <h1 className="kp-title">Finansal komuta merkezi</h1>
          <p className="kp-sub">Tüm sinyaller tek ekranda · {new Date().getFullYear()}</p>
        </div>
        <div className="kp-score-block">
          <div className="kp-score-ring" style={{ background: `conic-gradient(${m.gradeColor} ${m.score * 3.6}deg, var(--bg-elev-2) 0deg)` }}>
            <div className="kp-score-inner">
              <div className="kp-score-v">{showBalances ? m.score : "••"}</div>
              <div className="kp-score-max">/100</div>
            </div>
          </div>
          <div className="kp-score-meta">
            <div className="kp-score-grade" style={{ color: m.gradeColor }}>{m.grade}</div>
            <div className="kp-score-nw">Net değer <strong className={m.netWorth >= 0 ? "pos" : "neg"}>{m.netWorth < 0 ? "−" : ""}{moneyS(Math.abs(m.netWorth))}</strong></div>
          </div>
        </div>
      </div>

      {/* Sekme barı */}
      <div className="kp-tabs">
        <button className={kpTab === "genel" ? "kp-tab kp-tab-act" : "kp-tab"} onClick={() => setKpTab("genel")}><Icon name="dashboard" size={15} />Genel</button>
        <button className={kpTab === "ai" ? "kp-tab kp-tab-act" : "kp-tab"} onClick={() => setKpTab("ai")}><Icon name="sparkles" size={15} />AI Asistan</button>
        <button className={kpTab === "tablolar" ? "kp-tab kp-tab-act" : "kp-tab"} onClick={() => setKpTab("tablolar")}><Icon name="building" size={15} />Mali Tablolar</button>
        <button className={kpTab === "analiz" ? "kp-tab kp-tab-act" : "kp-tab"} onClick={() => setKpTab("analiz")}><Icon name="chart" size={15} />Analiz & Oranlar</button>
      </div>

      {kpTab === "ai" && (
        <div className="kp-ai-stack">
          <AIAssistant ctx={ctx} />
          <MonthlyCFOReport ctx={ctx} />
        </div>
      )}

      {kpTab === "genel" && (<>
      {/* Genel: özet metrikler */}
      {/* KPI komuta ızgarası */}
      <div className="kp-kpis">
        {kpis.map((k) => (
          <div key={k.l} className={`kp-kpi kp-z-${k.zone}`}>
            <div className="kp-kpi-h"><span className="kp-kpi-ic"><Icon name={k.icon} size={15} /></span>{k.l}</div>
            <div className="kp-kpi-v">{showBalances ? k.v : "••"}</div>
            <div className="kp-kpi-bar"><div style={{ width: `${k.bar}%` }} /></div>
            <div className="kp-kpi-hint">{k.hint}</div>
          </div>
        ))}
      </div>

      <div className="kp-grid">
        {/* Net değer kompozisyonu */}
        <Card title="Net değer kompozisyonu" subtitle="Varlık vs yükümlülük kırılımı">
          <div className="kp-comp">
            <div className="kp-comp-side">
              <div className="kp-comp-l pos">Varlıklar</div>
              <div className="kp-comp-v mono">{money(m.totalAssets)}</div>
              <div className="kp-comp-bar"><div style={{ width: "100%", background: "var(--pos)" }} /></div>
              <div className="kp-comp-row"><span className="kp-dot" style={{ background: "var(--pos)" }} />Likit nakit<span className="kp-comp-amt mono">{moneyS(m.liquidCash)}</span></div>
            </div>
            <div className="kp-comp-side">
              <div className="kp-comp-l neg">Yükümlülükler</div>
              <div className="kp-comp-v mono">{money(m.totalDebt)}</div>
              <div className="kp-comp-bar"><div style={{ width: "100%", background: "var(--neg)" }} /></div>
              <div className="kp-comp-row"><span className="kp-dot" style={{ background: "var(--neg)" }} />Kredi kartı<span className="kp-comp-amt mono">{moneyS(m.cardDebt)}</span></div>
              <div className="kp-comp-row"><span className="kp-dot" style={{ background: "#a855f7" }} />Krediler<span className="kp-comp-amt mono">{moneyS(m.loanDebt)}</span></div>
            </div>
          </div>
          <div className="kp-comp-net">
            <span>Net değer (özkaynak)</span>
            <strong className={`mono ${m.netWorth >= 0 ? "pos" : "neg"}`}>{m.netWorth < 0 ? "−" : ""}{money(Math.abs(m.netWorth))}</strong>
          </div>
        </Card>

        {/* Faiz sızıntısı */}
        <Card title="Faiz sızıntısı" subtitle="Borcu taşımanın gerçek maliyeti">
          <div className="kp-leak">
            <div className="kp-leak-big">
              <div className="kp-leak-v mono neg">{moneyS(m.carryingYr)}</div>
              <div className="kp-leak-l">yıllık faiz · hiçbir şey satın almıyor</div>
            </div>
            <div className="kp-leak-rows">
              <div className="kp-leak-row"><span>Aylık faiz</span><strong className="mono neg">{moneyS(m.carryingMo)}</strong></div>
              <div className="kp-leak-row"><span>Gelirinin payı</span><strong className="mono">{m.monthlyIncome ? pct(m.carryingMo / m.monthlyIncome * 100) : "—"}</strong></div>
              <div className="kp-leak-row"><span>Günlük</span><strong className="mono neg">{moneyS(m.carryingMo / 30)}</strong></div>
            </div>
          </div>
        </Card>
      </div>

      {/* Borç portföyü */}
      {m.debtPortfolio.length > 0 && (
        <Card title="Borç portföyü" subtitle="Faiz maliyetine göre sıralı · en pahalı önce öde" padded={false}>
          <table className="kp-debt-table">
            <thead>
              <tr><th>Borç</th><th>Bakiye</th><th>Aylık faiz</th><th>Faiz oranı</th><th>Öncelik</th></tr>
            </thead>
            <tbody>
              {m.debtPortfolio.map((d, i) => (
                <tr key={d.name + i}>
                  <td><div className="kp-debt-name"><span className="kp-dot" style={{ background: d.color }} />{d.name}<span className="kp-debt-type">{d.type}</span></div></td>
                  <td className="mono">{money(d.balance)}</td>
                  <td className="mono neg">{moneyS(d.interestMo)}</td>
                  <td className="mono">%{d.rate}/ay</td>
                  <td>{i === 0 ? <span className="kp-prio kp-prio-1">1. öde</span> : <span className="kp-prio">{i + 1}.</span>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td>Toplam</td><td className="mono">{money(m.totalDebt)}</td><td className="mono neg">{moneyS(m.carryingMo)}</td><td colSpan="2"></td></tr>
            </tfoot>
          </table>
        </Card>
      )}

      <div className="kp-grid">
        {/* Projeksiyon */}
        <Card title="Net değer projeksiyonu" subtitle="Borç-farkındalıklı · 24 ay ay-ay simülasyon" action={<InfoDot text="Gerçekçi simülasyon: her ay faaliyet fazlan (gelir−gider) önce en yüksek faizli borca gider, faiz tahakkuk eder; borç bitince fazla nakde eklenir. Düz çizgi değil — borç eridikçe faiz yükü azalır ve eğri hızlanır. Kilometre taşları bu simülasyondan çıkar." />}>
          <div className="kp-mile">
            <div className="kp-mile-card">
              <div className="kp-mile-ic" style={{ background: "rgba(168,85,247,0.14)", color: "#a855f7" }}><Icon name="debt" size={16} /></div>
              <div className="kp-mile-b">
                <div className="kp-mile-l">Borçsuzluk</div>
                <div className="kp-mile-v">{m.debtFreeMonth === null ? "24+ ay" : m.debtFreeMonth === 0 ? "Borçsuz 🎉" : `${m.debtFreeMonth} ay`}</div>
                {m.debtFreeMonth > 0 && <div className="kp-mile-d">{monthName(m.debtFreeMonth)}</div>}
              </div>
            </div>
            <div className="kp-mile-card">
              <div className="kp-mile-ic" style={{ background: "rgba(34,197,94,0.14)", color: "var(--pos)" }}><Icon name="trendingUp" size={16} /></div>
              <div className="kp-mile-b">
                <div className="kp-mile-l">Pozitife geçiş</div>
                <div className="kp-mile-v">{m.positiveMonth === null ? "24+ ay" : m.positiveMonth === 0 ? "Pozitif ✓" : `${m.positiveMonth} ay`}</div>
                {m.positiveMonth > 0 && <div className="kp-mile-d">{monthName(m.positiveMonth)}</div>}
              </div>
            </div>
            <div className="kp-mile-card">
              <div className="kp-mile-ic" style={{ background: "rgba(14,165,233,0.14)", color: "#0ea5e9" }}><Icon name="building" size={16} /></div>
              <div className="kp-mile-b">
                <div className="kp-mile-l">24 ay sonra</div>
                <div className={`kp-mile-v ${m.projEnd >= 0 ? "pos" : "neg"}`}>{m.projEnd < 0 ? "−" : ""}{moneyS(Math.abs(m.projEnd))}</div>
                <div className="kp-mile-d">Bugün {m.netWorth < 0 ? "−" : ""}{moneyS(Math.abs(m.netWorth))}</div>
              </div>
            </div>
          </div>
          <AreaChart
            series={[{ labels: m.projReal.map((_, i) => i % 4 === 0 ? `${i}.ay` : ""), values: m.projReal, color: "var(--accent)", name: "Net değer" }]}
            height={190}
            formatY={(v) => "₺" + fmtS(v)}
          />
          <div className="kp-proj-note">
            <Icon name="info" size={13} />
            <span>{m.monthlyNet > 0
              ? `Aylık ${moneyS(m.monthlyNet)} fazlayla, 24 ayda toplam ${moneyS(m.interestPaid24)} faiz ödeyip ${m.debtFreeMonth ? `${m.debtFreeMonth}. ayda borçsuz kalırsın` : "borcunu önemli ölçüde eritirsin"}. Eğri borç bitince hızlanır (faiz yükü kalkar).`
              : "Aylık faaliyet farkın negatif — önce gideri gelirin altına çekmen gerekiyor, aksi halde net değer düşer."}</span>
          </div>
        </Card>

        {/* Akıllı aksiyonlar */}
        <Card title="Öncelikli aksiyonlar" subtitle="Durumuna göre öneri sırası">
          <div className="kp-actions">
            {actions.length === 0 && <div className="kp-act-empty">Her şey yolunda — kritik aksiyon yok 🎉</div>}
            {actions.map((a, i) => (
              <div key={i} className="kp-action">
                <span className="kp-act-ic" style={{ background: `${a.color}1f`, color: a.color }}><Icon name={a.icon} size={15} /></span>
                <div className="kp-act-b">
                  <div className="kp-act-t">{a.t}</div>
                  <div className="kp-act-d">{a.d}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      </>)}

      {kpTab === "tablolar" && <CFOView ctx={ctx} embedded />}

      {kpTab === "analiz" && (<>
      {/* ═══ Kurumsal Finansal Analiz ═══ */}
      <Card
        title="Kredi notu & finansal derecelendirme"
        subtitle="Şahsi A.Ş. · oranlara dayalı kurumsal değerlendirme"
        action={<InfoDot text="Kredi derecelendirme kuruluşlarının (S&P, Moody's) mantığıyla; likidite, borçluluk, kârlılık ve faiz karşılama oranlarından türetilir. AAA en güçlü, D temerrüt riski. BBB ve üzeri 'yatırım yapılabilir' kabul edilir." />}
      >
        <div className="kp-rating">
          <div className="kp-rating-badge" style={{ borderColor: m.gradeColor, color: m.gradeColor }}>
            <div className="kp-rating-g">{rating.g}</div>
            <div className="kp-rating-score mono">{showBalances ? m.score : "••"}/100</div>
          </div>
          <div className="kp-rating-b">
            <div className="kp-rating-t" style={{ color: m.gradeColor }}>{rating.t}</div>
            <div className="kp-rating-inv">{rating.inv ? "✓ Yatırım yapılabilir seviye" : "⚠ Spekülatif seviye — risk yüksek"}</div>
            <div className="kp-rating-d">Bu not; likidite tamponun, borç/gelir oranın, faiz karşılaman ve net değerinden hesaplanır. Oranları iyileştirdikçe not yükselir.</div>
          </div>
        </div>
      </Card>

      {/* Gelir / Gider / Net trend */}
      {m.series.some((s) => s.inc > 0 || s.exp > 0) && (
        <Card title="Gelir · gider · net trend" subtitle="Son 6 ayın faaliyet performansı">
          <div className="kp-trend">
            {m.series.map((s, i) => {
              const max = Math.max(...m.series.map((x) => Math.max(x.inc, x.exp)), 1);
              return (
                <div key={i} className="kp-trend-col">
                  <div className="kp-trend-bars">
                    <div className="kp-trend-bar-wrap" title={`Gelir ₺${fmt(s.inc)}`}>
                      <div className="kp-trend-bar kp-trend-inc" style={{ height: `${s.inc / max * 100}%` }} />
                    </div>
                    <div className="kp-trend-bar-wrap" title={`Gider ₺${fmt(s.exp)}`}>
                      <div className="kp-trend-bar kp-trend-exp" style={{ height: `${s.exp / max * 100}%` }} />
                    </div>
                  </div>
                  <div className={`kp-trend-net mono ${s.net >= 0 ? "pos" : "neg"}`}>{s.net >= 0 ? "+" : "−"}{fmtS(Math.abs(s.net))}</div>
                  <div className="kp-trend-lbl">{s.label}</div>
                </div>
              );
            })}
          </div>
          <div className="kp-trend-legend">
            <span><span className="kp-dot" style={{ background: "var(--pos)" }} />Gelir</span>
            <span><span className="kp-dot" style={{ background: "var(--neg)" }} />Gider</span>
            <span className="kp-trend-legend-note">Alt satır: aylık net faaliyet farkı</span>
          </div>
        </Card>
      )}

      {/* Dikey analiz (common-size) */}
      {m.commonSize.length > 0 && (
        <Card
          title="Dikey analiz (common-size)"
          subtitle="Bu ay · her gider kaleminin gelire oranı"
          action={<InfoDot text="Şirketlerin gelir tablosu sunumunda kullandığı yöntem: her kalemi gelirin yüzdesi olarak gösterir. 'Kira gelirin %X'i' gibi — büyüklükten bağımsız kıyas sağlar, hangi kalemin gelirini en çok yediğini anında görürsün." />}
          padded={false}
        >
          <table className="kp-cs-table">
            <thead>
              <tr><th>Kalem</th><th>Tutar</th><th>Gelire oranı</th><th>Pay</th></tr>
            </thead>
            <tbody>
              {m.commonSize.map((c) => (
                <tr key={c.label}>
                  <td><div className="kp-cs-name"><span className="kp-dot" style={{ background: c.color }} />{c.label}</div></td>
                  <td className="mono">{money(c.amount)}</td>
                  <td className="mono">{c.pctIncome.toFixed(1)}%</td>
                  <td>
                    <div className="kp-cs-bar"><div style={{ width: `${Math.min(100, c.pctIncome)}%`, background: c.color }} /></div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Toplam gider</td>
                <td className="mono">{money(m.curExpense)}</td>
                <td className="mono">{(m.curExpense / m.curIncome * 100).toFixed(1)}%</td>
                <td><span className="kp-cs-foot-net">Net marj %{(100 - m.curExpense / m.curIncome * 100).toFixed(0)}</span></td>
              </tr>
            </tfoot>
          </table>
        </Card>
      )}

      <div className="kp-ratio-grid">
        {ratioCats.map((cat) => (
          <Card key={cat.title} title={cat.title} subtitle={cat.sub}>
            <div className="kp-ratios">
              {cat.rows.map((r) => (
                <div key={r.l} className={`kp-ratio kp-z-${r.zone}`}>
                  <div className="kp-ratio-top">
                    <span className="kp-ratio-l">{r.l}{r.exp && <InfoDot text={r.exp} />}</span>
                    <span className="kp-ratio-v">{showBalances ? r.v : "••"}</span>
                  </div>
                  {r.plain && <div className="kp-ratio-plain">{r.plain}</div>}
                  <div className="kp-ratio-f">{r.f}</div>
                  <div className="kp-ratio-bm">
                    <span className={`kp-ratio-badge kp-zb-${r.zone}`}>{r.zone === "ok" ? "İyi" : r.zone === "warn" ? "Orta" : "Zayıf"}</span>
                    <span className="kp-ratio-bm-t">{r.bm}</span>
                    {r.src && <span className={`kp-ratio-src kp-src-${r.src}`} title={r.src === "std" ? "Standart muhasebe/finans oranı (GAAP/IFRS)" : "Kişisel finans uyarlaması — yaygın kabul gören metrik"}>{r.src === "std" ? "Standart" : "Kişisel finans"}</span>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
      </>)}
    </div>
  );
}

Object.assign(window, { KesePlusView });
