// Kese — Firebase kimlik doğrulama + bulut senkronizasyonu
// ─────────────────────────────────────────────────────────
// KURULUM (bir kere):
// 1. console.firebase.google.com → yeni proje oluştur (ör. "kese-app")
// 2. Authentication → Sign-in method → "Email/Password" etkinleştir
// 3. Firestore Database → veritabanı oluştur (production mode) → Rules:
//      rules_version = '2';
//      service cloud.firestore {
//        match /databases/{database}/documents {
//          match /users/{uid} {
//            allow read, write: if request.auth != null && request.auth.uid == uid;
//          }
//        }
//      }
// 4. Project settings → genel → "Web app" ekle → çıkan firebaseConfig objesini
//    aşağıdaki KESE_FIREBASE_CONFIG içine yapıştır.
// Config boş bırakılırsa uygulama tamamen yerel (localStorage) çalışır.

window.KESE_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAN6fYkVLz2AZ5k4P2LInzbNTo7ZqiOKJ4",
  authDomain: "kese-f9af8.firebaseapp.com",
  projectId: "kese-f9af8",
  storageBucket: "kese-f9af8.firebasestorage.app",
  messagingSenderId: "817352388024",
  appId: "1:817352388024:web:96f53e2d263fd86b8db34d"
};

(function () {
  const cfg = window.KESE_FIREBASE_CONFIG || {};
  const enabled = !!cfg.apiKey && !!cfg.projectId;

  const state = {
    enabled,
    ready: false,
    user: null,          // { uid, email }
    syncing: false,
    lastSync: null,
    error: null,
    listeners: new Set(),
  };
  const emit = () => state.listeners.forEach((fn) => { try { fn(); } catch (e) {} });

  window.keseCloud = {
    get enabled() { return state.enabled; },
    get ready() { return state.ready; },
    get user() { return state.user; },
    get syncing() { return state.syncing; },
    get lastSync() { return state.lastSync; },
    get error() { return state.error; },
    subscribe(fn) { state.listeners.add(fn); return () => state.listeners.delete(fn); },
    signUp: notReady, signIn: notReady, signOut: notReady, resetPassword: notReady,
    pushNow: notReady,
  };
  function notReady() { return Promise.reject(new Error(state.enabled ? "Firebase yükleniyor…" : "Firebase yapılandırılmamış")); }

  if (!enabled) return; // yerel mod

  // Firebase compat SDK'larını dinamik yükle
  const load = (src) => new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src; s.onload = res; s.onerror = () => rej(new Error("SDK yüklenemedi: " + src));
    document.head.appendChild(s);
  });

  const V = "10.14.1";
  Promise.resolve()
    .then(() => load(`https://www.gstatic.com/firebasejs/${V}/firebase-app-compat.js`))
    .then(() => load(`https://www.gstatic.com/firebasejs/${V}/firebase-auth-compat.js`))
    .then(() => load(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore-compat.js`))
    .then(init)
    .catch((e) => { state.error = e.message; state.ready = true; emit(); });

  // SDK 10 sn içinde hiç yüklenmezse (ağ engeli, reklam engelleyici, CSP vb.) sonsuz "yükleniyor" yerine gerçek hata göster
  setTimeout(() => {
    if (!state.ready) {
      state.error = "Firebase sunucularına bağlanılamadı (ağ engeli veya reklam engelleyici olabilir). Sayfayı yenileyip tekrar deneyin.";
      state.ready = true;
      emit();
    }
  }, 10000);

  function init() {
    const app = firebase.initializeApp(cfg);
    const auth = firebase.auth();
    const db = firebase.firestore();
    const STORAGE_KEY = "kese_finans_v1";

    let lastPushed = "";
    let pullApplied = false;

    const docRef = (uid) => db.collection("users").doc(uid);

    // Şema güncellemeleri (yeni-boş koleksiyon anahtarları) gerçek veri farkı değildir —
    // yoksa uygulama her yeni alan eklendiğinde açılışta sahte "çakışma" sorusu sorar.
    function normalizedStore(raw) {
      try {
        const o = JSON.parse(raw);
        const out = {};
        Object.keys(o).sort().forEach((k) => {
          const v = o[k];
          if (Array.isArray(v) && v.length === 0) return;
          out[k] = v;
        });
        return JSON.stringify(out);
      } catch (e) { return raw; }
    }

    async function pull(uid) {
      const snap = await docRef(uid).get();
      if (!snap.exists) return false;
      const remote = snap.data();
      if (!remote || !remote.store) return false;
      const localRaw = localStorage.getItem(STORAGE_KEY) || "";
      if (remote.store === localRaw) { lastPushed = localRaw; return false; }
      if (normalizedStore(remote.store) === normalizedStore(localRaw)) { lastPushed = localRaw; return false; }
      const localAt = parseInt(localStorage.getItem("kese_local_updated") || "0", 10);
      const remoteAt = remote.updatedAt || 0;
      let useRemote = true;
      if (localRaw && localAt > remoteAt) {
        useRemote = confirm("Bu cihazdaki veriler buluttakinden daha yeni görünüyor.\n\nTamam = buluttakini kullan (bu cihazdakini değiştirir)\nİptal = bu cihazdakini bulutla eşitle");
      }
      if (useRemote) {
        localStorage.setItem(STORAGE_KEY, remote.store);
        lastPushed = remote.store;
        return true; // reload gerekli
      }
      return false;
    }

    async function push(uid) {
      const raw = localStorage.getItem(STORAGE_KEY) || "";
      if (!raw || raw === lastPushed) return;
      state.syncing = true; emit();
      try {
        await docRef(uid).set({ store: raw, updatedAt: Date.now(), email: state.user?.email || "" });
        lastPushed = raw;
        state.lastSync = new Date();
        state.error = null;
      } catch (e) {
        state.error = "Senkron hatası: " + (e.message || e.code);
      } finally {
        state.syncing = false; emit();
      }
    }

    // localStorage güncelleme zamanını damgala (çakışma çözümü için)
    const origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (k, v) {
      origSetItem(k, v);
      if (k === STORAGE_KEY) { try { origSetItem("kese_local_updated", String(Date.now())); } catch (e) {} }
    };

    auth.onAuthStateChanged(async (u) => {
      state.user = u ? { uid: u.uid, email: u.email } : null;
      state.ready = true;
      emit();
      if (u && !pullApplied) {
        pullApplied = true;
        try {
          const needReload = await pull(u.uid);
          if (needReload) { location.reload(); return; }
          await push(u.uid); // bulutta hiç veri yoksa ilk yükleme
        } catch (e) { state.error = "Bulut verisi alınamadı: " + (e.message || e.code); emit(); }
      }
    });

    // Periyodik senkron (6 sn'de bir, değişiklik varsa)
    setInterval(() => { if (state.user && !state.syncing) push(state.user.uid); }, 6000);
    // Sayfa kapanırken son push (best effort)
    window.addEventListener("beforeunload", () => { if (state.user) { try { push(state.user.uid); } catch (e) {} } });

    const trErr = (e) => {
      const c = e.code || "";
      if (c.includes("email-already-in-use")) return "Bu e-posta zaten kayıtlı.";
      if (c.includes("invalid-email")) return "Geçersiz e-posta adresi.";
      if (c.includes("weak-password")) return "Şifre çok zayıf (en az 6 karakter).";
      if (c.includes("user-not-found") || c.includes("invalid-credential") || c.includes("wrong-password")) return "E-posta veya şifre hatalı.";
      if (c.includes("too-many-requests")) return "Çok fazla deneme — biraz bekle.";
      if (c.includes("network")) return "Ağ hatası — bağlantını kontrol et.";
      return e.message || "Bir hata oluştu.";
    };

    window.keseCloud.signUp = async (email, pass) => {
      try { await auth.createUserWithEmailAndPassword(email, pass); }
      catch (e) { throw new Error(trErr(e)); }
    };
    window.keseCloud.signIn = async (email, pass) => {
      try { pullApplied = false; await auth.signInWithEmailAndPassword(email, pass); }
      catch (e) { throw new Error(trErr(e)); }
    };
    window.keseCloud.signOut = async () => {
      if (state.user) { try { await push(state.user.uid); } catch (e) {} }
      await auth.signOut();
      pullApplied = false;
    };
    window.keseCloud.resetPassword = async (email) => {
      try { await auth.sendPasswordResetEmail(email); }
      catch (e) { throw new Error(trErr(e)); }
    };
    window.keseCloud.pushNow = async () => { if (state.user) await push(state.user.uid); };
  }
})();
