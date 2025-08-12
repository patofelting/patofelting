// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyD261TL6XuBp12rUNCcMKyP7_nMaCVYc7Y",
  authDomain: "patofelting-b188f.firebaseapp.com",
  databaseURL: "https://patofelting-b188f-default-rtdb.firebaseio.com",
  projectId: "patofelting-b188f",
  storageBucket: "patofelting-b188f.appspot.com",
  messagingSenderId: "858377467588",
  appId: "1:858377467588:web:cade9de05ebccc17f87b91"
};

// Inicialización con compatibilidad
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Exporta las instancias compatibles para Realtime Database (reacciones y favoritos)
window.firebaseCompatDb = firebase.database();
window.firebaseCompatAuth = firebase.auth();

// Exporta Firestore para comentarios
window.firebaseFirestore = firebase.firestore();

// Listener para estado de autenticación
window.firebaseCompatAuth.onAuthStateChanged(user => {
  console.log('Usuario Firebase:', user ? 'Conectado' : 'Desconectado');
});
