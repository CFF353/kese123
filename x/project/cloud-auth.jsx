// Kese — Hesap / üyelik arayüzü (Firebase auth üstüne)
// CloudAccountRow: Ayarlar modalında hesap durumu satırı
// CloudAuthModal: giriş / kayıt penceresi
// ─────────────────────────────────────────────────────────

const { useState: useStateCl, useEffect: useEffectCl } = React;

function useCloud() {
  const [, force] = useStateCl(0);
  useEffectCl(() => window.keseCloud ? window.keseCloud.subscribe(() => force((x) => x + 1)) : undefined, []);
  return window.keseCloud || { enabled: false };
}

function CloudAccountRow({ onOpenAuth }) {
  const cloud = useCloud();

  if (!cloud.enabled) {
    return (
      <div className="set-row" style={{ cursor: "default", opacity: 0.75 }}>
        <div className="set-row-icon"><Icon name="wallet" size={16} /></div>
        <div className="set-row-b">
          <div className="set-row-t">Bulut hesabı (kapalı)</div>
          <div className="set-row-d">Firebase yapılandırılmamış — veriler yalnızca bu cihazda. Kurulum: firebase-sync.js dosyasındaki adımlar.</div>
        </div>
      </div>
    );
  }

  if (cloud.user) {
    return (
      <>
        <div className="set-row" style={{ cursor: "default" }}>
          <div className="set-row-icon" style={{ background: "rgba(34,197,94,0.14)", color: "var(--pos)" }}><Icon name="check" size={16} /></div>
          <div className="set-row-b">
            <div className="set-row-t">{cloud.user.email}</div>
            <div className="set-row-d">
              {cloud.syncing ? "Eşitleniyor…" : cloud.error ? cloud.error : cloud.lastSync ? `Son eşitleme: ${cloud.lastSync.toLocaleTimeString("tr-TR")}` : "Bulut senkronizasyonu açık"}
            </div>
          </div>
        </div>
        <div className="set-row" onClick={() => { if (confirm("Çıkış yapılsın mı? Verilerin bulutta saklı kalır, bu cihazda da durur.")) window.keseCloud.signOut(); }}>
          <div className="set-row-icon"><Icon name="x" size={16} /></div>
          <div className="set-row-b">
            <div className="set-row-t">Çıkış yap</div>
            <div className="set-row-d">Oturumu kapat — veriler son kez eşitlenir</div>
          </div>
          <Icon name="chevronRight" size={16} />
        </div>
      </>
    );
  }

  return (
    <div className="set-row" onClick={onOpenAuth}>
      <div className="set-row-icon" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><Icon name="sparkles" size={16} /></div>
      <div className="set-row-b">
        <div className="set-row-t">Giriş yap / Üye ol</div>
        <div className="set-row-d">Verilerini buluta yedekle, tüm cihazlarından eriş</div>
      </div>
      <Icon name="chevronRight" size={16} />
    </div>
  );
}

function CloudAuthModal({ open, onClose }) {
  const cloud = useCloud();
  const [mode, setMode] = useStateCl("signin"); // signin | signup | reset
  const [email, setEmail] = useStateCl("");
  const [pass, setPass] = useStateCl("");
  const [pass2, setPass2] = useStateCl("");
  const [busy, setBusy] = useStateCl(false);
  const [err, setErr] = useStateCl("");
  const [info, setInfo] = useStateCl("");

  useEffectCl(() => {
    if (open) { setMode("signin"); setErr(""); setInfo(""); setPass(""); setPass2(""); setBusy(false); }
  }, [open]);

  useEffectCl(() => {
    if (!open) return;
    const onEsc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  // Giriş başarılı olunca kapan
  useEffectCl(() => { if (open && cloud.user) onClose(); }, [open, cloud.user]);

  if (!open) return null;
  const emailOk = /\S+@\S+\.\S+/.test(email);
  const notConnected = !cloud.ready;
  const canSubmit = !busy && !notConnected && emailOk && (mode === "reset" || pass.length >= 6) && (mode !== "signup" || pass === pass2);

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true); setErr(""); setInfo("");
    try {
      if (mode === "signup") await window.keseCloud.signUp(email.trim(), pass);
      else if (mode === "signin") await window.keseCloud.signIn(email.trim(), pass);
      else { await window.keseCloud.resetPassword(email.trim()); setInfo("Şifre sıfırlama bağlantısı e-postana gönderildi."); }
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-bd" onClick={onClose}>
      <form className="modal cl-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <header className="modal-h">
          <div>
            <h2>{mode === "signup" ? "Üye ol" : mode === "reset" ? "Şifre sıfırla" : "Giriş yap"}</h2>
            <p>{mode === "signup" ? "Verilerin buluta güvenle yedeklenir" : mode === "reset" ? "Kayıtlı e-postanı gir" : "Kese hesabınla devam et"}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}><Icon name="x" size={18} /></button>
        </header>
        <div className="modal-b">
          <label className="field">
            <span className="field-l">E-posta</span>
            <input type="email" autoFocus placeholder="ornek@eposta.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          {mode !== "reset" && (
            <label className="field">
              <span className="field-l">Şifre</span>
              <input type="password" placeholder="En az 6 karakter" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
            </label>
          )}
          {mode === "signup" && (
            <label className="field">
              <span className="field-l">Şifre (tekrar)</span>
              <input type="password" placeholder="Şifreni doğrula" value={pass2} onChange={(e) => setPass2(e.target.value)} autoComplete="new-password" />
              {pass2 && pass !== pass2 && <span className="cl-mismatch">Şifreler eşleşmiyor</span>}
            </label>
          )}
          {err && <div className="ai-error"><Icon name="info" size={14} />{err}</div>}
          {!err && notConnected && !cloud.error && <div className="cl-info"><Icon name="info" size={14} />Buluta bağlanıyor…</div>}
          {!err && cloud.error && notConnected && <div className="ai-error"><Icon name="info" size={14} />{cloud.error}</div>}
          {info && <div className="cl-info"><Icon name="check" size={14} />{info}</div>}
          <div className="cl-links">
            {mode !== "signin" && <button type="button" className="cl-link" onClick={() => { setMode("signin"); setErr(""); setInfo(""); }}>Giriş yap</button>}
            {mode !== "signup" && <button type="button" className="cl-link" onClick={() => { setMode("signup"); setErr(""); setInfo(""); }}>Üye ol</button>}
            {mode !== "reset" && <button type="button" className="cl-link" onClick={() => { setMode("reset"); setErr(""); setInfo(""); }}>Şifremi unuttum</button>}
          </div>
        </div>
        <footer className="modal-f">
          <button type="button" className="btn btn-ghost btn-md" onClick={onClose}>İptal</button>
          <button type="submit" className="btn btn-primary btn-md" disabled={!canSubmit}>
            {busy ? <span className="ai-spin" /> : mode === "signup" ? "Üye ol" : mode === "reset" ? "Bağlantı gönder" : "Giriş yap"}
          </button>
        </footer>
      </form>
    </div>
  );
}

Object.assign(window, { CloudAccountRow, CloudAuthModal, useCloud });
