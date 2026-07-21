// Toplu Giriş — haftalık/geç kalınmış veri girişi için tek ekranda çoklu işlem
// Her satır serbest metin: "market 250 tl" — hepsi ayrıştırılıp önizlenir, tek dokunuşla kaydedilir
// ─────────────────────────────────────────────────────────

const { useState: useStateBA, useEffect: useEffectBA, useMemo: useMemoBA } = React;

function BulkAddModal({ open, onClose, onSubmitBulk, accounts = [] }) {
  const [raw, setRaw] = useStateBA("");
  const [account, setAccount] = useStateBA("");
  const [date, setDate] = useStateBA("");
  const [rowOverrides, setRowOverrides] = useStateBA({}); // index -> { category, type }

  useEffectBA(() => {
    if (!open) return;
    if (!account || !accounts.some((a) => a.id === account)) setAccount(accounts[0]?.id || "");
    if (!date) setDate(appToday().toISOString().slice(0, 10));
    const onEsc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose, accounts]);

  useEffectBA(() => { if (!open) { setRaw(""); setRowOverrides({}); setDate(""); } }, [open]);

  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);

  const rows = useMemoBA(() => {
    return lines.map((line, i) => {
      const parsed = window.parseQuickEntry(line, APP_DATA.categories);
      const ov = rowOverrides[i] || {};
      return parsed ? { ...parsed, ...ov, line } : null;
    });
  }, [raw, rowOverrides]);

  if (!open) return null;

  const validRows = rows.filter((r) => r && r.amount > 0);
  const invalidCount = rows.length - validRows.length;

  const setOverride = (i, patch) => {
    setRowOverrides((prev) => ({ ...prev, [i]: { ...prev[i], ...patch } }));
  };

  const submit = () => {
    if (!account || validRows.length === 0) return;
    const isoDate = date ? new Date(date + "T12:00:00").toISOString() : appToday().toISOString();
    const txs = validRows.map((r) => ({
      name: r.name,
      amount: r.type === "expense" ? -Math.abs(r.amount) : Math.abs(r.amount),
      category: r.category,
      account,
      note: "",
      date: isoDate,
    }));
    onSubmitBulk(txs);
    setRaw(""); setRowOverrides({});
    onClose();
  };

  return (
    <div className="modal-bd" onClick={onClose}>
      <div className="modal bulk-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-h">
          <div>
            <h2>Toplu giriş</h2>
            <p>Bir haftalık işlemi tek seferde gir — her satır bir işlem</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </header>

        <div className="modal-b bulk-modal-b">
          <label className="field">
            <span className="field-l">Hesap</span>
            <select value={account} onChange={(e) => setAccount(e.target.value)}>
              {accounts.length === 0 && <option value="">Hesap yok</option>}
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>

          <label className="field">
            <span className="field-l">Tarih</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          <label className="field">
            <span className="field-l">İşlemler (her satıra bir tane)</span>
            <textarea
              rows="6"
              className="bulk-textarea"
              autoFocus
              placeholder={"market 250 tl\nkira 8500\nyemeksepeti 180\nmaaş 45000"}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
            />
          </label>

          {lines.length > 0 && (
            <div className="bulk-preview">
              <div className="bulk-preview-h">
                <span>{validRows.length} işlem ayrıştırıldı</span>
                {invalidCount > 0 && <span className="bulk-preview-warn">{invalidCount} satırda tutar bulunamadı</span>}
              </div>
              <div className="bulk-rows">
                {rows.map((r, i) => {
                  if (!r) {
                    return (
                      <div key={i} className="bulk-row bulk-row-bad">
                        <Icon name="x" size={14} />
                        <span className="bulk-row-line">{lines[i]}</span>
                        <span className="bulk-row-note">tutar yok, atlanacak</span>
                      </div>
                    );
                  }
                  const cat = APP_DATA.categories.find((c) => c.id === r.category);
                  return (
                    <div key={i} className="bulk-row">
                      <span className="bulk-row-dot" style={{ background: cat?.color || "#64748b" }} />
                      <input
                        className="bulk-row-name"
                        value={r.name}
                        onChange={(e) => setOverride(i, { name: e.target.value })}
                      />
                      <select
                        className="bulk-row-cat"
                        value={r.category}
                        onChange={(e) => setOverride(i, { category: e.target.value })}
                      >
                        {APP_DATA.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                      <button
                        type="button"
                        className={`bulk-row-type ${r.type === "income" ? "bulk-row-type-inc" : ""}`}
                        title="Gelir/gider değiştir"
                        onClick={() => setOverride(i, { type: r.type === "income" ? "expense" : "income" })}
                      >
                        <Icon name={r.type === "income" ? "arrowDown" : "arrowUp"} size={12} />
                      </button>
                      <span className={`mono bulk-row-amt ${r.type === "income" ? "pos" : "neg"}`}>
                        {r.type === "income" ? "+" : "−"}₺{APP_DATA.fmt(r.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <footer className="modal-f">
          <button type="button" className="btn btn-ghost btn-md" onClick={onClose}>İptal</button>
          <button type="button" className="btn btn-primary btn-md" disabled={validRows.length === 0 || !account} onClick={submit}>
            {validRows.length > 0 ? `${validRows.length} işlemi kaydet` : "İşlemi kaydet"}
          </button>
        </footer>
      </div>
    </div>
  );
}

Object.assign(window, { BulkAddModal });
