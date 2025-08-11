<!-- firebase-config.js -->
<script>
(() => {
  // Evita inicializar dos veces si se incluye por error más de una vez
  if (window.__pfFirebaseInit) return;
  window.__pfFirebaseInit = true;

  // --- Requisitos: SDKs compat ya cargados en el HTML ---
  // <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
  // <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
  // <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js"></script>

  if (typeof firebase === 'undefined') {
    console.error('[Patofelting] Firebase SDK compat no encontrado. Asegúrate de cargar los 3 scripts compat antes de firebase-config.js');
    return;
  }

  // --- Configuración de TU proyecto ---
  const cfg = {
    apiKey: "AIzaSyD261TL6XuBp12rUNCcMKyP7_nMaCVYc7Y",
    authDomain: "patofelting-b188f.firebaseapp.com",
    databaseURL: "https://patofelting-b188f-default-rtdb.firebaseio.com",
    projectId: "patofelting-b188f",
    storageBucket: "patofelting-b188f.appspot.com",
    messagingSenderId: "858377467588",
    appId: "1:858377467588:web:cade9de05ebccc17f87b91"
  };

  // expone la config por si la necesitas en otra parte
  window.firebaseConfig = cfg;

  // --- Inicializa app una sola vez ---
  if (!firebase.apps || firebase.apps.length === 0) {
    try {
      firebase.initializeApp(cfg);
    } catch (e) {
      // Si otro script ya inicializó, ignoramos el error
      if (!/already exists/i.test(String(e))) {
        console.error('[Patofelting] Error al inicializar Firebase:', e);
        return;
      }
    }
  }

  // --- Objetos compat usados por blog.js ---
  const auth = firebase.auth();
  const db   = firebase.database();

  window.firebaseCompatAuth = auth;
  window.firebaseCompatDb   = db;

  // --- Sign-in anónimo (necesario para rules con auth != null) ---
  // Recordá habilitar en: Firebase Console → Authentication → Sign-in method → Anonymous → Enable
  function ensureAnonymousAuth() {
    return new Promise((resolve) => {
      const unsub = auth.onAuthStateChanged((user) => {
        if (user) {
          console.log('[Patofelting] Auth anónima OK. UID:', user.uid);
          unsub(); resolve(user);
        } else {
          auth.signInAnonymously().catch((err) => {
            console.error('[Patofelting] Error auth anónima:', err);
          });
        }
      });
    });
  }

  // Promise global para esperar a que haya UID si hace falta
  window.firebaseReady = ensureAnonymousAuth();

  // Helpers opcionales
  window.fb = {
    config: cfg,
    auth,
    db,
    ready: () => window.firebaseReady,
    uid: () => auth.currentUser?.uid || null
  };
})();
</script>
