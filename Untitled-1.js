// ===============================
// CONFIGURACIÓN GLOBAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const FIREBASE_URL = 'https://patofelting-b188f-default-rtdb.firebaseio.com'; // URL base
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

// ======== Inicializar Firebase ========
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  runTransaction,
  onValue,
  get
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD261TL6XuBp12rUNCcMKyP7_nMaCVYc7Y",
  authDomain: "patofelting-b188f.firebaseapp.com",
  databaseURL: `${FIREBASE_URL}`,
  projectId: "patofelting-b188f",
  storageBucket: "patofelting-b188f.appspot.com",
  messagingSenderId: "858377467588",
  appId: "1:858377467588:web:cade9de05ebccc17f87b91"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// Anonymous authentication
signInAnonymously(auth)
  .then(() => console.log("✅ Signed in anonymously"))
  .catch(error => console.error("❌ Error signing in:", error));

// ===============================
// ESTADO GLOBAL
// ===============================
let productos = [];
let carrito = [];
let paginaActual = 1;

let filtrosActuales = {
  precioMin: null,
  precioMax: null,
  categoria: 'todos',
  busqueda: ''
};

// ===============================
// CARGAR PRODUCTOS AL INICIO
// ===============================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Escuchar cambios de stock en tiempo real
    escucharCambiosDeStock();

    // Cargar productos existentes desde Firebase
    await cargarProductosDesdeFirebase();
  } catch (error) {
    console.error("Error al cargar productos:", error);
    mostrarNotificacion('Error al cargar productos desde Firebase', 'error');
  }
});

// ===============================
// FUNCIONES AUXILIARES
// ===============================
function mostrarNotificacion(mensaje, tipo = 'exito') {
  const noti = document.createElement('div');
  noti.className = `notificacion ${tipo}`;
  noti.textContent = mensaje;
  document.body.appendChild(noti);
  setTimeout(() => noti.classList.add('show'), 10);
  setTimeout(() => {
    noti.classList.remove('show');
    setTimeout(() => noti.remove(), 300);
  }, 2500);
}

// ===============================
// CARGAR PRODUCTOS DESDE FIREBASE
// ===============================
async function cargarProductosDesdeFirebase() {
  const productosRef = ref(db, 'productos');

  try {
    const snapshot = await get(productosRef);
    if (!snapshot.exists()) {
      console.warn("No se encontraron productos en Firebase.");
      return;
    }

    productos = Object.values(snapshot.val()).map(producto => ({
      ...producto,
      stock: parseInt(producto.stock, 10) || 0
    }));

    renderizarProductos();
  } catch (error) {
    console.error("Error al cargar productos desde Firebase:", error);
  }
}

// ===============================
// ESCUCHAR CAMBIOS DE STOCK EN TIEMPO REAL
// ===============================
function escucharCambiosDeStock() {
  const productosRef = ref(db, 'productos');

  onValue(productosRef, (snapshot) => {
    if (!snapshot.exists()) return;

    productos = Object.values(snapshot.val()).map(producto => ({
      ...producto,
      stock: parseInt(producto.stock, 10) || 0
    }));

    renderizarProductos();
    renderizarCarrito();
  }, (error) => {
    console.error("Error al escuchar cambios de stock:", error);
  });
}

// ===============================
// AGREGAR PRODUCTOS AL CARRITO
// ===============================
async function agregarAlCarrito(id, cantidadAgregar = 1, boton = null) {
  try {
    const producto = productos.find(p => p.id === id);
    if (!producto) {
      mostrarNotificacion("❌ Producto no encontrado", "error");
      return;
    }

    const stockRef = ref(db, `productos/${id}/stock`);
    const resultado = await runTransaction(stockRef, (stockActual) => {
      if (isNaN(stockActual) || stockActual < cantidadAgregar) return; // Stock insuficiente
      return stockActual - cantidadAgregar; // Descontar stock
    });

    if (!resultado.committed) {
      mostrarNotificacion("❌ Stock insuficiente", "error");
      return;
    }

    // Actualizar carrito
    const enCarrito = carrito.find(item => item.id === id);
    if (enCarrito) {
      enCarrito.cantidad += cantidadAgregar;
    } else {
      carrito.push({ ...producto, cantidad: cantidadAgregar });
    }

    guardarCarrito();
    renderizarCarrito();
    mostrarNotificacion("✅ Producto agregado al carrito", "exito");
  } catch (error) {
    console.error("Error al agregar producto al carrito:", error);
    mostrarNotificacion("⚠️ Error al agregar producto", "error");
  }
}

// ===============================
// ACTUALIZAR UI DEL CARRITO
// ===============================
function guardarCarrito() {
  localStorage.setItem(LS_CARRITO_KEY, JSON.stringify(carrito));
}

function cargarCarrito() {
  try {
    carrito = JSON.parse(localStorage.getItem(LS_CARRITO_KEY)) || [];
  } catch {
    carrito = [];
  }
}

function renderizarCarrito() {
  const listaCarrito = document.getElementById('lista-carrito');
  const totalCarrito = document.getElementById('total');
  if (!listaCarrito || !totalCarrito) return;

  if (carrito.length === 0) {
    listaCarrito.innerHTML = '<p class="carrito-vacio">Tu carrito está vacío</p>';
    totalCarrito.textContent = 'Total: $U 0';
    return;
  }

  listaCarrito.innerHTML = carrito.map(item => {
    const producto = productos.find(p => p.id === item.id);
    const disponibles = producto ? producto.stock : 0;

    return `
    <li class="carrito-item" data-id="${item.id}">
      <img src="${producto.imagenes ? producto.imagenes[0] : PLACEHOLDER_IMAGE}" class="carrito-item-img" alt="${producto.nombre}" />
      <div class="carrito-item-info">
        <span class="carrito-item-nombre">${producto.nombre}</span>
        <span class="carrito-item-precio">$U ${producto.precio.toLocaleString('es-UY')}</span>
        <div class="carrito-item-controls">
          <button class="disminuir-cantidad" data-id="${item.id}" ${item.cantidad <= 1 ? 'disabled' : ''}>-</button>
          <span class="carrito-item-cantidad">${item.cantidad}</span>
          <button class="aumentar-cantidad" data-id="${item.id}" ${disponibles <= 0 ? 'disabled' : ''}>+</button>
        </div>
        <span class="carrito-item-subtotal">Subtotal: $U ${(item.cantidad * producto.precio).toLocaleString('es-UY')}</span>
      </div>
    </li>`;
  }).join('');

  const total = carrito.reduce((sum, item) => {
    const producto = productos.find(p => p.id === item.id);
    return sum + (item.cantidad * (producto?.precio || 0));
  }, 0);

  totalCarrito.textContent = `Total: $U ${total.toLocaleString('es-UY')}`;
}

// ===============================
// RENDERIZAR PRODUCTOS
// ===============================
function renderizarProductos() {
  const galeriaProductos = document.getElementById('galeria-productos');
  if (!galeriaProductos) return;

  galeriaProductos.innerHTML = productos.map(producto => {
    const enCarrito = carrito.find(item => item.id === producto.id);
    const disponibles = producto.stock - (enCarrito?.cantidad || 0);
    const agotado = disponibles <= 0;

    return `
    <div class="producto-card ${agotado ? 'agotado' : ''}" data-id="${producto.id}">
      <img src="${producto.imagenes ? producto.imagenes[0] : PLACEHOLDER_IMAGE}" class="producto-img" alt="${producto.nombre}" />
      <h3 class="producto-nombre">${producto.nombre}</h3>
      <p class="producto-precio">$U ${producto.precio.toLocaleString('es-UY')}</p>
      <button class="boton-agregar" data-id="${producto.id}" ${agotado ? 'disabled' : ''}>
        ${agotado ? 'Agotado' : 'Agregar al carrito'}
      </button>
    </div>`;
  }).join('');

  // Añadir eventos a los botones de agregar
  galeriaProductos.querySelectorAll('.boton-agregar').forEach(boton => {
    boton.addEventListener('click', async (e) => {
      const id = parseInt(e.target.dataset.id, 10);
      await agregarAlCarrito(id, 1, boton);
    });
  });
}

// ===============================
// INICIALIZACIÓN
// ===============================
cargarCarrito();
renderizarCarrito();
