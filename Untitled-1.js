// ===============================
// CONFIGURACIÓN GLOBAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const PLACEHOLDER_IMAGE =
  window.PLACEHOLDER_IMAGE ||
  'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

// --- Ventana de visibilidad para cinta "nuevo" ---
const BACK_IN_STOCK_DUR_MS = 1000 * 60 * 60 * 24 * 5; // 5 días (ajustable)

// Estilos de la cinta (inyectados por JS para no editar CSS)
const RIBBON_CSS = `
.producto-card .ribbon {
  position: absolute;
  top: 14px;
  left: -44px;
  transform: rotate(-45deg);
  background: linear-gradient(135deg, #7ed957, #53b44b);
  color: #fff;
  padding: 8px 48px;
  font-weight: 800;
  font-size: 0.85rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  box-shadow: 0 6px 12px rgba(0,0,0,0.15);
  border-radius: 4px;
  text-shadow: 0 1px 0 rgba(0,0,0,0.25);
  z-index: 5;
  pointer-events: none;
}
.producto-card .ribbon.ribbon-back {
  background: linear-gradient(135deg, #7ed957, #45a13f);
}
@media (max-width: 600px) {
  .producto-card .ribbon { top: 10px; left: -38px; padding: 6px 40px; font-size: 0.78rem; border-radius: 3px; }
}
`;

// Firebase v10+ (SDK modular)
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, runTransaction, onValue, get, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Añade analytics a tus imports existentes
import { getAnalytics, logEvent, setAnalyticsCollectionEnabled } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";

const db = window.firebaseDatabase || getDatabase(window.firebaseApp);
const auth = getAuth(window.firebaseApp);

// ===============================
// INICIALIZACIÓN DE ANALYTICS
// ===============================
let analytics = null;
try {
    if (window.firebaseApp) {
        analytics = getAnalytics(window.firebaseApp);
        setAnalyticsCollectionEnabled(analytics, true);
        console.log('📊 Firebase Analytics inicializado');
    }
} catch (error) {
    console.warn('⚠️ No se pudo inicializar Analytics:', error);
}

function registrarEventoAnalytics(nombreEvento, parametros = {}) {
    if (!analytics) return;
    try {
        logEvent(analytics, nombreEvento, parametros);
        console.log(`📊 Evento registrado: ${nombreEvento}`, parametros);
    } catch (error) {
        console.warn('Error Analytics:', error);
    }
}

// ===============================
// ESTADO GLOBAL
// ===============================
let productos = [];
let carrito = [];
let paginaActual = 1;

// Candados para evitar dobles acciones
const busyButtons   = new WeakSet(); // doble click en el mismo botón
const inFlightAdds  = new Set();     // mismo producto agregado 2 veces en paralelo
let suprimirRealtime = 0;            // silencia 1+ ticks del listener para evitar "pestañeo"

// Map: id -> key real en Firebase (IMPORTANTÍSIMO)
const keyById = {}; // ej: { 12: "-Nabc123..." } o { 12: "12" }

// ===============================
// FILTROS
// ===============================
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

// Referencias DOM
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

const toNum = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const s = String(v).replace(',', '.').trim();
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
};

function getDbKeyFromId(id) {
  // fallback: si tu Firebase usa la key = id, esto sigue funcionando
  return keyById[id] ?? String(id);
}

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

// ✅ VACÍA CARRITO + repone stock en Firebase + actualiza stock local
async function vaciarCarrito() {
  if (carrito.length === 0) return mostrarNotificacion('El carrito ya está vacío', 'info');

  const n = carrito.length;

  try {
    await Promise.all(
      carrito.map(async (item) => {
        const key = getDbKeyFromId(item.id);
        const productRef = ref(db, `productos/${key}/stock`);
        await runTransaction(productRef, (s) => (s || 0) + item.cantidad);

        // ✅ actualizar stock local para que se vea ya
        const p = productos.find(x => x.id === item.id);
        if (p) p.stock = (p.stock || 0) + item.cantidad;
      })
    );

    // ✅ suprime tantos ticks como items (evita parpadeo)
    suprimirRealtime = Math.max(suprimirRealtime, n);

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
    elementos.galeriaProductos.innerHTML = '<p class="error-carga">No se pudieron cargar los productos.</p>';
  } finally {
    if (elementos.productLoader) {
      elementos.productLoader.style.display = 'none';
      elementos.productLoader.hidden = true;
    }
  }
}

// ===============================
// NORMALIZAR + CINTA SOLO PARA "PRODUCTO NUEVO DESDE SHEETS"
// ===============================
function procesarDatosProductos(data) {
  const now = Date.now();

  // reset map id->key en cada snapshot para que no quede basura
  for (const k in keyById) delete keyById[k];

  productos = Object.entries(data || {}).map(([key, p]) => {
    if (typeof p !== 'object' || !p) return null;

    const alto = toNum(p.alto);
    const ancho = toNum(p.ancho);
    const profundidad = toNum(p.profundidad);

    const stockRaw = (p.stock !== undefined ? p.stock : p.cantidad);
    const stock = Math.max(0, parseInt(String(stockRaw).replace(',', '.'), 10) || 0);

    const adic = (p.adicionales || '').toString().trim();
    const adicionales = (adic && adic !== '-' && adic !== '–') ? adic : '';

    const id = parseInt(p.id ?? key, 10);
    if (!Number.isFinite(id)) return null;

    const nombre = (p.nombre || 'Sin nombre').trim();

    // ✅ SOLO "nuevo desde Sheets": campo nuevoAt (timestamp number)
    const nuevoAt = toNum(p.nuevoAt);

    // Limpieza automática después de 5 días (solo para nuevos)
    if (nuevoAt && (now - nuevoAt) >= BACK_IN_STOCK_DUR_MS) {
      // ojo: usar KEY real, NO id
      update(ref(db, `productos/${key}`), { nuevoAt: null }).catch(() => {});
    }

    // ✅ IMPORTANTE: stock > 0 (no > 1)
    const esNuevoReciente = stock > 0 && nuevoAt && (now - nuevoAt) < BACK_IN_STOCK_DUR_MS;

    // guardar mapping id -> key real
    keyById[id] = key;

    return {
      _key: key, // key real en firebase
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
      backInStock: !!esNuevoReciente, // reutilizamos el nombre para no tocar CSS/HTML
      nuevoAt
    };
  }).filter(Boolean).sort((a, b) => a.id - b.id);
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

  // Handlers +/- (reemplazados en cada render; no se duplican)
  elementos.listaCarrito.querySelectorAll('.disminuir-cantidad').forEach(btn => {
    btn.onclick = async (e) => {
      const id = parseInt(e.currentTarget.dataset.id);
      const item = carrito.find(i => i.id === id);
      if (item && item.cantidad > 1) {
        try {
          const key = getDbKeyFromId(id);
          await runTransaction(ref(db, `productos/${key}/stock`), (s) => (s || 0) + 1);
          suprimirRealtime++; // evita pestañeo del onValue
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

  const ribbonHTML = (!agot && p.backInStock)
    ? `<span class="ribbon ribbon-back">¡De nuevo en stock!</span>`
    : '';

  return `
    <div class="producto-card ${agot ? 'agotado' : ''}" data-id="${p.id}">
      ${ribbonHTML}
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

// pre-carga liviana para que las imágenes aparezcan antes
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

  elementos.galeriaProductos.innerHTML = paginados.length === 0
    ? '<p class="sin-productos">No se encontraron productos.</p>'
    : paginados.map(crearCardProducto).join('');

  prewarmImages(paginados); // acelera percepción de carga
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
  const targetTop = elementos.galeriaProductos.offsetTop - 100;
  if (window.scrollY + 10 < targetTop) window.scrollTo({ top: targetTop, behavior: 'smooth' });
};

// ===============================
// MODAL DE PRODUCTO (click imagen = siguiente; overlay cierra)
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

  // Cierra solo si clicas el overlay
  elementos.productoModal.addEventListener('click', (e) => {
    if (e.target === elementos.productoModal) cerrarModal();
  });
  // El contenido no propaga (nunca cierra)
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

    // Cambiar imagen con click en la grande (no cierra)
    const imgGrande = cont.querySelector('#modal-imagen');
    imgGrande?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!producto.imagenes || producto.imagenes.length <= 1) return;
      currentIndex = (currentIndex + 1) % producto.imagenes.length;
      render();
    });

    cont.querySelectorAll('.thumbnail').forEach(th => th.addEventListener('click', (e) => {
      e.stopPropagation();
      currentIndex = parseInt(e.currentTarget.dataset.index);
      render();
    }));

    cont.querySelector('.boton-agregar-modal')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = parseInt(e.currentTarget.dataset.id);
      const qty = parseInt(cont.querySelector('.cantidad-modal-input').value);
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
// AGREGAR AL CARRITO (MODIFICADA PARA INCLUIR ANALYTICS)
// ===============================
async function agregarAlCarrito(id, cantidad = 1, boton = null) {
  // Bloqueo por producto (idempotente ante handlers duplicados)
  if (inFlightAdds.has(id)) return;
  inFlightAdds.add(id);

  if (!Number.isFinite(id) || id <= 0) { inFlightAdds.delete(id); return mostrarNotificacion('ID de producto inválido', 'error'); }

  const producto = productos.find(p => p.id === id);
  if (!producto) { inFlightAdds.delete(id); return mostrarNotificacion('Producto no encontrado', 'error'); }

  const cantidadAgregar = Math.max(1, parseInt(cantidad));
  if (!Number.isFinite(cantidadAgregar)) { inFlightAdds.delete(id); return mostrarNotificacion('Cantidad inválida', 'error'); }

  // Candado del botón concreto
  if (boton) {
    if (busyButtons.has(boton)) { inFlightAdds.delete(id); return; }
    busyButtons.add(boton);
    boton.disabled = true;
    boton._oldHTML = boton.innerHTML;
    boton.innerHTML = 'Agregando <span class="spinner"></span>';
  }

  // Chequeo con stock remoto actual (local)
  if ((producto.stock || 0) < cantidadAgregar) {
    if (boton) { boton.disabled = false; boton.innerHTML = boton._oldHTML; busyButtons.delete(boton); }
    inFlightAdds.delete(id);
    return mostrarNotificacion('Stock insuficiente', 'error');
  }

  try {
    const key = getDbKeyFromId(id);
    const productRef = ref(db, `productos/${key}/stock`);

    const { committed } = await runTransaction(productRef, (stock) => {
      stock = stock || 0;
      if (stock < cantidadAgregar) return; // aborta transacción
      return stock - cantidadAgregar;
    });

    if (!committed) throw new Error('Stock insuficiente o cambiado por otro usuario');

    // Feedback inmediato local + evitar pestañeo del onValue
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
    
    // 📊 REGISTRAR EVENTO DE ANALYTICS
    registrarEventoAnalytics('add_to_cart', {
      item_id: id.toString(),
      item_name: producto.nombre,
      quantity: cantidadAgregar,
      price: producto.precio,
      currency: 'UYU'
    });
    
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

function resetearFiltros() {
  filtrosActuales = { precioMin: 0, precioMax: 3000, categoria: 'todos', busqueda: '' };
  if (elementos.inputBusqueda) elementos.inputBusqueda.value = '';
  if (elementos.selectCategoria) elementos.selectCategoria.value = 'todos';
  if (elementos.precioMinInput) elementos.precioMinInput.value = '0';
  if (elementos.precioMaxInput) elementos.precioMaxInput.value = '3000';
  updateRange();
  aplicarFiltros();
}

// ===============================
// INICIALIZACIONES ESPECÍFICAS
// ===============================
function inicializarFAQ() {
  document.querySelectorAll('.faq-toggle').forEach(toggle => {
    toggle.onclick = () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', !expanded);
      toggle.nextElementSibling.hidden = expanded;
    };
  });
}

function inicializarMenuHamburguesa() {
  const hamburguesa = elementos.hamburguesa;
  const menu = elementos.menu;
  if (!hamburguesa || !menu) return;

  hamburguesa.onclick = () => {
    const expanded = menu.classList.toggle('active');
    hamburguesa.setAttribute('aria-expanded', expanded);
    document.body.classList.toggle('no-scroll', expanded);
  };
  menu.querySelectorAll('a').forEach(link => link.onclick = () => {
    menu.classList.remove('active');
    hamburguesa.setAttribute('aria-expanded', false);
    document.body.classList.remove('no-scroll');
  });
}

function setupContactForm() {
  const form = getElement('formulario-contacto');
  if (!form || !window.emailjs) return;

  emailjs.init("o4IxJz0Zz-LQ8jYKG");
  form.onsubmit = (e) => {
    e.preventDefault();
    const nombre = getElement('nombre').value;
    const email = getElement('email').value;
    const mensaje = getElement('mensaje').value;

    emailjs.send('service_89by24g', 'template_8mn7hdp', { from_name: nombre, from_email: email, message: mensaje })
      .then(() => {
        getElement('successMessage').classList.remove('hidden');
        form.reset();
        setTimeout(() => getElement('successMessage').classList.add('hidden'), 3000);
      }, (error) => {
        console.error('Error al enviar email:', error);
        const errorMsg = getElement('errorMessage');
        errorMsg.textContent = 'Error al enviar el mensaje. Intenta de nuevo.';
        errorMsg.classList.remove('hidden');
        setTimeout(() => errorMsg.classList.add('hidden'), 3000);
      });
  };
}

// ===============================
// EVENTOS Y DELEGACIÓN
// ===============================
function initEventos() {
  elementos.carritoBtnMain?.addEventListener('click', () => {
    toggleCarrito(true);
    // 📊 REGISTRAR EVENTO DE ANALYTICS
    registrarEventoAnalytics('view_cart', {
      item_count: carrito.length,
      total_value: carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0)
    });
  });
  
  elementos.carritoOverlay?.addEventListener('click', () => toggleCarrito(false));
  elementos.btnCerrarCarrito?.addEventListener('click', () => toggleCarrito(false));

  getElement('select-envio')?.addEventListener('change', actualizarResumenPedido);
  elementos.btnVaciarCarrito?.addEventListener('click', vaciarCarrito);

  elementos.btnFinalizarCompra?.addEventListener('click', () => {
    if (carrito.length === 0) return mostrarNotificacion('El carrito está vacío', 'error');
    
    // 📊 REGISTRAR EVENTO DE ANALYTICS
    registrarEventoAnalytics('begin_checkout', {
      items: carrito.map(item => ({
        item_id: item.id.toString(),
        item_name: item.nombre,
        quantity: item.cantidad,
        price: item.precio
      })),
      value: carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0)
    });
    
    elementos.avisoPreCompraModal.style.display = 'flex';
    elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'false');
  });

  elementos.btnEntendidoAviso?.addEventListener('click', () => {
    elementos.avisoPreCompraModal.style.display = 'none';
    elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'true');
    const modalEnvio = getElement('modal-datos-envio');
    if (modalEnvio) {
      modalEnvio.style.display = 'flex';
      modalEnvio.classList.add('visible');
      modalEnvio.removeAttribute('hidden');
      actualizarResumenPedido();
    }
  });

  elementos.btnCancelarAviso?.addEventListener('click', () => {
    elementos.avisoPreCompraModal.style.display = 'none';
    elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'true');
  });

  elementos.inputBusqueda?.addEventListener('input', (e) => {
    filtrosActuales.busqueda = e.target.value.toLowerCase().trim();
    aplicarFiltros();
  });

  elementos.selectCategoria?.addEventListener('change', (e) => {
    filtrosActuales.categoria = e.target.value.trim();
    aplicarFiltros();
    
    // 📊 REGISTRAR EVENTO DE ANALYTICS
    registrarEventoAnalytics('select_filter', {
      filter_type: 'category',
      filter_value: e.target.value
    });
  });

  elementos.precioMinInput?.addEventListener('input', updateRange);
  elementos.precioMaxInput?.addEventListener('input', updateRange);

  elementos.aplicarRangoBtn?.addEventListener('click', () => {
    filtrosActuales.precioMin = parseInt(elementos.precioMinInput.value) || 0;
    filtrosActuales.precioMax = parseInt(elementos.precioMaxInput.value) || 3000;
    aplicarFiltros();
  });

  // Delegación en la galería (evitamos duplicados)
  const galeria = elementos.galeriaProductos;
  if (galeria) {
    if (galeria._pfHandler) galeria.removeEventListener('click', galeria._pfHandler);

    const handler = (e) => {
      const target = e.target.closest('.boton-detalles, .boton-agregar, .boton-aviso-stock');
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();

      const card = target.closest('.producto-card');
      const id = parseInt(card?.dataset?.id);
      const producto = productos.find(p => p.id === id);
      if (!producto) return;

      if (target.classList.contains('boton-detalles')) {
        mostrarModalProducto(producto);
        // 📊 REGISTRAR EVENTO DE ANALYTICS
        registrarEventoAnalytics('view_item', {
          item_id: id.toString(),
          item_name: producto.nombre,
          price: producto.precio,
          currency: 'UYU'
        });
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
// RESUMEN Y ENVÍO
// ===============================
function actualizarResumenPedido() {
  const resumenProductos = getElement('resumen-productos');
  const resumenTotal = getElement('resumen-total');
  if (!resumenProductos || !resumenTotal) return;

  if (carrito.length === 0) {
    resumenProductos.innerHTML = '<p class="carrito-vacio">No hay productos en el carrito</p>';
    resumenTotal.textContent = '$U 0';
    return;
  }

  let html = '';
  let subtotal = 0;

  carrito.forEach(item => {
    const itemTotal = item.precio * item.cantidad;
    subtotal += itemTotal;
    html += `
      <div class="resumen-item">
        <span>${item.nombre} x${item.cantidad}</span>
        <span>$U ${itemTotal.toLocaleString('es-UY')}</span>
      </div>
    `;
  });

  const envioSelect = getElement('select-envio');
  const metodo = envioSelect?.value || 'retiro';
  let costoEnvio = metodo === 'montevideo' ? 200 : metodo === 'interior' ? 250 : 0;

  html += `
    <div class="resumen-item resumen-subtotal">
      <span>Subtotal:</span>
      <span>$U ${subtotal.toLocaleString('es-UY')}</span>
    </div>
    ${metodo !== 'retiro' ? `
      <div class="resumen-item resumen-envio">
        <span>Envío (${metodo === 'montevideo' ? 'Montevideo' : 'Interior'}):</span>
        <span>$U ${costoEnvio.toLocaleString('es-UY')}</span>
      </div>` : ''}
  `;

  resumenProductos.innerHTML = html;
  const total = subtotal + costoEnvio;
  resumenTotal.textContent = `$U ${total.toLocaleString('es-UY')}`;

  const grupoDireccion = getElement('grupo-direccion');
  const inputDireccion = getElement('input-direccion');
  if (grupoDireccion && inputDireccion) {
    grupoDireccion.style.display = metodo === 'retiro' ? 'none' : 'flex';
    inputDireccion.required = metodo !== 'retiro';
  }
}

getElement('btn-cerrar-modal-envio')?.addEventListener('click', () => {
  const modal = getElement('modal-datos-envio');
  modal.classList.remove('visible');
  setTimeout(() => modal.style.display = 'none', 300);
});

let enviandoPedido = false;

// ===============================
// FORMULARIO DE ENVÍO CON MERCADO PAGO
// ===============================
getElement('form-envio')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (enviandoPedido) return;
  enviandoPedido = true;

  // Mostrar estado de carga en el botón
  const btnSubmit = e.target.querySelector('button[type="submit"]');
  const textoOriginal = btnSubmit?.innerHTML;
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = 'Procesando... <span class="spinner"></span>';
  }

  const nombre    = getElement('input-nombre').value.trim();
  const apellido  = getElement('input-apellido').value.trim();
  const telefono  = getElement('input-telefono').value.trim();
  const envio     = getElement('select-envio').value;
  const direccion = envio !== 'retiro' ? getElement('input-direccion').value.trim() : '';
  const notas     = getElement('input-notas').value.trim();

  // Validaciones
  if (!nombre || !apellido || !telefono || (envio !== 'retiro' && !direccion)) {
    mostrarNotificacion('Complete todos los campos obligatorios', 'error');
    if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = textoOriginal; }
    enviandoPedido = false;
    return;
  }

  // Revalidar stock local
  for (const item of carrito) {
    const prod = productos.find(p => p.id === item.id);
    if (!prod || prod.stock < 0) {
      mostrarNotificacion(`Stock insuficiente para "${item?.nombre || 'un producto'}"`, 'error');
      if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = textoOriginal; }
      enviandoPedido = false;
      return;
    }
  }

  try {
    // ─────────────────────────────────────────────
    // Llamar a la Serverless Function en Vercel
    // ─────────────────────────────────────────────
    const response = await fetch('/api/crear-preferencia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        carrito,
        datosCliente: { nombre, apellido, telefono, envio, direccion, notas },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Error del servidor: ${response.status}`);
    }

    const { url, url_sandbox } = await response.json();

    // 📊 Analytics
    registrarEventoAnalytics('purchase_redirect', {
      items: carrito.map(item => ({
        item_id:   item.id.toString(),
        item_name: item.nombre,
        quantity:  item.cantidad,
        price:     item.precio,
      })),
      value:    carrito.reduce((sum, item) => sum + item.precio * item.cantidad, 0),
      currency: 'UYU',
    });

    // Cerrar modal
    const modal = getElement('modal-datos-envio');
    modal?.classList.remove('visible');
    setTimeout(() => { if (modal) modal.style.display = 'none'; }, 300);

    // Limpiar carrito localmente (el stock ya fue descontado al agregar)
    carrito = [];
    guardarCarrito();
    actualizarUI();
    getElement('form-envio').reset();

    mostrarNotificacion('Redirigiendo a Mercado Pago...', 'exito');

    // ─────────────────────────────────────────────
    // Redirigir a Mercado Pago
    // Usá url_sandbox para pruebas, url para producción
    // ─────────────────────────────────────────────
    const esSandbox = false; // ← cambiá a true para pruebas
    setTimeout(() => {
      window.location.href = esSandbox ? url_sandbox : url;
    }, 800);

  } catch (error) {
    console.error('Error al procesar pago:', error);
    mostrarNotificacion(
      error.message || 'Error al conectar con Mercado Pago. Intentá de nuevo.',
      'error'
    );
    if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = textoOriginal; }
    enviandoPedido = false;
  }
});

// ===============================
// SLIDERS DE PRECIO
// ===============================
function updateRange() {
  const minSlider = elementos.precioMinInput;
  const maxSlider = elementos.precioMaxInput;
  const minPrice = getElement('min-price');
  const maxPrice = getElement('max-price');
  const range = document.querySelector('.range');
  const thumbMin = getElement('thumb-label-min');
  const thumbMax = getElement('thumb-label-max');

  if (!minSlider || !maxSlider || !minPrice || !maxPrice || !range || !thumbMin || !thumbMax) return;

  let minVal = parseInt(minSlider.value);
  let maxVal = parseInt(maxSlider.value);
  if (minVal > maxVal) [minVal, maxVal] = [maxVal, minVal];

  minSlider.value = minVal;
  maxSlider.value = maxVal;

  const sliderMax = parseInt(minSlider.max);
  const sliderWidth = minSlider.offsetWidth;

  // Actualizar posición del rango
  range.style.left = (minVal / sliderMax * 100) + '%';
  range.style.width = ((maxVal - minVal) / sliderMax * 100) + '%';

  // Actualizar etiquetas de precio
  minPrice.textContent = `$U${minVal}`;
  maxPrice.textContent = `$U${maxVal}`;

  // Actualizar globos (tooltips)
  thumbMin.textContent = `$U${minVal}`;
  thumbMax.textContent = `$U${maxVal}`;

  // Calcular posiciones de los globos
  const minPos = (minVal / sliderMax) * sliderWidth;
  const maxPos = (maxVal / sliderMax) * sliderWidth;

  thumbMin.style.left = `${minPos}px`;
  thumbMax.style.left = `${maxPos}px`;

  // Mostrar globos temporalmente al cambiar valores
  thumbMin.style.opacity = '1';
  thumbMax.style.opacity = '1';

  // Ocultar después de un tiempo
  setTimeout(() => {
    thumbMin.style.opacity = '0';
    thumbMax.style.opacity = '0';
  },  2000);
}

// Agregar event listeners para mostrar globos al interactuar
elementos.precioMinInput?.addEventListener('input', () => {
  const thumbMin = getElement('thumb-label-min');
  if (thumbMin) thumbMin.style.opacity = '1';
  updateRange();
});

elementos.precioMaxInput?.addEventListener('input', () => {
  const thumbMax = getElement('thumb-label-max');
  if (thumbMax) thumbMax.style.opacity = '1';
  updateRange();
});

// Mostrar globos al pasar el mouse sobre el slider
document.querySelector('.range-slider')?.addEventListener('mouseenter', () => {
  const thumbMin = getElement('thumb-label-min');
  const thumbMax = getElement('thumb-label-max');
  if (thumbMin) thumbMin.style.opacity = '1';
  if (thumbMax) thumbMax.style.opacity = '1';
});

// Ocultar globos al salir del slider
document.querySelector('.range-slider')?.addEventListener('mouseleave', () => {
  const thumbMin = getElement('thumb-label-min');
  const thumbMax = getElement('thumb-label-max');
  if (thumbMin) thumbMin.style.opacity = '0';
  if (thumbMax) thumbMax.style.opacity = '0';
});

// ===============================
// OTRAS
// ===============================
function preguntarStock(nombre) {
  const asunto = encodeURIComponent(`Consulta sobre disponibilidad de "${nombre}"`);
  const cuerpo = encodeURIComponent(`Hola Patofelting,\n\nMe gustaría saber cuándo estará disponible el producto: ${nombre}\n\nSaludos,\n[Tu nombre]`);
  window.location.href = `mailto:patofelting@gmail.com?subject=${asunto}&body=${cuerpo}`;
}

// ===============================
// CONTADOR DE VISITAS EN REALTIME DATABASE (BACKUP)
// ===============================
async function contarVisitaRealtimeDB() {
    try {
        const db = window.firebaseDatabase || getDatabase(window.firebaseApp);
        
        // Contador total de visitas
        const totalRef = ref(db, 'stats/visits');
        await runTransaction(totalRef, (current) => (current || 0) + 1);
        
        // Contador por día
        const today = new Date().toISOString().split('T')[0];
        const dailyRef = ref(db, `stats/daily/${today}`);
        await runTransaction(dailyRef, (current) => (current || 0) + 1);
        
        console.log('✅ Visita contada en Realtime Database');
    } catch (error) {
        console.warn('No se pudo contar visita:', error);
    }
}

// ===============================
// CONFIGURACIÓN DE EVENTOS DE BÚSQUEDA PARA ANALYTICS
// ===============================
function setupBusquedaAnalytics() {
    if (!elementos.inputBusqueda) return;
    
    let searchTimeout;
    elementos.inputBusqueda.addEventListener('input', function(e) {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            const term = e.target.value.trim();
            if (term.length >= 2) {
                registrarEventoAnalytics('search', {
                    search_term: term
                });
            }
        }, 1000);
    });
}

// ===============================
// DETECCIÓN DE RETORNO DE MERCADO PAGO
// ===============================
function detectarRetornoMercadoPago() {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('status') || params.get('collection_status');

  if (status === 'approved') {
    mostrarNotificacion('¡Pago aprobado! Tu pedido está confirmado 🎉', 'exito');
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (status === 'failure') {
    mostrarNotificacion('El pago fue rechazado. Podés intentarlo de nuevo.', 'error');
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (status === 'pending') {
    mostrarNotificacion('Tu pago está pendiente. Te avisaremos cuando se confirme.', 'info');
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

// ===============================
// INIT PRINCIPAL
// ===============================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await signInAnonymously(auth);
    console.log('✅ Signed in anonymously to Firebase.');
    
    // 📊 REGISTRAR EVENTOS INICIALES DE ANALYTICS
    if (analytics) {
      registrarEventoAnalytics('session_start');
      registrarEventoAnalytics('page_view', {
        page_title: document.title,
        page_location: window.location.href,
        page_path: window.location.pathname
      });
    }
    
    // CONTAR VISITA EN REALTIME DATABASE (BACKUP)
    contarVisitaRealtimeDB();
    
    // DETECTAR RETORNO DE MERCADO PAGO
    detectarRetornoMercadoPago();
    
    cargarProductosDesdeFirebase();
  } catch (error) {
    console.error('❌ Error signing in:', error);
    let msg = 'Error de autenticación con Firebase.';
    if (error.code === 'auth/configuration-not-found') msg = 'Autenticación anónima no habilitada.';
    else if (error.code === 'auth/network-request-failed') msg = 'Error de red.';
    mostrarNotificacion(msg, 'error');
  }

  // Inyectar estilos de la cinta si no existen
  if (!document.getElementById('pf-back-in-stock-ribbon-css')) {
    const style = document.createElement('style');
    style.id = 'pf-back-in-stock-ribbon-css';
    style.textContent = RIBBON_CSS;
    document.head.appendChild(style);
  }

  cargarCarrito();
  ensureProductModal();
  inicializarMenuHamburguesa();
  inicializarFAQ();
  setupContactForm();
  setupBusquedaAnalytics();
  initEventos();
  updateRange();
});

window.agregarAlCarrito = agregarAlCarrito;
window.preguntarStock = preguntarStock;
