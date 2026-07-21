// Kese+ AI — Doğal dil soru-cevap + otomatik aylık CFO raporu
// Sağlayıcı: önizlemede window.claude; dışarıda kullanıcının kendi Anthropic API anahtarı (Ayarlar'dan girilir)
// ─────────────────────────────────────────────────────────

// ── AI sağlayıcı katmanı ──
// 1) window.claude varsa (canlı önizleme) onu kullanır
// 2) Yoksa localStorage'daki "kese_api_key" ile doğrudan Anthropic API'ye gider
window.keseAI = {
  hasProvider() {
    return !!(window.claude && window.claude.complete) || !!localStorage.getItem("kese_api_key");
  },
  hasOwnKey() { return !!localStorage.getItem("kese_api_key"); },
  async complete(arg) {
    const messages = typeof arg === "string" ? [{ role: "user", content: arg }] : (arg.messages || []);
    if (window.claude && window.claude.complete) {
      return await window.claude.complete({ messages });
    }
    const key = localStorage.getItem("kese_api_key");
    if (!key) throw new Error("no-key");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 1500, messages }),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new Error("bad-key");
      if (res.status === 429) throw new Error("rate-limit");
      let detail = "";
      try { detail = ((await res.json()).error || {}).message || ""; } catch (e) {}
      const err = new Error("api-error");
      err.detail = `HTTP ${res.status}${detail ? " — " + detail : ""}`;
      throw err;
    }
    const data = await res.json();
    return (data.content || []).map((c) => c.text || "").join("");
  },
};
window.keseAIErrorText = (e) => {
  const m = e && e.message;
  if (m === "no-key") return "AI için Ayarlar → \"Yapay zekâ anahtarı\" bölümünden kendi Anthropic API anahtarını gir (console.anthropic.com'dan alınır). Anahtar yalnızca bu cihazda saklanır.";
  if (m === "bad-key") return "API anahtarı geçersiz veya yetkisiz — Ayarlar'dan kontrol et.";
  if (m === "rate-limit") return "Hız sınırına takıldın — biraz bekleyip tekrar dene.";
  if (m === "api-error" && e.detail) return `Bir hata oluştu: ${e.detail}`;
  return "Bir hata oluştu, tekrar dener misin?";
};

const { useState: useStateAI, useEffect: useEffectAI, useRef: useRefAI } = React;

// Markdown render: başlık, kalın, italik, madde, çizgi, tablo
function renderInline(text, keyBase) {
  // **kalın**, *italik*, `kod`
  const parts = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<React.Fragment key={keyBase + "-t" + i}>{text.slice(last, m.index)}</React.Fragment>);
    const s = m[0];
    if (s.startsWith("**")) parts.push(<strong key={keyBase + "-b" + i}>{s.slice(2, -2)}</strong>);
    else if (s.startsWith("`")) parts.push(<code key={keyBase + "-c" + i} className="ai-code">{s.slice(1, -1)}</code>);
    else parts.push(<em key={keyBase + "-i" + i}>{s.slice(1, -1)}</em>);
    last = m.index + s.length; i++;
  }
  if (last < text.length) parts.push(<React.Fragment key={keyBase + "-tend"}>{text.slice(last)}</React.Fragment>);
  return parts;
}

function renderRich(text) {
  const rawLines = (text || "").split("\n");
  const out = [];
  let tableBuf = [];
  const flushTable = (key) => {
    if (!tableBuf.length) return;
    const rows = tableBuf.map((r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
    const isSep = (r) => r.every((c) => /^:?-+:?$/.test(c));
    const header = rows[0];
    const body = rows.slice(1).filter((r) => !isSep(r));
    out.push(
      <div key={"tbl" + key} className="ai-table-wrap"><table className="ai-table">
        <thead><tr>{header.map((c, i) => <th key={i}>{renderInline(c, "h" + key + i)}</th>)}</tr></thead>
        <tbody>{body.map((r, ri) => <tr key={ri}>{r.map((c, ci) => <td key={ci}>{renderInline(c, "d" + key + ri + ci)}</td>)}</tr>)}</tbody>
      </table></div>
    );
    tableBuf = [];
  };
  rawLines.forEach((raw, li) => {
    const line = raw.trim();
    if (/^\|.*\|/.test(line)) { tableBuf.push(line); return; }
    flushTable(li);
    if (!line) return;
    if (/^#{1,6}\s/.test(line)) { const t = line.replace(/^#{1,6}\s/, ""); out.push(<div key={li} className="ai-h">{renderInline(t, "hh" + li)}</div>); return; }
    if (/^([-*_])\1{2,}$/.test(line)) { out.push(<hr key={li} className="ai-hr" />); return; }
    if (/^\d+\.\s/.test(line)) { const t = line.replace(/^(\d+)\.\s/, ""); const n = line.match(/^(\d+)\./)[1]; out.push(<div key={li} className="ai-li"><span className="ai-li-num">{n}.</span><span>{renderInline(t, "n" + li)}</span></div>); return; }
    if (/^[-•*]\s/.test(line)) { const t = line.replace(/^[-•*]\s+/, ""); out.push(<div key={li} className="ai-li"><span className="ai-li-dot">•</span><span>{renderInline(t, "u" + li)}</span></div>); return; }
    out.push(<p key={li}>{renderInline(line, "p" + li)}</p>);
  });
  flushTable("end");
  return out;
}

// Kullanıcının finansal durumunu kompakt, AI'ya verilebilir özete çevir
function buildFinanceContext(ctx) {
  const { accounts, debts, transactions, holdings = [], goals = [], snapshots = [], budgets = [], scheduled = [] } = ctx;
  const fmt = (n) => Math.round(n).toLocaleString("tr-TR");
  const today = appToday();
  const isLeg = (t) => isTransferLeg(t);
  const isDebtPay = (t) => isDebtPayment(t);

  const cashAccts = accounts.filter((a) => !a.type.includes("Kart"));
  const cardAccts = accounts.filter((a) => a.type.includes("Kart"));
  const liquidCash = cashAccts.reduce((s, a) => s + Math.max(0, a.balance), 0);
  const cardDebt = -cardAccts.reduce((s, a) => s + Math.min(0, a.balance), 0);
  const cardLimit = cardAccts.reduce((s, a) => s + (a.limit || 0), 0);
  const loanDebt = debts.reduce((s, d) => s + (d.remaining || 0), 0);
  const totalDebt = cardDebt + loanDebt;
  const netWorth = liquidCash - totalDebt;

  // Son 6 ay gelir/gider
  const months = [];
  const TRM = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const s = new Date(d.getFullYear(), d.getMonth(), 1);
    const e = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    const txs = transactions.filter((t) => { const dt = new Date(t.date); return dt >= s && dt <= e; });
    const inc = txs.filter((t) => !isLeg(t) && !isDebtPay(t) && t.amount > 0).reduce((a, t) => a + t.amount, 0);
    const exp = -txs.filter((t) => !isLeg(t) && !isDebtPay(t) && t.amount < 0).reduce((a, t) => a + t.amount, 0);
    months.push({ name: `${TRM[d.getMonth()]} ${d.getFullYear()}`, inc, exp, net: inc - exp });
  }

  // Bu ay kategori kırılımı
  const mStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const catMap = {};
  transactions.filter((t) => new Date(t.date) >= mStart && !isLeg(t) && !isDebtPay(t) && t.amount < 0)
    .forEach((t) => { const c = APP_DATA.categories.find((x) => x.id === t.category); catMap[c?.label || t.category] = (catMap[c?.label || t.category] || 0) + -t.amount; });
  const catLines = Object.entries(catMap).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${fmt(v)} TL`).join("\n");

  const incMonths = Math.max(1, months.filter((mm) => mm.inc > 0).length);
  const actMonths = Math.max(1, months.filter((mm) => mm.inc > 0 || mm.exp > 0).length);
  const monthlyIncome = months.reduce((s, mm) => s + mm.inc, 0) / incMonths;
  const monthlyExpense = months.reduce((s, mm) => s + mm.exp, 0) / actMonths;
  const cardInterestMo = cardAccts.reduce((s, a) => s + Math.max(0, -a.balance) * ((a.rate || 4.25) / 100), 0);
  const loanInterestMo = debts.reduce((s, d) => s + (d.remaining || 0) * ((d.rate || 0) / 100), 0);
  const carryingMo = cardInterestMo + loanInterestMo;
  const emergencyMonths = monthlyExpense ? liquidCash / monthlyExpense : 0;

  // ── Profesyonel finansal oranlar ──
  const savingsRate = monthlyIncome ? (monthlyIncome - monthlyExpense) / monthlyIncome * 100 : 0;
  const monthlyDebtService = cardDebt * 0.20 + debts.reduce((s, d) => s + (d.monthly || 0), 0);
  const dsr = monthlyIncome ? monthlyDebtService / monthlyIncome * 100 : 0; // borç servis oranı
  const cardUtil = cardLimit ? cardDebt / cardLimit * 100 : 0;
  const leverage = liquidCash > 0 ? totalDebt / liquidCash : null; // borç/likit kaldıraç
  const interestCoverage = carryingMo ? monthlyIncome / carryingMo : null; // faiz karşılama
  const expenseRatio = monthlyIncome ? monthlyExpense / monthlyIncome * 100 : 0;
  const monthlyNet = monthlyIncome - monthlyExpense;

  // ── Yatırım portföyü ──
  const pf = holdings.map((h) => {
    const val = h.quantity * h.price, cost = h.quantity * h.avgCost;
    return { name: h.name, type: h.type, val, pl: val - cost, plPct: cost ? (val - cost) / cost * 100 : 0 };
  });
  const pfValue = pf.reduce((s, h) => s + h.val, 0);
  const pfPL = pf.reduce((s, h) => s + h.pl, 0);
  const pfLines = pf.length ? pf.sort((a, b) => b.val - a.val).map((h) => `  ${h.name} (${h.type}): değer ${fmt(h.val)} TL, K/Z ${h.pl >= 0 ? "+" : ""}${fmt(h.pl)} (%${h.plPct.toFixed(1)})`).join("\n") : "  (yok)";

  // ── Hedefler ──
  const goalLines = goals.length ? goals.map((g) => {
    const pct = g.target ? g.saved / g.target * 100 : 0;
    return `  ${g.name}: ${fmt(g.saved)}/${fmt(g.target)} TL (%${pct.toFixed(0)})${g.deadline ? `, hedef ${g.deadline}` : ""}`;
  }).join("\n") : "  (yok)";

  // ── Net değer trendi (snapshot) ──
  const snapSorted = [...snapshots].sort((a, b) => a.ym.localeCompare(b.ym));
  const nwTrend = snapSorted.length >= 2
    ? `İlk kayıt ${snapSorted[0].ym}: ${fmt(snapSorted[0].netWorth)} TL → bugün: ${fmt(netWorth)} TL (${snapSorted.length} aylık kayıt)`
    : "Henüz yeterli geçmiş kayıt yok (trend için en az 2 ay gerekli)";

  const accLines = accounts.map((a) => `  ${a.name} (${a.type}): ${fmt(a.balance)} TL${a.limit ? ` / limit ${fmt(a.limit)}` : ""}`).join("\n");
  const debtLines = debts.map((d) => `  ${d.name}: kalan ${fmt(d.remaining)} TL, aylık taksit ${fmt(d.monthly || 0)}, faiz %${d.rate || 0}/ay`).join("\n");
  const monthLines = months.map((mm) => `  ${mm.name}: gelir ${fmt(mm.inc)}, gider ${fmt(mm.exp)}, net ${fmt(mm.net)}`).join("\n");

  // ── Bu ayın en büyük 5 harcaması ──
  const bigExp = transactions.filter((t) => new Date(t.date) >= mStart && !isLeg(t) && !isDebtPay(t) && t.amount < 0)
    .sort((a, b) => a.amount - b.amount).slice(0, 5)
    .map((t) => `  ${t.name}: ${fmt(-t.amount)} TL (${new Date(t.date).toLocaleDateString("tr-TR")})`).join("\n");

  // ── Kategori bazlı bu ay vs önceki ay sapma (anomali) ──
  const pmStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const pmEnd = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);
  const pmCat = {};
  transactions.filter((t) => { const d = new Date(t.date); return d >= pmStart && d <= pmEnd && !isLeg(t) && !isDebtPay(t) && t.amount < 0; })
    .forEach((t) => { const c = APP_DATA.categories.find((x) => x.id === t.category); pmCat[c?.label || t.category] = (pmCat[c?.label || t.category] || 0) + -t.amount; });
  const anomalies = Object.entries(catMap).map(([k, v]) => {
    const prev = pmCat[k] || 0;
    const chg = prev ? (v - prev) / prev * 100 : (v > 0 ? 100 : 0);
    return { k, v, prev, chg };
  }).filter((a) => Math.abs(a.chg) >= 30 && a.v > 500).sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg)).slice(0, 4);
  const anomalyLines = anomalies.length
    ? anomalies.map((a) => `  ${a.k}: bu ay ${fmt(a.v)} TL, geçen ay ${fmt(a.prev)} TL (${a.chg >= 0 ? "+" : ""}${a.chg.toFixed(0)}%)`).join("\n")
    : "  (belirgin sapma yok)";

  // ── Geçen ay kategori tablosu (tam) ──
  const pmCatLines = Object.entries(pmCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${fmt(v)} TL`).join("\n");

  // ── Bütçe vs gerçekleşen (bu ay) ──
  const budgetLines = (budgets || []).map((b) => {
    const cat = APP_DATA.categories.find((c) => c.id === b.category);
    const spent = catMap[cat?.label || b.category] || 0;
    const pctB = b.limit ? spent / b.limit * 100 : 0;
    return `  ${cat?.label || b.category}: bütçe ${fmt(b.limit)}, harcanan ${fmt(spent)} (%${pctB.toFixed(0)})${pctB > 100 ? " — AŞILDI" : pctB > 85 ? " — sınıra yakın" : ""}`;
  }).join("\n");

  // ── Yaklaşan planlı ödemeler (30 gün) ──
  const in30 = new Date(today); in30.setDate(today.getDate() + 30);
  const in30Key = localYMD(in30);
  const todayK = localYMD(today);
  const schLines = (scheduled || []).filter((s) => s.active && s.nextDate >= todayK && s.nextDate <= in30Key)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
    .map((s) => {
      let amt = s.amount;
      if (s.kind === "card" && s.payMode && s.payMode !== "fixed") {
        const c = accounts.find((a) => a.id === s.cardId);
        const owed = c ? Math.max(0, -c.balance) : 0;
        amt = -(s.payMode === "full" ? owed : (owed > 0 ? Math.max(Math.round(owed * 0.2), Math.min(owed, 100)) : 0));
      }
      return `  ${s.nextDate}: ${s.name} ${amt >= 0 ? "+" : ""}${fmt(amt)} TL (${s.frequency === "monthly" ? "aylık" : s.frequency === "weekly" ? "haftalık" : s.frequency === "yearly" ? "yıllık" : "tek sefer"})`;
    }).join("\n");

  // ── Son işlemler (20 adet, transfer bacakları hariç) ──
  const recentTx = transactions.filter((t) => !isLeg(t))
    .slice(0, 20)
    .map((t) => {
      const c = APP_DATA.categories.find((x) => x.id === t.category);
      return `  ${new Date(t.date).toLocaleDateString("tr-TR")}: ${t.name} ${t.amount >= 0 ? "+" : ""}${fmt(t.amount)} TL [${isDebtPay(t) ? "borç ödemesi" : c?.label || "Diğer"}]`;
    }).join("\n");

  return `KULLANICININ FİNANSAL DURUMU (bugün: ${today.toLocaleDateString("tr-TR")}), tüm tutarlar TL:

═══ BİLANÇO ÖZETİ ═══
- Likit nakit (varlık): ${fmt(liquidCash)}
- Yatırım portföyü değeri: ${fmt(pfValue)}
- Toplam varlık: ${fmt(liquidCash + pfValue)}
- Kredi kartı borcu: ${fmt(cardDebt)}
- Kredi borçları: ${fmt(loanDebt)}
- Toplam yükümlülük: ${fmt(totalDebt)}
- NET DEĞER (özkaynak): ${fmt(liquidCash + pfValue - totalDebt)}

═══ GELİR TABLOSU (aylık ortalama) ═══
- Ortalama aylık gelir: ${fmt(monthlyIncome)}
- Ortalama aylık gider: ${fmt(monthlyExpense)}
- Aylık net (faaliyet farkı): ${fmt(monthlyNet)}
- Aylık faiz yükü (taşıma maliyeti): ${fmt(carryingMo)} (yıllık ${fmt(carryingMo * 12)})

═══ FİNANSAL ORANLAR ═══
- Tasarruf oranı: %${savingsRate.toFixed(1)} (hedef >%20)
- Gider/gelir oranı: %${expenseRatio.toFixed(1)}
- Borç servis oranı (DSR): %${dsr.toFixed(1)} (sağlıklı <%30, riskli >%43)
- Kredi kartı kullanımı: %${cardUtil.toFixed(0)} (ideal <%30)
- Kaldıraç (borç/likit): ${leverage === null ? "∞ (likit yok)" : leverage.toFixed(1) + "x"}
- Faiz karşılama oranı: ${interestCoverage === null ? "—" : interestCoverage.toFixed(1) + "x"}
- Likidite tamponu (acil fon): ${emergencyMonths.toFixed(1)} ay (hedef 3-6 ay)

═══ HESAPLAR ═══
${accLines || "  (yok)"}

═══ KREDİLER & BORÇLAR ═══
${debtLines || "  (yok)"}

═══ YATIRIM PORTFÖYÜ (toplam K/Z: ${pfPL >= 0 ? "+" : ""}${fmt(pfPL)} TL) ═══
${pfLines}

═══ BİRİKİM HEDEFLERİ ═══
${goalLines}

═══ SON 6 AY (gelir/gider/net) ═══
${monthLines}

═══ NET DEĞER TRENDİ ═══
${nwTrend}

═══ BU AY KATEGORİ HARCAMALARI ═══
${catLines || "  (henüz yok)"}

═══ BU AYIN EN BÜYÜK HARCAMALARI ═══
${bigExp || "  (yok)"}

═══ KATEGORİ SAPMALARI (bu ay vs geçen ay, ≥%30 değişim) ═══
${anomalyLines}

═══ GEÇEN AY KATEGORİ HARCAMALARI ═══
${pmCatLines || "  (kayıt yok)"}

═══ BÜTÇE vs GERÇEKLEŞEN (bu ay) ═══
${budgetLines || "  (bütçe tanımlı değil)"}

═══ YAKLAŞAN PLANLI ÖDEMELER (30 gün) ═══
${schLines || "  (yok)"}

═══ SON 20 İŞLEM ═══
${recentTx || "  (yok)"}`;
}

// ── Doğal dil soru-cevap ──
const AI_SUGGESTIONS = [
  "Genel finansal sağlığımı değerlendir",
  "Borç mu kapatmalıyım yatırım mı yapmalıyım?",
  "Enflasyona karşı param eriyor mu?",
  "Acil durumda kaç ay dayanırım?",
  "Bütçemde en zayıf nokta nerede?",
];

function AIAssistant({ ctx }) {
  const [q, setQ] = useStateAI("");
  const [thread, setThread] = useStateAI([]); // {role:'user'|'assistant', content}
  const [loading, setLoading] = useStateAI(false);
  const [error, setError] = useStateAI("");
  const scrollRef = useRefAI(null);

  const ask = async (question) => {
    const text = (question || q).trim();
    if (!text || loading) return;
    const history = [...thread, { role: "user", content: text }];
    setThread(history); setQ(""); setLoading(true); setError("");
    try {
      if (!window.keseAI.hasProvider()) throw new Error("no-key");
      const context = buildFinanceContext(ctx);
      const sys = `Sen Kese+ uygulamasının baş ekonomisti ve kişisel finans danışmanısın. Profilin: makroekonomi, kişisel finans, davranışsal ekonomi ve yatırım teorisi konularında derin bilgili; bir bankanın özel bankacılık danışmanı gibi pratik ve net. Kullanıcı kendini "Şahsi A.Ş." olarak yönetiyor.

UZMANLIK & YAKLAŞIM:
- Gerçek ekonomik kavramları doğru kullan: tasarruf oranı, borç servis oranı (DSR), kaldıraç, faiz karşılama, likidite tamponu, fırsat maliyeti, bileşik faiz, reel getiri (enflasyon düzeltmeli), net bugünkü değer, çığ/kartopu borç stratejisi.
- Türkiye bağlamını bil: yüksek enflasyonda nakit tutmanın reel kaybı, TL mevduat/döviz/altın dengesi, kredi kartı faizlerinin bileşik etkisi.
- Veriyi sadece okuma — yorumla, neden-sonuç kur, öncelik sırası ver.
- Genelgeçer tavsiye verme; KULLANICININ rakamlarına dayan, her iddiayı bir sayıyla destekle.
- Bu bir DEVAM EDEN SOHBET — önceki mesajlara atıfta bulun, "bunu detaylandır / peki ya" gibi takip sorularını bağlamıyla anla.

KURALLAR:
- Türkçe, profesyonel ama anlaşılır. Jargonu açıkla.
- Odaklı ve KISA tut: en fazla 5-6 cümle veya birkaç madde. Uzun raporlar yerine net, eyleme dönük cevap.
- Biçim: kısa paragraf veya "•" maddeler. Çok satırlı tablo KULLANMA (en fazla 3 satırlık küçük tablo). Markdown başlık (#) kullanma.
- Somut TL rakamları ver. Veride olmayanı UYDURMA; eksikse "bu veriyi göremiyorum" de.
- Durum kötüyse yumuşatma ama panik yaratma; eyleme dönük ol.
- Yatırımda "kesin al/sat" deme; olasılık ve riski çerçevele.

═══════════ GÜNCEL FİNANSAL VERİLER ═══════════
${context}`;
      const messages = [
        { role: "user", content: sys + "\n\nBu verilere hakimsin. Şimdi kullanıcının sorularını yanıtla. İlk soru aşağıda." },
        { role: "assistant", content: "Anladım, verilerine tümüyle hakimim. Sorunu dinliyorum." },
        ...history.slice(-8),
      ];
      const res = await window.keseAI.complete({ messages });
      setThread((prev) => [...prev, { role: "assistant", content: (res || "").trim() || "Yanıt alınamadı." }]);
    } catch (e) {
      setError(window.keseAIErrorText(e));
      setThread((prev) => prev.filter((_, i) => i !== prev.length - 1 || prev[i].role !== "user" || i < prev.length - 1));
    } finally {
      setLoading(false);
    }
  };

  useEffectAI(() => { if (scrollRef.current) scrollRef.current.scrollIntoView({ block: "nearest" }); }, [thread, loading]);

  return (
    <Card title="Ekonomist danışman" subtitle="Verilerine hakim · sohbet et, takip soruları sor" action={
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {thread.length > 0 && <button className="ai-clear" onClick={() => { setThread([]); setError(""); }} title="Sohbeti temizle"><Icon name="trash" size={13} /></button>}
        <span className="ai-badge"><Icon name="sparkles" size={12} />AI</span>
      </div>
    }>
      {thread.length === 0 && !loading && (
        <div className="ai-suggest">
          {AI_SUGGESTIONS.map((s) => (
            <button key={s} className="ai-chip" onClick={() => ask(s)}>{s}</button>
          ))}
        </div>
      )}

      {(thread.length > 0 || loading || error) && (
        <div className="ai-thread">
          {thread.map((m, i) => (
            m.role === "user"
              ? <div key={i} className="ai-q"><Icon name="search" size={13} />{m.content}</div>
              : <div key={i} className="ai-answer">{renderRich(m.content)}</div>
          ))}
          {loading && <div className="ai-loading"><span className="ai-spin ai-spin-dark" />Veriler analiz ediliyor…</div>}
          {error && <div className="ai-error"><Icon name="info" size={14} />{error}</div>}
          <div ref={scrollRef} />
        </div>
      )}

      <div className="ai-input-row" style={{ marginTop: thread.length > 0 ? 14 : 12 }}>
        <input
          type="text"
          className="ai-input"
          placeholder={thread.length > 0 ? "Takip sorusu sor… (örn. bunu detaylandır)" : "örn. Borç mu kapatayım yatırım mı yapayım?"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") ask(); }}
          disabled={loading}
        />
        <button className="btn btn-primary btn-md ai-send" onClick={() => ask()} disabled={loading || !q.trim()}>
          {loading ? <span className="ai-spin" /> : <Icon name="arrowRight" size={16} />}
        </button>
      </div>
    </Card>
  );
}

// ── Otomatik aylık CFO raporu ──
function MonthlyCFOReport({ ctx }) {
  const [report, setReport] = useStateAI("");
  const [loading, setLoading] = useStateAI(false);
  const [error, setError] = useStateAI("");
  const today = appToday();
  const TRM = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
  const monthLabel = `${TRM[today.getMonth()]} ${today.getFullYear()}`;
  const cacheKey = `kese_cfo_report_${today.getFullYear()}_${today.getMonth()}`;
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const isMonthEnd = today.getDate() >= daysInMonth - 2; // ayın son 3 günü

  useEffectAI(() => {
    let cached = null;
    try { cached = localStorage.getItem(cacheKey); } catch (e) {}
    if (cached) { setReport(cached); return; }
    // Ay sonuysa ve bu ay için rapor yoksa otomatik üret
    if (isMonthEnd && window.keseAI.hasProvider()) {
      const t = setTimeout(() => generate(true), 400);
      return () => clearTimeout(t);
    }
  }, [cacheKey]);

  const generate = async (auto) => {
    if (loading) return;
    setLoading(true); setError("");
    try {
      if (!window.keseAI.hasProvider()) throw new Error("no-key");
      const context = buildFinanceContext(ctx);
      const prompt = `Sen "Şahsi A.Ş."nin baş ekonomisti ve CFO'susun — makroekonomi, kişisel finans ve risk yönetimi konusunda uzman. Aşağıdaki gerçek verilere dayanarak ${monthLabel} için profesyonel bir AYLIK YÖNETİCİ ÖZETİ yaz. Türkçe, kurumsal rapor tonunda ama anlaşılır. Yapı:
1) Tek cümlelik genel mali durum değerlendirmesi (bir kredi notu/derecelendirme hissi ver).
2) En önemli 3 gözlem — somut rakamlarla ve ekonomik yorumla (örn. tasarruf oranı, DSR, faiz yükü, net değer trendi, reel kayıp). Sadece rakamı söyleme, ne anlama geldiğini açıkla.
3) Bu ay için öncelik sıralı 2 net aksiyon — neden o sırada olduğunu belirt (örn. en yüksek faizli borç önce).
Toplam 6-8 cümle. Markdown BAŞLIK (#) ve TABLO kullanma — düz paragraf + gerekiyorsa "•" madde. Kalın için **...** kullanabilirsin. Türkiye'nin yüksek enflasyon bağlamını dikkate al. Veride olmayanı uydurma.

${context}

${monthLabel} YÖNETİCİ ÖZETİ:`;
      const res = await window.keseAI.complete({ messages: [{ role: "user", content: prompt }] });
      const txt = (res || "").trim();
      setReport(txt);
      try { localStorage.setItem(cacheKey, txt); } catch (e) {}
    } catch (e) {
      setError(window.keseAIErrorText(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card
      title={`${monthLabel} · CFO raporu`}
      subtitle="Şahsi A.Ş. yönetici özeti · yapay zekâ"
      action={
        <button className="btn btn-ghost btn-sm" onClick={() => generate(false)} disabled={loading}>
          {loading ? <span className="ai-spin ai-spin-dark" /> : <Icon name="sparkles" size={14} />}
          {report ? "Yenile" : "Rapor üret"}
        </button>
      }
    >
      {!report && !loading && !error && (
        <div className="cfo-rep-empty">
          <div className="cfo-rep-ic"><Icon name="building" size={22} /></div>
          <div className="cfo-rep-t">{isMonthEnd ? "Ay sonu raporu hazırlanıyor…" : "Aylık yönetici özeti hazır değil"}</div>
          <p className="cfo-rep-d">{isMonthEnd
            ? `Bugün ay sonu — ${monthLabel} yönetici özetin otomatik üretiliyor. Birkaç saniye sürebilir.`
            : `Her ayın sonunda otomatik yayınlanır. Şimdi görmek istersen "Rapor üret"e bas — yapay zekâ ${monthLabel} verilerini bir CFO gözüyle analiz etsin.`}</p>
        </div>
      )}
      {loading && <div className="ai-loading"><span className="ai-spin ai-spin-dark" />CFO raporu hazırlanıyor…</div>}
      {error && <div className="ai-error"><Icon name="info" size={14} />{error}</div>}
      {report && (
        <div className="cfo-rep">
          <div className="cfo-rep-body">{renderRich(report)}</div>
          <div className="cfo-rep-foot"><Icon name="info" size={12} />Yapay zekâ tarafından verilerinden üretildi · finansal tavsiye değildir</div>
        </div>
      )}
    </Card>
  );
}

Object.assign(window, { AIAssistant, MonthlyCFOReport });
