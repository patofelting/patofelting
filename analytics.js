import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyD261TL6XuBp12rUNCcMKyP7_nMaCVYc7Y",
  authDomain: "patofelting-b188f.firebaseapp.com",
  projectId: "patofelting-b188f",
  appId: "1:858377467588:web:cade9de05ebccc17f87b91"
};

const app = initializeApp(firebaseConfig, 'AnalyticsApp');
const analytics = getAnalytics(app);

// Eventos básicos
logEvent(analytics, 'session_start');
logEvent(analytics, 'page_view', {
  page_title: document.title,
  page_location: window.location.href
});

// Registrar eventos de interacción
document.addEventListener('click', function(e) {
  if (e.target.closest('.boton-agregar')) {
    logEvent(analytics, 'add_to_cart_click');
  }
  if (e.target.closest('.carrito-btn-main')) {
    logEvent(analytics, 'view_cart');
  }
});
