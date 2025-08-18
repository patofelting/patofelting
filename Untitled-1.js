/*************************************************
 * Patofelting – JS limpio + SEO
 * Dominio: https://patofelting.com
 * - Catálogo desde Firebase Realtime DB (fallback CSV)
 * - Filtros (categoría, precio, búsqueda)
 * - Paginación
 * - Carrito + total
 * - Modal de producto
 * - Flujo pre-compra + datos de envío
 * - Contacto con EmailJS
 * - Aviso “sin stock”
 * - SEO: JSON-LD (ItemList, Product, FAQPage),
 *        URL por producto (?producto=slug),
 *        title/description dinámicos,
 *        lazy/decoding/preload imágenes
 **************************************************/

/* =========================
   0) Config & “estado”
========================= */
const SITE_URL = 'https://patofelting.com';
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE || 'img/placeholder.png';
const FIREBASE_URL = window.FIREBASE_URL || '';
const SHEET_CSV_URL = window.SHEET_CSV_URL || '';

const STATE = {
  productos: [],
  filtrados: [],
  pagina: 1,
  porPagina: 12,
  filtros: {
    categoria: 'todos',
    min: 0,
    max: 3000,
    q: ''
  },
  carrito: [], // {id, nombre, precio, cantidad, stock, imagenes[]}
};

const EL = {
  // Navegación y generales
  galeria: document.getElementById('galeria-productos'),
  loader: document.getElementById('product-loader'),
  paginacion: document.getElementById('paginacion'),

  // Filtros
  filtroCategoria: document.getElementById('filtro-categoria'),
  minSlider: document.getElementById('min-slider'),
  maxSlider: document.getElementById('max-slider'),
  minPriceLabel: document.getElementById('min-price'),
  maxPriceLabel: document.getElementById('max-price'),
  inputBusqueda: document.querySelector('.input-busqueda'),

  // Carrito
  carritoBtnMain: document.getElementById('carrito-btn-main'),
  carritoPanel: document.getElementById('carrito-panel'),
  carritoOverlay: document.querySelector('.carrito-overlay'),
  carritoLista: document.getElementById('lista-carrito'),
  carritoTotal: document.getElementById('total'),
  contadorCarrito: document.getElementById('contador-carrito'),
  btnVaciarCarrito: document.querySelector('.boton-vaciar-carrito'),
  btnFinalizarCompra: document.querySelector('.boton-finalizar-compra'),
  btnCerrarCarrito: document.querySelector('.cerrar-carrito'),

  // Modal producto
  productoModal: document.getElementById('producto-modal'),
  modalContenido: document.getElementById('modal-contenido'),
  modalImg: document.getElementById('modal-imagen'),
  modalThumbs: document.getElementById('modal-thumbnails'),
  modalNombre: document.getElementById('modal-nombre'),
  modalDescripcion: document.getElementById('modal-descripcion'),
  modalPrecio: document.getElementById('modal-precio'),

  // Aviso pre-compra + envío
  avisoPreCompra: document.getElementById('aviso-pre-compra-modal'),
  btnEntendidoAviso: document.getElementById('btn-entendido-aviso'),
  btnCancelarAviso: document.getElementById('btn-cancelar-aviso'),

  modalEnvio: document.getElementById('modal-datos-envio'),
  formEnvio: document.getElementById('form-envio'),
  resumenProductos: document.getElementById('resumen-productos'),
  resumenTotal: document.getElementById('resumen-total'),
  selectEnvio: document.getElementById('select-envio'),
  btnCerrarModalEnvio: document.getElementById('btn-cerrar-modal-envio'),

  // Stock “avisame”
  stockModal: document.getElementById('stock-modal'),
  stockForm: document.getElementById('stock-form'),
  stockFeedback: document.getElementById('stock-modal-feedback'),
  stockClose: document.querySelector('.modal-stock-close'),

  // Contacto
  formContacto: document.getElementById('formulario-contacto'),
  successMessage: document.getElementById('successMessage'),
  errorMessage: document.getElementById('errorMessage'),
};

/* =========================
   1) Utilidades
========================= */
const fmtUY = (n) => `$U ${Number(n || 0).toLocaleString('es-UY')}`;

const slugify = (s) =>
  (s || '')
    .toString()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

function setText(el, txt) { if (el) el.textContent = txt; }
function show(el) { if (el) el.hidden = false; }
function hide(el) { if (el) el.hidden = true; }

function ensureScriptId(id) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = id;
    document.head.appendChild(el);
  }
  return el;
}
function setJSONLD(id, obj) {
  ensureScriptId(id).textContent = JSON.stringify(obj);
}
function hardenImgSEO(imgEl, { alt, width = 800, height = 800 } = {}) {
  if (!imgEl) return;
  if (alt) imgEl.alt = alt;
  imgEl.loading = imgEl.loading || 'lazy';
  imgEl.decoding = imgEl.decoding || 'async';
  // Evita CLS si el backend no da tamaño
  imgEl.style.aspectRatio = imgEl.style.aspectRatio || '1 / 1';
}
function preloadImage(href) {
  if (!href) return;
  const id = `preload-${href}`;
  if (document.getElementById(id)) return;
  const l = document.createElement('link');
  l.id = id;
  l.rel = 'preload';
  l.as = 'image';
  l.href = href;
  document.head.appendChild(l);
}

/* =========================
   2) Data: cargar productos
========================= */
async function fetchFirebaseProductos() {
  if (!FIREBASE_URL) return null;
  try {
    const res = await fetch(FIREBASE_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('Firebase fetch error');
    const data = await res.json();
    // Estructura: { [id]: {nombre, precio, stock, imagenes[], descripcion, categoria}}
    const arr = Object.entries(data || {}).map(([id, p]) => ({
      id: Number(id) || id,
      nombre: p?.nombre || 'Producto',
      precio: Number(p?.precio || 0),
      stock: Number(p?.cantidad ?? p?.stock ?? 0),
      imagenes: Array.isArray(p?.imagenes) ? p.imagenes : (p?.imagen ? [p.imagen] : []),
      descripcion: p?.descripcion || '',
      categoria: p?.categoria || 'otros'
    }));
    return arr;
  } catch (e) {
    console.warn('[Firebase] No se pudo obtener productos:', e);
    return null;
  }
}

async function fetchCSVProductos() {
  if (!SHEET_CSV_URL) return [];
  try {
    const res = await fetch(SHEET_CSV_URL, { cache: 'no-store' });
    const csv = await res.text();
    // PapaParse está cargado por script defer
    const parsed = window.Papa.parse(csv, { header: true, dynamicTyping: true });
    const arr = (parsed?.data || []).filter(Boolean).map((r, i) => ({
      id: Number(r.id || i + 1),
      nombre: r.nombre || 'Producto',
      precio: Number(r.precio || 0),
      stock: Number(r.cantidad ?? r.stock ?? 0),
      imagenes: (r.imagenes || r.imagen || '')
        .toString()
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
      descripcion: r.descripcion || '',
      categoria: r.categoria || 'otros'
    }));
    return arr;
  } catch (e) {
    console.warn('[CSV] No se pudo obtener productos:', e);
    return [];
  }
}

async function cargarProductos() {
  show(EL.loader);
  let productos = await fetchFirebaseProductos();
  if (!productos || !productos.length) {
    productos = await fetchCSVProductos();
  }
  hide(EL.loader);
  STATE.productos = productos || [];
  aplicarFiltros();
}

/* =========================
   3) Filtros y paginación
========================= */
function aplicarFiltros() {
  const { categoria, min, max, q } = STATE.filtros;
  const qn = (q || '').trim().toLowerCase();

  let lista = STATE.productos.filter(p => {
    const byCat = (categoria === 'todos') || (p.categoria?.toLowerCase() === categoria);
    const byPrecio = p.precio >= min && p.precio <= max;
    const byTexto =
      !qn ||
      p.nombre?.toLowerCase().includes(qn) ||
      p.descripcion?.toLowerCase().includes(qn);
    return byCat && byPrecio && byTexto;
  });

  STATE.filtrados = lista;
  STATE.pagina = 1;
  renderizarProductos();
}

function paginar(arr, page, per) {
  const start = (page - 1) * per;
  return arr.slice(start, start + per);
}

/* =========================
   4) Renderizado catálogo
========================= */
function crearCardProducto(p) {
  const enCarrito = STATE.carrito.find(i => i.id === p.id);
  const disponible = Math.max(0, Number(p.stock || 0) - (enCarrito?.cantidad || 0));
  const agotado = disponible <= 0;
  const imagen = (p.imagenes && p.imagenes[0]) || PLACEHOLDER_IMAGE;

  const slug = slugify(p.nombre);
  const productUrl = `${SITE_URL}/?producto=${encodeURIComponent(slug)}#productos`;
  const availability = agotado ? 'http://schema.org/OutOfStock' : 'http://schema.org/InStock';

  return `
  <article class="producto-card ${agotado ? 'agotado' : ''}" data-id="${p.id}" itemscope itemtype="https://schema.org/Product">
    <a href="${productUrl}" class="producto-link" data-id="${p.id}" itemprop="url" aria-label="Ver ${p.nombre}">
      <img src="${imagen}" class="producto-img" itemprop="image" alt="${p.nombre}">
    </a>
    <h3 class="producto-nombre" itemprop="name">${p.nombre}</h3>
    <p class="producto-precio" itemprop="offers" itemscope itemtype="https://schema.org/Offer">
      <meta itemprop="priceCurrency" content="UYU">
      <span itemprop="price">${(p.precio || 0).toFixed(0)}</span>
      <link itemprop="availability" href="${availability}">
      <link itemprop="url" href="${productUrl}">
    </p>
    <div class="card-acciones">
      <button class="boton-agregar${agotado ? ' agotado' : ''}" data-id="${p.id}" ${agotado ? 'disabled' : ''}>
        ${agotado ? '<i class="fas fa-times-circle"></i> Agotado' : '<i class="fas fa-cart-plus"></i> Agregar'}
      </button>
      ${agotado ? `
       <button class="boton-aviso-stock" data-nombre="${p.nombre.replace(/'/g, "\\'")}">📩 Avisame</button>
      ` : ''}
    </div>
    <button class="boton-detalles" data-id="${p.id}" aria-label="Detalles de ${p.nombre}">🔍 Ver Detalle</button>
  </article>
  `;
}

function postProcessCardsSEO() {
  document.querySelectorAll('.producto-card .producto-img').forEach(img => {
    const card = img.closest('.producto-card');
    const name = card?.querySelector('[itemprop="name"]')?.textContent?.trim();
    hardenImgSEO(img, { alt: name });
  });
}

function setItemListJSONLD() {
  const items = [...document.querySelectorAll('.producto-card [itemprop="url"]')].map((a, i) => ({
    "@type": "ListItem",
    "position": i + 1,
    "url": a.href
  }));
  setJSONLD('ld-itemlist', {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Catálogo Patofelting",
    "itemListElement": items
  });
}

function renderizarProductos() {
  if (!EL.galeria) return;
  const paginaItems = paginar(STATE.filtrados, STATE.pagina, STATE.porPagina);
  EL.galeria.innerHTML = paginaItems.map(crearCardProducto).join('') || `
    <div class="sin-resultados">No hay productos que coincidan.</div>`;

  // SEO / UX mejoras post render
  postProcessCardsSEO();
  setItemListJSONLD();
  renderizarPaginacion(STATE.filtrados.length);
}

/* =========================
   5) Paginación
========================= */
function renderizarPaginacion(total) {
  if (!EL.paginacion) return;
  const totalPag = Math.max(1, Math.ceil(total / STATE.porPagina));
  let html = '';
  for (let i = 1; i <= totalPag; i++) {
    html += `<button class="page-btn ${i === STATE.pagina ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }
  EL.paginacion.innerHTML = html;

  EL.paginacion.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      STATE.pagina = Number(btn.dataset.page);
      renderizarProductos();
      EL.galeria?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

/* =========================
   6) Carrito
========================= */
function persistCarrito() {
  localStorage.setItem('pf_carrito_v1', JSON.stringify(STATE.carrito));
}
function loadCarrito() {
  try {
    const raw = localStorage.getItem('pf_carrito_v1');
    STATE.carrito = raw ? JSON.parse(raw) : [];
  } catch {
    STATE.carrito = [];
  }
}
function actualizarContadorCarrito() {
  const totalCant = STATE.carrito.reduce((a, b) => a + b.cantidad, 0);
  setText(EL.contadorCarrito, totalCant);
}
function renderCarrito() {
  if (!EL.carritoLista || !EL.carritoTotal) return;
  if (!STATE.carrito.length) {
    EL.carritoLista.innerHTML = `<li class="carrito-vacio">No hay productos en el carrito</li>`;
    setText(EL.carritoTotal, fmtUY(0));
    actualizarContadorCarrito();
    return;
  }
  let html = '';
  let total = 0;
  STATE.carrito.forEach(item => {
    const itemTotal = (item.precio || 0) * (item.cantidad || 0);
    total += itemTotal;
    html += `
      <li class="carrito-item">
        <span>${item.nombre} x${item.cantidad}</span>
        <strong>${fmtUY(itemTotal)}</strong>
        <div class="carrito-item-acciones">
          <button class="menos" data-id="${item.id}" aria-label="Restar uno">−</button>
          <button class="mas" data-id="${item.id}" aria-label="Sumar uno">+</button>
          <button class="quitar" data-id="${item.id}" aria-label="Quitar del carrito">✕</button>
        </div>
      </li>`;
  });
  EL.carritoLista.innerHTML = html;
  setText(EL.carritoTotal, `Total: ${fmtUY(total)}`);
  actualizarContadorCarrito();

  EL.carritoLista.querySelectorAll('.menos').forEach(b => b.addEventListener('click', () => cambiarCant(Number(b.dataset.id), -1)));
  EL.carritoLista.querySelectorAll('.mas').forEach(b => b.addEventListener('click', () => cambiarCant(Number(b.dataset.id), +1)));
  EL.carritoLista.querySelectorAll('.quitar').forEach(b => b.addEventListener('click', () => quitarDelCarrito(Number(b.dataset.id))));
}
function cambiarCant(id, delta) {
  const it = STATE.carrito.find(x => x.id === id);
  if (!it) return;
  const p = STATE.productos.find(x => x.id === id);
  const max = Math.max(0, Number(p?.stock || 0));
  it.cantidad = Math.min(Math.max(1, it.cantidad + delta), Math.max(1, max));
  if (it.cantidad <= 0) {
    STATE.carrito = STATE.carrito.filter(x => x.id !== id);
  }
  persistCarrito();
  renderCarrito();
  renderizarProductos(); // actualiza “agotado” de cards
}
function quitarDelCarrito(id) {
  STATE.carrito = STATE.carrito.filter(x => x.id !== id);
  persistCarrito();
  renderCarrito();
  renderizarProductos();
}
function agregarAlCarrito(id) {
  const p = STATE.productos.find(x => x.id === id);
  if (!p) return;
  const enCarrito = STATE.carrito.find(x => x.id === id);
  const max = Math.max(0, Number(p.stock || 0));
  if (max <= 0) return; // sin stock
  if (!enCarrito) {
    STATE.carrito.push({
      id: p.id,
      nombre: p.nombre,
      precio: p.precio,
      cantidad: 1,
      stock: p.stock,
      imagenes: p.imagenes || []
    });
  } else {
    enCarrito.cantidad = Math.min(enCarrito.cantidad + 1, max);
  }
  persistCarrito();
  renderCarrito();
  renderizarProductos();
}
function toggleCarrito(open) {
  if (!EL.carritoPanel) return;
  if (open) {
    EL.carritoPanel.classList.add('open');
    EL.carritoOverlay?.classList.add('show');
  } else {
    EL.carritoPanel.classList.remove('open');
    EL.carritoOverlay?.classList.remove('show');
  }
}

/* =========================
   7) Modal de producto + SEO dinámico
========================= */
function mostrarModalProducto(producto) {
  const modal = EL.productoModal;
  const contenido = EL.modalContenido;
  if (!modal || !contenido) return;

  // --- SEO dinámico ---
  const slug = slugify(producto.nombre);
  const productURL = `${SITE_URL}/?producto=${encodeURIComponent(slug)}#productos`;
  const oldTitle = document.title;
  const oldDescTag = document.querySelector('meta[name="description"]');
  const tempDesc = `Figura de fieltro "${producto.nombre}" hecha a mano en Uruguay. Precio ${fmtUY(producto.precio)}.`;

  history.pushState({ producto: slug }, '', productURL);
  document.title = `${producto.nombre} | Patofelting`;

  let metaDesc = oldDescTag;
  if (!metaDesc) {
    metaDesc = document.createElement('meta');
    metaDesc.setAttribute('name', 'description');
    document.head.appendChild(metaDesc);
  }
  const previousDesc = metaDesc.getAttribute('content') || '';
  metaDesc.setAttribute('content', tempDesc);

  // Preload de la 1ª imagen
  const primera = (producto.imagenes && producto.imagenes[0]) || PLACEHOLDER_IMAGE;
  preloadImage(primera);

  // JSON-LD Product
  setJSONLD('ld-product', {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": producto.nombre,
    "image": (producto.imagenes && producto.imagenes.length) ? producto.imagenes : [PLACEHOLDER_IMAGE],
    "description": (producto.descripcion || '').substring(0, 280),
    "brand": { "@type": "Brand", "name": "Patofelting" },
    "url": productURL,
    "offers": {
      "@type": "Offer",
      "priceCurrency": "UYU",
      "price": (producto.precio || 0).toFixed(0),
      "availability": (Math.max(0, Number(producto.stock || 0) - (STATE.carrito.find(i => i.id === producto.id)?.cantidad || 0)) <= 0)
        ? "http://schema.org/OutOfStock"
        : "http://schema.org/InStock",
      "url": productURL
    }
  });

  // Guardar para restaurar al cerrar
  modal.dataset.restoreSeo = JSON.stringify({ title: oldTitle, desc: previousDesc });

  // --- Render modal ---
  modal.setAttribute('aria-hidden', 'false');
  modal.classList.add('active');
  document.body.classList.add('no-scroll');

  setText(EL.modalNombre, producto.nombre);
  setText(EL.modalDescripcion, producto.descripcion || '');
  setText(EL.modalPrecio, fmtUY(producto.precio));
  const img = (producto.imagenes && producto.imagenes[0]) || PLACEHOLDER_IMAGE;
  EL.modalImg.src = img;
  EL.modalImg.alt = producto.nombre;
  hardenImgSEO(EL.modalImg, { alt: producto.nombre });

  EL.modalThumbs.innerHTML = (producto.imagenes || []).map((src, i) => `
    <button class="thumb ${i === 0 ? 'active' : ''}" data-src="${src}" aria-label="Imagen ${i + 1}">
      <img src="${src}" alt="${producto.nombre} vista ${i + 1}" loading="lazy" decoding="async">
    </button>`).join('');

  EL.modalThumbs.querySelectorAll('.thumb').forEach(btn => {
    btn.addEventListener('click', () => {
      EL.modalThumbs.querySelectorAll('.thumb').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const src = btn.dataset.src;
      EL.modalImg.src = src;
    });
  });
}

function cerrarModal() {
  const modal = EL.productoModal;
  if (!modal) return;
  // Restaurar SEO dinámico
  const data = modal.dataset.restoreSeo;
  if (data) {
    try {
      const { title, desc } = JSON.parse(data);
      document.title = title || 'Patofelting - Creaciones en Fieltro';
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc && typeof desc === 'string') metaDesc.setAttribute('content', desc);
    } catch { /* noop */ }
    modal.dataset.restoreSeo = '';
  }
  // Restaurar URL limpia
  if (location.search.includes('producto=')) {
    const clean = `${SITE_URL}${location.hash || ''}`;
    history.pushState({}, '', clean);
  }
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('no-scroll');
}
// Expone para el botón “&times;” del HTML
window.cerrarModal = cerrarModal;

/* =========================
   8) Pre-compra y Envío
========================= */
function actualizarResumenPedido() {
  const cont = EL.resumenProductos;
  const totalEl = EL.resumenTotal;
  if (!cont || !totalEl) return;
  if (!STATE.carrito.length) {
    cont.innerHTML = '<p class="carrito-vacio">No hay productos en el carrito</p>';
    setText(totalEl, fmtUY(0));
    return;
  }
  let subtotal = 0;
  cont.innerHTML = STATE.carrito.map(item => {
    const itemTotal = (item.precio || 0) * (item.cantidad || 0);
    subtotal += itemTotal;
    return `
      <div class="resumen-item">
        <span>${item.nombre} x${item.cantidad}</span>
        <span>${fmtUY(itemTotal)}</span>
      </div>`;
  }).join('');

  const metodo = EL.selectEnvio?.value || 'retiro';
  const costoEnvio = metodo === 'montevideo' ? 200 : (metodo === 'interior' ? 250 : 0);
  const total = subtotal + costoEnvio;

  cont.insertAdjacentHTML('beforeend', `
    <div class="resumen-item envio">
      <span>Envío</span>
      <span>${fmtUY(costoEnvio)}</span>
    </div>`);
  setText(totalEl, fmtUY(total));
}

/* =========================
   9) FAQ → JSON-LD
========================= */
function setFAQJsonLDFromDOM() {
  const faqs = [...document.querySelectorAll('.faq-item')]
    .map(item => {
      const q = item.querySelector('.faq-toggle')?.textContent?.trim();
      const a = item.querySelector('.faq-content')?.textContent?.trim();
      if (!q || !a) return null;
      return {
        "@type": "Question",
        "name": q,
        "acceptedAnswer": { "@type": "Answer", "text": a }
      };
    })
    .filter(Boolean);

  if (faqs.length) {
    setJSONLD('ld-faq', {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": faqs
    });
  }
}

/* =========================
   10) Eventos UI
========================= */
function bindUI() {
  // Filtros
  EL.filtroCategoria?.addEventListener('change', () => {
    STATE.filtros.categoria = EL.filtroCategoria.value;
    aplicarFiltros();
  });
  EL.minSlider?.addEventListener('input', () => {
    const v = Number(EL.minSlider.value);
    STATE.filtros.min = v;
    setText(EL.minPriceLabel, `$U${v}`);
    if (v > STATE.filtros.max) {
      STATE.filtros.max = v;
      if (EL.maxSlider) EL.maxSlider.value = v;
      setText(EL.maxPriceLabel, `$U${v}`);
    }
    aplicarFiltros();
  });
  EL.maxSlider?.addEventListener('input', () => {
    const v = Number(EL.maxSlider.value);
    STATE.filtros.max = v;
    setText(EL.maxPriceLabel, `$U${v}`);
    if (v < STATE.filtros.min) {
      STATE.filtros.min = v;
      if (EL.minSlider) EL.minSlider.value = v;
      setText(EL.minPriceLabel, `$U${v}`);
    }
    aplicarFiltros();
  });
  EL.inputBusqueda?.addEventListener('input', (e) => {
    STATE.filtros.q = e.target.value || '';
    aplicarFiltros();
  });

  // Delegación en galería
  EL.galeria?.addEventListener('click', (e) => {
    const add = e.target.closest('.boton-agregar');
    const det = e.target.closest('.boton-detalles');
    const aLink = e.target.closest('.producto-link');
    const aviso = e.target.closest('.boton-aviso-stock');

    if (add) {
      const id = Number(add.dataset.id);
      agregarAlCarrito(id);
    }
    if (det) {
      const id = Number(det.dataset.id);
      const p = STATE.productos.find(x => x.id === id);
      if (p) mostrarModalProducto(p);
    }
    if (aLink) {
      e.preventDefault();
      const id = Number(aLink.dataset.id);
      const p = STATE.productos.find(x => x.id === id);
      if (p) mostrarModalProducto(p);
    }
    if (aviso) {
      e.preventDefault();
      abrirStockModal(aviso.dataset.nombre);
    }
  });

  // Carrito UI
  EL.carritoBtnMain?.addEventListener('click', () => toggleCarrito(true));
  EL.carritoOverlay?.addEventListener('click', () => toggleCarrito(false));
  EL.btnCerrarCarrito?.addEventListener('click', () => toggleCarrito(false));
  EL.btnVaciarCarrito?.addEventListener('click', () => {
    STATE.carrito = [];
    persistCarrito();
    renderCarrito();
    renderizarProductos();
  });

  // Proceso de compra
  EL.btnFinalizarCompra?.addEventListener('click', () => {
    if (!STATE.carrito.length) {
      alert('El carrito está vacío.');
      return;
    }
    EL.avisoPreCompra?.removeAttribute('hidden');
    EL.avisoPreCompra?.setAttribute('aria-hidden', 'false');
  });
  EL.btnEntendidoAviso?.addEventListener('click', () => {
    EL.avisoPreCompra?.setAttribute('hidden', 'true');
    abrirModalEnvio();
  });
  EL.btnCancelarAviso?.addEventListener('click', () => {
    EL.avisoPreCompra?.setAttribute('hidden', 'true');
  });

  // Envío
  EL.selectEnvio?.addEventListener('change', actualizarResumenPedido);
  EL.btnCerrarModalEnvio?.addEventListener('click', () => cerrarModalEnvio());
  EL.formEnvio?.addEventListener('submit', onSubmitEnvio);

  // Stock modal
  EL.stockClose?.addEventListener('click', cerrarStockModal);
  EL.stockForm?.addEventListener('submit', onSubmitStock);

  // Contacto
  EL.formContacto?.addEventListener('submit', onSubmitContacto);

  // Cerrar modal de producto si se hace click fuera del contenido
  EL.productoModal?.addEventListener('click', (e) => {
    if (e.target === EL.productoModal) cerrarModal();
  });

  // Abrir modal si viene ?producto= en la URL
  const urlParams = new URLSearchParams(location.search);
  const slugFromURL = urlParams.get('producto');
  if (slugFromURL) {
    // defer hasta tener productos
    const observer = new MutationObserver(() => {
      if (STATE.productos.length) {
        const p = STATE.productos.find(x => slugify(x.nombre) === slugFromURL);
        if (p) mostrarModalProducto(p);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

/* =========================
   11) Modales auxiliares
========================= */
function abrirModalEnvio() {
  if (!EL.modalEnvio) return;
  EL.modalEnvio.removeAttribute('hidden');
  EL.modalEnvio.setAttribute('aria-hidden', 'false');
  actualizarResumenPedido();
}
function cerrarModalEnvio() {
  EL.modalEnvio?.setAttribute('hidden', 'true');
  EL.modalEnvio?.setAttribute('aria-hidden', 'true');
}
async function onSubmitEnvio(e) {
  e.preventDefault();
  try {
    // Construye mensaje WhatsApp (no se envía aquí, solo demo)
    const data = new FormData(EL.formEnvio);
    const nombre = data.get('nombre');
    const telefono = data.get('telefono');
    const metodo = data.get('metodo_envio');
    const direccion = data.get('direccion') || '(retiro)';
    const resumen = STATE.carrito.map(i => `${i.nombre} x${i.cantidad} - ${fmtUY(i.precio * i.cantidad)}`).join(' | ');
    const total = EL.resumenTotal?.textContent || '';

    const texto = encodeURIComponent(
      `Hola! Soy ${nombre}. Quiero confirmar mi pedido:
- Productos: ${resumen}
- Envío: ${metodo} (${direccion})
- Total: ${total}
- Tel: ${telefono}`
    );
    const wa = `https://wa.me/59800000000?text=${texto}`;
    window.open(wa, '_blank');
    cerrarModalEnvio();
    toggleCarrito(false);
  } catch (err) {
    alert('No se pudo preparar el pedido. Intenta nuevamente.');
  }
}

/* =========================
   12) Aviso “Sin stock”
========================= */
function abrirStockModal(nombreProducto = '') {
  if (!EL.stockModal) return;
  EL.stockModal.removeAttribute('hidden');
  EL.stockModal.setAttribute('aria-hidden', 'false');
  EL.stockFeedback?.setAttribute('hidden', 'true');
  EL.stockForm?.reset();
  EL.stockForm?.setAttribute('data-producto', nombreProducto);
}
function cerrarStockModal() {
  EL.stockModal?.setAttribute('hidden', 'true');
  EL.stockModal?.setAttribute('aria-hidden', 'true');
}
function onSubmitStock(e) {
  e.preventDefault();
  // Aquí podrías usar EmailJS o tu endpoint para guardar avisos
  const email = (document.getElementById('stock-email')?.value || '').trim();
  const producto = EL.stockForm?.getAttribute('data-producto') || '';
  if (!email) return;
  // Demo feedback
  EL.stockFeedback.textContent = `¡Listo! Te avisaremos cuando "${producto}" vuelva a estar disponible.`;
  EL.stockFeedback.removeAttribute('hidden');
  setTimeout(cerrarStockModal, 1600);
}

/* =========================
   13) Contacto (EmailJS)
========================= */
function onSubmitContacto(e) {
  e.preventDefault();
  if (!window.emailjs) {
    EL.errorMessage?.classList.remove('hidden');
    return;
  }
  const form = e.target;
  // Configura tus credenciales de EmailJS (service_id, template_id, public_key)
  const SERVICE_ID = 'service_xxx';
  const TEMPLATE_ID = 'template_xxx';
  const PUBLIC_KEY = 'xxxxxx';
  emailjs.init(PUBLIC_KEY);

  emailjs.sendForm(SERVICE_ID, TEMPLATE_ID, form)
    .then(() => {
      EL.successMessage?.classList.remove('hidden');
      EL.errorMessage?.classList.add('hidden');
      form.reset();
    })
    .catch(() => {
      EL.successMessage?.classList.add('hidden');
      EL.errorMessage?.classList.remove('hidden');
    });
}

/* =========================
   14) Inicio
========================= */
async function init() {
  loadCarrito();
  actualizarContadorCarrito();
  renderCarrito();

  bindUI();
  await cargarProductos();

  // Delegación extra por si el HTML ya trae botones presentes
  document.addEventListener('click', (e) => {
    const close = e.target.closest('.cerrar-modal');
    if (close) cerrarModal();
  });

  // FAQ → JSON-LD
  setFAQJsonLDFromDOM();
}

document.addEventListener('DOMContentLoaded', init);
