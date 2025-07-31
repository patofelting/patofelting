// ========== CONFIGURACIÓN GLOBAL ==========
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const PLACEHOLDER_IMAGE = 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

// ========== INICIALIZAR FIREBASE (CON MANEJO DE ERRORES) ==========
let db = null;
let auth = null;

async function inicializarFirebase() {
  try {
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js");
    const { getAuth, signInAnonymously } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");
    const { getDatabase, ref, onValue } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");

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
    db = getDatabase(app);
    auth = getAuth(app);
    await signInAnonymously(auth);
    
    // ✅ Hacerlo accesible en todo el sitio:
    window.firebaseDatabase = db;
    
    console.log('Firebase initialized successfully');
    return { db, auth, ref, onValue };
  } catch (error) {
    console.warn('Firebase initialization failed:', error);
    return null;
  }
}

// ========== ESTADO GLOBAL ==========
let productos = [];
let carrito = [];
let paginaActual = 1;
let filtrosActuales = {
  precioMin: null,
  precioMax: null,
  categoria: 'todos',
  busqueda: '',
  stock: 'todos'  // Nueva opción de filtrado por stock
};

// ========== REFERENCIAS DOM ==========
function getEl(id) { return document.getElementById(id); }
const elementos = {
  galeria: getEl('galeria-productos'),
  paginacion: getEl('paginacion'),
  modal: getEl('producto-modal'),
  modalContenido: getEl('modal-contenido'),
  carritoBtn: getEl('carrito-btn-main'),
  carritoPanel: getEl('carrito-panel'),
  carritoOverlay: document.querySelector('.carrito-overlay'),
  listaCarrito: getEl('lista-carrito'),
  totalCarrito: getEl('total'),
  contadorCarrito: getEl('contador-carrito'),
  inputBusqueda: document.querySelector('.input-busqueda'),
  selectCategoria: getEl('filtro-categoria'),
  selectStock: getEl('filtro-stock'),
  minSlider: getEl('min-slider'),
  maxSlider: getEl('max-slider'),
  resetFiltros: document.querySelector('.boton-resetear-filtros'),
  btnCerrarCarrito: document.querySelector('.cerrar-carrito'),
  btnVaciarCarrito: document.querySelector('.boton-vaciar-carrito'),
  btnFinalizarCompra: document.querySelector('.boton-finalizar-compra'),
  faqToggles: document.querySelectorAll('.faq-toggle')
};

// ========== UTILIDADES ==========
function mostrarNotificacion(msg, tipo = 'exito') {
  const noti = document.createElement('div');
  noti.className = `notificacion ${tipo}`;
  noti.textContent = msg;
  document.body.appendChild(noti);
  setTimeout(() => noti.classList.add('show'), 10);
  setTimeout(() => {
    noti.classList.remove('show');
    setTimeout(() => noti.remove(), 300);
  }, 2200);
}

// ========== CARRITO (SOLO FRONTEND) ==========
function guardarCarrito() {
  localStorage.setItem(LS_CARRITO_KEY, JSON.stringify(carrito));
  actualizarContadorCarrito();
}
function cargarCarrito() {
  carrito = JSON.parse(localStorage.getItem(LS_CARRITO_KEY)) || [];
  actualizarContadorCarrito();
}
function actualizarContadorCarrito() {
  const total = carrito.reduce((a, i) => a + i.cantidad, 0);
  if (elementos.contadorCarrito) {
    elementos.contadorCarrito.textContent = total;
    elementos.contadorCarrito.classList.toggle('visible', total > 0);
  }
}
function renderizarCarrito() {
  if (!elementos.listaCarrito || !elementos.totalCarrito) return;
  if (carrito.length === 0) {
    elementos.listaCarrito.innerHTML = '<p class="carrito-vacio">Tu carrito está vacío</p>';
    elementos.totalCarrito.textContent = 'Total: $U 0';
    return;
  }
  elementos.listaCarrito.innerHTML = carrito.map(item => {
    const prod = productos.find(p => p.id === item.id) || item;
    const disponibles = Math.max(0, prod.stock - item.cantidad);
    return `
      <li class="carrito-item" data-id="${item.id}">
        <img src="${prod.imagenes?.[0] || PLACEHOLDER_IMAGE}" class="carrito-item-img" alt="${prod.nombre}">
        <div class="carrito-item-info">
          <span class="carrito-item-nombre">${prod.nombre}</span>
          <span class="carrito-item-precio">$U ${prod.precio.toLocaleString('es-UY')}</span>
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
  const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
  elementos.totalCarrito.textContent = `Total: $U ${total.toLocaleString('es-UY')}`;
  document.querySelectorAll('.disminuir-cantidad').forEach(btn => {
    btn.onclick = () => modificarCantidadEnCarrito(parseInt(btn.dataset.id), -1);
  });
  document.querySelectorAll('.aumentar-cantidad').forEach(btn => {
    btn.onclick = () => modificarCantidadEnCarrito(parseInt(btn.dataset.id), 1);
  });
}
function modificarCantidadEnCarrito(id, delta) {
  const item = carrito.find(i => i.id === id);
  if (!item) return;
  const prod = productos.find(p => p.id === id);
  if (delta > 0 && item.cantidad < prod.stock) {
    item.cantidad++;
  } else if (delta < 0 && item.cantidad > 1) {
    item.cantidad--;
  }
  guardarCarrito();
  renderizarCarrito();
  renderizarProductos();
}

// ========== LECTURA DE PRODUCTOS (MANEJA FIREBASE OPCIONAL) ==========
async function escucharProductosFirebase() {
  const firebase = await inicializarFirebase();
  
  if (!firebase) {
    console.log('Firebase not available, loading without real-time data');
    // Continuar sin Firebase - la página funciona sin productos en vivo
    renderizarProductos();
    renderizarCarrito();
    actualizarCategorias();
    return;
  }

  const { db, ref, onValue } = firebase;
  const productosRef = ref(db, 'productos');
  
  onValue(productosRef, snap => {
    const data = snap.val();
    productos = [];
    for (let key in data) {
      productos.push({
        ...data[key],
        id: data[key].id ? parseInt(data[key].id) : parseInt(key),
        imagenes: Array.isArray(data[key].imagenes) ? data[key].imagenes : [PLACEHOLDER_IMAGE],
        precio: parseFloat(data[key].precio) || 0,
        stock: parseInt(data[key].stock) || 0,
        categoria: (data[key].categoria || 'otros').toLowerCase()
      });
    }
    // Sync carrito: Si stock bajó, ajusta cantidades
    let cambiado = false;
    carrito.forEach(item => {
      const prod = productos.find(p => p.id === item.id);
      if (prod && item.cantidad > prod.stock) {
        item.cantidad = prod.stock;
        cambiado = true;
      }
      if (prod && prod.stock === 0) {
        item.cantidad = 0;
        cambiado = true;
      }
    });
    if (cambiado) {
      carrito = carrito.filter(i => i.cantidad > 0);
      guardarCarrito();
      mostrarNotificacion("⚠️ ¡Stock actualizado!", "info");
    }
    renderizarProductos();
    renderizarCarrito();
    actualizarCategorias();
  });
}

// ========== RENDER Y FILTROS ==========
function filtrarProductos() {
  const { precioMin, precioMax, categoria, busqueda, stock } = filtrosActuales;
  return productos.filter(p => {
    // Calcular disponibilidad
    const enCarrito = carrito.find(i => i.id === p.id);
    const disponible = Math.max(0, p.stock - (enCarrito?.cantidad || 0)) > 0;
    
    return (
      (precioMin == null || p.precio >= precioMin) &&
      (precioMax == null || p.precio <= precioMax) &&
      (categoria === 'todos' || p.categoria === categoria) &&
      (!busqueda || p.nombre.toLowerCase().includes(busqueda)) &&
      // IMPORTANTE: Solo filtrar por stock si explícitamente se selecciona, sino mostrar todos
      (stock === 'todos' || 
       (stock === 'disponible' && disponible) || 
       (stock === 'agotado' && !disponible))
    );
  });
}
function renderizarProductos() {
  const productosFiltrados = filtrarProductos();
  const inicio = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
  const paginados = productosFiltrados.slice(inicio, inicio + PRODUCTOS_POR_PAGINA);
  if (!elementos.galeria) return;
  if (paginados.length === 0) {
    elementos.galeria.innerHTML = '<p class="sin-productos">No se encontraron productos.</p>';
    return;
  }
  elementos.galeria.innerHTML = paginados.map(crearCardProducto).join('');
  renderizarPaginacion(productosFiltrados.length);
  elementos.galeria.querySelectorAll('.producto-card').forEach(card => {
    card.querySelector('.boton-agregar')?.addEventListener('click', e => {
      e.stopPropagation();
      agregarAlCarrito(parseInt(card.dataset.id), 1);
    });
    card.querySelector('.boton-detalles')?.addEventListener('click', e => {
      e.stopPropagation();
      verDetalle(parseInt(card.dataset.id));
    });
  });
}
function crearCardProducto(p) {
  const enCarrito = carrito.find(i => i.id === p.id);
  const disp = Math.max(0, p.stock - (enCarrito?.cantidad || 0));
  const agot = disp <= 0;
  return `
    <div class="producto-card ${agot ? 'agotado' : ''}" data-id="${p.id}">
      <img src="${p.imagenes[0] || PLACEHOLDER_IMAGE}" alt="${p.nombre}" class="producto-img">
      <h3 class="producto-nombre">${p.nombre}</h3>
      <p class="producto-precio">$U ${p.precio.toLocaleString('es-UY')}</p>
      <div class="card-acciones">
        <button class="boton-agregar${agot ? ' agotado' : ''}" ${agot ? 'disabled' : ''}>
          ${agot ? 'Agotado' : 'Agregar'}
        </button>
        <button class="boton-detalles">Ver Detalle</button>
      </div>
    </div>
  `;
}
function renderizarPaginacion(total) {
  if (!elementos.paginacion) return;
  const totalPages = Math.ceil(total / PRODUCTOS_POR_PAGINA);
  if (totalPages <= 1) return elementos.paginacion.innerHTML = '';
  elementos.paginacion.innerHTML = '';
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    btn.className = i === paginaActual ? 'active' : '';
    btn.onclick = () => {
      paginaActual = i;
      renderizarProductos();
    };
    elementos.paginacion.appendChild(btn);
  }
}
function actualizarCategorias() {
  if (!elementos.selectCategoria) return;
  const cats = ['todos', ...new Set(productos.map(p => p.categoria).filter(Boolean))];
  elementos.selectCategoria.innerHTML = cats
    .map(cat => `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`)
    .join('');
}

// ========== AGREGAR AL CARRITO ==========
function agregarAlCarrito(id, cantidad = 1) {
  const prod = productos.find(p => p.id === id);
  if (!prod || prod.stock < cantidad) {
    mostrarNotificacion("❌ Stock insuficiente", "error");
    return;
  }
  const item = carrito.find(i => i.id === id);
  if (item) {
    if (item.cantidad + cantidad > prod.stock) {
      mostrarNotificacion("❌ Stock insuficiente", "error");
      return;
    }
    item.cantidad += cantidad;
  } else {
    carrito.push({ ...prod, cantidad });
  }
  guardarCarrito();
  renderizarCarrito();
  renderizarProductos();
  mostrarNotificacion("✅ Producto agregado al carrito", "exito");
}
window.agregarAlCarrito = agregarAlCarrito;

// ========== MODAL DETALLE ==========
function verDetalle(id) {
  const prod = productos.find(p => p.id === id);
  if (!prod) return mostrarNotificacion("Producto no encontrado", "error");
  mostrarModalProducto(prod);
}
window.verDetalle = verDetalle;
function mostrarModalProducto(prod) {
  if (!elementos.modal || !elementos.modalContenido) return;
  let currentIndex = 0;
  function renderCarrusel() {
    const disp = Math.max(0, prod.stock - (carrito.find(i => i.id === prod.id)?.cantidad || 0));
    const agotado = disp <= 0;
    elementos.modalContenido.innerHTML = `
      <button class="cerrar-modal" aria-label="Cerrar modal">×</button>
      <div class="modal-flex">
        <div class="modal-carrusel">
          <img src="${prod.imagenes[currentIndex] || PLACEHOLDER_IMAGE}" class="modal-img" alt="${prod.nombre}">
          ${prod.imagenes.length > 1 ? `
            <div class="modal-controls">
              <button class="modal-prev" ${currentIndex === 0 ? 'disabled' : ''}>←</button>
              <button class="modal-next" ${currentIndex === prod.imagenes.length - 1 ? 'disabled' : ''}>→</button>
            </div>
          ` : ''}
          <div class="modal-thumbnails">
            ${prod.imagenes.map((img, i) =>
              `<img src="${img}" class="thumbnail ${i === currentIndex ? 'active' : ''}" data-index="${i}">`
            ).join('')}
          </div>
        </div>
        <div class="modal-info">
          <h1>${prod.nombre}</h1>
          <p>$U ${prod.precio.toLocaleString('es-UY')}</p>
          <p class="${agotado ? 'agotado' : 'disponible'}">${agotado ? 'AGOTADO' : `Disponible: ${disp}`}</p>
          <div class="modal-descripcion">${prod.descripcion || ''}</div>
          <div class="modal-acciones">
            <input type="number" value="1" min="1" max="${disp}" class="cantidad-modal-input" ${agotado ? 'disabled' : ''}>
            <button class="boton-agregar-modal${agotado ? ' agotado' : ''}" ${agotado ? 'disabled' : ''}>Agregar al carrito</button>
          </div>
        </div>
      </div>
    `;
    elementos.modalContenido.querySelector('.cerrar-modal').onclick = cerrarModal;
    elementos.modalContenido.querySelector('.modal-prev')?.addEventListener('click', () => { currentIndex--; renderCarrusel(); });
    elementos.modalContenido.querySelector('.modal-next')?.addEventListener('click', () => { currentIndex++; renderCarrusel(); });
    elementos.modalContenido.querySelectorAll('.thumbnail').forEach(th => {
      th.addEventListener('click', () => { currentIndex = parseInt(th.dataset.index); renderCarrusel(); });
    });
    elementos.modalContenido.querySelector('.boton-agregar-modal')?.addEventListener('click', () => {
      const inputCantidad = elementos.modalContenido.querySelector('.cantidad-modal-input');
      const cantidadAgregar = parseInt(inputCantidad.value, 10) || 1;
      agregarAlCarrito(prod.id, cantidadAgregar);
      cerrarModal();
    });
  }
  elementos.modal.classList.add('visible');
  renderCarrusel();
}
function cerrarModal() {
  elementos.modal?.classList.remove('visible');
}

// ========== MODAL CONFIRMACION COMPRA ==========
function mostrarModalConfirmacionCompra() {
  const modal = document.getElementById('modal-confirmacion-compra');
  if (!modal) return;
  
  modal.classList.remove('hidden');
  modal.classList.add('visible');
  
  // Agregar event listeners para cerrar el modal
  const btnCerrar = modal.querySelector('.cerrar-modal');
  const btnCerrarConfirmacion = modal.querySelector('.boton-cerrar-confirmacion');
  
  const cerrarModalConfirmacion = () => {
    modal.classList.remove('visible');
    modal.classList.add('hidden');
  };
  
  btnCerrar?.addEventListener('click', cerrarModalConfirmacion);
  btnCerrarConfirmacion?.addEventListener('click', cerrarModalConfirmacion);
  
  // Cerrar con Escape
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      cerrarModalConfirmacion();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
  
  // Cerrar haciendo click fuera del modal
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      cerrarModalConfirmacion();
    }
  });
}

function finalizarCompra() {
  if (carrito.length === 0) {
    mostrarNotificacion('❌ Tu carrito está vacío', 'error');
    return;
  }
  
  // Cerrar el carrito
  toggleCarrito(false);
  
  // Mostrar modal de confirmación
  mostrarModalConfirmacionCompra();
  
  // Vaciar carrito después de la compra
  carrito = [];
  guardarCarrito();
  renderizarCarrito();
  renderizarProductos();
}

// ========== CARRITO UI ==========
function toggleCarrito(forceState) {
  if (!elementos.carritoPanel || !elementos.carritoOverlay) return;
  let isOpen = typeof forceState === 'boolean'
    ? forceState
    : !elementos.carritoPanel.classList.contains('active');
  elementos.carritoPanel.classList.toggle('active', isOpen);
  elementos.carritoOverlay.classList.toggle('active', isOpen);
  document.body.classList.toggle('no-scroll', isOpen);
  if (isOpen) renderizarCarrito();
}

// ========== FILTROS, FAQ, EVENTOS ==========
function aplicarFiltros() {
  paginaActual = 1;
  renderizarProductos();
}
function resetearFiltros() {
  filtrosActuales = { precioMin: null, precioMax: null, categoria: 'todos', busqueda: '', stock: 'todos' };
  if (elementos.inputBusqueda) elementos.inputBusqueda.value = '';
  if (elementos.selectCategoria) elementos.selectCategoria.value = 'todos';
  if (elementos.selectStock) elementos.selectStock.value = 'todos';
  if (elementos.minSlider) elementos.minSlider.value = '';
  if (elementos.maxSlider) elementos.maxSlider.value = '';
  aplicarFiltros();
}
function inicializarFAQ() {
  document.querySelectorAll('.faq-toggle').forEach(toggle => {
    toggle.addEventListener('click', function () {
      const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', !isExpanded);
      const content = toggle.nextElementSibling;
      if (content) content.hidden = isExpanded;
    });
  });
}
function inicializarEventos() {
  elementos.carritoBtn?.addEventListener('click', () => toggleCarrito(true));
  elementos.carritoOverlay?.addEventListener('click', () => toggleCarrito(false));
  elementos.btnCerrarCarrito?.addEventListener('click', () => toggleCarrito(false));
  elementos.btnVaciarCarrito?.addEventListener('click', () => {
    carrito = [];
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion('🧹 Carrito vaciado', 'exito');
  });
  elementos.btnFinalizarCompra?.addEventListener('click', finalizarCompra);
  elementos.inputBusqueda?.addEventListener('input', e => {
    filtrosActuales.busqueda = e.target.value.toLowerCase();
    aplicarFiltros();
  });
  elementos.selectCategoria?.addEventListener('change', e => {
    filtrosActuales.categoria = e.target.value;
    aplicarFiltros();
  });
  elementos.selectStock?.addEventListener('change', e => {
    filtrosActuales.stock = e.target.value;
    aplicarFiltros();
  });
  elementos.minSlider?.addEventListener('input', e => {
    filtrosActuales.precioMin = e.target.value ? parseFloat(e.target.value) : null;
    aplicarFiltros();
  });
  elementos.maxSlider?.addEventListener('input', e => {
    filtrosActuales.precioMax = e.target.value ? parseFloat(e.target.value) : null;
    aplicarFiltros();
  });
  elementos.resetFiltros?.addEventListener('click', resetearFiltros);
  inicializarFAQ();
}

// ========== INICIO ==========
document.addEventListener('DOMContentLoaded', () => {
  escucharProductosFirebase();
  cargarCarrito();
  renderizarCarrito();
  inicializarEventos();
});
