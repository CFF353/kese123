// Mali Tablolar — "Şahsi A.Ş." CFO paneli
// Gelir Tablosu (P&L), Bilanço, Nakit Akış, Finansal Oranlar
// ─────────────────────────────────────────────────────────

const { useState: useStateC, useEffect: useEffectC } = React;

const CFO_MONTHS = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];

// Tıklanınca kısa açıklama gösteren "i" bilgi noktası — aynı anda sadece bir tanesi açık kalır
// Portal ile document.body'ye render edilir: kart/tablo overflow:hidden'larından etkilenmez, kesilmez.
let infoDotSeq = 0;
function InfoDot({ text }) {
  const [open, setOpen] = useStateC(false);
  const [pos, setPos] = useStateC(null);
  const idRef = React.useRef(++infoDotSeq);
  const btnRef = React.useRef(null);

  useEffectC(() => {
    const onOtherOpen = (e) => { if (e.detail !== idRef.current) setOpen(false); };
    window.addEventListener("kese-infodot-open", onOtherOpen);
    return () => window.removeEventListener("kese-infodot-open", onOtherOpen);
  }, []);

  const computePos = () => {
    const r = btnRef.current.getBoundingClientRect();
    const width = 280;
    let left = r.right - width;
    if (left < 8) left = 8;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    let top = r.bottom + 8;
    if (top > window.innerHeight - 60) top = r.top - 8; // yer yoksa yukarı aç
    setPos({ top, left, openUp: top === r.top - 8 });
  };

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      if (next) {
        computePos();
        window.dispatchEvent(new CustomEvent("kese-infodot-open", { detail: idRef.current }));
      }
      return next;
    });
  };

  useEffectC(() => {
    if (!open) return;
    const onScroll = () => computePos();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll, true); window.removeEventListener("resize", onScroll); };
  }, [open]);

  return (
    <span className="info-dot-wrap">
      <button type="button" className="info-dot" ref={btnRef} onClick={toggle} aria-label="Bilgi">
        <Icon name="info" size={15} />
      </button>
      {open && pos && ReactDOM.createPortal(
        <>
          <span className="info-dot-back" onClick={() => setOpen(false)} />
          <span
            className="info-pop info-pop-portal"
            style={{ top: pos.openUp ? "auto" : pos.top, bottom: pos.openUp ? (window.innerHeight - pos.top) : "auto", left: pos.left }}
          >{text}</span>
        </>,
        document.body
      )}
    </span>
  );
}

const INCOME_CATS = ["maas", "freelance", "yatirim"];

function cfoPeriodRange(period, ref) {
  const y = ref.getFullYear(), m = ref.getMonth();
  const eod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
  if (period === "month") {
    return {
      start: new Date(y, m, 1), end: eod(new Date(y, m + 1, 0)),
      prevStart: new Date(y, m - 1, 1), prevEnd: eod(new Date(y, m, 0)),
      label: `${CFO_MONTHS[m]} ${y}`, prevLabel: `${CFO_MONTHS[(m + 11) % 12]}`, months: 1,
    };
  }
  if (period === "quarter") {
    const q = Math.floor(m / 3), qs = q * 3;
    return {
      start: new Date(y, qs, 1), end: eod(new Date(y, qs + 3, 0)),
      prevStart: new Date(y, qs - 3, 1), prevEnd: eod(new Date(y, qs, 0)),
      label: `${q + 1}. Çeyrek ${y}`, prevLabel: `${q === 0 ? 4 : q}. Çeyrek`, months: 3,
    };
  }
  if (period === "year") {
    return {
      start: new Date(y, 0, 1), end: eod(new Date(y, 11, 31)),
      prevStart: new Date(y - 1, 0, 1), prevEnd: eod(new Date(y - 1, 11, 31)),
      label: `${y} Yılı`, prevLabel: `${y - 1}`, months: m + 1,
    };
  }
  // ttm
  return {
    start: new Date(y, m - 11, 1), end: eod(new Date(y, m + 1, 0)),
    prevStart: new Date(y, m - 23, 1), prevEnd: eod(new Date(y, m - 11, 0)),
    label: "Son 12 Ay", prevLabel: "Önceki 12 ay", months: 12,
  };
}

function isFinancingTx(t) {
  const n = (t.note || "").toLowerCase() + " " + (t.name || "").toLowerCase();
  return /borç|taksit|kredi ödeme|kart borcu/.test(n);
}

function CFOView({ ctx, embedded }) {
  const { showBalances, transactions, accounts, debts, budgets } = ctx;
  const [period, setPeriod] = useStateC("month");
  const [scenario, setScenario] = useStateC({ income: 0, expense: 0, extraSaving: 0 });
  const today = appToday();
  const R = cfoPeriodRange(period, today);
  const fmt = APP_DATA.fmt, fmtS = APP_DATA.fmtShort;

  if (accounts.length === 0 && transactions.length === 0) {
    return (
      <div className="view view-cfo">
        <div className="page-head">
          <div>
            <h1 className="page-title">Mali Tablolar</h1>
            <p className="page-sub">Şahsi A.Ş. — kendi finansını bir şirket gibi yönet</p>
          </div>
        </div>
        <div className="empty-big">
          <div className="empty-big-icon"><Icon name="building" size={28} /></div>
          <div className="empty-big-t">Mali tablolar için veri gerekli</div>
          <p className="empty-big-d">Hesap ve işlem ekledikçe burada bir şirketin gördüğü gibi Gelir Tablosu, Bilanço, Nakit Akış Tablosu ve finansal oranlar otomatik oluşturulur.</p>
        </div>
      </div>
    );
  }

  const inRange = (s, e) => transactions.filter((t) => { if (isTransferLeg(t)) return false; const d = new Date(t.date); return d >= s && d <= e; });
  const cur = inRange(R.start, R.end);
  const prev = inRange(R.prevStart, R.prevEnd);

  // ── Gelir Tablosu (P&L) ──
  const sumByCat = (txs, positive) => {
    const map = {};
    txs.forEach((t) => {
      if (positive ? t.amount > 0 : t.amount < 0) {
        map[t.category] = (map[t.category] || 0) + Math.abs(t.amount);
      }
    });
    return map;
  };
  const curInc = sumByCat(cur, true), prevInc = sumByCat(prev, true);
  const curExp = sumByCat(cur, false), prevExp = sumByCat(prev, false);

  const incRows = Object.keys(curInc).map((id) => ({
    cat: APP_DATA.categories.find((c) => c.id === id) || { label: id, color: "#64748b" },
    cur: curInc[id], prev: prevInc[id] || 0,
  })).sort((a, b) => b.cur - a.cur);
  const expRows = Object.keys(curExp).map((id) => ({
    cat: APP_DATA.categories.find((c) => c.id === id) || { label: id, color: "#64748b" },
    cur: curExp[id], prev: prevExp[id] || 0,
  })).sort((a, b) => b.cur - a.cur);

  const totalRev = incRows.reduce((s, r) => s + r.cur, 0);
  const prevRev = Object.values(prevInc).reduce((s, v) => s + v, 0);
  const totalExp = expRows.reduce((s, r) => s + r.cur, 0);
  const prevExpT = Object.values(prevExp).reduce((s, v) => s + v, 0);
  const opResult = totalRev - totalExp;
  const prevOpResult = prevRev - prevExpT;
  const margin = totalRev ? opResult / totalRev * 100 : 0;
  const prevMargin = prevRev ? prevOpResult / prevRev * 100 : 0;

  const pct = (a, b) => b === 0 ? null : ((a - b) / Math.abs(b)) * 100;
  const DeltaTag = ({ a, b, goodUp = true }) => {
    const d = pct(a, b);
    if (d === null) return <span className="cfo-delta cfo-delta-flat">—</span>;
    const good = goodUp ? d >= 0 : d <= 0;
    return <span className={`cfo-delta ${good ? "pos" : "neg"}`}>{d >= 0 ? "▲" : "▼"} %{Math.abs(d).toFixed(1)}</span>;
  };

  // ── Bilanço (Balance Sheet) ──
  const cashAccounts = accounts.filter((a) => !a.type.includes("Kart"));
  const cardAccounts = accounts.filter((a) => a.type.includes("Kart"));
  const totalAssets = cashAccounts.reduce((s, a) => s + Math.max(0, a.balance), 0);
  const cardLiab = -cardAccounts.reduce((s, a) => s + Math.min(0, a.balance), 0);
  const loanLiab = debts.reduce((s, d) => s + d.remaining, 0);
  const totalLiab = cardLiab + loanLiab;
  const equity = totalAssets - totalLiab;
  const assetBase = Math.max(totalAssets, totalLiab) || 1;

  // ── Nakit Akış (Cash Flow) ──
  // Doğru nakit akışı SADECE nakit (vadesiz) hesapların hareketini izler.
  // Karta yapılan harcama nakit çıkışı DEĞİLDİR (borç artışıdır) — o yüzden kart hesabı hareketleri hariç.
  // Kart/kredi ödemeleri ise nakitten çıkar → finansman akışı olarak sayılır.
  const cashIds = new Set(cashAccounts.map((a) => a.id));
  const cashFlowTx = transactions.filter((t) => {
    const d = new Date(t.date);
    return d >= R.start && d <= R.end && cashIds.has(t.account);
  });
  const isFinLeg = (t) => isDebtPayment(t) || isFinancingTx(t);
  const investingTx = cashFlowTx.filter((t) => t.category === "yatirim" && !isFinLeg(t));
  const financingTx = cashFlowTx.filter((t) => isFinLeg(t));
  const operatingTx = cashFlowTx.filter((t) => t.category !== "yatirim" && !isFinLeg(t));
  const opCash = operatingTx.reduce((s, t) => s + t.amount, 0);
  const invCash = investingTx.reduce((s, t) => s + t.amount, 0);
  const finCash = financingTx.reduce((s, t) => s + t.amount, 0);
  const netCash = opCash + invCash + finCash;

  // ── Finansal Oranlar ──
  // Seçili döneme göre aylık değerler (dönem seçiciyle güncellenir)
  const monthlyIncome = totalRev / R.months;
  const monthlyBurn = totalExp / R.months;
  const liquid = totalAssets;
  const monthlyDebtPay = debts.reduce((s, d) => s + d.monthly, 0) + cardLiab * 0.20;
  const savingsRate = monthlyIncome ? (monthlyIncome - monthlyBurn) / monthlyIncome * 100 : 0;
  const runway = monthlyBurn ? liquid / monthlyBurn : 0;
  const dti = monthlyIncome ? monthlyDebtPay / monthlyIncome * 100 : 0;
  const liquidityRatio = cardLiab ? liquid / cardLiab : (liquid > 0 ? Infinity : 0);
  const expenseRatio = monthlyIncome ? monthlyBurn / monthlyIncome * 100 : 0;
  // Nakit tasarruf marjı: dönemde gerçekten cebinde kalan nakit / gelir (borç ödemeleri düşülmüş)
  const cashSaveRate = totalRev ? netCash / totalRev * 100 : 0;

  const ratios = [
    { label: "Faaliyet marjı", value: `%${savingsRate.toFixed(1)}`, hint: "Gelir − gider (borç/faiz hariç)", good: savingsRate >= 20, icon: "sparkles", bar: Math.max(0, Math.min(100, savingsRate * 2.5)) },
    { label: "Aylık yakım (burn)", value: `₺${fmtS(monthlyBurn)}`, hint: `${R.label} ort. aylık gider`, good: null, icon: "flow", bar: null },
    { label: "Runway", value: `${runway.toFixed(1)} ay`, hint: "Gelirsiz dayanma süresi", good: runway >= 6, icon: "clock", bar: Math.min(100, runway / 12 * 100) },
    { label: "Borç / Gelir", value: `%${dti.toFixed(0)}`, hint: "Aylık taksit / gelir", good: dti <= 36, icon: "debt", bar: Math.min(100, dti * 1.5) },
    { label: "Likidite oranı", value: liquidityRatio === Infinity ? "∞" : `${liquidityRatio.toFixed(1)}x`, hint: "Likit / kart borcu", good: liquidityRatio >= 1.5, icon: "scale", bar: Math.min(100, (liquidityRatio === Infinity ? 5 : liquidityRatio) / 3 * 100) },
    { label: "Nakit tasarruf marjı", value: `%${cashSaveRate.toFixed(1)}`, hint: "Net nakit / gelir (borç dahil)", good: cashSaveRate >= 15, icon: "wallet", bar: Math.max(0, Math.min(100, cashSaveRate * 2.5)) },
  ];

  // ── Bütçe vs Gerçekleşen (Variance) ──
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
  const monthTx = inRange(monthStart, monthEnd);
  const spentThisMonth = {};
  monthTx.forEach((t) => { if (t.amount < 0) spentThisMonth[t.category] = (spentThisMonth[t.category] || 0) + -t.amount; });
  const varianceRows = (budgets || []).map((b) => {
    const cat = APP_DATA.categories.find((c) => c.id === b.category) || { label: b.category, color: "#64748b" };
    const actual = spentThisMonth[b.category] || 0;
    return { cat, budget: b.limit, actual, variance: b.limit - actual };
  }).sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  const totalBudget = varianceRows.reduce((s, r) => s + r.budget, 0);
  const totalActual = varianceRows.reduce((s, r) => s + r.actual, 0);
  const totalVariance = totalBudget - totalActual;

  // ── YoY / dönem büyüme ──
  const monthSeriesFor = (yr, mo) => {
    const s = new Date(yr, mo, 1), e = new Date(yr, mo + 1, 0, 23, 59, 59);
    const txs = inRange(s, e);
    const inc = txs.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
    const exp = -txs.filter((t) => t.amount < 0).reduce((a, t) => a + t.amount, 0);
    return { inc, exp, net: inc - exp };
  };
  const thisMo = monthSeriesFor(today.getFullYear(), today.getMonth());
  const lastMo = monthSeriesFor(today.getFullYear(), today.getMonth() - 1);
  const yearAgoMo = monthSeriesFor(today.getFullYear() - 1, today.getMonth());
  const growthRows = [
    { label: "Gelir", now: thisMo.inc, mom: lastMo.inc, yoy: yearAgoMo.inc, goodUp: true },
    { label: "Gider", now: thisMo.exp, mom: lastMo.exp, yoy: yearAgoMo.exp, goodUp: false },
    { label: "Faaliyet farkı", now: thisMo.net, mom: lastMo.net, yoy: yearAgoMo.net, goodUp: true },
  ];

  // ── Çeyreklik faaliyet tablosu ──
  const [pfYear, setPfYear] = [scenario._qy ?? today.getFullYear(), (y) => setScenario((s) => ({ ...s, _qy: y }))];
  const qYear = scenario._qy ?? today.getFullYear();
  const quarters = [0, 1, 2, 3].map((qi) => {
    const months = [qi * 3, qi * 3 + 1, qi * 3 + 2].map((mo) => monthSeriesFor(qYear, mo));
    const inc = months.reduce((s, m) => s + m.inc, 0);
    const exp = months.reduce((s, m) => s + m.exp, 0);
    const net = inc - exp;
    const margin = inc ? net / inc * 100 : 0;
    // bu çeyrekte gerçekleşen veri var mı? (gelecekteki çeyrekler boş)
    const hasData = inc > 0 || exp > 0;
    return { qi, label: `Ç${qi + 1}`, inc, exp, net, margin, hasData };
  });
  const qActive = quarters.filter((q) => q.hasData);
  const qYearInc = quarters.reduce((s, q) => s + q.inc, 0);
  const qYearExp = quarters.reduce((s, q) => s + q.exp, 0);
  const qYearNet = qYearInc - qYearExp;
  const qYearMargin = qYearInc ? qYearNet / qYearInc * 100 : 0;
  const qMaxAbs = Math.max(...quarters.map((q) => Math.max(q.inc, q.exp)), 1);
  // prev-year quarters for YoY (only Ç-by-Ç)
  const prevQuarters = [0, 1, 2, 3].map((qi) => {
    const months = [qi * 3, qi * 3 + 1, qi * 3 + 2].map((mo) => monthSeriesFor(qYear - 1, mo));
    return { inc: months.reduce((s, m) => s + m.inc, 0), exp: months.reduce((s, m) => s + m.exp, 0) };
  });

  // ── Senaryo simülasyonu ──
  const baseIncome = monthlyIncome;
  const baseExpense = monthlyBurn;
  const scIncome = baseIncome * (1 + scenario.income / 100);
  const scExpense = baseExpense * (1 + scenario.expense / 100);
  const scNet = scIncome - scExpense - scenario.extraSaving;
  const scSavingRate = scIncome ? (scIncome - scExpense) / scIncome * 100 : 0;
  const scRunway = scExpense ? liquid / scExpense : 0;
  const base12Saving = (baseIncome - baseExpense) * 12;
  const sc12Saving = (scIncome - scExpense) * 12;

  // ── Net değer trendi (snapshot'lardan) ──
  const snaps = (ctx.snapshots || []).slice().sort((a, b) => a.ym.localeCompare(b.ym));
  const nwNow = snaps.length ? snaps[snaps.length - 1].netWorth : (totalAssets - totalLiab);
  const nwPrev = snaps.length > 1 ? snaps[snaps.length - 2].netWorth : null;
  const nwYearAgo = snaps.length >= 13 ? snaps[snaps.length - 13].netWorth : (snaps.length ? snaps[0].netWorth : null);
  const nwMoM = nwPrev !== null && nwPrev !== 0 ? (nwNow - nwPrev) / Math.abs(nwPrev) * 100 : null;
  const nwMoMabs = nwPrev !== null ? nwNow - nwPrev : null;
  const nwYoYabs = nwYearAgo !== null ? nwNow - nwYearAgo : null;
  const snapMonthLabel = (ym) => { const [y, mo] = ym.split("-").map(Number); return CFO_MONTHS[mo - 1].slice(0, 3); };

  // ── Net Değer Köprüsü (waterfall) — seçili dönem ──
  const ymKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const startYm = ymKey(R.start);
  const priorSnaps = snaps.filter((s) => s.ym < startYm);
  const bridgeStart = priorSnaps.length ? priorSnaps[priorSnaps.length - 1].netWorth : (nwNow - (totalRev - totalExp));
  const bridgeEnd = nwNow;
  const bridgeDelta = bridgeEnd - bridgeStart;
  const operatingFlow = totalRev - totalExp;          // gelir − gider
  const bridgeResidual = bridgeDelta - operatingFlow; // piyasa değişimi + faiz + diğer (plug)
  // Dönemde ödenen borç anaparası (net değer nötr — bilgi amaçlı)
  const principalPaid = cur.filter((t) => isDebtPayment && isDebtPayment(t)).reduce((s, t) => s + Math.abs(t.amount), 0);

  const bridgeSteps = [];
  let run = bridgeStart;
  bridgeSteps.push({ label: "Başlangıç", sub: priorSnaps.length ? snapMonthLabel(priorSnaps[priorSnaps.length - 1].ym) : "tahmini", from: 0, to: bridgeStart, kind: "base", value: bridgeStart });
  bridgeSteps.push({ label: "Gelir", sub: "+ kazanç", from: run, to: run + totalRev, kind: "pos", value: totalRev }); run += totalRev;
  bridgeSteps.push({ label: "Gider", sub: "− harcama", from: run, to: run - totalExp, kind: "neg", value: -totalExp }); run -= totalExp;
  bridgeSteps.push({ label: "Piyasa & diğer", sub: bridgeResidual >= 0 ? "+ değer artışı" : "− faiz/değer", from: run, to: run + bridgeResidual, kind: bridgeResidual >= 0 ? "pos" : "neg", value: bridgeResidual }); run += bridgeResidual;
  bridgeSteps.push({ label: "Güncel", sub: R.label, from: 0, to: bridgeEnd, kind: "end", value: bridgeEnd });

  const bridgeVals = bridgeSteps.flatMap((s) => [s.from, s.to]);
  const bAxisMin = Math.min(0, ...bridgeVals);
  const bAxisMax = Math.max(0, ...bridgeVals);
  const bRange = (bAxisMax - bAxisMin) || 1;
  const bPlotH = 200;
  const yPos = (v) => (bAxisMax - v) / bRange * bPlotH;
  const zeroY = yPos(0);

  // ── Reel (enflasyona göre) net değer ──
  const [inflation, setInflation] = useStateC(() => {
    const saved = parseFloat(localStorage.getItem("kese_inflation"));
    return isNaN(saved) ? 40 : saved;
  });
  const setInflationP = (v) => { setInflation(v); try { localStorage.setItem("kese_inflation", String(v)); } catch (e) {} };
  const mFactor = Math.pow(1 + inflation / 100, 1 / 12);
  const realFirst = snaps.length ? snaps[0] : null;
  const realMonths = snaps.length ? snaps.length - 1 : 0;
  const inflationFactor = Math.pow(mFactor, realMonths); // başlangıçtan bugüne fiyat artışı
  const nominalFirst = realFirst ? realFirst.netWorth : nwNow;
  const startInflated = nominalFirst * inflationFactor;   // başlangıç servetinin bugünkü "korunması gereken" değeri
  const nominalChange = nwNow - nominalFirst;
  const inflationErosion = startInflated - nominalFirst;  // sırf enflasyonun aşındırdığı
  const realChange = nwNow - startInflated;               // gerçek (reel) kazanç/kayıp
  // Reel seri: her snapshot'ı bugünkü liraya çevir (nominal × fiyat_şimdi/fiyat_o_an)
  const realSeries = snaps.map((s, i) => {
    const monthsFromNow = (snaps.length - 1) - i;
    return s.netWorth * Math.pow(mFactor, monthsFromNow);
  });


  const Row = ({ label, color, cur, prev, indent, bold, accent, goodUp = true, noPrev }) => (
    <div className={`cfo-row ${bold ? "cfo-row-bold" : ""} ${accent ? "cfo-row-accent" : ""}`}>
      <div className="cfo-row-l" style={{ paddingLeft: indent ? 18 : 0 }}>
        {color && <span className="cfo-dot" style={{ background: color }} />}
        {label}
      </div>
      <div className="cfo-row-prev mono">{noPrev ? "" : `₺${fmt(prev)}`}</div>
      <div className="cfo-row-cur mono">₺{fmt(cur)}</div>
      <div className="cfo-row-d">{noPrev ? "" : <DeltaTag a={cur} b={prev} goodUp={goodUp} />}</div>
    </div>
  );

  return (
    <div className={embedded ? "view-cfo view-cfo-embedded" : "view view-cfo"}>
      <div className="page-head" style={embedded ? { paddingTop: 0 } : undefined}>
        <div>
          {!embedded && <h1 className="page-title">Mali Tablolar</h1>}
          <p className="page-sub">{embedded ? "Şahsi A.Ş. resmî mali tabloları" : "Şahsi A.Ş."} · {R.label} · şirket bakışıyla tam görünürlük</p>
        </div>
        <div className="page-actions">
          <div className="seg">
            <button className={period === "month" ? "seg-act" : ""} onClick={() => setPeriod("month")}>Ay</button>
            <button className={period === "quarter" ? "seg-act" : ""} onClick={() => setPeriod("quarter")}>Çeyrek</button>
            <button className={period === "year" ? "seg-act" : ""} onClick={() => setPeriod("year")}>Yıl</button>
            <button className={period === "ttm" ? "seg-act" : ""} onClick={() => setPeriod("ttm")}>12 Ay</button>
          </div>
          <button className="btn btn-ghost btn-md" onClick={() => window.print()}><Icon name="download" size={16} />PDF</button>
        </div>
      </div>

      {/* Finansal oranlar — CFO KPI şeridi */}
      <div className="cfo-ratios">
        {ratios.map((r) => (
          <div key={r.label} className="cfo-ratio">
            <div className="cfo-ratio-h">
              <span className="cfo-ratio-icon"><Icon name={r.icon} size={14} /></span>
              <span className="cfo-ratio-l">{r.label}</span>
            </div>
            <div className={`cfo-ratio-v ${r.good === true ? "pos" : r.good === false ? "neg" : ""}`}>{showBalances ? r.value : "••"}</div>
            {r.bar !== null && (
              <div className="cfo-ratio-bar"><div style={{ width: `${r.bar}%`, background: r.good === true ? "var(--pos)" : r.good === false ? "var(--neg)" : "var(--accent)" }} /></div>
            )}
            <div className="cfo-ratio-hint">{r.hint}</div>
          </div>
        ))}
      </div>

      {/* Net Değer Trendi */}
      <Card
        title="Net Değer Trendi"
        subtitle="Her ay otomatik anlık görüntü · varlık − yükümlülük"
        action={<button className="btn btn-ghost btn-sm" onClick={ctx.takeSnapshot}><Icon name="camera" size={14} />Anlık görüntü al</button>}
      >
        {snaps.length === 0 ? (
          <div className="cfo-empty" style={{ padding: "20px 0" }}>Henüz anlık görüntü yok — veriler eklendikçe her ay otomatik kaydedilir.</div>
        ) : (
          <>
            <div className="nw-top">
              <div className="nw-now">
                <div className="nw-now-l">Güncel net değer</div>
                <div className={`nw-now-v ${nwNow >= 0 ? "" : "neg"}`}>{nwNow < 0 ? "−" : ""}<Money value={Math.abs(nwNow)} sign="neutral" hide={!showBalances} /></div>
                <div className="nw-now-deltas">
                  {nwMoMabs !== null && (
                    <span className={`nw-chip ${nwMoMabs >= 0 ? "pos" : "neg"}`}>
                      <Icon name={nwMoMabs >= 0 ? "arrowUp" : "arrowDown"} size={11} />
                      {nwMoMabs >= 0 ? "+" : "−"}₺{fmtS(Math.abs(nwMoMabs))} bu ay
                    </span>
                  )}
                  {nwYoYabs !== null && (
                    <span className="nw-sub">{nwYoYabs >= 0 ? "+" : "−"}₺{fmtS(Math.abs(nwYoYabs))} ({snaps.length >= 13 ? "12 ay" : "tüm dönem"})</span>
                  )}
                </div>
              </div>
              <div className="nw-stats">
                <div className="nw-stat">
                  <div className="nw-stat-l"><span className="cfo-dot" style={{ background: "var(--pos)" }} />Varlıklar</div>
                  <div className="nw-stat-v mono">₺{fmt(snaps[snaps.length - 1].assets)}</div>
                </div>
                <div className="nw-stat">
                  <div className="nw-stat-l"><span className="cfo-dot" style={{ background: "var(--neg)" }} />Yükümlülükler</div>
                  <div className="nw-stat-v mono">₺{fmt(snaps[snaps.length - 1].liabilities)}</div>
                </div>
                <div className="nw-stat">
                  <div className="nw-stat-l">Anlık görüntü</div>
                  <div className="nw-stat-v mono">{snaps.length} ay</div>
                </div>
              </div>
            </div>
            <AreaChart
              series={[{
                labels: snaps.map((s) => snapMonthLabel(s.ym)),
                values: snaps.map((s) => s.netWorth),
                color: "var(--accent)",
                name: "Net değer",
              }]}
              height={240}
              formatY={(v) => "₺" + fmtS(v)}
            />
            <div className="nw-table-wrap">
              <table className="nw-table">
                <thead>
                  <tr><th>Ay</th><th>Varlık</th><th>Yükümlülük</th><th>Net değer</th><th>Δ</th></tr>
                </thead>
                <tbody>
                  {snaps.slice().reverse().slice(0, 6).map((s, i, arr) => {
                    const idx = snaps.length - 1 - i;
                    const prev = idx > 0 ? snaps[idx - 1].netWorth : null;
                    const dAbs = prev !== null ? s.netWorth - prev : null;
                    const [yy, mm] = s.ym.split("-");
                    return (
                      <tr key={s.ym}>
                        <td className="msum-mon">{CFO_MONTHS[+mm - 1].slice(0, 3)} {yy.slice(2)}</td>
                        <td className="mono pos">₺{fmtS(s.assets)}</td>
                        <td className="mono neg">₺{fmtS(s.liabilities)}</td>
                        <td className={`mono ${s.netWorth >= 0 ? "" : "neg"}`}>{s.netWorth < 0 ? "−" : ""}₺{fmtS(Math.abs(s.netWorth))}</td>
                        <td>{dAbs === null ? <span className="cfo-delta-flat">—</span> : <span className={`cfo-delta ${dAbs >= 0 ? "pos" : "neg"}`}>{dAbs >= 0 ? "▲" : "▼"} ₺{fmtS(Math.abs(dAbs))}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* Net Değer Köprüsü (waterfall) */}
      {snaps.length > 0 && (
        <Card title="Net Değer Köprüsü" subtitle={`${R.label} · net değerin neden değişti?`}>
          <div className="nwb-head">
            <div className="nwb-endpoint">
              <span className="nwb-endpoint-l">Başlangıç</span>
              <span className={`nwb-endpoint-v mono ${bridgeStart < 0 ? "neg" : ""}`}>{bridgeStart < 0 ? "−" : ""}₺{fmtS(Math.abs(bridgeStart))}</span>
            </div>
            <div className="nwb-arrow">
              <span className={`nwb-delta ${bridgeDelta >= 0 ? "pos" : "neg"}`}>{bridgeDelta >= 0 ? "▲ +" : "▼ −"}₺{fmtS(Math.abs(bridgeDelta))}</span>
              <Icon name="arrowRight" size={16} />
            </div>
            <div className="nwb-endpoint nwb-endpoint-end">
              <span className="nwb-endpoint-l">Güncel</span>
              <span className={`nwb-endpoint-v mono ${bridgeEnd < 0 ? "neg" : ""}`}>{bridgeEnd < 0 ? "−" : ""}₺{fmtS(Math.abs(bridgeEnd))}</span>
            </div>
          </div>

          <div className="nwb-chart" style={{ height: bPlotH + 44 }}>
            <div className="nwb-zero" style={{ top: zeroY }} />
            {bridgeSteps.map((s, i) => {
              const top = Math.min(yPos(s.from), yPos(s.to));
              const h = Math.max(3, Math.abs(yPos(s.from) - yPos(s.to)));
              return (
                <div key={i} className="nwb-col">
                  <div className="nwb-bar-wrap" style={{ height: bPlotH }}>
                    {i > 0 && i < bridgeSteps.length && (
                      <div className="nwb-connector" style={{ top: yPos(bridgeSteps[i - 1].to) }} />
                    )}
                    <div className={`nwb-bar nwb-${s.kind}`} style={{ top, height: h }}>
                      <span className="nwb-bar-val">{s.value < 0 ? "−" : (s.kind === "base" || s.kind === "end" ? "" : "+")}₺{fmtS(Math.abs(s.value))}</span>
                    </div>
                  </div>
                  <div className="nwb-label">{s.label}<span className="nwb-sub">{s.sub}</span></div>
                </div>
              );
            })}
          </div>

          <div className="nwb-note">
            <Icon name="info" size={13} />
            <span>Borç <strong>anaparası</strong> ödemek net değeri değiştirmez (nakit↓ = borç↓){principalPaid > 0 ? ` — bu dönem ₺${fmtS(principalPaid)} anapara ödendi` : ""}. "Piyasa & diğer" yatırım değer değişimi, faiz ve kayıt dışı hareketleri içerir.</span>
          </div>
        </Card>
      )}

      {/* Reel (enflasyona göre) Net Değer */}
      {snaps.length >= 1 && (
        <Card
          title="Reel Net Değer"
          subtitle="Nominal servet vs enflasyona göre düzeltilmiş alım gücü"
          action={snaps.length > 1 ? (
            <label className="rnw-rate">
              <span>Yıllık TÜFE</span>
              <div className="rnw-rate-input">
                <input type="number" min="0" max="200" step="0.1" value={inflation} onChange={(e) => setInflationP(Math.max(0, +e.target.value || 0))} />
                <span>%</span>
              </div>
            </label>
          ) : null}
        >
          {snaps.length < 2 ? (
            <div className="rnw-empty">
              <div className="rnw-empty-ic"><Icon name="trendingUp" size={22} /></div>
              <div className="rnw-empty-t">Reel analiz için daha fazla geçmiş gerekiyor</div>
              <p className="rnw-empty-d">Şu an {snaps.length} aylık net değer kaydın var. İkinci ay biriktiğinde, servetinin enflasyonu yenip yenmediğini (nominal vs reel alım gücü) burada göreceksin. Her ay otomatik anlık görüntü alınıyor.</p>
            </div>
          ) : (
          <>
          <div className="rnw-cards">
            <div className="rnw-card">
              <div className="rnw-card-l">Nominal değişim</div>
              <div className={`rnw-card-v mono ${nominalChange >= 0 ? "pos" : "neg"}`}>{nominalChange >= 0 ? "+" : "−"}₺{fmtS(Math.abs(nominalChange))}</div>
              <div className="rnw-card-h">Rakamsal artış (başlangıçtan beri)</div>
            </div>
            <div className="rnw-card">
              <div className="rnw-card-l">Enflasyon aşındırması</div>
              <div className="rnw-card-v mono neg">−₺{fmtS(Math.abs(inflationErosion))}</div>
              <div className="rnw-card-h">Alım gücünü korumak için gereken</div>
            </div>
            <div className={`rnw-card rnw-card-accent ${realChange >= 0 ? "rnw-pos" : "rnw-neg"}`}>
              <div className="rnw-card-l">Reel değişim</div>
              <div className={`rnw-card-v mono ${realChange >= 0 ? "pos" : "neg"}`}>{realChange >= 0 ? "+" : "−"}₺{fmtS(Math.abs(realChange))}</div>
              <div className="rnw-card-h">Gerçek alım gücü kazancı/kaybı</div>
            </div>
          </div>

          <AreaChart
            series={[
              { labels: snaps.map((s) => snapMonthLabel(s.ym)), values: snaps.map((s) => s.netWorth), color: "var(--accent)", name: "Nominal" },
              { labels: snaps.map((s) => snapMonthLabel(s.ym)), values: realSeries, color: "var(--warn)", name: "Reel (bugünkü ₺)" },
            ]}
            height={220}
            formatY={(v) => "₺" + fmtS(v)}
          />
          <div className="rnw-legend">
            <span><span className="rnw-dot" style={{ background: "var(--accent)" }} />Nominal net değer</span>
            <span><span className="rnw-dot" style={{ background: "var(--warn)" }} />Reel (bugünkü alım gücü)</span>
            <span className="rnw-src">Oranı sen giriyorsun · resmi TÜFE: TÜİK</span>
          </div>
          <div className="nwb-note">
            <Icon name="info" size={13} />
            <span>Tüm değerler <strong>bugünün lirası</strong> ile ifade edilir (baz dönem = bugün); geçmiş tutarlar enflasyonla bugüne taşınır. {realChange >= 0
              ? `Net değerin enflasyonu yendi — alım gücün reel olarak ₺${fmtS(realChange)} arttı.`
              : `Nominal olarak ₺${fmtS(nominalChange)} artmış görünse de, %${inflation} enflasyonla alım gücün reel olarak ₺${fmtS(Math.abs(realChange))} ${realChange < 0 ? "azaldı" : "değişti"}.`}</span>
          </div>
          </>
          )}
        </Card>
      )}

      {/* Gelir Tablosu */}
      <Card title="Gelir Tablosu" subtitle={`${R.label} · önceki dönem karşılaştırmalı`} padded={false}>
        <div className="cfo-statement">
          <div className="cfo-head">
            <div>Kalem</div>
            <div className="cfo-row-prev">{R.prevLabel}</div>
            <div className="cfo-row-cur">{R.label}</div>
            <div className="cfo-row-d">Δ</div>
          </div>
          <div className="cfo-section-t">Gelirler</div>
          {incRows.length === 0 && <div className="cfo-empty">Bu dönemde gelir kaydı yok</div>}
          {incRows.map((r) => <Row key={r.cat.label} label={r.cat.label} color={r.cat.color} cur={r.cur} prev={r.prev} indent />)}
          <Row label="Toplam Gelir" cur={totalRev} prev={prevRev} bold />

          <div className="cfo-section-t">İşletme Giderleri</div>
          {expRows.length === 0 && <div className="cfo-empty">Bu dönemde gider kaydı yok</div>}
          {expRows.map((r) => <Row key={r.cat.label} label={r.cat.label} color={r.cat.color} cur={r.cur} prev={r.prev} indent goodUp={false} />)}
          <Row label="Toplam Gider" cur={totalExp} prev={prevExpT} bold goodUp={false} />

          <div className={`cfo-result ${opResult >= 0 ? "pos" : "neg"}`}>
            <div className="cfo-result-l">Faaliyet Sonucu (Net)</div>
            <div className="cfo-result-prev mono">₺{fmt(prevOpResult)}</div>
            <div className="cfo-result-cur mono">{opResult < 0 ? "−" : ""}₺{fmt(Math.abs(opResult))}</div>
            <div className="cfo-row-d"><DeltaTag a={opResult} b={prevOpResult} /></div>
          </div>
          <div className="cfo-margin">
            <span>Net marj</span>
            <div className="cfo-margin-bar"><div style={{ width: `${Math.max(0, Math.min(100, margin))}%`, background: margin >= 0 ? "var(--pos)" : "var(--neg)" }} /></div>
            <strong className={margin >= 0 ? "pos" : "neg"}>%{margin.toFixed(1)}</strong>
            <span className="cfo-margin-prev">(önceki %{prevMargin.toFixed(1)})</span>
          </div>
        </div>
      </Card>

      <div className="grid-2col cfo-grid">
        {/* Bilanço */}
        <Card title="Bilanço" subtitle="Bugünkü durum · varlık, yükümlülük, özkaynak" padded={false} action={<InfoDot text="Özkaynak (Net Değer) = Varlık − Yükümlülük. Nakit avans çekince varlığın da yükümlülüğün de artar; yükümlülük komisyon kadar fazla arttığı için net değerin yalnızca komisyon kadar düşer. Avans seni zenginleştirmez — likidite sağlar, servet değil." />}>
          <div className="cfo-statement">
            <div className="cfo-section-t">Varlıklar</div>
            {cashAccounts.length === 0 && <div className="cfo-empty">Likit hesap yok</div>}
            {cashAccounts.map((a) => (
              <div key={a.id} className="cfo-row">
                <div className="cfo-row-l" style={{ paddingLeft: 18 }}><span className="cfo-dot" style={{ background: a.color }} />{a.name}</div>
                <div className="cfo-row-cur cfo-row-cur-wide mono">₺{fmt(Math.max(0, a.balance))}</div>
              </div>
            ))}
            <Row label="Toplam Varlık" cur={totalAssets} bold noPrev />

            <div className="cfo-section-t">Yükümlülükler</div>
            {totalLiab === 0 && <div className="cfo-empty">Borç yok 🎉</div>}
            {cardLiab > 0 && (
              <div className="cfo-row"><div className="cfo-row-l" style={{ paddingLeft: 18 }}><span className="cfo-dot" style={{ background: "var(--neg)" }} />Kredi kartı borçları</div><div className="cfo-row-cur cfo-row-cur-wide mono">₺{fmt(cardLiab)}</div></div>
            )}
            {debts.map((d) => (
              <div key={d.id} className="cfo-row"><div className="cfo-row-l" style={{ paddingLeft: 18 }}><span className="cfo-dot" style={{ background: d.color }} />{d.name}</div><div className="cfo-row-cur cfo-row-cur-wide mono">₺{fmt(d.remaining)}</div></div>
            ))}
            <Row label="Toplam Yükümlülük" cur={totalLiab} bold noPrev />

            <div className={`cfo-result ${equity >= 0 ? "pos" : "neg"}`}>
              <div className="cfo-result-l">Özkaynak (Net Değer)</div>
              <div className="cfo-result-cur cfo-result-cur-wide mono">{equity < 0 ? "−" : ""}₺{fmt(Math.abs(equity))}</div>
            </div>
            <div className="cfo-bsbar">
              <div className="cfo-bsbar-track">
                <div className="cfo-bsbar-fill" style={{ width: `${totalAssets / assetBase * 100}%`, background: "var(--pos)" }} title="Varlıklar" />
              </div>
              <div className="cfo-bsbar-track">
                <div className="cfo-bsbar-fill" style={{ width: `${totalLiab / assetBase * 100}%`, background: "var(--neg)" }} title="Yükümlülükler" />
              </div>
              <div className="cfo-bsbar-legend">
                <span><span className="cfo-dot" style={{ background: "var(--pos)" }} />Varlık</span>
                <span><span className="cfo-dot" style={{ background: "var(--neg)" }} />Yükümlülük</span>
                <span className="cfo-bsbar-ratio">Borç/Varlık: %{totalAssets ? (totalLiab / totalAssets * 100).toFixed(0) : 0}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Nakit Akış */}
        <Card title="Nakit Akış Tablosu" subtitle={`${R.label} · faaliyet, yatırım, finansman`} padded={false}>
          <div className="cfo-statement">
            <div className="cfo-cf-row">
              <div className="cfo-cf-icon" style={{ background: "rgba(34,197,94,0.12)", color: "var(--pos)" }}><Icon name="flow" size={16} /></div>
              <div className="cfo-cf-b">
                <div className="cfo-cf-t">Faaliyetlerden nakit akışı</div>
                <div className="cfo-cf-d">Maaş ve nakit/banka harcamaları</div>
              </div>
              <div className={`cfo-cf-v mono ${opCash >= 0 ? "pos" : "neg"}`}>{opCash < 0 ? "−" : "+"}₺{fmt(Math.abs(opCash))}</div>
            </div>
            <div className="cfo-cf-row">
              <div className="cfo-cf-icon" style={{ background: "rgba(14,165,233,0.12)", color: "#0ea5e9" }}><Icon name="chart" size={16} /></div>
              <div className="cfo-cf-b">
                <div className="cfo-cf-t">Yatırımlardan nakit akışı</div>
                <div className="cfo-cf-d">Yatırım getirileri ve giderleri</div>
              </div>
              <div className={`cfo-cf-v mono ${invCash >= 0 ? "pos" : "neg"}`}>{invCash < 0 ? "−" : "+"}₺{fmt(Math.abs(invCash))}</div>
            </div>
            <div className="cfo-cf-row">
              <div className="cfo-cf-icon" style={{ background: "rgba(168,85,247,0.12)", color: "#a855f7" }}><Icon name="debt" size={16} /></div>
              <div className="cfo-cf-b">
                <div className="cfo-cf-t">Finansmandan nakit akışı</div>
                <div className="cfo-cf-d">Kredi kartı ve kredi ödemeleri</div>
              </div>
              <div className={`cfo-cf-v mono ${finCash >= 0 ? "pos" : "neg"}`}>{finCash < 0 ? "−" : "+"}₺{fmt(Math.abs(finCash))}</div>
            </div>
            <div className={`cfo-result ${netCash >= 0 ? "pos" : "neg"}`}>
              <div className="cfo-result-l">Net Nakit Değişimi</div>
              <div className="cfo-result-cur cfo-result-cur-wide mono">{netCash < 0 ? "−" : "+"}₺{fmt(Math.abs(netCash))}</div>
            </div>
            <div className="cfo-cf-note">
              <Icon name="info" size={13} />
              <span>Yalnızca nakit (vadesiz) hesap hareketleri sayılır. <strong>Kredi kartı harcaman nakit çıkışı değildir</strong> — borç artışıdır ve Gelir Tablosu'nda gider olarak görünür; karta ödeme yaptığında burada "finansman" çıkışı olur.</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Bütçe vs Gerçekleşen — variance */}
      <Card title="Bütçe vs Gerçekleşen" subtitle={`${CFO_MONTHS[today.getMonth()]} ${today.getFullYear()} · sapma analizi`} padded={false}>
        {varianceRows.length === 0 ? (
          <div className="cfo-empty" style={{ padding: "20px" }}>Bütçe tanımlı değil — Bütçe sekmesinden kategori ekleyebilirsin.</div>
        ) : (
          <table className="var-table">
            <thead>
              <tr><th>Kategori</th><th>Bütçe</th><th>Gerçekleşen</th><th>Sapma</th><th>Kullanım</th></tr>
            </thead>
            <tbody>
              {varianceRows.map((r) => {
                const usage = r.budget ? r.actual / r.budget * 100 : 0;
                const over = r.variance < 0;
                return (
                  <tr key={r.cat.label}>
                    <td><div className="var-cat"><span className="cfo-dot" style={{ background: r.cat.color }} />{r.cat.label}</div></td>
                    <td className="mono">₺{fmt(r.budget)}</td>
                    <td className="mono">₺{fmt(r.actual)}</td>
                    <td className={`mono ${over ? "neg" : "pos"}`}>{over ? "−" : "+"}₺{fmt(Math.abs(r.variance))}</td>
                    <td>
                      <div className="var-usage">
                        <div className="var-usage-bar"><div style={{ width: `${Math.min(100, usage)}%`, background: over ? "var(--neg)" : usage > 85 ? "var(--warn)" : "var(--pos)" }} /></div>
                        <span className="mono">%{usage.toFixed(0)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Toplam</td>
                <td className="mono">₺{fmt(totalBudget)}</td>
                <td className="mono">₺{fmt(totalActual)}</td>
                <td className={`mono ${totalVariance < 0 ? "neg" : "pos"}`}>{totalVariance < 0 ? "−" : "+"}₺{fmt(Math.abs(totalVariance))}</td>
                <td><span className="mono">%{totalBudget ? (totalActual / totalBudget * 100).toFixed(0) : 0}</span></td>
              </tr>
            </tfoot>
          </table>
        )}
      </Card>

      {/* Çeyreklik Faaliyet Tablosu */}
      <Card
        title="Çeyreklik faaliyet tablosu"
        subtitle={`${qYear} · Ç1–Ç4 yan yana, çeyreklik trend`}
        padded={false}
        action={
          <div className="qtr-year-nav">
            <InfoDot text="Faaliyet farkı = Gelir − Gider. Nakit olarak biriktiği anlamına gelmez; çoğu zaman borç/kart ödemesine gidip net değerini artırır. Kasada kalan nakit için Raporlar'daki 'Net nakit akışı'na bak." />
            <button className="qtr-yr-btn" onClick={() => setPfYear(qYear - 1)} title="Önceki yıl"><Icon name="chevronLeft" size={15} /></button>
            <span className="qtr-yr-label mono">{qYear}</span>
            <button className="qtr-yr-btn" onClick={() => setPfYear(qYear + 1)} disabled={qYear >= today.getFullYear()} title="Sonraki yıl"><Icon name="chevronRight" size={15} /></button>
          </div>
        }
      >
        {qActive.length === 0 ? (
          <div className="cfo-empty" style={{ padding: "24px 20px" }}>{qYear} yılına ait işlem verisi yok.</div>
        ) : (
          <>
            {/* Çubuk grafik — çeyreklik gelir/gider */}
            <div className="qtr-chart">
              {quarters.map((q) => (
                <div key={q.qi} className={`qtr-bar-group ${!q.hasData ? "qtr-bar-empty" : ""}`}>
                  <div className="qtr-bars">
                    <div className="qtr-bar-wrap">
                      <div className="qtr-bar qtr-bar-inc" style={{ height: `${q.inc / qMaxAbs * 100}%` }} title={`Gelir ₺${fmt(q.inc)}`} />
                      <div className="qtr-bar qtr-bar-exp" style={{ height: `${q.exp / qMaxAbs * 100}%` }} title={`Gider ₺${fmt(q.exp)}`} />
                    </div>
                  </div>
                  <div className={`qtr-net mono ${q.net >= 0 ? "pos" : "neg"}`}>{q.hasData ? `${q.net < 0 ? "−" : "+"}₺${fmtS(Math.abs(q.net))}` : "—"}</div>
                  <div className="qtr-lbl">{q.label}</div>
                </div>
              ))}
            </div>
            <div className="qtr-legend">
              <span><span className="qtr-dot qtr-dot-inc" />Gelir</span>
              <span><span className="qtr-dot qtr-dot-exp" />Gider</span>
              <span className="qtr-legend-net">Faaliyet farkı alt satırda</span>
            </div>

            {/* Tablo — çeyrekler yan yana */}
            <div className="qtr-table-wrap">
              <table className="qtr-table">
                <thead>
                  <tr>
                    <th>Kalem</th>
                    {quarters.map((q) => <th key={q.qi} className={!q.hasData ? "qtr-th-empty" : ""}>{q.label}</th>)}
                    <th className="qtr-th-year">{qYear}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="qtr-row-l"><span className="cfo-dot" style={{ background: "var(--pos)" }} />Gelir</td>
                    {quarters.map((q) => <td key={q.qi} className="mono">{q.hasData ? `₺${fmtS(q.inc)}` : "—"}</td>)}
                    <td className="mono qtr-td-year">₺{fmtS(qYearInc)}</td>
                  </tr>
                  <tr>
                    <td className="qtr-row-l"><span className="cfo-dot" style={{ background: "var(--neg)" }} />Gider</td>
                    {quarters.map((q) => <td key={q.qi} className="mono">{q.hasData ? `₺${fmtS(q.exp)}` : "—"}</td>)}
                    <td className="mono qtr-td-year">₺{fmtS(qYearExp)}</td>
                  </tr>
                  <tr className="qtr-row-net">
                    <td className="qtr-row-l">Faaliyet farkı</td>
                    {quarters.map((q) => <td key={q.qi} className={`mono ${q.hasData ? (q.net >= 0 ? "pos" : "neg") : ""}`}>{q.hasData ? `${q.net < 0 ? "−" : ""}₺${fmtS(Math.abs(q.net))}` : "—"}</td>)}
                    <td className={`mono qtr-td-year ${qYearNet >= 0 ? "pos" : "neg"}`}>{qYearNet < 0 ? "−" : ""}₺{fmtS(Math.abs(qYearNet))}</td>
                  </tr>
                  <tr>
                    <td className="qtr-row-l">Net marj</td>
                    {quarters.map((q) => <td key={q.qi} className="mono qtr-margin">{q.hasData ? `%${q.margin.toFixed(0)}` : "—"}</td>)}
                    <td className="mono qtr-td-year">%{qYearMargin.toFixed(0)}</td>
                  </tr>
                  <tr>
                    <td className="qtr-row-l qtr-row-sub">Çeyreklik Δ (QoQ)</td>
                    {quarters.map((q, i) => {
                      if (!q.hasData) return <td key={q.qi}>—</td>;
                      const prev = i > 0 ? quarters[i - 1] : null;
                      if (!prev || !prev.hasData) return <td key={q.qi} className="cfo-delta-flat">—</td>;
                      const d = prev.net !== 0 ? (q.net - prev.net) / Math.abs(prev.net) * 100 : null;
                      if (d === null) return <td key={q.qi} className="cfo-delta-flat">—</td>;
                      return <td key={q.qi}><span className={`cfo-delta ${d >= 0 ? "pos" : "neg"}`}>{d >= 0 ? "▲" : "▼"}%{Math.abs(d).toFixed(0)}</span></td>;
                    })}
                    <td className="qtr-td-year">—</td>
                  </tr>
                  <tr>
                    <td className="qtr-row-l qtr-row-sub">Yıllık Δ (YoY)</td>
                    {quarters.map((q, i) => {
                      if (!q.hasData) return <td key={q.qi}>—</td>;
                      const pNet = prevQuarters[i].inc - prevQuarters[i].exp;
                      if (pNet === 0) return <td key={q.qi} className="cfo-delta-flat">—</td>;
                      const d = (q.net - pNet) / Math.abs(pNet) * 100;
                      return <td key={q.qi}><span className={`cfo-delta ${d >= 0 ? "pos" : "neg"}`}>{d >= 0 ? "▲" : "▼"}%{Math.abs(d).toFixed(0)}</span></td>;
                    })}
                    <td className="qtr-td-year">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <div className="cfo-grid">
        {/* Büyüme — MoM / YoY */}
        <Card title="Büyüme analizi" subtitle="Aya göre (MoM) ve yıla göre (YoY) değişim" action={<InfoDot text="Faaliyet farkı = Gelir − Gider. Bu tutar nakit olarak biriktiği anlamına gelmez; çoğu zaman borç/kart ödemesine gider. Borç ödemek net değerini artırır — yani para 'kaybolmaz', servete dönüşür. Kasada nakit kalıp kalmadığını görmek için Raporlar'daki 'Net nakit akışı'na bak." />}>
          <table className="growth-table">
            <thead>
              <tr><th>Kalem</th><th>Bu ay</th><th>Aylık Δ</th><th>Yıllık Δ</th></tr>
            </thead>
            <tbody>
              {growthRows.map((r) => {
                const mom = r.mom ? (r.now - r.mom) / Math.abs(r.mom) * 100 : null;
                const yoy = r.yoy ? (r.now - r.yoy) / Math.abs(r.yoy) * 100 : null;
                const tag = (d, goodUp) => {
                  if (d === null) return <span className="cfo-delta-flat">—</span>;
                  const good = goodUp ? d >= 0 : d <= 0;
                  return <span className={`cfo-delta ${good ? "pos" : "neg"}`}>{d >= 0 ? "▲" : "▼"} %{Math.abs(d).toFixed(0)}</span>;
                };
                return (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td className="mono">₺{fmtS(r.now)}</td>
                    <td>{tag(mom, r.goodUp)}</td>
                    <td>{tag(yoy, r.goodUp)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="growth-note">
            {yearAgoMo.inc > 0
              ? `Geçen yılın aynı ayına göre gelirin %${((thisMo.inc - yearAgoMo.inc) / yearAgoMo.inc * 100).toFixed(0)} değişti.`
              : "Geçen yıla ait karşılaştırma verisi henüz yok."}
          </div>
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { CFOView });
