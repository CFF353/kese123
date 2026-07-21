// App shell: sidebar, topbar, modal, main router
// ────────────────────────────────────────────

const { useState: useStateA, useEffect: useEffectA } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "dark": true,
  "accent": "emerald",
  "density": "regular"
}/*EDITMODE-END*/;

// ── Persistence ────────────────────────────────
const STORAGE_KEY = "kese_finans_v1";

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("Kayıtlı veri okunamadı:", e);
    return null;
  }
}

function usePersistentState(key, fallback) {
  const stored = React.useMemo(() => {
    const s = loadStore();
    return s && key in s ? s[key] : fallback;
  }, [key]);
  const [value, setValue] = React.useState(stored);
  // Persist on change
  React.useEffect(() => {
    try {
      const s = loadStore() || {};
      s[key] = value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch (e) {
      console.warn("Veri kaydedilemedi:", e);
    }
  }, [key, value]);
  return [value, setValue];
}

const ACCENT_PALETTES = {
  emerald: { accent: "oklch(0.78 0.16 152)", accentSoft: "oklch(0.78 0.16 152 / 0.12)" },
  violet:  { accent: "oklch(0.72 0.18 290)", accentSoft: "oklch(0.72 0.18 290 / 0.14)" },
  amber:   { accent: "oklch(0.82 0.16 75)",  accentSoft: "oklch(0.82 0.16 75 / 0.14)" },
  sky:     { accent: "oklch(0.74 0.15 230)", accentSoft: "oklch(0.74 0.15 230 / 0.14)" },
};

const NAV = [
  { id: "dashboard", label: "Genel bakış", icon: "dashboard" },
  { id: "keseplus",  label: "Kese+",       icon: "sparkles" },
  { id: "islemler",  label: "İşlemler",    icon: "list" },
  { id: "hesaplar",  label: "Hesaplar",    icon: "wallet" },
  { id: "odemeler",  label: "Planlı ödemeler", icon: "calendar" },
  { id: "butce",     label: "Bütçe",       icon: "pie" },
  { id: "hedefler",  label: "Hedefler",    icon: "target" },
  { id: "portfoy",   label: "Yatırımlar",  icon: "trendingUp" },
  { id: "raporlar",  label: "Raporlar",    icon: "chart" },
  { id: "borclar",   label: "Borçlar",     icon: "debt" },
  { id: "notlar",    label: "Notlar",      icon: "note" },
];

function Sidebar({ active, onChange, accounts, onOpenSettings }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
            <path d="M4 19V8l8-5 8 5v11" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M9 19v-6h6v6" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="12" cy="10" r="1.3" fill="var(--accent)"/>
          </svg>
        </div>
        <div className="brand-text">
          <div className="brand-name">Kese</div>
          <div className="brand-sub">finans takibi</div>
        </div>
      </div>

      <nav className="nav">
        <div className="nav-section-l">Ana menü</div>
        {NAV.map(item => (
          <button
            key={item.id}
            className={`nav-i ${active===item.id?"nav-i-act":""}`}
            onClick={()=>onChange(item.id)}
          >
            <Icon name={item.icon} size={18}/>
            <span>{item.label}</span>
          </button>
        ))}

        {accounts.length > 0 && (
          <>
            <div className="nav-section-l" style={{marginTop:24}}>Hesaplar</div>
            {accounts.slice(0,4).map(a => (
              <button key={a.id} className="nav-i nav-i-acc" onClick={()=>onChange("hesaplar")}>
                <span className="nav-acc-dot" style={{background:a.color}}/>
                <span className="nav-acc-name">{a.name}</span>
                <span className={`nav-acc-bal mono ${a.balance<0?"neg":""}`}>
                  ₺{APP_DATA.fmtShort(Math.abs(a.balance))}
                </span>
              </button>
            ))}
          </>
        )}
      </nav>

      <div className="sidebar-foot">
        <div className="user-card">
          <div className="avatar">K</div>
          <div className="user-info">
            <div className="user-name">Kullanıcı</div>
            <div className="user-mail">Hesabını kişiselleştir</div>
          </div>
          <button className="icon-btn" title="Ayarlar ve veri" onClick={onOpenSettings}><Icon name="settings" size={16}/></button>
        </div>
      </div>
    </aside>
  );
}

function TopBar({ onAddTransaction, onBulkAdd, ctx }) {
  const { transactions, accounts, budgets, scheduled, goals, onNavigate, setGlobalQuery } = ctx;
  const [q, setQ] = useStateA("");
  const [searchOpen, setSearchOpen] = useStateA(false);
  const [bellOpen, setBellOpen] = useStateA(false);
  const today = appToday();

  // ── Arama sonuçları ──
  const ql = q.trim().toLowerCase();
  const txMatches = ql ? transactions.filter((tx) => !isTransferLeg(tx) && (tx.name.toLowerCase().includes(ql) || (tx.note || "").toLowerCase().includes(ql))).slice(0, 6) : [];
  const accMatches = ql ? accounts.filter((a) => a.name.toLowerCase().includes(ql)).slice(0, 4) : [];
  const hasResults = txMatches.length > 0 || accMatches.length > 0;

  const goSearch = () => {
    setGlobalQuery && setGlobalQuery(q);
    onNavigate("islemler");
    setSearchOpen(false);
  };

  // ── Bildirimler ──
  const notifs = React.useMemo(() => {
    const list = [];
    const ymd = (d) => localYMD(d);
    const todayKey = ymd(today);
    const in7 = new Date(today); in7.setDate(today.getDate() + 7);
    const in7Key = ymd(in7);
    // Yaklaşan planlı ödemeler (7 gün)
    (scheduled || []).filter((s) => s.active && s.nextDate >= todayKey && s.nextDate <= in7Key)
      .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
      .forEach((s) => {
        const d = parseLocalDate(s.nextDate);
        const days = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
        list.push({ icon: "calendar", color: "#0ea5e9", title: s.name, desc: `${days === 0 ? "Bugün" : days === 1 ? "Yarın" : days + " gün sonra"} · ₺${APP_DATA.fmt(Math.abs(s.amount))}`, nav: "odemeler" });
      });
    // Bütçe aşımı / yaklaşma
    const mStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const spent = {};
    transactions.forEach((tx) => { if (!isTransferLeg(tx) && tx.amount < 0 && new Date(tx.date) >= mStart) spent[tx.category] = (spent[tx.category] || 0) + -tx.amount; });
    (budgets || []).forEach((b) => {
      const used = spent[b.category] || 0;
      const cat = APP_DATA.categories.find((c) => c.id === b.category);
      const pct = b.limit ? used / b.limit * 100 : 0;
      if (pct >= 100) list.push({ icon: "pie", color: "#ef4444", title: `Bütçe aşıldı: ${cat?.label || b.category}`, desc: `₺${APP_DATA.fmt(used)} / ₺${APP_DATA.fmt(b.limit)} (%${pct.toFixed(0)})`, nav: "butce" });
      else if (pct >= 85) list.push({ icon: "pie", color: "#f59e0b", title: `Bütçe sınırına yakın: ${cat?.label || b.category}`, desc: `%${pct.toFixed(0)} kullanıldı`, nav: "butce" });
    });
    // Kredi kartı yüksek kullanım
    accounts.filter((a) => a.type.includes("Kart") && a.limit).forEach((a) => {
      const owed = Math.max(0, -a.balance);
      const util = a.limit ? owed / a.limit * 100 : 0;
      if (util >= 70) list.push({ icon: "card", color: util >= 90 ? "#ef4444" : "#f59e0b", title: `${a.name} kullanımı yüksek`, desc: `%${util.toFixed(0)} · ₺${APP_DATA.fmt(owed)} borç`, nav: "borclar" });
    });
    // Düşük bakiye (vadesiz/maaş)
    accounts.filter((a) => !a.type.includes("Kart") && a.balance >= 0 && a.balance < 500).forEach((a) => {
      list.push({ icon: "wallet", color: "#f59e0b", title: `${a.name} bakiyesi düşük`, desc: `₺${APP_DATA.fmt(a.balance)}`, nav: "hesaplar" });
    });
    // Hedef tamamlandı
    (goals || []).filter((g) => g.saved >= g.target && g.target > 0).forEach((g) => {
      list.push({ icon: "target", color: "#22c55e", title: `Hedef tamamlandı: ${g.name}`, desc: `₺${APP_DATA.fmt(g.target)} 🎉`, nav: "hedefler" });
    });
    return list;
  }, [transactions, accounts, budgets, scheduled, goals]);

  const goNotif = (n) => { onNavigate(n.nav); setBellOpen(false); };

  return (
    <header className="topbar">
      <div className="topbar-search-wrap">
        <div className={`search-input topbar-search ${searchOpen && q ? "search-input-open" : ""}`}>
          <Icon name="search" size={16}/>
          <input
            type="text"
            placeholder="İşlem, kategori veya hesap ara..."
            value={q}
            onChange={(e) => { setQ(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            onKeyDown={(e) => { if (e.key === "Enter") goSearch(); if (e.key === "Escape") { setQ(""); setSearchOpen(false); e.target.blur(); } }}
          />
          {q ? <button className="search-clear" onClick={() => { setQ(""); }}><Icon name="x" size={14}/></button> : <span className="kbd">⏎</span>}
        </div>
        {searchOpen && q && (
          <div className="search-dropdown">
            {!hasResults && <div className="search-empty">"{q}" için sonuç yok</div>}
            {accMatches.length > 0 && (
              <div className="search-group">
                <div className="search-group-t">Hesaplar</div>
                {accMatches.map((a) => (
                  <button key={a.id} className="search-res" onMouseDown={(e) => { e.preventDefault(); onNavigate("hesaplar"); setSearchOpen(false); setQ(""); }}>
                    <span className="search-res-dot" style={{ background: a.color }}/>
                    <span className="search-res-n">{a.name}</span>
                    <span className="search-res-amt mono">₺{APP_DATA.fmt(a.balance)}</span>
                  </button>
                ))}
              </div>
            )}
            {txMatches.length > 0 && (
              <div className="search-group">
                <div className="search-group-t">İşlemler</div>
                {txMatches.map((tx) => {
                  const cat = APP_DATA.categories.find((c) => c.id === tx.category);
                  return (
                    <button key={tx.id} className="search-res" onMouseDown={(e) => { e.preventDefault(); goSearch(); }}>
                      <span className="search-res-ic" style={{ background: `${cat?.color || "#64748b"}22`, color: cat?.color || "#64748b" }}>{tx.name[0]}</span>
                      <span className="search-res-n">{tx.name}<span className="search-res-sub">{fmtDate(tx.date)}</span></span>
                      <span className={`search-res-amt mono ${tx.amount < 0 ? "neg" : "pos"}`}>{tx.amount < 0 ? "−" : "+"}₺{APP_DATA.fmt(Math.abs(tx.amount))}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {hasResults && <button className="search-all" onMouseDown={(e) => { e.preventDefault(); goSearch(); }}>Tüm sonuçları İşlemler'de gör →</button>}
          </div>
        )}
      </div>
      <div className="topbar-actions">
        <div className="bell-wrap">
          <button className="icon-btn" onClick={() => setBellOpen((v) => !v)} title="Bildirimler">
            <Icon name="bell" size={18}/>
            {notifs.length > 0 && <span className="notif-badge">{notifs.length}</span>}
          </button>
          {bellOpen && (
            <>
              <div className="bell-backdrop" onClick={() => setBellOpen(false)}/>
              <div className="bell-popover">
                <div className="bell-h">
                  <span>Bildirimler</span>
                  {notifs.length > 0 && <span className="bell-count">{notifs.length}</span>}
                </div>
                {notifs.length === 0 ? (
                  <div className="bell-empty"><Icon name="check" size={20}/><span>Her şey yolunda — bildirim yok</span></div>
                ) : (
                  <div className="bell-list">
                    {notifs.map((n, i) => (
                      <button key={i} className="bell-item" onClick={() => goNotif(n)}>
                        <span className="bell-ic" style={{ background: `${n.color}22`, color: n.color }}><Icon name={n.icon} size={15}/></span>
                        <span className="bell-b">
                          <span className="bell-t">{n.title}</span>
                          <span className="bell-d">{n.desc}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <button className="btn btn-ghost btn-md" onClick={onBulkAdd} title="Birden fazla işlemi tek seferde gir">
          <Icon name="list" size={16}/>
          Toplu giriş
        </button>
        <button className="btn btn-primary btn-md" onClick={onAddTransaction}>
          <Icon name="plus" size={16}/>
          Yeni işlem
        </button>
      </div>
    </header>
  );
}

function AddTxModal({ open, onClose, onSubmit, accounts = [], onAddTransfer }) {
  const [type, setType] = useStateA("expense");
  const [name, setName] = useStateA("");
  const [amount, setAmount] = useStateA("");
  const [category, setCategory] = useStateA("market");
  const [account, setAccount] = useStateA("");
  const [toAccount, setToAccount] = useStateA("");
  const [note, setNote] = useStateA("");
  const [quickText, setQuickText] = useStateA("");

  useEffectA(() => {
    if (!open) return;
    if (!account || !accounts.some(a => a.id === account)) setAccount(accounts[0]?.id || "");
    if (!toAccount || !accounts.some(a => a.id === toAccount)) setToAccount(accounts[1]?.id || accounts[0]?.id || "");
    const onEsc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose, accounts]);

  useEffectA(() => {
    if (!open) { setQuickText(""); }
  }, [open]);

  if (!open) return null;

  const noAccounts = accounts.length === 0;

  const runQuickParse = (text) => {
    setQuickText(text);
    const parsed = window.parseQuickEntry(text, APP_DATA.categories);
    if (!parsed) return;
    setType(parsed.type);
    setCategory(parsed.category);
    setName(parsed.name);
    if (parsed.amount != null && !isNaN(parsed.amount)) setAmount(String(parsed.amount));
  };

  const submitFromQuick = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const parsed = window.parseQuickEntry(quickText, APP_DATA.categories);
    if (!parsed || !parsed.amount || parsed.amount <= 0 || !account) return;
    onSubmit({
      name: parsed.name,
      amount: parsed.type === "expense" ? -Math.abs(parsed.amount) : Math.abs(parsed.amount),
      category: parsed.category,
      account,
      note: "",
      date: appToday().toISOString(),
    });
    setQuickText(""); setName(""); setAmount(""); setNote("");
    onClose();
  };

  const submit = (e) => {
    e.preventDefault();
    const amt = parseFloat(String(amount).replace(",", "."));
    if (!amt || amt <= 0 || !account) return;
    if (type === "transfer") {
      if (!toAccount || toAccount === account) return;
      onAddTransfer && onAddTransfer({ from: account, to: toAccount, amount: Math.abs(amt), note: note || name });
    } else {
      if (!name) return;
      onSubmit({
        name,
        amount: type === "expense" ? -Math.abs(amt) : Math.abs(amt),
        category,
        account,
        note,
        date: appToday().toISOString(),
      });
    }
    setName(""); setAmount(""); setNote("");
    onClose();
  };

  return (
    <div className="modal-bd" onClick={onClose}>
      <form className="modal" onClick={(e)=>e.stopPropagation()} onSubmit={submit}>
        <header className="modal-h">
          <div>
            <h2>Yeni işlem</h2>
            <p>Gelir veya gider kaydı oluştur</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" size={18}/></button>
        </header>

        {type !== "transfer" && (
          <div style={{margin:"14px 24px 0"}}>
            <div className="quick-add-box">
              <Icon name="zap" size={15} />
              <input
                type="text"
                autoFocus
                placeholder="Hızlı ekle: örn. 'market 250 tl' — Enter'a bas, direkt kaydedilsin"
                value={quickText}
                onChange={(e) => runQuickParse(e.target.value)}
                onKeyDown={submitFromQuick}
              />
            </div>
            <p className="quick-add-hint">Yazınca tutar, kategori ve isim otomatik dolar — aşağıdan kontrol edip düzenleyebilirsin.</p>
          </div>
        )}

        <div className="seg seg-lg" style={{margin:"12px 24px 0"}}>
          <button type="button" className={type==="expense"?"seg-act":""} onClick={()=>setType("expense")}>
            <Icon name="arrowUp" size={14}/>Gider
          </button>
          <button type="button" className={type==="income"?"seg-act":""} onClick={()=>setType("income")}>
            <Icon name="arrowDown" size={14}/>Gelir
          </button>
          <button type="button" className={type==="transfer"?"seg-act":""} onClick={()=>setType("transfer")}>
            <Icon name="repeat" size={14}/>Transfer
          </button>
        </div>

        <div className="modal-b">
          <div className="amount-input">
            <span className="amount-curr">₺</span>
            <input
              type="text"
              placeholder="0,00"
              value={amount}
              onChange={(e)=>setAmount(e.target.value)}
              className="amount-val mono"
            />
          </div>

          {noAccounts && (
            <div className="transfer-warn neg" style={{marginBottom:4}}>Önce bir hesap eklemelisin — Hesaplar sekmesinden ekleyebilirsin.</div>
          )}

          {type !== "transfer" && (
          <label className="field">
            <span className="field-l">İşlem adı</span>
            <input
              type="text"
              placeholder="örn. Migros alışveriş"
              value={name}
              onChange={(e)=>setName(e.target.value)}
            />
          </label>
          )}

          {type === "transfer" ? (
            <div className="field-row">
              <label className="field">
                <span className="field-l">Gönderen hesap</span>
                <select value={account} onChange={(e)=>setAccount(e.target.value)}>
                  {accounts.length === 0 && <option value="">Hesap yok</option>}
                  {accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="field-l">Alıcı hesap</span>
                <select value={toAccount} onChange={(e)=>setToAccount(e.target.value)}>
                  {accounts.length === 0 && <option value="">Hesap yok</option>}
                  {accounts.filter(a=>a.id!==account).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
            </div>
          ) : (
          <div className="field-row">
            <label className="field">
              <span className="field-l">Kategori</span>
              <select value={category} onChange={(e)=>setCategory(e.target.value)}>
                {APP_DATA.categories.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span className="field-l">Hesap</span>
              <select value={account} onChange={(e)=>setAccount(e.target.value)}>
                {accounts.length === 0 && <option value="">Hesap yok</option>}
                {accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          </div>
          )}

          <label className="field">
            <span className="field-l">Not (opsiyonel)</span>
            <textarea
              rows="2"
              placeholder="İşlem hakkında not..."
              value={note}
              onChange={(e)=>setNote(e.target.value)}
            />
          </label>
        </div>

        <footer className="modal-f">
          <button type="button" className="btn btn-ghost btn-md" onClick={onClose}>İptal</button>
          <button type="submit" className="btn btn-primary btn-md" disabled={noAccounts}>{type === "transfer" ? "Transferi yap" : "İşlemi kaydet"}</button>
        </footer>
      </form>
    </div>
  );
}

// Anahtar girme satırı — native window.prompt() bazı tarayıcı/ortamlarda (embedded webview,
// otomasyon vb.) sessizce çalışmayabiliyor; bunun yerine satır içi (inline) bir giriş alanı açar.
function ApiKeyRow({ storageKey, icon, iconBg, iconColor, title, descUnset, placeholder }) {
  const [editing, setEditing] = useStateA(false);
  const [val, setVal] = useStateA("");
  const [stored, setStored] = useStateA(() => localStorage.getItem(storageKey) || "");

  const doSave = () => {
    const v = val.trim();
    if (v) { localStorage.setItem(storageKey, v); setStored(v); }
    else { localStorage.removeItem(storageKey); setStored(""); }
    setEditing(false);
  };
  const doRemove = () => { localStorage.removeItem(storageKey); setStored(""); setVal(""); setEditing(false); };

  if (editing) {
    return (
      <div className="set-row" style={{ flexDirection: "column", alignItems: "stretch", cursor: "default" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="set-row-icon" style={{ background: iconBg, color: iconColor }}><Icon name={icon} size={16}/></div>
          <div className="set-row-b"><div className="set-row-t">{title}</div></div>
        </div>
        <input
          type="text"
          autoFocus
          value={val}
          placeholder={placeholder}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doSave(); } else if (e.key === "Escape") setEditing(false); }}
          style={{ width: "100%", marginTop: 10, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 11px", fontSize: 13, color: "var(--fg)", fontFamily: "inherit", outline: "none" }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 10 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Vazgeç</button>
          {stored && <button type="button" className="btn btn-ghost btn-sm" onClick={doRemove}>Sil</button>}
          <button type="button" className="btn btn-primary btn-sm" onClick={doSave}>Kaydet</button>
        </div>
      </div>
    );
  }

  return (
    <div className="set-row" onClick={() => { setVal(stored); setEditing(true); }}>
      <div className="set-row-icon" style={{ background: iconBg, color: iconColor }}><Icon name={icon} size={16}/></div>
      <div className="set-row-b">
        <div className="set-row-t">{title}</div>
        <div className="set-row-d">{stored ? "Anahtar kayıtlı ✓ — değiştirmek/silmek için tıkla" : descUnset}</div>
      </div>
      <Icon name="chevronRight" size={16}/>
    </div>
  );
}

function SettingsModal({ open, onClose, onExport, onImport, onReset, onLoadDemo, stats, onOpenAuth }) {
  const fileRef = React.useRef(null);
  useEffectA(() => {
    if (!open) return;
    const onEsc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-bd" onClick={onClose}>
      <div className="modal" onClick={(e)=>e.stopPropagation()}>
        <header className="modal-h">
          <div>
            <h2>Ayarlar ve veri</h2>
            <p>Verilerin bu tarayıcıya otomatik kaydediliyor</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" size={18}/></button>
        </header>
        <div className="modal-b">
          <div className="set-status">
            <div className="set-status-icon"><Icon name="check" size={16}/></div>
            <div>
              <div className="set-status-t">Otomatik kayıt aktif</div>
              <div className="set-status-d">{stats.accounts} hesap · {stats.transactions} işlem · {stats.debts} borç · {stats.budgets} bütçe kategorisi</div>
            </div>
          </div>

          <div className="set-section-l">Hesap & bulut</div>
          <CloudAccountRow onOpenAuth={onOpenAuth} />

          <ApiKeyRow
            storageKey="kese_api_key"
            icon="sparkles" iconBg="rgba(168,85,247,0.14)" iconColor="#a855f7"
            title="Yapay zekâ anahtarı"
            descUnset="Kendi Anthropic API anahtarınla AI'yı her yerde kullan"
            placeholder="sk-ant-..."
          />

          <ApiKeyRow
            storageKey="kese_twelvedata_key"
            icon="trendingUp" iconBg="rgba(14,165,233,0.14)" iconColor="#0ea5e9"
            title="Hisse senedi fiyat anahtarı"
            descUnset="Ücretsiz Twelve Data anahtarıyla BIST ve yabancı hisse fiyatlarını otomatik çek"
            placeholder="Twelve Data API anahtarı"
          />

          <div className="set-section-l">Başlangıç</div>
          <div className="set-row" onClick={onLoadDemo}>
            <div className="set-row-icon" style={{background:"var(--accent-soft)", color:"var(--accent)"}}><Icon name="sparkles" size={16}/></div>
            <div className="set-row-b">
              <div className="set-row-t">Örnek veri yükle</div>
              <div className="set-row-d">5 hesap, ~120 işlem, borçlar, bütçeler ve planlı ödemelerle dolu demo</div>
            </div>
            <Icon name="chevronRight" size={16}/>
          </div>

          <div className="set-section-l">Yedekleme</div>
          <div className="set-row" onClick={onExport}>
            <div className="set-row-icon"><Icon name="download" size={16}/></div>
            <div className="set-row-b">
              <div className="set-row-t">Yedek indir</div>
              <div className="set-row-d">Tüm verini JSON dosyası olarak kaydet</div>
            </div>
            <Icon name="chevronRight" size={16}/>
          </div>
          <div className="set-row" onClick={()=>fileRef.current?.click()}>
            <div className="set-row-icon"><Icon name="repeat" size={16}/></div>
            <div className="set-row-b">
              <div className="set-row-t">Yedekten geri yükle</div>
              <div className="set-row-d">Daha önce indirdiğin JSON dosyasını yükle</div>
            </div>
            <Icon name="chevronRight" size={16}/>
            <input ref={fileRef} type="file" accept="application/json,.json" style={{display:"none"}}
              onChange={(e)=>{ const f = e.target.files[0]; if (f) onImport(f); e.target.value=""; }}/>
          </div>

          <div className="set-section-l">Tehlikeli bölge</div>
          <div className="set-row set-row-danger" onClick={onReset}>
            <div className="set-row-icon"><Icon name="x" size={16}/></div>
            <div className="set-row-b">
              <div className="set-row-t">Tüm verileri sıfırla</div>
              <div className="set-row-d">Hesap, işlem, borç ve bütçeleri temizle</div>
            </div>
            <Icon name="chevronRight" size={16}/>
          </div>
        </div>
        <footer className="modal-f">
          <button type="button" className="btn btn-primary btn-md" onClick={onClose}>Tamam</button>
        </footer>
      </div>
    </div>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [active, setActive] = useStateA("dashboard");
  const [globalQuery, setGlobalQuery] = useStateA("");
  const [showBalances, setShowBalances] = useStateA(true);
  const [modalOpen, setModalOpen] = useStateA(false);
  const [bulkOpen, setBulkOpen] = useStateA(false);
  const [settingsOpen, setSettingsOpen] = useStateA(false);
  const [authOpen, setAuthOpen] = useStateA(false);
  const [transactions, setTransactions] = usePersistentState("transactions", APP_DATA.transactions);
  const [accounts, setAccounts] = usePersistentState("accounts", APP_DATA.accounts);
  const [debts, setDebts] = usePersistentState("debts", APP_DATA.debts);
  const [budgets, setBudgets] = usePersistentState("budgets", APP_DATA.budgets);
  const [scheduled, setScheduled] = usePersistentState("scheduled", []);
  const [goals, setGoals] = usePersistentState("goals", []);
  const [snapshots, setSnapshots] = usePersistentState("snapshots", []);
  const [holdings, setHoldings] = usePersistentState("holdings", []);
  const [pfSnapshots, setPfSnapshots] = usePersistentState("pfSnapshots", []);
  const [holdingTxs, setHoldingTxs] = usePersistentState("holdingTxs", []);
  const [notes, setNotes] = usePersistentState("notes", []);
  const [categories, setCategories] = usePersistentState("categories", APP_DATA.categories);

  // Kategorileri APP_DATA ile senkronla (render sırasında) — tüm doğrudan okuyucular anında güncel
  if (APP_DATA.categories !== categories) {
    APP_DATA.categories.length = 0;
    categories.forEach((c) => APP_DATA.categories.push(c));
  }

  // Apply theme + accent
  useEffectA(() => {
    const root = document.documentElement;
    root.dataset.theme = t.dark ? "dark" : "light";
    const pal = ACCENT_PALETTES[t.accent] || ACCENT_PALETTES.emerald;
    root.style.setProperty("--accent", pal.accent);
    root.style.setProperty("--accent-soft", pal.accentSoft);
    root.dataset.density = t.density || "regular";
  }, [t.dark, t.accent, t.density]);

  // ── Net worth snapshot (her ay otomatik) ──────
  const computeNetWorth = (accs, dbs) => {
    const assets = accs.reduce((s, a) => s + Math.max(0, a.balance), 0);
    const cardNeg = -accs.reduce((s, a) => s + Math.min(0, a.balance), 0);
    const loans = dbs.filter((d) => !d.type.includes("Kart")).reduce((s, d) => s + d.remaining, 0);
    const liabilities = cardNeg + loans;
    return { assets, liabilities, netWorth: assets - liabilities };
  };

  useEffectA(() => {
    if (accounts.length === 0 && debts.length === 0) return;
    const ref = appToday();
    const ym = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
    const date = localYMD(ref);
    const { assets, liabilities, netWorth } = computeNetWorth(accounts, debts);
    setSnapshots((prev) => {
      const existing = prev.find((s) => s.ym === ym);
      if (existing) {
        if (existing.netWorth === netWorth && existing.assets === assets && existing.liabilities === liabilities) return prev;
        return prev.map((s) => s.ym === ym ? { ...s, assets, liabilities, netWorth, date } : s);
      }
      return [...prev, { ym, date, assets, liabilities, netWorth }].sort((a, b) => a.ym.localeCompare(b.ym));
    });
  }, [accounts, debts]);

  const takeSnapshot = () => {
    const ref = appToday();
    const ym = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
    const { assets, liabilities, netWorth } = computeNetWorth(accounts, debts);
    setSnapshots((prev) => {
      const rest = prev.filter((s) => s.ym !== ym);
      return [...rest, { ym, date: localYMD(ref), assets, liabilities, netWorth }].sort((a, b) => a.ym.localeCompare(b.ym));
    });
  };

  const addTransaction = (tx) => {
    setTransactions((prev) => [{ id: "tx-new-" + Date.now(), ...tx }, ...prev]);
    // Hesap bakiyesini güncelle (gider negatif, gelir pozitif tutarla)
    if (tx.account) {
      setAccounts((prev) => prev.map(a => a.id === tx.account ? { ...a, balance: a.balance + tx.amount } : a));
    }
  };

  const addTransactionsBulk = (txs) => {
    if (!txs || txs.length === 0) return;
    const stamped = txs.map((tx, i) => ({ id: "tx-bulk-" + Date.now() + "-" + i, ...tx }));
    setTransactions((prev) => [...stamped, ...prev]);
    const deltaByAccount = {};
    txs.forEach((tx) => { if (tx.account) deltaByAccount[tx.account] = (deltaByAccount[tx.account] || 0) + tx.amount; });
    setAccounts((prev) => prev.map(a => deltaByAccount[a.id] ? { ...a, balance: a.balance + deltaByAccount[a.id] } : a));
  };

  const removeTransaction = (id) => {
    const tx = transactions.find(t => t.id === id);
    if (!tx) return;
    setTransactions((prev) => prev.filter(t => t.id !== id));
    if (tx.account) {
      setAccounts((prev) => prev.map(a => a.id === tx.account ? { ...a, balance: a.balance - tx.amount } : a));
    }
  };

  const updateTransaction = (id, patch) => {
    const old = transactions.find(t => t.id === id);
    if (!old) return;
    setTransactions((prev) => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    const newAccount = patch.account !== undefined ? patch.account : old.account;
    const newAmount = patch.amount !== undefined ? patch.amount : old.amount;
    if (old.account === newAccount) {
      const diff = newAmount - old.amount;
      if (diff !== 0 && newAccount) setAccounts((prev) => prev.map(a => a.id === newAccount ? { ...a, balance: a.balance + diff } : a));
    } else {
      setAccounts((prev) => prev.map(a => {
        if (a.id === old.account) return { ...a, balance: a.balance - old.amount };
        if (a.id === newAccount) return { ...a, balance: a.balance + newAmount };
        return a;
      }));
    }
  };

  const addTransfer = ({ from, to, amount, note }) => {
    const ts = Date.now();    const date = appToday().toISOString();
    const amt = Math.abs(amount);
    setTransactions((prev) => [
      { id: "tx-out-"+ts, name: accounts.find(a=>a.id===to)?.name || "Transfer", note: note || "Hesaplar arası transfer", category: "diger", account: from, amount: -amt, date },
      { id: "tx-in-"+ts, name: accounts.find(a=>a.id===from)?.name || "Transfer", note: note || "Hesaplar arası transfer", category: "diger", account: to, amount: amt, date },
      ...prev,
    ]);
    setAccounts((prev) => prev.map(a => {
      if (a.id === from) return { ...a, balance: a.balance - amt };
      if (a.id === to) return { ...a, balance: a.balance + amt };
      return a;
    }));
  };

  const addAccount = (a) => {
    setAccounts((prev) => [...prev, { id: "acc-new-"+Date.now(), ...a }]);
  };

  const updateAccount = (id, patch) => {
    setAccounts((prev) => prev.map(a => a.id === id ? { ...a, ...patch } : a));
  };

  const reorderAccounts = (fromId, toId) => {
    setAccounts((prev) => {
      const arr = [...prev];
      const fi = arr.findIndex(a => a.id === fromId);
      const ti = arr.findIndex(a => a.id === toId);
      if (fi < 0 || ti < 0 || fi === ti) return prev;
      const [moved] = arr.splice(fi, 1);
      arr.splice(ti, 0, moved);
      return arr;
    });
  };

  // ── Yatırımlar (portföy) ──────────────────────
  const addHolding = (h) => {
    setHoldings((prev) => [...prev, { id: "hold-" + Date.now(), ...h }]);
  };
  const updateHolding = (id, patch) => {
    setHoldings((prev) => prev.map(h => h.id === id ? { ...h, ...patch } : h));
  };
  const removeHolding = (id) => {
    setHoldings((prev) => prev.filter(h => h.id !== id));
    setHoldingTxs((prev) => prev.filter(t => t.holdingId !== id));
  };

  // İşlem (lot) defteri — alış/satış kayıtları, işaretli qty (+ alış / − satış)
  const addHoldingTx = (tx) => {
    setHoldingTxs((prev) => [...prev, { id: "htx-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7), ...tx }]);
  };
  const removeHoldingTx = (id) => {
    setHoldingTxs((prev) => prev.filter(t => t.id !== id));
  };

  // Portföy değeri anlık görüntüleri — otomatik + manuel geçmiş girişi
  const addPfSnapshot = (snap) => {
    setPfSnapshots((prev) => {
      const rest = prev.filter((s) => s.date !== snap.date);
      return [...rest, snap].sort((a, b) => a.date.localeCompare(b.date));
    });
  };
  const removePfSnapshot = (date) => {
    setPfSnapshots((prev) => prev.filter((s) => s.date !== date));
  };

  // ── Notlar ────────────────────────────────────
  const addNote = (n) => {
    setNotes((prev) => [{ id: "note-" + Date.now(), createdAt: appToday().toISOString(), pinned: false, ...n }, ...prev]);
  };
  const updateNote = (id, patch) => {
    setNotes((prev) => prev.map(n => n.id === id ? { ...n, ...patch, updatedAt: appToday().toISOString() } : n));
  };
  const removeNote = (id) => {
    setNotes((prev) => prev.filter(n => n.id !== id));
  };

  // ── Kategoriler ───────────────────────────────
  const slugify = (s) => (s || "").toLowerCase()
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "kat";
  const addCategory = (c) => {
    let id = "cat-" + slugify(c.label);
    let n = 1;
    while (categories.some((x) => x.id === id)) { id = "cat-" + slugify(c.label) + "-" + (++n); }
    setCategories((prev) => [...prev, { id, kind: "expense", icon: "more", ...c, id }]);
  };
  const updateCategory = (id, patch) => {
    setCategories((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c));
  };
  const removeCategory = (id, reassignTo = "diger") => {
    // İşlemleri/bütçeleri/planlıları yeniden ata — veri kaybı olmasın
    setTransactions((prev) => prev.map((t) => t.category === id ? { ...t, category: reassignTo } : t));
    setBudgets((prev) => prev.filter((b) => b.category !== id));
    setScheduled((prev) => prev.map((s) => s.category === id ? { ...s, category: reassignTo } : s));
    setCategories((prev) => prev.filter((c) => c.id !== id));
  };

  // Kredi kartı ödemesi — nakit hesaptan karta (devreden borcu azaltır)
  const payCard = ({ cardId, fromAccount, amount, note }) => {
    const ts = Date.now();
    const date = appToday().toISOString();
    const card = accounts.find(a => a.id === cardId);
    const src = accounts.find(a => a.id === fromAccount);
    const amt = Math.abs(amount);
    // Transfer-stili çift kayıt: raporlarda harcama olarak sayılmaz
    setTransactions((prev) => [
      { id: "tx-cardpay-out-"+ts, name: card?.name || "Kredi Kartı", note: note || "Kredi kartı ödemesi", category: "diger", account: fromAccount, amount: -amt, date },
      { id: "tx-cardpay-in-"+ts, name: src?.name || "Ödeme", note: note || "Kredi kartı ödemesi", category: "diger", account: cardId, amount: amt, date },
      ...prev,
    ]);
    setAccounts((prev) => prev.map(a => {
      if (a.id === fromAccount) return { ...a, balance: a.balance - amt };
      if (a.id === cardId) return { ...a, balance: a.balance + amt };
      return a;
    }));
  };

  // Nakit avans — karttan nakit çekme. Kart borcu (avans + komisyon) artar, nakit hesap artar.
  const cashAdvance = ({ cardId, toAccount, amount, feeRate = 3.5 }) => {
    const ts = Date.now();
    const date = appToday().toISOString();
    const card = accounts.find(a => a.id === cardId);
    const dest = accounts.find(a => a.id === toAccount);
    const amt = Math.abs(amount);
    const fee = Math.round(amt * (feeRate / 100) * 100) / 100;
    setTransactions((prev) => [
      // Anapara: transfer-stili çift kayıt (gelir/gider sayılmaz)
      { id: "tx-cardadv-out-"+ts, name: card?.name || "Kredi Kartı", note: "Nakit avans", category: "diger", account: cardId, amount: -amt, date },
      { id: "tx-cardadv-in-"+ts, name: dest?.name || "Nakit avans", note: "Nakit avans", category: "diger", account: toAccount, amount: amt, date },
      // Komisyon: gerçek gider (kart borcuna eklenir)
      ...(fee > 0 ? [{ id: "tx-fee-"+ts, name: (card?.name || "Kart") + " · nakit avans ücreti", note: `Nakit avans komisyonu (%${feeRate})`, category: "faturalar", account: cardId, amount: -fee, date }] : []),
      ...prev,
    ]);
    setAccounts((prev) => prev.map(a => {
      if (a.id === cardId) return { ...a, balance: a.balance - amt - fee };
      if (a.id === toAccount) return { ...a, balance: a.balance + amt };
      return a;
    }));
  };

  const removeAccount = (id) => {
    setAccounts((prev) => prev.filter(a => a.id !== id));
    // Also remove transactions tied to that account
    setTransactions((prev) => prev.filter(t => t.account !== id));
  };

  const addDebt = (debt) => {
    setDebts((prev) => [...prev, { id: "debt-new-"+Date.now(), ...debt }]);
  };

  const removeDebt = (id) => {
    setDebts((prev) => prev.filter(d => d.id !== id));
  };

  const payDebt = ({ debtId, fromAccount, amount, note }) => {
    const date = appToday().toISOString();
    // Record outflow from the paying account
    setTransactions((prev) => [
      { id: "tx-pay-"+Date.now(), name: note || "Borç ödemesi", note: note || "", category: "diger", account: fromAccount, amount: -Math.abs(amount), date },
      ...prev,
    ]);
    // Reduce account balance
    setAccounts((prev) => prev.map(a => a.id === fromAccount ? { ...a, balance: a.balance - Math.abs(amount) } : a));
    // Reduce debt remaining
    if (debtId) {
      setDebts((prev) => prev.map(d => d.id === debtId ? { ...d, remaining: Math.max(0, d.remaining - Math.abs(amount)) } : d));
    }
  };

  // ── Scheduled payments ───────────────────────
  const advanceDate = (iso, freq) => {
    const d = new Date(iso + "T00:00:00");
    if (freq === "weekly") d.setDate(d.getDate() + 7);
    else if (freq === "yearly") d.setFullYear(d.getFullYear() + 1);
    else if (freq === "once") return null;
    else d.setMonth(d.getMonth() + 1); // monthly
    return localYMD(d);
  };

  const addScheduled = (s) => {
    setScheduled((prev) => [...prev, { id: "sch-" + Date.now(), active: true, ...s }]);
  };

  const updateScheduled = (id, patch) => {
    setScheduled((prev) => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const removeScheduled = (id) => {
    setScheduled((prev) => prev.filter(s => s.id !== id));
  };

  const payScheduled = (sch) => {
    const date = appToday().toISOString();
    const ts = Date.now();
    if (sch.kind === "card" && sch.account && sch.cardId) {
      // Kredi kartı ödemesi: nakit hesaptan karta (transfer-stili, gelir/gider sayılmaz)
      const card = accounts.find(a => a.id === sch.cardId);
      const src = accounts.find(a => a.id === sch.account);
      const owed = card ? Math.max(0, -card.balance) : 0;
      // Ödeme modu: tam borç / asgari (~%20) / sabit tutar
      let amt;
      if (sch.payMode === "full") amt = owed;
      else if (sch.payMode === "min") amt = owed > 0 ? Math.max(Math.round(owed * 0.20), Math.min(owed, 100)) : 0;
      else amt = Math.min(Math.abs(sch.amount), owed || Math.abs(sch.amount));
      amt = Math.max(0, Math.round(amt * 100) / 100);
      if (amt > 0) {
        setTransactions((prev) => [
          { id: "tx-cardpay-out-" + ts, name: card?.name || "Kredi Kartı", note: "Planlı kart ödemesi", category: "diger", account: sch.account, amount: -amt, date },
          { id: "tx-cardpay-in-" + ts, name: src?.name || "Ödeme", note: "Planlı kart ödemesi", category: "diger", account: sch.cardId, amount: amt, date },
          ...prev,
        ]);
        setAccounts((prev) => prev.map(a => {
          if (a.id === sch.account) return { ...a, balance: a.balance - amt };
          if (a.id === sch.cardId) return { ...a, balance: Math.min(0, a.balance + amt) };
          return a;
        }));
      }
    } else {
      // Record the transaction
      setTransactions((prev) => [
        { id: "tx-sch-" + ts, name: sch.name, note: "Planlı ödeme", category: sch.category, account: sch.account, amount: sch.amount, date },
        ...prev,
      ]);
      // Update account balance
      if (sch.account) {
        setAccounts((prev) => prev.map(a => a.id === sch.account ? { ...a, balance: a.balance + sch.amount } : a));
      }
    }
    // Advance the schedule's next date (or deactivate if one-time)
    const next = advanceDate(sch.nextDate, sch.frequency);
    setScheduled((prev) => prev.map(s => s.id === sch.id ? { ...s, nextDate: next || s.nextDate, active: next ? s.active : false } : s));
  };

  // ── Goals ────────────────────────────────────
  const addGoal = (g) => {
    setGoals((prev) => [...prev, { id: "goal-" + Date.now(), saved: 0, createdAt: localYMD(appToday()), ...g }]);
  };
  const updateGoal = (id, patch) => {
    setGoals((prev) => prev.map(g => g.id === id ? { ...g, ...patch } : g));
  };
  const removeGoal = (id) => {
    setGoals((prev) => prev.filter(g => g.id !== id));
  };
  const contributeGoal = (id, amount, fromAccount) => {
    setGoals((prev) => prev.map(g => g.id === id ? { ...g, saved: g.saved + amount } : g));
    if (fromAccount) {
      const date = appToday().toISOString();
      const goal = goals.find(g => g.id === id);
      setTransactions((prev) => [
        { id: "tx-goal-" + Date.now(), name: `Hedef: ${goal?.name || ""}`, note: "Birikim katkısı", category: "diger", account: fromAccount, amount: -Math.abs(amount), date },
        ...prev,
      ]);
      setAccounts((prev) => prev.map(a => a.id === fromAccount ? { ...a, balance: a.balance - Math.abs(amount) } : a));
    }
  };

  // ── Data management ──────────────────────────
  const exportData = () => {
    const payload = {
      _app: "Kese Finans Takip",
      _version: 1,
      _exportedAt: new Date().toISOString(),
      accounts, transactions, debts, budgets, scheduled, goals, snapshots, holdings, notes, categories, pfSnapshots, holdingTxs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kese-yedek-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const importData = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data || (!data.accounts && !data.transactions)) {
          alert("Geçersiz yedek dosyası.");
          return;
        }
        if (Array.isArray(data.accounts)) setAccounts(data.accounts);
        if (Array.isArray(data.transactions)) setTransactions(data.transactions);
        if (Array.isArray(data.debts)) setDebts(data.debts);
        if (Array.isArray(data.budgets)) setBudgets(data.budgets);
        if (Array.isArray(data.scheduled)) setScheduled(data.scheduled);
        if (Array.isArray(data.goals)) setGoals(data.goals);
        if (Array.isArray(data.snapshots)) setSnapshots(data.snapshots);
        if (Array.isArray(data.holdings)) setHoldings(data.holdings);
        if (Array.isArray(data.pfSnapshots)) setPfSnapshots(data.pfSnapshots);
        if (Array.isArray(data.holdingTxs)) setHoldingTxs(data.holdingTxs);
        if (Array.isArray(data.notes)) setNotes(data.notes);
        if (Array.isArray(data.categories) && data.categories.length) setCategories(data.categories);
        setSettingsOpen(false);
        alert("Yedek başarıyla geri yüklendi.");
      } catch (err) {
        alert("Dosya okunamadı: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  const resetData = () => {
    if (!confirm("Tüm hesap, işlem, borç ve bütçe verilerin silinecek. Bu işlem geri alınamaz. Emin misin?")) return;
    setAccounts([]);
    setTransactions([]);
    setDebts([]);
    setBudgets([]);
    setScheduled([]);
    setGoals([]);
    setSnapshots([]);
    setHoldings([]);
    setPfSnapshots([]);
    setHoldingTxs([]);
    setNotes([]);
    setSettingsOpen(false);
  };

  const loadDemo = () => {
    if ((accounts.length || transactions.length) && !confirm("Mevcut verilerin örnek verilerle değiştirilecek. Devam edilsin mi?")) return;
    const demo = (typeof generateDemoData === "function") ? generateDemoData() : null;
    if (!demo) { alert("Örnek veri üreteci bulunamadı."); return; }
    setAccounts(demo.accounts);
    setTransactions(demo.transactions);
    setDebts(demo.debts);
    setBudgets(demo.budgets);
    setScheduled(demo.scheduled);
    setGoals(demo.goals || []);
    setSnapshots(demo.snapshots || []);
    setHoldings(demo.holdings || []);
    setPfSnapshots(demo.pfSnapshots || []);
    setHoldingTxs(demo.holdingTxs || []);
    setNotes(demo.notes || []);
    setSettingsOpen(false);
  };

  const ctx = {
    showBalances, setShowBalances,
    onAddTransaction: () => setModalOpen(true),
    removeTransaction,
    updateTransaction,
    onNavigate: setActive,
    globalQuery,
    setGlobalQuery,
    onOpenSettings: () => setSettingsOpen(true),
    transactions,
    accounts,
    debts,
    budgets,
    setBudgets,
    scheduled,
    addScheduled,
    updateScheduled,
    removeScheduled,
    payScheduled,
    goals,
    addGoal,
    updateGoal,
    removeGoal,
    contributeGoal,
    snapshots,
    takeSnapshot,
    addTransfer,
    addAccount,
    updateAccount,
    reorderAccounts,
    payCard,
    cashAdvance,
    addHolding,
    updateHolding,
    removeHolding,
    holdings,
    holdingTxs,
    addHoldingTx,
    removeHoldingTx,
    pfSnapshots,
    addPfSnapshot,
    removePfSnapshot,
    notes,
    addNote,
    updateNote,
    removeNote,
    categories,
    addCategory,
    updateCategory,
    removeCategory,
    removeAccount,
    addDebt,
    removeDebt,
    payDebt,
  };

  let View = DashboardView;
  if (active === "keseplus") View = KesePlusView;
  else if (active === "islemler") View = TransactionsView;
  else if (active === "hesaplar") View = AccountsView;
  else if (active === "odemeler") View = ScheduledView;
  else if (active === "butce") View = BudgetView;
  else if (active === "hedefler") View = GoalsView;
  else if (active === "portfoy") View = PortfolioView;
  else if (active === "raporlar") View = ReportsView;
  else if (active === "borclar") View = DebtsView;
  else if (active === "notlar") View = NotesView;

  return (
    <div className="app">
      <Sidebar active={active} onChange={setActive} accounts={accounts} onOpenSettings={()=>setSettingsOpen(true)}/>
      <main className="main">
        <TopBar onAddTransaction={()=>setModalOpen(true)} onBulkAdd={()=>setBulkOpen(true)} ctx={ctx}/>
        <div className="main-scroll">
          <View ctx={ctx}/>
        </div>
      </main>

      <AddTxModal open={modalOpen} onClose={()=>setModalOpen(false)} onSubmit={addTransaction} accounts={accounts} onAddTransfer={addTransfer}/>
      <BulkAddModal open={bulkOpen} onClose={()=>setBulkOpen(false)} onSubmitBulk={addTransactionsBulk} accounts={accounts}/>

      <SettingsModal
        open={settingsOpen}
        onClose={()=>setSettingsOpen(false)}
        onOpenAuth={()=>{ setSettingsOpen(false); setAuthOpen(true); }}
        onExport={exportData}
        onImport={importData}
        onReset={resetData}
        onLoadDemo={loadDemo}
        stats={{ accounts: accounts.length, transactions: transactions.length, debts: debts.length, budgets: budgets.length }}
      />
      <CloudAuthModal open={authOpen} onClose={()=>setAuthOpen(false)} />

      <TweaksPanel>
        <TweakSection label="Görünüm"/>
        <TweakToggle
          label="Koyu mod"
          value={t.dark}
          onChange={(v)=>setTweak("dark", v)}
        />
        <TweakRadio
          label="Vurgu rengi"
          value={t.accent}
          options={["emerald","violet","amber","sky"]}
          onChange={(v)=>setTweak("accent", v)}
        />
        <TweakRadio
          label="Yoğunluk"
          value={t.density}
          options={["compact","regular","comfy"]}
          onChange={(v)=>setTweak("density", v)}
        />
      </TweaksPanel>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App/>);
