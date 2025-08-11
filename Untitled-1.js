// ===============================
// CONFIGURACIÓN GLOBAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const CSV_URL = window.SHEET_CSV_URL; // por si lo usás en el futuro
const PLACEHOLDER_IMAGE =
  window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

// Firebase (tu index.html ya inicializa la app)
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

let filtrosActuales = {
  precioMin: 0,
  precioMax: 3000,
  categoria: 'todos',
  busqueda: ''
};

// ===============================
// ARRANQUE
// ===============================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await signInAnonymously(auth);
    console.log('✅ Firebase anónimo OK');
    await cargarProductosDesdeFirebase();
  } catch (error) {
    console.error('❌ Error Firebase:', error);
    let msg = 'Error de autenticación con Firebase.';
    if (error.code === 'auth/configuration-not-found') {
      msg = 'Habilitá la autenticación anónima en Firebase.';
    } else if (error.code === 'auth/network-request-failed') {
      msg = 'Error de red. Verifica tu conexión.';
    }
    mostrarNotificacion(msg, 'error');
  }

  cargarCarrito();
  ensureProductModal();   // crea el modal si no existe
  init();
});

// ===============================
// DOM
// ===============================
const $ = (id) => document.getElementById(id);
const elementos = {
  galeriaProductos: $('galeria-productos'),
  paginacion: $('paginacion'),

  productoModal: $('producto-modal'),
  modalContenido: $('modal-contenido'),

  listaCarrito: $('lista-carrito'),
  totalCarrito: $('total'),
  contadorCarrito: $('contador-carrito'),

  inputBusqueda: document.querySelector('.input-busqueda'),
  selectCategoria: $('filtro-categoria'),
  precioMinInput: $('min-slider'),
  precioMaxInput: $('max-slider'),

  carritoBtnMain: $('carrito-btn-main'),
  carritoPanel: $('carrito-panel'),
  carritoOverlay: document.querySelector('.carrito-overlay'),
  btnVaciarCarrito: document.querySelector('.boton-vaciar-carrito'),
  btnFinalizarCompra: document.querySelector('.boton-finalizar-compra'),
  btnCerrarCarrito: document.querySelector('.cerrar-carrito'),

  avisoPreCompraModal: $('aviso-pre-compra-modal'),
  btnEntendidoAviso: $('btn-entendido-aviso'),
  btnCancelarAviso: $('btn-cancelar-aviso'),

  productLoader: $('product-loader'),

  hamburguesa: document.querySelector('.hamburguesa'),
  menu: $('menu'),

  aplicarRangoBtn: document.querySelector('.aplicar-rango-btn'),
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
    setTimeout(() => noti.remove(), 300);
  }, 2500);
}

// ===============================
// CARRITO
// ===============================
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

async function vaciarCarrito() {
  if (carrito.length === 0) {
    mostrarNotificacion('El carrito ya está vacío', 'info');
    return;
  }

  try {
    await Promise.all(
      carrito.map(async (item) => {
        const productRef = ref(db, `productos/${item.id}/stock`);
        await runTransaction(productRef, (currentStock) => {
          if (typeof currentStock !== 'number' || isNaN(currentStock)) currentStock = 0;
          return currentStock + item.cantidad;
        });
      })
    );

    carrito = [];
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion('Carrito vaciado y stock restaurado', 'exito');
  } catch (error) {
    console.error("Error al vaciar carrito:", error);
    mostrarNotificacion('Ocurrió un error al vaciar el carrito', 'error');
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
// FIREBASE: PRODUCTOS
// ===============================
async function cargarProductosDesdeFirebase() {
  const productosRef = ref(db, 'productos');

  try {
    if (elementos.productLoader) {
      elementos.productLoader.style.display = 'flex';
      elementos.productLoader.hidden = false;
    }

    const snapshot = await get(productosRef);
    if (!snapshot.exists()) {
      elementos.galeriaProductos.innerHTML = '<p class="sin-productos">No hay productos disponibles.</p>';
      return;
    }

    procesarDatosProductos(snapshot.val());

    // live updates
    onValue(productosRef, (snap) => {
      if (!snap.exists()) {
        productos = [];
        renderizarProductos();
        actualizarCategorias();
        actualizarUI();
        return;
      }
      procesarDatosProductos(snap.val());
    }, (error) => {
      console.error('onValue error:', error);
      mostrarNotificacion('Error al recibir actualizaciones de productos', 'error');
    });

  } catch (e) {
    console.error('Error al cargar productos:', e);
    mostrarNotificacion('No se pudieron cargar los productos', 'error');
    elementos.galeriaProductos.innerHTML = '<p class="error-carga">No se pudieron cargar los productos.</p>';
  } finally {
    setTimeout(() => {
      if (elementos.productLoader) {
        elementos.productLoader.style.display = 'none';
        elementos.productLoader.hidden = true;
      }
    }, 300);
  }
}

function procesarDatosProductos(data) {
  productos = [];
  Object.keys(data).forEach(key => {
    const p = data[key];
    if (!p || typeof p !== 'object') return;

    productos.push({
      id: p.id && !isNaN(p.id) ? parseInt(p.id) : parseInt(key),
      nombre: typeof p.nombre === 'string' ? p.nombre.trim() : 'Sin nombre',
      descripcion: typeof p.descripcion === 'string' ? p.descripcion.trim() : '',
      precio: !isNaN(parseFloat(p.precio)) ? parseFloat(p.precio) : 0,
      stock: !isNaN(parseInt(p.stock, 10)) ? Math.max(0, parseInt(p.stock, 10)) : 0,
      imagenes: Array.isArray(p.imagenes)
        ? p.imagenes.filter(img => typeof img === 'string' && img.trim() !== '')
        : [PLACEHOLDER_IMAGE],
      categoria: typeof p.categoria === 'string' ? p.categoria.toLowerCase().trim() : 'otros',
      estado: typeof p.estado === 'string' ? p.estado.trim() : '',
      adicionales: typeof p.adicionales === 'string' ? p.adicionales.trim() : '',
      alto: !isNaN(parseFloat(p.alto)) ? parseFloat(p.alto) : null,
      ancho: !isNaN(parseFloat(p.ancho)) ? parseFloat(p.ancho) : null,
      profundidad: !isNaN(parseFloat(p.profundidad)) ? parseFloat(p.profundidad) : null,
    });
  });

  renderizarProductos();
  actualizarCategorias();
  actualizarUI();
}

// ===============================
// RENDER: CARRITO
// ===============================
function renderizarCarrito() {
  if (!elementos.listaCarrito || !elementos.totalCarrito) return;

  if (carrito.length === 0) {
    elementos.listaCarrito.innerHTML = '<p class="carrito-vacio">Tu carrito está vacío</p>';
    elementos.totalCarrito.textContent = 'Total: $U 0';
    return;
  }

  elementos.listaCarrito.innerHTML = carrito.map(item => {
    const producto = productos.find(p => p.id === item.id);
    const stockRealProducto = producto ? producto.stock : 0;
    const disponiblesParaAgregar = Math.max(0, stockRealProducto - item.cantidad);

    return `
      <li class="carrito-item" data-id="${item.id}">
        <img src="${item.imagen}" class="carrito-item-img" alt="${item.nombre}" loading="lazy">
        <div class="carrito-item-info">
          <span class="carrito-item-nombre">${item.nombre}</span>
          <span class="carrito-item-precio">$U ${item.precio.toLocaleString('es-UY')} c/u</span>
          <div class="carrito-item-controls">
            <button class="disminuir-cantidad" data-id="${item.id}" aria-label="Reducir cantidad" ${item.cantidad <= 1 ? 'disabled' : ''}>-</button>
            <span class="carrito-item-cantidad">${item.cantidad}</span>
            <button class="aumentar-cantidad" data-id="${item.id}" aria-label="Aumentar cantidad" ${disponiblesParaAgregar <= 0 ? 'disabled' : ''}>+</button>
          </div>
          <span class="carrito-item-subtotal">Subtotal: $U ${(item.precio * item.cantidad).toLocaleString('es-UY')}</span>
        </div>
      </li>
    `;
  }).join('');

  const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
  elementos.totalCarrito.textContent = `Total: $U ${total.toLocaleString('es-UY')}`;

  // listeners +/-
  elementos.listaCarrito.querySelectorAll('.disminuir-cantidad').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      const item = carrito.find(i => i.id === id);
      if (item && item.cantidad > 1) {
        item.cantidad--;
        const productRef = ref(db, `productos/${id}/stock`);
        runTransaction(productRef, (currentStock) => {
          if (typeof currentStock !== 'number' || isNaN(currentStock)) currentStock = 0;
          return currentStock + 1;
        }).then(() => {
          guardarCarrito();
          renderizarCarrito();
          renderizarProductos();
          mostrarNotificacion(`Reducida cantidad de "${item.nombre}"`, 'info');
        }).catch(error => {
          console.error("Error disminuir cantidad:", error);
          mostrarNotificacion("Error al actualizar cantidad", "error");
        });
      }
    });
  });

  elementos.listaCarrito.querySelectorAll('.aumentar-cantidad').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      agregarAlCarrito(id, 1);
    });
  });
}

// ===============================
// RENDER: PRODUCTOS + PAGINACIÓN
// ===============================
function crearCardProducto(p) {
  const enCarrito = carrito.find(i => i.id === p.id);
  const disp = Math.max(0, p.stock - (enCarrito?.cantidad || 0));
  const agot = disp <= 0;
  const imagenPrincipal = p.imagenes?.[0] || PLACEHOLDER_IMAGE;

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
        <button class="boton-aviso-stock" data-nombre="${p.nombre.replace(/'/g, "\\'")}" style="background-color:#ffd93b;color:#333;font-weight:bold;">
          📩 Avisame cuando haya stock
        </button>` : ''}
      </div>
      <button class="boton-detalles" data-id="${p.id}">🔍 Ver Detalle</button>
    </div>
  `;
}

function filtrarProductos() {
  return productos.filter(p => {
    if (!p) return false;
    const { precioMin, precioMax, categoria, busqueda } = filtrosActuales;
    const b = busqueda?.toLowerCase() || "";
    const matchesPrice = (p.precio >= precioMin) && (p.precio <= precioMax);
    const matchesCategory = (categoria === 'todos' || p.categoria === categoria);
    const matchesSearch = (!b || p.nombre.toLowerCase().includes(b) || p.descripcion.toLowerCase().includes(b));
    return matchesPrice && matchesCategory && matchesSearch;
  });
}

function renderizarProductos() {
  const productosFiltrados = filtrarProductos();
  const inicio = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
  const paginados = productosFiltrados.slice(inicio, inicio + PRODUCTOS_POR_PAGINA);

  if (!elementos.galeriaProductos) return;

  elementos.galeriaProductos.innerHTML = paginados.length
    ? paginados.map(crearCardProducto).join('')
    : '<p class="sin-productos">No se encontraron productos que coincidan con los filtros.</p>';

  renderizarPaginacion(productosFiltrados.length);
}

function renderizarPaginacion(totalProductos) {
  const totalPages = Math.ceil(totalProductos / PRODUCTOS_POR_PAGINA);
  const pag = elementos.paginacion;
  if (!pag) return;

  pag.innerHTML = '';
  if (totalPages <= 1) return;

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    btn.className = i === paginaActual ? 'active' : '';
    btn.addEventListener('click', () => {
      paginaActual = i;
      renderizarProductos();

      // Hacé scroll solo si estás por encima de la galería (no "sube" toda la página)
      const targetTop = elementos.galeriaProductos.offsetTop - 100;
      if (window.scrollY + 10 < targetTop) {
        window.scrollTo({ top: targetTop, behavior: 'smooth' });
      }
    });
    pag.appendChild(btn);
  }
}

// ===============================
// MODAL DE PRODUCTO
// ===============================
function ensureProductModal() {
  if (!document.getElementById('producto-modal')) {
    const modal = document.createElement('div');
    modal.id = 'producto-modal';
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="modal-backdrop" data-close="1"></div>
      <div class="modal-content" id="modal-contenido"></div>
    `;
    document.body.appendChild(modal);
  }

  elementos.productoModal = document.getElementById('producto-modal');
  elementos.modalContenido = document.getElementById('modal-contenido');

  // cerrar por fondo o ESC
  elementos.productoModal.addEventListener('click', (e) => {
    if (e.target.dataset.close === '1') cerrarModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elementos.productoModal.classList.contains('active')) cerrarModal();
  });
}

function mostrarModalProducto(producto) {
  const modal = elementos.productoModal;
  const contenido = elementos.modalContenido;
  if (!modal || !contenido) return;

  const enCarrito = carrito.find(item => item.id === producto.id) || { cantidad: 0 };
  const disponibles = Math.max(0, producto.stock - enCarrito.cantidad);
  const agotado = disponibles <= 0;
  let currentIndex = 0;

  function render() {
    contenido.innerHTML = `
      <button class="cerrar-modal" aria-label="Cerrar modal" onclick="cerrarModal()">&times;</button>
      <div class="modal-flex">
        <div class="modal-carrusel">
          <img id="modal-imagen" src="${producto.imagenes[currentIndex] || PLACEHOLDER_IMAGE}" class="modal-img" alt="${producto.nombre}">
          ${producto.imagenes.length > 1 ? `
            <div class="modal-controls">
              <button class="modal-prev" aria-label="Imagen anterior" ${currentIndex === 0 ? 'disabled' : ''}>
                <svg width="26" height="26" viewBox="0 0 26 26"><polyline points="17 22 9 13 17 4" fill="none" stroke="#2e7d32" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <button class="modal-next" aria-label="Siguiente imagen" ${currentIndex === producto.imagenes.length - 1 ? 'disabled' : ''}>
                <svg width="26" height="26" viewBox="0 0 26 26"><polyline points="9 4 17 13 9 22" fill="none" stroke="#2e7d32" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>` : ''}
          <div class="modal-thumbnails">
            ${producto.imagenes.map((img, i) =>
              `<img src="${img}" class="thumbnail ${i === currentIndex ? 'active' : ''}" data-index="${i}" alt="Miniatura ${i + 1}">`
            ).join('')}
          </div>
        </div>
        <div class="modal-info">
          <h1 class="modal-nombre">${producto.nombre}</h1>
          <p class="modal-precio">$U ${producto.precio.toLocaleString('es-UY')}</p>
          <p class="modal-stock ${agotado ? 'agotado' : 'disponible'}">
            ${agotado ? 'AGOTADO' : `Disponible: ${disponibles}`}
          </p>
          <div class="modal-descripcion">
            ${producto.descripcion || ''}
            <br>
            ${producto.adicionales ? `<small><b>Adicionales:</b> ${producto.adicionales}</small><br>` : ''}
            ${(producto.alto || producto.ancho || producto.profundidad)
              ? `<small><b>Medidas:</b> ${producto.alto ? producto.alto + ' cm (alto)' : ''}${producto.ancho ? ' x ' + producto.ancho + ' cm (ancho)' : ''}${producto.profundidad ? ' x ' + producto.profundidad + ' cm (prof.)' : ''}</small>`
              : ''}
          </div>
          <div class="modal-acciones">
            <input type="number" value="1" min="1" max="${disponibles}" class="cantidad-modal-input" ${agotado ? 'disabled' : ''}>
            <button class="boton-agregar-modal ${agotado ? 'agotado' : ''}" data-id="${producto.id}" ${agotado ? 'disabled' : ''}>
              ${agotado ? 'Agotado' : 'Agregar al carrito'}
            </button>
          </div>
        </div>
      </div>
    `;

    const prev = contenido.querySelector('.modal-prev');
    const next = contenido.querySelector('.modal-next');
    const thumbs = contenido.querySelectorAll('.thumbnail');
    const addBtn = contenido.querySelector('.boton-agregar-modal');
    const qty = contenido.querySelector('.cantidad-modal-input');

    prev?.addEventListener('click', () => { if (currentIndex > 0) { currentIndex--; render(); } });
    next?.addEventListener('click', () => { if (currentIndex < producto.imagenes.length - 1) { currentIndex++; render(); } });
    thumbs.forEach(th => th.addEventListener('click', () => { currentIndex = parseInt(th.dataset.index); render(); }));
    addBtn?.addEventListener('click', () => {
      const cantidad = Math.max(1, parseInt(qty.value));
      agregarAlCarrito(producto.id, cantidad, addBtn);
    });
  }

  render();
  modal.classList.add('active');
  document.body.classList.add('no-scroll');
}

function cerrarModal() {
  if (elementos.productoModal) {
    elementos.productoModal.classList.remove('active');
    document.body.classList.remove('no-scroll');
  }
}
window.cerrarModal = cerrarModal;

// ===============================
// COMPRA
// ===============================
function agregarAlCarrito(id, cantidad = 1, boton = null) {
  if (!Number.isFinite(id)) {
    mostrarNotificacion("ID de producto inválido", "error");
    return;
  }

  const producto = productos.find(p => p.id === id);
  if (!producto) {
    mostrarNotificacion("Producto no encontrado", "error");
    return;
  }

  const cantidadAgregar = Math.max(1, parseInt(cantidad));
  if (!Number.isFinite(cantidadAgregar)) {
    mostrarNotificacion("Cantidad inválida", "error");
    return;
  }

  const enCarrito = carrito.find(item => item.id === id);
  const yaEnCarrito = enCarrito ? enCarrito.cantidad : 0;
  const stockDisponible = producto.stock - yaEnCarrito;

  if (stockDisponible < cantidadAgregar) {
    mostrarNotificacion("Stock insuficiente", "error");
    return;
  }

  let original = null;
  if (boton) {
    boton.disabled = true;
    original = boton.innerHTML;
    boton.innerHTML = `Agregando <span class="spinner"></span>`;
  }

  const productRef = ref(db, `productos/${id}/stock`);
  runTransaction(productRef, (currentStock) => {
    if (typeof currentStock !== 'number' || isNaN(currentStock)) currentStock = 0;
    if (currentStock < cantidadAgregar) return undefined; // abort
    return currentStock - cantidadAgregar;
  }).then((res) => {
    if (!res.committed) {
      mostrarNotificacion('❌ Stock actualizado por otro usuario. Probá de nuevo.', 'error');
      return;
    }

    if (enCarrito) enCarrito.cantidad += cantidadAgregar;
    else {
      carrito.push({
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        cantidad: cantidadAgregar,
        imagen: producto.imagenes?.[0] || PLACEHOLDER_IMAGE
      });
    }

    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion("✅ Producto agregado", "exito");

  }).catch((error) => {
    console.error("Error agregar carrito:", error);
    mostrarNotificacion("⚠️ Error inesperado al agregar", "error");
  }).finally(() => {
    if (boton) {
      boton.disabled = false;
      boton.innerHTML = original;
    }
  });
}

// ===============================
// UI / FILTROS
// ===============================
function actualizarCategorias() {
  if (!elementos.selectCategoria) return;
  const cats = ['todos', ...new Set(productos.map(p => p.categoria).filter(Boolean).sort())];
  elementos.selectCategoria.innerHTML = cats
    .map(cat => `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`)
    .join('');
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
// FAQ
// ===============================
function inicializarFAQ() {
  const toggles = document.querySelectorAll('.faq-toggle');
  toggles.forEach(toggle => {
    toggle.addEventListener('click', () => {
      const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', !isExpanded);
      const content = toggle.nextElementSibling;
      if (content) content.hidden = isExpanded;
    });
  });
}

// ===============================
// MENÚ HAMBURGUESA
// ===============================
function inicializarMenuHamburguesa() {
  const hamburguesa = elementos.hamburguesa;
  const menu = elementos.menu;
  if (!hamburguesa || !menu) return;

  hamburguesa.addEventListener('click', () => {
    const expanded = menu.classList.toggle('active');
    hamburguesa.setAttribute('aria-expanded', expanded);
    document.body.classList.toggle('no-scroll', expanded);
  });

  menu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      menu.classList.remove('active');
      hamburguesa.setAttribute('aria-expanded', false);
      document.body.classList.remove('no-scroll');
    });
  });
}

// ===============================
// CONTACTO (EmailJS opcional)
// ===============================
function setupContactForm() {
  const form = document.getElementById('formContacto');
  const ok = document.getElementById('successMessage');
  const err = document.getElementById('errorMessage');

  if (form && window.emailjs) {
    emailjs.init("YOUR_EMAILJS_USER_ID");
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const nombre = document.getElementById('nombre').value;
      const email = document.getElementById('email').value;
      const mensaje = document.getElementById('mensaje').value;

      emailjs.send('service_89by24g', 'template_8mn7hdp', {
        from_name: nombre, from_email: email, message: mensaje
      }).then(() => {
        ok.classList.remove('hidden'); err.classList.add('hidden'); form.reset();
        setTimeout(() => ok.classList.add('hidden'), 3000);
      }, (error) => {
        console.error('EmailJS error:', error);
        err.classList.remove('hidden'); ok.classList.add('hidden');
        err.textContent = 'Error al enviar el mensaje. Intenta de nuevo.';
        setTimeout(() => err.classList.add('hidden'), 3000);
      });
    });
  }
}

// ===============================
// INIT
// ===============================
function init() {
  inicializarMenuHamburguesa();
  inicializarFAQ();
  setupContactForm();
  inicializarEventos();
  updateRange();
}

// ===============================
// EVENTOS (delegación de la galería incluida)
// ===============================
function inicializarEventos() {
  elementos.carritoBtnMain?.addEventListener('click', () => toggleCarrito(true));
  elementos.carritoOverlay?.addEventListener('click', () => toggleCarrito(false));
  elementos.btnCerrarCarrito?.addEventListener('click', () => toggleCarrito(false));

  document.getElementById('select-envio')?.addEventListener('change', actualizarResumenPedido);
  elementos.btnVaciarCarrito?.addEventListener('click', vaciarCarrito);

  elementos.btnFinalizarCompra?.addEventListener('click', () => {
    if (carrito.length === 0) return mostrarNotificacion('El carrito está vacío', 'error');
    elementos.avisoPreCompraModal.style.display = 'flex';
    elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'false');
  });

  elementos.btnEntendidoAviso?.addEventListener('click', () => {
    const modalEnvio = document.getElementById('modal-datos-envio');
    if (modalEnvio) {
      elementos.avisoPreCompraModal.style.display = 'none';
      elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'true');
      modalEnvio.style.display = 'flex';
      modalEnvio.classList.add('visible');
      actualizarResumenPedido();
    }
  });

  elementos.btnCancelarAviso?.addEventListener('click', () => {
    elementos.avisoPreCompraModal.style.display = 'none';
    elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'true');
  });

  elementos.inputBusqueda?.addEventListener('input', (e) => {
    filtrosActuales.busqueda = e.target.value.toLowerCase();
    aplicarFiltros();
  });

  elementos.selectCategoria?.addEventListener('change', (e) => {
    filtrosActuales.categoria = e.target.value;
    aplicarFiltros();
  });

  elementos.precioMinInput?.addEventListener('input', () => { updateRange(); aplicarFiltros(); });
  elementos.precioMaxInput?.addEventListener('input', () => { updateRange(); aplicarFiltros(); });

  elementos.aplicarRangoBtn?.addEventListener('click', () => {
    filtrosActuales.precioMin = parseInt(elementos.precioMinInput.value);
    filtrosActuales.precioMax = parseInt(elementos.precioMaxInput.value);
    aplicarFiltros();
  });

  // Delegación de eventos robusta para la galería de productos
  const root = elementos.galeriaProductos;
  if (!root) return;

  // Evita duplicados si re-inicializás
  if (root._pfDelegationAttached) {
    root.removeEventListener('click', root._pfDelegationAttached);
    root.removeEventListener('keydown', root._pfDelegationKeydown);
  }

  const clickHandler = (e) => {
    const card = e.target.closest('.producto-card');
    if (!card || !root.contains(card)) return;

    const id = Number(card.dataset.id);
    if (!Number.isFinite(id)) return;

    const producto = productos.find(p => p.id === id);
    if (!producto) return;

    const trigger = e.target.closest('[data-action], button, a');
    if (!trigger) return;

    const action =
      trigger.dataset.action ||
      (trigger.classList.contains('boton-detalles') ? 'detalle' :
       trigger.classList.contains('boton-agregar')  ? 'agregar' :
       trigger.classList.contains('boton-aviso-stock') ? 'aviso' : '');

    if (!action) return;

    e.preventDefault();
    e.stopPropagation();

    switch (action) {
      case 'detalle':
        ensureProductModal();
        verDetalle(id);
        break;
      case 'agregar':
        agregarAlCarrito(id, 1, trigger.closest('button'));
        break;
      case 'aviso':
        preguntarStock(trigger.dataset.nombre || producto.nombre);
        break;
    }
  };

  const keyHandler = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const btn = e.target.closest('.boton-detalles, .boton-agregar, .boton-aviso-stock, [data-action]');
    if (btn) { e.preventDefault(); btn.click(); }
  };

  root.addEventListener('click', clickHandler);
  root.addEventListener('keydown', keyHandler);

  root._pfDelegationAttached = clickHandler;
  root._pfDelegationKeydown = keyHandler;
}

// ===============================
// RESUMEN PEDIDO / ENVÍO
// ===============================
function actualizarResumenPedido() {
  const resumenProductos = document.getElementById('resumen-productos');
  const resumenTotal = document.getElementById('resumen-total');
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

  const envioSelect = document.getElementById('select-envio');
  const metodoEnvio = envioSelect ? envioSelect.value : 'retiro';
  let costoEnvio = 0;
  if (metodoEnvio === 'montevideo') costoEnvio = 150;
  else if (metodoEnvio === 'interior') costoEnvio = 300;

  html += `
    <div class="resumen-item resumen-subtotal">
      <span>Subtotal:</span>
      <span>$U ${subtotal.toLocaleString('es-UY')}</span>
    </div>
    ${metodoEnvio !== 'retiro' ? `
    <div class="resumen-item resumen-envio">
      <span>Envío (${metodoEnvio === 'montevideo' ? 'Montevideo' : 'Interior'}):</span>
      <span>$U ${costoEnvio.toLocaleString('es-UY')}</span>
    </div>` : ''}
  `;

  resumenProductos.innerHTML = html;
  const total = subtotal + costoEnvio;
  resumenTotal.textContent = `$U ${total.toLocaleString('es-UY')}`;

  const grupoDireccion = document.getElementById('grupo-direccion');
  const inputDireccion = document.getElementById('input-direccion');
  if (grupoDireccion && inputDireccion) {
    if (metodoEnvio === 'retiro') {
      grupoDireccion.style.display = 'none';
      inputDireccion.required = false;
    } else {
      grupoDireccion.style.display = 'flex';
      inputDireccion.required = true;
    }
  }
}

document.getElementById('btn-cerrar-modal-envio')?.addEventListener('click', function() {
  const modalEnvio = document.getElementById('modal-datos-envio');
  modalEnvio.classList.remove('visible');
  modalEnvio.setAttribute('aria-hidden', 'true');
  setTimeout(() => { modalEnvio.style.display = 'none'; }, 300);
});

document.getElementById('form-envio')?.addEventListener('submit', async function(e) {
  e.preventDefault();

  const nombre = document.getElementById('input-nombre').value.trim();
  const apellido = document.getElementById('input-apellido').value.trim();
  const telefono = document.getElementById('input-telefono').value.trim();
  const envio = document.getElementById('select-envio').value;
  const direccion = envio !== 'retiro' ? document.getElementById('input-direccion').value.trim() : '';
  const notas = document.getElementById('input-notas').value.trim();

  if (!nombre || !apellido || !telefono || (envio !== 'retiro' && !direccion)) {
    mostrarNotificacion('Completá todos los campos obligatorios', 'error');
    return;
  }

  // Validar stock por las dudas
  for (const item of carrito) {
    const pReal = productos.find(p => p.id === item.id);
    if (!pReal || pReal.stock < item.cantidad) {
      mostrarNotificacion(`Stock insuficiente para "${item.nombre}"`, 'error');
      return;
    }
  }

  let msg = `¡Hola Patofelting! Quiero hacer un pedido:\n\n`;
  msg += `*📋 Detalles del pedido:*\n`;
  carrito.forEach(item => {
    msg += `➤ ${item.nombre} x${item.cantidad} - $U ${(item.precio * item.cantidad).toLocaleString('es-UY')}\n`;
  });

  const subtotal = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
  const costoEnvio = envio === 'montevideo' ? 150 : envio === 'interior' ? 300 : 0;
  const total = subtotal + costoEnvio;

  msg += `\n*💰 Total:*\n`;
  msg += `Subtotal: $U ${subtotal.toLocaleString('es-UY')}\n`;
  msg += `Envío: $U ${costoEnvio.toLocaleString('es-UY')}\n`;
  msg += `*TOTAL A PAGAR: $U ${total.toLocaleString('es-UY')}*\n\n`;
  msg += `*👤 Datos del cliente:*\n`;
  msg += `Nombre: ${nombre} ${apellido}\n`;
  msg += `Teléfono: ${telefono}\n`;
  msg += `Método de envío: ${envio === 'montevideo' ? 'Envío Montevideo ($150)' : envio === 'interior' ? 'Envío Interior ($300)' : 'Retiro en local (Gratis)'}\n`;
  if (envio !== 'retiro') msg += `Dirección: ${direccion}\n`;
  if (notas) msg += `\n*📝 Notas adicionales:*\n${notas}`;

  const numeroWhatsApp = '59893566283';
  sessionStorage.setItem('ultimoPedidoWhatsApp', msg);

  const url = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(msg)}`;
  const win = window.open(url, '_blank');
  if (!win || win.closed || typeof win.closed === 'undefined') {
    window.location.href = `https://api.whatsapp.com/send?phone=${numeroWhatsApp}&text=${encodeURIComponent(msg)}`;
  }

  setTimeout(() => {
    document.getElementById('modal-datos-envio')?.classList.remove('visible');
    document.getElementById('modal-datos-envio')?.setAttribute('aria-hidden', 'true');
    setTimeout(() => {
      const m = document.getElementById('modal-datos-envio');
      if (m) m.style.display = 'none';
      carrito = [];
      guardarCarrito();
      actualizarUI();
      mostrarNotificacion('Pedido listo para enviar por WhatsApp', 'exito');
      document.getElementById('form-envio')?.reset();
    }, 300);
  }, 1000);
});

// ===============================
// SLIDERS DE PRECIO
// ===============================
const minSlider = document.getElementById('min-slider');
const maxSlider = document.getElementById('max-slider');
const minPriceSpan = document.getElementById('min-price');
const maxPriceSpan = document.getElementById('max-price');
const range = document.querySelector('.range');

function updateRange() {
  if (!minSlider || !maxSlider || !minPriceSpan || !maxPriceSpan || !range) return;

  let minVal = parseInt(minSlider.value);
  let maxVal = parseInt(maxSlider.value);
  if (minVal > maxVal) {
    [minVal, maxVal] = [maxVal, minVal];
    minSlider.value = minVal;
    maxSlider.value = maxVal;
  }

  const sliderMax = parseInt(minSlider.max || '3000');
  const pctMin = (minVal / sliderMax) * 100;
  const pctMax = (maxVal / sliderMax) * 100;

  range.style.left = pctMin + '%';
  range.style.width = (pctMax - pctMin) + '%';

  minPriceSpan.textContent = `$U${minVal}`;
  maxPriceSpan.textContent = `$U${maxVal}`;

  filtrosActuales.precioMin = minVal;
  filtrosActuales.precioMax = maxVal;
}

if (minSlider && maxSlider) {
  minSlider.addEventListener('input', updateRange);
  maxSlider.addEventListener('input', updateRange);
  updateRange();
}

// ===============================
// OTRAS UTILIDADES
// ===============================
function preguntarStock(nombreProducto) {
  const asunto = encodeURIComponent(`Consulta sobre disponibilidad de "${nombreProducto}"`);
  const cuerpo = encodeURIComponent(`Hola Patofelting,\n\nMe gustaría saber cuándo estará disponible el producto: ${nombreProducto}\n\nSaludos,\n[Tu nombre]`);
  window.location.href = `mailto:patofelting@gmail.com?subject=${asunto}&body=${cuerpo}`;
}

function verDetalle(id) {
  const producto = productos.find(p => p.id === id);
  if (producto) {
    mostrarModalProducto(producto);
  } else {
    mostrarNotificacion("Producto no encontrado", "error");
  }
}
window.verDetalle = verDetalle;
window.agregarAlCarrito = agregarAlCarrito;
window.preguntarStock = preguntarStock;
