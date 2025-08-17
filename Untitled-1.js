// ===============================
// CONFIGURACIÓN GLOBAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const PLACEHOLDER_IMAGE =
  window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

// Firebase v10+ (SDK modular)
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, runTransaction, onValue, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const db = window.firebaseDatabase || getDatabase(window.firebaseApp);
const auth = getAuth(window.firebaseApp);

// ===============================
// ESTADO GLOBAL
// ===============================
let productos = [];
let carrito = [];
let paginaActual = 1;

// Candados
const busyButtons   = new WeakSet();
const inFlightAdds  = new Set();
let suprimirRealtime = 0;

let filtrosActuales = { precioMin: 0, precioMax: 3000, categoria: 'todos', busqueda: '' };

// ===============================
// UTILIDADES
// ===============================
function mostrarNotificacion(mensaje, tipo = 'exito') {
  const noti = document.createElement('div');
  noti.className = `notificacion ${tipo}`;
  noti.textContent = mensaje;
  document.body.appendChild(noti);
  requestAnimationFrame(() => noti.classList.add('show'));
  setTimeout(() => { noti.classList.remove('show'); setTimeout(() => noti.remove(), 250); }, 2500);
}
const getElement = (id) => document.getElementById(id);

// Genera thumbnails de Imgur (mucho más livianos)
function imgurThumb(url, size = 'l') {
  try {
    const u = new URL(url);
    if (!/imgur\.com$/.test(u.hostname)) return url;
    const m = u.pathname.match(/\/([^/.]+)\.(jpg|jpeg|png|webp)$/i);
    if (!m) return url;
    return `${u.origin}/${m[1]}${size ? `_${size}` : ''}.${m[2]}`; // s,b,t,m,l,h
  } catch { return url; }
}
function toNum(v) {
  if (v == null) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const n = parseFloat(String(v).replace(',', '.').trim());
  return isFinite(n) ? n : null;
}

// ===============================
// REFERENCIAS DOM
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
  try { localStorage.setItem(LS_CARRITO_KEY, JSON.stringify(carrito)); actualizarContadorCarrito(); }
  catch (e) { console.error(e); mostrarNotificacion('Error al guardar el carrito', 'error'); }
}
function cargarCarrito() {
  try {
    carrito = JSON.parse(localStorage.getItem(LS_CARRITO_KEY) || '[]');
    actualizarContadorCarrito();
  } catch (e) { console.error(e); carrito = []; mostrarNotificacion('Error al cargar el carrito', 'error'); }
}
async function vaciarCarrito() {
  if (carrito.length === 0) return mostrarNotificacion('El carrito ya está vacío', 'info');
  try {
    await Promise.all(carrito.map(async (item) => {
      const p = productos.find(x => x.id === item.id);
      const key = p?.stockKey || 'stock';
      await runTransaction(ref(db, `productos/${item.id}/${key}`), (s) => (s || 0) + item.cantidad);
    }));
    suprimirRealtime += carrito.length;
    carrito = [];
    guardarCarrito(); renderizarCarrito(); renderizarProductos();
    mostrarNotificacion('Carrito vaciado y stock restaurado', 'exito');
  } catch (e) { console.error(e); mostrarNotificacion('Error al vaciar el carrito', 'error'); }
}
function actualizarContadorCarrito() {
  const total = carrito.reduce((sum, i) => sum + i.cantidad, 0);
  elementos.contadorCarrito?.classList.toggle('visible', total > 0);
  if (elementos.contadorCarrito) elementos.contadorCarrito.textContent = total;
}
function toggleCarrito(forceState) {
  if (!elementos.carritoPanel || !elementos.carritoOverlay) return;
  const isOpen = typeof forceState === 'boolean'
    ? forceState : !elementos.carritoPanel.classList.contains('active');
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
    if (elementos.productLoader) { elementos.productLoader.hidden = false; elementos.productLoader.style.display = 'flex'; }

    const snapshot = await get(productosRef);
    if (!snapshot.exists()) {
      elementos.galeriaProductos.innerHTML = '<p class="sin-productos">No hay productos disponibles.</p>';
    } else {
      procesarDatosProductos(snapshot.val());
      renderizarProductos(); actualizarCategorias(); actualizarUI();
    }

    if (!cargarProductosDesdeFirebase._listening) {
      onValue(productosRef, (snap) => {
        if (suprimirRealtime > 0) { suprimirRealtime--; return; }
        productos = [];
        if (snap.exists()) procesarDatosProductos(snap.val());
        renderizarProductos(); actualizarCategorias(); actualizarUI();
      }, (err) => { console.error('Listener productos error:', err); mostrarNotificacion('Error al recibir actualizaciones', 'error'); });
      cargarProductosDesdeFirebase._listening = true;
    }
  } catch (e) {
    console.error('Error al cargar productos:', e);
    elementos.galeriaProductos.innerHTML = '<p class="error-carga">No se pudieron cargar los productos.</p>';
    mostrarNotificacion('Error al cargar productos', 'error');
  } finally {
    if (elementos.productLoader) { elementos.productLoader.style.display = 'none'; elementos.productLoader.hidden = true; }
  }
}

function procesarDatosProductos(data) {
  productos = Object.entries(data || {}).map(([key, p]) => {
    if (typeof p !== 'object' || !p) return null;

    const alto = toNum(p.alto), ancho = toNum(p.ancho), profundidad = toNum(p.profundidad);

    // Soporta inventarios con "stock" o con "cantidad"
    const stockKey = (p.stock !== undefined) ? 'stock' : (p.cantidad !== undefined ? 'cantidad' : 'stock');
    const stockRaw = (p[stockKey] ?? 0);
    const stock = Math.max(0, parseInt(String(stockRaw).replace(',', '.'), 10) || 0);

    const adic = (p.adicionales || '').toString().trim();
    const adicionales = (adic && adic !== '-' && adic !== '–') ? adic : '';

    // Imágenes: thumbs (para cards) + full (para modal)
    const imgs = Array.isArray(p.imagenes) ? p.imagenes.filter(u => typeof u === 'string' && u.trim()) :
                 (p.imagen ? [p.imagen] : []);
    const imagenesFull  = imgs.length ? imgs : [PLACEHOLDER_IMAGE];
    const imagenesThumb = imagenesFull.map(u => imgurThumb(u, 'l'));

    return {
      id: parseInt(p.id || key, 10),
      nombre: (p.nombre || 'Sin nombre').trim(),
      descripcion: (p.descripcion || '').trim(),
      precio: parseFloat(String(p.precio).replace(',', '.')) || 0,
      stock, stockKey,
      imagenesFull, imagenesThumb,
      categoria: (p.categoria || 'otros').toLowerCase().trim(),
      estado: (p.estado || '').trim(),
      adicionales, alto, ancho, profundidad
    };
  }).filter(Boolean).sort((a,b)=>a.id-b.id);
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
            <img src="${item.imagen}" class="carrito-item-img" alt="${item.nombre}" loading="lazy" decoding="async">
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
          </li>`;
      }).join('');

  const total = carrito.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  elementos.totalCarrito.textContent = `Total: $U ${total.toLocaleString('es-UY')}`;

  elementos.listaCarrito.querySelectorAll('.disminuir-cantidad').forEach(btn => {
    btn.onclick = async (e) => {
      const id = parseInt(e.currentTarget.dataset.id);
      const item = carrito.find(i => i.id === id);
      const p = productos.find(x => x.id === id);
      if (item && item.cantidad > 1 && p) {
        try {
          await runTransaction(ref(db, `productos/${id}/${p.stockKey}`), (s) => (s || 0) + 1);
          suprimirRealtime++;
          p.stock = (p.stock || 0) + 1;
          item.cantidad--;
          guardarCarrito(); renderizarCarrito(); renderizarProductos();
          mostrarNotificacion(`Reducida cantidad de "${item.nombre}"`, 'info');
        } catch (err) { console.error(err); mostrarNotificacion('Error al actualizar cantidad', 'error'); }
      }
    };
  });
  elementos.listaCarrito.querySelectorAll('.aumentar-cantidad').forEach(btn => {
    btn.onclick = (e) => agregarAlCarrito(parseInt(e.currentTarget.dataset.id), 1, e.currentTarget);
  });
}

// ===============================
// GALERÍA + PAGINACIÓN + Lazy images
// ===============================
function crearCardProducto(p) {
  const disp = Math.max(0, p.stock || 0);
  const agot = disp <= 0;
  const thumb = (p.imagenesThumb && p.imagenesThumb[0]) || PLACEHOLDER_IMAGE;

  return `
    <div class="producto-card ${agot ? 'agotado' : ''}" data-id="${p.id}">
      <img src="${PLACEHOLDER_IMAGE}" data-src="${thumb}"
           class="producto-img lazy" alt="${p.nombre}"
           loading="lazy" decoding="async" fetchpriority="low">
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
    </div>`;
}

function filtrarProductos() {
  return productos.filter(p => {
    const { precioMin, precioMax, categoria, busqueda } = filtrosActuales;
    const b = (busqueda || '').toLowerCase();
    return p.precio >= precioMin && p.precio <= precioMax &&
      (categoria === 'todos' || p.categoria === categoria) &&
      (!b || p.nombre.toLowerCase().includes(b) || p.descripcion.toLowerCase().includes(b));
  });
}
function renderizarProductos() {
  const filtrados = filtrarProductos();
  const inicio = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
  const paginados = filtrados.slice(inicio, inicio + PRODUCTOS_POR_PAGINA);

  elementos.galeriaProductos.innerHTML = paginados.length === 0
    ? '<p class="sin-productos">No se encontraron productos.</p>'
    : paginados.map(crearCardProducto).join('');

  initLazyImages(); // <<<<<< cargador perezoso

  renderizarPaginacion(filtrados.length);
}
function renderizarPaginacion(total) {
  const pages = Math.ceil(total / PRODUCTOS_POR_PAGINA);
  if (!elementos.paginacion) return;
  if (pages <= 1) return (elementos.paginacion.innerHTML = '');
  elementos.paginacion.innerHTML = Array.from({ length: pages }, (_, i) => i + 1)
    .map(page => `<button class="${page === paginaActual ? 'active' : ''}" onclick="cambiarPagina(${page})">${page}</button>`).join('');
}
window.cambiarPagina = function (page) {
  paginaActual = page; renderizarProductos();
  const targetTop = elementos.galeriaProductos.offsetTop - 100;
  if (window.scrollY + 10 < targetTop) window.scrollTo({ top: targetTop, behavior: 'smooth' });
};

// Lazy loader muy liviano
let _io = null;
function initLazyImages() {
  const imgs = document.querySelectorAll('img.lazy[data-src]');
  if (!imgs.length) return;
  if (!_io) {
    _io = new IntersectionObserver((entries) => {
      entries.forEach(async (entry) => {
        if (!entry.isIntersecting) return;
        const img = entry.target;
        _io.unobserve(img);
        const src = img.getAttribute('data-src');
        if (!src) return;
        img.src = src;
        try { await img.decode(); img.classList.add('loaded'); } catch {}
        img.removeAttribute('data-src');
      });
    }, { rootMargin: '200px 0px' });
  }
  imgs.forEach(i => _io.observe(i));
}

// ===============================
// MODAL PRODUCTO
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

  elementos.productoModal.addEventListener('click', (e) => { if (e.target === elementos.productoModal) cerrarModal(); });
  elementos.modalContenido.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && elementos.productoModal.classList.contains('visible')) cerrarModal(); });
}

function mostrarModalProducto(producto) {
  ensureProductModal();
  const cont = elementos.modalContenido; if (!cont) return;

  let currentIndex = 0;
  const render = () => {
    const disponibles = Math.max(0, producto.stock || 0);
    const agotado = disponibles <= 0;
    const full = producto.imagenesFull[currentIndex] || PLACEHOLDER_IMAGE;

    cont.innerHTML = `
      <button class="cerrar-modal" aria-label="Cerrar modal" onclick="cerrarModal()">&times;</button>
      <div class="modal-flex">
        <div class="modal-carrusel">
          <img id="modal-imagen" src="${full}" class="modal-img" alt="${producto.nombre}" decoding="async" fetchpriority="high">
          <div class="modal-thumbnails">
            ${producto.imagenesThumb.map((img, i) => `
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
              ? `<p><b>Medidas:</b> ${[producto.alto, producto.ancho, producto.profundidad].filter(Boolean).join(' x ')} cm</p>` : ''}
          </div>
          <p class="modal-stock ${agotado ? 'agotado' : 'disponible'}">${agotado ? 'AGOTADO' : `Disponible: ${disponibles}`}</p>
          <div class="modal-acciones">
            <input type="number" value="1" min="1" max="${disponibles}" class="cantidad-modal-input" ${agotado ? 'disabled' : ''}>
            <button class="boton-agregar-modal ${agotado ? 'agotado' : ''}" data-id="${producto.id}" ${agotado ? 'disabled' : ''}>
              ${agotado ? 'Agotado' : 'Agregar al carrito'}
            </button>
          </div>
        </div>
      </div>`;

    cont.querySelector('#modal-imagen')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (producto.imagenesFull.length <= 1) return;
      currentIndex = (currentIndex + 1) % producto.imagenesFull.length;
      render();
    });
    cont.querySelectorAll('.thumbnail').forEach(th => th.addEventListener('click', (e) => {
      e.stopPropagation(); currentIndex = parseInt(e.currentTarget.dataset.index); render();
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
  elementos.productoModal?.classList.remove('visible');
  elementos.productoModal?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('no-scroll');
}
window.cerrarModal = cerrarModal;

// ===============================
// AGREGAR AL CARRITO
// ===============================
async function agregarAlCarrito(id, cantidad = 1, boton = null) {
  if (inFlightAdds.has(id)) return; // idempotente
  inFlightAdds.add(id);

  const producto = productos.find(p => p.id === id);
  if (!producto) { inFlightAdds.delete(id); return mostrarNotificacion('Producto no encontrado', 'error'); }

  const cantidadAgregar = Math.max(1, parseInt(cantidad));
  if (!Number.isFinite(cantidadAgregar)) { inFlightAdds.delete(id); return mostrarNotificacion('Cantidad inválida', 'error'); }

  if (boton) {
    if (busyButtons.has(boton)) { inFlightAdds.delete(id); return; }
    busyButtons.add(boton); boton.disabled = true;
    boton._oldHTML = boton.innerHTML; boton.innerHTML = 'Agregando <span class="spinner"></span>';
  }

  if ((producto.stock || 0) < cantidadAgregar) {
    if (boton) { boton.disabled = false; boton.innerHTML = boton._oldHTML; busyButtons.delete(boton); }
    inFlightAdds.delete(id);
    return mostrarNotificacion('Stock insuficiente', 'error');
  }

  try {
    const key = producto.stockKey || 'stock';
    const productRef = ref(db, `productos/${id}/${key}`);
    const { committed } = await runTransaction(productRef, (stock) => {
      stock = stock || 0;
      if (stock < cantidadAgregar) return; // abort
      return stock - cantidadAgregar;
    });
    if (!committed) throw new Error('Stock insuficiente o cambiado');

    suprimirRealtime++;
    producto.stock = Math.max(0, (producto.stock || 0) - cantidadAgregar);

    const enCarrito = carrito.find(i => i.id === id);
    if (enCarrito) enCarrito.cantidad += cantidadAgregar;
    else carrito.push({
      id: producto.id, nombre: producto.nombre, precio: producto.precio,
      cantidad: cantidadAgregar,
      imagen: (producto.imagenesThumb && producto.imagenesThumb[0]) || PLACEHOLDER_IMAGE
    });

    guardarCarrito(); renderizarCarrito(); renderizarProductos();
    mostrarNotificacion('Producto agregado al carrito', 'exito');
  } catch (err) {
    console.error('Error al agregar al carrito:', err);
    mostrarNotificacion('Error al agregar al carrito', 'error');
  } finally {
    if (boton) { boton.disabled = false; boton.innerHTML = boton._oldHTML; busyButtons.delete(boton); }
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
function actualizarUI() { renderizarCarrito(); actualizarContadorCarrito(); }
function aplicarFiltros() { paginaActual = 1; renderizarProductos(); }
function resetearFiltros() {
  filtrosActuales = { precioMin: 0, precioMax: 3000, categoria: 'todos', busqueda: '' };
  elementos.inputBusqueda && (elementos.inputBusqueda.value = '');
  elementos.selectCategoria && (elementos.selectCategoria.value = 'todos');
  elementos.precioMinInput && (elementos.precioMinInput.value = '0');
  elementos.precioMaxInput && (elementos.precioMaxInput.value = '3000');
  updateRange(); aplicarFiltros();
}

// ===============================
// INICIALIZACIONES MISC
// ===============================
function inicializarFAQ() {
  document.querySelectorAll('.faq-toggle').forEach(t => {
    t.onclick = () => { const exp = t.getAttribute('aria-expanded') === 'true'; t.setAttribute('aria-expanded', !exp); t.nextElementSibling.hidden = exp; };
  });
}
function inicializarMenuHamburguesa() {
  const h = elementos.hamburguesa, m = elementos.menu; if (!h || !m) return;
  h.onclick = () => { const expanded = m.classList.toggle('active'); h.setAttribute('aria-expanded', expanded); document.body.classList.toggle('no-scroll', expanded); };
  m.querySelectorAll('a').forEach(a => a.onclick = () => { m.classList.remove('active'); h.setAttribute('aria-expanded', false); document.body.classList.remove('no-scroll'); });
}
function setupContactForm() {
  const form = getElement('formulario-contacto'); if (!form || !window.emailjs) return;
  emailjs.init("o4IxJz0Zz-LQ8jYKG");
  form.onsubmit = (e) => {
    e.preventDefault();
    const nombre = getElement('nombre').value, email = getElement('email').value, mensaje = getElement('mensaje').value;
    emailjs.send('service_89by24g', 'template_8mn7hdp', { from_name: nombre, from_email: email, message: mensaje })
      .then(() => { getElement('successMessage').classList.remove('hidden'); form.reset(); setTimeout(() => getElement('successMessage').classList.add('hidden'), 3000); })
      .catch((error) => { console.error(error); const em = getElement('errorMessage'); em.textContent = 'Error al enviar el mensaje. Intenta de nuevo.'; em.classList.remove('hidden'); setTimeout(() => em.classList.add('hidden'), 3000); });
  };
}

// ===============================
// RESUMEN & ENVÍO (WhatsApp)
// ===============================
function actualizarResumenPedido() {
  const resumenProductos = getElement('resumen-productos');
  const resumenTotal = getElement('resumen-total');
  if (!resumenProductos || !resumenTotal) return;

  if (carrito.length === 0) {
    resumenProductos.innerHTML = '<p class="carrito-vacio">No hay productos en el carrito</p>';
    resumenTotal.textContent = '$U 0'; return;
  }

  let html = '', subtotal = 0;
  carrito.forEach(item => { const t = item.precio * item.cantidad; subtotal += t;
    html += `<div class="resumen-item"><span>${item.nombre} x${item.cantidad}</span><span>$U ${t.toLocaleString('es-UY')}</span></div>`; });

  const metodo = getElement('select-envio')?.value || 'retiro';
  const costoEnvio = metodo === 'montevideo' ? 200 : metodo === 'interior' ? 250 : 0;

  html += `<div class="resumen-item resumen-subtotal"><span>Subtotal:</span><span>$U ${subtotal.toLocaleString('es-UY')}</span></div>` +
          (metodo !== 'retiro' ? `<div class="resumen-item resumen-envio"><span>Envío (${metodo === 'montevideo' ? 'Montevideo' : 'Interior'}):</span><span>$U ${costoEnvio.toLocaleString('es-UY')}</span></div>` : '');

  resumenProductos.innerHTML = html;
  resumenTotal.textContent = `$U ${(subtotal + costoEnvio).toLocaleString('es-UY')}`;

  const grupoDireccion = getElement('grupo-direccion');
  const inputDireccion = getElement('input-direccion');
  if (grupoDireccion && inputDireccion) {
    grupoDireccion.style.display = metodo === 'retiro' ? 'none' : 'flex';
    inputDireccion.required = metodo !== 'retiro';
  }
}

getElement('btn-cerrar-modal-envio')?.addEventListener('click', () => {
  const modal = getElement('modal-datos-envio'); modal?.classList.remove('visible'); setTimeout(() => modal && (modal.style.display = 'none'), 300);
});

// Deep-link + fallback (abre app nativa si se puede)
function abrirWhatsAppCon(mensaje, numero = '59893566283') {
  const txt = encodeURIComponent(mensaje);
  const deep = `whatsapp://send?phone=${numero}&text=${txt}`;
  const web  = `https://web.whatsapp.com/send?phone=${numero}&text=${txt}`;
  const api  = `https://api.whatsapp.com/send?phone=${numero}&text=${txt}`;
  const isMobile = /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);

  let timer = setTimeout(() => {
    if (document.visibilityState !== 'hidden') window.location.href = isMobile ? api : web;
  }, 800);

  const onHide = () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onHide); };
  document.addEventListener('visibilitychange', onHide);

  // intento abrir app nativa
  window.location.href = deep;
  return true;
}

let enviandoPedido = false;
getElement('form-envio')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (enviandoPedido) return; enviandoPedido = true;

  const nombre = getElement('input-nombre').value.trim();
  const apellido = getElement('input-apellido').value.trim();
  const telefono = getElement('input-telefono').value.trim();
  const envio = getElement('select-envio').value;
  const direccion = envio !== 'retiro' ? getElement('input-direccion').value.trim() : '';
  const notas = getElement('input-notas').value.trim();

  if (!nombre || !apellido || !telefono || (envio !== 'retiro' && !direccion)) {
    mostrarNotificacion('Complete todos los campos obligatorios', 'error');
    enviandoPedido = false; return;
  }

  // Revalidación (el stock se descuenta al agregar)
  for (const item of carrito) {
    const prod = productos.find(p => p.id === item.id);
    if (!prod || prod.stock < 0) { mostrarNotificacion(`Stock insuficiente para "${item.nombre}"`, 'error'); enviandoPedido = false; return; }
  }

  let mensaje = `¡Hola Patofelting! Quiero hacer un pedido:\n\n*📋 Detalles del pedido:*\n`;
  carrito.forEach(i => mensaje += `➤ ${i.nombre} x${i.cantidad} - $U ${(i.precio * i.cantidad).toLocaleString('es-UY')}\n`);

  const subtotal = carrito.reduce((s, i) => s + i.precio * i.cantidad, 0);
  const costoEnvio = envio === 'montevideo' ? 200 : envio === 'interior' ? 250 : 0;
  const total = subtotal + costoEnvio;

  mensaje += `\n*💰 Total:*\nSubtotal: $U ${subtotal.toLocaleString('es-UY')}\n` +
             `Envío: $U ${costoEnvio.toLocaleString('es-UY')}\n` +
             `*TOTAL A PAGAR: $U ${total.toLocaleString('es-UY')}*\n\n` +
             `*👤 Datos del cliente:*\nNombre: ${nombre} ${apellido}\nTeléfono: ${telefono}\n` +
             `Método de envío: ${envio === 'montevideo' ? 'Envío Montevideo ($200)' : envio === 'interior' ? 'Envío Interior ($250)' : 'Retiro en local (Gratis)'}\n` +
             (envio !== 'retiro' ? `Dirección: ${direccion}\n` : '') +
             (notas ? `\n*📝 Notas adicionales:*\n${notas}` : '');

  abrirWhatsAppCon(mensaje, '59893566283');

  const modal = getElement('modal-datos-envio');
  modal?.classList.remove('visible');
  setTimeout(() => {
    if (modal) modal.style.display = 'none';
    carrito = []; guardarCarrito(); actualizarUI();
    mostrarNotificacion('Pedido listo para enviar por WhatsApp', 'exito');
    getElement('form-envio').reset();
    enviandoPedido = false;
  }, 200);
});

// ===============================
// SLIDERS DE PRECIO
// ===============================
function updateRange() {
  const minSlider = elementos.precioMinInput, maxSlider = elementos.precioMaxInput;
  const minPrice = getElement('min-price'), maxPrice = getElement('max-price');
  const range = document.querySelector('.range');
  if (!minSlider || !maxSlider || !minPrice || !maxPrice || !range) return;

  let minVal = parseInt(minSlider.value), maxVal = parseInt(maxSlider.value);
  if (minVal > maxVal) [minVal, maxVal] = [maxVal, minVal];
  minSlider.value = minVal; maxSlider.value = maxVal;

  const sliderMax = parseInt(minSlider.max);
  range.style.left = (minVal / sliderMax * 100) + '%';
  range.style.width = ((maxVal - minVal) / sliderMax * 100) + '%';

  minPrice.textContent = `$U${minVal}`; maxPrice.textContent = `$U${maxVal}`;
  filtrosActuales.precioMin = minVal; filtrosActuales.precioMax = maxVal;
  aplicarFiltros();
}

// ===============================
// OTRAS
// ===============================
function preguntarStock(nombre) {
  const asunto = encodeURIComponent(`Consulta sobre disponibilidad de "${nombre}"`);
  const cuerpo = encodeURIComponent(`Hola Patofelting,\n\nMe gustaría saber cuándo estará disponible el producto: ${nombre}\n\nSaludos,\n[Tu nombre]`);
  window.location.href = `mailto:patofelting@gmail.com?subject=${asunto}&body=${cuerpo}`;
}
window.agregarAlCarrito = agregarAlCarrito;
window.preguntarStock = preguntarStock;

// ===============================
// INIT
// ===============================
document.addEventListener('DOMContentLoaded', async () => {
  try { await signInAnonymously(auth); cargarProductosDesdeFirebase(); }
  catch (error) {
    console.error('❌ Error signing in:', error);
    mostrarNotificacion(error.code === 'auth/configuration-not-found'
      ? 'Autenticación anónima no habilitada.' : 'Error de red.', 'error');
  }
  cargarCarrito();
  ensureProductModal();
  inicializarMenuHamburguesa();
  inicializarFAQ();
  setupContactForm();
  initEventos();
  updateRange();
});

// Eventos delegados generales
function initEventos() {
  elementos.carritoBtnMain?.addEventListener('click', () => toggleCarrito(true));
  elementos.carritoOverlay?.addEventListener('click', () => toggleCarrito(false));
  elementos.btnCerrarCarrito?.addEventListener('click', () => toggleCarrito(false));

  getElement('select-envio')?.addEventListener('change', actualizarResumenPedido);
  elementos.btnVaciarCarrito?.addEventListener('click', vaciarCarrito);
  elementos.btnFinalizarCompra?.addEventListener('click', () => {
    if (carrito.length === 0) return mostrarNotificacion('El carrito está vacío', 'error');
    elementos.avisoPreCompraModal.style.display = 'flex';
    elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'false');
  });
  elementos.btnEntendidoAviso?.addEventListener('click', () => {
    elementos.avisoPreCompraModal.style.display = 'none';
    elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'true');
    const modalEnvio = getElement('modal-datos-envio');
    if (modalEnvio) { modalEnvio.style.display = 'flex'; modalEnvio.classList.add('visible'); modalEnvio.removeAttribute('hidden'); actualizarResumenPedido(); }
  });
  elementos.btnCancelarAviso?.addEventListener('click', () => {
    elementos.avisoPreCompraModal.style.display = 'none';
    elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'true');
  });

  elementos.inputBusqueda?.addEventListener('input', (e) => { filtrosActuales.busqueda = e.target.value.toLowerCase().trim(); aplicarFiltros(); });
  elementos.selectCategoria?.addEventListener('change', (e) => { filtrosActuales.categoria = e.target.value.trim(); aplicarFiltros(); });
  elementos.precioMinInput?.addEventListener('input', updateRange);
  elementos.precioMaxInput?.addEventListener('input', updateRange);
  elementos.aplicarRangoBtn?.addEventListener('click', () => {
    filtrosActuales.precioMin = parseInt(elementos.precioMinInput.value) || 0;
    filtrosActuales.precioMax = parseInt(elementos.precioMaxInput.value) || 3000;
    aplicarFiltros();
  });

  const galeria = elementos.galeriaProductos;
  if (galeria) {
    if (galeria._pfHandler) galeria.removeEventListener('click', galeria._pfHandler);
    const handler = (e) => {
      const target = e.target.closest('.boton-detalles, .boton-agregar, .boton-aviso-stock'); if (!target) return;
      e.preventDefault(); e.stopPropagation();
      const card = target.closest('.producto-card'); const id = parseInt(card?.dataset?.id);
      const producto = productos.find(p => p.id === id); if (!producto) return;
      if (target.classList.contains('boton-detalles')) mostrarModalProducto(producto);
      else if (target.classList.contains('boton-agregar')) agregarAlCarrito(id, 1, target);
      else if (target.classList.contains('boton-aviso-stock')) preguntarStock(producto.nombre);
    };
    galeria.addEventListener('click', handler, { passive: false });
    galeria._pfHandler = handler;
  }
}
