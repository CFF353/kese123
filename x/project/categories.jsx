// Kategori Yöneticisi — ekle, düzenle, renk/isim değiştir, sil
// ─────────────────────────────────────────────────────────

const { useState: useStateCat, useEffect: useEffectCat } = React;

const CAT_COLORS = [
  "#22c55e", "#f59e0b", "#3b82f6", "#a855f7", "#06b6d4", "#ec4899",
  "#ef4444", "#10b981", "#f97316", "#8b5cf6", "#84cc16", "#14b8a6",
  "#0ea5e9", "#eab308", "#d946ef", "#64748b",
  "#16a34a", "#dc2626", "#2563eb", "#9333ea", "#0891b2", "#db2777",
  "#65a30d", "#ca8a04", "#7c3aed", "#0d9488", "#e11d48", "#475569",
  "#f43f5e", "#4f46e5", "#059669", "#c026d3",
];
const CAT_ICON_CHOICES = [
  "shopping-cart", "utensils", "car", "home", "file-text", "music",
  "heart", "book", "bag", "repeat", "wallet", "briefcase",
  "trending-up", "pie", "target", "card", "calendar", "more",
];

function CategoryManager({ open, ctx, onClose }) {
  const { categories, addCategory, updateCategory, removeCategory, transactions } = ctx;
  const [editing, setEditing] = useStateCat(null); // category being edited, or {isNew:true}

  useEffectCat(() => {
    if (!open) return;
    const onEsc = (e) => e.key === "Escape" && (editing ? setEditing(null) : onClose());
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose, editing]);

  if (!open) return null;

  const usageCount = (id) => transactions.filter((t) => t.category === id).length;
  const PROTECTED = new Set(["diger"]);
  const incomeCats = categories.filter((c) => ["maas", "freelance", "yatirim"].includes(c.id) || c.kind === "income");
  const expenseCats = categories.filter((c) => !(["maas", "freelance", "yatirim"].includes(c.id) || c.kind === "income"));

  const Section = ({ title, list }) => (
    <>
      <div className="catm-section">{title}</div>
      <div className="catm-list">
        {list.map((c) => {
          const used = usageCount(c.id);
          return (
            <div key={c.id} className="catm-row">
              <span className="catm-dot" style={{ background: c.color }} />
              <span className="catm-label">{c.label}</span>
              <span className="catm-use">{used > 0 ? `${used} işlem` : "kullanılmadı"}</span>
              <button className="catm-act" title="Düzenle" onClick={() => setEditing(c)}><Icon name="edit" size={14} /></button>
              <button
                className="catm-act catm-act-del"
                title={PROTECTED.has(c.id) ? "Bu kategori silinemez" : "Sil"}
                disabled={PROTECTED.has(c.id)}
                onClick={() => {
                  if (PROTECTED.has(c.id)) return;
                  const msg = used > 0
                    ? `"${c.label}" kategorisini silersen ${used} işlem "Diğer"e taşınacak. Devam edilsin mi?`
                    : `"${c.label}" kategorisini sil?`;
                  if (confirm(msg)) removeCategory(c.id, "diger");
                }}
              ><Icon name="trash" size={14} /></button>
            </div>
          );
        })}
      </div>
    </>
  );

  return (
    <div className="modal-bd" onClick={onClose}>
      <div className="modal catm-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-h">
          <div>
            <h2>Kategoriler</h2>
            <p>Kendi kategorilerini ekle, yeniden adlandır, rengini değiştir</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </header>
        <div className="modal-b">
          <button className="catm-add" onClick={() => setEditing({ isNew: true })}>
            <Icon name="plus" size={16} />Yeni kategori ekle
          </button>
          <Section title="Gider kategorileri" list={expenseCats} />
          <Section title="Gelir kategorileri" list={incomeCats} />
        </div>
        <footer className="modal-f">
          <button type="button" className="btn btn-primary btn-md" onClick={onClose}>Tamam</button>
        </footer>
      </div>

      <CategoryEditModal
        editing={editing}
        usedColors={categories.filter((c) => !editing || editing.isNew || c.id !== editing.id).map((c) => (c.color || "").toLowerCase())}
        onClose={() => setEditing(null)}
        onSave={(d) => {
          if (editing && !editing.isNew) updateCategory(editing.id, d); else addCategory(d);
          setEditing(null);
        }}
      />
    </div>
  );
}

function CategoryEditModal({ editing, usedColors = [], onClose, onSave }) {
  const [label, setLabel] = useStateCat("");
  const [color, setColor] = useStateCat(CAT_COLORS[0]);
  const [icon, setIcon] = useStateCat("more");
  const [kind, setKind] = useStateCat("expense");

  const used = new Set((usedColors || []).map((c) => (c || "").toLowerCase()));
  const available = CAT_COLORS.filter((c) => !used.has(c.toLowerCase()));

  useEffectCat(() => {
    if (editing && !editing.isNew) {
      setLabel(editing.label || ""); setColor(editing.color || CAT_COLORS[0]);
      setIcon(editing.icon || "more");
      setKind(["maas", "freelance", "yatirim"].includes(editing.id) || editing.kind === "income" ? "income" : "expense");
    } else if (editing) {
      const pool = CAT_COLORS.filter((c) => !used.has(c.toLowerCase()));
      setLabel(""); setColor((pool.length ? pool : CAT_COLORS)[Math.floor(Math.random() * (pool.length ? pool.length : CAT_COLORS.length))]);
      setIcon(CAT_ICON_CHOICES[Math.floor(Math.random() * CAT_ICON_CHOICES.length)]);
      setKind("expense");
    }
  }, [editing]);

  if (!editing) return null;
  const canSubmit = label.trim().length > 0;
  const submit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSave({ label: label.trim(), color, icon, kind });
  };

  return (
    <div className="modal-bd catm-edit-bd" onClick={onClose}>
      <form className="modal catm-edit" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="modal-h">
          <div>
            <h2>{editing.isNew ? "Yeni kategori" : "Kategoriyi düzenle"}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </header>
        <div className="modal-b">
          <div className="catm-preview">
            <span className="cat-pill" style={{ background: `${color}1f`, color }}>
              <span className="cat-dot" style={{ background: color }} />
              {label || "Kategori adı"}
            </span>
          </div>

          <label className="field">
            <span className="field-l">Kategori adı</span>
            <input type="text" autoFocus placeholder="örn. Spor, Evcil hayvan, Bağış..." value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>

          <div className="field">
            <span className="field-l">Tür</span>
            <div className="seg seg-lg">
              <button type="button" className={kind === "expense" ? "seg-act" : ""} onClick={() => setKind("expense")}>Gider</button>
              <button type="button" className={kind === "income" ? "seg-act" : ""} onClick={() => setKind("income")}>Gelir</button>
            </div>
          </div>

          <div className="field">
            <span className="field-l">Renk <span className="catm-color-hint">· kullanılmayan renkler</span></span>
            <div className="catm-colors">
              {available.map((c) => (
                <button type="button" key={c} className={`catm-color ${color === c ? "catm-color-act" : ""}`} style={{ background: c }} onClick={() => setColor(c)} />
              ))}
              {available.length === 0 && <span className="catm-color-none">Tüm renkler kullanımda — mevcut renklerden biri otomatik seçildi.</span>}
            </div>
          </div>
        </div>
        <footer className="modal-f">
          <button type="button" className="btn btn-ghost btn-md" onClick={onClose}>İptal</button>
          <button type="submit" className="btn btn-primary btn-md" disabled={!canSubmit}>{editing.isNew ? "Ekle" : "Kaydet"}</button>
        </footer>
      </form>
    </div>
  );
}

Object.assign(window, { CategoryManager });
