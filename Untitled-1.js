// main.js
// ===============================
// CONFIGURACIÓN GLOBAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const LS_STOCK_SEEN_KEY = 'pf_last_stock_by_id'; // recuerda último stock visto por producto
const PLACEHOLDER_IMAGE =
  window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

// Ventana visible para el badge "De nuevo en stock"
const BACK_IN_STOCK_DUR_MS = 1000 * 60 * 60 * 24 * 5; // 5 días

// Badge estilo "macOS / vítreo" más visible
const BADGE_CSS = `
.producto-card { position: relative; overflow: hidden; }

.producto-card .badge-restock {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 6;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  border-radius: 999px;

  background: linear-gradient(180deg, rgba(52,199,89,0.90), rgba(48,209,88,0.85));
  backdrop-filter: saturate(180%) blur(12px);
  -webkit-backdrop-filter: saturate(180%) blur(12px);

  border: 1px solid rgba(13,110,35,0.18);
  box-shadow:
    0 10px 25px rgba(0,0,0,0.15),
    inset 0 1px 0 rgba(255,255,255,0.45);

  font-weight: 800;
  font-size: 0.82rem;
  letter-spacing: .02em;
  color: #0b2f16;
  text-shadow: 0 1px 0 rgba(255,255,255,0.35);
  user-select: none;
  pointer-events: none;

  animation: pfBadgeIn .28s ease-out both;
}

.producto-card .badge-restock .dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: #eafff0;
  box-shadow:
    0 0 0 5px rgba(255,255,255,0.35),
    0 0 0 1px rgba(13,110,35,0.25);
}

@keyframes pfBadgeIn {
  from { opacity: 0; transform: translateY(-6px) scale(.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

@media (max-width: 600px) {
  .producto-card .badge-restock { top: 10px; left: 10px; padding: 8px 12px; font-size: 0.78rem; }
}
`;

// ===============================
// FIREBASE IMPORTS
// ===============================
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  ref, runTransaction, onValue, get, update, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Si usás firebase.js (recomendado):
import { firebaseApp, firebaseDatabase } from "./firebase.js";

const db = window.firebaseDatabase || firebaseDatabase;
const auth = getAuth(window.firebaseApp || firebaseApp);

// ===============================
// ESTADO GLOBAL
// ===============================
let productos = [];
let carrito = [];
let paginaActual = 1;

const busyButtons   = new WeakSet();
const inFlightAdds  = new Set();
let suprimirRealtime = 0;

// Para detectar restock real (0 -> >0) en la sesión
const prevStockById = {};
// Persistimos también entre sesiones para detectar 0 -> >0 aunque recargues
const lastStockById = cargarMapaUltimoStock();
// Evita spamear toasts en la sesión
const restockToastShown = new Set();

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

const toNum = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const s = String(v).replace(',', '.').trim();
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
};

function cargarMapaUltimoStock() {
  try {
    const raw = localStorage.getItem(LS_STOCK_SEEN_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function guardarMapaUltimoStock() {
  try {
    localStorage.setItem(LS_STOCK_SEEN_KEY, JSON.stringify(lastStockById));
  } catch {}
}

// ===============================
// DOM REFS
// ===============================
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
// CARRITO
// ===============================
function guardarCarrito() {
  try {
    localStorage.setItem(LS_CARRITO_KEY, JSON.stringify(carrito));
    actualizarContadorCarrito();
  } catch (e) {
    console.error('localStorage setItem fallo:', e);
    mostrarNotificacion('Error al guardar el carrito', 'error');
  }
}
function cargarCarrito() {
  try {
    const stored = localStorage.getItem(LS_CARRITO_KEY);
    carrito = stored ? JSON.parse(stored) : [];
    actualizarContadorCarrito();
  } catch (e) {
    console.error('localStorage getItem fallo:', e);
    carrito = [];
    mostrarNotificacion('Error al cargar el carrito', 'error');
  }
}
async function vaciarCarrito() {
  if (carrito.length === 0) return mostrarNotificacion('El carrito ya está vacío', 'info');

  const n = carrito.length;
  try {
    await Promise.all(
      carrito.map(async (item) => {
        const productRef = ref(db, `productos/${item.id}/stock`);
        await runTransaction(productRef, (s) => (s || 0) + item.cantidad);
      })
    );
    suprimirRealtime += n;
    carrito = [];
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion('Carrito vaciado y stock restaurado', 'exito');
  } catch (error) {
    console.error('Error al vaciar carrito:', error);
    mostrarNotificacion('Error al vaciar el carrito', 'error');
  }
}
function actualizarContadorCarrito() {
  const total = carrito.reduce((sum, i) => sum + i.cantidad, 0);
  if (elementos.contadorCarrito) {
    elementos.contadorCarrito.textContent = total;
    elementos.contadorCarrito.classList.toggle('visible', total > 0);
  }
}
function toggleCarrito(forceState) {
  if (!elementos.carritoPanel || !elementos.carritoOverlay) return;
  const isOpen = typeof forceState === 'boolean'
    ? forceState
    : !elementos.carritoPanel.classList.contains('active');

  elementos.carritoPanel.classList.toggle('active', isOpen);
  elementos.carritoOverlay.classList.toggle('active', isOpen);
  document.body.classList.toggle('no-scroll', isOpen);

  if (isOpen) renderizarCarrito();
}

// ===============================
// FIREBASE: CARGA Y REALTIME
// ===============================
async function cargarProductosDesdeFirebase() {
  const productosRef = ref(db, 'productos');

  try {
    if (elementos.productLoader) {
      elementos.productLoader.hidden = false;
      elementos.productLoader.style.display = 'flex';
    }

    const snapshot = await get(productosRef);
    if (!snapshot.exists()) {
      elementos.galeriaProductos.innerHTML = '<p class="sin-productos">No hay productos disponibles.</p>';
    } else {
      procesarDatosProductos(snapshot.val());
      renderizarProductos();
      actualizarCategorias();
      actualizarUI();
    }

    if (!cargarProductosDesdeFirebase._listening) {
      onValue(productosRef, (snap) => {
        if (suprimirRealtime > 0) { suprimirRealtime--; return; }
        if (!snap.exists()) productos = [];
        else procesarDatosProductos(snap.val());
        renderizarProductos();
        actualizarCategorias();
        actualizarUI();
      }, (error) => {
        console.error('Listener productos error:', error);
        mostrarNotificacion('Error al recibir actualizaciones de productos', 'error');
      });
      cargarProductosDesdeFirebase._listening = true;
    }
  } catch (error) {
    console.error('Error al cargar productos:', error);
    mostrarNotificacion('Error al cargar productos', 'error');
    if (elementos.galeriaProductos) {
      elementos.galeriaProductos.innerHTML = '<p class="error-carga">No se pudieron cargar los productos.</p>';
    }
  } finally {
    if (elementos.productLoader) {
      elementos.productLoader.style.display = 'none';
      elementos.productLoader.hidden = true;
    }
  }
}

// ===============================
// NORMALIZAR + RESTOCK REAL
// ===============================
function procesarDatosProductos(data) {
  const now = Date.now();

  const nuevos = Object.entries(data || {}).map(([key, p]) => {
    if (typeof p !== 'object' || !p) return null;

    const alto = toNum(p.alto);
    const ancho = toNum(p.ancho);
    const profundidad = toNum(p.profundidad);

    const stockRaw = (p.stock !== undefined ? p.stock : p.cantidad);
    const stock = Math.max(0, parseInt(String(stockRaw).replace(',', '.'), 10) || 0);

    const adic = (p.adicionales || '').toString().trim();
    const adicionales = (adic && adic !== '-' && adic !== '–') ? adic : '';

    const id = parseInt(p.id || key, 10);
    const nombre = (p.nombre || 'Sin nombre').trim();

    const restockedAt = toNum(p.restockedAt);

    // Detectar restock real 0 -> >0 (sesión + persistido)
    const prev = prevStockById[id];
    const lastSeen = typeof lastStockById[id] === 'number' ? lastStockById[id] : toNum(lastStockById[id]);

    const wentFromZero = ((prev === 0 || lastSeen === 0) && stock > 0);

    // Sellar restockedAt cuando vuelve a entrar stock.
    // - Si no existe, sellamos.
    // - Si existe pero quedó viejo y nuevamente repusiste (0->>), lo actualizamos para que el badge reaparezca.
    const restockWindowExpired = restockedAt && (now - restockedAt) > BACK_IN_STOCK_DUR_MS;
    const shouldStampRestockedAt = (stock > 0) && (wentFromZero) && (!restockedAt || restockWindowExpired);

    if (shouldStampRestockedAt) {
      try {
        update(ref(db, `productos/${id}`), { restockedAt: serverTimestamp() });
      } catch {}
    }

    // Notificación (solo si detectamos 0 -> >0 en esta sesión)
    if ((prev === 0 && stock > 0) && !restockToastShown.has(id)) {
      restockToastShown.add(id);
      mostrarNotificacion(`"${nombre}" volvió a estar disponible`, 'exito');
    }

    // Actualizar memorias
    prevStockById[id] = stock;
    lastStockById[id] = stock;

    // Badge visible si: hay stock, hay restockedAt y está dentro de ventana de 5 días
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
      estado: (p.estado || '').trim(),
      adicionales,
      alto, ancho, profundidad,
      backInStock,
      restockedAt
    };
  }).filter(Boolean).sort((a,b)=>a.id-b.id);

  productos = nuevos;
  // Persistimos el mapa de último stock tras procesar
  guardarMapaUltimoStock();
}

// ===============================
// CARRITO: RENDER
// ===============================
function renderizarCarrito() {
  if (!elementos.listaCarrito || !elementos.totalCarrito) return;

  elementos.listaCarrito.innerHTML = carrito.length === 0
    ? '<p class="carrito-vacio">Tu carrito está vacío</p>'
    : carrito.map(item => {
        const producto = productos.find(p => p.id === item.id) || { stock: 0 };
        const disponibles = Math.max(0, producto.stock || 0);
        return `
          <li class="carrito-item" data-id="${item.id}">
            <img src="${item.imagen}" class="carrito-item-img" alt="${item.nombre}" loading="lazy">
            <div class="carrito-item-info">
              <span class="carrito-item-nombre">${item.nombre}</span>
              <span class="carrito-item-precio">$U ${item.precio.toLocaleString('es-UY')} c/u</span>
              <div class="carrito-item-controls">
                <button class="disminuir-cantidad" data-id="${item.id}" ${item.cantidad <= 1 ? 'disabled' : ''}>-</button>
                <span class="carrito-item-cantidad">${item.cantidad}</span>
                <button class="aumentar-cantidad" data-id="${item.id}" ${disponibles <= 0 ? 'disabled' : ''}>+</button>
              </div>
              <span class="carrito-item-subtotal">Subtotal: $U ${(item.precio * item.cantidad).toLocaleString('es-UY')}</span>
            </div>
          </li>
        `;
      }).join('');

  const total = carrito.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  elementos.totalCarrito.textContent = `Total: $U ${total.toLocaleString('es-UY')}`;

  elementos.listaCarrito.querySelectorAll('.disminuir-cantidad').forEach(btn => {
    btn.onclick = async (e) => {
      const id = parseInt(e.currentTarget.dataset.id);
      const item = carrito.find(i => i.id === id);
      if (item && item.cantidad > 1) {
        try {
          await runTransaction(ref(db, `productos/${id}/stock`), (s) => (s || 0) + 1);
          suprimirRealtime++;
          const p = productos.find(x => x.id === id);
          if (p) p.stock = (p.stock || 0) + 1;

          item.cantidad--;
          guardarCarrito();
          renderizarCarrito();
          renderizarProductos();
          mostrarNotificacion(`Reducida cantidad de "${item.nombre}"`, 'info');
        } catch (error) {
          console.error('Error al disminuir cantidad:', error);
          mostrarNotificacion('Error al actualizar cantidad', 'error');
        }
      }
    };
  });
  elementos.listaCarrito.querySelectorAll('.aumentar-cantidad').forEach(btn => {
    btn.onclick = (e) => agregarAlCarrito(parseInt(e.currentTarget.dataset.id), 1, e.currentTarget);
  });
}

// ===============================
// GALERÍA + PAGINACIÓN
// ===============================
function crearCardProducto(p) {
  const disp = Math.max(0, p.stock || 0);
  const agot = disp <= 0;
  const imagen = (p.imagenes && p.imagenes[0]) || PLACEHOLDER_IMAGE;

  // Badge macOS (solo si NO está agotado y está en ventana de restock)
  const badgeHTML = (!agot && p.backInStock)
    ? `<div class="badge-restock"><span class="dot"></span>De nuevo en stock</div>`
    : '';

  return `
    <div class="producto-card ${agot ? 'agotado' : ''}" data-id="${p.id}">
      ${badgeHTML}
      <img src="${imagen}" alt="${p.nombre}" class="producto-img" loading="lazy" decoding="async">
      <h3 class="producto-nombre">${p.nombre}</h3>
      <p class="producto-precio">$U ${p.precio.toLocaleString('es-UY')}</p>
      <div class="producto-stock">
        ${agot ? `<span class="texto-agotado">Agotado</span>` : `Stock disponible: ${disp}`}
      </div>
      <div class="card-acciones">
        <button class="boton-agregar${agot ? ' agotado' : ''}" data-id="${p.id}" ${agot ? 'disabled' : ''}>
          ${agot ? '<i class="fas fa-times-circle"></i> Agotado' : '<i class="fas fa-cart-plus"></i> Agregar'}
        </button>
        ${agot ? `<button class="boton-aviso-stock" data-nombre="${p.nombre.replace(/'/g, "\\'")}">📩 Avisame cuando haya stock</button>` : ''}
      </div>
      <button class="boton-detalles" data-id="${p.id}">🔍 Ver Detalle</button>
    </div>
  `;
}

function filtrarProductos() {
  return productos.filter(p => {
    const { precioMin, precioMax, categoria, busqueda } = filtrosActuales;
    const b = (busqueda || '').toLowerCase();
    return (
      p.precio >= precioMin &&
      p.precio <= precioMax &&
      (categoria === 'todos' || p.categoria === categoria) &&
      (!b || p.nombre.toLowerCase().includes(b) || p.descripcion.toLowerCase().includes(b))
    );
  });
}

function prewarmImages(lista) {
  try {
    lista.forEach(p => {
      (p.imagenes || []).slice(0, 2).forEach(src => {
        const im = new Image();
        im.decoding = 'async';
        im.src = src;
      });
    });
  } catch {}
}

function renderizarProductos() {
  const filtrados = filtrarProductos();
  const inicio = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
  const paginados = filtrados.slice(inicio, inicio + PRODUCTOS_POR_PAGINA);

  if (!elementos.galeriaProductos) return;

  elementos.galeriaProductos.innerHTML = paginados.length === 0
    ? '<p class="sin-productos">No se encontraron productos.</p>'
    : paginados.map(crearCardProducto).join('');

  prewarmImages(paginados);
  renderizarPaginacion(filtrados.length);
}

function renderizarPaginacion(total) {
  const pages = Math.ceil(total / PRODUCTOS_POR_PAGINA);
  if (!elementos.paginacion) return;
  if (pages <= 1) return (elementos.paginacion.innerHTML = '');
  elementos.paginacion.innerHTML = Array.from({ length: pages }, (_, i) => i + 1).map(page => `
    <button class="${page === paginaActual ? 'active' : ''}" onclick="cambiarPagina(${page})">${page}</button>
  `).join('');
}

window.cambiarPagina = function (page) {
  paginaActual = page;
  renderizarProductos();
  const targetTop = (elementos.galeriaProductos?.offsetTop || 0) - 100;
  if (window.scrollY + 10 < targetTop) window.scrollTo({ top: targetTop, behavior: 'smooth' });
};

// ===============================
// MODAL DE PRODUCTO
// ===============================
function ensureProductModal() {
  if (!getElement('producto-modal')) {
    const modal = document.createElement('div');
    modal.id = 'producto-modal';
    modal.className = 'modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `<div class="modal-contenido-producto" id="modal-contenido"></div>`;
    document.body.appendChild(modal);
  }
  elementos.productoModal = getElement('producto-modal');
  elementos.modalContenido = getElement('modal-contenido');

  elementos.productoModal.addEventListener('click', (e) => {
    if (e.target === elementos.productoModal) cerrarModal();
  });
  elementos.modalContenido.addEventListener('click', (e) => e.stopPropagation());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elementos.productoModal.classList.contains('visible')) cerrarModal();
  });
}

function mostrarModalProducto(producto) {
  ensureProductModal();
  const cont = elementos.modalContenido;
  if (!elementos.productoModal || !cont) return;

  let currentIndex = 0;

  const render = () => {
    const disponibles = Math.max(0, producto.stock || 0);
    const agotado = disponibles <= 0;

    cont.innerHTML = `
      <button class="cerrar-modal" aria-label="Cerrar modal" onclick="cerrarModal()">&times;</button>
      <div class="modal-flex">
        <div class="modal-carrusel">
          <img id="modal-imagen" src="${producto.imagenes[currentIndex] || PLACEHOLDER_IMAGE}" class="modal-img" alt="${producto.nombre}">
          <div class="modal-thumbnails">
            ${producto.imagenes.map((img, i) => `
              <img src="${img}" class="thumbnail ${i === currentIndex ? 'active' : ''}" data-index="${i}" alt="Miniatura ${i + 1}">
            `).join('')}
          </div>
        </div>
        <div class="modal-info">
          <h1 class="modal-nombre">${producto.nombre}</h1>
          <p class="modal-precio">$U ${producto.precio.toLocaleString('es-UY')}</p>

          <div class="modal-descripcion">
            ${producto.descripcion ? `<p>${producto.descripcion}</p>` : ''}
            ${producto.adicionales ? `<p><b>Adicionales:</b> ${producto.adicionales}</p>` : ''}
            ${(producto.alto || producto.ancho || producto.profundidad)
              ? `<p><b>Medidas:</b> ${[producto.alto, producto.ancho, producto.profundidad].filter(Boolean).join(' x ')} cm</p>`
              : ''}
          </div>

          <p class="modal-stock ${agotado ? 'agotado' : 'disponible'}">${agotado ? 'AGOTADO' : `Disponible: ${disponibles}`}</p>

          <div class="modal-acciones">
            <input type="number" value="1" min="1" max="${disponibles}" class="cantidad-modal-input" ${agotado ? 'disabled' : ''}>
            <button class="boton-agregar-modal ${agotado ? 'agotado' : ''}" data-id="${producto.id}" ${agotado ? 'disabled' : ''}>
              ${agotado ? 'Agotado' : 'Agregar al carrito'}
            </button>
          </div>
        </div>
      </div>
    `;

    const imgGrande = cont.querySelector('#modal-imagen');
    imgGrande?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!producto.imagenes || producto.imagenes.length <= 1) return;
      currentIndex = (currentIndex + 1) % producto.imagenes.length;
      render();
    });

    cont.querySelectorAll('.thumbnail').forEach(th =>
      th.addEventListener('click', (e) => {
        e.stopPropagation();
        currentIndex = parseInt(e.currentTarget.dataset.index, 10);
        render();
      })
    );

    cont.querySelector('.boton-agregar-modal')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(e.currentTarget.dataset.id, 10);
      const qty = parseInt(cont.querySelector('.cantidad-modal-input').value, 10);
      agregarAlCarrito(id, qty, e.currentTarget);
    });
  };

  render();
  elementos.productoModal.classList.add('visible');
  elementos.productoModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');
}

function cerrarModal() {
  if (elementos.productoModal) {
    elementos.productoModal.classList.remove('visible');
    elementos.productoModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
  }
}
window.cerrarModal = cerrarModal;

// ===============================
// AGREGAR AL CARRITO
// ===============================
async function agregarAlCarrito(id, cantidad = 1, boton = null) {
  if (inFlightAdds.has(id)) return;
  inFlightAdds.add(id);

  if (!Number.isFinite(id) || id <= 0) { inFlightAdds.delete(id); return mostrarNotificacion('ID de producto inválido', 'error'); }
  const producto = productos.find(p => p.id === id);
  if (!producto) { inFlightAdds.delete(id); return mostrarNotificacion('Producto no encontrado', 'error'); }

  const cantidadAgregar = Math.max(1, parseInt(cantidad, 10));
  if (!Number.isFinite(cantidadAgregar)) { inFlightAdds.delete(id); return mostrarNotificacion('Cantidad inválida', 'error'); }

  if (boton) {
    if (busyButtons.has(boton)) { inFlightAdds.delete(id); return; }
    busyButtons.add(boton);
    boton.disabled = true;
    boton._oldHTML = boton.innerHTML;
    boton.innerHTML = 'Agregando <span class="spinner"></span>';
  }

  if ((producto.stock || 0) < cantidadAgregar) {
    if (boton) { boton.disabled = false; boton.innerHTML = boton._oldHTML; busyButtons.delete(boton); }
    inFlightAdds.delete(id);
    return mostrarNotificacion('Stock insuficiente', 'error');
  }

  try {
    const productRef = ref(db, `productos/${id}/stock`);
    const { committed } = await runTransaction(productRef, (stock) => {
      stock = stock || 0;
      if (stock < cantidadAgregar) return;
      return stock - cantidadAgregar;
    });

    if (!committed) throw new Error('Stock insuficiente o cambiado por otro usuario');

    suprimirRealtime++;
    producto.stock = Math.max(0, (producto.stock || 0) - cantidadAgregar);

    const enCarrito = carrito.find(item => item.id === id);
    if (enCarrito) enCarrito.cantidad += cantidadAgregar;
    else carrito.push({
      id: producto.id,
      nombre: producto.nombre,
      precio: producto.precio,
      cantidad: cantidadAgregar,
      imagen: (producto.imagenes && producto.imagenes[0]) || PLACEHOLDER_IMAGE
    });

    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion('Producto agregado al carrito', 'exito');
  } catch (error) {
    console.error('Error al agregar al carrito:', error);
    mostrarNotificacion('Error al agregar al carrito', 'error');
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.innerHTML = boton._oldHTML;
      busyButtons.delete(boton);
    }
    inFlightAdds.delete(id);
  }
}

// ===============================
// UI / FILTROS
// ===============================
function actualizarCategorias() {
  if (!elementos.selectCategoria) return;
  const cats = ['todos', ...new Set(productos.map(p => p.categoria).sort())];
  elementos.selectCategoria.innerHTML = cats.map(cat => `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`).join('');
  elementos.selectCategoria.value = filtrosActuales.categoria;
}
function actualizarUI() {
  renderizarCarrito();
  actualizarContadorCarrito();
}
function aplicarFiltros() {
  paginaActual = 1;
  renderizarProductos();
}

// ===============================
// EVENTOS
// ===============================
function initEventos() {
  elementos.carritoBtnMain?.addEventListener('click', () => toggleCarrito(true));
  elementos.carritoOverlay?.addEventListener('click', () => toggleCarrito(false));
  elementos.btnCerrarCarrito?.addEventListener('click', () => toggleCarrito(false));

  elementos.btnVaciarCarrito?.addEventListener('click', vaciarCarrito);

  elementos.inputBusqueda?.addEventListener('input', (e) => {
    filtrosActuales.busqueda = e.target.value.toLowerCase().trim();
    aplicarFiltros();
  });
  elementos.selectCategoria?.addEventListener('change', (e) => {
    filtrosActuales.categoria = e.target.value.trim();
    aplicarFiltros();
  });

  const galeria = elementos.galeriaProductos;
  if (galeria) {
    if (galeria._pfHandler) galeria.removeEventListener('click', galeria._pfHandler);
    const handler = (e) => {
      const target = e.target.closest('.boton-detalles, .boton-agregar, .boton-aviso-stock');
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();

      const card = target.closest('.producto-card');
      const id = parseInt(card?.dataset?.id, 10);
      const producto = productos.find(p => p.id === id);
      if (!producto) return;

      if (target.classList.contains('boton-detalles')) {
        mostrarModalProducto(producto);
      } else if (target.classList.contains('boton-agregar')) {
        agregarAlCarrito(id, 1, target);
      } else if (target.classList.contains('boton-aviso-stock')) {
        preguntarStock(producto.nombre);
      }
    };
    galeria.addEventListener('click', handler, { passive: false });
    galeria._pfHandler = handler;
  }
}

// ===============================
// OTRAS
// ===============================
function preguntarStock(nombre) {
  const asunto = encodeURIComponent(`Consulta sobre disponibilidad de "${nombre}"`);
  const cuerpo = encodeURIComponent(`Hola Patofelting,\n\nMe gustaría saber cuándo estará disponible el producto: ${nombre}\n\nSaludos,\n[Tu nombre]`);
  window.location.href = `mailto:patofelting@gmail.com?subject=${asunto}&body=${cuerpo}`;
}

// ===============================
// INIT
// ===============================
document.addEventListener('DOMContentLoaded', async () => {
  // Inyectar CSS del badge (si no existe)
  if (!document.getElementById('pf-restock-badge-css')) {
    const style = document.createElement('style');
    style.id = 'pf-restock-badge-css';
    style.textContent = BADGE_CSS;
    document.head.appendChild(style);
  }

  try {
    await signInAnonymously(auth);
    console.log('✅ Signed in anonymously to Firebase.');
    cargarProductosDesdeFirebase();
  } catch (error) {
    console.error('❌ Error signing in:', error);
    let msg = 'Error de autenticación con Firebase.';
    if (error.code === 'auth/configuration-not-found') msg = 'Autenticación anónima no habilitada.';
    else if (error.code === 'auth/network-request-failed') msg = 'Error de red.';
    mostrarNotificacion(msg, 'error');
  }

  cargarCarrito();
  ensureProductModal();
  initEventos();
});

window.agregarAlCarrito = agregarAlCarrito;
window.preguntarStock = preguntarStock;
