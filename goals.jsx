// Hedefler & OKR — birikim hedefleri
// ─────────────────────────────────────────────

const { useState: useStateG, useEffect: useEffectG } = React;

const GOAL_ICONS = {
  shield: <><path d="M12 2 4 5v6c0 5 3.5 8 8 11 4.5-3 8-6 8-11V5l-8-3z"/></>,
  plane: <><path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a1 1 0 0 0-.9 1.7l5.1 3.4-2.5 2.5H4l-1.5 1.5 3 1 1 3 1.5-1.5v-2.5l2.5-2.5 3.4 5.1a1 1 0 0 0 1.7-.9z"/></>,
  laptop: <><rect x="3" y="5" width="18" height="12" rx="1.5"/><path d="M2 20h20"/></>,
  home: <><path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/></>,
  car: <><path d="M5 12h14l-1.5-4.5a2 2 0 0 0-1.9-1.5H8.4a2 2 0 0 0-1.9 1.5L5 12z"/><path d="M5 12v5h14v-5"/><circle cx="8" cy="17" r="1.5"/><circle cx="16" cy="17" r="1.5"/></>,
  gift: <><rect x="3" y="8" width="18" height="13" rx="1"/><path d="M3 12h18"/><path d="M12 8v13"/><path d="M12 8S10 3 7.5 4.5 9.5 8 12 8z"/><path d="M12 8s2-5 4.5-3.5S14.5 8 12 8z"/></>,
  star: <path d="m12 3 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 18l-5.9 3 1.2-6.5L2.5 9.9 9 9z"/>,
  ring: <><circle cx="12" cy="14" r="6"/><path d="m9 5 3-3 3 3"/><path d="M12 2v6"/></>,
};

const GOAL_ICON_OPTIONS = ["shield", "plane", "laptop", "home", "car", "gift", "star", "ring"];
const GOAL_COLORS = ["#22c55e", "#0ea5e9", "#a855f7", "#f59e0b", "#ec4899", "#14b8a6", "#ef4444", "#6366f1"];

function GoalIcon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {GOAL_ICONS[name] || GOAL_ICONS.star}
    </svg>
  );
}

const GOAL_MONTHS = ["Oca","Şub","Mar","Nis","May","Haz","Tem","Ağu","Eyl","Eki","Kas","Ara"];

function GoalsView({ ctx }) {
  const { showBalances, goals, accounts, addGoal, updateGoal, removeGoal, contributeGoal } = ctx;
  const [editOpen, setEditOpen] = useStateG(null);
  const [contribFor, setContribFor] = useStateG(null);
  const today = appToday();

  const monthsBetween = (iso) => {
    const d = new Date(iso + "T00:00:00");
    return (d.getFullYear() - today.getFullYear()) * 12 + (d.getMonth() - today.getMonth());
  };

  const totalTarget = goals.reduce((s, g) => s + g.target, 0);
  const totalSaved = goals.reduce((s, g) => s + g.saved, 0);
  const totalMonthlyNeed = goals.reduce((s, g) => {
    const m = Math.max(1, monthsBetween(g.deadline));
    return s + Math.max(0, (g.target - g.saved) / m);
  }, 0);
  const completed = goals.filter((g) => g.saved >= g.target).length;

  if (goals.length === 0) {
    return (
      <div className="view view-goals">
        <div className="page-head">
          <div>
            <h1 className="page-title">Hedefler</h1>
            <p className="page-sub">Birikim hedeflerini belirle ve ilerlemeni takip et</p>
          </div>
        </div>
        <div className="empty-big">
          <div className="empty-big-icon"><Icon name="target" size={28} /></div>
          <div className="empty-big-t">Henüz hedef yok</div>
          <p className="empty-big-d">Acil durum fonu, tatil, ev peşinatı gibi birikim hedefleri ekle. Her hedef için aylık ne kadar ayırman gerektiğini ve hedefe kalan süreyi otomatik hesaplarız.</p>
          <button className="btn btn-primary btn-md" onClick={() => setEditOpen({ isNew: true })}><Icon name="plus" size={16} />İlk hedefini ekle</button>
        </div>
        <GoalModal editing={editOpen} onClose={() => setEditOpen(null)} onSave={(d) => { addGoal(d); setEditOpen(null); }} />
      </div>
    );
  }

  return (
    <div className="view view-goals">
      <div className="page-head">
        <div>
          <h1 className="page-title">Hedefler</h1>
          <p className="page-sub">{goals.length} aktif hedef · {completed} tamamlandı</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-md" onClick={() => setEditOpen({ isNew: true })}><Icon name="plus" size={16} />Yeni hedef</button>
        </div>
      </div>

      <div className="goal-overview">
        <div className="ao-card">
          <div className="ao-l">Toplam hedef</div>
          <div className="ao-v"><Money value={totalTarget} sign="neutral" hide={!showBalances} /></div>
          <div className="ao-s">{goals.length} hedef</div>
        </div>
        <div className="ao-card">
          <div className="ao-l">Biriken</div>
          <div className="ao-v pos"><Money value={totalSaved} sign="neutral" hide={!showBalances} /></div>
          <div className="ao-s">%{totalTarget ? Math.round(totalSaved / totalTarget * 100) : 0} tamamlandı</div>
        </div>
        <div className="ao-card">
          <div className="ao-l">Aylık gereken</div>
          <div className="ao-v"><Money value={totalMonthlyNeed} sign="neutral" hide={!showBalances} /></div>
          <div className="ao-s">Tüm hedefler için</div>
        </div>
      </div>

      <div className="goal-grid">
        {goals.map((g) => {
          const pct = g.target ? Math.min(100, g.saved / g.target * 100) : 0;
          const done = g.saved >= g.target;
          const m = monthsBetween(g.deadline);
          const remaining = Math.max(0, g.target - g.saved);
          const monthlyNeed = m > 0 ? remaining / m : remaining;
          const dl = new Date(g.deadline + "T00:00:00");
          const overdue = m < 0 && !done;
          return (
            <div key={g.id} className={`goal-card ${done ? "goal-card-done" : ""}`}>
              <div className="goal-card-h">
                <div className="goal-badge" style={{ background: `${g.color}22`, color: g.color }}>
                  <GoalIcon name={g.icon} size={20} />
                </div>
                <div className="goal-card-id">
                  <div className="goal-card-name">{g.name}</div>
                  <div className="goal-card-sub">
                    {g.priority && <span className="goal-pri" data-p={g.priority}>{g.priority}</span>}
                    <span className="goal-deadline">{done ? "Tamamlandı 🎉" : overdue ? "Süre doldu" : `${GOAL_MONTHS[dl.getMonth()]} ${dl.getFullYear()}`}</span>
                  </div>
                </div>
                <div className="goal-menu-host">
                  <button className="icon-btn" onClick={() => setEditOpen(g)}><Icon name="edit" size={14} /></button>
                  <button className="icon-btn" onClick={() => { if (confirm(`"${g.name}" hedefini silmek istiyor musun?`)) removeGoal(g.id); }}><Icon name="x" size={14} /></button>
                </div>
              </div>

              <div className="goal-prog-amts">
                <span className="goal-saved mono" style={{ color: g.color }}><Money value={g.saved} sign="neutral" hide={!showBalances} /></span>
                <span className="goal-target mono">/ <Money value={g.target} sign="neutral" hide={!showBalances} /></span>
              </div>
              <div className="goal-bar">
                <div className="goal-bar-fill" style={{ width: `${pct}%`, background: done ? "var(--pos)" : g.color }} />
              </div>
              <div className="goal-prog-meta">
                <span className="mono" style={{ color: done ? "var(--pos)" : g.color }}>%{pct.toFixed(0)}</span>
                {!done && <span>Kalan <span className="mono">₺{APP_DATA.fmt(remaining)}</span></span>}
              </div>

              {!done && (
                <div className="goal-need">
                  <div className="goal-need-row">
                    <span>Aylık gereken</span>
                    <strong className="mono">{m > 0 ? `₺${APP_DATA.fmt(monthlyNeed)}` : "Süre doldu"}</strong>
                  </div>
                  <div className="goal-need-row">
                    <span>Kalan süre</span>
                    <strong>{m > 0 ? `${m} ay` : m === 0 ? "Bu ay" : `${-m} ay gecikme`}</strong>
                  </div>
                </div>
              )}

              <button className="btn btn-primary btn-sm goal-contrib-btn" onClick={() => setContribFor(g)} disabled={done}>
                <Icon name="plus" size={14} />{done ? "Hedef tamamlandı" : "Para ekle"}
              </button>
            </div>
          );
        })}

        <button className="goal-card goal-card-add" onClick={() => setEditOpen({ isNew: true })}>
          <Icon name="plus" size={28} />
          <span>Yeni hedef ekle</span>
        </button>
      </div>

      <GoalModal editing={editOpen} onClose={() => setEditOpen(null)} onSave={(d) => {
        if (editOpen && !editOpen.isNew) updateGoal(editOpen.id, d); else addGoal(d);
        setEditOpen(null);
      }} />
      <ContributeModal goal={contribFor} accounts={accounts} onClose={() => setContribFor(null)} onContribute={(amount, acc) => { contributeGoal(contribFor.id, amount, acc); setContribFor(null); }} />
    </div>
  );
}

function GoalModal({ editing, onClose, onSave }) {
  const [name, setName] = useStateG("");
  const [target, setTarget] = useStateG("");
  const [saved, setSaved] = useStateG("");
  const [deadline, setDeadline] = useStateG("");
  const [color, setColor] = useStateG(GOAL_COLORS[0]);
  const [icon, setIcon] = useStateG("star");
  const [priority, setPriority] = useStateG("Orta");

  useEffectG(() => {
    if (editing && !editing.isNew) {
      setName(editing.name); setTarget(String(editing.target)); setSaved(String(editing.saved));
      setDeadline(editing.deadline); setColor(editing.color); setIcon(editing.icon); setPriority(editing.priority || "Orta");
    } else if (editing) {
      const t = appToday();
      setName(""); setTarget(""); setSaved("0");
      setDeadline(new Date(t.getFullYear() + 1, t.getMonth(), 1).toISOString().slice(0, 10));
      setColor(GOAL_COLORS[Math.floor(Math.random() * GOAL_COLORS.length)]);
      setIcon(GOAL_ICON_OPTIONS[Math.floor(Math.random() * GOAL_ICON_OPTIONS.length)]);
      setPriority("Orta");
    }
  }, [editing]);

  useEffectG(() => {
    if (!editing) return;
    const onEsc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [editing, onClose]);

  if (!editing) return null;
  const num = (v) => parseFloat(String(v).replace(/\s/g, "").replace(",", ".")) || 0;
  const canSubmit = name.trim() && num(target) > 0 && deadline;

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSave({ name: name.trim(), target: num(target), saved: num(saved), deadline, color, icon, priority });
  };

  return (
    <div className="modal-bd" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="modal-h">
          <div>
            <h2>{editing.isNew ? "Yeni hedef" : "Hedefi düzenle"}</h2>
            <p>Birikim hedefini tanımla</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </header>
        <div className="modal-b">
          <div className="goal-preview" style={{ borderColor: color }}>
            <div className="goal-badge" style={{ background: `${color}22`, color }}><GoalIcon name={icon} size={22} /></div>
            <div>
              <div className="goal-preview-n">{name || "Hedef adı"}</div>
              <div className="goal-preview-t">{target ? `₺${APP_DATA.fmt(num(target))}` : "Tutar belirle"}</div>
            </div>
          </div>

          <label className="field">
            <span className="field-l">Hedef adı</span>
            <input type="text" autoFocus placeholder="örn. Acil durum fonu, Tatil, Araba..." value={name} onChange={(e) => setName(e.target.value)} />
          </label>

          <div className="field-row">
            <label className="field">
              <span className="field-l">Hedef tutar</span>
              <div className="amount-input amount-input-sm"><span className="amount-curr">₺</span><input type="text" value={target} onChange={(e) => setTarget(e.target.value)} className="amount-val mono" placeholder="0" /></div>
            </label>
            <label className="field">
              <span className="field-l">Mevcut birikim</span>
              <div className="amount-input amount-input-sm"><span className="amount-curr">₺</span><input type="text" value={saved} onChange={(e) => setSaved(e.target.value)} className="amount-val mono" placeholder="0" /></div>
            </label>
          </div>

          <div className="field-row">
            <label className="field">
              <span className="field-l">Hedef tarihi</span>
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-l">Öncelik</span>
              <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option>Yüksek</option><option>Orta</option><option>Düşük</option>
              </select>
            </label>
          </div>

          <div className="field">
            <span className="field-l">Simge</span>
            <div className="goal-icon-picker">
              {GOAL_ICON_OPTIONS.map((ic) => (
                <button type="button" key={ic} className={`goal-icon-opt ${icon === ic ? "goal-icon-opt-act" : ""}`} onClick={() => setIcon(ic)} style={icon === ic ? { borderColor: color, color } : {}}>
                  <GoalIcon name={ic} size={18} />
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-l">Renk</span>
            <div className="color-swatches">
              {GOAL_COLORS.map((c) => (
                <button type="button" key={c} className={`color-swatch ${color === c ? "color-swatch-act" : ""}`} style={{ background: c }} onClick={() => setColor(c)} />
              ))}
            </div>
          </div>
        </div>
        <footer className="modal-f">
          <button type="button" className="btn btn-ghost btn-md" onClick={onClose}>İptal</button>
          <button type="submit" className="btn btn-primary btn-md" disabled={!canSubmit}>{editing.isNew ? "Hedef oluştur" : "Kaydet"}</button>
        </footer>
      </form>
    </div>
  );
}

function ContributeModal({ goal, accounts, onClose, onContribute }) {
  const cashAccounts = (accounts || []).filter((a) => !a.type.includes("Kart"));
  const [amount, setAmount] = useStateG("");
  const [fromAccount, setFromAccount] = useStateG("");

  useEffectG(() => {
    if (goal) { setAmount(""); setFromAccount(cashAccounts[0]?.id || ""); }
  }, [goal]);

  useEffectG(() => {
    if (!goal) return;
    const onEsc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [goal, onClose]);

  if (!goal) return null;
  const amt = parseFloat(String(amount).replace(",", ".")) || 0;
  const remaining = Math.max(0, goal.target - goal.saved);
  const fromAcc = (accounts || []).find((a) => a.id === fromAccount);
  const insufficient = fromAcc && amt > fromAcc.balance;
  const canSubmit = amt > 0 && !insufficient;

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onContribute(amt, fromAccount || null);
  };

  return (
    <div className="modal-bd" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="modal-h">
          <div>
            <h2>Para ekle</h2>
            <p>{goal.name} · kalan ₺{APP_DATA.fmt(remaining)}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </header>
        <div className="modal-b">
          <div className="amount-input">
            <span className="amount-curr">₺</span>
            <input type="text" autoFocus placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} className="amount-val mono" />
          </div>
          <div className="limit-presets">
            {[500, 1000, 2500, 5000].map((p) => (
              <button type="button" key={p} className="preset-chip" onClick={() => setAmount(String(p))}>₺{APP_DATA.fmtShort(p)}</button>
            ))}
            <button type="button" className="preset-chip" onClick={() => setAmount(String(Math.round(remaining)))}>Kalanı tamamla</button>
          </div>

          <div className="field">
            <span className="field-l">Hangi hesaptan? (opsiyonel)</span>
            <div className="acc-radio-list">
              <button type="button" className={`acc-radio ${fromAccount === "" ? "acc-radio-act" : ""}`} onClick={() => setFromAccount("")}>
                <span className="acc-radio-dot" style={{ background: "var(--fg-4)" }} />
                <div className="acc-radio-info"><div className="acc-radio-n">Hesaptan düşme</div><div className="acc-radio-t">Sadece hedefe ekle (kayıt amaçlı)</div></div>
              </button>
              {cashAccounts.map((a) => (
                <button type="button" key={a.id} className={`acc-radio ${fromAccount === a.id ? "acc-radio-act" : ""}`} onClick={() => setFromAccount(a.id)}>
                  <span className="acc-radio-dot" style={{ background: a.color }} />
                  <div className="acc-radio-info"><div className="acc-radio-n">{a.name}</div><div className="acc-radio-t">{a.type}</div></div>
                  <div className="acc-radio-bal mono">₺{APP_DATA.fmt(a.balance)}</div>
                </button>
              ))}
            </div>
          </div>
          {insufficient && <div className="transfer-warn neg">Yetersiz bakiye — {fromAcc.name}: ₺{APP_DATA.fmt(fromAcc.balance)}</div>}
        </div>
        <footer className="modal-f">
          <button type="button" className="btn btn-ghost btn-md" onClick={onClose}>İptal</button>
          <button type="submit" className="btn btn-primary btn-md" disabled={!canSubmit}>₺{APP_DATA.fmt(amt)} ekle</button>
        </footer>
      </form>
    </div>
  );
}

Object.assign(window, { GoalsView });
