// ===============================
// CONFIGURACIÓN GLOBAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

// Ventana de visibilidad (5 días)
const BACK_IN_STOCK_DUR_MS = 1000 * 60 * 60 * 24 * 5;

// === DISEÑO MINIMALISTA KAWAII - CSS DE CINTA ===
const RIBBON_CSS = `
.producto-card .ribbon {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(126, 217, 87, 0.9);
  backdrop-filter: blur(4px);
  color: #fff;
  padding: 4px 12px;
  font-weight: 500;
  font-size: 0.75rem;
  border-radius: 12px;
  box-shadow: 0 2px 6px rgba(0,0,0,0.08);
  z-index: 5;
  pointer-events: none;
  animation: kawaiiPulse 2.5s ease-in-out infinite;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  letter-spacing: 0.3px;
}

@keyframes kawaiiPulse {
  0%, 100% { opacity: 0.85; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.02); }
}

@media (max-width: 600px) {
  .producto-card .ribbon {
    top: 6px;
    right: 6px;
    font-size: 0.7rem;
    padding: 3px 10px;
  }
}
`;

// Firebase v10+
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, runTransaction, onValue, get, update, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ===============================
// VERIFICACIÓN DE FIREBASE
// ===============================
let db, auth;
try {
  if (!window.firebaseApp) throw new Error('Firebase no inicializado');
  db = window.firebaseDatabase || getDatabase(window.firebaseApp);
  auth = getAuth(window.firebaseApp);
} catch (error) {
  console.error('❌', error.message);
}

// ===============================
// ESTADO GLOBAL
// ===============================
let productos = [];
let carrito = [];
let paginaActual = 1;

const busyButtons = new WeakSet();
const inFlightAdds = new Set();
let suprimirRealtime = 0;

let filtrosActuales = {
  precioMin: 0,
  precioMax: 3000,
  categoria: 'todos',
  busqueda: ''
};

// ===============================
// UTILIDADES
// ===============================
function mostrarNotificacion(mensaje, tipo = 'exito') {
  const noti = document.createElement('div');
  noti.className = `notificacion ${tipo}`;
  noti.textContent = mensaje;
  document.body.appendChild(noti);
  requestAnimationFrame(() => noti.classList.add('show'));
  setTimeout(() => {
    noti.classList.remove('show');
    setTimeout(() => noti.remove(), 250);
  }, 2500);
}
const getElement = (id) => document.getElementById(id);

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

// ===============================
// CARRITO BÁSICO
// ===============================
function guardarCarrito() {
  try {
    localStorage.setItem(LS_CARRITO_KEY, JSON.stringify(carrito));
    actualizarContadorCarrito();
  } catch (e) {
    console.error('localStorage error:', e);
    mostrarNotificacion('Error al guardar el carrito', 'error');
  }
}
function cargarCarrito() {
  try {
    carrito = JSON.parse(localStorage.getItem(LS_CARRITO_KEY)) || [];
    actualizarContadorCarrito();
  } catch (e) {
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
// PROCESAMIENTO DE PRODUCTOS (LÓGICA 0->>0 CORREGIDA)
// ===============================
function procesarDatosProductos(data) {
  const now = Date.now();

  productos = Object.entries(data || {}).map(([key, p]) => {
    if (!p || typeof p !== 'object') return null;

    const id = parseInt(p.id || key, 10);
    const nombre = (p.nombre || 'Sin nombre').trim();
    const stock = Math.max(0, parseInt(String(p.stock ?? p.cantidad).replace(',', '.'), 10) || 0);
    const restockedAt = p.restockedAt ? parseFloat(p.restockedAt) : null;

    // LÓGICA ROBUSTA: Mostrar cinta si hay stock y timestamp es reciente
    const backInStock = !!(stock > 0 && restockedAt && (now - restockedAt) < BACK_IN_STOCK_DUR_MS);

    return {
      id,
      nombre,
      descripcion: (p.descripcion || '').trim(),
      precio: parseFloat(String(p.precio).replace(',', '.')) || 0,
      stock,
      imagenes: Array.isArray(p.imagenes) 
        ? p.imagenes.filter(img => typeof img === 'string' && img.trim())
        : [p.imagen || PLACEHOLDER_IMAGE],
      categoria: (p.categoria || 'otros').toLowerCase().trim(),
      backInStock,
      restockedAt,
      alto: parseFloat(p.alto) || null,
      ancho: parseFloat(p.ancho) || null,
      profundidad: parseFloat(p.profundidad) || null,
      adicionales: ((p.adicionales || '').toString().trim() || '').replace(/^[-–]$/, '')
    };
  }).filter(Boolean).sort((a, b) => a.id - b.id);
}

// ===============================
// DETECCIÓN Y ETIQUETADO EN TIEMPO REAL
// ===============================
async function verificarYEtiquetarReingresos() {
  if (!db) return;

  const productosRef = ref(db, 'productos');
  
  onValue(productosRef, async (snapshot) => {
    if (!snapshot.exists()) return;

    const data = snapshot.val();
    const updates = {};

    for (const [key, producto] of Object.entries(data)) {
      const id = parseInt(producto.id || key, 10);
      const stockActual = Math.max(0, parseInt(String(producto.stock ?? producto.cantidad).replace(',', '.'), 10) || 0);
      const restockedAt = producto.restockedAt ? parseFloat(producto.restockedAt) : null;
      
      // Si hay stock pero no hay timestamp, es un reingreso
      if (stockActual > 0 && !restockedAt) {
        updates[`${id}/restockedAt`] = serverTimestamp();
      }
    }

    // Aplicar actualizaciones solo si hay cambios
    if (Object.keys(updates).length > 0) {
      try {
        await update(ref(db, 'productos'), updates);
        console.log('✅ Reingresos detectados y etiquetados:', Object.keys(updates).length);
      } catch (e) {
        console.error('Error etiquetando reingresos:', e);
      }
    }
  });
}

// ===============================
// RENDERIZADO
// ===============================
function crearCardProducto(p) {
  const disp = Math.max(0, p.stock || 0);
  const agotado = disp <= 0;
  const imagen = (p.imagenes && p.imagenes[0]) || PLACEHOLDER_IMAGE;

  // CINTA MINIMALISTA SOLO PARA REINGRESOS
  const ribbonHTML = (!agotado && p.backInStock)
    ? `<span class="ribbon">✨ Vuelve a estar aquí</span>`
    : '';

  return `
    <div class="producto-card ${agotado ? 'agotado' : ''}" data-id="${p.id}">
      ${ribbonHTML}
      <img src="${imagen}" alt="${p.nombre}" class="producto-img" loading="lazy" decoding="async">
      <h3 class="producto-nombre">${p.nombre}</h3>
      <p class="producto-precio">$U ${p.precio.toLocaleString('es-UY')}</p>
      <div class="producto-stock">
        ${agotado ? `<span class="texto-agotado">Agotado</span>` : `Stock: ${disp}`}
      </div>
      <div class="card-acciones">
        <button class="boton-agregar${agotado ? ' agotado' : ''}" data-id="${p.id}" ${agotado ? 'disabled' : ''}>
          ${agotado ? 'Agotado' : '<i class="fas fa-cart-plus"></i> Agregar'}
        </button>
        ${agotado ? `<button class="boton-aviso-stock" data-nombre="${p.nombre.replace(/'/g, "\\'")}">📩 Avisame</button>` : ''}
      </div>
      <button class="boton-detalles" data-id="${p.id}">🔍 Detalle</button>
    </div>
  `;
}

function filtrarProductos() {
  const { precioMin, precioMax, categoria, busqueda } = filtrosActuales;
  const b = (busqueda || '').toLowerCase();
  return productos.filter(p => 
    p.precio >= precioMin && 
    p.precio <= precioMax && 
    (categoria === 'todos' || p.categoria === categoria) &&
    (!b || p.nombre.toLowerCase().includes(b) || p.descripcion.toLowerCase().includes(b))
  );
}

function renderizarProductos() {
  const filtrados = filtrarProductos();
  const inicio = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
  const paginados = filtrados.slice(inicio, inicio + PRODUCTOS_POR_PAGINA);

  elementos.galeriaProductos.innerHTML = paginados.length === 0
    ? '<p class="sin-productos">No se encontraron productos.</p>'
    : paginados.map(crearCardProducto).join('');

  renderizarPaginacion(filtrados.length);
}

function renderizarPaginacion(total) {
  const pages = Math.ceil(total / PRODUCTOS_POR_PAGINA);
  if (!elementos.paginacion || pages <= 1) {
    if (elementos.paginacion) elementos.paginacion.innerHTML = '';
    return;
  }
  elementos.paginacion.innerHTML = Array.from({ length: pages }, (_, i) => `
    <button class="${i + 1 === paginaActual ? 'active' : ''}" data-page="${i + 1}">${i + 1}</button>
  `).join('');
}

// ===============================
// MODAL DE PRODUCTO
// ===============================
function mostrarModalProducto(producto) {
  const disp = Math.max(0, producto.stock || 0);
  const agotado = disp <= 0;
  
  // CINTA EN MODAL (más sutil)
  const ribbonHTML = (!agotado && producto.backInStock)
    ? `<div style="position:absolute;top:15px;right:15px;background:rgba(126,217,87,0.9);backdrop-filter:blur(4px);color:#fff;padding:6px 14px;border-radius:12px;font-size:0.8rem;font-weight:500;box-shadow:0 2px 6px rgba(0,0,0,0.08);animation:kawaiiPulse 2.5s ease-in-out infinite;z-index:10;">✨ Reingresado</div>`
    : '';

  const modalHTML = `
    <div class="modal-flex">
      <div class="modal-carrusel">
        <img src="${producto.imagenes[0] || PLACEHOLDER_IMAGE}" class="modal-img" alt="${producto.nombre}">
      </div>
      <div class="modal-info">
        <h1 class="modal-nombre">${producto.nombre}</h1>
        <p class="modal-precio">$U ${producto.precio.toLocaleString('es-UY')}</p>
        ${ribbonHTML}
        <div class="modal-descripcion">
          ${producto.descripcion ? `<p>${producto.descripcion}</p>` : ''}
          ${producto.adicionales ? `<p><b>Adicionales:</b> ${producto.adicionales}</p>` : ''}
          ${(producto.alto || producto.ancho || producto.profundidad)
            ? `<p><b>Medidas:</b> ${[producto.alto, producto.ancho, producto.profundidad].filter(Boolean).join(' × ')} cm</p>`
            : ''}
        </div>
        <p class="modal-stock ${agotado ? 'agotado' : 'disponible'}">${agotado ? 'AGOTADO' : `Disponible: ${disp}`}</p>
        <div class="modal-acciones">
          <input type="number" value="1" min="1" max="${disp}" class="cantidad-modal-input" ${agotado ? 'disabled' : ''}>
          <button class="boton-agregar-modal ${agotado ? 'agotado' : ''}" data-id="${producto.id}" ${agotado ? 'disabled' : ''}>
            ${agotado ? 'Agotado' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  `;

  elementos.modalContenido.innerHTML = modalHTML;
  elementos.productoModal.classList.add('visible');
  elementos.productoModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');

  // Event listeners del modal
  elementos.modalContenido.querySelector('.boton-agregar-modal')?.addEventListener('click', (e) => {
    const id = parseInt(e.target.dataset.id);
    const qty = parseInt(elementos.modalContenido.querySelector('.cantidad-modal-input').value);
    agregarAlCarrito(id, qty, e.target);
  });
}

function cerrarModal() {
  elementos.productoModal.classList.remove('visible');
  elementos.productoModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('no-scroll');
}

// ===============================
// AGREGAR AL CARRITO
// ===============================
async function agregarAlCarrito(id, cantidad = 1, boton = null) {
  if (inFlightAdds.has(id)) return;
  inFlightAdds.add(id);

  const producto = productos.find(p => p.id === id);
  if (!producto || (producto.stock || 0) < cantidad) {
    inFlightAdds.delete(id);
    return mostrarNotificacion('Stock insuficiente', 'error');
  }

  if (boton) {
    boton.disabled = true;
    boton._oldHTML = boton.innerHTML;
    boton.innerHTML = 'Agregando...';
  }

  try {
    await runTransaction(ref(db, `productos/${id}/stock`), s => (s || 0) - cantidad);
    suprimirRealtime++;
    producto.stock = Math.max(0, producto.stock - cantidad);

    const existente = carrito.find(i => i.id === id);
    if (existente) existente.cantidad += cantidad;
    else carrito.push({
      id: producto.id,
      nombre: producto.nombre,
      precio: producto.precio,
      cantidad,
      imagen: producto.imagenes[0] || PLACEHOLDER_IMAGE
    });

    guardarCarrito();
    renderizarProductos();
    renderizarCarrito();
    mostrarNotificacion('✨ Producto agregado', 'exito');
  } catch (e) {
    console.error('Error agregando:', e);
    mostrarNotificacion('Error al agregar', 'error');
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.innerHTML = boton._oldHTML;
    }
    inFlightAdds.delete(id);
  }
}

// ===============================
// CARRITO UI
// ===============================
async function vaciarCarrito() {
  if (carrito.length === 0) return mostrarNotificacion('Carrito vacío', 'info');
  
  await Promise.all(carrito.map(item => 
    runTransaction(ref(db, `productos/${item.id}/stock`), s => (s || 0) + item.cantidad)
  ));
  
  suprimirRealtime += carrito.length;
  carrito = [];
  guardarCarrito();
  renderizarProductos();
  renderizarCarrito();
  mostrarNotificacion('Carrito vaciado', 'info');
}

function renderizarCarrito() {
  if (!elementos.listaCarrito || !elementos.totalCarrito) return;

  if (carrito.length === 0) {
    elementos.listaCarrito.innerHTML = '<p class="carrito-vacio">Tu carrito está vacío ✨</p>';
    elementos.totalCarrito.textContent = 'Total: $U 0';
    return;
  }

  elementos.listaCarrito.innerHTML = carrito.map(item => `
    <li class="carrito-item" data-id="${item.id}">
      <img src="${item.imagen}" class="carrito-item-img" alt="${item.nombre}" loading="lazy">
      <div class="carrito-item-info">
        <span class="carrito-item-nombre">${item.nombre}</span>
        <span class="carrito-item-precio">$U ${item.precio.toLocaleString('es-UY')}</span>
        <div class="carrito-item-controls">
          <button class="disminuir-cantidad" data-id="${item.id}">-</button>
          <span>${item.cantidad}</span>
          <button class="aumentar-cantidad" data-id="${item.id}">+</button>
        </div>
      </div>
    </li>
  `).join('');

  const total = carrito.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  elementos.totalCarrito.textContent = `Total: $U ${total.toLocaleString('es-UY')}`;
}

// ===============================
// FILTROS
// ===============================
function actualizarCategorias() {
  if (!elementos.selectCategoria) return;
  const cats = ['todos', ...new Set(productos.map(p => p.categoria).filter(c => c).sort())];
  elementos.selectCategoria.innerHTML = cats.map(cat => 
    `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`
  ).join('');
}

function aplicarFiltros() {
  paginaActual = 1;
  renderizarProductos();
}

// ===============================
// PAGINACIÓN
// ===============================
window.cambiarPagina = function(page) {
  paginaActual = page;
  renderizarProductos();
  elementos.galeriaProductos?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// ===============================
// INICIALIZACIÓN
// ===============================
document.addEventListener('DOMContentLoaded', async () => {
  // Inyectar CSS minimalista
  const style = document.createElement('style');
  style.id = 'pf-back-in-stock-ribbon-css';
  style.textContent = RIBBON_CSS;
  document.head.appendChild(style);

  cargarCarrito();

  if (db && auth) {
    try {
      await signInAnonymously(auth);
      console.log('✅ Auth anónima exitosa');
      verificarYEtiquetarReingresos(); // Importante: ejecutar primero
      cargarProductosDesdeFirebase();
    } catch (e) {
      console.error('❌ Auth error:', e);
      mostrarNotificacion('Error de autenticación. Revisa Firebase.', 'error');
    }
  } else {
    mostrarNotificacion('Error: Firebase no configurado', 'error');
  }

  initEventos();
  updateRange();
});

window.agregarAlCarrito = agregarAlCarrito;
window.preguntarStock = preguntarStock;
