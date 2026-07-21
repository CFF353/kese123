// Yatırım Portföyü — borsa uygulaması tarzı, tablo ağırlıklı, derin analiz
// Hisse, fon, altın, döviz, kripto · canlı fiyat, K/Z, dağılım, risk, zaman çizelgesi
// ─────────────────────────────────────────────────────────

const { useState: useStateP, useEffect: useEffectP, useMemo: useMemoP } = React;

const HOLDING_TYPES = ["Hisse", "Yabancı Hisse", "Fon", "Altın", "Döviz", "Kripto", "Tahvil/Bono", "Diğer"];
const HOLDING_TYPE_COLORS = {
  "Hisse": "#0ea5e9",
  "Yabancı Hisse": "#64748b",
  "Fon": "#a855f7",
  "Altın": "#f59e0b",
  "Döviz": "#22c55e",
  "Kripto": "#f7931a",
  "Tahvil/Bono": "#14b8a6",
  "Diğer": "#94a3b8",
};

function pfNum(v) { return parseFloat(String(v).replace(/\s/g, "").replace(",", ".")) || 0; }

// ── Kıyaslama yardımcıları: tarih bazlı ileri-taşıma (carry-forward) örnekleme + % değişim normalizasyonu ──
function resampleCarryForward(sortedSeries, dates) {
  let i = 0, lastVal = null;
  return dates.map((d) => {
    while (i < sortedSeries.length && sortedSeries[i].date <= d) { lastVal = sortedSeries[i].close; i++; }
    return lastVal;
  });
}
function pctSeries(values) {
  const base = values.find((v) => v != null);
  return values.map((v) => (v == null || !base) ? null : (v / base - 1) * 100);
}

// ── İşlem (lot) defteri: kademeli ortalama maliyet + gerçekleşmiş K/Z ──
// qty işaretli: pozitif = alış, negatif = satış. Satışlar mevcut ortalama maliyete karşı gerçekleşir.
function computeLedgerState(txsForHolding) {
  const sorted = [...txsForHolding].sort((a, b) =>
    a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date));
  let qty = 0, avgCost = 0, realizedPL = 0;
  for (const t of sorted) {
    if (t.qty > 0) {
      const newQty = qty + t.qty;
      avgCost = newQty > 0 ? (qty * avgCost + t.qty * t.price) / newQty : 0;
      qty = newQty;
    } else if (t.qty < 0) {
      const sellQty = Math.min(-t.qty, qty);
      realizedPL += sellQty * (t.price - avgCost);
      qty -= sellQty;
      if (qty <= 1e-7) { qty = 0; avgCost = 0; }
    }
  }
  return { qty, avgCost, realizedPL };
}

// Her işlemden sonraki kümülatif durumu döner — maliyet bazı grafiği için
function computeLedgerSeries(txsForHolding) {
  const sorted = [...txsForHolding].sort((a, b) =>
    a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date));
  let qty = 0, avgCost = 0, realizedPL = 0;
  const steps = [];
  for (const t of sorted) {
    if (t.qty > 0) {
      const newQty = qty + t.qty;
      avgCost = newQty > 0 ? (qty * avgCost + t.qty * t.price) / newQty : 0;
      qty = newQty;
    } else if (t.qty < 0) {
      const sellQty = Math.min(-t.qty, qty);
      realizedPL += sellQty * (t.price - avgCost);
      qty -= sellQty;
      if (qty <= 1e-7) { qty = 0; avgCost = 0; }
    }
    steps.push({ date: t.date, qty, avgCost, costBasis: qty * avgCost });
  }
  return steps;
}

// FIFO usulü gerçekleşmiş K/Z — Türkiye'de hisse vergilendirmesinde esas alınan yöntem.
// Satışlar en eski lotları tüketir; yıl bazında kırılım döner.
function computeFIFO(txsForHolding) {
  const sorted = [...txsForHolding].sort((a, b) =>
    a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date));
  const lots = []; // { qty, price }
  let realized = 0;
  const byYear = {};
  for (const t of sorted) {
    if (t.qty > 0) {
      lots.push({ qty: t.qty, price: t.price });
    } else if (t.qty < 0) {
      let remain = -t.qty;
      const year = t.date.slice(0, 4);
      while (remain > 1e-9 && lots.length) {
        const lot = lots[0];
        const take = Math.min(lot.qty, remain);
        const gain = take * (t.price - lot.price);
        realized += gain;
        byYear[year] = (byYear[year] || 0) + gain;
        lot.qty -= take;
        remain -= take;
        if (lot.qty <= 1e-9) lots.shift();
      }
    }
  }
  return { realized, byYear };
}

// XIRR — para ağırlıklı yıllık getiri. flows: [{date:"YYYY-MM-DD", amount}] (negatif = yatırılan, pozitif = çekilen/güncel değer)
function computeXIRR(flows) {
  if (flows.length < 2) return null;
  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date));
  const hasNeg = sorted.some((f) => f.amount < 0), hasPos = sorted.some((f) => f.amount > 0);
  if (!hasNeg || !hasPos) return null;
  const t0 = new Date(sorted[0].date);
  const spanDays = (new Date(sorted[sorted.length - 1].date) - t0) / 86400000;
  if (spanDays < 30) return null; // çok kısa aralıkta yıllıklandırma yanıltıcı olur
  const yrs = (f) => (new Date(f.date) - t0) / (365.25 * 86400000);
  const npv = (r) => sorted.reduce((s, f) => s + f.amount / Math.pow(1 + r, yrs(f)), 0);
  let lo = -0.95, hi = 10, flo = npv(lo), fhi = npv(hi);
  if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
  for (let i = 0; i < 90; i++) {
    const mid = (lo + hi) / 2, fm = npv(mid);
    if (flo * fm <= 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return ((lo + hi) / 2) * 100;
}

// holdingTxs'i olmayan (henüz lot defteri kullanılmamış) varlıklarda mevcut quantity/avgCost aynen korunur.
function getEffectiveHolding(h, holdingTxs) {
  const txs = holdingTxs.filter((t) => t.holdingId === h.id);
  if (txs.length === 0) return { quantity: h.quantity, avgCost: h.avgCost, realizedPL: 0, ledgerMode: false };
  const { qty, avgCost, realizedPL } = computeLedgerState(txs);
  return { quantity: qty, avgCost, realizedPL, ledgerMode: true };
}

// ── Canlı fiyat kaynakları ──
const COINGECKO_IDS = {
  BTC: "bitcoin", ETH: "ethereum", BNB: "binancecoin", XRP: "ripple", ADA: "cardano",
  SOL: "solana", DOGE: "dogecoin", DOT: "polkadot", MATIC: "matic-network", LTC: "litecoin",
  AVAX: "avalanche-2", TRX: "tron", SHIB: "shiba-inu", USDT: "tether", USDC: "usd-coin",
};
const CCY_CODES = ["USD", "EUR", "GBP", "CHF", "JPY", "AUD", "CAD"];

function PortfolioView({ ctx }) {
  const { showBalances, holdings, addHolding, updateHolding, removeHolding, pfSnapshots, addPfSnapshot, removePfSnapshot, holdingTxs, addHoldingTx, removeHoldingTx, pfTargets, setPfTargets } = ctx;
  const [editOpen, setEditOpen] = useStateP(null);
  const [ledgerOpen, setLedgerOpen] = useStateP(null);
  const [detailOpen, setDetailOpen] = useStateP(null);
  const [sortCol, setSortCol] = useStateP("value");
  const [sortDir, setSortDir] = useStateP(-1);
  const [groupBy, setGroupBy] = useStateP("type");
  const [histOpen, setHistOpen] = useStateP(false);
  const [inflRate, setInflRate] = useStateP(() => { const v = parseFloat(localStorage.getItem("kese_inflation")); return isNaN(v) ? 40 : v; });
  const [usdTry, setUsdTry] = useStateP(null);
  const [usdTryManual, setUsdTryManual] = useStateP("");
  const [fxLoading, setFxLoading] = useStateP(false);
  const [priceRefreshing, setPriceRefreshing] = useStateP(false);
  const [priceRefreshMsg, setPriceRefreshMsg] = useStateP("");
  const fmt = APP_DATA.fmt, fmtS = APP_DATA.fmtShort;
  const today = appToday();

  const rows = useMemoP(() => holdings.map((h) => {
    const eff = getEffectiveHolding(h, holdingTxs);
    const value = eff.quantity * h.price;
    const cost = eff.quantity * eff.avgCost;
    const pl = value - cost;
    const plPct = cost ? pl / cost * 100 : 0;
    return { ...h, quantity: eff.quantity, avgCost: eff.avgCost, value, cost, pl, plPct, realizedPL: eff.realizedPL, ledgerMode: eff.ledgerMode };
  }), [holdings, holdingTxs]);

  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const totalPL = totalValue - totalCost;
  const totalPLPct = totalCost ? totalPL / totalCost * 100 : 0;

  // Bugünkü değeri otomatik anlık görüntü olarak kaydet (sınıf kırılımıyla — dağılım-zaman grafiğini besler)
  useEffectP(() => {
    if (holdings.length === 0) return;
    const todayKey = localYMD(today);
    const existing = pfSnapshots.find((s) => s.date === todayKey);
    if (!existing || Math.abs(existing.value - totalValue) > 0.5 || (usdTry && existing && existing.usdTry !== usdTry)) {
      const byType = {};
      rows.forEach((r) => { byType[r.type] = Math.round(((byType[r.type] || 0) + r.value) * 100) / 100; });
      addPfSnapshot({ date: todayKey, value: totalValue, manual: false, usdTry: usdTry || (existing && existing.usdTry), byType });
    }
  }, [totalValue, holdings.length, usdTry]);

  // USD/TRY kurunu canlı çekmeyi dene
  useEffectP(() => {
    let alive = true;
    const cacheRaw = localStorage.getItem("kese_usdtry_cache");
    if (cacheRaw) {
      try {
        const c = JSON.parse(cacheRaw);
        if (c.date === localYMD(today)) { setUsdTry(c.rate); return; }
      } catch (e) {}
    }
    setFxLoading(true);
    fetch("https://open.er-api.com/v6/latest/USD")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const rate = d && d.rates && d.rates.TRY;
        if (rate) { setUsdTry(rate); localStorage.setItem("kese_usdtry_cache", JSON.stringify({ date: localYMD(today), rate })); }
      })
      .catch(() => {})
      .finally(() => { if (alive) setFxLoading(false); });
    return () => { alive = false; };
  }, []);

  const effectiveUsdTry = usdTry || pfNum(usdTryManual) || null;

  // ── Kıyaslama: BIST100 (XU100) ve Altın (XAU/USD) geçmiş verisi — Twelve Data, günde bir kez önbelleklenir ──
  const [benchData, setBenchData] = useStateP(null); // { asOf, xu100:[{date,close}], gold:[{date,close}] } | null
  const [benchToggles, setBenchToggles] = useStateP(() => {
    const hasKey = !!(localStorage.getItem("kese_twelvedata_key") || "").trim();
    return { usd: hasKey, xu100: hasKey, gold: hasKey };
  });
  useEffectP(() => {
    let alive = true;
    const tdKey = (localStorage.getItem("kese_twelvedata_key") || "").trim();
    if (!tdKey) { setBenchData(null); return; }
    const todayKey = localYMD(today);
    try {
      const cacheRaw = localStorage.getItem("kese_benchmark_cache");
      if (cacheRaw) {
        const c = JSON.parse(cacheRaw);
        if (c.asOf === todayKey) { setBenchData(c); return; }
      }
    } catch (e) {}
    const toSeries = (d) => Array.isArray(d?.values)
      ? d.values.map((v) => ({ date: v.datetime, close: parseFloat(v.close) })).filter((v) => !isNaN(v.close)).sort((a, b) => a.date.localeCompare(b.date))
      : [];
    Promise.all([
      fetch(`https://api.twelvedata.com/time_series?symbol=XU100&interval=1day&outputsize=95&country=Turkey&apikey=${tdKey}`).then((r) => r.json()).catch(() => null),
      fetch(`https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=1day&outputsize=95&apikey=${tdKey}`).then((r) => r.json()).catch(() => null),
    ]).then(([xr, gr]) => {
      if (!alive) return;
      const data = { asOf: todayKey, xu100: toSeries(xr), gold: toSeries(gr) };
      setBenchData(data);
      try { localStorage.setItem("kese_benchmark_cache", JSON.stringify(data)); } catch (e) {}
    }).catch(() => { if (alive) setBenchData(null); });
    return () => { alive = false; };
  }, []);

  // ── Canlı fiyat güncelleme: kripto (CoinGecko), döviz (open.er-api), altın (gold-api.com), hisse (Twelve Data) ──
  const refreshPrices = async () => {
    if (priceRefreshing) return;
    setPriceRefreshing(true); setPriceRefreshMsg("");
    let updated = 0, skipped = 0;
    let stockKeyMissing = false;
    const stamp = () => appToday().toISOString();
    try {
      // Kripto
      const cryptoHoldings = holdings.filter((h) => h.type === "Kripto" && COINGECKO_IDS[h.name.toUpperCase()]);
      if (cryptoHoldings.length) {
        try {
          const ids = [...new Set(cryptoHoldings.map((h) => COINGECKO_IDS[h.name.toUpperCase()]))].join(",");
          const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=try`);
          const data = await res.json();
          cryptoHoldings.forEach((h) => {
            const id = COINGECKO_IDS[h.name.toUpperCase()];
            const price = data && data[id] && data[id].try;
            if (price) { updateHolding(h.id, { price, lastPriceUpdate: stamp() }); updated++; } else skipped++;
          });
        } catch (e) { skipped += cryptoHoldings.length; }
      }

      // USD/TRY kuru (diğer hesaplar için de lazım)
      let usdTryNow = usdTry;
      if (!usdTryNow) {
        try { const r = await fetch("https://open.er-api.com/v6/latest/USD"); const d = await r.json(); usdTryNow = d && d.rates && d.rates.TRY; } catch (e) {}
      }

      // Döviz
      const fxHoldings = holdings.filter((h) => h.type === "Döviz" && CCY_CODES.includes(h.name.toUpperCase()));
      for (const h of fxHoldings) {
        try {
          const code = h.name.toUpperCase();
          if (code === "USD" && usdTryNow) { updateHolding(h.id, { price: usdTryNow, lastPriceUpdate: stamp() }); updated++; continue; }
          const r = await fetch(`https://open.er-api.com/v6/latest/${code}`);
          const d = await r.json();
          const price = d && d.rates && d.rates.TRY;
          if (price) { updateHolding(h.id, { price, lastPriceUpdate: stamp() }); updated++; } else skipped++;
        } catch (e) { skipped++; }
      }

      // Altın (gram) — gold-api.com, USD/ons üzerinden
      const goldHoldings = holdings.filter((h) => h.type === "Altın");
      if (goldHoldings.length) {
        try {
          const r = await fetch("https://api.gold-api.com/price/XAU");
          const d = await r.json();
          const usdPerOz = d?.price;
          if (usdPerOz && usdTryNow) {
            const gramTry = (usdPerOz / 31.1035) * usdTryNow;
            goldHoldings.forEach((h) => { updateHolding(h.id, { price: gramTry, lastPriceUpdate: stamp() }); updated++; });
          } else skipped += goldHoldings.length;
        } catch (e) { skipped += goldHoldings.length; }
      }

      // Hisse / Yabancı Hisse — Twelve Data (Ayarlar'dan girilen ücretsiz anahtarla)
      const stockHoldings = holdings.filter((h) => h.type === "Hisse" || h.type === "Yabancı Hisse");
      if (stockHoldings.length) {
        const tdKey = (localStorage.getItem("kese_twelvedata_key") || "").trim();
        if (!tdKey) {
          stockKeyMissing = true;
          skipped += stockHoldings.length;
        } else {
          const fetchQuotes = async (list, extraParam) => {
            if (!list.length) return;
            try {
              const symbols = [...new Set(list.map((h) => h.name.toUpperCase().replace(/\.IS$/i, "")))];
              const r = await fetch(`https://api.twelvedata.com/quote?symbol=${symbols.join(",")}&apikey=${tdKey}${extraParam || ""}`);
              const d = await r.json();
              const bySymbol = symbols.length > 1 ? d : { [symbols[0]]: d };
              list.forEach((h) => {
                const sym = h.name.toUpperCase().replace(/\.IS$/i, "");
                const q = bySymbol[sym];
                let price = q && parseFloat(q.close);
                const ccy = q && q.currency;
                if (price && ccy && ccy !== "TRY") {
                  if (ccy === "USD" && usdTryNow) price = price * usdTryNow;
                  else price = null;
                }
                if (price) { updateHolding(h.id, { price, lastPriceUpdate: stamp() }); updated++; } else skipped++;
              });
            } catch (e) { skipped += list.length; }
          };
          // BIST hisseleri "Türkiye" filtresiyle, yabancı hisseler filtresiz (birincil borsasına düşer)
          await fetchQuotes(stockHoldings.filter((h) => h.type === "Hisse"), "&country=Turkey");
          await fetchQuotes(stockHoldings.filter((h) => h.type === "Yabancı Hisse"));
        }
      }

      const manualOnly = holdings.filter((h) => !["Kripto", "Döviz", "Altın", "Hisse", "Yabancı Hisse"].includes(h.type)).length;
      setPriceRefreshMsg(
        updated > 0
          ? `${updated} varlık güncellendi${skipped > 0 ? ` · ${skipped} varlık alınamadı${stockKeyMissing ? " (hisse fiyatı için Ayarlar → \"Hisse senedi fiyat anahtarı\"ndan ücretsiz Twelve Data anahtarı gir)" : ""}` : ""}${manualOnly > 0 ? ` · ${manualOnly} varlık için elle giriş gerekir` : ""}.`
          : stockKeyMissing && stockHoldings.length === holdings.length
          ? `Hisse fiyatları için Ayarlar → "Hisse senedi fiyat anahtarı" bölümünden ücretsiz bir Twelve Data anahtarı girmen gerekiyor (twelvedata.com, saniyeler sürer, günlük 800 istek ücretsiz).`
          : `Fiyat alınamadı — internet bağlantısını kontrol et ya da fiyatları elle güncelle.`
      );
    } catch (e) {
      setPriceRefreshMsg("Fiyatlar alınamadı — internet bağlantısını kontrol et.");
    } finally {
      setPriceRefreshing(false);
    }
  };

  // best / worst
  const sortedByPct = [...rows].sort((a, b) => b.plPct - a.plPct);
  const best = rows.length ? sortedByPct[0] : null;
  const worst = rows.length ? sortedByPct[sortedByPct.length - 1] : null;

  // ── Risk & çeşitlendirme ──
  const RISK_BAND = {
    "Tahvil/Bono": { band: "Düşük", w: 1 }, "Döviz": { band: "Düşük", w: 1 },
    "Altın": { band: "Orta", w: 2 }, "Fon": { band: "Orta", w: 2 }, "Hisse": { band: "Orta", w: 2 },
    "Yabancı Hisse": { band: "Yüksek", w: 3 }, "Kripto": { band: "Yüksek", w: 3 }, "Diğer": { band: "Yüksek", w: 3 },
  };
  const BAND_COLOR = { "Düşük": "#22c55e", "Orta": "#f59e0b", "Yüksek": "#ef4444" };
  const hhi = rows.reduce((s, r) => { const w = totalValue ? r.value / totalValue * 100 : 0; return s + w * w; }, 0);
  const divScore = Math.max(0, Math.min(100, Math.round((1 - hhi / 10000) * 100)));
  const divLabel = hhi < 1500 ? "İyi çeşitlenmiş" : hhi < 2500 ? "Orta yoğunlukta" : "Yoğunlaşmış";
  const divZone = hhi < 1500 ? "ok" : hhi < 2500 ? "warn" : "bad";
  const topPos = rows.length ? [...rows].sort((a, b) => b.value - a.value)[0] : null;
  const topPosPct = topPos && totalValue ? topPos.value / totalValue * 100 : 0;
  const bandTotals = { "Düşük": 0, "Orta": 0, "Yüksek": 0 };
  rows.forEach((r) => { const b = (RISK_BAND[r.type] || { band: "Yüksek" }).band; bandTotals[b] += r.value; });
  const riskBands = ["Düşük", "Orta", "Yüksek"].map((b) => ({ band: b, value: bandTotals[b], pct: totalValue ? bandTotals[b] / totalValue * 100 : 0, color: BAND_COLOR[b] }));
  const riskScore = totalValue ? rows.reduce((s, r) => s + r.value * (RISK_BAND[r.type] || { w: 3 }).w, 0) / totalValue : 0;
  const riskLabel = riskScore < 1.6 ? "Savunmacı" : riskScore < 2.3 ? "Dengeli" : "Agresif";

  // allocation by type
  const byType = {};
  rows.forEach((r) => { byType[r.type] = (byType[r.type] || 0) + r.value; });
  const allocation = Object.entries(byType)
    .map(([type, value]) => ({ type, value, pct: totalValue ? value / totalValue * 100 : 0, color: HOLDING_TYPE_COLORS[type] || "#94a3b8" }))
    .sort((a, b) => b.value - a.value);

  const setSort = (col) => {
    if (sortCol === col) setSortDir((d) => -d);
    else { setSortCol(col); setSortDir(-1); }
  };
  const sortRows = (arr) => {
    const s = [...arr];
    const dir = sortDir;
    s.sort((a, b) => {
      if (sortCol === "name") return dir * a.name.localeCompare(b.name);
      if (sortCol === "qty") return dir * (b.quantity - a.quantity);
      if (sortCol === "avgCost") return dir * (b.avgCost - a.avgCost);
      if (sortCol === "price") return dir * (b.price - a.price);
      if (sortCol === "pl") return dir * (b.pl - a.pl);
      if (sortCol === "plPct") return dir * (b.plPct - a.plPct);
      return dir * (b.value - a.value);
    });
    return s;
  };

  // ── Zaman serisi analizleri ──
  // Sadece son 90 güne ait gerçek anlık görüntüleri kullan — eski/tek seferlik kayıtlar
  // "haftalık/aylık" diye yanlış etiketlenmesin.
  const d90cut = new Date(today); d90cut.setDate(today.getDate() - 90);
  const d90cutKey = localYMD(d90cut);
  const sortedSnaps = [...pfSnapshots].filter((s) => s.date >= d90cutKey).sort((a, b) => a.date.localeCompare(b.date));
  const snapAt = (daysAgo, toleranceDays) => {
    const target = new Date(today); target.setDate(today.getDate() - daysAgo);
    const targetKey = localYMD(target);
    const past = sortedSnaps.filter((s) => s.date <= targetKey);
    if (!past.length) return null;
    const candidate = past[past.length - 1];
    // Bulunan kayıt hedeften çok uzaksa (örn. aylar öncesinden kalma) güvenilmez say
    const gapDays = Math.round((new Date(targetKey) - new Date(candidate.date)) / 86400000);
    if (gapDays > toleranceDays) return null;
    return candidate;
  };
  const weekAgo = snapAt(7, 3);
  const monthAgo = snapAt(30, 10);
  const pctChange = (past) => past && past.value ? (totalValue - past.value) / past.value * 100 : null;
  const weekChangePct = pctChange(weekAgo);
  const monthChangePct = pctChange(monthAgo);
  const weeklyInfl = Math.pow(1 + inflRate / 100, 7 / 365) * 100 - 100;
  const monthlyInfl = Math.pow(1 + inflRate / 100, 30 / 365) * 100 - 100;
  const realWeek = weekChangePct !== null ? weekChangePct - weeklyInfl : null;
  const realMonth = monthChangePct !== null ? monthChangePct - monthlyInfl : null;
  const usdWeekAgoVal = weekAgo && weekAgo.usdTry ? weekAgo.value / weekAgo.usdTry : null;
  const usdMonthAgoVal = monthAgo && monthAgo.usdTry ? monthAgo.value / monthAgo.usdTry : null;
  const usdNow = effectiveUsdTry ? totalValue / effectiveUsdTry : null;
  const usdWeekChangePct = usdNow && usdWeekAgoVal ? (usdNow - usdWeekAgoVal) / usdWeekAgoVal * 100 : null;
  const usdMonthChangePct = usdNow && usdMonthAgoVal ? (usdNow - usdMonthAgoVal) / usdMonthAgoVal * 100 : null;
  const chartSnaps = sortedSnaps.slice(-90);
  const chartLabels = chartSnaps.map((s) => { const d = new Date(s.date); return `${d.getDate()}.${d.getMonth() + 1}`; });

  // ── Kıyaslama serileri: portföy/XU100/Altın/USD-TRY, ilk noktaya göre % değişim, ortak eksende ──
  const chartDates = chartSnaps.map((s) => s.date);
  const usdTryHistory = [...pfSnapshots].filter((s) => s.usdTry).map((s) => ({ date: s.date, close: s.usdTry })).sort((a, b) => a.date.localeCompare(b.date));
  const usdTryAt = (dateKey) => {
    let val = null;
    for (const s of usdTryHistory) { if (s.date <= dateKey) val = s.close; else break; }
    return val || effectiveUsdTry;
  };
  const hasXu100 = !!(benchData && benchData.xu100 && benchData.xu100.length > 0);
  const hasGold = !!(benchData && benchData.gold && benchData.gold.length > 0);
  const portfolioPct = pctSeries(chartSnaps.map((s) => s.value));
  const usdByDate = resampleCarryForward(usdTryHistory, chartDates);
  const usdPct = pctSeries(usdByDate);
  const xu100Pct = hasXu100 ? pctSeries(resampleCarryForward(benchData.xu100, chartDates)) : null;
  const goldTryPoints = hasGold ? benchData.gold.map((g) => ({ date: g.date, close: (g.close / 31.1035) * usdTryAt(g.date) })) : [];
  const goldPct = hasGold ? pctSeries(resampleCarryForward(goldTryPoints, chartDates)) : null;
  const anyBenchOn = benchToggles.usd || (benchToggles.xu100 && hasXu100) || (benchToggles.gold && hasGold);
  const benchmarkSeries = [{ labels: chartLabels, values: portfolioPct, color: "var(--accent)", name: "Portföy" }];
  if (benchToggles.usd) benchmarkSeries.push({ labels: chartLabels, values: usdPct, color: "#0ea5e9", name: "USD/TRY" });
  if (benchToggles.xu100 && hasXu100) benchmarkSeries.push({ labels: chartLabels, values: xu100Pct, color: "#a855f7", name: "XU100" });
  if (benchToggles.gold && hasGold) benchmarkSeries.push({ labels: chartLabels, values: goldPct, color: "#f59e0b", name: "Altın" });

  // ── Lot defteri analitiği: XIRR, gerçekleşmiş K/Z (ortalama + FIFO), aylık katkı/çekim ──
  const ledgerRows = rows.filter((r) => r.ledgerMode);
  const ledgerTxs = holdingTxs.filter((t) => holdings.some((h) => h.id === t.holdingId));
  const ledgerValue = ledgerRows.reduce((s, r) => s + r.value, 0);

  const xirr = useMemoP(() => {
    if (!ledgerRows.length) return null;
    const ledgerIds = new Set(ledgerRows.map((r) => r.id));
    const flows = ledgerTxs.filter((t) => ledgerIds.has(t.holdingId)).map((t) => ({ date: t.date, amount: -(t.qty * t.price) }));
    flows.push({ date: localYMD(today), amount: ledgerValue });
    return computeXIRR(flows);
  }, [holdingTxs, ledgerValue]);

  const totalRealized = ledgerRows.reduce((s, r) => s + r.realizedPL, 0);
  const fifoAll = useMemoP(() => {
    let realized = 0; const byYear = {};
    ledgerRows.forEach((r) => {
      const f = computeFIFO(holdingTxs.filter((t) => t.holdingId === r.id));
      realized += f.realized;
      Object.entries(f.byYear).forEach(([y, v]) => { byYear[y] = (byYear[y] || 0) + v; });
    });
    return { realized, byYear };
  }, [holdingTxs, holdings]);
  const realizedByAsset = ledgerRows.filter((r) => Math.abs(r.realizedPL) > 0.005).sort((a, b) => b.realizedPL - a.realizedPL);

  // Aylık katkı/çekim (son 12 ay)
  const monthlyFlows = useMemoP(() => {
    const map = {};
    ledgerTxs.forEach((t) => {
      const ym = t.date.slice(0, 7);
      if (!map[ym]) map[ym] = { in: 0, out: 0 };
      if (t.qty > 0) map[ym].in += t.qty * t.price;
      else map[ym].out += -t.qty * t.price;
    });
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ ym, label: d.toLocaleDateString("tr-TR", { month: "short" }), in: map[ym]?.in || 0, out: map[ym]?.out || 0 });
    }
    return months;
  }, [holdingTxs]);
  const anyMonthlyFlow = monthlyFlows.some((m) => m.in > 0 || m.out > 0);

  // Son 30 gün: katkı mı piyasa mı?
  const contrib30 = (() => {
    if (!monthAgo) return null;
    const cutoff = monthAgo.date;
    const net = ledgerTxs.filter((t) => t.date > cutoff).reduce((s, t) => s + t.qty * t.price, 0);
    const deltaV = totalValue - monthAgo.value;
    return { net, market: deltaV - net, deltaV };
  })();

  // Hedef dağılım / dengeleme
  const targetSum = Object.values(pfTargets || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const rebalanceRows = HOLDING_TYPES.map((type) => {
    const cur = allocation.find((a) => a.type === type);
    const curPct = cur ? cur.pct : 0;
    const tgt = parseFloat(pfTargets?.[type]) || 0;
    if (!cur && tgt === 0) return null;
    const diffTry = (tgt - curPct) / 100 * totalValue;
    return { type, curPct, tgt, diffTry, color: HOLDING_TYPE_COLORS[type] || "#94a3b8" };
  }).filter(Boolean);
  const anyTargets = targetSum > 0;

  // Dağılımın zaman içindeki değişimi (byType'lı snapshot'lar)
  const typedSnaps = sortedSnaps.filter((s) => s.byType && Object.keys(s.byType).length);
  const stackedTypes = [...new Set(typedSnaps.flatMap((s) => Object.keys(s.byType)))];
  const stackedSeries = stackedTypes.map((type) => ({
    label: type,
    color: HOLDING_TYPE_COLORS[type] || "#94a3b8",
    values: typedSnaps.map((s) => s.byType[type] || 0),
  }));
  const stackedLabels = typedSnaps.map((s) => { const d = new Date(s.date); return `${d.getDate()}.${d.getMonth() + 1}`; });

  // Senaryo analizi — sınıf bazında % şok
  const [scenario, setScenario] = useStateP({});
  const scenarioValue = allocation.reduce((s, a) => s + a.value * (1 + (scenario[a.type] || 0) / 100), 0);
  const scenarioDelta = scenarioValue - totalValue;
  const anyScenario = Object.values(scenario).some((v) => v !== 0);

  if (holdings.length === 0) {
    return (
      <div className="view view-portfolio">
        <div className="page-head">
          <div>
            <h1 className="page-title">Yatırım portföyü</h1>
            <p className="page-sub">Hisse, fon, altın, döviz ve kripto varlıklarını takip et</p>
          </div>
        </div>
        <div className="empty-big">
          <div className="empty-big-icon"><Icon name="trendingUp" size={28} /></div>
          <div className="empty-big-t">Henüz yatırım eklemedin</div>
          <p className="empty-big-d">Hisse, fon, altın, döviz veya kripto varlıklarını ekle. Maliyet, güncel değer, kâr/zarar ve portföy dağılımını otomatik hesaplarız.</p>
          <button className="btn btn-primary btn-md" onClick={() => setEditOpen({ isNew: true })}><Icon name="plus" size={16} />İlk yatırımını ekle</button>
        </div>
        <HoldingModal editing={editOpen} onClose={() => setEditOpen(null)} onSave={(d) => { addHolding(d); setEditOpen(null); }} />
      </div>
    );
  }

  const SortTh = ({ col, label, align }) => (
    <th className={`pf-th ${align === "l" ? "pf-th-l" : ""} ${sortCol === col ? "pf-th-act" : ""}`} onClick={() => setSort(col)}>
      {label}{sortCol === col && <span className="pf-th-arrow">{sortDir === -1 ? "▼" : "▲"}</span>}
    </th>
  );

  return (
    <div className="view view-portfolio">
      <div className="page-head">
        <div>
          <h1 className="page-title">Yatırım portföyü</h1>
          <p className="page-sub">{holdings.length} varlık · {allocation.length} sınıf</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-md" onClick={refreshPrices} disabled={priceRefreshing}>
            {priceRefreshing ? <span className="ai-spin ai-spin-dark" /> : <Icon name="trendingUp" size={16} />}
            Fiyatları güncelle
          </button>
          <button className="btn btn-primary btn-md" onClick={() => setEditOpen({ isNew: true })}><Icon name="plus" size={16} />Yatırım ekle</button>
        </div>
      </div>
      {priceRefreshMsg && <div className="pf-refresh-note"><Icon name="info" size={13} />{priceRefreshMsg}</div>}

      {/* Ticker şeridi — borsa uygulaması özeti */}
      <div className="pf-ticker">
        <div className="pf-tk-cell pf-tk-main">
          <div className="pf-tk-l">Toplam değer</div>
          <div className="pf-tk-v">{showBalances ? `₺${fmt(totalValue)}` : "••••••"}</div>
        </div>
        <div className="pf-tk-cell">
          <div className="pf-tk-l">Toplam K/Z</div>
          <div className={`pf-tk-v pf-tk-v-sm mono ${totalPL >= 0 ? "pos" : "neg"}`}>{showBalances ? `${totalPL < 0 ? "−" : "+"}₺${fmtS(Math.abs(totalPL))}` : "••"}</div>
          <div className={`pf-tk-pct ${totalPL >= 0 ? "pos" : "neg"}`}>{totalPL >= 0 ? "▲" : "▼"} %{Math.abs(totalPLPct).toFixed(2)}</div>
        </div>
        <div className="pf-tk-cell">
          <div className="pf-tk-l">Maliyet</div>
          <div className="pf-tk-v pf-tk-v-sm mono">{showBalances ? `₺${fmtS(totalCost)}` : "••"}</div>
        </div>
        <div className="pf-tk-cell">
          <div className="pf-tk-l">Haftalık</div>
          <div className={`pf-tk-v pf-tk-v-sm mono ${weekChangePct >= 0 ? "pos" : "neg"}`}>{weekChangePct === null ? "—" : `${weekChangePct >= 0 ? "+" : ""}%${weekChangePct.toFixed(1)}`}</div>
        </div>
        <div className="pf-tk-cell">
          <div className="pf-tk-l">Aylık</div>
          <div className={`pf-tk-v pf-tk-v-sm mono ${monthChangePct >= 0 ? "pos" : "neg"}`}>{monthChangePct === null ? "—" : `${monthChangePct >= 0 ? "+" : ""}%${monthChangePct.toFixed(1)}`}</div>
        </div>
        {xirr !== null && (
          <div className="pf-tk-cell">
            <div className="pf-tk-l">Yıllık getiri (XIRR)</div>
            <div className={`pf-tk-v pf-tk-v-sm mono ${xirr >= 0 ? "pos" : "neg"}`}>{xirr >= 0 ? "+" : ""}%{xirr.toFixed(1)}</div>
            <div className="pf-tk-pct">işlem geçmişinden</div>
          </div>
        )}
        {best && (
          <div className="pf-tk-cell">
            <div className="pf-tk-l">En iyi</div>
            <div className="pf-tk-v pf-tk-v-sm pos">{best.name} <span className="mono">+%{best.plPct.toFixed(1)}</span></div>
          </div>
        )}
        {worst && worst.plPct < 0 && (
          <div className="pf-tk-cell">
            <div className="pf-tk-l">En kötü</div>
            <div className="pf-tk-v pf-tk-v-sm neg">{worst.name} <span className="mono">%{worst.plPct.toFixed(1)}</span></div>
          </div>
        )}
      </div>

      {/* Varlıklar — borsa tarzı tablo */}
      <Card
        title="Varlıklarım"
        subtitle="Sütun başlığına tıkla · sırala"
        padded={false}
        action={
          <button className="pf-group-toggle" onClick={() => setGroupBy(groupBy === "type" ? "none" : "type")}>
            <Icon name={groupBy === "type" ? "list" : "pie"} size={14} />
            {groupBy === "type" ? "Düz liste" : "Sınıfa göre grupla"}
          </button>
        }
      >
        <div className="pf-table-wrap">
          <table className="pf-table2">
            <thead>
              <tr>
                <SortTh col="name" label="Varlık" align="l" />
                <SortTh col="qty" label="Adet" />
                <SortTh col="avgCost" label="Ort. Maliyet" />
                <SortTh col="price" label="Güncel" />
                <SortTh col="value" label="Değer" />
                <SortTh col="pl" label="K/Z ₺" />
                <SortTh col="plPct" label="K/Z %" />
                <th className="pf-th">Pay</th>
                <th className="pf-th"></th>
              </tr>
            </thead>
            {groupBy === "type" ? (
              allocation.map((grp) => (
                <tbody key={grp.type} className="pf-tgroup">
                  <tr className="pf-group-tr">
                    <td colSpan="9">
                      <span className="pf-group-dot" style={{ background: grp.color }} />
                      <span className="pf-group-t">{grp.type}</span>
                      <span className="pf-group-c">{rows.filter((r) => r.type === grp.type).length}</span>
                      <span className="pf-group-v mono">{showBalances ? `₺${fmtS(grp.value)}` : "••"} · %{grp.pct.toFixed(0)}</span>
                    </td>
                  </tr>
                  {sortRows(rows.filter((r) => r.type === grp.type)).map((r) => <HoldingTr key={r.id} r={r} totalValue={totalValue} showBalances={showBalances} fmt={fmt} fmtS={fmtS} onEdit={() => setEditOpen(r)} onDetail={() => setDetailOpen(r)} />)}
                </tbody>
              ))
            ) : (
              <tbody>
                {sortRows(rows).map((r) => <HoldingTr key={r.id} r={r} totalValue={totalValue} showBalances={showBalances} fmt={fmt} fmtS={fmtS} onEdit={() => setEditOpen(r)} onDetail={() => setDetailOpen(r)} />)}
              </tbody>
            )}
          </table>
        </div>
      </Card>

      {/* Portföy değeri zaman çizelgesi + enflasyon/döviz karşılaştırması */}
      <Card
        title="Portföy değeri zaman çizelgesi"
        subtitle="Geçmiş değer, enflasyon ve USD/TRY karşılaştırması"
        action={<button className="btn btn-ghost btn-sm" onClick={() => setHistOpen(true)}><Icon name="plus" size={14} />Geçmiş değer ekle</button>}
      >
        {sortedSnaps.length < 2 ? (
          <div className="pf-hist-empty">
            <p>En az 2 anlık görüntü birikince çizgisel grafik ve karşılaştırmalar burada görünür. Bugünkü değer otomatik kaydedildi; geçmiş bir tarihi de elle ekleyebilirsin ("3 ay önce ₺X'ti").</p>
          </div>
        ) : (
          <>
            <div className="seg" style={{ marginBottom: 10 }}>
              <button type="button" className={benchToggles.usd ? "seg-act" : ""} onClick={() => setBenchToggles((t) => ({ ...t, usd: !t.usd }))}>USD/TRY</button>
              <button type="button" className={benchToggles.xu100 ? "seg-act" : ""} disabled={!hasXu100} title={hasXu100 ? "" : "Bu Twelve Data planında endeks verisi yok"} onClick={() => setBenchToggles((t) => ({ ...t, xu100: !t.xu100 }))}>XU100</button>
              <button type="button" className={benchToggles.gold ? "seg-act" : ""} disabled={!hasGold} onClick={() => setBenchToggles((t) => ({ ...t, gold: !t.gold }))}>Altın</button>
            </div>
            {!benchData && (
              <div className="pf-refresh-note" style={{ marginBottom: 10 }}>
                <Icon name="info" size={13} />
                <span>XU100/Altın kıyaslaması için Ayarlar → "Hisse senedi fiyat anahtarı"ndan ücretsiz Twelve Data anahtarı gir. USD/TRY zaten anahtarsız çalışır.</span>
              </div>
            )}
            {benchData && !hasXu100 && (
              <div className="pf-refresh-note" style={{ marginBottom: 10 }}>
                <Icon name="info" size={13} />
                <span>XU100 endeks verisi mevcut Twelve Data planında yok — Altın ve USD/TRY kıyaslaması yine de çalışır.</span>
              </div>
            )}
            {anyBenchOn ? (
              <AreaChart series={benchmarkSeries} height={200} formatY={(v) => `${v >= 0 ? "+" : ""}%${v.toFixed(1)}`} />
            ) : (
              <AreaChart
                series={[{ labels: chartLabels, values: chartSnaps.map((s) => s.value), color: "var(--accent)", name: "Portföy değeri" }]}
                height={200}
                formatY={(v) => "₺" + fmtS(v)}
              />
            )}
            <div className="pf-cmp-grid">
              <div className="pf-cmp-card">
                <div className="pf-cmp-l">Haftalık</div>
                <div className={`pf-cmp-v mono ${weekChangePct >= 0 ? "pos" : "neg"}`}>{weekChangePct === null ? "—" : `${weekChangePct >= 0 ? "+" : ""}%${weekChangePct.toFixed(1)}`}</div>
                <div className="pf-cmp-sub">Enflasyona göre reel: <span className={realWeek >= 0 ? "pos" : "neg"}>{realWeek === null ? "—" : `${realWeek >= 0 ? "+" : ""}%${realWeek.toFixed(1)}`}</span></div>
              </div>
              <div className="pf-cmp-card">
                <div className="pf-cmp-l">Aylık</div>
                <div className={`pf-cmp-v mono ${monthChangePct >= 0 ? "pos" : "neg"}`}>{monthChangePct === null ? "—" : `${monthChangePct >= 0 ? "+" : ""}%${monthChangePct.toFixed(1)}`}</div>
                <div className="pf-cmp-sub">Enflasyona göre reel: <span className={realMonth >= 0 ? "pos" : "neg"}>{realMonth === null ? "—" : `${realMonth >= 0 ? "+" : ""}%${realMonth.toFixed(1)}`}</span></div>
              </div>
              <div className="pf-cmp-card">
                <div className="pf-cmp-l">USD/TRY karşısında</div>
                <div className={`pf-cmp-v mono ${usdWeekChangePct >= 0 ? "pos" : "neg"}`}>{usdWeekChangePct === null ? "—" : `${usdWeekChangePct >= 0 ? "+" : ""}%${usdWeekChangePct.toFixed(1)}`} <span className="pf-cmp-tag">1 hafta</span></div>
                <div className="pf-cmp-sub">1 ay: <span className={usdMonthChangePct >= 0 ? "pos" : "neg"}>{usdMonthChangePct === null ? "—" : `${usdMonthChangePct >= 0 ? "+" : ""}%${usdMonthChangePct.toFixed(1)}`}</span></div>
              </div>
            </div>
          </>
        )}
        <div className="pf-fx-row">
          <span className="pf-fx-l"><Icon name="info" size={13} />USD/TRY kur:</span>
          {usdTry ? (
            <span className="pf-fx-val mono">{usdTry.toFixed(2)} <span className="pf-fx-src">canlı</span></span>
          ) : fxLoading ? (
            <span className="pf-fx-val">alınıyor…</span>
          ) : (
            <span className="pf-fx-manual">
              <input type="text" placeholder="örn. 38,40" value={usdTryManual} onChange={(e) => setUsdTryManual(e.target.value)} />
              <span className="pf-fx-src">elle · API alınamadı</span>
            </span>
          )}
        </div>
        <label className="pf-infl-row">
          <span>Yıllık TÜFE (%)</span>
          <input type="number" min="0" max="200" step="0.5" value={inflRate} onChange={(e) => { const v = Math.max(0, +e.target.value || 0); setInflRate(v); try { localStorage.setItem("kese_inflation", String(v)); } catch (er) {} }} />
        </label>
      </Card>

      {/* Son 30 gün: katkı mı piyasa mı? */}
      {contrib30 && ledgerTxs.length > 0 && (
        <Card title="Son 30 gün: katkı mı, piyasa mı?" subtitle="Portföy büyümesinin kaynağı — yatırdığın para ile piyasa hareketinin ayrımı">
          <div className="pf-cmp-grid">
            <div className="pf-cmp-card">
              <div className="pf-cmp-l">Toplam değişim</div>
              <div className={`pf-cmp-v mono ${contrib30.deltaV >= 0 ? "pos" : "neg"}`}>{contrib30.deltaV < 0 ? "−" : "+"}₺{fmtS(Math.abs(contrib30.deltaV))}</div>
              <div className="pf-cmp-sub">30 gün önceki değere göre</div>
            </div>
            <div className="pf-cmp-card">
              <div className="pf-cmp-l">Senin katkın</div>
              <div className={`pf-cmp-v mono ${contrib30.net >= 0 ? "pos" : "neg"}`}>{contrib30.net < 0 ? "−" : "+"}₺{fmtS(Math.abs(contrib30.net))}</div>
              <div className="pf-cmp-sub">alımlar − satışlar (işlem geçmişinden)</div>
            </div>
            <div className="pf-cmp-card">
              <div className="pf-cmp-l">Piyasa etkisi</div>
              <div className={`pf-cmp-v mono ${contrib30.market >= 0 ? "pos" : "neg"}`}>{contrib30.market < 0 ? "−" : "+"}₺{fmtS(Math.abs(contrib30.market))}</div>
              <div className="pf-cmp-sub">fiyat hareketlerinden gelen</div>
            </div>
          </div>
        </Card>
      )}

      {/* Aylık katkı/çekim + Gerçekleşmiş K/Z */}
      {(anyMonthlyFlow || realizedByAsset.length > 0) && (
        <div className="grid-2col pf-grid">
          <Card title="Aylık katkı ve çekim" subtitle="İşlem geçmişine göre portföye giren/çıkan para (son 12 ay)">
            {anyMonthlyFlow ? (
              <BarChart
                data={monthlyFlows.map((m) => ({ label: m.label, values: [m.in, m.out], colors: ["var(--pos)", "var(--neg)"] }))}
                height={190}
                seriesLabels={["Yatırılan", "Çekilen"]}
                formatY={(v) => "₺" + fmtS(v)}
                formatTooltipValue={(v) => "₺" + fmt(v)}
              />
            ) : (
              <div className="pf-hist-empty"><p>Varlıklarına alış/satış işlemleri girdikçe aylık para akışın burada görünür.</p></div>
            )}
          </Card>

          <Card title="Gerçekleşmiş K/Z" subtitle="Satışlardan cebe giren/çıkan kâr — henüz satılmamış kâğıt kârı değil">
            {realizedByAsset.length > 0 ? (
              <>
                <div className="pf-cmp-grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 0 }}>
                  <div className="pf-cmp-card">
                    <div className="pf-cmp-l">Ortalama maliyet usulü</div>
                    <div className={`pf-cmp-v mono ${totalRealized >= 0 ? "pos" : "neg"}`}>{totalRealized < 0 ? "−" : "+"}₺{fmtS(Math.abs(totalRealized))}</div>
                  </div>
                  <div className="pf-cmp-card">
                    <div className="pf-cmp-l">FIFO usulü (vergide esas)</div>
                    <div className={`pf-cmp-v mono ${fifoAll.realized >= 0 ? "pos" : "neg"}`}>{fifoAll.realized < 0 ? "−" : "+"}₺{fmtS(Math.abs(fifoAll.realized))}</div>
                  </div>
                </div>
                <div className="pf-alloc-legend" style={{ marginTop: 14 }}>
                  {realizedByAsset.map((r) => (
                    <div key={r.id} className="pf-leg-row">
                      <span className="pf-leg-dot" style={{ background: r.color }} />
                      <span className="pf-leg-name">{r.name}</span>
                      <span className={`pf-leg-pct mono ${r.realizedPL >= 0 ? "pos" : "neg"}`}>{r.realizedPL < 0 ? "−" : "+"}₺{fmtS(Math.abs(r.realizedPL))}</span>
                      <span className="pf-leg-val" />
                    </div>
                  ))}
                </div>
                {Object.keys(fifoAll.byYear).length > 0 && (
                  <div className="pf-fx-row">
                    <span className="pf-fx-l"><Icon name="calendar" size={13} />Yıl bazında (FIFO):</span>
                    {Object.entries(fifoAll.byYear).sort((a, b) => b[0].localeCompare(a[0])).map(([y, v]) => (
                      <span key={y} className="pf-fx-val mono">{y}: <span className={v >= 0 ? "pos" : "neg"}>{v < 0 ? "−" : "+"}₺{fmtS(Math.abs(v))}</span></span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="pf-hist-empty"><p>Bir varlıktan satış yaptığında gerçekleşen kâr/zarar burada birikir. Satışlar ortalama maliyetine göre hesaplanır; vergiye esas FIFO kırılımı da gösterilir.</p></div>
            )}
          </Card>
        </div>
      )}

      {/* Hedef dağılım ve dengeleme */}
      <Card
        title="Hedef dağılım ve dengeleme"
        subtitle="Her sınıf için hedef yüzde belirle — sapma ve somut alım/satım önerisi hesaplanır"
        action={anyTargets && Math.abs(targetSum - 100) > 0.5 ? <span className="pf-fx-src" style={{ color: "var(--warn)" }}>Hedef toplamı %{targetSum.toFixed(0)} — 100 olmalı</span> : null}
      >
        <div className="pf-alloc-legend">
          {rebalanceRows.map((rr) => (
            <div key={rr.type} className="pf-leg-row" style={{ gridTemplateColumns: "14px 1fr 60px 90px auto" }}>
              <span className="pf-leg-dot" style={{ background: rr.color }} />
              <span className="pf-leg-name">{rr.type}</span>
              <span className="pf-leg-pct mono">%{rr.curPct.toFixed(1)}</span>
              <span className="pf-infl-row" style={{ margin: 0 }}>
                <input
                  type="number" min="0" max="100" step="1"
                  value={pfTargets?.[rr.type] ?? ""}
                  placeholder="hedef"
                  onChange={(e) => {
                    const v = e.target.value;
                    setPfTargets({ ...(pfTargets || {}), [rr.type]: v === "" ? undefined : Math.max(0, Math.min(100, +v || 0)) });
                  }}
                />
              </span>
              <span className={`pf-leg-val mono ${Math.abs(rr.diffTry) < totalValue * 0.01 ? "" : rr.diffTry > 0 ? "pos" : "neg"}`}>
                {rr.tgt === 0 ? "" : Math.abs(rr.diffTry) < totalValue * 0.01 ? "dengede ✓" : rr.diffTry > 0 ? `+₺${fmtS(rr.diffTry)} ekle` : `−₺${fmtS(-rr.diffTry)} azalt`}
              </span>
            </div>
          ))}
        </div>
        {!anyTargets && (
          <div className="pf-risk-note" style={{ marginTop: 12 }}>
            <Icon name="target" size={13} />
            <span>Örnek: Hisse %35, Altın %20, Döviz %10... Hedefler toplam %100 olacak şekilde girilir; portföy saptıkça hangi sınıfa ne kadar ekleyip azaltman gerektiği ₺ olarak gösterilir.</span>
          </div>
        )}
      </Card>

      {/* Dağılımın zaman içindeki değişimi */}
      {typedSnaps.length >= 2 && (
        <Card title="Dağılımın zaman içindeki değişimi" subtitle="Sınıf bazında portföy değeri — gün gün birikir">
          <StackedAreaChart series={stackedSeries} labels={stackedLabels} height={220} formatY={(v) => "₺" + fmtS(v)} formatTooltipValue={(v) => "₺" + fmtS(v)} />
          <div className="legend legend-center">
            {stackedSeries.map((s) => (
              <span key={s.label} className="legend-item"><span className="legend-dot" style={{ background: s.color }} />{s.label}</span>
            ))}
          </div>
        </Card>
      )}

      {/* Senaryo analizi */}
      <Card
        title="Senaryo analizi"
        subtitle="“Kripto %30 düşerse, altın %20 yükselirse ne olur?” — sınıf bazında şok uygula"
        action={anyScenario ? <button className="btn btn-ghost btn-sm" onClick={() => setScenario({})}><Icon name="repeat" size={13} />Sıfırla</button> : null}
      >
        <div className="pattern-wrap" style={{ alignItems: "start" }}>
          <div>
            {allocation.map((a) => (
              <div key={a.type} className="kp-sim-control" style={{ marginBottom: 12 }}>
                <div className="kp-sim-label">
                  <span><span className="pf-leg-dot" style={{ background: a.color, display: "inline-block", marginRight: 6 }} />{a.type}</span>
                  <strong className={`mono ${(scenario[a.type] || 0) > 0 ? "pos" : (scenario[a.type] || 0) < 0 ? "neg" : ""}`}>{(scenario[a.type] || 0) > 0 ? "+" : ""}%{scenario[a.type] || 0}</strong>
                </div>
                <input
                  type="range" className="kp-sim-range" min="-50" max="100" step="5"
                  value={scenario[a.type] || 0}
                  onChange={(e) => setScenario({ ...scenario, [a.type]: +e.target.value })}
                />
              </div>
            ))}
          </div>
          <div className="pattern-stats">
            <div className="pattern-stat">
              <div className="pattern-stat-h"><Icon name="pie" size={14} />Senaryo sonrası değer</div>
              <div className="pattern-stat-v mono">{showBalances ? `₺${fmt(scenarioValue)}` : "••"}</div>
              <div className="pattern-stat-s">şu an ₺{fmtS(totalValue)}</div>
            </div>
            <div className="pattern-stat">
              <div className="pattern-stat-h"><Icon name={scenarioDelta >= 0 ? "trendingUp" : "trendingDown"} size={14} />Fark</div>
              <div className={`pattern-stat-v mono ${scenarioDelta >= 0 ? "pos" : "neg"}`}>{scenarioDelta < 0 ? "−" : "+"}₺{fmtS(Math.abs(scenarioDelta))}</div>
              <div className="pattern-stat-s">{totalValue ? `%${(scenarioDelta / totalValue * 100).toFixed(1)}` : "—"}</div>
            </div>
            {anyScenario && (
              <div className="pattern-stat">
                <div className="pattern-stat-h"><Icon name="info" size={14} />En büyük etki</div>
                {(() => {
                  const impacts = allocation.map((a) => ({ type: a.type, imp: a.value * ((scenario[a.type] || 0) / 100) })).sort((x, y) => Math.abs(y.imp) - Math.abs(x.imp));
                  const top = impacts[0];
                  return <div className="pattern-stat-insight">{top && top.imp !== 0 ? `${top.type}: ${top.imp < 0 ? "−" : "+"}₺${fmtS(Math.abs(top.imp))}` : "—"}</div>;
                })()}
              </div>
            )}
          </div>
        </div>
      </Card>

      <div className="grid-2col pf-grid">
        {/* Dağılım donut */}
        <Card title="Varlık dağılımı" subtitle="Sınıfa göre portföy ağırlığı">
          <div className="pf-alloc-wrap">
            <Donut
              segments={allocation.map((a) => ({ label: a.type, value: a.value, color: a.color }))}
              size={170}
              thickness={22}
              center={<div className="donut-center-inner"><div className="donut-c-val">{showBalances ? `₺${fmtS(totalValue)}` : "••"}</div><div className="donut-c-pct">toplam</div></div>}
              formatTooltipValue={(v) => "₺" + fmtS(v)}
            />
            <div className="pf-alloc-legend">
              {allocation.map((a) => (
                <div key={a.type} className="pf-leg-row">
                  <span className="pf-leg-dot" style={{ background: a.color }} />
                  <span className="pf-leg-name">{a.type}</span>
                  <span className="pf-leg-pct mono">%{a.pct.toFixed(1)}</span>
                  <span className="pf-leg-val mono">{showBalances ? `₺${fmtS(a.value)}` : "••"}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Kâr/Zarar dağılımı */}
        <Card title="Kâr / Zarar dağılımı" subtitle="Her varlığın katkısı">
          <div className="pf-pl-list">
            {sortRows(rows).slice(0, 7).map((r) => {
              const maxAbs = Math.max(...rows.map((x) => Math.abs(x.pl)), 1);
              const w = Math.abs(r.pl) / maxAbs * 100;
              return (
                <div key={r.id} className="pf-pl-row">
                  <div className="pf-pl-name">{r.name}</div>
                  <div className="pf-pl-track">
                    <div className={`pf-pl-fill ${r.pl >= 0 ? "pos" : "neg"}`} style={{ width: `${w}%` }} />
                  </div>
                  <div className={`pf-pl-amt mono ${r.pl >= 0 ? "pos" : "neg"}`}>{showBalances ? `${r.pl < 0 ? "−" : "+"}₺${fmtS(Math.abs(r.pl))}` : "••"}</div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Maliyet vs Güncel Değer */}
      <Card title="Maliyet vs Güncel Değer" subtitle="Sınıf bazında yatırılan tutar ile bugünkü değer">
        <BarChart
          data={allocation.map((a) => ({
            label: a.type,
            values: [rows.filter((r) => r.type === a.type).reduce((s, r) => s + r.cost, 0), a.value],
            colors: ["var(--fg-4)", a.color],
          }))}
          height={220}
          seriesLabels={["Maliyet", "Güncel değer"]}
          formatY={(v) => "₺" + fmtS(v)}
          formatTooltipValue={(v) => "₺" + fmt(v)}
        />
      </Card>

      {/* Portföy Sağlığı & Risk */}
      <div className="grid-2col pf-grid">
        <Card title="Portföy sağlığı" subtitle="Çeşitlendirme ve yoğunlaşma analizi">
          <div className="pf-health">
            <div className="pf-health-ring">
              <Donut
                segments={[{ label: "Skor", value: Math.max(1, divScore), color: divZone === "ok" ? "#22c55e" : divZone === "warn" ? "#f59e0b" : "#ef4444" }, { label: "", value: Math.max(0, 100 - divScore), color: "var(--bg-elev-2)" }]}
                size={120} thickness={13}
                center={<div className="donut-center-inner"><div className="donut-c-val">{divScore}</div><div className="donut-c-pct">/100</div></div>}
              />
              <div className={`pf-health-label pf-hz-${divZone}`}>{divLabel}</div>
            </div>
            <div className="pf-health-stats">
              <div className="pf-hs-row">
                <span className="pf-hs-l">Çeşitlendirme (HHI)</span>
                <span className="pf-hs-v mono">{Math.round(hhi)}</span>
              </div>
              <div className="pf-hs-row">
                <span className="pf-hs-l">Varlık sayısı</span>
                <span className="pf-hs-v mono">{rows.length}</span>
              </div>
              <div className="pf-hs-row">
                <span className="pf-hs-l">En büyük pozisyon</span>
                <span className={`pf-hs-v mono ${topPosPct > 25 ? "neg" : ""}`}>{topPos?.name} · %{topPosPct.toFixed(0)}</span>
              </div>
              {topPosPct > 25 && (
                <div className="pf-health-warn"><Icon name="alertTriangle" size={13} />Tek varlıkta %{topPosPct.toFixed(0)} yoğunlaşma — risk yüksek.</div>
              )}
            </div>
          </div>
        </Card>

        <Card title="Risk maruziyeti" subtitle={`Profil: ${riskLabel} · risk skoru ${riskScore.toFixed(1)}/3`}>
          <div className="pf-risk-bar">
            {riskBands.filter((b) => b.pct > 0).map((b) => (
              <div key={b.band} className="pf-risk-seg" style={{ width: `${b.pct}%`, background: b.color }} title={`${b.band}: %${b.pct.toFixed(0)}`} />
            ))}
          </div>
          <div className="pf-risk-legend">
            {riskBands.map((b) => (
              <div key={b.band} className="pf-risk-row">
                <span className="pf-risk-dot" style={{ background: b.color }} />
                <span className="pf-risk-n">{b.band} risk</span>
                <span className="pf-risk-p mono">%{b.pct.toFixed(0)}</span>
                <span className="pf-risk-v mono">{showBalances ? `₺${fmtS(b.value)}` : "••"}</span>
              </div>
            ))}
          </div>
          <div className="pf-risk-note">
            <Icon name="info" size={13} />
            <span>Düşük: tahvil/döviz · Orta: altın/fon/hisse · Yüksek: yabancı hisse/kripto. {riskScore >= 2.3 ? "Yüksek riskli ağırlık — sert dalgalanmalara hazır ol." : riskScore < 1.6 ? "Savunmacı duruş — büyüme potansiyeli sınırlı olabilir." : "Dengeli bir risk dağılımın var."}</span>
          </div>
        </Card>
      </div>

      <HoldingModal
        editing={editOpen}
        onClose={() => setEditOpen(null)}
        onDelete={(id) => { if (confirm("Bu yatırımı silmek istiyor musun?")) { removeHolding(id); setEditOpen(null); } }}
        onSave={(d) => {
          if (editOpen && !editOpen.isNew) updateHolding(editOpen.id, d); else addHolding(d);
          setEditOpen(null);
        }}
        onOpenLedger={(h) => { setEditOpen(null); setLedgerOpen(h); }}
      />
      <HoldingLedgerModal
        holding={ledgerOpen}
        txs={ledgerOpen ? holdingTxs.filter((t) => t.holdingId === ledgerOpen.id) : []}
        onClose={() => setLedgerOpen(null)}
        onAdd={(tx) => addHoldingTx(tx)}
        onRemove={(id) => removeHoldingTx(id)}
        fmt={fmt}
      />
      <HoldingDetailModal
        r={detailOpen}
        txs={detailOpen ? holdingTxs.filter((t) => t.holdingId === detailOpen.id) : []}
        showBalances={showBalances}
        fmt={fmt}
        fmtS={fmtS}
        onClose={() => setDetailOpen(null)}
        onEdit={() => { setDetailOpen(null); setEditOpen(detailOpen); }}
        onLedger={() => { setDetailOpen(null); setLedgerOpen(detailOpen); }}
      />
      <PfHistoryModal
        open={histOpen}
        snapshots={sortedSnaps}
        onClose={() => setHistOpen(false)}
        onSave={(snap) => { addPfSnapshot(snap); setHistOpen(false); }}
        onDelete={(date) => removePfSnapshot(date)}
        fmt={fmt}
      />
    </div>
  );
}

function HoldingTr({ r, totalValue, showBalances, fmt, fmtS, onEdit, onDetail }) {
  const pct = totalValue ? r.value / totalValue * 100 : 0;
  return (
    <tr className="pf-tr" onClick={onEdit}>
      <td className="pf-td pf-td-l">
        <div className="pf-row-asset">
          <span className="pf-tk-badge" style={{ background: `${r.color}22`, color: r.color }}>{r.name.slice(0, 4)}</span>
          <div className="pf-row-id">
            <div className="pf-row-n">{r.name}</div>
            <div className="pf-row-full">{r.fullName || r.type}</div>
          </div>
        </div>
      </td>
      <td className="pf-td mono">{r.quantity.toLocaleString("tr-TR", { maximumFractionDigits: 4 })}</td>
      <td className="pf-td mono">₺{fmt(r.avgCost)}</td>
      <td className="pf-td mono">₺{fmt(r.price)}</td>
      <td className="pf-td mono">{showBalances ? `₺${fmtS(r.value)}` : "••"}</td>
      <td className={`pf-td mono ${r.pl >= 0 ? "pos" : "neg"}`}>{showBalances ? `${r.pl < 0 ? "−" : "+"}₺${fmtS(Math.abs(r.pl))}` : "••"}</td>
      <td className="pf-td">
        <span className={`pf-pl ${r.pl >= 0 ? "pos" : "neg"}`}>
          <Icon name={r.pl >= 0 ? "trendingUp" : "trendingDown"} size={12} />
          {r.pl >= 0 ? "+" : "−"}%{Math.abs(r.plPct).toFixed(2)}
        </span>
      </td>
      <td className="pf-td pf-td-alloc">
        <div className="pf-alloc-bar"><div style={{ width: `${pct}%`, background: r.color }} /></div>
        <span className="mono">%{pct.toFixed(0)}</span>
      </td>
      <td className="pf-td" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button type="button" title="Detay ve işlem geçmişi" onClick={(e) => { e.stopPropagation(); onDetail(); }} style={{ display: "flex", background: "none", border: "none", padding: 0, color: "inherit", cursor: "pointer" }}><Icon name="chart" size={13} /></button>
        <span title="Düzenle"><Icon name="edit" size={13} /></span>
      </td>
    </tr>
  );
}

function PfHistoryModal({ open, snapshots, onClose, onSave, onDelete, fmt }) {
  const [date, setDate] = useStateP("");
  const [value, setValue] = useStateP("");

  useEffectP(() => { if (open) { setDate(""); setValue(""); } }, [open]);
  useEffectP(() => {
    if (!open) return;
    const onEsc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;
  const v = pfNum(value);
  const canSubmit = date && v > 0;

  return (
    <div className="modal-bd" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-h">
          <div>
            <h2>Geçmiş portföy değeri ekle</h2>
            <p>Örn. "3 ay önce ₺X'ti" — grafiği ve karşılaştırmaları besler</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </header>
        <div className="modal-b">
          <div className="field-row">
            <label className="field">
              <span className="field-l">Tarih</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={localYMD(appToday())} />
            </label>
            <label className="field">
              <span className="field-l">O tarihteki portföy değeri (₺)</span>
              <div className="amount-input amount-input-sm"><span className="amount-curr">₺</span><input type="text" value={value} onChange={(e) => setValue(e.target.value)} className="amount-val mono" placeholder="0" /></div>
            </label>
          </div>
          {snapshots.length > 0 && (
            <div className="pf-hist-list">
              <div className="pf-hist-list-t">Kayıtlı geçmiş ({snapshots.length})</div>
              {snapshots.slice().reverse().slice(0, 8).map((s) => (
                <div key={s.date} className="pf-hist-row">
                  <span>{s.date}</span>
                  <span className="mono">₺{fmt(s.value)}</span>
                  {s.manual === false ? <span className="pf-hist-auto">otomatik</span> : (
                    <button type="button" className="pf-hist-del" onClick={() => onDelete(s.date)}><Icon name="x" size={12} /></button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <footer className="modal-f">
          <button type="button" className="btn btn-ghost btn-md" onClick={onClose}>İptal</button>
          <button type="button" className="btn btn-primary btn-md" disabled={!canSubmit} onClick={() => onSave({ date, value: v, manual: true })}>Kaydet</button>
        </footer>
      </div>
    </div>
  );
}

function HoldingLedgerModal({ holding, txs, onClose, onAdd, onRemove, fmt }) {
  const [side, setSide] = useStateP("buy");
  const [date, setDate] = useStateP("");
  const [qty, setQty] = useStateP("");
  const [price, setPrice] = useStateP("");
  const [note, setNote] = useStateP("");

  useEffectP(() => {
    if (holding) { setSide("buy"); setDate(localYMD(appToday())); setQty(""); setPrice(""); setNote(""); }
  }, [holding]);
  useEffectP(() => {
    if (!holding) return;
    const onEsc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [holding, onClose]);

  if (!holding) return null;

  const current = computeLedgerState(txs);
  const q = pfNum(qty), pr = pfNum(price);
  const overSell = side === "sell" && q > current.qty + 1e-7;
  const canSubmit = date && q > 0 && pr > 0 && !overSell;

  const submit = () => {
    if (!canSubmit) return;
    onAdd({ holdingId: holding.id, date, qty: side === "buy" ? q : -q, price: pr, note: note.trim() || undefined });
    setQty(""); setPrice(""); setNote("");
  };

  const useOpening = () => {
    setSide("buy");
    setDate(localYMD(appToday()));
    setQty(String(holding.quantity));
    setPrice(String(holding.avgCost));
    setNote("Açılış pozisyonu (mevcut bakiyeden)");
  };

  return (
    <div className="modal-bd" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-h">
          <div>
            <h2>{holding.name} — işlem geçmişi</h2>
            <p>Alış/satış kayıtları · ortalama maliyet ve gerçekleşmiş K/Z otomatik hesaplanır</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </header>
        <div className="modal-b">
          {txs.length === 0 && holding.quantity > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ marginBottom: 14 }} onClick={useOpening}>
              <Icon name="zap" size={14} />Mevcut pozisyonu açılış işlemi olarak kaydet
            </button>
          )}

          <div className="pf-type-grid" style={{ marginBottom: 10 }}>
            <button type="button" className={`pf-type-chip ${side === "buy" ? "pf-type-chip-act" : ""}`} onClick={() => setSide("buy")} style={side === "buy" ? { borderColor: "var(--pos)", color: "var(--pos)" } : {}}>Alış</button>
            <button type="button" className={`pf-type-chip ${side === "sell" ? "pf-type-chip-act" : ""}`} onClick={() => setSide("sell")} style={side === "sell" ? { borderColor: "var(--neg)", color: "var(--neg)" } : {}}>Satış</button>
          </div>

          <div className="field-row">
            <label className="field">
              <span className="field-l">Tarih</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={localYMD(appToday())} />
            </label>
            <label className="field">
              <span className="field-l">Adet</span>
              <input type="text" inputMode="decimal" placeholder="0" value={qty} onChange={(e) => setQty(e.target.value)} className="mono" />
            </label>
            <label className="field">
              <span className="field-l">Birim fiyat (₺)</span>
              <div className="amount-input amount-input-sm"><span className="amount-curr">₺</span><input type="text" value={price} onChange={(e) => setPrice(e.target.value)} className="amount-val mono" placeholder="0" /></div>
            </label>
          </div>
          <label className="field">
            <span className="field-l">Not (ops.)</span>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="örn. Aracı kurum X üzerinden" />
          </label>
          {overSell && (
            <div className="pf-refresh-note" style={{ color: "var(--neg)", borderColor: "color-mix(in oklch, var(--border), var(--neg) 40%)" }}>
              <Icon name="alertTriangle" size={13} />
              <span>Elindeki {current.qty.toLocaleString("tr-TR", { maximumFractionDigits: 4 })} adet, {q.toLocaleString("tr-TR")} adet satamazsın.</span>
            </div>
          )}
          <button type="button" className="btn btn-primary btn-md" style={{ marginTop: 10 }} disabled={!canSubmit} onClick={submit}>
            <Icon name="plus" size={15} />{side === "buy" ? "Alış ekle" : "Satış ekle"}
          </button>

          {txs.length > 0 && (
            <div className="pf-hist-list" style={{ marginTop: 16 }}>
              <div className="pf-hist-list-t">
                İşlemler ({txs.length}) · şu an {current.qty.toLocaleString("tr-TR", { maximumFractionDigits: 4 })} adet · ort. maliyet ₺{fmt(current.avgCost)}
                {current.realizedPL !== 0 && <> · gerçekleşmiş K/Z <span className={current.realizedPL >= 0 ? "pos" : "neg"}>{current.realizedPL >= 0 ? "+" : "−"}₺{fmt(Math.abs(current.realizedPL))}</span></>}
              </div>
              {[...txs].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).map((t) => (
                <div key={t.id} className="pf-hist-row">
                  <span className={t.qty > 0 ? "pos" : "neg"}>{t.qty > 0 ? "Alış" : "Satış"}</span>
                  <span>{t.date}</span>
                  <span className="mono">{Math.abs(t.qty).toLocaleString("tr-TR", { maximumFractionDigits: 4 })} × ₺{fmt(t.price)}</span>
                  <button type="button" className="pf-hist-del" onClick={() => onRemove(t.id)}><Icon name="x" size={12} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
        <footer className="modal-f">
          <button type="button" className="btn btn-primary btn-md" onClick={onClose}>Kapat</button>
        </footer>
      </div>
    </div>
  );
}

function HoldingDetailModal({ r, txs, showBalances, fmt, fmtS, onClose, onEdit, onLedger }) {
  useEffectP(() => {
    if (!r) return;
    const onEsc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [r, onClose]);

  if (!r) return null;

  const recentTxs = [...txs].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 5);
  const series = computeLedgerSeries(txs);

  return (
    <div className="modal-bd" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-h">
          <div>
            <h2>
              <span className="pf-tk-badge" style={{ background: `${r.color}22`, color: r.color, marginRight: 8 }}>{r.name.slice(0, 4)}</span>
              {r.name}
            </h2>
            <p>{r.fullName || r.type} · {r.type}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </header>
        <div className="modal-b">
          <div className="field-row">
            <div className="pf-cmp-card" style={{ flex: 1 }}>
              <div className="pf-cmp-l">Adet · Ort. maliyet</div>
              <div className="pf-cmp-v mono">{r.quantity.toLocaleString("tr-TR", { maximumFractionDigits: 4 })} × ₺{fmt(r.avgCost)}</div>
            </div>
            <div className="pf-cmp-card" style={{ flex: 1 }}>
              <div className="pf-cmp-l">Güncel değer</div>
              <div className="pf-cmp-v mono">{showBalances ? `₺${fmtS(r.value)}` : "••"}</div>
            </div>
            <div className="pf-cmp-card" style={{ flex: 1 }}>
              <div className="pf-cmp-l">Gerçekleşmemiş K/Z</div>
              <div className={`pf-cmp-v mono ${r.pl >= 0 ? "pos" : "neg"}`}>{r.pl < 0 ? "−" : "+"}₺{fmtS(Math.abs(r.pl))} <span style={{ fontSize: 12 }}>(%{Math.abs(r.plPct).toFixed(1)})</span></div>
            </div>
            {r.ledgerMode && (
              <div className="pf-cmp-card" style={{ flex: 1 }}>
                <div className="pf-cmp-l">Gerçekleşmiş K/Z</div>
                <div className={`pf-cmp-v mono ${r.realizedPL >= 0 ? "pos" : "neg"}`}>{r.realizedPL < 0 ? "−" : "+"}₺{fmtS(Math.abs(r.realizedPL))}</div>
              </div>
            )}
          </div>

          {r.ledgerMode && series.length > 0 ? (
            <div style={{ marginTop: 16 }}>
              <AreaChart
                series={[
                  { labels: [...series.map((s) => s.date), "Bugün"], values: [...series.map((s) => s.costBasis), series[series.length - 1].costBasis], color: "var(--fg-4)", name: "Maliyet bazı" },
                  { labels: [...series.map((s) => s.date), "Bugün"], values: [...series.map((s) => s.costBasis), r.value], color: "var(--accent)", name: "Güncel değer" },
                ]}
                height={160}
                formatY={(v) => "₺" + fmtS(v)}
              />
              <div className="pf-refresh-note" style={{ marginTop: 10 }}>
                <Icon name="info" size={13} />
                <span>Ara tarihlerde piyasa fiyatı geçmişi tutulmuyor — çizgi her işlemden sonraki maliyet bazını, "Bugün" noktası ise güncel değeri gösterir.</span>
              </div>
            </div>
          ) : (
            <div className="pf-refresh-note" style={{ marginTop: 16 }}>
              <Icon name="info" size={13} />
              <span>Zaman içindeki performans grafiği için işlem geçmişini kullanmaya başla.</span>
            </div>
          )}

          {recentTxs.length > 0 && (
            <div className="pf-hist-list" style={{ marginTop: 16 }}>
              <div className="pf-hist-list-t">Son işlemler</div>
              {recentTxs.map((t) => (
                <div key={t.id} className="pf-hist-row">
                  <span className={t.qty > 0 ? "pos" : "neg"}>{t.qty > 0 ? "Alış" : "Satış"}</span>
                  <span>{t.date}</span>
                  <span className="mono">{Math.abs(t.qty).toLocaleString("tr-TR", { maximumFractionDigits: 4 })} × ₺{fmt(t.price)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <footer className="modal-f">
          <button type="button" className="btn btn-ghost btn-md" onClick={onLedger}><Icon name="clock" size={15} />İşlem ekle</button>
          <button type="button" className="btn btn-primary btn-md" onClick={onEdit}><Icon name="edit" size={15} />Düzenle</button>
        </footer>
      </div>
    </div>
  );
}

function HoldingModal({ editing, onClose, onSave, onDelete, onOpenLedger }) {
  const [name, setName] = useStateP("");
  const [fullName, setFullName] = useStateP("");
  const [type, setType] = useStateP("Hisse");
  const [quantity, setQuantity] = useStateP("");
  const [avgCost, setAvgCost] = useStateP("");
  const [price, setPrice] = useStateP("");

  useEffectP(() => {
    if (editing && !editing.isNew) {
      setName(editing.name); setFullName(editing.fullName || ""); setType(editing.type);
      setQuantity(String(editing.quantity)); setAvgCost(String(editing.avgCost)); setPrice(String(editing.price));
    } else if (editing) {
      setName(""); setFullName(""); setType("Hisse"); setQuantity(""); setAvgCost(""); setPrice("");
    }
  }, [editing]);

  useEffectP(() => {
    if (!editing) return;
    const onEsc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [editing, onClose]);

  if (!editing) return null;
  const q = pfNum(quantity), ac = pfNum(avgCost), pr = pfNum(price);
  const value = q * pr, cost = q * ac, pl = value - cost, plPct = cost ? pl / cost * 100 : 0;
  const canSubmit = name.trim() && q > 0 && pr > 0;

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSave({
      name: name.trim().toUpperCase().slice(0, 8) === name.trim().toUpperCase() && name.length <= 6 ? name.trim().toUpperCase() : name.trim(),
      fullName: fullName.trim(),
      type, quantity: q, avgCost: ac, price: pr, currency: "TRY",
      color: HOLDING_TYPE_COLORS[type] || "#64748b",
    });
  };

  return (
    <div className="modal-bd" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="modal-h">
          <div>
            <h2>{editing.isNew ? "Yatırım ekle" : "Yatırımı düzenle"}</h2>
            <p>Hisse, fon, altın, döviz veya kripto</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </header>
        <div className="modal-b">
          {q > 0 && pr > 0 && (
            <div className={`pf-preview ${pl >= 0 ? "pos" : "neg"}`}>
              <div>
                <div className="pf-preview-l">Güncel değer</div>
                <div className="pf-preview-v mono">₺{APP_DATA.fmt(value)}</div>
              </div>
              <div className="pf-preview-pl">
                <div className={`mono ${pl >= 0 ? "pos" : "neg"}`}>{pl < 0 ? "−" : "+"}₺{APP_DATA.fmt(Math.abs(pl))}</div>
                <div className={`pf-preview-pct ${pl >= 0 ? "pos" : "neg"}`}>{pl >= 0 ? "+" : "−"}%{Math.abs(plPct).toFixed(2)}</div>
              </div>
            </div>
          )}

          <div className="field-row">
            <label className="field" style={{ flex: "0 0 140px" }}>
              <span className="field-l">Sembol / kod</span>
              <input type="text" autoFocus placeholder="THYAO, BTC..." value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-l">Tam adı (ops.)</span>
              <input type="text" placeholder="Türk Hava Yolları" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </label>
          </div>

          <div className="field">
            <span className="field-l">Varlık sınıfı</span>
            <div className="pf-type-grid">
              {HOLDING_TYPES.map((tt) => (
                <button type="button" key={tt} className={`pf-type-chip ${type === tt ? "pf-type-chip-act" : ""}`} onClick={() => setType(tt)} style={type === tt ? { borderColor: HOLDING_TYPE_COLORS[tt], color: HOLDING_TYPE_COLORS[tt] } : {}}>
                  {tt}
                </button>
              ))}
            </div>
          </div>

          <div className="field-row">
            <label className="field">
              <span className="field-l">Adet / miktar</span>
              <input type="text" inputMode="decimal" placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="mono" disabled={editing.ledgerMode} />
            </label>
            <label className="field">
              <span className="field-l">Ort. maliyet (₺)</span>
              <div className="amount-input amount-input-sm"><span className="amount-curr">₺</span><input type="text" value={avgCost} onChange={(e) => setAvgCost(e.target.value)} className="amount-val mono" placeholder="0" disabled={editing.ledgerMode} /></div>
            </label>
            <label className="field">
              <span className="field-l">Güncel fiyat (₺)</span>
              <div className="amount-input amount-input-sm"><span className="amount-curr">₺</span><input type="text" value={price} onChange={(e) => setPrice(e.target.value)} className="amount-val mono" placeholder="0" /></div>
            </label>
          </div>

          {editing.ledgerMode ? (
            <div className="pf-refresh-note">
              <Icon name="info" size={13} />
              <span>
                Bu varlık işlem geçmişinden hesaplanıyor — adet/ortalama maliyeti değiştirmek için{" "}
                <button type="button" onClick={() => onOpenLedger(editing)} style={{ display: "inline", padding: 0, margin: 0, background: "none", border: "none", font: "inherit", color: "var(--accent)", textDecoration: "underline", cursor: "pointer" }}>işlem geçmişini kullan</button>.
              </span>
            </div>
          ) : onOpenLedger && !editing.isNew ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpenLedger(editing)}>
              <Icon name="clock" size={14} />İşlem geçmişini kullanmaya başla
            </button>
          ) : null}
        </div>
        <footer className="modal-f modal-f-split">
          {editing.isNew ? <span /> : <button type="button" className="btn btn-ghost btn-md pf-del" onClick={() => onDelete(editing.id)}><Icon name="x" size={15} />Sil</button>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-md" onClick={onClose}>İptal</button>
            <button type="submit" className="btn btn-primary btn-md" disabled={!canSubmit}>{editing.isNew ? "Ekle" : "Kaydet"}</button>
          </div>
        </footer>
      </form>
    </div>
  );
}

Object.assign(window, { PortfolioView });
