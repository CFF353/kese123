// Notlar — hareketler ve genel finans hakkında serbest notlar
// ─────────────────────────────────────────────────────────

const { useState: useStateN, useEffect: useEffectN, useMemo: useMemoN } = React;

const NOTE_COLORS = [
  { id: "yellow", bg: "#fbbf2422", bar: "#fbbf24" },
  { id: "blue",   bg: "#0ea5e922", bar: "#0ea5e9" },
  { id: "green",  bg: "#22c55e22", bar: "#22c55e" },
  { id: "purple", bg: "#a855f722", bar: "#a855f7" },
  { id: "pink",   bg: "#ec489922", bar: "#ec4899" },
  { id: "gray",   bg: "#64748b22", bar: "#64748b" },
];
const noteColor = (id) => NOTE_COLORS.find((c) => c.id === id) || NOTE_COLORS[0];

const NOTE_TR_MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
function noteDateLabel(iso) {
  const d = new Date(iso);
  return `${d.getDate()} ${NOTE_TR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function NotesView({ ctx }) {
  const { notes, transactions, accounts, addNote, updateNote, removeNote } = ctx;
  const [editOpen, setEditOpen] = useStateN(null);
  const [q, setQ] = useStateN("");

  const filtered = useMemoN(() => {
    const list = notes.filter((n) => {
      if (!q) return true;
      const hay = (n.title + " " + (n.body || "")).toLowerCase();
      return hay.includes(q.toLowerCase());
    });
    return [...list].sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
    });
  }, [notes, q]);

  const linkedTx = (id) => transactions.find((t) => t.id === id);

  if (notes.length === 0) {
    return (
      <div className="view view-notes">
        <div className="page-head">
          <div>
            <h1 className="page-title">Notlar</h1>
            <p className="page-sub">Hareketler ve finansal kararların hakkında not al</p>
          </div>
        </div>
        <div className="empty-big">
          <div className="empty-big-icon"><Icon name="note" size={28} /></div>
          <div className="empty-big-t">Henüz not yok</div>
          <p className="empty-big-d">Bir harcamanın nedenini, bir kararı, bir hatırlatmayı veya finansal bir gözlemini buraya yaz. İstersen notu belirli bir işleme bağlayabilirsin.</p>
          <button className="btn btn-primary btn-md" onClick={() => setEditOpen({ isNew: true })}><Icon name="plus" size={16} />İlk notunu ekle</button>
        </div>
        <NoteModal editing={editOpen} transactions={transactions} accounts={accounts} onClose={() => setEditOpen(null)} onSave={(d) => { addNote(d); setEditOpen(null); }} />
      </div>
    );
  }

  const pinnedCount = notes.filter((n) => n.pinned).length;

  return (
    <div className="view view-notes">
      <div className="page-head">
        <div>
          <h1 className="page-title">Notlar</h1>
          <p className="page-sub">{notes.length} not{pinnedCount > 0 ? ` · ${pinnedCount} sabitli` : ""}</p>
        </div>
        <div className="page-actions">
          <div className="search-input notes-search">
            <Icon name="search" size={16} />
            <input type="text" placeholder="Notlarda ara..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="btn btn-primary btn-md" onClick={() => setEditOpen({ isNew: true })}><Icon name="plus" size={16} />Yeni not</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state"><Icon name="search" size={28} /><p>"{q}" ile eşleşen not yok.</p></div>
      ) : (
        <div className="notes-grid">
          {filtered.map((n) => {
            const c = noteColor(n.color);
            const tx = n.txId ? linkedTx(n.txId) : null;
            return (
              <div key={n.id} className="note-card" style={{ background: c.bg, borderTopColor: c.bar }} onClick={() => setEditOpen(n)}>
                <div className="note-card-h">
                  <div className="note-card-title">{n.title || "Başlıksız not"}</div>
                  <button className={`note-pin ${n.pinned ? "note-pin-on" : ""}`} title={n.pinned ? "Sabitlemeyi kaldır" : "Sabitle"} onClick={(e) => { e.stopPropagation(); updateNote(n.id, { pinned: !n.pinned }); }}>
                    <Icon name="pin" size={14} />
                  </button>
                </div>
                {n.body && <div className="note-card-body">{n.body}</div>}
                {tx && (
                  <div className="note-tx-chip">
                    <Icon name="list" size={12} />
                    <span className="note-tx-name">{tx.name}</span>
                    <span className={`note-tx-amt mono ${tx.amount < 0 ? "neg" : "pos"}`}>{tx.amount < 0 ? "−" : "+"}₺{APP_DATA.fmt(Math.abs(tx.amount))}</span>
                  </div>
                )}
                <div className="note-card-f">
                  <span className="note-date">{noteDateLabel(n.updatedAt || n.createdAt)}</span>
                  <button className="note-del" title="Sil" onClick={(e) => { e.stopPropagation(); if (confirm("Bu notu silmek istiyor musun?")) removeNote(n.id); }}><Icon name="trash" size={13} /></button>
                </div>
              </div>
            );
          })}
          <button className="note-card note-card-add" onClick={() => setEditOpen({ isNew: true })}>
            <Icon name="plus" size={26} />
            <span>Yeni not ekle</span>
          </button>
        </div>
      )}

      <NoteModal
        editing={editOpen}
        transactions={transactions}
        accounts={accounts}
        onClose={() => setEditOpen(null)}
        onDelete={(id) => { if (confirm("Bu notu silmek istiyor musun?")) { removeNote(id); setEditOpen(null); } }}
        onSave={(d) => {
          if (editOpen && !editOpen.isNew) updateNote(editOpen.id, d); else addNote(d);
          setEditOpen(null);
        }}
      />
    </div>
  );
}

function NoteModal({ editing, transactions, accounts, onClose, onSave, onDelete }) {
  const [title, setTitle] = useStateN("");
  const [body, setBody] = useStateN("");
  const [color, setColor] = useStateN("yellow");
  const [txId, setTxId] = useStateN("");
  const [txPickerOpen, setTxPickerOpen] = useStateN(false);
  const [txQuery, setTxQuery] = useStateN("");

  useEffectN(() => {
    if (editing && !editing.isNew) {
      setTitle(editing.title || ""); setBody(editing.body || "");
      setColor(editing.color || "yellow"); setTxId(editing.txId || "");
    } else if (editing) {
      setTitle(""); setBody(""); setColor("yellow"); setTxId("");
    }
    setTxPickerOpen(false); setTxQuery("");
  }, [editing]);

  useEffectN(() => {
    if (!editing) return;
    const onEsc = (e) => e.key === "Escape" && (txPickerOpen ? setTxPickerOpen(false) : onClose());
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [editing, onClose, txPickerOpen]);

  if (!editing) return null;
  const canSubmit = title.trim() || body.trim();
  const linkedTx = txId ? transactions.find((t) => t.id === txId) : null;

  const recentTx = transactions.slice(0, 200).filter((t) => {
    if (!txQuery) return true;
    return t.name.toLowerCase().includes(txQuery.toLowerCase());
  }).slice(0, 40);

  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSave({ title: title.trim(), body: body.trim(), color, txId: txId || null });
  };

  return (
    <div className="modal-bd" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="modal-h">
          <div>
            <h2>{editing.isNew ? "Yeni not" : "Notu düzenle"}</h2>
            <p>Bir hareket veya finansal karar hakkında not</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </header>
        <div className="modal-b">
          <label className="field">
            <span className="field-l">Başlık</span>
            <input type="text" autoFocus placeholder="örn. Neden bu kadar harcadım?" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>

          <label className="field">
            <span className="field-l">Not</span>
            <textarea rows="5" placeholder="Düşüncelerini buraya yaz..." value={body} onChange={(e) => setBody(e.target.value)} />
          </label>

          <div className="field">
            <span className="field-l">Renk</span>
            <div className="note-color-picker">
              {NOTE_COLORS.map((c) => (
                <button type="button" key={c.id} className={`note-color-opt ${color === c.id ? "note-color-opt-act" : ""}`} style={{ background: c.bar }} onClick={() => setColor(c.id)} />
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-l">İşleme bağla (opsiyonel)</span>
            {linkedTx ? (
              <div className="note-linked">
                <div className="note-linked-info">
                  <div className="note-linked-n">{linkedTx.name}</div>
                  <div className="note-linked-m">{noteDateLabel(linkedTx.date)} · <span className={linkedTx.amount < 0 ? "neg" : "pos"}>{linkedTx.amount < 0 ? "−" : "+"}₺{APP_DATA.fmt(Math.abs(linkedTx.amount))}</span></div>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTxId("")}>Kaldır</button>
              </div>
            ) : (
              <button type="button" className="note-link-btn" onClick={() => setTxPickerOpen((v) => !v)}>
                <Icon name="list" size={15} />Bir işlem seç
              </button>
            )}
            {txPickerOpen && !linkedTx && (
              <div className="note-tx-picker">
                <div className="search-input note-tx-search">
                  <Icon name="search" size={14} />
                  <input type="text" autoFocus placeholder="İşlem ara..." value={txQuery} onChange={(e) => setTxQuery(e.target.value)} />
                </div>
                <div className="note-tx-list">
                  {recentTx.length === 0 && <div className="note-tx-empty">İşlem bulunamadı</div>}
                  {recentTx.map((t) => {
                    const acc = accounts.find((a) => a.id === t.account);
                    return (
                      <button type="button" key={t.id} className="note-tx-opt" onClick={() => { setTxId(t.id); setTxPickerOpen(false); }}>
                        <div className="note-tx-opt-l">
                          <div className="note-tx-opt-n">{t.name}</div>
                          <div className="note-tx-opt-m">{noteDateLabel(t.date)} · {acc?.name || "—"}</div>
                        </div>
                        <span className={`mono ${t.amount < 0 ? "neg" : "pos"}`}>{t.amount < 0 ? "−" : "+"}₺{APP_DATA.fmt(Math.abs(t.amount))}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
        <footer className="modal-f modal-f-split">
          {editing.isNew ? <span /> : <button type="button" className="btn btn-ghost btn-md pf-del" onClick={() => onDelete(editing.id)}><Icon name="trash" size={15} />Sil</button>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-ghost btn-md" onClick={onClose}>İptal</button>
            <button type="submit" className="btn btn-primary btn-md" disabled={!canSubmit}>{editing.isNew ? "Not ekle" : "Kaydet"}</button>
          </div>
        </footer>
      </form>
    </div>
  );
}

Object.assign(window, { NotesView });
