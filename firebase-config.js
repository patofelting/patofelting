// firebase-config.js
(() => {
  // Evita inicializar dos veces si se incluye por error más de una vez
  if (window.__pfFirebaseInit) return;
  window.__pfFirebaseInit = true;

  // Requiere los SDKs compat cargados antes en el HTML:
  // firebase-app-compat.js, firebase-auth-compat.js, firebase-database-compat.js
  if (typeof firebase === 'undefined') {
    console.error('[Patofelting] Firebase SDK compat no encontrado. Cargá los 3 scripts compat antes de firebase-config.js');
    return;
  }

  // --- Config de TU proyecto ---
  const cfg = {
    apiKey: "AIzaSyD261TL6XuBp12rUNCcMKyP7_nMaCVYc7Y",
    authDomain: "patofelting-b188f.firebaseapp.com",
    databaseURL: "https://patofelting-b188f-default-rtdb.firebaseio.com",
    projectId: "patofelting-b188f",
    storageBucket: "patofelting-b188f.appspot.com",
    messagingSenderId: "858377467588",
    appId: "1:858377467588:web:cade9de05ebccc17f87b91"
  };

  // Por si lo necesitás en otros lugares
  window.firebaseConfig = cfg;

  // --- Inicializa app una sola vez ---
  try {
    if (!firebase.apps || firebase.apps.length === 0) {
      firebase.initializeApp(cfg);
    }
  } catch (e) {
    // Si otro script ya inicializó, ignoramos el error "already exists"
    if (!/already exists/i.test(String(e))) {
      console.error('[Patofelting] Error al inicializar Firebase:', e);
      return;
    }
  }

  // Objetos compat usados por blog.js
  const auth = firebase.auth();
  const db   = firebase.database();

  window.firebaseCompatAuth = auth;
  window.firebaseCompatDb   = db;

  // --- Sign-in anónimo (necesario por las reglas con auth != null) ---
  // Asegurate de habilitar Anonymous en: Console → Authentication → Sign-in method
  function ensureAnonymousAuth() {
    return new Promise((resolve) => {
      const unsub = auth.onAuthStateChanged((user) => {
        if (user) {
          console.log('[Patofelting] Auth anónima OK. UID:', user.uid);
          unsub();
          resolve(user);
        } else {
          auth.signInAnonymously().catch((err) => {
            console.error('[Patofelting] Error auth anónima:', err);
          });
        }
      });
    });
  }

  // Promise global para esperar UID si hace falta
  window.firebaseReady = ensureAnonymousAuth();

  // Helpers opcionales para debug
  window.fb = {
    config: cfg,
    auth,
    db,
    ready: () => window.firebaseReady,
    uid: () => auth.currentUser?.uid || null
  };
})();
