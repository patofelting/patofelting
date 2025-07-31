// ===============================
// CONFIGURACIÓN GLOBAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const CSV_URL = window.SHEET_CSV_URL;
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

// ======== Primero declaramos firebaseConfig y luego inicializamos Firebase ========
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, runTransaction, onValue, get, set } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD261TL6XuBp12rUNCcMKyP7_nMaCVYc7Y",
  authDomain: "patofelting-b188f.firebaseapp.com",
  databaseURL: "https://patofelting-b188f-default-rtdb.firebaseio.com",
  projectId: "patofelting-b188f",
  storageBucket: "patofelting-b188f.appspot.com",
  messagingSenderId: "858377467588",
  appId: "1:858377467588:web:cade9de05ebccc17f87b91"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

let productos = [];
let carrito = [];
let paginaActual = 1;
let userUID = null;

let filtrosActuales = {
  precioMin: null,
  precioMax: null,
  categoria: 'todos',
  busqueda: ''
};

const getElement = id => document.getElementById(id);
const elementos = {
  galeriaProductos: getElement('galeria-productos'),
  paginacion: getElement('paginacion'),
  productoModal: getElement('producto-modal'),
  modalContenido: getElement('modal-contenido'),
  listaCarrito: getElement('lista-carrito'),
  totalCarrito: getElement('total'),
  contadorCarrito: getElement('contador-carrito'),
  inputBusqueda: document.querySelector('.input-busqueda'),
  selectCategoria: getElement('filtro-categoria'),
  precioMinInput: getElement('min-slider'),
  precioMaxInput: getElement('max-slider'),
  botonResetearFiltros: document.querySelector('.boton-resetear-filtros'),
  carritoBtnMain: getElement('carrito-btn-main'),
  carritoPanel: getElement('carrito-panel'),
  carritoOverlay: document.querySelector('.carrito-overlay'),
  btnVaciarCarrito: document.querySelector('.boton-vaciar-carrito'),
  btnFinalizarCompra: document.querySelector('.boton-finalizar-compra'),
  btnCerrarCarrito: document.querySelector('.cerrar-carrito'),
  avisoPreCompraModal: getElement('aviso-pre-compra-modal'),
  btnEntendidoAviso: getElement('btn-entendido-aviso'),
  btnCancelarAviso: getElement('btn-cancelar-aviso'),
  productLoader: getElement('product-loader'),
  hamburguesa: document.querySelector('.hamburguesa'),
  menu: getElement('menu'),
  aplicarRangoBtn: document.querySelector('.aplicar-rango-btn')
};

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

function guardarCarrito() {
  localStorage.setItem(LS_CARRITO_KEY, JSON.stringify(carrito));
  actualizarContadorCarrito();
}

function cargarCarrito() {
  try {
    carrito = JSON.parse(localStorage.getItem(LS_CARRITO_KEY)) || [];
    actualizarContadorCarrito();
  } catch {
    carrito = [];
  }
}

function actualizarContadorCarrito() {
  const total = carrito.reduce((sum, i) => sum + i.cantidad, 0);
  if (elementos.contadorCarrito) {
    elementos.contadorCarrito.textContent = total;
    elementos.contadorCarrito.classList.toggle('visible', total > 0);
  }
}

// ===============================
// AUTENTICACIÓN Y CARGA INICIAL
// ===============================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await cargarProductosDesdeCSV();
  } catch {}

  // Autenticación anónima y obtención de UID
  signInAnonymously(auth)
    .then(() => {
      onAuthStateChanged(auth, user => {
        if (user) {
          userUID = user.uid;
          localStorage.setItem('uid', userUID);
          cargarProductosDesdeFirebase();
        }
      });
    })
    .catch(error => {
      console.error('Error signing in:', error);
      let errorMessage = 'Error de autenticación';
      if (error.code === 'auth/configuration-not-found') {
        errorMessage = 'Autenticación anónima no está habilitada en Firebase. Por favor, contacta al administrador.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Error de red. Por favor, verifica tu conexión a internet.';
      }
      mostrarNotificacion(errorMessage, 'error');
    });
});

// ===============================
// VACÍAR CARRITO (CORREGIDO)
// ===============================
async function vaciarCarrito() {
  if (!userUID) {
    mostrarNotificacion('Usuario no autenticado', 'error');
    return;
  }
  if (carrito.length === 0) {
    mostrarNotificacion('El carrito ya está vacío', 'info');
    return;
  }
  try {
    // Restaurar stock en Firebase
    await Promise.all(
      carrito.map(async (item) => {
        const productoRef = ref(db, `productos/${item.id}/stock`);
        await runTransaction(productoRef, (stockActual) => {
          const cantidadADevolver = typeof item.cantidad === 'number' && item.cantidad > 0 ? item.cantidad : 0;
          return typeof stockActual === 'number'
            ? stockActual + cantidadADevolver
            : cantidadADevolver;
        });
      })
    );
    // Vaciar local y remoto
    carrito = [];
    guardarCarrito();
    await set(ref(db, `carritos/${userUID}`), []);
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion('Carrito vaciado y stock restaurado correctamente', 'exito');
  } catch (error) {
    console.error("Error al vaciar el carrito:", error);
    mostrarNotificacion('Ocurrió un error al vaciar el carrito', 'error');
  }
}

// ===============================
// MODAL DE PRODUCTO (CORREGIDO)
// ===============================
function mostrarModalProducto(producto) {
  const modal = elementos.productoModal;
  const contenido = elementos.modalContenido;
  if (!modal || !contenido) return;

  const enCarrito = carrito.find(item => item.id === producto.id) || { cantidad: 0 };
  const disponibles = Math.max(0, producto.stock - enCarrito.cantidad);
  const agotado = disponibles <= 0;
  let currentIndex = 0;

  function renderCarrusel() {
    contenido.innerHTML = `
      <button class="cerrar-modal" aria-label="Cerrar modal">×</button>
      <div class="modal-flex">
        <div class="modal-carrusel">
          <img src="${producto.imagenes[currentIndex] || PLACEHOLDER_IMAGE}" class="modal-img" alt="${producto.nombre}">
          ${producto.imagenes.length > 1 ? `
            <div class="modal-controls">
              <button class="modal-prev" ${currentIndex === 0 ? 'disabled' : ''}>‹</button>
              <button class="modal-next" ${currentIndex === producto.imagenes.length - 1 ? 'disabled' : ''}>›</button>
            </div>
          ` : ''}
          <div class="modal-thumbnails">
            ${producto.imagenes.map((img, i) =>
              `<img src="${img}" class="thumbnail ${i === currentIndex ? 'active' : ''}" data-index="${i}" alt="Miniatura ${i + 1}">`
            ).join('')}
          </div>
        </div>
        <div class="modal-info">
          <h1>${producto.nombre}</h1>
          <p>$U ${producto.precio.toLocaleString('es-UY')}</p>
          <p class="${agotado ? 'agotado' : 'disponible'}">${agotado ? 'AGOTADO' : `Disponible: ${disponibles}`}</p>
          <div class="modal-descripcion">${producto.descripcion || ''}</div>
          <div class="modal-acciones">
            <input type="number" value="1" min="1" max="${disponibles}" class="cantidad-modal-input" ${agotado ? 'disabled' : ''}>
            <button class="boton-agregar-modal ${agotado ? 'agotado' : ''}" data-id="${producto.id}" ${agotado ? 'disabled' : ''}>
              ${agotado ? 'Agotado' : 'Agregar al carrito'}
            </button>
          </div>
        </div>
      </div>
    `;

    contenido.querySelector('.cerrar-modal').onclick = cerrarModal;

    contenido.querySelector('.modal-prev')?.addEventListener('click', () => {
      if (currentIndex > 0) {
        currentIndex--;
        renderCarrusel();
      }
    });

    contenido.querySelector('.modal-next')?.addEventListener('click', () => {
      if (currentIndex < producto.imagenes.length - 1) {
        currentIndex++;
        renderCarrusel();
      }
    });

    contenido.querySelectorAll('.thumbnail').forEach(th => {
      th.addEventListener('click', () => {
        currentIndex = parseInt(th.dataset.index);
        renderCarrusel();
      });
    });

    contenido.querySelector('.boton-agregar-modal')?.addEventListener('click', async () => {
      const inputCantidad = contenido.querySelector('.cantidad-modal-input');
      const cantidadAgregar = parseInt(inputCantidad?.value, 10) || 1;
      await agregarAlCarrito(producto.id, cantidadAgregar);
      cerrarModal();
    });
  }

  modal.classList.add('visible');
  renderCarrusel();
}

function cerrarModal() {
  const modal = elementos.productoModal;
  if (modal) modal.classList.remove('visible');
}

// ===============================
// CORRECCIÓN DE REFERENCIAS Y EVENTOS
// ===============================
function init() {
  inicializarMenuHamburguesa();
  inicializarFAQ();
  setupContactForm();
  cargarCarrito();
  inicializarEventos();
}

function inicializarEventos() {
  elementos.carritoBtnMain?.addEventListener('click', () => toggleCarrito(true));
  elementos.carritoOverlay?.addEventListener('click', () => toggleCarrito(false));
  elementos.btnCerrarCarrito?.addEventListener('click', () => toggleCarrito(false));
  elementos.btnVaciarCarrito?.addEventListener('click', vaciarCarrito);
  // ... el resto igual
}

// ===============================
// ARREGLA EL PROBLEMA DEL 404 (undefined)
// ===============================
function crearCardProducto(p) {
  const enCarrito = carrito.find(i => i.id === p.id);
  const disp = Math.max(0, p.stock - (enCarrito?.cantidad || 0));
  const agot = disp <= 0;
  // Asegúrate de que siempre haya imagen válida
  const imagenPrincipal = (p.imagenes && p.imagenes.length > 0 && p.imagenes[0]) ? p.imagenes[0] : PLACEHOLDER_IMAGE;

  return `
    <div class="producto-card ${agot ? 'agotado' : ''}" data-id="${p.id}">
      <img src="${imagenPrincipal}" alt="${p.nombre}" class="producto-img" loading="lazy">
      <h3 class="producto-nombre">${p.nombre}</h3>
      <p class="producto-precio">$U ${p.precio.toLocaleString('es-UY')}</p>
      <div class="card-acciones">
        <button class="boton-agregar${agot ? ' agotado' : ''}" data-id="${p.id}" ${agot ? 'disabled' : ''}>
          ${agot ? '<i class="fas fa-times-circle"></i> Agotado' : '<i class="fas fa-cart-plus"></i> Agregar'}
        </button>
        ${agot ? `
        <button class="boton-aviso-stock" onclick="preguntarStock('${p.nombre.replace(/'/g, "\\'")}', ${p.id})" style="background-color: #ffd93b; color: #333; font-weight: bold;">
          🛎️ Avisame cuando haya stock
        </button>` : ''}
      </div>
      <button class="boton-detalles" data-id="${p.id}">🔍 Ver Detalle</button>
    </div>
  `;
}



// ===============================
// EXPORTS PARA USO GLOBAL
// ===============================
window.verDetalle = verDetalle;
window.agregarAlCarrito = agregarAlCarrito;

// ===============================
// INICIALIZACIÓN
// ===============================
document.addEventListener('DOMContentLoaded', init);
