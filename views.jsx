// Views: Dashboard, Transactions, Budget, Reports, Debts
// ────────────────────────────────────────────────────────

const { useState: useStateV, useMemo: useMemoV, useEffect: useEffectV } = React;

const TR_MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const TR_MONTHS_SHORT = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

// "YYYY-MM-DD" anahtarını YEREL tarih olarak ayrıştır (UTC kayması yok); tam ISO ise olduğu gibi
function parseLocalDate(s) {
  if (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(s);
}
function fmtDate(iso) {
  const d = parseLocalDate(iso);
  return `${d.getDate()} ${TR_MONTHS_SHORT[d.getMonth()]}`;
}
function fmtDateLong(iso) {
  const d = parseLocalDate(iso);
  return `${d.getDate()} ${TR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function relDay(iso) {
  const d = parseLocalDate(iso);
  const today = appToday();
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((b - a) / 86400000);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Dün";
  if (diff > 1 && diff < 7) return `${diff} gün önce`;
  return fmtDate(iso);
}

// Bir işlem transfer/kart-ödeme bacağı mı? (global isTransferLeg data.js'te)
// Transfer/kart-ödeme çiftlerini tek satıra indir (çift kayıt görünmesin, gelir/gider şişmesin)
function collapseTransfers(items, accounts) {
  const used = new Set();
  const result = [];
  const findLeg = (ts, dir) => items.find((t) => !used.has(t.id) && new RegExp(`-${dir}-${ts}$`).test(t.id));
  for (const t of items) {
    if (used.has(t.id)) continue;
    const m = t.id && t.id.match(/^tx-(?:cardpay-|cardadv-)?(out|in)-(\d+)$/);
    if (m) {
      const dir = m[1], ts = m[2];
      const other = findLeg(ts, dir === "out" ? "in" : "out");
      if (other) {
        const outLeg = dir === "out" ? t : other;
        const inLeg = dir === "out" ? other : t;
        used.add(t.id); used.add(other.id);
        const fromAcc = (accounts || []).find((a) => a.id === outLeg.account);
        const toAcc = (accounts || []).find((a) => a.id === inLeg.account);
        result.push({
          kind: "transfer",
          id: outLeg.id,
          pairIds: [outLeg.id, inLeg.id],
          name: `${fromAcc?.name || "?"} → ${toAcc?.name || "?"}`,
          note: outLeg.note || "Transfer",
          amount: Math.abs(outLeg.amount),
          date: outLeg.date,
          category: outLeg.category || "diger",
        });
        continue;
      }
    }
    result.push(t);
  }
  return result;
}

// Derive monthly income/expense/net series from a transaction list
function deriveMonthly(transactions, monthsBack, refDate) {
  const out = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(refDate.getFullYear(), refDate.getMonth() - i, 1);
    const start = d;
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    const txs = transactions.filter((t) => {
      const dt = new Date(t.date);
      return dt >= start && dt <= end;
    });
    // Gelir/gider: transfer ve borç ödemelerini hariç tut (kategori bazlı temiz kalsın)
    const income = txs.filter((t) => !isTransferLeg(t) && !isDebtPayment(t) && t.amount > 0).reduce((s, t) => s + t.amount, 0);
    const expense = -txs.filter((t) => !isTransferLeg(t) && !isDebtPayment(t) && t.amount < 0).reduce((s, t) => s + t.amount, 0);
    // Borç/kart anapara ödemeleri: gider değil ama nakitten çıktı → net birikimden düşülür
    const debtPaid = txs.filter((t) => isDebtPayment(t)).reduce((s, t) => s + Math.abs(t.amount), 0);
    out.push({ label: TR_MONTHS_SHORT[d.getMonth()], year: d.getFullYear(), month: d.getMonth(), income, expense, debtPaid, net: income - expense - debtPaid });
  }
  return out;
}

// Cumulative savings curve from monthly net (starts at 0, honest about period)
function deriveSavingsCurve(monthly) {
  let running = 0;
  return monthly.map((m) => { running += m.net; return { label: m.label, value: running }; });
}

// ════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════
function DashboardView({ ctx }) {
  const { showBalances, setShowBalances, onNavigate, onAddTransaction, transactions, accounts, scheduled } = ctx;
  const realTx = transactions.filter((t) => !isTransferLeg(t));
  const d = { ...APP_DATA, transactions: realTx, accounts };
  const today = appToday();

  // current month
  const curMonth = monthRange(today);
  const monthTx = transactions.filter((t) => {
    const dt = new Date(t.date);
    return dt >= curMonth.start && dt <= curMonth.end;
  });
  const monthIn = monthTx.filter((t) => !isTransferLeg(t) && !isDebtPayment(t) && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const monthOut = -monthTx.filter((t) => !isTransferLeg(t) && !isDebtPayment(t) && t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const monthDebtPaid = monthTx.filter((t) => isDebtPayment(t)).reduce((s, t) => s + Math.abs(t.amount), 0);
  const monthNet = monthIn - monthOut - monthDebtPaid;

  // Previous month for deltas
  const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 15);
  const prevRange = monthRange(prevMonth);
  const prevMonthTx = transactions.filter((t) => {
    const dt = new Date(t.date);
    return dt >= prevRange.start && dt <= prevRange.end;
  });
  const prevIn = prevMonthTx.filter((t) => !isTransferLeg(t) && !isDebtPayment(t) && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const prevOut = -prevMonthTx.filter((t) => !isTransferLeg(t) && !isDebtPayment(t) && t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const inDelta = prevIn ? ((monthIn - prevIn) / prevIn) * 100 : null;
  const outDelta = prevOut ? ((monthOut - prevOut) / prevOut) * 100 : null;
  const fmtTrend = (v) => v === null ? "Yeni başlangıç" : `${v >= 0 ? "+" : ""}%${v.toFixed(1)} önceki aya göre`;

  const totalCash = d.accounts.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0);
  const ccDebt = -d.accounts.filter((a) => a.balance < 0).reduce((s, a) => s + a.balance, 0);
  const liquidNet = totalCash - ccDebt;

  // category breakdown this month (expenses)
  const byCat = {};
  monthTx.forEach((t) => {
    if (t.amount < 0 && !isTransferLeg(t) && !isDebtPayment(t)) {
      byCat[t.category] = (byCat[t.category] || 0) + -t.amount;
    }
  });
  const catSegs = Object.entries(byCat).
  map(([id, v]) => {
    const c = d.categories.find((x) => x.id === id);
    return { label: c.label, value: v, color: c.color, id };
  }).
  sort((a, b) => b.value - a.value);

  const top5 = catSegs.slice(0, 5);

  // Derived monthly series + cumulative savings curve from live transactions
  const monthlySeries = deriveMonthly(transactions, 12, today);
  const savingsCurve = deriveSavingsCurve(monthlySeries);
  const totalSaved = savingsCurve[savingsCurve.length - 1]?.value || 0;

  // recent transactions (5)
  const recent = d.transactions.slice(0, 6);

  // Upcoming scheduled payments (next 14 days)
  const todayKey = localYMD(today);
  const in14 = new Date(today); in14.setDate(today.getDate() + 14);
  const in14Key = localYMD(in14);
  const upcoming = (scheduled || [])
    .filter((s) => s.active && s.nextDate >= todayKey && s.nextDate <= in14Key)
    .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
    .map((s) => {
      let amt = s.amount;
      if (s.kind === "card" && s.payMode && s.payMode !== "fixed") {
        const c = accounts.find((a) => a.id === s.cardId);
        const owed = c ? Math.max(0, -c.balance) : 0;
        amt = -(s.payMode === "full" ? owed : (owed > 0 ? Math.max(Math.round(owed * 0.20), Math.min(owed, 100)) : 0));
      }
      return { date: s.nextDate, name: s.name, note: s.autopay ? "Otomatik" : "Manuel", amount: amt, category: s.category };
    });

  return (
    <div className="view view-dash">
      {/* Greeting + actions */}
      <div className="page-head">
        <div>
          <h1 className="page-title">Merhaba 👋</h1>
          <p className="page-sub">İşte bu ayki finansal durumun · {TR_MONTHS[today.getMonth()]} {today.getFullYear()}</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-md" onClick={() => setShowBalances(!showBalances)}>
            <Icon name={showBalances ? "eye" : "eyeOff"} size={16} />
            {showBalances ? "Bakiyeleri gizle" : "Bakiyeleri göster"}
          </button>
          <button className="btn btn-primary btn-md" onClick={onAddTransaction}>
            <Icon name="plus" size={16} />
            İşlem ekle
          </button>
        </div>
      </div>

      {/* Hero stats */}
      <div className="dash-hero">
        <div className="hero-main">
          <div className="hero-label">Toplam likit varlık</div>
          <div className="hero-amount">
            <Money value={liquidNet} size="xl" sign="neutral" hide={!showBalances} />
          </div>
          <div className="hero-meta">
            {d.accounts.length > 0 ? (
              <>
                {monthNet !== 0 && (
                  <span className={`chip ${monthNet >= 0 ? "chip-pos" : "chip-neg"}`}>
                    <Icon name={monthNet >= 0 ? "arrowUp" : "arrowDown"} size={12} />
                    {monthNet >= 0 ? "+" : "−"}₺{APP_DATA.fmtShort(Math.abs(monthNet))} bu ay
                  </span>
                )}
                <span className="hero-sub">Nakit ₺{APP_DATA.fmtShort(totalCash)} − kart borcu ₺{APP_DATA.fmtShort(ccDebt)}</span>
              </>
            ) : (
              <span className="hero-sub">Başlamak için bir hesap ekle</span>
            )}
          </div>
          <div className="hero-spark">
            <Sparkline values={savingsCurve.map((x) => x.value)} color="var(--accent)" height={56} />
          </div>
        </div>

        <div className="hero-grid">
          <div className="hero-mini">
            <div className="hero-mini-icon" style={{ background: "rgba(34,197,94,0.12)", color: "var(--pos)" }}>
              <Icon name="arrowDown" size={16} />
            </div>
            <div className="hero-mini-label">Bu ay gelir</div>
            <div className="hero-mini-val"><Money value={monthIn} sign="neutral" hide={!showBalances} /></div>
            <div className="hero-mini-trend pos">{fmtTrend(inDelta)}</div>
          </div>
          <div className="hero-mini">
            <div className="hero-mini-icon" style={{ background: "rgba(239,68,68,0.12)", color: "var(--neg)" }}>
              <Icon name="arrowUp" size={16} />
            </div>
            <div className="hero-mini-label">Bu ay gider</div>
            <div className="hero-mini-val"><Money value={monthOut} sign="neutral" hide={!showBalances} /></div>
            <div className="hero-mini-trend neg">{fmtTrend(outDelta)}</div>
          </div>
          <div className="hero-mini">
            <div className="hero-mini-icon" style={{ background: "rgba(14,165,233,0.12)", color: "#0ea5e9" }}>
              <Icon name="sparkles" size={16} />
            </div>
            <div className="hero-mini-label">Bu ay net nakit akışı</div>
            <div className="hero-mini-val"><Money value={monthNet} sign="neutral" hide={!showBalances} /></div>
            <div className={`hero-mini-trend ${monthNet >= 0 ? "pos" : "neg"}`}>{monthIn > 0 ? `Gelir − gider − borç ödemesi` : "—"}</div>
          </div>
        </div>
      </div>

      {/* Accounts */}
      <Card
        title="Hesaplar ve kartlar"
        action={<a className="link" onClick={() => onNavigate("hesaplar")}>Tümünü yönet <Icon name="chevronRight" size={14} /></a>}>
        
        <div className="accounts-row">
          {d.accounts.map((a) =>
          <div key={a.id} className="acc-card">
              <div className="acc-card-h">
                <div className="acc-dot" style={{ background: a.color }} />
                <div className="acc-name">
                  <div className="acc-name-t">{a.name}</div>
                  <div className="acc-name-st">{a.type}</div>
                </div>
                <Icon name={a.type.includes("Kart") ? "card" : a.type.includes("Cüzdan") ? "wallet" : "wallet"} size={16} />
              </div>
              <div className="acc-num">{a.number}</div>
              <div className="acc-bal">
                <Money value={a.balance} sign={a.balance < 0 ? "auto" : "neutral"} hide={!showBalances} />
              </div>
              {a.limit &&
            <>
                  <div className="acc-limit-row">
                    <span>Kullanılan</span>
                    <span>%{Math.round(-a.balance / a.limit * 100)}</span>
                  </div>
                  <Progress value={-a.balance} max={a.limit} color={a.color} height={4} />
                </>
            }
            </div>
          )}
          <button className="acc-card acc-card-add" onClick={() => onNavigate("hesaplar")}>
            <Icon name="plus" size={22} />
            <span>Hesap ekle</span>
          </button>
        </div>
      </Card>

      {/* Two-col: cashflow + breakdown */}
      <div className="grid-2col">
        <Card
          title="Gelir / gider akışı"
          subtitle="Son 12 ay"
          action={
          <div className="legend">
              <span className="legend-item"><span className="legend-dot" style={{ background: "var(--pos)" }} />Gelir</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: "var(--neg)" }} />Gider</span>
            </div>
          }>
          
          <BarChart
            data={monthlySeries.map((m) => ({
              label: m.label,
              values: [m.income, m.expense],
              colors: ["var(--pos)", "var(--neg)"]
            }))}
            height={280}
            seriesLabels={["Gelir", "Gider"]} />
          
        </Card>

        <Card
          title="Bu ay harcama dağılımı"
          subtitle={`Toplam ${APP_DATA.fmt(monthOut)} ₺`}>
          
          <div className="donut-row">
            <Donut
              segments={catSegs}
              size={200}
              thickness={26}
              center={
              <div className="donut-center-inner">
                  <div className="donut-c-label">Toplam</div>
                  <div className="donut-c-val">₺{APP_DATA.fmtShort(monthOut)}</div>
                </div>
              } />
            
            <ul className="cat-list">
              {top5.map((s) =>
              <li key={s.id}>
                  <span className="cat-dot" style={{ background: s.color }} />
                  <span className="cat-name">{s.label}</span>
                  <span className="cat-val mono">₺{APP_DATA.fmt(s.value)}</span>
                  <span className="cat-pct">%{Math.round(s.value / monthOut * 100)}</span>
                </li>
              )}
            </ul>
          </div>
        </Card>
      </div>

      {/* Recent + upcoming */}
      <div className="grid-2col">
        <Card
          title="Son işlemler"
          action={<a className="link" onClick={() => onNavigate("islemler")}>Tümünü gör <Icon name="chevronRight" size={14} /></a>}
          padded={false}>
          
          <ul className="tx-list">
            {recent.map((t) => <TxRow key={t.id} t={t} hide={!showBalances} />)}
          </ul>
        </Card>

        <Card title="Yaklaşan ödemeler" subtitle="Önümüzdeki 14 gün" padded={false}>
          <ul className="tx-list">
            {upcoming.map((t, i) =>
            <li key={i} className="tx-row">
                <div className="tx-date-col">
                  <div className="tx-day">{new Date(t.date).getDate()}</div>
                  <div className="tx-mon">{TR_MONTHS_SHORT[new Date(t.date).getMonth()]}</div>
                </div>
                <div className="tx-main">
                  <div className="tx-name">{t.name}</div>
                  <div className="tx-meta"><CategoryPill catId={t.category} /> <span className="dot-sep">·</span> {t.note}</div>
                </div>
                <div className="tx-amt"><Money value={t.amount} sign="auto" hide={!showBalances} /></div>
              </li>
            )}
          </ul>
          <div className="card-foot">
            <div className="upc-total">
              <span>14 günlük toplam</span>
              <Money value={upcoming.reduce((s, x) => s + x.amount, 0)} sign="auto" hide={!showBalances} />
            </div>
          </div>
        </Card>
      </div>
    </div>);

}

function monthRange(d) {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
  return { start, end };
}

function TxRow({ t, hide, dense }) {
  const cat = APP_DATA.categories.find((c) => c.id === t.category);
  return (
    <li className={`tx-row ${dense ? "tx-row-dense" : ""}`}>
      <div className="tx-icon-col" style={{ background: `${cat.color}22`, color: cat.color }}>
        <span className="tx-icon-letter">{t.name[0]}</span>
      </div>
      <div className="tx-main">
        <div className="tx-name">{t.name}</div>
        <div className="tx-meta">
          <CategoryPill catId={t.category} />
          <span className="dot-sep">·</span>
          {relDay(t.date)}
        </div>
      </div>
      <div className="tx-amt">
        <Money value={t.amount} sign="auto" hide={hide} />
      </div>
    </li>);

}

// ════════════════════════════════════════════════════════
// TRANSACTIONS
// ════════════════════════════════════════════════════════
function TransactionsView({ ctx }) {
  const { showBalances, onAddTransaction, transactions, accounts, removeTransaction, updateTransaction } = ctx;
  const [editTx, setEditTx] = useStateV(null);
  const [catMgrOpen, setCatMgrOpen] = useStateV(false);
  const [q, setQ] = useStateV("");
  useEffectV(() => {
    if (ctx.globalQuery) { setQ(ctx.globalQuery); ctx.setGlobalQuery && ctx.setGlobalQuery(""); }
  }, [ctx.globalQuery]);
  const [catFilter, setCatFilter] = useStateV("all");
  const [typeFilter, setTypeFilter] = useStateV("all");
  const [accountFilter, setAccountFilter] = useStateV("all");

  const filtered = useMemoV(() => {
    return transactions.filter((t) => {
      if (q && !t.name.toLowerCase().includes(q.toLowerCase())) return false;
      if (catFilter !== "all" && t.category !== catFilter) return false;
      // Transferler/kart ödemeleri gelir veya gider değildir — bu filtrelerde gösterme
      if ((typeFilter === "income" || typeFilter === "expense") && isTransferLeg(t)) return false;
      if (typeFilter === "income" && t.amount < 0) return false;
      if (typeFilter === "expense" && t.amount > 0) return false;
      if (accountFilter !== "all" && t.account !== accountFilter) return false;
      return true;
    });
  }, [q, catFilter, typeFilter, accountFilter, transactions]);

  // Group by date
  const grouped = useMemoV(() => {
    const collapsed = collapseTransfers(filtered, accounts);
    const map = {};
    collapsed.forEach((t) => {
      const key = localYMD(new Date(t.date));
      if (!map[key]) map[key] = [];
      map[key].push(t);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered, accounts]);

  const visibleTx = useMemoV(() => collapseTransfers(filtered, accounts), [filtered, accounts]);
  const totalIn = visibleTx.filter((t) => t.kind !== "transfer" && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalOut = -visibleTx.filter((t) => t.kind !== "transfer" && t.amount < 0).reduce((s, t) => s + t.amount, 0);

  const exportCsv = () => {
    if (filtered.length === 0) {
      alert("Dışa aktarılacak işlem yok.");
      return;
    }
    const catLabel = (id) => APP_DATA.categories.find(c => c.id === id)?.label || id;
    const accLabel = (id) => ctx.accounts.find(a => a.id === id)?.name || "—";
    const rows = [["Tarih", "İşlem", "Kategori", "Hesap", "Not", "Tutar (₺)"]];
    filtered.forEach(t => {
      rows.push([
        t.date.slice(0, 10),
        t.name,
        catLabel(t.category),
        accLabel(t.account),
        t.note || "",
        APP_DATA.fmt(t.amount),
      ]);
    });
    const csv = "\uFEFF" + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kese-islemler-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="view view-tx">
      <div className="page-head">
        <div>
          <h1 className="page-title">İşlemler</h1>
          <p className="page-sub">Tüm gelir ve giderlerinizi takip edin</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-md" onClick={() => setCatMgrOpen(true)}><Icon name="pie" size={16} />Kategoriler</button>
          <button className="btn btn-ghost btn-md" onClick={exportCsv}><Icon name="download" size={16} />Dışa aktar</button>
          <button className="btn btn-primary btn-md" onClick={onAddTransaction}>
            <Icon name="plus" size={16} />Yeni işlem
          </button>
        </div>
      </div>

      <div className="tx-summary">
        <div className="tx-sum-item">
          <div className="tx-sum-label">Filtrelenmiş gelir</div>
          <div className="tx-sum-val pos"><Money value={totalIn} sign="neutral" hide={!showBalances} /></div>
        </div>
        <div className="tx-sum-divider" />
        <div className="tx-sum-item">
          <div className="tx-sum-label">Filtrelenmiş gider</div>
          <div className="tx-sum-val neg"><Money value={totalOut} sign="neutral" hide={!showBalances} /></div>
        </div>
        <div className="tx-sum-divider" />
        <div className="tx-sum-item">
          <div className="tx-sum-label">Net akış</div>
          <div className="tx-sum-val"><Money value={totalIn - totalOut} sign="auto" hide={!showBalances} /></div>
        </div>
        <div className="tx-sum-divider" />
        <div className="tx-sum-item">
          <div className="tx-sum-label">İşlem sayısı</div>
          <div className="tx-sum-val mono">{filtered.length}</div>
        </div>
      </div>

      <div className="tx-filters">
        <div className="search-input">
          <Icon name="search" size={16} />
          <input
            type="text"
            placeholder="İşlem ara..."
            value={q}
            onChange={(e) => setQ(e.target.value)} />
          
        </div>
        <div className="seg">
          <button className={typeFilter === "all" ? "seg-act" : ""} onClick={() => setTypeFilter("all")}>Tümü</button>
          <button className={typeFilter === "income" ? "seg-act" : ""} onClick={() => setTypeFilter("income")}>Gelir</button>
          <button className={typeFilter === "expense" ? "seg-act" : ""} onClick={() => setTypeFilter("expense")}>Gider</button>
        </div>
        <select className="sel" value={catFilter} onChange={(e) => setCatFilter(e.target.value)}>
          <option value="all">Tüm kategoriler</option>
          {APP_DATA.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select className="sel" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
          <option value="all">Tüm hesaplar</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <div className="tx-table">
        {grouped.length === 0 &&
        <div className="empty-state">
            <Icon name="search" size={28} />
            <div>Sonuç bulunamadı</div>
            <p>Filtreleri temizleyip tekrar deneyin.</p>
          </div>
        }
        {grouped.map(([dateKey, items]) => {
          const dayIn = items.filter((t) => t.kind !== "transfer" && t.amount > 0).reduce((s, t) => s + t.amount, 0);
          const dayOut = -items.filter((t) => t.kind !== "transfer" && t.amount < 0).reduce((s, t) => s + t.amount, 0);
          return (
            <div key={dateKey} className="tx-day-group">
              <div className="tx-day-h">
                <div className="tx-day-h-l">
                  <span className="tx-day-h-date">{fmtDateLong(dateKey)}</span>
                  <span className="tx-day-h-rel">{relDay(dateKey)}</span>
                </div>
                <div className="tx-day-h-r mono">
                  {dayIn > 0 && <span className="pos">+₺{APP_DATA.fmt(dayIn)}</span>}
                  {dayOut > 0 && <span className="neg">−₺{APP_DATA.fmt(dayOut)}</span>}
                </div>
              </div>
              <ul className="tx-list tx-list-table">
                {items.map((t) => {
                  const cat = APP_DATA.categories.find((c) => c.id === t.category) || { color: "#64748b", label: "Diğer" };
                  const acc = accounts.find((a) => a.id === t.account);
                  if (t.kind === "transfer") {
                    return (
                      <li key={t.id} className="tx-row tx-row-table tx-row-transfer">
                        <div className="tx-icon-col" style={{ background: "var(--bg-elev-2)", color: "var(--fg-3)" }}>
                          <Icon name="repeat" size={15} />
                        </div>
                        <div className="tx-main">
                          <div className="tx-name">{t.name}</div>
                          <div className="tx-meta">{t.note}</div>
                        </div>
                        <div className="tx-col-cat"><span className="tx-transfer-pill">Transfer</span></div>
                        <div className="tx-col-acc">—</div>
                        <div className="tx-amt">
                          <span className="tx-transfer-amt mono">⇄ ₺{APP_DATA.fmt(t.amount)}</span>
                        </div>
                        <div className="tx-row-actions">
                          <button className="tx-act-btn tx-act-del" title="Transferi sil" onClick={() => { if (confirm("Bu transferi silmek istiyor musun? Her iki hesabın bakiyesi geri alınır.")) { t.pairIds.forEach((id) => removeTransaction(id)); } }}><Icon name="trash" size={14} /></button>
                        </div>
                      </li>);
                  }
                  return (
                    <li key={t.id} className="tx-row tx-row-table">
                      <div className="tx-icon-col" style={{ background: `${cat.color}22`, color: cat.color }}>
                        <span className="tx-icon-letter">{t.name[0]}</span>
                      </div>
                      <div className="tx-main">
                        <div className="tx-name">{t.name}</div>
                        <div className="tx-meta">
                          {t.note || cat.label}
                        </div>
                      </div>
                      <div className="tx-col-cat"><CategoryPill catId={t.category} /></div>
                      <div className="tx-col-acc">{acc?.name}</div>
                      <div className="tx-amt">
                        <Money value={t.amount} sign="auto" hide={!showBalances} />
                      </div>
                      <div className="tx-row-actions">
                        <button className="tx-act-btn" title="Düzenle" onClick={() => setEditTx(t)}><Icon name="edit" size={14} /></button>
                        <button className="tx-act-btn tx-act-del" title="Sil" onClick={() => { if (confirm(`"${t.name}" işlemini silmek istiyor musun? Hesap bakiyesi otomatik düzeltilir.`)) removeTransaction(t.id); }}><Icon name="trash" size={14} /></button>
                      </div>
                    </li>);

                })}
              </ul>
            </div>);

        })}
      </div>
      <TxEditModal tx={editTx} accounts={accounts} onClose={() => setEditTx(null)} onSave={(patch) => { updateTransaction(editTx.id, patch); setEditTx(null); }} onDelete={() => { if (confirm("Bu işlemi silmek istiyor musun?")) { removeTransaction(editTx.id); setEditTx(null); } }} />
      <CategoryManager open={catMgrOpen} ctx={ctx} onClose={() => setCatMgrOpen(false)} />
    </div>);

}

// İşlem düzenleme modalı
function TxEditModal({ tx, accounts, onClose, onSave, onDelete }) {
  const [type, setType] = useStateV("expense");
  const [name, setName] = useStateV("");
  const [amount, setAmount] = useStateV("");
  const [category, setCategory] = useStateV("market");
  const [account, setAccount] = useStateV("");
  const [note, setNote] = useStateV("");
  const [date, setDate] = useStateV("");

  useEffectV(() => {
    if (tx) {
      setType(tx.amount >= 0 ? "income" : "expense");
      setName(tx.name || "");
      setAmount(String(Math.abs(tx.amount)).replace(".", ","));
      setCategory(tx.category || "market");
      setAccount(tx.account || accounts[0]?.id || "");
      setNote(tx.note || "");
      setDate((tx.date || "").slice(0, 10));
    }
  }, [tx]);

  useEffectV(() => {
    if (!tx) return;
    const onEsc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [tx, onClose]);

  if (!tx) return null;
  const amt = parseFloat(String(amount).replace(/\s/g, "").replace(",", ".")) || 0;
  const canSubmit = name.trim() && amt > 0 && account;

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSave({
      name: name.trim(),
      amount: type === "expense" ? -Math.abs(amt) : Math.abs(amt),
      category, account, note,
      date: date ? new Date(date + "T12:00:00").toISOString() : tx.date,
    });
  };

  return (
    <div className="modal-bd" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="modal-h">
          <div>
            <h2>İşlemi düzenle</h2>
            <p>Tutar, kategori, hesap ve tarihi güncelle</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </header>

        <div className="seg seg-lg" style={{ margin: "4px 24px 0" }}>
          <button type="button" className={type === "expense" ? "seg-act" : ""} onClick={() => setType("expense")}><Icon name="arrowUp" size={14} />Gider</button>
          <button type="button" className={type === "income" ? "seg-act" : ""} onClick={() => setType("income")}><Icon name="arrowDown" size={14} />Gelir</button>
        </div>

        <div className="modal-b">
          <div className="amount-input">
            <span className="amount-curr">₺</span>
            <input type="text" autoFocus placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} className="amount-val mono" />
          </div>

          <label className="field">
            <span className="field-l">İşlem adı</span>
            <input type="text" placeholder="örn. Migros alışveriş" value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <div className="field-row">
            <label className="field">
              <span className="field-l">Kategori</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {APP_DATA.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-l">Hesap</span>
              <select value={account} onChange={(e) => setAccount(e.target.value)}>
                {accounts.length === 0 && <option value="">Hesap yok</option>}
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          </div>

          <label className="field">
            <span className="field-l">Tarih</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          <label className="field">
            <span className="field-l">Not (opsiyonel)</span>
            <textarea rows="2" placeholder="İşlem hakkında not..." value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>

        <footer className="modal-f modal-f-split">
          <button type="button" className="btn btn-ghost btn-md pf-del" onClick={onDelete}><Icon name="trash" size={15} />Sil</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-md" onClick={onClose}>İptal</button>
            <button type="submit" className="btn btn-primary btn-md" disabled={!canSubmit}>Kaydet</button>
          </div>
        </footer>
      </form>
    </div>
  );
}
function BudgetView({ ctx }) {
  const { showBalances, budgets, setBudgets } = ctx;
  const transactions = (ctx.transactions || []).filter((t) => !isTransferLeg(t));
  const today = appToday();
  const { start, end } = monthRange(today);

  const [editing, setEditing] = useStateV(null); // {category, limit} or "new"
  const [templatesOpen, setTemplatesOpen] = useStateV(false);

  const monthTx = transactions.filter((t) => {
    const dt = new Date(t.date);
    return dt >= start && dt <= end && t.amount < 0;
  });

  const spentByCat = {};
  monthTx.forEach((t) => {
    if (t.amount < 0 && !isTransferLeg(t) && !isDebtPayment(t)) spentByCat[t.category] = (spentByCat[t.category] || 0) + -t.amount;
  });

  const rows = budgets.map((b) => {
    const cat = APP_DATA.categories.find((c) => c.id === b.category);
    const spent = spentByCat[b.category] || 0;
    const pct = spent / b.limit * 100;
    return { ...b, cat, spent, pct, remaining: b.limit - spent };
  });

  const usedCats = new Set(budgets.map(b => b.category));
  const availableCats = APP_DATA.categories.filter(c =>
    !usedCats.has(c.id) && !["maas","freelance","yatirim"].includes(c.id)
  );

  const saveBudget = ({ category, limit }) => {
    setBudgets(prev => {
      const exists = prev.find(b => b.category === category);
      if (exists) {
        return prev.map(b => b.category === category ? { ...b, limit } : b);
      }
      return [...prev, { category, limit }];
    });
    setEditing(null);
  };

  const deleteBudget = (category) => {
    setBudgets(prev => prev.filter(b => b.category !== category));
    setEditing(null);
  };

  const applyTemplate = (template) => {
    setBudgets(template);
    setTemplatesOpen(false);
  };

  const totalBudget = rows.reduce((s, r) => s + r.limit, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  const daysIn = today.getDate();
  const daysTot = end.getDate();
  const daysLeft = daysTot - daysIn;

  return (
    <div className="view view-budget">
      <div className="page-head">
        <div>
          <h1 className="page-title">Bütçe planlama</h1>
          <p className="page-sub">{TR_MONTHS[today.getMonth()]} {today.getFullYear()} · {daysLeft} gün kaldı</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-md" data-comment-anchor="a8208ed6b7-button-500-11" onClick={()=>setTemplatesOpen(true)}><Icon name="repeat" size={16} />Şablonlar</button>
          <button className="btn btn-primary btn-md" onClick={()=>setEditing({ category: availableCats[0]?.id || "diger", limit: 1000, isNew: true })}><Icon name="plus" size={16} />Kategori ekle</button>
        </div>
      </div>

      <div className="budget-hero">
        <div className="bh-left">
          <div className="bh-label">Aylık bütçe kullanımı</div>
          <div className="bh-amts">
            <span className="bh-spent mono"><Money value={totalSpent} sign="neutral" hide={!showBalances} /></span>
            <span className="bh-of">/</span>
            <span className="bh-limit mono"><Money value={totalBudget} sign="neutral" hide={!showBalances} /></span>
          </div>
          <div className="bh-bar">
            <div className="bh-bar-fill" style={{ width: `${totalBudget ? Math.min(100, totalSpent / totalBudget * 100) : 0}%` }} />
            <div className="bh-bar-pace" style={{ left: `${daysIn / daysTot * 100}%` }} title="Bugünün tempo çizgisi" />
          </div>
          <div className="bh-meta">
            {totalBudget > 0 ? (
              <>
                <span>%{Math.round(totalSpent / totalBudget * 100)} kullanıldı</span>
                <span className="dot-sep">·</span>
                <span>Beklenen: %{Math.round(daysIn / daysTot * 100)}</span>
                <span className="dot-sep">·</span>
                <span className={totalSpent < totalBudget * daysIn / daysTot ? "pos" : "neg"}>
                  {totalSpent < totalBudget * daysIn / daysTot ? "Tempodan iyi durumdasın" : "Tempodan hızlı harcıyorsun"}
                </span>
              </>
            ) : (
              <span>Aşağıdan kategori ekleyerek bu ayki bütçeni planla</span>
            )}
          </div>
        </div>
        <div className="bh-right">
          <div className="bh-stat">
            <div className="bh-stat-l">Kalan</div>
            <div className="bh-stat-v"><Money value={totalBudget - totalSpent} sign="neutral" hide={!showBalances} /></div>
          </div>
          <div className="bh-stat">
            <div className="bh-stat-l">Günlük kalan limit</div>
            <div className="bh-stat-v mono">₺{APP_DATA.fmt(daysLeft > 0 ? (totalBudget - totalSpent) / daysLeft : 0)}</div>
          </div>
        </div>
      </div>

      <div className="budget-grid">
        {rows.map((r) =>
        <div key={r.category} className="budget-card" onClick={()=>setEditing({ category: r.category, limit: r.limit, isNew: false })} role="button">
            <div className="bc-h">
              <div className="bc-cat">
                <span className="bc-icon" style={{ background: `${r.cat.color}22`, color: r.cat.color }}>
                  <Icon name="target" size={14} />
                </span>
                <span className="bc-name">{r.cat.label}</span>
              </div>
              <div className={`bc-pct ${r.pct > 100 ? "neg" : r.pct > 85 ? "warn" : "pos"}`}>
                %{Math.min(999, Math.round(r.pct))}
              </div>
            </div>
            <div className="bc-amts">
              <span className="mono"><Money value={r.spent} sign="neutral" hide={!showBalances} /></span>
              <span className="bc-of">/ <Money value={r.limit} sign="neutral" hide={!showBalances} /></span>
            </div>
            <Progress
            value={Math.min(r.limit, r.spent)}
            max={r.limit}
            color={r.pct > 100 ? "var(--neg)" : r.pct > 85 ? "var(--warn)" : r.cat.color}
            height={6} />
          
            <div className="bc-foot">
              {r.remaining > 0 ?
            <span>Kalan <span className="mono">₺{APP_DATA.fmt(r.remaining)}</span></span> :
            <span className="neg">Aşım <span className="mono">₺{APP_DATA.fmt(-r.remaining)}</span></span>
            }
              <span className="bc-pace">Tempo: ₺{APP_DATA.fmt(r.limit * daysIn / daysTot)}</span>
            </div>
          </div>
        )}
        {availableCats.length > 0 && (
          <button className="budget-card budget-card-add" onClick={()=>setEditing({ category: availableCats[0].id, limit: 1000, isNew: true })}>
            <Icon name="plus" size={20}/>
            <span>Kategori ekle</span>
          </button>
        )}
      </div>

      <BudgetEditModal
        editing={editing}
        budgets={budgets}
        onClose={()=>setEditing(null)}
        onSave={saveBudget}
        onDelete={deleteBudget}
      />
      <TemplatesModal
        open={templatesOpen}
        onClose={()=>setTemplatesOpen(false)}
        onApply={applyTemplate}
      />
    </div>);

}

// Budget edit modal
function BudgetEditModal({ editing, budgets, onClose, onSave, onDelete }) {
  const [category, setCategory] = useStateV("market");
  const [limit, setLimit] = useStateV("1000");

  useEffectV(() => {
    if (editing) {
      setCategory(editing.category);
      setLimit(String(editing.limit));
    }
  }, [editing]);

  if (!editing) return null;

  const cat = APP_DATA.categories.find(c => c.id === category);
  const usedCats = new Set(budgets.map(b => b.category));
  const availableCats = APP_DATA.categories.filter(c =>
    !"maas freelance yatirim".split(" ").includes(c.id) &&
    (!usedCats.has(c.id) || c.id === editing.category)
  );

  const submit = (e) => {
    e.preventDefault();
    const lim = parseFloat(String(limit).replace(",", "."));
    if (!lim || lim <= 0) return;
    onSave({ category, limit: lim });
  };

  return (
    <div className="modal-bd" onClick={onClose}>
      <form className="modal" onClick={(e)=>e.stopPropagation()} onSubmit={submit}>
        <header className="modal-h">
          <div>
            <h2>{editing.isNew ? "Kategori bütçesi ekle" : "Bütçeyi düzenle"}</h2>
            <p>Aylık harcama limitini belirle</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" size={18}/></button>
        </header>

        <div className="modal-b">
          <div className="field">
            <span className="field-l">Kategori</span>
            <div className="cat-picker">
              {availableCats.map(c => (
                <button
                  type="button"
                  key={c.id}
                  className={`cat-chip ${category===c.id?"cat-chip-act":""}`}
                  onClick={()=>setCategory(c.id)}
                  style={category===c.id ? { borderColor: c.color, background: `${c.color}22`, color: "var(--fg)" } : {}}
                >
                  <span className="cat-dot" style={{background: c.color}}/>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-l">Aylık limit</span>
            <div className="amount-input amount-input-sm">
              <span className="amount-curr">₺</span>
              <input
                type="text"
                value={limit}
                onChange={(e)=>setLimit(e.target.value)}
                className="amount-val mono"
                autoFocus
              />
            </div>
            <div className="limit-presets">
              {[500, 1000, 2500, 5000, 10000].map(p => (
                <button type="button" key={p} className="preset-chip" onClick={()=>setLimit(String(p))}>
                  ₺{APP_DATA.fmtShort(p)}
                </button>
              ))}
            </div>
          </div>

          {cat && (
            <div className="budget-preview">
              <div className="bp-l">Önizleme</div>
              <div className="bp-card">
                <span className="bc-icon" style={{background:`${cat.color}22`,color:cat.color}}>
                  <Icon name="target" size={14}/>
                </span>
                <div className="bp-info">
                  <div className="bp-name">{cat.label}</div>
                  <div className="bp-meta">Günlük yaklaşık ₺{APP_DATA.fmt((parseFloat(String(limit).replace(",",".")) || 0) / 30)}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <footer className="modal-f">
          {!editing.isNew && (
            <button type="button" className="btn btn-ghost btn-md" onClick={()=>onDelete(editing.category)} style={{marginRight:"auto", color:"var(--neg)"}}>
              Bütçeyi sil
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-md" onClick={onClose}>İptal</button>
          <button type="submit" className="btn btn-primary btn-md">{editing.isNew ? "Bütçe oluştur" : "Kaydet"}</button>
        </footer>
      </form>
    </div>
  );
}

const BUDGET_TEMPLATES = [
  {
    name: "50/30/20 kuralı",
    desc: "Gelirin %50'si ihtiyaç, %30 istek, %20 birikim",
    budgets: [
      { category: "kira", limit: 18500 },
      { category: "faturalar", limit: 3500 },
      { category: "market", limit: 4500 },
      { category: "ulasim", limit: 2500 },
      { category: "yemek", limit: 3000 },
      { category: "eglence", limit: 2500 },
      { category: "alisveris", limit: 3000 },
      { category: "abonelik", limit: 1500 },
    ],
  },
  {
    name: "Sıkı tasarruf",
    desc: "Agresif birikim hedefi için minimum giderler",
    budgets: [
      { category: "kira", limit: 18500 },
      { category: "faturalar", limit: 3000 },
      { category: "market", limit: 3500 },
      { category: "ulasim", limit: 1500 },
      { category: "yemek", limit: 1500 },
      { category: "abonelik", limit: 800 },
    ],
  },
  {
    name: "Rahat yaşam",
    desc: "Konfor odaklı, esnek limitler",
    budgets: [
      { category: "kira", limit: 18500 },
      { category: "faturalar", limit: 4000 },
      { category: "market", limit: 6000 },
      { category: "ulasim", limit: 3500 },
      { category: "yemek", limit: 5000 },
      { category: "eglence", limit: 4000 },
      { category: "alisveris", limit: 6000 },
      { category: "saglik", limit: 1500 },
      { category: "abonelik", limit: 2000 },
    ],
  },
];

function TemplatesModal({ open, onClose, onApply }) {
  if (!open) return null;
  return (
    <div className="modal-bd" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e)=>e.stopPropagation()}>
        <header className="modal-h">
          <div>
            <h2>Bütçe şablonları</h2>
            <p>Hazır şablonlardan birini seç, sonra özelleştir</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" size={18}/></button>
        </header>
        <div className="modal-b">
          <div className="tpl-list">
            {BUDGET_TEMPLATES.map((tpl, i) => {
              const total = tpl.budgets.reduce((s,b)=>s+b.limit,0);
              return (
                <button key={i} className="tpl-card" onClick={()=>onApply(tpl.budgets)}>
                  <div className="tpl-h">
                    <div className="tpl-n">{tpl.name}</div>
                    <div className="tpl-total mono">₺{APP_DATA.fmtShort(total)}/ay</div>
                  </div>
                  <div className="tpl-d">{tpl.desc}</div>
                  <div className="tpl-cats">
                    {tpl.budgets.slice(0,8).map(b => {
                      const c = APP_DATA.categories.find(x=>x.id===b.category);
                      return <span key={b.category} className="cat-pill"><span className="cat-dot" style={{background:c.color}}/>{c.label}</span>;
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// REPORTS
// ════════════════════════════════════════════════════════
function ReportsView({ ctx }) {
  const { showBalances } = ctx;
  const allTx = ctx.transactions || [];
  const transactions = allTx.filter((t) => !isTransferLeg(t) && !isDebtPayment(t));
  const [range, setRange] = useStateV("6m");
  const [chartView, setChartView] = useStateV("cashflow");

  if (transactions.length === 0) {
    return (
      <div className="view view-reports">
        <div className="page-head">
          <div>
            <h1 className="page-title">Raporlar ve analiz</h1>
            <p className="page-sub">Finansal davranışını anla</p>
          </div>
        </div>
        <div className="empty-big">
          <div className="empty-big-icon"><Icon name="chart" size={28}/></div>
          <div className="empty-big-t">Henüz analiz için yeterli veri yok</div>
          <p className="empty-big-d">İlk işlemlerini eklediğinde harcama trendleri, kategori dağılımı, günlük yoğunluk haritası ve daha fazlası burada görünecek.</p>
        </div>
      </div>
    );
  }

  const today = appToday();
  const monthsCount = range === "3m" ? 3 : range === "6m" ? 6 : 12;
  const allMonthly = deriveMonthly(allTx, monthsCount * 2, today);
  const monthly = allMonthly.slice(-monthsCount);
  const monthlyPrev = allMonthly.slice(0, monthsCount);

  // Seyrek veri düzeltmesi: oranları sabit "ay sayısı"na değil, gerçek veri olan aylara göre hesapla.
  // (Yeni kullanıcı tek ay girmişse, geliri 6'ya bölmek geliri yapay olarak düşürür.)
  const incomeMonthsN = Math.max(1, monthly.filter((m) => m.income > 0).length);
  const activeMonthsN = Math.max(1, monthly.filter((m) => m.income > 0 || m.expense > 0).length);

  // Cumulative savings curve derived from full 12-month transactions
  const nw12 = deriveMonthly(allTx, 12, today);
  const netWorthData = deriveSavingsCurve(nw12);

  // ranges
  const rangeStart = new Date(today.getFullYear(), today.getMonth() - monthsCount + 1, 1);
  const prevStart = new Date(today.getFullYear(), today.getMonth() - monthsCount * 2 + 1, 1);
  const prevEnd = new Date(today.getFullYear(), today.getMonth() - monthsCount + 1, 0);

  const rangeTx = transactions.filter((t) => new Date(t.date) >= rangeStart);
  const prevTx = transactions.filter((t) => {
    const d = new Date(t.date);
    return d >= prevStart && d <= prevEnd;
  });

  // KPIs current
  const totalIn = monthly.reduce((s, m) => s + m.income, 0);
  const totalOut = monthly.reduce((s, m) => s + m.expense, 0);
  const totalDebtPaid = monthly.reduce((s, m) => s + (m.debtPaid || 0), 0);
  const totalNet = totalIn - totalOut - totalDebtPaid;
  const avgSave = totalIn ? totalNet / totalIn * 100 : 0;
  const avgMonth = totalOut / monthsCount;
  // KPIs prev
  const prevIn = monthlyPrev.reduce((s, m) => s + m.income, 0);
  const prevOut = monthlyPrev.reduce((s, m) => s + m.expense, 0);
  const prevDebtPaid = monthlyPrev.reduce((s, m) => s + (m.debtPaid || 0), 0);
  const prevNet = prevIn - prevOut - prevDebtPaid;
  const prevSave = prevIn ? prevNet / prevIn * 100 : 0;
  const prevAvgMonth = prevOut / monthsCount;
  const delta = (a, b) => b === 0 ? 0 : ((a - b) / Math.abs(b)) * 100;

  // category breakdown
  const catTotals = {};
  const catTotalsPrev = {};
  rangeTx.forEach((t) => { if (t.amount < 0 && !isTransferLeg(t) && !isDebtPayment(t)) catTotals[t.category] = (catTotals[t.category] || 0) + -t.amount; });
  prevTx.forEach((t) => { if (t.amount < 0 && !isTransferLeg(t) && !isDebtPayment(t)) catTotalsPrev[t.category] = (catTotalsPrev[t.category] || 0) + -t.amount; });

  const catRows = Object.entries(catTotals).map(([id, v]) => {
    const c = APP_DATA.categories.find((x) => x.id === id);
    const prev = catTotalsPrev[id] || 0;
    return { ...c, value: v, prev, delta: delta(v, prev) };
  }).sort((a, b) => b.value - a.value);
  const catMax = catRows[0]?.value || 1;
  const catTotal = catRows.reduce((s, r) => s + r.value, 0);

  // Daily spending heatmap (last 90 days)
  const heatStart = new Date(today); heatStart.setDate(today.getDate() - 90);
  const dayMap = {};
  for (let i = 0; i <= 90; i++) {
    const d = new Date(heatStart); d.setDate(heatStart.getDate() + i);
    dayMap[d.toISOString().slice(0, 10)] = 0;
  }
  transactions.forEach((t) => {
    const key = t.date.slice(0, 10);
    if (t.amount < 0 && !isTransferLeg(t) && !isDebtPayment(t) && key in dayMap) dayMap[key] += -t.amount;
  });
  const heatDays = Object.entries(dayMap).map(([date, value]) => ({ date, value }));
  const heatMax = Math.max(...heatDays.map(d => d.value)) || 1;
  const totalHeatExp = heatDays.reduce((s, d) => s + d.value, 0);
  const activeDays = heatDays.filter(d => d.value > 0).length;
  const peakDay = heatDays.reduce((p, d) => d.value > p.value ? d : p, heatDays[0]);

  // Day of week
  const dowTotals = [0, 0, 0, 0, 0, 0, 0]; // Mon-Sun
  const dowCounts = [0, 0, 0, 0, 0, 0, 0];
  rangeTx.forEach((t) => {
    if (t.amount < 0 && !isTransferLeg(t) && !isDebtPayment(t)) {
      const dow = (new Date(t.date).getDay() + 6) % 7;
      dowTotals[dow] += -t.amount;
      dowCounts[dow] += 1;
    }
  });
  const dowAvg = dowTotals.map((t, i) => dowCounts[i] ? t / dowCounts[i] : 0);
  const dowLabels = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
  const peakDow = dowTotals.indexOf(Math.max(...dowTotals));
  const dowMax = Math.max(...dowTotals, 1);
  const dowTotalAll = dowTotals.reduce((s, x) => s + x, 0) || 1;
  // Hafta içi (Pzt–Cum) vs hafta sonu (Cmt–Paz)
  const weekdaySum = dowTotals.slice(0, 5).reduce((s, x) => s + x, 0);
  const weekendSum = dowTotals[5] + dowTotals[6];
  const weekdayCnt = dowCounts.slice(0, 5).reduce((s, x) => s + x, 0);
  const weekendCnt = dowCounts[5] + dowCounts[6];
  const weekdayAvgDay = weekdaySum / 5;   // 5 hafta içi günü
  const weekendAvgDay = weekendSum / 2;   // 2 hafta sonu günü
  const txTotalCount = dowCounts.reduce((s, x) => s + x, 0);

  // Category trend over months (stacked area)
  const trendCats = catRows.slice(0, 6);
  const monthKeys = monthly.map(m => `${m.year}-${String(m.month + 1).padStart(2, '0')}`);
  const stackedSeries = trendCats.map(c => {
    const values = monthKeys.map(mk => {
      const [year, month] = mk.split('-').map(Number);
      const sum = rangeTx.filter(t => {
        const d = new Date(t.date);
        return d.getFullYear() === year && (d.getMonth() + 1) === month && t.category === c.id && t.amount < 0 && !isTransferLeg(t) && !isDebtPayment(t);
      }).reduce((s, t) => s + -t.amount, 0);
      return sum;
    });
    return { label: c.label, color: c.color, values };
  });

  // Recurring / subscriptions
  const subscriptions = transactions.filter(t =>
    t.category === "abonelik" && t.amount < 0 &&
    new Date(t.date).getMonth() === today.getMonth() &&
    new Date(t.date).getFullYear() === today.getFullYear()
  ).map(t => ({ name: t.name, monthly: -t.amount }));
  const uniqueSubs = Object.values(subscriptions.reduce((m, s) => { m[s.name] = s; return m; }, {}));
  const subTotalMonthly = uniqueSubs.reduce((s, x) => s + x.monthly, 0);

  // Top merchants
  const merchTotals = {};
  rangeTx.forEach((t) => { if (t.amount < 0 && !isTransferLeg(t) && !isDebtPayment(t)) merchTotals[t.name] = (merchTotals[t.name] || 0) + -t.amount; });
  const topMerchants = Object.entries(merchTotals).map(([n, v]) => ({ n, v })).sort((a, b) => b.v - a.v).slice(0, 8);

  // Rolling 3-month average for cashflow
  const rollingExp = monthly.map((_, i) => {
    const slice = monthly.slice(Math.max(0, i - 2), i + 1);
    return slice.reduce((s, m) => s + m.expense, 0) / slice.length;
  });
  const rollingInc = monthly.map((_, i) => {
    const slice = monthly.slice(Math.max(0, i - 2), i + 1);
    return slice.reduce((s, m) => s + m.income, 0) / slice.length;
  });

  // Forecast next month
  const fcExp = Math.round(rollingExp[rollingExp.length - 1]);
  const fcInc = Math.round(rollingInc[rollingInc.length - 1]);
  const fcNet = fcInc - fcExp;
  const fcSave = fcInc ? (fcNet / fcInc) * 100 : 0;

  // Top growing & declining categories
  const catDeltas = catRows.filter(c => c.prev > 0).map(c => ({ ...c, deltaAbs: c.value - c.prev }));
  const growers = [...catDeltas].sort((a, b) => b.deltaAbs - a.deltaAbs).slice(0, 3).filter(c => c.deltaAbs > 0);
  const decliners = [...catDeltas].sort((a, b) => a.deltaAbs - b.deltaAbs).slice(0, 3).filter(c => c.deltaAbs < 0);

  const fmtDelta = (d) => `${d >= 0 ? "+" : ""}%${d.toFixed(1)}`;

  // ── Income sources breakdown ──
  const incomeTotals = {};
  rangeTx.forEach((t) => { if (t.amount > 0 && !isTransferLeg(t) && !isDebtPayment(t)) incomeTotals[t.category] = (incomeTotals[t.category] || 0) + t.amount; });
  const incomeRows = Object.entries(incomeTotals).map(([id, v]) => {
    const c = APP_DATA.categories.find((x) => x.id === id);
    return { ...c, value: v };
  }).sort((a, b) => b.value - a.value);
  const incomeTotal = incomeRows.reduce((s, r) => s + r.value, 0) || 1;

  // ── Fixed vs variable expenses ──
  const FIXED_CATS = ["kira", "faturalar", "abonelik", "saglik", "egitim"];
  let fixedSum = 0, variableSum = 0;
  Object.entries(catTotals).forEach(([id, v]) => {
    if (FIXED_CATS.includes(id)) fixedSum += v; else variableSum += v;
  });
  const fixedVarTotal = fixedSum + variableSum || 1;
  const fixedRows = catRows.filter((r) => FIXED_CATS.includes(r.id));
  const varRows = catRows.filter((r) => !FIXED_CATS.includes(r.id));

  // ── Biggest single expenses ──
  const biggest = rangeTx.filter((t) => t.amount < 0 && !isTransferLeg(t) && !isDebtPayment(t)).sort((a, b) => a.amount - b.amount).slice(0, 6);

  // ── Financial health score ──
  const liquidCash = ctx.accounts.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0);
  const avgMonthExp = totalOut / activeMonthsN || 0;
  const savePts = Math.max(0, Math.min(100, avgSave * 4)); // %25 tasarruf → 100
  const fixedRatio = totalOut ? fixedSum / totalOut * 100 : 0;
  const fixedPts = Math.max(0, Math.min(100, 100 - Math.max(0, fixedRatio - 50) * 2));
  const incomeStability = (() => {
    const incs = monthly.map((m) => m.income).filter((x) => x > 0);
    if (incs.length < 2) return 70;
    const mean = incs.reduce((a, b) => a + b, 0) / incs.length;
    const variance = incs.reduce((s, x) => s + (x - mean) ** 2, 0) / incs.length;
    const cv = mean ? Math.sqrt(variance) / mean : 1;
    return Math.max(0, Math.min(100, 100 - cv * 200));
  })();
  const emergencyMonths = avgMonthExp ? liquidCash / avgMonthExp : 0;
  const emergencyPts = Math.max(0, Math.min(100, emergencyMonths / 6 * 100));
  const healthScore = Math.round(savePts * 0.35 + fixedPts * 0.2 + incomeStability * 0.15 + emergencyPts * 0.3);
  const healthLabel = healthScore >= 80 ? "Mükemmel" : healthScore >= 60 ? "İyi" : healthScore >= 40 ? "Orta" : "Geliştirilmeli";
  const healthColor = healthScore >= 80 ? "var(--pos)" : healthScore >= 60 ? "var(--accent)" : healthScore >= 40 ? "var(--warn)" : "var(--neg)";
  const healthMetrics = [
    { label: "Tasarruf oranı", pts: savePts, detail: `%${avgSave.toFixed(1)}`, hint: "Hedef %25+" },
    { label: "Acil durum fonu", pts: emergencyPts, detail: `${emergencyMonths.toFixed(1)} ay`, hint: "Hedef 6 ay" },
    { label: "Sabit gider yükü", pts: fixedPts, detail: `%${fixedRatio.toFixed(0)}`, hint: "Düşük daha iyi" },
    { label: "Gelir istikrarı", pts: incomeStability, detail: incomeStability >= 70 ? "Stabil" : "Değişken", hint: "Düzenli gelir" },
  ];

  // ── Borç Sağlığı & Döngü Analizi (gerçek finans formülleri) ──
  const cardAccts = ctx.accounts.filter((a) => a.type.includes("Kart"));
  const cardDebtTotal = -cardAccts.reduce((s, a) => s + Math.min(0, a.balance), 0);
  const cardLimitTotal = cardAccts.reduce((s, a) => s + (a.limit || 0), 0);
  const cardUtil = cardLimitTotal ? cardDebtTotal / cardLimitTotal * 100 : 0;
  const loanDebtTotal = (ctx.debts || []).reduce((s, d) => s + (d.remaining || 0), 0);
  const totalDebt = cardDebtTotal + loanDebtTotal;
  const avgMonthlyIncome = totalIn / incomeMonthsN || fcInc || 0;
  // Taşıma maliyeti (aylık faiz yükü) = Σ(borç × aylık faiz oranı)
  const cardInterestMo = cardAccts.reduce((s, a) => s + Math.max(0, -a.balance) * ((a.rate || 4.25) / 100), 0);
  const loanInterestMo = (ctx.debts || []).reduce((s, d) => s + (d.remaining || 0) * ((d.rate || 0) / 100), 0);
  const carryingCostMo = cardInterestMo + loanInterestMo;
  const carryingPct = avgMonthlyIncome ? carryingCostMo / avgMonthlyIncome * 100 : 0;
  // Gerçek tasarruf (net değer artışı) ≈ Gelir − Gider − faiz. Anapara ödemesi net-değer-nötrdür.
  const periodInterest = carryingCostMo * activeMonthsN;
  const trueSavings = totalIn - totalOut - periodInterest;
  // Borç Servis Oranı (DSR) = (kredi taksitleri + kart asgari ödemeleri) / aylık gelir
  const cardMinPay = cardDebtTotal * 0.20;
  const loanMonthly = (ctx.debts || []).reduce((s, d) => s + (d.monthly || 0), 0);
  const monthlyDebtService = cardMinPay + loanMonthly;
  const dsr = avgMonthlyIncome ? monthlyDebtService / avgMonthlyIncome * 100 : 0;
  // Kaldıraç = yükümlülük / likit varlık
  const leverage = liquidCash > 0 ? totalDebt / liquidCash : Infinity;
  const netWorthNow = liquidCash - totalDebt;
  // Borçtan kurtuluş süresi (basit): net aylık ödeme gücüyle anapara kaç ayda biter
  const monthlyNetForDebt = Math.max(0, avgMonthlyIncome - avgMonthExp - carryingCostMo);
  const payoffMonths = monthlyNetForDebt > 0 ? totalDebt / monthlyNetForDebt : Infinity;
  // Döngü teşhisi
  const dsrZone = dsr < 30 ? "ok" : dsr < 43 ? "warn" : "bad";
  const cycleScore = (dsr >= 43 ? 2 : dsr >= 30 ? 1 : 0) + (netWorthNow < 0 ? 2 : 0) + (emergencyMonths < 1 ? 2 : emergencyMonths < 3 ? 1 : 0) + (cardUtil >= 70 ? 1 : 0) + (carryingPct >= 10 ? 1 : 0);
  const cycleVerdict =
    cycleScore >= 6 ? { label: "Borç spirali riski", color: "var(--neg)", icon: "trendingDown", desc: "Birden fazla kritik gösterge kırmızı. Önce nakit tamponu, sonra en yüksek faizli borç." }
    : cycleScore >= 4 ? { label: "Döngüde / kırılgan", color: "var(--warn)", icon: "repeat", desc: "Borcu çevirebiliyorsun ama tampon yok — beklenmedik bir gider seni geri kart borcuna iter." }
    : cycleScore >= 2 ? { label: "Su üstünde", color: "var(--accent)", icon: "flow", desc: "Dengedesin ama net değerini büyütmek için borcu eritmeye odaklan." }
    : { label: "Sağlıklı", color: "var(--pos)", icon: "sparkles", desc: "Borç yükün kontrol altında. Birikime ağırlık verebilirsin." };
  const cycleMetrics = [
    { label: "Borç Servis Oranı (DSR)", value: `%${dsr.toFixed(0)}`, zone: dsrZone, formula: "Aylık borç ödemesi ÷ gelir", hint: dsr < 30 ? "Sağlıklı (<%30)" : dsr < 43 ? "Zorlu (%30–43)" : "Tehlikeli (>%43)", icon: "scale" },
    { label: "Aylık faiz yükü", value: `₺${APP_DATA.fmtShort(carryingCostMo)}`, zone: carryingPct < 5 ? "ok" : carryingPct < 10 ? "warn" : "bad", formula: "Σ(borç × aylık faiz)", hint: `Gelirinin %${carryingPct.toFixed(1)}'i · yıllık ₺${APP_DATA.fmtShort(carryingCostMo * 12)}`, icon: "flow" },
    { label: "Likidite tamponu", value: `${emergencyMonths.toFixed(1)} ay`, zone: emergencyMonths >= 3 ? "ok" : emergencyMonths >= 1 ? "warn" : "bad", formula: "Nakit ÷ aylık gider", hint: emergencyMonths < 1 ? "Kritik düşük (<1 ay)" : "Hedef 3–6 ay", icon: "wallet" },
    { label: "Net değer", value: `${netWorthNow < 0 ? "−" : ""}₺${APP_DATA.fmtShort(Math.abs(netWorthNow))}`, zone: netWorthNow >= 0 ? "ok" : "bad", formula: "Varlık − yükümlülük", hint: "Gerçek tasarruf = bunun artışı", icon: "building" },
  ];

  return (
    <div className="view view-reports">
      <div className="page-head">
        <div>
          <h1 className="page-title">Raporlar ve analiz</h1>
          <p className="page-sub">Son {monthsCount} ay · {new Date(rangeStart).toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })} — {today.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })}</p>
        </div>
        <div className="page-actions">
          <div className="seg">
            <button className={range === "3m" ? "seg-act" : ""} onClick={() => setRange("3m")}>3 ay</button>
            <button className={range === "6m" ? "seg-act" : ""} onClick={() => setRange("6m")}>6 ay</button>
            <button className={range === "12m" ? "seg-act" : ""} onClick={() => setRange("12m")}>12 ay</button>
          </div>
          <button className="btn btn-ghost btn-md" onClick={()=>window.print()}><Icon name="download" size={16} />PDF rapor</button>
        </div>
      </div>

      {/* KPI row with deltas */}
      <div className="kpi-row">
        <KpiCard label="Toplam gelir" value={totalIn} delta={delta(totalIn, prevIn)} positiveIsGood={true} color="var(--pos)" series={monthly.map(m=>m.income)} hide={!showBalances}/>
        <KpiCard label="Toplam gider" value={totalOut} delta={delta(totalOut, prevOut)} positiveIsGood={false} color="var(--neg)" series={monthly.map(m=>m.expense)} hide={!showBalances}/>
        <KpiCard label="Net nakit akışı" value={totalNet} delta={delta(totalNet, prevNet)} positiveIsGood={true} color="var(--accent)" series={monthly.map(m=>m.net)} hide={!showBalances} signAware/>
        <KpiCard label="Tasarruf oranı" value={`%${avgSave.toFixed(1)}`} delta={avgSave - prevSave} positiveIsGood={true} color="#0ea5e9" series={monthly.map(m=>(m.net/m.income)*100)} hide={!showBalances} isPercent/>
      </div>
      {totalDebtPaid > 0 && (
        <div className="kpi-recon">
          <div className="recon-rows">
            <div className="recon-row">
              <span className="recon-row-l">Net nakit akışı</span>
              <span className={`recon-row-v mono ${totalNet >= 0 ? "pos" : "neg"}`}>{totalNet < 0 ? "−" : "+"}₺{APP_DATA.fmtShort(Math.abs(totalNet))}</span>
              <span className="recon-row-f">Gelir − Gider − Borç ödemesi · cebinde kalan nakit</span>
            </div>
            <div className="recon-row">
              <span className="recon-row-l">Gerçek tasarruf</span>
              <span className={`recon-row-v mono ${trueSavings >= 0 ? "pos" : "neg"}`}>{trueSavings < 0 ? "−" : "+"}₺{APP_DATA.fmtShort(Math.abs(trueSavings))}</span>
              <span className="recon-row-f">Gelir − Gider − Faiz · net değer artışı</span>
            </div>
          </div>
          <div className="recon-note"><Icon name="info" size={13} /><span>Borç <strong>ödemek kayıp değildir</strong> — net değerini korur. Yalnızca <strong className="neg">faiz</strong> (≈₺{APP_DATA.fmtShort(periodInterest)}) gerçek kayıptır.</span></div>
        </div>
      )}

      {/* Financial health score */}
      <Card title="Finansal sağlık skoru" subtitle="Tasarruf, acil fon, sabit gider yükü ve gelir istikrarından hesaplanır">
        <div className="health">
          <div className="health-gauge">
            <ScoreRing score={healthScore} color={healthColor} size={160} label={healthLabel} sublabel="/ 100" />
          </div>
          <div className="health-metrics">
            {healthMetrics.map((m) => (
              <div key={m.label} className="health-metric">
                <div className="health-metric-h">
                  <span className="health-metric-l">{m.label}</span>
                  <span className="health-metric-v mono">{m.detail}</span>
                </div>
                <div className="health-metric-bar">
                  <div className="health-metric-fill" style={{ width: `${m.pts}%`, background: m.pts >= 70 ? "var(--pos)" : m.pts >= 40 ? "var(--warn)" : "var(--neg)" }} />
                </div>
                <div className="health-metric-hint">{m.hint}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Borç Sağlığı & Döngü Analizi */}
      <Card title="Borç sağlığı & döngü analizi" subtitle="Kredi kartı döngüsündeki bir hesap için gerçek finansal oranlar">
        <div className={`cycle-verdict cycle-${cycleVerdict.color === "var(--neg)" ? "bad" : cycleVerdict.color === "var(--warn)" ? "warn" : cycleVerdict.color === "var(--pos)" ? "ok" : "info"}`}>
          <div className="cycle-verdict-ic"><Icon name={cycleVerdict.icon} size={20} /></div>
          <div className="cycle-verdict-b">
            <div className="cycle-verdict-t">{cycleVerdict.label}</div>
            <div className="cycle-verdict-d">{cycleVerdict.desc}</div>
          </div>
        </div>

        <div className="cycle-grid">
          {cycleMetrics.map((m) => (
            <div key={m.label} className={`cycle-metric cycle-z-${m.zone}`}>
              <div className="cycle-metric-h">
                <span className="cycle-metric-ic"><Icon name={m.icon} size={14} /></span>
                <span className="cycle-metric-l">{m.label}</span>
              </div>
              <div className="cycle-metric-v">{showBalances ? m.value : "••"}</div>
              <div className="cycle-metric-formula">{m.formula}</div>
              <div className="cycle-metric-hint">{m.hint}</div>
            </div>
          ))}
        </div>

        <div className="cycle-foot">
          <div className="cycle-foot-row">
            <span className="cycle-foot-l">Kredi kartı kullanımı</span>
            <div className="cycle-foot-bar"><div style={{ width: `${Math.min(100, cardUtil)}%`, background: cardUtil >= 70 ? "var(--neg)" : cardUtil >= 40 ? "var(--warn)" : "var(--pos)" }} /></div>
            <span className="cycle-foot-v mono">%{cardUtil.toFixed(0)}</span>
          </div>
          <div className="cycle-foot-row">
            <span className="cycle-foot-l">Toplam borç / aylık gelir</span>
            <div className="cycle-foot-bar"><div style={{ width: `${Math.min(100, avgMonthlyIncome ? totalDebt / avgMonthlyIncome / 6 * 100 : 0)}%`, background: "var(--accent)" }} /></div>
            <span className="cycle-foot-v mono">{avgMonthlyIncome ? (totalDebt / avgMonthlyIncome).toFixed(1) : "—"}× gelir</span>
          </div>
          <div className="cycle-foot-note">
            <Icon name="info" size={13} />
            <span>{activeMonthsN < 3
              ? `Henüz ${activeMonthsN} aylık veri var — borçtan kurtuluş tahmini için birkaç ay daha işlem girdikçe netleşecek. Şimdilik öncelik: net değeri (−₺${APP_DATA.fmtShort(Math.abs(netWorthNow))}) her ay yukarı taşımak.`
              : payoffMonths === Infinity || payoffMonths > 600
              ? "Mevcut nakit akışıyla anaparayı eritmek için aylık fazla yok — önce giderleri kısıp pozitif fark yaratman gerekiyor."
              : `Mevcut tempoda (aylık ~₺${APP_DATA.fmtShort(monthlyNetForDebt)} serbest nakit) tüm borcun ~${Math.ceil(payoffMonths)} ayda biter — tüm giderlerini kaydettiğin varsayımıyla.`}</span>
          </div>
        </div>
      </Card>

      {/* Cashflow with rolling average + view toggle */}
      <Card
        title="Gelir & gider trendi"
        subtitle="Aylık değerler + 3 aylık hareketli ortalama (kesik çizgi)"
        action={
          <div className="seg">
            <button className={chartView==="cashflow"?"seg-act":""} onClick={()=>setChartView("cashflow")}>Akış</button>
            <button className={chartView==="net"?"seg-act":""} onClick={()=>setChartView("net")}>Net</button>
            <button className={chartView==="save"?"seg-act":""} onClick={()=>setChartView("save")}>Tasarruf %</button>
          </div>
        }
      >
        {chartView === "cashflow" && (
          <>
            <MultiLineChart
              labels={monthly.map(m => m.label)}
              series={[
                { name: "Gelir", values: monthly.map(m => m.income), color: "var(--pos)", strokeWidth: 1.6, fill: true },
                { name: "Gider", values: monthly.map(m => m.expense), color: "var(--neg)", strokeWidth: 1.6, fill: true },
                { values: rollingInc, color: "var(--pos)", strokeWidth: 0.8, dashed: true },
                { values: rollingExp, color: "var(--neg)", strokeWidth: 0.8, dashed: true },
              ]}
              height={280}
              formatY={(v) => "₺" + APP_DATA.fmtShort(v)}
            />
            <div className="legend legend-center">
              <span className="legend-item"><span className="legend-dot" style={{ background: "var(--pos)" }} />Gelir</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: "var(--neg)" }} />Gider</span>
              <span className="legend-item"><span className="legend-dash"/>Hareketli ortalama</span>
            </div>
          </>
        )}
        {chartView === "net" && (
          <>
            <BarChart
              data={monthly.map((m) => ({
                label: m.label,
                values: [m.net],
                colors: [m.net >= 0 ? "var(--accent)" : "var(--neg)"],
              }))}
              height={280}
              formatY={(v) => "₺" + APP_DATA.fmtShort(v)}
              seriesLabels={["Net birikim"]}
            />
            <div className="legend legend-center">
              <span className="legend-item"><span className="legend-dot" style={{ background: "var(--accent)" }} />Net birikim (pozitif)</span>
              <span className="legend-item"><span className="legend-dot" style={{ background: "var(--neg)" }} />Net açık (negatif)</span>
            </div>
          </>
        )}
        {chartView === "save" && (
          <>
            <MultiLineChart
              labels={monthly.map(m => m.label)}
              series={[
                { name: "Tasarruf oranı", values: monthly.map(m => m.income ? (m.net/m.income)*100 : 0), color: "#0ea5e9", strokeWidth: 1.6, fill: true },
                { values: monthly.map(() => 25), color: "var(--fg-3)", strokeWidth: 0.6, dashed: true },
                { values: monthly.map(() => 50), color: "var(--accent)", strokeWidth: 0.6, dashed: true },
              ]}
              height={280}
              formatY={(v) => `%${v.toFixed(0)}`}
              formatTooltipValue={(v) => `%${v.toFixed(1)}`}
              showZero={false}
            />
            <div className="legend legend-center">
              <span className="legend-item"><span className="legend-dot" style={{ background: "#0ea5e9" }} />Aylık tasarruf %</span>
              <span className="legend-item"><span className="legend-dash" style={{background: "var(--fg-3)"}}/>Hedef: %25</span>
              <span className="legend-item"><span className="legend-dash" style={{background: "var(--accent)"}}/>FIRE: %50</span>
            </div>
          </>
        )}
      </Card>

      {/* Net worth + heatmap row */}
      <div className="grid-2col">
        <Card title="Birikim eğrisi" subtitle="Kümülatif net birikim · Son 12 ay">
          <AreaChart
            series={[{
              labels: netWorthData.map((x) => x.label),
              values: netWorthData.map((x) => x.value),
              color: "var(--accent)",
              name: "Kümülatif birikim"
            }]}
            height={240}
            formatY={(v) => "₺" + APP_DATA.fmtShort(v)}
          />
          <div className="nw-meta">
            <div>
              <div className="nw-meta-l">İlk ay</div>
              <div className="nw-meta-v mono">₺{APP_DATA.fmtShort(netWorthData[0].value)}</div>
            </div>
            <div>
              <div className="nw-meta-l">Toplam birikim</div>
              <div className="nw-meta-v mono">₺{APP_DATA.fmtShort(netWorthData[netWorthData.length-1].value)}</div>
            </div>
            <div>
              <div className="nw-meta-l">Aylık ortalama</div>
              <div className={`nw-meta-v mono ${netWorthData[netWorthData.length-1].value >= 0 ? "pos" : "neg"}`}>{netWorthData[netWorthData.length-1].value >= 0 ? "+" : "−"}₺{APP_DATA.fmtShort(Math.abs(netWorthData[netWorthData.length-1].value / netWorthData.length))}</div>
            </div>
            <div>
              <div className="nw-meta-l">En iyi ay</div>
              <div className="nw-meta-v mono">{nw12.reduce((best, m) => m.net > best.net ? m : best, nw12[0]).label}</div>
            </div>
          </div>
        </Card>

        <Card title="Haftanın günlerine göre harcama" subtitle={`${dowLabels[peakDow]} günleri en yoğun`}>
          <BarChart
            data={dowLabels.map((l, i) => ({
              label: l,
              values: [dowTotals[i]],
              colors: [i === peakDow ? "var(--accent)" : i >= 5 ? "var(--info)" : "var(--bg-elev-3)"],
            }))}
            height={200}
            formatY={(v) => "₺" + APP_DATA.fmtShort(v)}
            seriesLabels={["Toplam harcama"]}
          />
          <div className="dow-stats">
            {dowLabels.map((l, i) => (
              <div key={i} className="dow-stat">
                <div className="dow-stat-l">{l}</div>
                <div className="dow-stat-v mono">₺{APP_DATA.fmtShort(dowAvg[i])}</div>
                <div className="dow-stat-s">ort. işlem</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Daily heatmap */}
      <Card
        title="Harcama deseni"
        subtitle={txTotalCount > 0 ? `En pahalı gün: ${dowLabels[peakDow]} · ${activeDays} aktif gün` : "Henüz harcama verisi yok"}
        action={
          <div className="hmap-summary">
            <div><div className="hmap-s-l">Günlük ort.</div><div className="hmap-s-v mono">₺{APP_DATA.fmt(totalHeatExp/Math.max(1, activeDays))}</div></div>
            <div><div className="hmap-s-l">Zirve</div><div className="hmap-s-v mono">₺{APP_DATA.fmt(peakDay.value)}</div></div>
          </div>
        }
      >
        {txTotalCount === 0 ? (
          <div className="pattern-empty">Harcama ekledikçe hangi günler ve hafta içi/sonu nasıl harcadığın burada görünecek.</div>
        ) : (
          <div className="pattern-wrap">
            <div className="pattern-bars">
              {dowTotals.map((v, i) => {
                const h = Math.max(4, v / dowMax * 130);
                const isPeak = i === peakDow && v > 0;
                const isWeekend = i >= 5;
                return (
                  <div key={i} className="pattern-col">
                    <div className="pattern-bar-track">
                      <div className="pattern-bar-val mono">{v > 0 ? `₺${APP_DATA.fmtShort(v)}` : ""}</div>
                      <div
                        className={`pattern-bar ${isPeak ? "pattern-bar-peak" : ""} ${isWeekend ? "pattern-bar-weekend" : ""}`}
                        style={{ height: h }}
                        title={`${dowLabels[i]}: ₺${APP_DATA.fmt(v)} · ${dowCounts[i]} işlem`}
                      />
                    </div>
                    <div className={`pattern-lbl ${isPeak ? "pattern-lbl-peak" : ""}`}>{dowLabels[i]}</div>
                  </div>
                );
              })}
            </div>
            <div className="pattern-stats">
              <div className="pattern-stat">
                <div className="pattern-stat-h"><span className="pattern-stat-dot" style={{ background: "var(--accent)" }} />Hafta içi</div>
                <div className="pattern-stat-v mono">₺{APP_DATA.fmt(weekdaySum)}</div>
                <div className="pattern-stat-s">%{(weekdaySum/dowTotalAll*100).toFixed(0)} · gün başına ₺{APP_DATA.fmtShort(weekdayAvgDay)}</div>
              </div>
              <div className="pattern-stat">
                <div className="pattern-stat-h"><span className="pattern-stat-dot" style={{ background: "var(--warn)" }} />Hafta sonu</div>
                <div className="pattern-stat-v mono">₺{APP_DATA.fmt(weekendSum)}</div>
                <div className="pattern-stat-s">%{(weekendSum/dowTotalAll*100).toFixed(0)} · gün başına ₺{APP_DATA.fmtShort(weekendAvgDay)}</div>
              </div>
              <div className="pattern-stat">
                <div className="pattern-stat-h"><Icon name="info" size={13} />İçgörü</div>
                <div className="pattern-stat-insight">
                  {weekendSum < dowTotalAll * 0.05
                    ? `Neredeyse tüm harcaman hafta içi — hafta sonu çok az.`
                    : weekdaySum < dowTotalAll * 0.05
                    ? `Harcaman ağırlıklı hafta sonunda yoğunlaşıyor.`
                    : weekendAvgDay > weekdayAvgDay * 1.3
                    ? `Hafta sonları gün başına ${Math.min(99, Math.round((weekendAvgDay/Math.max(1,weekdayAvgDay)-1)*100))}% daha fazla harcıyorsun.`
                    : weekdayAvgDay > weekendAvgDay * 1.3
                    ? `Hafta içi gün başına ${Math.min(99, Math.round((weekdayAvgDay/Math.max(1,weekendAvgDay)-1)*100))}% daha fazla harcıyorsun.`
                    : `Harcaman haftaya dengeli yayılmış — ${dowLabels[peakDow]} biraz öne çıkıyor.`}
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Category trend stacked area */}
      <Card title="Kategori trendi" subtitle={`İlk 6 kategori · ${monthsCount} ay`}>
        <StackedAreaChart
          series={stackedSeries}
          labels={monthly.map(m => m.label)}
          height={280}
          formatY={(v) => "₺" + APP_DATA.fmtShort(v)}
        />
        <div className="legend legend-center" style={{flexWrap:"wrap"}}>
          {stackedSeries.map(s => (
            <span key={s.label} className="legend-item">
              <span className="legend-dot" style={{ background: s.color }} />{s.label}
            </span>
          ))}
        </div>
      </Card>

      {/* Growers & decliners */}
      <div className="grid-2col">
        <Card title="En çok artan kategoriler" subtitle="Önceki döneme göre">
          <ul className="delta-list">
            {growers.length === 0 && <li className="delta-empty">Bu dönemde belirgin artış yok 🎉</li>}
            {growers.map(g => (
              <li key={g.id} className="delta-row">
                <span className="cat-dot" style={{background: g.color}}/>
                <div className="delta-info">
                  <div className="delta-name">{g.label}</div>
                  <div className="delta-meta">₺{APP_DATA.fmt(g.prev)} → ₺{APP_DATA.fmt(g.value)}</div>
                </div>
                <div className="delta-pct neg mono">{fmtDelta(g.delta)}</div>
                <div className="delta-bar"><div className="delta-bar-fill neg" style={{width:`${Math.min(100, Math.abs(g.delta))}%`}}/></div>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="En çok azalan kategoriler" subtitle="Önceki döneme göre">
          <ul className="delta-list">
            {decliners.length === 0 && <li className="delta-empty">Bu dönemde belirgin azalış yok</li>}
            {decliners.map(g => (
              <li key={g.id} className="delta-row">
                <span className="cat-dot" style={{background: g.color}}/>
                <div className="delta-info">
                  <div className="delta-name">{g.label}</div>
                  <div className="delta-meta">₺{APP_DATA.fmt(g.prev)} → ₺{APP_DATA.fmt(g.value)}</div>
                </div>
                <div className="delta-pct pos mono">{fmtDelta(g.delta)}</div>
                <div className="delta-bar"><div className="delta-bar-fill pos" style={{width:`${Math.min(100, Math.abs(g.delta))}%`}}/></div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Categories + Merchants */}
      <div className="grid-2col">
        <Card title="Kategoriye göre harcamalar" subtitle={`${monthsCount} aylık toplam · ₺${APP_DATA.fmtShort(catTotal)}`}>
          <ul className="rep-cat-list">
            {catRows.map((r) =>
              <li key={r.id}>
                <div className="rep-cat-h">
                  <span className="cat-dot" style={{ background: r.color }} />
                  <span className="rep-cat-name">{r.label}</span>
                  <span className="rep-cat-val mono">₺{APP_DATA.fmt(r.value)}</span>
                  <span className="rep-cat-pct">%{(r.value / catTotal * 100).toFixed(1)}</span>
                </div>
                <div className="rep-cat-bar">
                  <div className="rep-cat-bar-fill" style={{ width: `${r.value / catMax * 100}%`, background: r.color }} />
                </div>
              </li>
            )}
          </ul>
        </Card>

        <Card title="En çok harcama yaptığın yerler" subtitle={`İlk 8 · ${monthsCount} aylık`}>
          <ul className="merch-list">
            {topMerchants.map((m, i) =>
              <li key={m.n}>
                <div className="merch-rank">{i + 1}</div>
                <div className="merch-name">{m.n}</div>
                <div className="merch-bar"><div style={{ width: `${m.v / topMerchants[0].v * 100}%` }} /></div>
                <div className="merch-val mono">₺{APP_DATA.fmt(m.v)}</div>
              </li>
            )}
          </ul>
        </Card>
      </div>

      {/* Income sources + Fixed vs variable */}
      <div className="grid-2col">
        <Card title="Gelir kaynakları" subtitle={`${monthsCount} aylık · ₺${APP_DATA.fmtShort(incomeTotal)}`}>
          {incomeRows.length === 0 ? (
            <div className="delta-empty">Bu dönemde gelir kaydı yok</div>
          ) : (
            <div className="donut-row">
              <Donut
                segments={incomeRows.map((r) => ({ label: r.label, value: r.value, color: r.color }))}
                size={180}
                thickness={24}
                center={<div className="donut-center-inner"><div className="donut-c-label">Toplam</div><div className="donut-c-val">₺{APP_DATA.fmtShort(incomeTotal)}</div></div>}
              />
              <ul className="cat-list">
                {incomeRows.map((r) => (
                  <li key={r.id}>
                    <span className="cat-dot" style={{ background: r.color }} />
                    <span className="cat-name">{r.label}</span>
                    <span className="cat-val mono">₺{APP_DATA.fmt(r.value)}</span>
                    <span className="cat-pct">%{Math.round(r.value / incomeTotal * 100)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card title="Sabit vs değişken giderler" subtitle="Zorunlu taahhütler ve esnek harcamalar">
          <div className="fv-bar">
            <div className="fv-seg fv-fixed" style={{ width: `${fixedSum / fixedVarTotal * 100}%` }}>
              {fixedSum / fixedVarTotal > 0.12 && <span>%{Math.round(fixedSum / fixedVarTotal * 100)}</span>}
            </div>
            <div className="fv-seg fv-var" style={{ width: `${variableSum / fixedVarTotal * 100}%` }}>
              {variableSum / fixedVarTotal > 0.12 && <span>%{Math.round(variableSum / fixedVarTotal * 100)}</span>}
            </div>
          </div>
          <div className="fv-cols">
            <div className="fv-col">
              <div className="fv-col-h">
                <span className="fv-dot fv-dot-fixed" />
                <span className="fv-col-t">Sabit</span>
                <span className="fv-col-v mono">₺{APP_DATA.fmtShort(fixedSum)}</span>
              </div>
              <ul className="fv-list">
                {fixedRows.slice(0, 5).map((r) => (
                  <li key={r.id}><span className="cat-dot" style={{ background: r.color }} />{r.label}<span className="mono">₺{APP_DATA.fmtShort(r.value)}</span></li>
                ))}
                {fixedRows.length === 0 && <li className="fv-empty">—</li>}
              </ul>
            </div>
            <div className="fv-col">
              <div className="fv-col-h">
                <span className="fv-dot fv-dot-var" />
                <span className="fv-col-t">Değişken</span>
                <span className="fv-col-v mono">₺{APP_DATA.fmtShort(variableSum)}</span>
              </div>
              <ul className="fv-list">
                {varRows.slice(0, 5).map((r) => (
                  <li key={r.id}><span className="cat-dot" style={{ background: r.color }} />{r.label}<span className="mono">₺{APP_DATA.fmtShort(r.value)}</span></li>
                ))}
                {varRows.length === 0 && <li className="fv-empty">—</li>}
              </ul>
            </div>
          </div>
          <div className="fv-note">
            {fixedRatio > 60
              ? `Giderlerinin %${fixedRatio.toFixed(0)}'i sabit taahhüt — esneklik düşük.`
              : `Giderlerinin %${(100 - fixedRatio).toFixed(0)}'i esnek harcama — iyi bir tampon.`}
          </div>
        </Card>
      </div>

      {/* Biggest expenses + Monthly summary table */}
      <div className="grid-2col">
        <Card title="En büyük tek harcamalar" subtitle={`${monthsCount} aylık dönem`}>
          <ul className="big-list">
            {biggest.length === 0 && <li className="delta-empty">Harcama yok</li>}
            {biggest.map((t, i) => {
              const cat = APP_DATA.categories.find((c) => c.id === t.category);
              return (
                <li key={t.id} className="big-row">
                  <div className="big-rank">{i + 1}</div>
                  <div className="big-icon" style={{ background: `${cat.color}22`, color: cat.color }}>{t.name[0]}</div>
                  <div className="big-info">
                    <div className="big-name">{t.name}</div>
                    <div className="big-meta"><CategoryPill catId={t.category} /><span className="dot-sep">·</span>{fmtDateLong(t.date)}</div>
                  </div>
                  <div className="big-amt mono neg">−₺{APP_DATA.fmt(-t.amount)}</div>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="Aylık özet" subtitle="Gelir, gider, net ve tasarruf oranı" padded={false}>
          <div className="msum-table-wrap">
            <table className="msum-table">
              <thead>
                <tr><th>Ay</th><th>Gelir</th><th>Gider</th><th>Borç öd.</th><th>Net</th><th>Tasarruf</th></tr>
              </thead>
              <tbody>
                {[...monthly].reverse().map((m) => {
                  const sr = m.income ? (m.net / m.income) * 100 : 0;
                  return (
                    <tr key={m.label + m.year}>
                      <td className="msum-mon">{m.label} {String(m.year).slice(2)}</td>
                      <td className="mono pos">₺{APP_DATA.fmtShort(m.income)}</td>
                      <td className="mono neg">₺{APP_DATA.fmtShort(m.expense)}</td>
                      <td className="mono">{(m.debtPaid || 0) > 0 ? `₺${APP_DATA.fmtShort(m.debtPaid)}` : "—"}</td>
                      <td className={`mono ${m.net >= 0 ? "pos" : "neg"}`}>{m.net >= 0 ? "+" : "−"}₺{APP_DATA.fmtShort(Math.abs(m.net))}</td>
                      <td>
                        <span className={`msum-rate ${sr >= 25 ? "msum-rate-good" : sr >= 0 ? "msum-rate-ok" : "msum-rate-bad"}`}>%{sr.toFixed(0)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="msum-mon">Toplam</td>
                  <td className="mono pos">₺{APP_DATA.fmtShort(totalIn)}</td>
                  <td className="mono neg">₺{APP_DATA.fmtShort(totalOut)}</td>
                  <td className="mono">{totalDebtPaid > 0 ? `₺${APP_DATA.fmtShort(totalDebtPaid)}` : "—"}</td>
                  <td className={`mono ${totalNet >= 0 ? "pos" : "neg"}`}>{totalNet >= 0 ? "+" : "−"}₺{APP_DATA.fmtShort(Math.abs(totalNet))}</td>
                  <td><span className="msum-rate msum-rate-good">%{avgSave.toFixed(0)}</span></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      </div>

      {/* Subscriptions */}
      <Card
        title="Abonelik analizi"
        subtitle={`${uniqueSubs.length} aktif abonelik · Aylık ₺${APP_DATA.fmt(subTotalMonthly)} · Yıllık ₺${APP_DATA.fmt(subTotalMonthly * 12)}`}
      >
        <div className="sub-grid">
          {uniqueSubs.map(s => (
            <div key={s.name} className="sub-card">
              <div className="sub-h">
                <span className="sub-icon"><Icon name="repeat" size={14}/></span>
                <span className="sub-n">{s.name}</span>
              </div>
              <div className="sub-amounts">
                <div>
                  <div className="sub-l">Aylık</div>
                  <div className="sub-v mono">₺{APP_DATA.fmt(s.monthly)}</div>
                </div>
                <div>
                  <div className="sub-l">Yıllık</div>
                  <div className="sub-v mono">₺{APP_DATA.fmt(s.monthly * 12)}</div>
                </div>
              </div>
              <div className="sub-bar">
                <div className="sub-bar-fill" style={{width: `${(s.monthly/subTotalMonthly)*100}%`}}/>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Forecast */}
      <Card title="Önümüzdeki ay tahmini" subtitle="Hareketli ortalamaya göre">
        <div className="fc-grid">
          <div className="fc-card">
            <div className="fc-l">Beklenen gelir</div>
            <div className="fc-v pos"><Money value={fcInc} sign="neutral" hide={!showBalances}/></div>
            <div className="fc-s">Geçen 3 ayın ortalaması</div>
          </div>
          <div className="fc-card">
            <div className="fc-l">Beklenen gider</div>
            <div className="fc-v neg"><Money value={fcExp} sign="neutral" hide={!showBalances}/></div>
            <div className="fc-s">±₺{APP_DATA.fmtShort(fcExp * 0.08)} aralığında</div>
          </div>
          <div className="fc-card">
            <div className="fc-l">Tahmini birikim</div>
            <div className="fc-v"><Money value={fcNet} sign="auto" hide={!showBalances}/></div>
            <div className="fc-s">Tasarruf oranı %{fcSave.toFixed(1)}</div>
          </div>
          <div className="fc-card fc-card-action">
            <div className="fc-l">12 ayda öngörülen birikim</div>
            <div className="fc-v"><Money value={netWorthData[netWorthData.length-1].value + fcNet * 12} sign="neutral" hide={!showBalances}/></div>
            <div className="fc-s">Mevcut hızda devam ederse</div>
          </div>
        </div>
      </Card>

      <Card title="Akıllı içgörüler" subtitle="Verilerinden çıkarılan öneriler">
        <div className="insights">
          <div className="insight">
            <div className="insight-icon" style={{ background: "rgba(34,197,94,0.12)", color: "var(--pos)" }}><Icon name="sparkles" size={16} /></div>
            <div className="insight-b">
              <div className="insight-t">Tasarruf oranın hedefin {avgSave > 25 ? "üzerinde" : "altında"}</div>
              <div className="insight-d">Son {monthsCount} ay gelirin %{avgSave.toFixed(1)}'ini biriktirdin · Hedef: %25</div>
            </div>
            <div className="insight-stat mono">%{avgSave.toFixed(0)}</div>
          </div>
          {growers[0] && (
            <div className="insight">
              <div className="insight-icon" style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}><Icon name="bell" size={16} /></div>
              <div className="insight-b">
                <div className="insight-t">{growers[0].label} harcaman önceki döneme göre arttı</div>
                <div className="insight-d">Önceki dönem ₺{APP_DATA.fmt(growers[0].prev)}, bu dönem ₺{APP_DATA.fmt(growers[0].value)} ödedin</div>
              </div>
              <div className="insight-stat neg mono">{fmtDelta(growers[0].delta)}</div>
            </div>
          )}
          <div className="insight">
            <div className="insight-icon" style={{ background: "rgba(14,165,233,0.12)", color: "#0ea5e9" }}><Icon name="repeat" size={16} /></div>
            <div className="insight-b">
              <div className="insight-t">{uniqueSubs.length} aktif abonelik tespit edildi</div>
              <div className="insight-d">Aylık toplam ₺{APP_DATA.fmt(subTotalMonthly)} · Yıllık ₺{APP_DATA.fmt(subTotalMonthly * 12)} ödüyorsun</div>
            </div>
            <div className="insight-stat mono">{uniqueSubs.length}</div>
          </div>
          <div className="insight">
            <div className="insight-icon" style={{ background: "rgba(168,85,247,0.12)", color: "#a855f7" }}><Icon name="chart" size={16} /></div>
            <div className="insight-b">
              <div className="insight-t">{dowLabels[peakDow]} günleri ortalamadan %{(((dowTotals[peakDow]/dowCounts[peakDow]||0) / (totalOut/rangeTx.filter(t=>t.amount<0).length) - 1) * 100).toFixed(0)} daha fazla harcıyorsun</div>
              <div className="insight-d">Hafta sonu ve maaş günü etrafında harcama yoğunlaşıyor</div>
            </div>
            <div className="insight-stat mono">{dowLabels[peakDow]}</div>
          </div>
        </div>
      </Card>

      <BehavioralInsights transactions={transactions} today={today} />
    </div>);

}

// KPI helper component
function KpiCard({ label, value, delta, positiveIsGood, color, series, hide, signAware, isPercent }) {
  const goodDelta = positiveIsGood ? delta >= 0 : delta <= 0;
  const cls = `kpi-d ${goodDelta ? "pos" : "neg"}`;
  const fmtVal = typeof value === "string" ? value : null;
  return (
    <div className="kpi">
      <div className="kpi-l">{label}</div>
      {fmtVal
        ? <div className="kpi-v mono">{fmtVal}</div>
        : <div className="kpi-v"><Money value={value} sign={signAware ? "auto" : "neutral"} hide={hide}/></div>
      }
      <div className={cls}>
        <Icon name={goodDelta ? "arrowDown" : "arrowUp"} size={11}/>
        {Math.abs(delta).toFixed(1)}{isPercent ? "p" : "%"}
        <span className="kpi-d-vs">önceki dönem</span>
      </div>
      <div className="kpi-spark"><Sparkline values={series} color={color} height={32}/></div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
// DEBTS
// ════════════════════════════════════════════════════════
function DebtsView({ ctx }) {
  const { showBalances, accounts, debts, addDebt, removeDebt, payDebt, addAccount, payCard, cashAdvance } = ctx;
  const [payOpen, setPayOpen] = useStateV(null); // { debt, mode }
  const [newCardOpen, setNewCardOpen] = useStateV(false);
  const [cardPayOpen, setCardPayOpen] = useStateV(null); // card account being paid
  const [cardAdvOpen, setCardAdvOpen] = useStateV(null); // card account for cash advance
  const [addOpen, setAddOpen] = useStateV(false);
  const [stratOpen, setStratOpen] = useStateV(false);
  const [cardBurdenMode, setCardBurdenMode] = useStateV("full"); // "full" | "min"
  const totalRemaining = debts.reduce((s, d) => s + d.remaining, 0);
  const totalPrincipal = debts.reduce((s, d) => s + d.principal, 0);
  const totalMonthly = debts.reduce((s, d) => s + d.monthly, 0);
  const paid = totalPrincipal - totalRemaining;

  // monthly income estimate (from last 60 days of income tx)
  const today = appToday();
  const incomeWindow = new Date(today); incomeWindow.setDate(today.getDate() - 60);
  const recentIncome = ctx.transactions.filter(t => !isTransferLeg(t) && t.amount > 0 && new Date(t.date) >= incomeWindow).reduce((s,t)=>s+t.amount,0);
  const monthlyIncome = recentIncome / 2 || 0;

  // category counts
  const creditCount = debts.filter(d => d.type.includes("Kredi") && !d.type.includes("Kart")).length;
  const cardCount = debts.filter(d => d.type.includes("Kart")).length;
  const personalCount = debts.filter(d => d.type.includes("Faizsiz") || d.lender === "Kişisel").length;
  const countParts = [];
  if (creditCount) countParts.push(`${creditCount} kredi`);
  if (cardCount) countParts.push(`${cardCount} kart`);
  if (personalCount) countParts.push(`${personalCount} kişisel`);

  // Highest-interest debt (for avalanche highlight)
  const sortedByRate = [...debts].sort((a, b) => b.rate - a.rate);
  const highestRate = sortedByRate[0];
  const sortedBySize = [...debts].filter(d => d.remaining > 0).sort((a, b) => a.remaining - b.remaining);
  const smallest = sortedBySize[0];

  // Simple payoff estimation (months to clear at current monthly payments, ignoring compounding nuance)
  const estMonths = totalMonthly > 0 ? Math.ceil(totalRemaining / totalMonthly) : 0;
  const payoffDate = new Date(today.getFullYear(), today.getMonth() + estMonths, 1);
  const payoffLabel = payoffDate.toLocaleDateString("tr-TR", { month: "short", year: "numeric" });

  // Kredi kartları — tek doğruluk kaynağı: hesap bakiyesi (devreden borç)
  const cards = accounts.filter((a) => a.type.includes("Kart"));
  const cardData = cards.map((a) => {
    const owed = Math.max(0, -a.balance);
    const limit = a.limit || 0;
    const util = limit ? owed / limit * 100 : 0;
    const minPay = owed > 0 ? Math.max(Math.round(owed * 0.20), Math.min(owed, 100)) : 0;
    return { ...a, owed, limit, util, available: Math.max(0, limit - owed), minPay };
  });
  const totalCardOwed = cardData.reduce((s, c) => s + c.owed, 0);
  const totalCardLimit = cardData.reduce((s, c) => s + c.limit, 0);
  const totalMinPay = cardData.reduce((s, c) => s + c.minPay, 0);
  const totalCardUtil = totalCardLimit ? totalCardOwed / totalCardLimit * 100 : 0;

  if (debts.length === 0 && cardData.length === 0) {
    return (
      <div className="view view-debts">
        <div className="page-head">
          <div>
            <h1 className="page-title">Borç ve kredi takibi</h1>
            <p className="page-sub">Tüm yükümlülüklerin tek bir yerde</p>
          </div>
        </div>
        <div className="empty-big">
          <div className="empty-big-icon"><Icon name="debt" size={28}/></div>
          <div className="empty-big-t">Henüz borç eklemedin</div>
          <p className="empty-big-d">Kredi, kredi kartı veya kişisel borçlarını ekleyerek ödeme planını tek yerden takip et. Çığ ve kartopu yöntemi gibi ödeme stratejilerini karşılaştır.</p>
          <button className="btn btn-primary btn-md" onClick={()=>setAddOpen(true)}><Icon name="plus" size={16}/>İlk borcunu ekle</button>
        </div>
        <AddDebtModal open={addOpen} onClose={()=>setAddOpen(false)} onSubmit={(d)=>{ addDebt(d); setAddOpen(false); }}/>
      </div>
    );
  }

  return (
    <div className="view view-debts">
      <div className="page-head">
        <div>
          <h1 className="page-title">Borç ve kredi takibi</h1>
          <p className="page-sub">Tüm yükümlülüklerin tek bir yerde</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-md" onClick={()=>setStratOpen(true)}><Icon name="chart" size={16} />Erken kapama simülasyonu</button>
          <button className="btn btn-primary btn-md" onClick={()=>setAddOpen(true)}><Icon name="plus" size={16} />Borç ekle</button>
        </div>
      </div>

      <div className="debt-hero">
        <div className="dh-card dh-main">
          <div className="dh-label">Toplam kalan borç</div>
          <div className="dh-amt"><Money value={totalRemaining} sign="neutral" hide={!showBalances} /></div>
          <div className="dh-bar">
            <div className="dh-bar-fill" style={{ width: `${totalPrincipal ? paid / totalPrincipal * 100 : 0}%` }} />
          </div>
          <div className="dh-meta">
            <span>Ödenen: <strong className="mono">₺{APP_DATA.fmtShort(paid)}</strong></span>
            <span>·</span>
            <span>Anapara: <strong className="mono">₺{APP_DATA.fmtShort(totalPrincipal)}</strong></span>
            <span>·</span>
            <span className="pos">%{totalPrincipal ? (paid / totalPrincipal * 100).toFixed(1) : "0,0"} tamamlandı</span>
          </div>
        </div>
        <div className="dh-card">
          <div className="dh-label-row">
            <div className="dh-label">Aylık toplam ödeme yükü</div>
            {totalCardOwed > 0 && (
              <div className="dh-seg">
                <button className={cardBurdenMode === "full" ? "dh-seg-act" : ""} onClick={() => setCardBurdenMode("full")}>Tüm kart borcu</button>
                <button className={cardBurdenMode === "min" ? "dh-seg-act" : ""} onClick={() => setCardBurdenMode("min")}>Asgari</button>
              </div>
            )}
          </div>
          <div className="dh-amt"><Money value={totalMonthly + (cardBurdenMode === "full" ? totalCardOwed : totalMinPay)} sign="neutral" hide={!showBalances} /></div>
          <div className="dh-sub">
            {monthlyIncome > 0 ? `Gelirinin %${((totalMonthly + (cardBurdenMode === "full" ? totalCardOwed : totalMinPay)) / monthlyIncome * 100).toFixed(1)}'i` : "Tahmini borçsuz olma: " + payoffLabel}
            {totalCardOwed > 0 && <> · <span className="mono">₺{APP_DATA.fmtShort(totalMonthly)}</span> kredi taksiti + <span className="mono">₺{APP_DATA.fmtShort(cardBurdenMode === "full" ? totalCardOwed : totalMinPay)}</span> kart {cardBurdenMode === "full" ? "(tüm borç)" : "(asgari)"}</>}
          </div>
        </div>
        <div className="dh-card">
          <div className="dh-label">Aktif borç sayısı</div>
          <div className="dh-amt mono">{debts.length}</div>
          <div className="dh-sub">{countParts.join(" · ") || "—"}</div>
        </div>
      </div>

      <Card
        title="Kredi Kartları"
        subtitle="Canlı hesap bakiyesinden · devreden borç ve kullanım"
        padded={false}
        action={<button className="btn btn-ghost btn-sm" onClick={()=>setNewCardOpen(true)}><Icon name="plus" size={14} />Kart ekle</button>}
      >
        {cardData.length > 0 && (
        <div className="cc-summary">
            <div className="cc-sum-item">
              <div className="cc-sum-l">Toplam kart borcu</div>
              <div className="cc-sum-v neg"><Money value={totalCardOwed} sign="neutral" hide={!showBalances} /></div>
            </div>
            <div className="cc-sum-item">
              <div className="cc-sum-l">Toplam limit</div>
              <div className="cc-sum-v mono">₺{APP_DATA.fmtShort(totalCardLimit)}</div>
            </div>
            <div className="cc-sum-item">
              <div className="cc-sum-l">Kullanım</div>
              <div className={`cc-sum-v mono ${totalCardUtil > 70 ? "neg" : totalCardUtil > 40 ? "warn" : "pos"}`}>%{totalCardUtil.toFixed(0)}</div>
            </div>
            <div className="cc-sum-item">
              <div className="cc-sum-l">Tahmini asgari ödeme</div>
              <div className="cc-sum-v mono"><Money value={totalMinPay} sign="neutral" hide={!showBalances} /></div>
            </div>
          </div>
        )}
          <div className="cc-list">
            {cardData.map((c) => (
              <div key={c.id} className="cc-card">
                <div className="cc-card-top">
                  <div className="cc-card-id">
                    <span className="cc-chip" style={{ background: `${c.color}22`, color: c.color }}><Icon name="card" size={16} /></span>
                    <div>
                      <div className="cc-card-n">{c.name}</div>
                      <div className="cc-card-num mono">{c.number}</div>
                    </div>
                  </div>
                  <div className="cc-card-owed">
                    <div className="cc-card-owed-l">Borç</div>
                    <div className="cc-card-owed-v"><Money value={c.owed} sign="neutral" hide={!showBalances} /></div>
                  </div>
                </div>
                <div className="cc-util">
                  <div className="cc-util-bar">
                    <div className="cc-util-fill" style={{ width: `${Math.min(100, c.util)}%`, background: c.util > 70 ? "var(--neg)" : c.util > 40 ? "var(--warn)" : c.color }} />
                  </div>
                  <span className={`cc-util-pct mono ${c.util > 70 ? "neg" : ""}`}>%{c.util.toFixed(0)}</span>
                </div>
                <div className="cc-card-meta">
                  <span>Limit <strong className="mono">₺{APP_DATA.fmtShort(c.limit)}</strong></span>
                  <span>Kullanılabilir <strong className="mono pos">₺{APP_DATA.fmtShort(c.available)}</strong></span>
                  <span>Asgari <strong className="mono">₺{APP_DATA.fmt(c.minPay)}</strong></span>
                </div>
                <div className="cc-card-actions">
                  <button className="btn btn-primary btn-sm cc-pay-btn" onClick={()=>setCardPayOpen(c)} disabled={c.owed <= 0}>
                    <Icon name="wallet" size={14} />{c.owed <= 0 ? "Borç yok" : "Borcu öde"}
                  </button>
                  <button className="btn btn-ghost btn-sm cc-adv-btn" onClick={()=>setCardAdvOpen(c)} disabled={c.available <= 0} title={c.available <= 0 ? "Kullanılabilir limit yok" : "Karttan nakit çek"}>
                    <Icon name="trendingUp" size={14} />Avans çek
                  </button>
                </div>
              </div>
            ))}
            <button className="cc-card cc-card-add" onClick={()=>setNewCardOpen(true)}>
              <Icon name="plus" size={26} />
              <span>Kredi kartı ekle</span>
            </button>
          </div>
        </Card>

      {debts.length > 0 && (
      <Card title="Borç ödeme planı" subtitle="Kalan borç + aylık taksit" padded={false}>
        <table className="debt-table">
          <thead>
            <tr>
              <th>Borç</th>
              <th>Kreditör</th>
              <th>Faiz</th>
              <th>Aylık taksit</th>
              <th>İlerleme</th>
              <th>Kalan</th>
              <th>Sonraki ödeme</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {debts.map((d) => {
              const pct = d.principal ? (d.principal - d.remaining) / d.principal * 100 : 0;
              return (
                <tr key={d.id}>
                  <td>
                    <div className="debt-name-cell">
                      <div className="debt-dot" style={{ background: d.color }} />
                      <div>
                        <div className="debt-n">{d.name}</div>
                        <div className="debt-t">{d.type}</div>
                      </div>
                    </div>
                  </td>
                  <td>{d.lender}</td>
                  <td className="mono">{d.rate > 0 ? `%${d.rate.toFixed(2).replace(".", ",")}` : "—"}</td>
                  <td className="mono"><Money value={d.monthly} sign="neutral" hide={!showBalances} /></td>
                  <td>
                    <div className="debt-prog-cell">
                      <Progress value={pct} max={100} color={d.color} height={5} />
                      <span className="debt-prog-l mono">
                        {d.paid != null ? `${d.paid}/${d.term}` : `%${pct.toFixed(0)}`}
                      </span>
                    </div>
                  </td>
                  <td className="mono"><Money value={d.remaining} sign="neutral" hide={!showBalances} /></td>
                  <td>{d.nextPayment ? fmtDateLong(d.nextPayment) : "—"}</td>
                  <td>
                    <div className="debt-row-actions">
                      <button className="icon-btn" title="Ödeme yap" onClick={()=>setPayOpen({ debt: d, mode: d.type.includes("Kart") ? "full" : "min" })}>
                        <Icon name="wallet" size={15}/>
                      </button>
                      <button className="icon-btn" title="Sil" onClick={()=>{
                        if (confirm(`${d.name} borcunu silmek istediğine emin misin?`)) removeDebt(d.id);
                      }}>
                        <Icon name="x" size={15}/>
                      </button>
                    </div>
                  </td>
                </tr>);

            })}
          </tbody>
        </table>
      </Card>
      )}

      {debts.length >= 2 && (
        <Card title="Ödeme stratejisi karşılaştırması" subtitle="Hangi yöntemle daha hızlı borçtan çıkarsın?">
          <div className="strat-row">
            <div className="strat-card strat-card-act">
              <div className="strat-h">
                <div className="strat-t">Çığ Yöntemi</div>
                <span className="badge badge-acc">Önerilen</span>
              </div>
              <div className="strat-d">En yüksek faizden başla{highestRate && highestRate.rate > 0 ? `: ${highestRate.name} (%${highestRate.rate.toFixed(2).replace(".", ",")})` : ""}. Toplam faizi en aza indirir.</div>
              <div className="strat-stats">
                <div><div className="strat-s-l">İlk hedef</div><div className="strat-s-v mono">{highestRate?.name || "—"}</div></div>
                <div><div className="strat-s-l">Tahmini bitiş</div><div className="strat-s-v mono">{payoffLabel}</div></div>
              </div>
            </div>
            <div className="strat-card">
              <div className="strat-h">
                <div className="strat-t">Kartopu Yöntemi</div>
              </div>
              <div className="strat-d">En küçük borçtan başla{smallest ? `: ${smallest.name} (₺${APP_DATA.fmtShort(smallest.remaining)})` : ""}. Motivasyon için iyi.</div>
              <div className="strat-stats">
                <div><div className="strat-s-l">İlk hedef</div><div className="strat-s-v mono">{smallest?.name || "—"}</div></div>
                <div><div className="strat-s-l">Tahmini bitiş</div><div className="strat-s-v mono">{payoffLabel}</div></div>
              </div>
            </div>
          </div>
        </Card>
      )}

      <PayDebtModal
        open={!!payOpen}
        payment={payOpen}
        accounts={accounts}
        onClose={()=>setPayOpen(null)}
        onPay={(payload) => {
          payDebt({
            debtId: payOpen.debt.id,
            fromAccount: payload.fromAccount,
            amount: payload.amount,
            note: payload.mode === "installment" ? `${payOpen.debt.name} taksitli ödeme (${payload.months} ay)` : `${payOpen.debt.name} borç ödemesi`,
          });
          setPayOpen(null);
        }}
      />
      <AddDebtModal open={addOpen} onClose={()=>setAddOpen(false)} onSubmit={(d)=>{ addDebt(d); setAddOpen(false); }}/>
      <PayoffSimModal open={stratOpen} debts={debts} onClose={()=>setStratOpen(false)}/>
      <NewAccountModal
        open={newCardOpen}
        initialType="Kredi Kartı"
        onClose={()=>setNewCardOpen(false)}
        onSubmit={(payload)=>{ addAccount(payload); setNewCardOpen(false); }}
      />
      <CardPayModal
        card={cardPayOpen}
        accounts={accounts}
        onClose={()=>setCardPayOpen(null)}
        onPay={(amount, fromAccount)=>{ payCard({ cardId: cardPayOpen.id, fromAccount, amount }); setCardPayOpen(null); }}
      />
      <CashAdvanceModal
        card={cardAdvOpen}
        accounts={accounts}
        onClose={()=>setCardAdvOpen(null)}
        onAdvance={(amount, toAccount, feeRate)=>{ cashAdvance({ cardId: cardAdvOpen.id, toAccount, amount, feeRate }); setCardAdvOpen(null); }}
      />
    </div>);

}

// ════════════════════════════════════════════════════════
// ACCOUNTS
// ════════════════════════════════════════════════════════
function AccountsView({ ctx }) {
  const { showBalances, transactions, addTransfer, accounts, addAccount, removeAccount, updateAccount, reorderAccounts } = ctx;
  const today = appToday();
  const [transferOpen, setTransferOpen] = useStateV(false);
  const [transferFrom, setTransferFrom] = useStateV(null);
  const [newAcctOpen, setNewAcctOpen] = useStateV(false);
  const [editAcct, setEditAcct] = useStateV(null);
  const [detailAcct, setDetailAcct] = useStateV(null); // açık hesap detayı
  const [menuOpen, setMenuOpen] = useStateV(null); // account id
  const [showArchived, setShowArchived] = useStateV(false);
  const [dragId, setDragId] = useStateV(null);

  useEffectV(() => {
    if (!menuOpen) return;
    const onDoc = (e) => {
      if (!e.target.closest('.acc-menu-host')) setMenuOpen(null);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [menuOpen]);

  const cash = accounts.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0);
  const debt = -accounts.filter((a) => a.balance < 0).reduce((s, a) => s + a.balance, 0);
  const totalLimit = accounts.filter((a) => a.limit).reduce((s, a) => s + a.limit, 0);

  // Activity per account + 30-günlük bakiye sparkline + net akış
  const last30 = new Date(today);last30.setDate(today.getDate() - 30);
  const activity = accounts.map((a) => {
    const txs = transactions.filter((t) => t.account === a.id && new Date(t.date) >= last30);
    const inc = txs.filter((t) => t.amount > 0 && !isTransferLeg(t) && !isDebtPayment(t)).reduce((s, t) => s + t.amount, 0);
    const exp = -txs.filter((t) => t.amount < 0 && !isTransferLeg(t) && !isDebtPayment(t)).reduce((s, t) => s + t.amount, 0);
    const allTxs = transactions.filter((t) => t.account === a.id && new Date(t.date) >= last30);
    const net30 = allTxs.reduce((s, t) => s + t.amount, 0);
    // Bakiye geçmişini geriye sararak hesapla (bugünden 30 gün öncesine)
    const series = [];
    let bal = a.balance;
    const dayBuckets = {};
    allTxs.forEach((t) => { const k = localYMD(new Date(t.date)); dayBuckets[k] = (dayBuckets[k] || 0) + t.amount; });
    for (let i = 0; i <= 30; i++) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      series.unshift(bal);
      bal -= (dayBuckets[localYMD(d)] || 0);
    }
    // O hesaptan en çok harcanan kategori
    const catSpend = {};
    txs.forEach((t) => { if (t.amount < 0 && !isTransferLeg(t) && !isDebtPayment(t)) catSpend[t.category] = (catSpend[t.category] || 0) + -t.amount; });
    const topCatId = Object.keys(catSpend).sort((x, y) => catSpend[y] - catSpend[x])[0];
    const topCat = topCatId ? (APP_DATA.categories.find((c) => c.id === topCatId) || null) : null;
    return { ...a, count: txs.length, inc, exp, net30, series, recent: txs.slice(0, 3), topCat, topCatAmt: topCatId ? catSpend[topCatId] : 0 };
  });

  // Split into bank/cash accounts vs credit cards (arşivlenmişler ayrı)
  const visibleActivity = activity.filter((a) => showArchived ? true : !a.archived);
  const archivedCount = activity.filter((a) => a.archived).length;
  const cardAccounts = visibleActivity.filter((a) => a.type.includes("Kart"));
  const bankAccounts = visibleActivity.filter((a) => !a.type.includes("Kart"));

  // Para dağılımı (pozitif bakiyeli hesaplar)
  const distSegs = bankAccounts.filter((a) => a.balance > 0)
    .map((a) => ({ label: a.name, value: a.balance, color: a.color }))
    .sort((x, y) => y.value - x.value);

  // 30 günlük bakiye sparkline çizgisi üreten helper
  const sparkPath = (series, w = 120, h = 32) => {
    if (!series || series.length < 2) return { line: "", up: true };
    const min = Math.min(...series), max = Math.max(...series);
    const range = (max - min) || 1;
    const pts = series.map((v, i) => {
      const x = i / (series.length - 1) * w;
      const y = h - 2 - ((v - min) / range) * (h - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return { line: "M" + pts.join(" L"), up: series[series.length - 1] >= series[0] };
  };

  const renderAccountCard = (a) => {
    const isCard = a.type.includes("Kart");
    const pct = isCard && a.limit ? -a.balance / a.limit * 100 : 0;
    return (
      <div
        key={a.id}
        className={`acc-detail ${a.archived ? "acc-archived" : ""} ${dragId === a.id ? "acc-dragging" : ""}`}
        draggable
        onDragStart={(e) => { setDragId(a.id); e.dataTransfer.effectAllowed = "move"; }}
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={(e) => { e.preventDefault(); if (dragId && dragId !== a.id) reorderAccounts(dragId, a.id); setDragId(null); }}
        onDragEnd={() => setDragId(null)}
      >
        <header className="acc-detail-h">
          <div className="acc-detail-id">
            <span className="acc-drag-handle" title="Sürükle"><Icon name="more" size={14} /></span>
            <div className="acc-detail-dot" style={{ background: a.color }} />
            <div>
              <div className="acc-detail-n">{a.name}{a.archived && <span className="acc-arch-tag">Arşiv</span>}</div>
              <div className="acc-detail-t">{a.type}</div>
            </div>
          </div>
          <div className="acc-menu-host">
            <button className="icon-btn" onClick={(e)=>{e.stopPropagation(); setMenuOpen(menuOpen===a.id?null:a.id);}}>
              <Icon name="more" size={16} />
            </button>
            {menuOpen === a.id && (
              <div className="acc-menu">
                <button className="acc-menu-i" onClick={()=>{setMenuOpen(null); setTransferFrom(a.id); setTransferOpen(true);}}>
                  <Icon name="repeat" size={14}/>Transfer yap
                </button>
                <button className="acc-menu-i" onClick={()=>{setMenuOpen(null); setEditAcct(a);}}>
                  <Icon name="edit" size={14}/>Hesabı düzenle
                </button>
                <button className="acc-menu-i" onClick={()=>{setMenuOpen(null); setDetailAcct(a);}}>
                  <Icon name="list" size={14}/>İşlemleri gör
                </button>
                <button className="acc-menu-i" onClick={()=>{setMenuOpen(null); updateAccount(a.id, { archived: !a.archived });}}>
                  <Icon name={a.archived ? "eye" : "eyeOff"} size={14}/>{a.archived ? "Arşivden çıkar" : "Arşivle"}
                </button>
                <div className="acc-menu-sep"/>
                <button className="acc-menu-i acc-menu-i-danger" onClick={()=>{
                  if (confirm(`${a.name} hesabını silmek istediğine emin misin? Bu hesaba ait tüm işlemler de silinecek.`)) {
                    removeAccount(a.id);
                    setMenuOpen(null);
                  }
                }}>
                  <Icon name="x" size={14}/>Hesabı sil
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="acc-detail-num mono">{a.number}</div>

        <div className="acc-detail-bal">
          <div className="acc-detail-bal-l">{isCard ? "Mevcut borç" : "Kullanılabilir bakiye"}</div>
          <div className="acc-detail-bal-v">
            <Money value={a.balance} sign={isCard ? "auto" : "neutral"} hide={!showBalances} />
          </div>
          {!isCard && (() => { const sp = sparkPath(a.series); return (
            <div className="acc-spark">
              <svg viewBox="0 0 120 32" preserveAspectRatio="none" className="acc-spark-svg">
                <path d={sp.line} fill="none" stroke={a.net30 >= 0 ? "var(--pos)" : "var(--neg)"} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
              <span className={`acc-spark-net mono ${a.net30 >= 0 ? "pos" : "neg"}`}>{a.net30 >= 0 ? "▲ +" : "▼ −"}₺{APP_DATA.fmtShort(Math.abs(a.net30))}</span>
            </div>
          ); })()}
        </div>

        {isCard && a.limit &&
        <div className="acc-detail-limit">
            <div className="acc-detail-limit-h">
              <span>Limit kullanımı</span>
              <span className="mono">₺{APP_DATA.fmtShort(-a.balance)} / ₺{APP_DATA.fmtShort(a.limit)}</span>
            </div>
            <Progress value={-a.balance} max={a.limit} color={a.color} height={6} />
            <div className="acc-detail-limit-f">
              <span>Kullanılabilir <span className="mono">₺{APP_DATA.fmt(a.limit + a.balance)}</span></span>
              <span className={pct > 70 ? "neg" : pct > 40 ? "warn" : "pos"}>%{pct.toFixed(0)}</span>
            </div>
            {-a.balance > 0 && (
              <div className="acc-card-info">
                <div className="acc-card-info-i">
                  <span className="acc-card-info-l">Asgari ödeme</span>
                  <span className="acc-card-info-v mono">₺{APP_DATA.fmt(Math.max(Math.round(-a.balance * 0.20), Math.min(-a.balance, 100)))}</span>
                </div>
                <div className="acc-card-info-i">
                  <span className="acc-card-info-l">Aylık faiz yükü</span>
                  <span className="acc-card-info-v mono neg">₺{APP_DATA.fmt(-a.balance * ((a.rate || 4.25) / 100))}</span>
                </div>
              </div>
            )}
          </div>
        }

        <div className="acc-detail-act">
          <div className="acc-detail-act-h">Son 30 gün</div>
          <div className="acc-detail-act-row">
            <div>
              <div className="acc-detail-act-l">Gelir</div>
              <div className="acc-detail-act-v pos mono">+₺{APP_DATA.fmtShort(a.inc)}</div>
            </div>
            <div>
              <div className="acc-detail-act-l">Gider</div>
              <div className="acc-detail-act-v neg mono">−₺{APP_DATA.fmtShort(a.exp)}</div>
            </div>
            <div>
              <div className="acc-detail-act-l">İşlem</div>
              <div className="acc-detail-act-v mono">{a.count}</div>
            </div>
          </div>
          {a.topCat && (
            <div className="acc-detail-topcat">
              <span className="acc-dist-dot" style={{ background: a.topCat.color }} />
              <span>En çok: <strong>{a.topCat.label}</strong></span>
              <span className="mono">₺{APP_DATA.fmtShort(a.topCatAmt)}</span>
            </div>
          )}
        </div>

        <div className="acc-detail-foot">
          <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={()=>setDetailAcct(a)}>
            <Icon name="list" size={14} />İşlemleri gör
          </button>
          <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={()=>{setTransferFrom(a.id); setTransferOpen(true);}}>
            <Icon name="arrowRight" size={14} />Transfer
          </button>
        </div>
      </div>);
  };

  return (
    <div className="view view-accounts">
      <div className="page-head">
        <div>
          <h1 className="page-title">Hesaplar ve kartlar</h1>
          <p className="page-sub">{accounts.length} aktif hesap · Tüm varlıklarını ve kartlarını yönet</p>
        </div>
        <div className="page-actions">
          {archivedCount > 0 && (
            <button className={`btn btn-md ${showArchived ? "btn-primary" : "btn-ghost"}`} onClick={()=>setShowArchived(v=>!v)}><Icon name={showArchived ? "eye" : "eyeOff"} size={16} />Arşiv ({archivedCount})</button>
          )}
          <button className="btn btn-ghost btn-md" onClick={()=>{setTransferFrom(null); setTransferOpen(true);}}><Icon name="repeat" size={16} />Hesaplar arası transfer</button>
          <button className="btn btn-primary btn-md" onClick={()=>setNewAcctOpen(true)}><Icon name="plus" size={16} />Yeni hesap ekle</button>
        </div>
      </div>

      <div className="acc-overview">
        <div className="ao-card">
          <div className="ao-l">Toplam nakit varlık</div>
          <div className="ao-v pos"><Money value={cash} sign="neutral" hide={!showBalances} /></div>
          <div className="ao-s">{accounts.filter((a) => a.balance > 0).length} hesap</div>
        </div>
        <div className="ao-card">
          <div className="ao-l">Kredi kartı borcu</div>
          <div className="ao-v neg"><Money value={debt} sign="neutral" hide={!showBalances} /></div>
          <div className="ao-s">{cardAccounts.length} kart{totalLimit > 0 ? ` · ₺${APP_DATA.fmtShort(totalLimit)} toplam limit` : ""}</div>
        </div>
        <div className="ao-card">
          <div className="ao-l">Net likit pozisyon</div>
          <div className="ao-v"><Money value={cash - debt} sign="neutral" hide={!showBalances} /></div>
          <div className="ao-s">{totalLimit > 0 ? `Limit kullanımı %${Math.round(debt / totalLimit * 100)}` : "—"}</div>
        </div>
        {distSegs.length > 0 && (
          <div className="ao-card ao-card-dist">
            <div className="ao-l">Para dağılımı</div>
            <div className="acc-dist">
              <Donut segments={distSegs} size={64} thickness={9} center={<span className="acc-dist-c mono">{distSegs.length}</span>} formatTooltipValue={(v) => "₺" + APP_DATA.fmtShort(v)} />
              <div className="acc-dist-legend">
                {distSegs.slice(0, 3).map((s) => (
                  <div key={s.label} className="acc-dist-row">
                    <span className="acc-dist-dot" style={{ background: s.color }} />
                    <span className="acc-dist-n">{s.label}</span>
                    <span className="acc-dist-p mono">%{Math.round(s.value / cash * 100)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Banka & vadesiz hesaplar */}
      <div className="acc-group">
        <div className="acc-group-h">
          <div className="acc-group-title">
            <Icon name="wallet" size={16} />
            <span>Banka hesapları</span>
            <span className="acc-group-count">{bankAccounts.length}</span>
          </div>
          {bankAccounts.length > 0 && (
            <div className="acc-group-sum">
              Toplam <span className="mono pos">₺{APP_DATA.fmt(bankAccounts.reduce((s,a)=>s+a.balance,0))}</span>
            </div>
          )}
        </div>
        <div className="acc-detail-grid">
          {bankAccounts.map(renderAccountCard)}
          <button className="acc-detail acc-detail-add" onClick={()=>setNewAcctOpen(true)}>
            <Icon name="plus" size={28} />
            <div className="acc-detail-add-t">Banka hesabı ekle</div>
            <div className="acc-detail-add-s">Vadesiz, maaş, birikim veya e-cüzdan</div>
          </button>
        </div>
      </div>

      {/* Kredi kartları */}
      <div className="acc-group">
        <div className="acc-group-h">
          <div className="acc-group-title">
            <Icon name="card" size={16} />
            <span>Kredi kartları</span>
            <span className="acc-group-count">{cardAccounts.length}</span>
          </div>
          {cardAccounts.length > 0 && (
            <div className="acc-group-sum">
              Toplam borç <span className="mono neg">₺{APP_DATA.fmt(-cardAccounts.reduce((s,a)=>s+a.balance,0))}</span>
            </div>
          )}
        </div>
        <div className="acc-detail-grid">
          {cardAccounts.map(renderAccountCard)}
          <button className="acc-detail acc-detail-add" onClick={()=>setNewAcctOpen(true)}>
            <Icon name="plus" size={28} />
            <div className="acc-detail-add-t">Kredi kartı ekle</div>
            <div className="acc-detail-add-s">Limit ve mevcut borcunu takip et</div>
          </button>
        </div>
      </div>

      <TransferModal
        open={transferOpen}
        initialFrom={transferFrom}
        accounts={accounts}
        onClose={()=>setTransferOpen(false)}
        onSubmit={(payload) => { addTransfer(payload); setTransferOpen(false); }}
      />
      <NewAccountModal
        open={newAcctOpen}
        onClose={()=>setNewAcctOpen(false)}
        onSubmit={(payload) => { addAccount(payload); setNewAcctOpen(false); }}
      />
      <NewAccountModal
        open={!!editAcct}
        editing={editAcct}
        onClose={()=>setEditAcct(null)}
        onSubmit={(payload) => { updateAccount(editAcct.id, payload); setEditAcct(null); }}
      />
      <AccountDetailModal
        account={detailAcct}
        transactions={transactions}
        showBalances={showBalances}
        onClose={()=>setDetailAcct(null)}
        onTransfer={(id)=>{ setDetailAcct(null); setTransferFrom(id); setTransferOpen(true); }}
        onEdit={(a)=>{ setDetailAcct(null); setEditAcct(a); }}
      />
    </div>);

}

function TransferModal({ open, initialFrom, accounts, onClose, onSubmit }) {
  const allAccounts = accounts || APP_DATA.accounts;
  const cashAccounts = allAccounts.filter(a => !a.type.includes("Kart"));
  const [from, setFrom] = useStateV(cashAccounts[0]?.id);
  const [to, setTo] = useStateV(null);
  const [amount, setAmount] = useStateV("");
  const [note, setNote] = useStateV("");

  useEffectV(() => {
    if (open) {
      const f = initialFrom || cashAccounts[0]?.id;
      setFrom(f);
      const firstOther = allAccounts.find(a => a.id !== f);
      setTo(firstOther?.id);
      setAmount("");
      setNote("");
    }
  }, [open, initialFrom]);

  useEffectV(() => {
    if (!open) return;
    const onEsc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  const fromAcc = allAccounts.find(a => a.id === from);
  const toAcc = allAccounts.find(a => a.id === to);
  const amt = parseFloat(String(amount).replace(",", ".")) || 0;
  const canSubmit = from && to && from !== to && amt > 0;
  const insufficient = fromAcc && fromAcc.balance > 0 && amt > fromAcc.balance;

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ from, to, amount: amt, note });
  };

  return (
    <div className="modal-bd" onClick={onClose}>
      <form className="modal" onClick={(e)=>e.stopPropagation()} onSubmit={submit}>
        <header className="modal-h">
          <div>
            <h2>Hesaplar arası transfer</h2>
            <p>Kendi hesapların arasında anında para gönder</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" size={18}/></button>
        </header>

        <div className="modal-b">
          <div className="transfer-flow">
            <div className="transfer-side">
              <div className="transfer-l">Gönderen</div>
              <select className="sel" value={from || ""} onChange={(e)=>setFrom(e.target.value)}>
                {allAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name} · ₺{APP_DATA.fmtShort(a.balance)}</option>
                ))}
              </select>
              {fromAcc && (
                <div className="transfer-bal">
                  Bakiye: <span className="mono"><Money value={fromAcc.balance} sign="neutral"/></span>
                </div>
              )}
            </div>

            <div className="transfer-arrow">
              <button type="button" className="icon-btn" onClick={()=>{const tmp=from; setFrom(to); setTo(tmp);}} title="Yönü değiştir">
                <Icon name="repeat" size={16}/>
              </button>
            </div>

            <div className="transfer-side">
              <div className="transfer-l">Alıcı</div>
              <select className="sel" value={to || ""} onChange={(e)=>setTo(e.target.value)}>
                {allAccounts.filter(a => a.id !== from).map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              {toAcc && (
                <div className="transfer-bal">
                  Bakiye: <span className="mono"><Money value={toAcc.balance} sign="neutral"/></span>
                </div>
              )}
            </div>
          </div>

          <div className="field">
            <span className="field-l">Tutar</span>
            <div className="amount-input">
              <span className="amount-curr">₺</span>
              <input
                type="text"
                autoFocus
                placeholder="0,00"
                value={amount}
                onChange={(e)=>setAmount(e.target.value)}
                className="amount-val mono"
              />
            </div>
            <div className="limit-presets">
              {[500, 1000, 2500, 5000, 10000].map(p => (
                <button type="button" key={p} className="preset-chip" onClick={()=>setAmount(String(p))}>
                  ₺{APP_DATA.fmtShort(p)}
                </button>
              ))}
              {fromAcc && fromAcc.balance > 0 && (
                <button type="button" className="preset-chip" onClick={()=>setAmount(String(Math.floor(fromAcc.balance)))}>
                  Tümü
                </button>
              )}
            </div>
            {insufficient && (
              <div className="transfer-warn neg">
                Yetersiz bakiye — maksimum ₺{APP_DATA.fmt(fromAcc.balance)}
              </div>
            )}
          </div>

          <label className="field">
            <span className="field-l">Açıklama (opsiyonel)</span>
            <input
              type="text"
              placeholder="örn. Birikim hesabına aktarım"
              value={note}
              onChange={(e)=>setNote(e.target.value)}
            />
          </label>

          {canSubmit && fromAcc && toAcc && (
            <div className="transfer-summary">
              <div className="transfer-summary-row">
                <span>{fromAcc.name}</span>
                <span className="mono neg">−₺{APP_DATA.fmt(amt)}</span>
              </div>
              <div className="transfer-summary-row">
                <span>{toAcc.name}</span>
                <span className="mono pos">+₺{APP_DATA.fmt(amt)}</span>
              </div>
              <div className="transfer-summary-row transfer-summary-fee">
                <span>Transfer ücreti</span>
                <span className="mono">₺0,00 · Ücretsiz</span>
              </div>
            </div>
          )}
        </div>

        <footer className="modal-f">
          <button type="button" className="btn btn-ghost btn-md" onClick={onClose}>İptal</button>
          <button type="submit" className="btn btn-primary btn-md" disabled={!canSubmit || insufficient}>
            Transferi onayla
          </button>
        </footer>
      </form>
    </div>
  );
}

// New account modal
const ACC_COLORS = ["#1eb980", "#3a7bd5", "#a855f7", "#e74c3c", "#f5a623", "#0ea5e9", "#ec4899", "#84cc16", "#14b8a6", "#f97316"];
const ACC_TYPES = [
  { id: "Vadesiz Hesap", icon: "wallet", isCard: false },
  { id: "Maaş Hesabı", icon: "wallet", isCard: false },
  { id: "Birikim Hesabı", icon: "target", isCard: false },
  { id: "Kredi Kartı", icon: "card", isCard: true },
  { id: "E-Cüzdan", icon: "wallet", isCard: false },
];

// Hesap detay modalı — bakiye geçmişi, kategori kırılımı, tüm işlemler
function AccountDetailModal({ account, transactions, showBalances, onClose, onTransfer, onEdit }) {
  useEffectV(() => {
    if (!account) return;
    const onEsc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [account, onClose]);

  if (!account) return null;
  const a = account;
  const isCard = a.type.includes("Kart");
  const today = appToday();

  const accTx = transactions.filter((t) => t.account === a.id)
    .sort((x, y) => new Date(y.date) - new Date(x.date));
  const real = accTx.filter((t) => !isTransferLeg(t) && !isDebtPayment(t));

  // 90 günlük bakiye geçmişi
  const d90 = new Date(today); d90.setDate(today.getDate() - 90);
  const buckets = {};
  accTx.filter((t) => new Date(t.date) >= d90).forEach((t) => { const k = localYMD(new Date(t.date)); buckets[k] = (buckets[k] || 0) + t.amount; });
  let bal = a.balance;
  const balSeries = [];
  for (let i = 0; i <= 90; i++) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    balSeries.unshift(isCard ? -bal : bal);
    bal -= (buckets[localYMD(d)] || 0);
  }
  const labels = balSeries.map((_, i) => i % 15 === 0 ? `${90 - i}g` : "");

  // kategori kırılımı (90 gün gider)
  const catMap = {};
  real.filter((t) => t.amount < 0 && new Date(t.date) >= d90).forEach((t) => { catMap[t.category] = (catMap[t.category] || 0) + -t.amount; });
  const catSegs = Object.entries(catMap).map(([id, v]) => {
    const c = APP_DATA.categories.find((x) => x.id === id) || { label: id, color: "#64748b" };
    return { label: c.label, value: v, color: c.color };
  }).sort((x, y) => y.value - x.value);
  const catTotal = catSegs.reduce((s, c) => s + c.value, 0);

  const inc90 = real.filter((t) => t.amount > 0 && new Date(t.date) >= d90).reduce((s, t) => s + t.amount, 0);
  const exp90 = -real.filter((t) => t.amount < 0 && new Date(t.date) >= d90).reduce((s, t) => s + t.amount, 0);

  return (
    <div className="modal-bd" onClick={onClose}>
      <div className="modal acc-dm" onClick={(e) => e.stopPropagation()}>
        <header className="modal-h acc-dm-h">
          <div className="acc-dm-id">
            <div className="acc-dm-dot" style={{ background: a.color }} />
            <div>
              <h2>{a.name}</h2>
              <p>{a.type} · <span className="mono">{a.number}</span></p>
            </div>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </header>
        <div className="modal-b acc-dm-b">
          <div className="acc-dm-bal">
            <div>
              <div className="acc-dm-bal-l">{isCard ? "Mevcut borç" : "Güncel bakiye"}</div>
              <div className="acc-dm-bal-v"><Money value={a.balance} sign={isCard ? "auto" : "neutral"} hide={!showBalances} /></div>
            </div>
            <div className="acc-dm-bal-stats">
              <div><span className="acc-dm-s-l">90g gelir</span><span className="acc-dm-s-v pos mono">+₺{APP_DATA.fmtShort(inc90)}</span></div>
              <div><span className="acc-dm-s-l">90g gider</span><span className="acc-dm-s-v neg mono">−₺{APP_DATA.fmtShort(exp90)}</span></div>
              <div><span className="acc-dm-s-l">İşlem</span><span className="acc-dm-s-v mono">{accTx.length}</span></div>
            </div>
          </div>

          <div className="acc-dm-section-t">{isCard ? "Borç geçmişi" : "Bakiye geçmişi"} · 90 gün</div>
          <AreaChart series={[{ labels, values: balSeries, color: a.color, name: "Bakiye" }]} height={170} formatY={(v) => "₺" + APP_DATA.fmtShort(v)} />

          {catSegs.length > 0 && (
            <>
              <div className="acc-dm-section-t">Harcama dağılımı · 90 gün</div>
              <div className="acc-dm-cats">
                <Donut segments={catSegs} size={120} thickness={16} center={<div className="donut-center-inner"><div className="donut-c-val">₺{APP_DATA.fmtShort(catTotal)}</div><div className="donut-c-pct">gider</div></div>} formatTooltipValue={(v) => "₺" + APP_DATA.fmtShort(v)} />
                <div className="acc-dm-cat-legend">
                  {catSegs.slice(0, 6).map((c) => (
                    <div key={c.label} className="acc-dm-cat-row">
                      <span className="acc-dist-dot" style={{ background: c.color }} />
                      <span className="acc-dm-cat-n">{c.label}</span>
                      <span className="acc-dm-cat-p mono">%{Math.round(c.value / catTotal * 100)}</span>
                      <span className="acc-dm-cat-v mono">₺{APP_DATA.fmtShort(c.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="acc-dm-section-t">İşlemler ({accTx.length})</div>
          <div className="acc-dm-txs">
            {accTx.length === 0 && <div className="acc-dm-empty">Bu hesapta henüz işlem yok.</div>}
            {accTx.slice(0, 60).map((t) => {
              const cat = APP_DATA.categories.find((c) => c.id === t.category);
              const transfer = isTransferLeg(t);
              return (
                <div key={t.id} className="acc-dm-tx">
                  <span className="acc-dm-tx-ic" style={{ background: `${(cat?.color || "#64748b")}22`, color: cat?.color || "#64748b" }}>
                    <Icon name={transfer ? "repeat" : "list"} size={13} />
                  </span>
                  <div className="acc-dm-tx-b">
                    <div className="acc-dm-tx-n">{t.name}</div>
                    <div className="acc-dm-tx-m">{fmtDate(t.date)} · {cat?.label || (transfer ? "Transfer" : "Diğer")}</div>
                  </div>
                  <div className={`acc-dm-tx-a mono ${t.amount < 0 ? "neg" : "pos"}`}>{t.amount < 0 ? "−" : "+"}₺{APP_DATA.fmt(Math.abs(t.amount))}</div>
                </div>
              );
            })}
            {accTx.length > 60 && <div className="acc-dm-more">+{accTx.length - 60} işlem daha</div>}
          </div>
        </div>
        <footer className="modal-f">
          <button type="button" className="btn btn-ghost btn-md" onClick={() => onEdit(a)}><Icon name="edit" size={15} />Düzenle</button>
          <button type="button" className="btn btn-primary btn-md" onClick={() => onTransfer(a.id)}><Icon name="repeat" size={15} />Transfer yap</button>
        </footer>
      </div>
    </div>
  );
}

function NewAccountModal({ open, onClose, onSubmit, initialType, editing }) {
  const [name, setName] = useStateV("");
  const [type, setType] = useStateV(ACC_TYPES[0].id);
  const [balance, setBalance] = useStateV("");
  const [limit, setLimit] = useStateV("");
  const [number, setNumber] = useStateV("");
  const [color, setColor] = useStateV(ACC_COLORS[0]);

  useEffectV(() => {
    if (open) {
      if (editing) {
        const isCardE = editing.type.includes("Kart");
        setName(editing.name || "");
        setType(editing.type || ACC_TYPES[0].id);
        setBalance(String(isCardE ? Math.abs(editing.balance) : editing.balance).replace(".", ","));
        setLimit(editing.limit ? String(editing.limit).replace(".", ",") : "");
        setNumber((editing.number && !editing.number.includes("*")) ? editing.number.replace(/\D/g, "").slice(-4) : "");
        setColor(editing.color || ACC_COLORS[0]);
      } else {
        setName(""); setBalance(""); setLimit(""); setNumber("");
        setType(initialType || ACC_TYPES[0].id);
        setColor(ACC_COLORS[Math.floor(Math.random() * ACC_COLORS.length)]);
      }
    }
  }, [open]);

  if (!open) return null;

  const typeMeta = ACC_TYPES.find(tt => tt.id === type);
  const isCard = typeMeta?.isCard;
  const bal = parseFloat(String(balance).replace(",", ".")) || 0;
  const lim = parseFloat(String(limit).replace(",", ".")) || 0;
  const canSubmit = name.trim() && (isCard ? lim > 0 : true);

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    const keepNum = editing && editing.number && (number.trim() === "" || (editing.number.replace(/\D/g, "").slice(-4) === number.trim()));
    onSubmit({
      name: name.trim(),
      type,
      number: keepNum ? editing.number : (number.trim() ? (isCard ? `**** **** **** ${number.trim()}` : `TR** **** **** ${number.trim()}`) : (isCard ? "**** **** **** ****" : "TR** **** **** ****")),
      balance: isCard ? -bal : bal,
      limit: isCard ? lim : undefined,
      color,
    });
  };

  return (
    <div className="modal-bd" onClick={onClose}>
      <form className="modal" onClick={(e)=>e.stopPropagation()} onSubmit={submit}>
        <header className="modal-h">
          <div>
            <h2>{editing ? "Hesabı düzenle" : "Yeni hesap ekle"}</h2>
            <p>{editing ? "Hesap bilgilerini güncelle" : "Banka hesabı, kredi kartı veya e-cüzdan ekle"}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" size={18}/></button>
        </header>

        <div className="modal-b">
          <div className="acc-preview">
            <div className="acc-preview-dot" style={{background: color}}/>
            <div className="acc-preview-info">
              <div className="acc-preview-n">{name || "Hesap adı"}</div>
              <div className="acc-preview-t">{type}</div>
            </div>
            <Icon name={typeMeta?.icon || "wallet"} size={18}/>
          </div>

          <label className="field">
            <span className="field-l">Hesap adı</span>
            <input
              type="text"
              autoFocus
              placeholder="örn. Ziraat Bankası, Birikim, Maaş..."
              value={name}
              onChange={(e)=>setName(e.target.value)}
            />
          </label>

          <div className="field">
            <span className="field-l">Hesap tipi</span>
            <div className="acc-type-grid">
              {ACC_TYPES.map(at => (
                <button
                  type="button"
                  key={at.id}
                  className={`acc-type-chip ${type===at.id?"acc-type-chip-act":""}`}
                  onClick={()=>setType(at.id)}
                >
                  <Icon name={at.icon} size={16}/>
                  {at.id}
                </button>
              ))}
            </div>
          </div>

          {isCard ? (
            <div className="field-row">
              <label className="field">
                <span className="field-l">Kart limiti</span>
                <div className="amount-input amount-input-sm">
                  <span className="amount-curr">₺</span>
                  <input type="text" value={limit} onChange={(e)=>setLimit(e.target.value)} className="amount-val mono" placeholder="0"/>
                </div>
              </label>
              <label className="field">
                <span className="field-l">Mevcut borç (ops.)</span>
                <div className="amount-input amount-input-sm">
                  <span className="amount-curr">₺</span>
                  <input type="text" value={balance} onChange={(e)=>setBalance(e.target.value)} className="amount-val mono" placeholder="0"/>
                </div>
              </label>
            </div>
          ) : (
            <label className="field">
              <span className="field-l">Açılış bakiyesi</span>
              <div className="amount-input amount-input-sm">
                <span className="amount-curr">₺</span>
                <input type="text" value={balance} onChange={(e)=>setBalance(e.target.value)} className="amount-val mono" placeholder="0,00"/>
              </div>
            </label>
          )}

          <label className="field">
            <span className="field-l">{isCard ? "Kart no son 4 hane" : "IBAN son 4 hane"} (opsiyonel)</span>
            <input
              type="text"
              placeholder={isCard ? "örn. 1234" : "örn. 1234"}
              value={number}
              onChange={(e)=>setNumber(e.target.value)}
            />
          </label>

          <div className="field">
            <span className="field-l">Renk</span>
            <div className="color-swatches">
              {ACC_COLORS.map(c => (
                <button
                  type="button"
                  key={c}
                  className={`color-swatch ${color===c?"color-swatch-act":""}`}
                  style={{background: c}}
                  onClick={()=>setColor(c)}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </div>

        <footer className="modal-f">
          <button type="button" className="btn btn-ghost btn-md" onClick={onClose}>İptal</button>
          <button type="submit" className="btn btn-primary btn-md" disabled={!canSubmit}>{editing ? "Kaydet" : "Hesabı oluştur"}</button>
        </footer>
      </form>
    </div>
  );
}

// Kredi kartı ödeme modalı — nakit hesaptan karta
function CardPayModal({ card, accounts, onClose, onPay }) {
  const cashAccounts = (accounts || []).filter(a => !a.type.includes("Kart"));
  const [amount, setAmount] = useStateV("");
  const [fromAccount, setFromAccount] = useStateV("");

  useEffectV(() => {
    if (card) { setAmount(""); setFromAccount(cashAccounts[0]?.id || ""); }
  }, [card]);

  useEffectV(() => {
    if (!card) return;
    const onEsc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [card, onClose]);

  if (!card) return null;
  const owed = Math.max(0, -card.balance);
  const minPay = owed > 0 ? Math.max(Math.round(owed * 0.20), Math.min(owed, 100)) : 0;
  const amt = parseFloat(String(amount).replace(/\s/g, "").replace(",", ".")) || 0;
  const fromAcc = cashAccounts.find(a => a.id === fromAccount);
  const insufficient = fromAcc && amt > fromAcc.balance;
  const overpay = amt > owed;
  const canSubmit = amt > 0 && !insufficient && !overpay && fromAccount;
  const remainingAfter = Math.max(0, owed - amt);

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onPay(amt, fromAccount);
  };

  return (
    <div className="modal-bd" onClick={onClose}>
      <form className="modal" onClick={(e)=>e.stopPropagation()} onSubmit={submit}>
        <header className="modal-h">
          <div>
            <h2>Kart borcunu öde</h2>
            <p>{card.name} · güncel borç ₺{APP_DATA.fmt(owed)}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" size={18}/></button>
        </header>
        <div className="modal-b">
          <div className="amount-input">
            <span className="amount-curr">₺</span>
            <input type="text" autoFocus placeholder="0,00" value={amount} onChange={(e)=>setAmount(e.target.value)} className="amount-val mono"/>
          </div>
          <div className="limit-presets">
            <button type="button" className="preset-chip" onClick={()=>setAmount(String(minPay))}>Asgari ₺{APP_DATA.fmtShort(minPay)}</button>
            <button type="button" className="preset-chip" onClick={()=>setAmount(String(Math.round(owed/2)))}>Yarısı</button>
            <button type="button" className="preset-chip" onClick={()=>setAmount(String(Math.round(owed * 100)/100))}>Tüm borç ₺{APP_DATA.fmtShort(owed)}</button>
          </div>

          <div className="field">
            <span className="field-l">Hangi hesaptan ödenecek?</span>
            <div className="acc-radio-list">
              {cashAccounts.map((a) => (
                <button type="button" key={a.id} className={`acc-radio ${fromAccount === a.id ? "acc-radio-act" : ""}`} onClick={()=>setFromAccount(a.id)}>
                  <span className="acc-radio-dot" style={{ background: a.color }} />
                  <div className="acc-radio-info"><div className="acc-radio-n">{a.name}</div><div className="acc-radio-t">{a.type}</div></div>
                  <div className="acc-radio-bal mono">₺{APP_DATA.fmt(a.balance)}</div>
                </button>
              ))}
            </div>
          </div>

          {amt > 0 && !insufficient && !overpay && (
            <div className="cardpay-summary">
              <div className="cardpay-sum-row"><span>Ödeme sonrası kart borcu</span><strong className="mono">₺{APP_DATA.fmt(remainingAfter)}</strong></div>
              {fromAcc && <div className="cardpay-sum-row"><span>{fromAcc.name} yeni bakiye</span><strong className="mono">₺{APP_DATA.fmt(fromAcc.balance - amt)}</strong></div>}
            </div>
          )}
          {insufficient && <div className="transfer-warn neg">Yetersiz bakiye — {fromAcc.name}: ₺{APP_DATA.fmt(fromAcc.balance)}</div>}
          {overpay && <div className="transfer-warn neg">Borçtan fazla ödeyemezsin — güncel borç ₺{APP_DATA.fmt(owed)}</div>}
        </div>
        <footer className="modal-f">
          <button type="button" className="btn btn-ghost btn-md" onClick={onClose}>İptal</button>
          <button type="submit" className="btn btn-primary btn-md" disabled={!canSubmit}>₺{APP_DATA.fmt(amt)} öde</button>
        </footer>
      </form>
    </div>
  );
}

// Nakit avans modalı — karttan nakit çekme
function CashAdvanceModal({ card, accounts, onClose, onAdvance }) {
  const cashAccounts = (accounts || []).filter(a => !a.type.includes("Kart"));
  const [amount, setAmount] = useStateV("");
  const [toAccount, setToAccount] = useStateV("");
  const [feeRate, setFeeRate] = useStateV(3.5);

  useEffectV(() => {
    if (card) { setAmount(""); setToAccount(cashAccounts[0]?.id || ""); setFeeRate(3.5); }
  }, [card]);

  useEffectV(() => {
    if (!card) return;
    const onEsc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [card, onClose]);

  if (!card) return null;
  const available = Math.max(0, (card.limit || 0) - Math.max(0, -card.balance));
  const amt = parseFloat(String(amount).replace(/\s/g, "").replace(",", ".")) || 0;
  const fee = Math.round(amt * (feeRate / 100) * 100) / 100;
  const totalDebt = amt + fee;
  const overLimit = totalDebt > available;
  const toAcc = cashAccounts.find(a => a.id === toAccount);
  const canSubmit = amt > 0 && !overLimit && toAccount;

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onAdvance(amt, toAccount, feeRate);
  };

  return (
    <div className="modal-bd" onClick={onClose}>
      <form className="modal" onClick={(e)=>e.stopPropagation()} onSubmit={submit}>
        <header className="modal-h">
          <div>
            <h2>Nakit avans çek</h2>
            <p>{card.name} · kullanılabilir limit ₺{APP_DATA.fmt(available)}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" size={18}/></button>
        </header>
        <div className="modal-b">
          <div className="amount-input">
            <span className="amount-curr">₺</span>
            <input type="text" autoFocus placeholder="0,00" value={amount} onChange={(e)=>setAmount(e.target.value)} className="amount-val mono"/>
          </div>
          <div className="limit-presets">
            {[1000, 2500, 5000].map(p => (
              <button type="button" key={p} className="preset-chip" onClick={()=>setAmount(String(p))}>₺{APP_DATA.fmtShort(p)}</button>
            ))}
            <button type="button" className="preset-chip" onClick={()=>setAmount(String(Math.floor(available / (1 + feeRate/100))))}>Maks. çekilebilir</button>
          </div>

          <div className="field">
            <span className="field-l">Hangi hesaba yatsın?</span>
            <div className="acc-radio-list">
              {cashAccounts.map((a) => (
                <button type="button" key={a.id} className={`acc-radio ${toAccount === a.id ? "acc-radio-act" : ""}`} onClick={()=>setToAccount(a.id)}>
                  <span className="acc-radio-dot" style={{ background: a.color }} />
                  <div className="acc-radio-info"><div className="acc-radio-n">{a.name}</div><div className="acc-radio-t">{a.type}</div></div>
                  <div className="acc-radio-bal mono">₺{APP_DATA.fmt(a.balance)}</div>
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span className="field-l">Komisyon oranı (%)</span>
            <div className="amount-input amount-input-sm">
              <input type="number" min="0" max="20" step="0.1" value={feeRate} onChange={(e)=>setFeeRate(Math.max(0, +e.target.value || 0))} className="amount-val mono"/>
              <span className="amount-curr">%</span>
            </div>
          </label>

          {amt > 0 && !overLimit && (
            <div className="cardpay-summary">
              <div className="cardpay-sum-row"><span>Hesabına geçecek nakit</span><strong className="mono pos">+₺{APP_DATA.fmt(amt)}</strong></div>
              <div className="cardpay-sum-row"><span>Komisyon (%{feeRate})</span><strong className="mono neg">₺{APP_DATA.fmt(fee)}</strong></div>
              <div className="cardpay-sum-row"><span>Karta eklenecek toplam borç</span><strong className="mono neg">₺{APP_DATA.fmt(totalDebt)}</strong></div>
              {toAcc && <div className="cardpay-sum-row"><span>{toAcc.name} yeni bakiye</span><strong className="mono">₺{APP_DATA.fmt(toAcc.balance + amt)}</strong></div>}
            </div>
          )}
          {overLimit && <div className="transfer-warn neg">Kullanılabilir limit yetersiz — avans + komisyon (₺{APP_DATA.fmt(totalDebt)}) limiti aşıyor (₺{APP_DATA.fmt(available)})</div>}
          <div className="cc-adv-note">
            <Icon name="info" size={13} />
            <span>Nakit avansta faiz <strong>çekim günü başlar</strong> ve genelde alışveriş faizinden yüksektir — komisyon da cabası. Acil değilse pahalı bir borçlanma yöntemidir.</span>
          </div>
        </div>
        <footer className="modal-f">
          <button type="button" className="btn btn-ghost btn-md" onClick={onClose}>İptal</button>
          <button type="submit" className="btn btn-primary btn-md" disabled={!canSubmit}>₺{APP_DATA.fmt(amt)} çek</button>
        </footer>
      </form>
    </div>
  );
}

// Pay debt / installment modal
function PayDebtModal({ open, payment, accounts, onClose, onPay }) {
  const cashAccounts = (accounts || APP_DATA.accounts).filter(a => !a.type.includes("Kart"));
  const [fromAccount, setFromAccount] = useStateV(cashAccounts[0]?.id);
  const [amount, setAmount] = useStateV("");
  const [months, setMonths] = useStateV(3);

  useEffectV(() => {
    if (open && payment) {
      setFromAccount(cashAccounts[0]?.id);
      if (payment.mode === "full") setAmount(String(payment.debt.remaining));
      else if (payment.mode === "min") setAmount(String(payment.debt.monthly));
      else setAmount(String(Math.ceil(payment.debt.remaining / 3)));
      setMonths(3);
    }
  }, [open, payment?.mode]);

  if (!open || !payment) return null;

  const fromAcc = (accounts || APP_DATA.accounts).find(a => a.id === fromAccount);
  const amt = parseFloat(String(amount).replace(",", ".")) || 0;
  const isInst = payment.mode === "installment";
  const monthly = isInst ? Math.ceil(payment.debt.remaining / months) : amt;
  const insufficient = fromAcc && fromAcc.balance < (isInst ? monthly : amt);
  const canSubmit = fromAccount && amt > 0 && !insufficient;

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onPay({
      fromAccount,
      amount: isInst ? monthly : amt,
      mode: payment.mode,
      months,
    });
  };

  const title = payment.mode === "full" ? "Kart borcunu öde" : payment.mode === "min" ? "Asgari ödeme yap" : "Borcu taksitlendir";

  return (
    <div className="modal-bd" onClick={onClose}>
      <form className="modal" onClick={(e)=>e.stopPropagation()} onSubmit={submit}>
        <header className="modal-h">
          <div>
            <h2>{title}</h2>
            <p>{payment.debt.name} · Kalan ₺{APP_DATA.fmt(payment.debt.remaining)}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" size={18}/></button>
        </header>

        <div className="modal-b">
          {isInst ? (
            <>
              <div className="field">
                <span className="field-l">Taksit sayısı</span>
                <div className="seg seg-lg" style={{width:"100%"}}>
                  {[3, 6, 9, 12].map(m => (
                    <button type="button" key={m} className={months===m?"seg-act":""} onClick={()=>setMonths(m)} style={{flex:1}}>
                      {m} ay
                    </button>
                  ))}
                </div>
              </div>

              <div className="pay-summary">
                <div className="pay-summary-row">
                  <span>Aylık taksit</span>
                  <strong className="mono pay-summary-big">₺{APP_DATA.fmt(monthly)}</strong>
                </div>
                <div className="pay-summary-row">
                  <span>Toplam tutar</span>
                  <strong className="mono">₺{APP_DATA.fmt(monthly * months)}</strong>
                </div>
                <div className="pay-summary-row">
                  <span>Yıllık faiz oranı</span>
                  <strong className="mono">%4,42</strong>
                </div>
                <div className="pay-summary-row pay-summary-fee">
                  <span>Bitiş tarihi</span>
                  <strong>{(() => {
                    const t = appToday();
                    const d = new Date(t.getFullYear(), t.getMonth() + months, 5);
                    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
                  })()}</strong>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <span className="field-l">Ödeme tutarı</span>
                <div className="amount-input">
                  <span className="amount-curr">₺</span>
                  <input
                    type="text"
                    autoFocus
                    value={amount}
                    onChange={(e)=>setAmount(e.target.value)}
                    className="amount-val mono"
                  />
                </div>
                <div className="limit-presets">
                  <button type="button" className="preset-chip" onClick={()=>setAmount(String(payment.debt.monthly))}>
                    Asgari ₺{APP_DATA.fmt(payment.debt.monthly)}
                  </button>
                  <button type="button" className="preset-chip" onClick={()=>setAmount(String(Math.round(payment.debt.remaining / 2)))}>
                    Yarısı
                  </button>
                  <button type="button" className="preset-chip" onClick={()=>setAmount(String(payment.debt.remaining))}>
                    Tamamı
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="field">
            <span className="field-l">Ödeme yapılacak hesap</span>
            <div className="acc-radio-list">
              {cashAccounts.map(a => (
                <button
                  type="button"
                  key={a.id}
                  className={`acc-radio ${fromAccount===a.id?"acc-radio-act":""}`}
                  onClick={()=>setFromAccount(a.id)}
                >
                  <span className="acc-radio-dot" style={{background:a.color}}/>
                  <div className="acc-radio-info">
                    <div className="acc-radio-n">{a.name}</div>
                    <div className="acc-radio-t">{a.type}</div>
                  </div>
                  <div className="acc-radio-bal mono">₺{APP_DATA.fmt(a.balance)}</div>
                </button>
              ))}
            </div>
          </div>

          {insufficient && (
            <div className="transfer-warn neg">
              Yetersiz bakiye — {fromAcc.name} hesabında ₺{APP_DATA.fmt(fromAcc.balance)} var
            </div>
          )}

          {!isInst && fromAcc && amt > 0 && !insufficient && (
            <div className="pay-summary">
              <div className="pay-summary-row">
                <span>{fromAcc.name}</span>
                <strong className="mono neg">−₺{APP_DATA.fmt(amt)}</strong>
              </div>
              <div className="pay-summary-row">
                <span>{payment.debt.name} yeni borç</span>
                <strong className="mono">₺{APP_DATA.fmt(Math.max(0, payment.debt.remaining - amt))}</strong>
              </div>
              <div className="pay-summary-row pay-summary-fee">
                <span>Yeni bakiye</span>
                <strong className="mono">₺{APP_DATA.fmt(fromAcc.balance - amt)}</strong>
              </div>
            </div>
          )}
        </div>

        <footer className="modal-f">
          <button type="button" className="btn btn-ghost btn-md" onClick={onClose}>İptal</button>
          <button type="submit" className="btn btn-primary btn-md" disabled={!canSubmit}>
            {isInst ? `${months} ay taksitlendir` : `₺${APP_DATA.fmt(amt)} öde`}
          </button>
        </footer>
      </form>
    </div>
  );
}

// Add debt modal
const DEBT_TYPES = [
  "İhtiyaç Kredisi",
  "Konut Kredisi",
  "Taşıt Kredisi",
  "Faizsiz (Kişisel)",
];
const DEBT_COLORS = ["#a855f7", "#3b82f6", "#e74c3c", "#22c55e", "#f5a623", "#0ea5e9", "#ec4899", "#14b8a6"];

function AddDebtModal({ open, onClose, onSubmit }) {
  const [name, setName] = useStateV("");
  const [type, setType] = useStateV(DEBT_TYPES[0]);
  const [lender, setLender] = useStateV("");
  const [principal, setPrincipal] = useStateV("");
  const [remaining, setRemaining] = useStateV("");
  const [monthly, setMonthly] = useStateV("");
  const [rate, setRate] = useStateV("");
  const [color, setColor] = useStateV(DEBT_COLORS[0]);

  useEffectV(() => {
    if (open) {
      setName(""); setLender(""); setPrincipal(""); setRemaining(""); setMonthly(""); setRate("");
      setType(DEBT_TYPES[0]);
      setColor(DEBT_COLORS[Math.floor(Math.random() * DEBT_COLORS.length)]);
    }
  }, [open]);

  useEffectV(() => {
    if (!open) return;
    const onEsc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  const num = (v) => parseFloat(String(v).replace(/\s/g, "").replace(",", ".")) || 0;
  const p = num(principal);
  const r = remaining === "" ? p : num(remaining);
  const m = num(monthly);
  const rt = num(rate);
  const isPersonal = type.includes("Faizsiz");
  const canSubmit = name.trim() && p > 0 && m > 0;

  const estTerm = m > 0 ? Math.ceil(r / m) : null;
  const paidInstallments = m > 0 && p > r ? Math.round((p - r) / m) : 0;

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    const _t = appToday();
    const next = new Date(_t.getFullYear(), _t.getMonth() + 1, 5);
    onSubmit({
      name: name.trim(),
      type,
      lender: lender.trim() || "—",
      principal: p,
      remaining: r,
      monthly: m,
      rate: isPersonal ? 0 : rt,
      term: estTerm,
      paid: paidInstallments,
      nextPayment: next.toISOString().slice(0, 10),
      color,
    });
  };

  return (
    <div className="modal-bd" onClick={onClose}>
      <form className="modal modal-lg" onClick={(e)=>e.stopPropagation()} onSubmit={submit}>
        <header className="modal-h">
          <div>
            <h2>Borç ekle</h2>
            <p>Kredi veya kişisel borç kaydı oluştur · kartlar Hesaplar'dan yönetilir</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" size={18}/></button>
        </header>

        <div className="modal-b">
          <label className="field">
            <span className="field-l">Borç adı</span>
            <input type="text" autoFocus placeholder="örn. Konut Kredisi, Araç, Kart borcu..." value={name} onChange={(e)=>setName(e.target.value)}/>
          </label>

          <div className="field">
            <span className="field-l">Borç tipi</span>
            <div className="cat-picker">
              {DEBT_TYPES.map(dt => (
                <button type="button" key={dt} className={`cat-chip ${type===dt?"cat-chip-act":""}`} onClick={()=>setType(dt)}
                  style={type===dt ? { borderColor: color, background: `${color}22`, color: "var(--fg)" } : {}}>
                  {dt}
                </button>
              ))}
            </div>
          </div>

          <div className="field-row">
            <label className="field">
              <span className="field-l">Kreditör (opsiyonel)</span>
              <input type="text" placeholder="örn. Garanti BBVA" value={lender} onChange={(e)=>setLender(e.target.value)}/>
            </label>
            {!isPersonal && (
              <label className="field">
                <span className="field-l">Aylık faiz oranı %</span>
                <div className="amount-input amount-input-sm">
                  <input type="text" value={rate} onChange={(e)=>setRate(e.target.value)} className="amount-val mono" placeholder="0,00"/>
                  <span className="amount-curr" style={{marginLeft:6, marginRight:0}}>%</span>
                </div>
              </label>
            )}
          </div>

          <div className="field-row">
            <label className="field">
              <span className="field-l">Toplam anapara</span>
              <div className="amount-input amount-input-sm">
                <span className="amount-curr">₺</span>
                <input type="text" value={principal} onChange={(e)=>setPrincipal(e.target.value)} className="amount-val mono" placeholder="0"/>
              </div>
            </label>
            <label className="field">
              <span className="field-l">Kalan borç (boşsa = anapara)</span>
              <div className="amount-input amount-input-sm">
                <span className="amount-curr">₺</span>
                <input type="text" value={remaining} onChange={(e)=>setRemaining(e.target.value)} className="amount-val mono" placeholder={principal || "0"}/>
              </div>
            </label>
          </div>

          <label className="field">
            <span className="field-l">Aylık taksit</span>
            <div className="amount-input amount-input-sm">
              <span className="amount-curr">₺</span>
              <input type="text" value={monthly} onChange={(e)=>setMonthly(e.target.value)} className="amount-val mono" placeholder="0"/>
            </div>
          </label>

          <div className="field">
            <span className="field-l">Renk</span>
            <div className="color-swatches">
              {DEBT_COLORS.map(c => (
                <button type="button" key={c} className={`color-swatch ${color===c?"color-swatch-act":""}`} style={{background:c}} onClick={()=>setColor(c)} aria-label={c}/>
              ))}
            </div>
          </div>

          {canSubmit && estTerm && (
            <div className="pay-summary">
              <div className="pay-summary-row">
                <span>Tahmini vade</span>
                <strong className="mono">{estTerm} ay</strong>
              </div>
              <div className="pay-summary-row">
                <span>Tahmini bitiş</span>
                <strong>{(() => { const _t = appToday(); return new Date(_t.getFullYear(), _t.getMonth() + 1 + estTerm, 5).toLocaleDateString("tr-TR", { month: "long", year: "numeric" }); })()}</strong>
              </div>
              {paidInstallments > 0 && (
                <div className="pay-summary-row pay-summary-fee">
                  <span>Şimdiye dek ödenen</span>
                  <strong className="mono">~{paidInstallments} taksit</strong>
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="modal-f">
          <button type="button" className="btn btn-ghost btn-md" onClick={onClose}>İptal</button>
          <button type="submit" className="btn btn-primary btn-md" disabled={!canSubmit}>Borcu kaydet</button>
        </footer>
      </form>
    </div>
  );
}

// Payoff simulation modal (avalanche vs snowball with extra payment)
function PayoffSimModal({ open, debts, onClose }) {
  const [extra, setExtra] = useStateV(2000);

  useEffectV(() => {
    if (!open) return;
    const onEsc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  // Simulate payoff: returns { months, totalInterest }
  function simulate(strategy, extraMonthly) {
    let bal = debts.map(d => ({
      remaining: d.remaining,
      rate: (d.rate || 0) / 100, // monthly rate
      monthly: d.monthly,
    })).filter(d => d.remaining > 0);
    if (bal.length === 0) return { months: 0, totalInterest: 0 };

    let months = 0;
    let totalInterest = 0;
    const maxMonths = 600;
    while (bal.some(d => d.remaining > 0.5) && months < maxMonths) {
      months++;
      // accrue interest
      bal.forEach(d => {
        if (d.remaining > 0) {
          const interest = d.remaining * d.rate;
          d.remaining += interest;
          totalInterest += interest;
        }
      });
      // base payments
      let pool = extraMonthly;
      bal.forEach(d => {
        if (d.remaining > 0) {
          const pay = Math.min(d.remaining, d.monthly);
          d.remaining -= pay;
        }
      });
      // target order for extra
      const active = bal.filter(d => d.remaining > 0.5);
      active.sort((a, b) => strategy === "avalanche" ? b.rate - a.rate : a.remaining - b.remaining);
      for (const d of active) {
        if (pool <= 0) break;
        const pay = Math.min(d.remaining, pool);
        d.remaining -= pay;
        pool -= pay;
      }
    }
    return { months, totalInterest };
  }

  const base = simulate("avalanche", 0);
  const avalanche = simulate("avalanche", extra);
  const snowball = simulate("snowball", extra);
  const monthsSaved = base.months - avalanche.months;
  const interestSaved = base.totalInterest - avalanche.totalInterest;

  const fmtMonths = (m) => {
    const y = Math.floor(m / 12);
    const mo = m % 12;
    return y > 0 ? `${y} yıl ${mo} ay` : `${mo} ay`;
  };

  return (
    <div className="modal-bd" onClick={onClose}>
      <div className="modal modal-lg" onClick={(e)=>e.stopPropagation()}>
        <header className="modal-h">
          <div>
            <h2>Erken kapama simülasyonu</h2>
            <p>Ayda ekstra ödeme yaparak ne kadar kazanırsın?</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" size={18}/></button>
        </header>
        <div className="modal-b">
          <div className="field">
            <span className="field-l">Aylık ekstra ödeme: <strong className="mono" style={{color:"var(--accent)"}}>₺{APP_DATA.fmt(extra)}</strong></span>
            <input type="range" min="0" max="20000" step="500" value={extra} onChange={(e)=>setExtra(Number(e.target.value))} className="sim-range"/>
            <div className="limit-presets">
              {[0, 1000, 2500, 5000, 10000].map(p => (
                <button type="button" key={p} className="preset-chip" onClick={()=>setExtra(p)}>₺{APP_DATA.fmtShort(p)}</button>
              ))}
            </div>
          </div>

          <div className="sim-result-grid">
            <div className="sim-card sim-card-base">
              <div className="sim-card-l">Ekstra ödeme yok</div>
              <div className="sim-card-v mono">{fmtMonths(base.months)}</div>
              <div className="sim-card-s">Toplam faiz ₺{APP_DATA.fmtShort(base.totalInterest)}</div>
            </div>
            <div className="sim-card sim-card-act">
              <div className="sim-card-l">Çığ yöntemi + ekstra <span className="badge badge-acc">Önerilen</span></div>
              <div className="sim-card-v mono">{fmtMonths(avalanche.months)}</div>
              <div className="sim-card-s">Toplam faiz ₺{APP_DATA.fmtShort(avalanche.totalInterest)}</div>
            </div>
            <div className="sim-card">
              <div className="sim-card-l">Kartopu yöntemi + ekstra</div>
              <div className="sim-card-v mono">{fmtMonths(snowball.months)}</div>
              <div className="sim-card-s">Toplam faiz ₺{APP_DATA.fmtShort(snowball.totalInterest)}</div>
            </div>
          </div>

          {extra > 0 && monthsSaved > 0 && (
            <div className="sim-savings">
              <div className="sim-savings-icon"><Icon name="sparkles" size={18}/></div>
              <div>
                <div className="sim-savings-t">Çığ yöntemiyle <strong>{fmtMonths(monthsSaved)}</strong> daha erken borçsuz olursun</div>
                <div className="sim-savings-d">Yaklaşık <strong className="pos">₺{APP_DATA.fmt(interestSaved)}</strong> faiz tasarrufu</div>
              </div>
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

// ════════════════════════════════════════════════════════
// SCHEDULED / PLANNED PAYMENTS
// ════════════════════════════════════════════════════════
function ScheduledView({ ctx }) {
  const { showBalances, scheduled, accounts, addScheduled, updateScheduled, removeScheduled, payScheduled } = ctx;
  const [editOpen, setEditOpen] = useStateV(null); // null | { isNew } | existing object
  const today = appToday();
  const todayKey = localYMD(today);

  const FREQ_LABEL = { monthly: "Aylık", weekly: "Haftalık", yearly: "Yıllık", once: "Tek seferlik" };
  const monthlyFactor = (f) => f === "weekly" ? 4.33 : f === "yearly" ? 1 / 12 : f === "once" ? 0 : 1;

  // Bir planın gerçek nakit etkisi: kart ödemesi dinamik modda güncel borçtan hesaplanır (çıkış = negatif)
  const schAmount = (s) => {
    if (s.kind === "card" && s.payMode && s.payMode !== "fixed") {
      const c = accounts.find((a) => a.id === s.cardId);
      const owed = c ? Math.max(0, -c.balance) : 0;
      const est = s.payMode === "full" ? owed : (owed > 0 ? Math.max(Math.round(owed * 0.20), Math.min(owed, 100)) : 0);
      return -est;
    }
    return s.amount;
  };

  const active = scheduled.filter((s) => s.active);
  const recurring = active.filter((s) => s.frequency !== "once");
  const oneTime = active.filter((s) => s.frequency === "once");
  const monthlyExpense = active.filter((s) => schAmount(s) < 0).reduce((sum, s) => sum + -schAmount(s) * monthlyFactor(s.frequency), 0);
  const monthlyIncome = active.filter((s) => schAmount(s) > 0).reduce((sum, s) => sum + schAmount(s) * monthlyFactor(s.frequency), 0);

  const daysUntil = (iso) => Math.round((new Date(iso + "T00:00:00") - new Date(todayKey + "T00:00:00")) / 86400000);
  const sorted = [...active].sort((a, b) => a.nextDate.localeCompare(b.nextDate));

  // groups
  const groups = [
    { key: "overdue", label: "Gecikmiş", items: [] },
    { key: "week", label: "Bu hafta (7 gün)", items: [] },
    { key: "month", label: "Bu ay", items: [] },
    { key: "later", label: "Daha sonra", items: [] },
  ];
  sorted.forEach((s) => {
    const d = daysUntil(s.nextDate);
    if (d < 0) groups[0].items.push(s);
    else if (d <= 7) groups[1].items.push(s);
    else if (d <= 31) groups[2].items.push(s);
    else groups[3].items.push(s);
  });
  const next7Total = sorted.filter((s) => { const d = daysUntil(s.nextDate); return d >= 0 && d <= 7; })
    .reduce((sum, s) => sum + schAmount(s), 0);

  // mini calendar — gezinilebilir ay + tekrar farkındalıklı
  const [calOffset, setCalOffset] = useStateV(0); // bugünkü aya göre ay farkı
  const [selDay, setSelDay] = useStateV(null);     // seçili gün (1..N) veya null
  const calRef = new Date(today.getFullYear(), today.getMonth() + calOffset, 1);
  const calYear = calRef.getFullYear(), calMon = calRef.getMonth();
  const monthStart = calRef;
  const monthDays = new Date(calYear, calMon + 1, 0).getDate();
  const startDow = (monthStart.getDay() + 6) % 7;
  const stepDateCal = (d, freq) => {
    const n = new Date(d);
    if (freq === "weekly") n.setDate(n.getDate() + 7);
    else if (freq === "monthly") n.setMonth(n.getMonth() + 1);
    else if (freq === "yearly") n.setFullYear(n.getFullYear() + 1);
    else return null;
    return n;
  };
  const payDays = {};
  active.forEach((s) => {
    let d = new Date(s.nextDate + "T00:00:00");
    // geçmişse tekrarları ileri sar (görüntülenen aya kadar)
    let guard = 0;
    const calEnd = new Date(calYear, calMon + 1, 0);
    while (d < monthStart && s.frequency !== "once" && guard < 240) { const nx = stepDateCal(d, s.frequency); if (!nx) break; d = nx; guard++; }
    guard = 0;
    while (d <= calEnd && guard < 60) {
      if (d.getMonth() === calMon && d.getFullYear() === calYear) {
        const day = d.getDate();
        if (!payDays[day]) payDays[day] = [];
        payDays[day].push(s);
      }
      const nx = stepDateCal(d, s.frequency);
      if (!nx) break;
      d = nx; guard++;
    }
  });
  const calMonthNet = Object.values(payDays).flat().reduce((sum, s) => sum + schAmount(s), 0);
  const isCurMonth = calOffset === 0;

  const acctName = (id) => accounts.find((a) => a.id === id)?.name || "—";

  // ── İleriye dönük nakit akış projeksiyonu (45 gün) ──
  const liquidCash = accounts.filter((a) => !a.type.includes("Kart")).reduce((s, a) => s + Math.max(0, a.balance), 0);
  const stepDate = (d, freq) => {
    const n = new Date(d);
    if (freq === "weekly") n.setDate(n.getDate() + 7);
    else if (freq === "monthly") n.setMonth(n.getMonth() + 1);
    else if (freq === "yearly") n.setFullYear(n.getFullYear() + 1);
    else return null;
    return n;
  };
  const PROJ_DAYS = 45;
  const projEnd = new Date(today); projEnd.setDate(today.getDate() + PROJ_DAYS);
  const dayDelta = {};
  active.forEach((s) => {
    let d = new Date(s.nextDate + "T00:00:00");
    let guard = 0;
    while (d <= projEnd && guard < 60) {
      if (d >= new Date(todayKey + "T00:00:00")) {
        const k = localYMD(d);
        dayDelta[k] = (dayDelta[k] || 0) + schAmount(s);
      }
      const nx = stepDate(d, s.frequency);
      if (!nx) break;
      d = nx; guard++;
    }
  });
  let runBal = liquidCash;
  const projCurve = [];
  let lowest = { bal: liquidCash, date: todayKey };
  for (let i = 0; i <= PROJ_DAYS; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const k = localYMD(d);
    runBal += (dayDelta[k] || 0);
    projCurve.push(runBal);
    if (runBal < lowest.bal) lowest = { bal: runBal, date: k };
  }
  const projEndBal = projCurve[PROJ_DAYS];
  const willGoNegative = lowest.bal < 0;
  const lowestDateObj = new Date(lowest.date + "T00:00:00");

  // Abonelik (yıllık) toplamı
  const subsAnnual = active.filter((s) => s.amount < 0 && s.category === "abonelik")
    .reduce((sum, s) => sum + -s.amount * (s.frequency === "monthly" ? 12 : s.frequency === "weekly" ? 52 : s.frequency === "yearly" ? 1 : 0), 0);

  const renderItem = (s) => {
    const cat = APP_DATA.categories.find((c) => c.id === s.category);
    const d = daysUntil(s.nextDate);
    const dateObj = new Date(s.nextDate + "T00:00:00");
    const dueLabel = d < 0 ? `${-d} gün gecikti` : d === 0 ? "Bugün" : d === 1 ? "Yarın" : `${d} gün sonra`;
    return (
      <div key={s.id} className={`sch-item ${d < 0 ? "sch-item-overdue" : ""}`}>
        <div className="sch-date-col">
          <div className="sch-date-day">{dateObj.getDate()}</div>
          <div className="sch-date-mon">{TR_MONTHS_SHORT[dateObj.getMonth()]}</div>
        </div>
        <div className="sch-icon" style={{ background: s.kind === "card" ? "rgba(168,85,247,0.16)" : `${cat.color}22`, color: s.kind === "card" ? "#a855f7" : cat.color }}>
          <Icon name={s.kind === "card" ? "card" : s.amount > 0 ? "arrowDown" : s.frequency === "once" ? "clock" : "repeat"} size={16} />
        </div>
        <div className="sch-main">
          <div className="sch-name">
            {s.name}
            {s.kind === "card" && <span className="sch-auto" style={{ background: "rgba(168,85,247,0.14)", color: "#a855f7" }}><Icon name="card" size={11}/>{s.payMode === "full" ? "Tüm borç" : s.payMode === "min" ? "Asgari" : "Kart"}</span>}
            {s.autopay && <span className="sch-auto"><Icon name="zap" size={11}/>Otomatik</span>}
          </div>
          <div className="sch-meta">
            {s.kind === "card" ? (
              <>{acctName(s.account)} <span className="dot-sep">→</span> {acctName(s.cardId)}</>
            ) : (
              <><CategoryPill catId={s.category} /><span className="dot-sep">·</span>{acctName(s.account)}</>
            )}
            <span className="dot-sep">·</span>
            {FREQ_LABEL[s.frequency]}
          </div>
        </div>
        <div className="sch-due">
          <div className={`sch-amt ${s.amount > 0 ? "pos" : ""}`}>
            {s.kind === "card" && s.payMode && s.payMode !== "fixed" ? (() => {
              const c = accounts.find(a => a.id === s.cardId);
              const owed = c ? Math.max(0, -c.balance) : 0;
              const est = s.payMode === "full" ? owed : (owed > 0 ? Math.max(Math.round(owed * 0.2), Math.min(owed, 100)) : 0);
              return <span title={s.payMode === "full" ? "Tüm borç" : "Asgari"}>{showBalances ? `≈₺${APP_DATA.fmtShort(est)}` : "••"}</span>;
            })() : (
              <Money value={s.amount} sign="auto" hide={!showBalances} />
            )}
          </div>
          <div className={`sch-due-l ${d < 0 ? "neg" : d <= 2 ? "warn" : ""}`}>{dueLabel}</div>
        </div>
        <div className="sch-actions">
          <button className="btn btn-primary btn-sm" onClick={() => payScheduled(s)} title="Şimdi öde">
            <Icon name="check" size={14} />{s.amount > 0 ? "Al" : "Öde"}
          </button>
          <div className="acc-menu-host sch-menu-host">
            <button className="icon-btn" onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === s.id ? null : s.id); }}>
              <Icon name="more" size={16} />
            </button>
            {menuFor === s.id && (
              <div className="acc-menu">
                <button className="acc-menu-i" onClick={() => { setMenuFor(null); setEditOpen(s); }}>
                  <Icon name="edit" size={14} />Düzenle
                </button>
                <button className="acc-menu-i" onClick={() => { setMenuFor(null); updateScheduled(s.id, { active: false }); }}>
                  <Icon name="pause" size={14} />Duraklat
                </button>
                <div className="acc-menu-sep" />
                <button className="acc-menu-i acc-menu-i-danger" onClick={() => { if (confirm(`"${s.name}" planını silmek istediğine emin misin?`)) { removeScheduled(s.id); setMenuFor(null); } }}>
                  <Icon name="x" size={14} />Sil
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const [menuFor, setMenuFor] = useStateV(null);
  useEffectV(() => {
    if (!menuFor) return;
    const onDoc = (e) => { if (!e.target.closest(".sch-menu-host")) setMenuFor(null); };
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, [menuFor]);

  const paused = scheduled.filter((s) => !s.active);

  return (
    <div className="view view-scheduled">
      <div className="page-head">
        <div>
          <h1 className="page-title">Planlı ödemeler</h1>
          <p className="page-sub">Tekrarlayan ödemeleri ve gelirleri tek yerden yönet</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-md" onClick={() => setEditOpen({ isNew: true })}>
            <Icon name="plus" size={16} />Yeni ödeme planı
          </button>
        </div>
      </div>

      {active.length === 0 && paused.length === 0 ? (
        <div className="empty-big">
          <div className="empty-big-icon"><Icon name="calendar" size={28} /></div>
          <div className="empty-big-t">Henüz planlı ödeme yok</div>
          <p className="empty-big-d">Kira, faturalar, abonelikler veya maaş gibi tekrarlayan ödemeleri ekle. Vadeleri yaklaştığında burada ve genel bakışta hatırlatılır.</p>
          <button className="btn btn-primary btn-md" onClick={() => setEditOpen({ isNew: true })}><Icon name="plus" size={16} />İlk ödeme planını ekle</button>
        </div>
      ) : (
        <>
          <div className="sch-overview">
            <div className="ao-card">
              <div className="ao-l">Aylık planlı gider</div>
              <div className="ao-v neg"><Money value={monthlyExpense} sign="neutral" hide={!showBalances} /></div>
              <div className="ao-s">{recurring.filter((s) => schAmount(s) < 0).length} tekrarlayan gider{oneTime.filter((s) => schAmount(s) < 0).length > 0 ? ` · ${oneTime.filter((s) => schAmount(s) < 0).length} tek seferlik` : ""}</div>
            </div>
            <div className="ao-card">
              <div className="ao-l">Aylık planlı gelir</div>
              <div className="ao-v pos"><Money value={monthlyIncome} sign="neutral" hide={!showBalances} /></div>
              <div className="ao-s">{recurring.filter((s) => schAmount(s) > 0).length} tekrarlayan gelir{oneTime.filter((s) => schAmount(s) > 0).length > 0 ? ` · ${oneTime.filter((s) => schAmount(s) > 0).length} tek seferlik` : ""}</div>
            </div>
            <div className="ao-card">
              <div className="ao-l">7 günlük net</div>
              <div className="ao-v"><Money value={next7Total} sign="auto" hide={!showBalances} /></div>
              <div className="ao-s">{groups[1].items.length} yaklaşan ödeme</div>
            </div>
          </div>

          <div className="grid-2col sch-layout">
            <div className="sch-lists">
              {groups.filter((g) => g.items.length > 0).map((g) => (
                <div key={g.key} className="sch-group">
                  <div className="sch-group-h">
                    <span className={g.key === "overdue" ? "neg" : ""}>{g.label}</span>
                    <span className="sch-group-count">{g.items.length}</span>
                  </div>
                  <div className="sch-group-list">
                    {g.items.map(renderItem)}
                  </div>
                </div>
              ))}
              {paused.length > 0 && (
                <div className="sch-group">
                  <div className="sch-group-h"><span>Duraklatılmış</span><span className="sch-group-count">{paused.length}</span></div>
                  <div className="sch-group-list">
                    {paused.map((s) => {
                      const cat = APP_DATA.categories.find((c) => c.id === s.category);
                      return (
                        <div key={s.id} className="sch-item sch-item-paused">
                          <div className="sch-icon" style={{ background: "var(--bg-elev-2)", color: "var(--fg-3)" }}><Icon name="pause" size={16} /></div>
                          <div className="sch-main">
                            <div className="sch-name">{s.name}</div>
                            <div className="sch-meta"><CategoryPill catId={s.category} /><span className="dot-sep">·</span>{FREQ_LABEL[s.frequency]}</div>
                          </div>
                          <div className="sch-due"><div className="sch-amt"><Money value={s.amount} sign="auto" hide={!showBalances} /></div></div>
                          <div className="sch-actions">
                            <button className="btn btn-ghost btn-sm" onClick={() => updateScheduled(s.id, { active: true })}><Icon name="play" size={14} />Devam ettir</button>
                            <button className="icon-btn" onClick={() => { if (confirm(`"${s.name}" planını silmek istiyor musun?`)) removeScheduled(s.id); }}><Icon name="x" size={16} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="sch-side">
              <Card title="Nakit akış projeksiyonu" subtitle={`Önümüzdeki ${PROJ_DAYS} gün · planlı ödemelerle`}>
                <div className="scf-head">
                  <div>
                    <div className="scf-l">Bugünkü likit</div>
                    <div className="scf-v mono"><Money value={liquidCash} sign="neutral" hide={!showBalances} /></div>
                  </div>
                  <div className="scf-arrow">→</div>
                  <div>
                    <div className="scf-l">{PROJ_DAYS}. gün</div>
                    <div className={`scf-v mono ${projEndBal >= 0 ? "" : "neg"}`}><Money value={projEndBal} sign="neutral" hide={!showBalances} /></div>
                  </div>
                </div>
                <Sparkline values={projCurve} height={56} color={willGoNegative ? "var(--neg)" : "var(--accent)"} />
                <div className={`scf-low ${willGoNegative ? "scf-low-bad" : "scf-low-ok"}`}>
                  <Icon name={willGoNegative ? "alertTriangle" : "check"} size={14} />
                  <span>
                    {willGoNegative
                      ? <>En düşük nokta <strong>{lowestDateObj.getDate()} {TR_MONTHS_SHORT[lowestDateObj.getMonth()]}</strong> · <strong className="neg">{APP_DATA.fmt(lowest.bal)} ₺</strong> — bu tarihte nakit eksiye düşüyor.</>
                      : <>En düşük nokta <strong>{lowestDateObj.getDate()} {TR_MONTHS_SHORT[lowestDateObj.getMonth()]}</strong> · {APP_DATA.fmt(lowest.bal)} ₺ — pozitif kalıyorsun. ✓</>}
                  </span>
                </div>
              </Card>

              {subsAnnual > 0 && (
                <Card title="Abonelik maliyeti" subtitle="Yıllık toplam">
                  <div className="scf-subs">
                    <div className="scf-subs-v mono"><Money value={subsAnnual} sign="neutral" hide={!showBalances} /></div>
                    <div className="scf-subs-l">yılda · {active.filter((s) => s.amount < 0 && s.category === "abonelik").length} abonelik</div>
                  </div>
                </Card>
              )}

              <Card
                title="Ödeme takvimi"
                subtitle={`${TR_MONTHS[calMon]} ${calYear}`}
                action={
                  <div className="cal-nav">
                    <button className="cal-nav-btn" onClick={() => { setCalOffset(calOffset - 1); setSelDay(null); }} title="Önceki ay"><Icon name="chevronLeft" size={16} /></button>
                    {!isCurMonth && <button className="cal-nav-today" onClick={() => { setCalOffset(0); setSelDay(null); }}>Bugün</button>}
                    <button className="cal-nav-btn" onClick={() => { setCalOffset(calOffset + 1); setSelDay(null); }} title="Sonraki ay"><Icon name="chevronRight" size={16} /></button>
                  </div>
                }
              >
                <div className="mini-cal">
                  <div className="mini-cal-dow">
                    {["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"].map((d) => <div key={d}>{d}</div>)}
                  </div>
                  <div className="mini-cal-grid">
                    {Array.from({ length: startDow }, (_, i) => <div key={"e" + i} className="mini-cal-cell mini-cal-empty" />)}
                    {Array.from({ length: monthDays }, (_, i) => {
                      const day = i + 1;
                      const pays = payDays[day];
                      const isToday = isCurMonth && day === today.getDate();
                      const dayNet = pays ? pays.reduce((s, p) => s + schAmount(p), 0) : 0;
                      const hasIncome = pays?.some((p) => schAmount(p) > 0);
                      const hasExpense = pays?.some((p) => schAmount(p) < 0);
                      return (
                        <button
                          key={day}
                          className={`mini-cal-cell ${isToday ? "mini-cal-today" : ""} ${pays ? "mini-cal-has" : ""} ${selDay === day ? "mini-cal-sel" : ""}`}
                          onClick={() => setSelDay(selDay === day ? null : (pays ? day : null))}
                          disabled={!pays}
                        >
                          <span className="mini-cal-num">{day}</span>
                          {pays && (
                            <div className="mini-cal-dots">
                              {hasExpense && <span className="mini-cal-dot" style={{ background: "var(--neg)" }} />}
                              {hasIncome && <span className="mini-cal-dot" style={{ background: "var(--pos)" }} />}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {selDay && payDays[selDay] ? (
                    <div className="cal-detail">
                      <div className="cal-detail-h">
                        <strong>{selDay} {TR_MONTHS[calMon]}</strong>
                        <span className={`mono ${payDays[selDay].reduce((s, p) => s + schAmount(p), 0) >= 0 ? "pos" : "neg"}`}>
                          {payDays[selDay].reduce((s, p) => s + schAmount(p), 0) >= 0 ? "+" : "−"}₺{APP_DATA.fmt(Math.abs(payDays[selDay].reduce((s, p) => s + schAmount(p), 0)))}
                        </span>
                      </div>
                      {payDays[selDay].map((p) => (
                        <div key={p.id} className="cal-detail-row">
                          <span className="cal-detail-dot" style={{ background: schAmount(p) < 0 ? "var(--neg)" : "var(--pos)" }} />
                          <span className="cal-detail-n">{p.name}</span>
                          <span className={`cal-detail-a mono ${schAmount(p) < 0 ? "neg" : "pos"}`}>{schAmount(p) < 0 ? "−" : "+"}₺{APP_DATA.fmtShort(Math.abs(schAmount(p)))}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="cal-foot">
                      <div className="cal-foot-legend">
                        <span><span className="mini-cal-dot" style={{ background: "var(--neg)" }} />Gider</span>
                        <span><span className="mini-cal-dot" style={{ background: "var(--pos)" }} />Gelir</span>
                      </div>
                      <div className="cal-foot-net">
                        Ay neti <strong className={`mono ${calMonthNet >= 0 ? "pos" : "neg"}`}>{calMonthNet >= 0 ? "+" : "−"}₺{APP_DATA.fmtShort(Math.abs(calMonthNet))}</strong>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </>
      )}

      <ScheduledModal
        editing={editOpen}
        accounts={accounts}
        onClose={() => setEditOpen(null)}
        onSave={(data) => {
          if (editOpen && !editOpen.isNew) updateScheduled(editOpen.id, data);
          else addScheduled(data);
          setEditOpen(null);
        }}
      />
    </div>
  );
}

function ScheduledModal({ editing, accounts, onClose, onSave }) {
  const [type, setType] = useStateV("expense");
  const [name, setName] = useStateV("");
  const [amount, setAmount] = useStateV("");
  const [category, setCategory] = useStateV("faturalar");
  const [account, setAccount] = useStateV(accounts[0]?.id || "");
  const [cardId, setCardId] = useStateV("");
  const [payMode, setPayMode] = useStateV("fixed");
  const [frequency, setFrequency] = useStateV("monthly");
  const [nextDate, setNextDate] = useStateV("");
  const [autopay, setAutopay] = useStateV(false);

  const cashAccounts = accounts.filter((a) => !a.type.includes("Kart"));
  const cardAccounts = accounts.filter((a) => a.type.includes("Kart"));

  useEffectV(() => {
    if (editing && !editing.isNew) {
      setType(editing.kind === "card" ? "card" : editing.amount > 0 ? "income" : "expense");
      setName(editing.name);
      setAmount(String(Math.abs(editing.amount)).replace(".", ","));
      setCategory(editing.category);
      setAccount(editing.account);
      setCardId(editing.cardId || "");
      setPayMode(editing.payMode || "fixed");
      setFrequency(editing.frequency);
      setNextDate(editing.nextDate);
      setAutopay(!!editing.autopay);
    } else if (editing) {
      const t = appToday();
      setType("expense"); setName(""); setAmount(""); setCategory("faturalar");
      setAccount(accounts[0]?.id || ""); setCardId(cardAccounts[0]?.id || ""); setFrequency("monthly");
      setPayMode("fixed");
      setNextDate(new Date(t.getFullYear(), t.getMonth() + 1, 1).toISOString().slice(0, 10));
      setAutopay(false);
    }
  }, [editing]);

  useEffectV(() => {
    if (!editing) return;
    const onEsc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [editing, onClose]);

  if (!editing) return null;

  const amt = parseFloat(String(amount).replace(",", ".")) || 0;
  const canSubmit = type === "card"
    ? (nextDate && account && cardId && (payMode !== "fixed" || amt > 0))
    : (name.trim() && amt > 0 && nextDate);
  const FREQS = [["monthly", "Aylık"], ["weekly", "Haftalık"], ["yearly", "Yıllık"], ["once", "Tek seferlik"]];

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (type === "card") {
      const card = cardAccounts.find((a) => a.id === cardId);
      const modeLabel = payMode === "full" ? "Tüm borç" : payMode === "min" ? "Asgari" : "";
      onSave({
        kind: "card",
        name: name.trim() || `${card?.name || "Kredi kartı"} ödemesi`,
        amount: payMode === "fixed" ? -Math.abs(amt) : 0,
        category: "diger",
        account,
        cardId,
        payMode,
        frequency,
        nextDate,
        autopay,
      });
    } else {
      onSave({
        kind: "tx",
        name: name.trim(),
        amount: type === "income" ? Math.abs(amt) : -Math.abs(amt),
        category,
        account,
        frequency,
        nextDate,
        autopay,
      });
    }
  };

  return (
    <div className="modal-bd" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="modal-h">
          <div>
            <h2>{editing.isNew ? "Yeni ödeme planı" : "Ödeme planını düzenle"}</h2>
            <p>Tekrarlayan gider, gelir veya kredi kartı ödemesi</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </header>

        <div className="seg seg-lg" style={{ margin: "4px 24px 0" }}>
          <button type="button" className={type === "expense" ? "seg-act" : ""} onClick={() => setType("expense")}><Icon name="arrowUp" size={14} />Gider</button>
          <button type="button" className={type === "income" ? "seg-act" : ""} onClick={() => setType("income")}><Icon name="arrowDown" size={14} />Gelir</button>
          <button type="button" className={type === "card" ? "seg-act" : ""} onClick={() => setType("card")} disabled={cardAccounts.length === 0}><Icon name="card" size={14} />Kart ödemesi</button>
        </div>

        <div className="modal-b">
          {!(type === "card" && payMode !== "fixed") && (
          <div className="amount-input">
            <span className="amount-curr">₺</span>
            <input type="text" autoFocus placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} className="amount-val mono" />
          </div>
          )}

          {type === "card" ? (
            <>
              <div className="field">
                <span className="field-l">Ödeme tutarı</span>
                <div className="seg" style={{ width: "100%" }}>
                  {[["fixed", "Sabit tutar"], ["min", "Asgari"], ["full", "Tüm borç"]].map(([v, l]) => (
                    <button type="button" key={v} className={payMode === v ? "seg-act" : ""} onClick={() => setPayMode(v)} style={{ flex: 1 }}>{l}</button>
                  ))}
                </div>
                {payMode !== "fixed" && (
                  <div className="sch-mode-hint">
                    <Icon name="info" size={13} />
                    <span>{payMode === "full"
                      ? "Ödeme günündeki kartın güncel borcunun tamamı ödenir."
                      : "Ödeme günündeki borcun ~%20'si (asgari ödeme) ödenir."}{cardId && (() => { const c = cardAccounts.find(a => a.id === cardId); const owed = c ? Math.max(0, -c.balance) : 0; const est = payMode === "full" ? owed : (owed > 0 ? Math.max(Math.round(owed * 0.2), Math.min(owed, 100)) : 0); return owed > 0 ? ` Şu an ≈ ₺${APP_DATA.fmt(est)}.` : ""; })()}</span>
                  </div>
                )}
              </div>
              <div className="field-row">
                <label className="field">
                  <span className="field-l">Ödenecek kart</span>
                  <select value={cardId} onChange={(e) => setCardId(e.target.value)}>
                    {cardAccounts.length === 0 && <option value="">Kart yok</option>}
                    {cardAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
                <label className="field">
                  <span className="field-l">Gönderen hesap</span>
                  <select value={account} onChange={(e) => setAccount(e.target.value)}>
                    {cashAccounts.length === 0 && <option value="">Hesap yok</option>}
                    {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </label>
              </div>
              <label className="field">
                <span className="field-l">Plan adı (opsiyonel)</span>
                <input type="text" placeholder="örn. Aylık kart ödemesi" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
            </>
          ) : (
            <label className="field">
              <span className="field-l">Ödeme adı</span>
              <input type="text" placeholder="örn. Ev kirası, Netflix, Maaş..." value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          )}

          <div className="field">
            <span className="field-l">Sıklık</span>
            <div className="seg" style={{ width: "100%" }}>
              {FREQS.map(([v, l]) => (
                <button type="button" key={v} className={frequency === v ? "seg-act" : ""} onClick={() => setFrequency(v)} style={{ flex: 1 }}>{l}</button>
              ))}
            </div>
          </div>

          {type === "card" ? (
            <label className="field">
              <span className="field-l">{frequency === "once" ? "Ödeme tarihi" : "Sonraki ödeme"}</span>
              <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
            </label>
          ) : (
          <div className="field-row">
            <label className="field">
              <span className="field-l">{frequency === "once" ? "Ödeme tarihi" : "Sonraki ödeme"}</span>
              <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-l">Kategori</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {APP_DATA.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
          </div>
          )}

          {type !== "card" && (
          <label className="field">
            <span className="field-l">Hesap</span>
            <select value={account} onChange={(e) => setAccount(e.target.value)}>
              {accounts.length === 0 && <option value="">Hesap yok</option>}
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          )}

          <label className="sch-autopay">
            <input type="checkbox" checked={autopay} onChange={(e) => setAutopay(e.target.checked)} />
            <div>
              <div className="sch-autopay-t">Otomatik ödeme</div>
              <div className="sch-autopay-d">Otomatik talimatla ödenen ödemeleri işaretle (bilgilendirme amaçlı)</div>
            </div>
          </label>
        </div>

        <footer className="modal-f">
          <button type="button" className="btn btn-ghost btn-md" onClick={onClose}>İptal</button>
          <button type="submit" className="btn btn-primary btn-md" disabled={!canSubmit}>{editing.isNew ? "Planı oluştur" : "Kaydet"}</button>
        </footer>
      </form>
    </div>
  );
}

// expose
Object.assign(window, { DashboardView, TransactionsView, AccountsView, ScheduledView, BudgetView, ReportsView, DebtsView });