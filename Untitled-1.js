// ===============================
// CONFIGURACIÓN GLOBAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const CSV_URL = window.SHEET_CSV_URL;
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

// ===============================
// IMPORTACIONES DE FIREBASE
// ===============================
// Importaciones explícitas para Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, get, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Configuración de Firebase
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

// ===============================
// ESTADO GLOBAL
// ===============================
let productos = [];
let carrito = [];
let paginaActual = 1;
let productoModalActual = null;
let imagenModalActual = 0;

let filtrosActuales = {
  precioMin: 0,
  precioMax: 3000,
  categoria: 'todos',
  busqueda: ''
};

// ===============================
// REFERENCIAS AL DOM
// ===============================
const getElement = id => document.getElementById(id);
const elementos = {
  galeriaProductos: getElement('galeria-productos'),
  paginacion: getElement('paginacion'),
  productoModal: getElement('producto-modal'),
  modalContenido: getElement('modal-contenido'),
  modalImagen: getElement('modal-imagen'),
  modalNombre: getElement('modal-nombre'),
  modalDescripcion: getElement('modal-descripcion'),
  modalPrecio: getElement('modal-precio'),
  modalCantidad: getElement('modal-cantidad'),
  modalAgregarCarrito: getElement('modal-agregar-carrito'),
  modalThumbnails: document.querySelector('.modal-thumbnails'),
  modalPrev: document.querySelector('.modal-prev'),
  modalNext: document.querySelector('.modal-next'),
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
// LOAD PRODUCTS ON PAGE LOAD
// ===============================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await signInAnonymously(auth);
    console.log('✅ Signed in anonymously to Firebase.');
    await cargarProductosDesdeFirebase();
  } catch (error) {
    console.error('❌ Error signing in to Firebase:', error);
    const errorMessage = error.code === 'auth/configuration-not-found'
      ? 'Autenticación anónima no está habilitada en Firebase. Por favor, contacta al administrador.'
      : error.code === 'auth/network-request-failed'
        ? 'Error de red. Por favor, verifica tu conexión a internet.'
        : 'Error de autenticación con Firebase.';
    mostrarNotificacion(errorMessage, 'error');
  }

  cargarCarrito();
  init();
});

// ===============================
// INICIALIZACIÓN
// ===============================
function init() {
  configurarEventListeners();
  configurarFiltros();
  configurarPriceSlider();
  actualizarContadorCarrito();
}

function configurarEventListeners() {
  console.log('🔧 Configurando event listeners...');

  // Cart events
  elementos.carritoBtnMain?.addEventListener('click', abrirCarrito);
  elementos.btnCerrarCarrito?.addEventListener('click', cerrarCarrito);
  elementos.carritoOverlay?.addEventListener('click', cerrarCarrito);
  elementos.btnVaciarCarrito?.addEventListener('click', vaciarCarrito);
  elementos.btnFinalizarCompra?.addEventListener('click', mostrarAvisoPreCompra);

  // Pre-purchase warning modal events
  elementos.btnEntendidoAviso?.addEventListener('click', () => {
    elementos.avisoPreCompraModal.hidden = true;
    mostrarModalDatosEnvio();
  });
  elementos.btnCancelarAviso?.addEventListener('click', () => {
    elementos.avisoPreCompraModal.hidden = true;
  });

  // Product modal events
  elementos.modalAgregarCarrito?.addEventListener('click', agregarDesdeModal);
  elementos.modalPrev?.addEventListener('click', () => cambiarImagenModal(-1));
  elementos.modalNext?.addEventListener('click', () => cambiarImagenModal(1));

  // Modal close events
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
      cerrarModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cerrarModal();
      cerrarCarrito();
    }
  });

  // Hamburger menu
  elementos.hamburguesa?.addEventListener('click', toggleMenu);

  // Range filter application
  elementos.aplicarRangoBtn?.addEventListener('click', aplicarRango);

  // Event delegation for product cards
  elementos.galeriaProductos?.addEventListener('click', handleProductCardClick);
}

function handleProductCardClick(e) {
  // Prevent rapid double clicks
  if (e.target.dataset.processing === 'true') {
    console.log('🚫 Clic ignorado - procesando anterior...');
    return;
  }

  const productCard = e.target.closest('.producto-card');
  if (!productCard) return;

  const productId = parseInt(productCard.dataset.id);
  const producto = productos.find(p => p.id === productId);
  if (!producto) return;

  // Handle different button clicks
  if (e.target.classList.contains('boton-agregar') || e.target.closest('.boton-agregar')) {
    e.preventDefault();
    e.stopPropagation();

    const button = e.target.classList.contains('boton-agregar') ? e.target : e.target.closest('.boton-agregar');
    if (button.dataset.processing === 'true') {
      console.log('🚫 Botón ya procesando, ignorando...');
      return;
    }

    button.dataset.processing = 'true';
    button.disabled = true;

    try {
      const cantidadInput = productCard.querySelector('.cantidad-input');
      const cantidad = cantidadInput ? parseInt(cantidadInput.value) || 1 : 1;
      console.log(`🎯 Clic en agregar - Producto: ${productId}, Cantidad: ${cantidad}`);
      agregarAlCarrito(productId, cantidad);
    } finally {
      setTimeout(() => {
        button.dataset.processing = 'false';
        button.disabled = producto.stock <= 0;
      }, 1000);
    }
  } else if (e.target.classList.contains('boton-detalles') || e.target.closest('.boton-detalles')) {
    e.preventDefault();
    e.stopPropagation();
    abrirModal(producto);
  } else {
    abrirModal(producto);
  }
}

function configurarFiltros() {
  elementos.inputBusqueda?.addEventListener('input', debounce(() => {
    filtrosActuales.busqueda = elementos.inputBusqueda.value.trim().toLowerCase();
    paginaActual = 1;
    renderizarProductos();
  }, 300));

  elementos.selectCategoria?.addEventListener('change', () => {
    filtrosActuales.categoria = elementos.selectCategoria.value;
    paginaActual = 1;
    renderizarProductos();
  });
}

function configurarPriceSlider() {
  if (!elementos.precioMinInput || !elementos.precioMaxInput) return;

  const updateSliderVisuals = () => {
    const min = parseInt(elementos.precioMinInput.value);
    const max = parseInt(elementos.precioMaxInput.value);

    document.getElementById('min-price')?.textContent = `$U${min}`;
    document.getElementById('max-price')?.textContent = `$U${max}`;

    const range = document.querySelector('.range');
    if (range) {
      const percent1 = (min / 3000) * 100;
      const percent2 = (max / 3000) * 100;
      range.style.left = percent1 + '%';
      range.style.width = (percent2 - percent1) + '%';
    }
  };

  elementos.precioMinInput.addEventListener('input', updateSliderVisuals);
  elementos.precioMaxInput.addEventListener('input', updateSliderVisuals);

  elementos.precioMinInput.addEventListener('change', () => {
    const min = parseInt(elementos.precioMinInput.value);
    const max = parseInt(elementos.precioMaxInput.value);
    if (min > max) {
      elementos.precioMinInput.value = max;
    }
    updateSliderVisuals();
  });

  elementos.precioMaxInput.addEventListener('change', () => {
    const min = parseInt(elementos.precioMinInput.value);
    const max = parseInt(elementos.precioMaxInput.value);
    if (max < min) {
      elementos.precioMaxInput.value = min;
    }
    updateSliderVisuals();
  });

  updateSliderVisuals();
}

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

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function toggleMenu() {
  elementos.menu?.classList.toggle('activo');
}

// ===============================
// CARRITO: FUNCIONES PRINCIPALES
// ===============================
function guardarCarrito() {
  localStorage.setItem(LS_CARRITO_KEY, JSON.stringify(carrito));
  actualizarContadorCarrito();
}

function cargarCarrito() {
  try {
    carrito = JSON.parse(localStorage.getItem(LS_CARRITO_KEY)) || [];
    actualizarContadorCarrito();
  } catch (e) {
    console.error("Error al cargar el carrito de localStorage:", e);
    carrito = [];
  }
}

async function vaciarCarrito() {
  if (carrito.length === 0) {
    mostrarNotificacion('El carrito ya está vacío', 'info');
    return;
  }

  try {
    const stockRestorePromises = carrito.map(async (item) => {
      const productRef = ref(db, `productos/${item.id}/stock`);
      await runTransaction(productRef, (currentStock) => {
        const validStock = Number.isFinite(currentStock) ? currentStock : 0;
        return validStock + item.cantidad;
      });
    });

    await Promise.all(stockRestorePromises);
    carrito = [];
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion('Carrito vaciado y stock restaurado correctamente', 'exito');
  } catch (error) {
    console.error("Error al vaciar el carrito y restaurar el stock:", error);
    mostrarNotificacion('Error al vaciar el carrito. Inténtalo de nuevo.', 'error');
  }
}

function actualizarContadorCarrito() {
  const total = carrito.reduce((sum, i) => sum + i.cantidad, 0);
  if (elementos.contadorCarrito) {
    elementos.contadorCarrito.textContent = total;
    elementos.contadorCarrito.classList.toggle('visible', total > 0);
  }
}

async function agregarAlCarrito(id, cantidad = 1) {
  console.log(`🔄 Iniciando agregar al carrito - ID: ${id}, Cantidad: ${cantidad}`);

  if (cantidad <= 0) {
    mostrarNotificacion('La cantidad debe ser mayor a 0', 'error');
    return;
  }

  const producto = productos.find(p => p.id === parseInt(id));
  if (!producto) {
    mostrarNotificacion('Producto no encontrado', 'error');
    console.error(`❌ Producto no encontrado con ID: ${id}`);
    return;
  }

  if (producto.stock <= 0) {
    mostrarNotificacion('Producto agotado', 'error');
    return;
  }

  const itemEnCarrito = carrito.find(item => item.id === parseInt(id));
  const cantidadEnCarrito = itemEnCarrito ? itemEnCarrito.cantidad : 0;
  const stockDisponible = producto.stock - cantidadEnCarrito;

  if (cantidad > stockDisponible) {
    mostrarNotificacion(`Solo hay ${stockDisponible} unidades disponibles`, 'error');
    return;
  }

  if (producto._agregando) {
    console.log('⚠️ Ya se está agregando este producto, saltando...');
    return;
  }

  producto._agregando = true;

  try {
    const productRef = ref(db, `productos/${id}/stock`);
    const transactionResult = await runTransaction(productRef, (currentStock) => {
      const validStock = Number.isFinite(currentStock) ? currentStock : 0;
      if (validStock < cantidad) {
        return undefined;
      }
      return validStock - cantidad;
    });

    if (!transactionResult.committed) {
      mostrarNotificacion('No hay suficiente stock disponible', 'error');
      return;
    }

    if (itemEnCarrito) {
      itemEnCarrito.cantidad += cantidad;
    } else {
      carrito.push({
        id: parseInt(producto.id),
        nombre: producto.nombre,
        precio: producto.precio,
        imagen: producto.imagenes[0],
        cantidad
      });
    }

    producto.stock = transactionResult.snapshot.val();
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion(`${producto.nombre} agregado al carrito`, 'exito');
  } catch (error) {
    console.error('❌ Error al agregar producto al carrito:', error);
    mostrarNotificacion('Error al agregar el producto. Inténtalo de nuevo.', 'error');
  } finally {
    delete producto._agregando;
  }
}

async function modificarCantidadCarrito(id, nuevaCantidad) {
  const item = carrito.find(item => item.id === id);
  if (!item) return;

  const producto = productos.find(p => p.id === id);
  if (!producto) return;

  const diferencia = nuevaCantidad - item.cantidad;

  if (diferencia === 0) return;

  try {
    const productRef = ref(db, `productos/${id}/stock`);
    await runTransaction(productRef, (currentStock) => {
      const validStock = Number.isFinite(currentStock) ? currentStock : 0;
      if (diferencia > 0 && validStock < diferencia) {
        return undefined;
      }
      return validStock - diferencia;
    });

    item.cantidad = nuevaCantidad;
    if (item.cantidad <= 0) {
      carrito = carrito.filter(c => c.id !== id);
    }

    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
  } catch (error) {
    console.error('Error al modificar cantidad en carrito:', error);
    mostrarNotificacion('Error al actualizar la cantidad', 'error');
  }
}

function renderizarCarrito() {
  if (!elementos.listaCarrito || !elementos.totalCarrito) return;

  elementos.listaCarrito.innerHTML = carrito.length === 0
    ? '<p class="carrito-vacio">Tu carrito está vacío</p>'
    : carrito.map(item => {
        const producto = productos.find(p => p.id === item.id);
        const stockDisponible = producto ? producto.stock : 0;
        return `
        <li class="carrito-item" data-id="${item.id}">
          <img src="${item.imagen}" class="carrito-item-img" alt="${item.nombre}" loading="lazy">
          <div class="carrito-item-info">
            <span class="carrito-item-nombre">${item.nombre}</span>
            <span class="carrito-item-precio">$U ${item.precio.toLocaleString('es-UY')} c/u</span>
            <div class="carrito-item-controls">
              <button class="disminuir-cantidad" data-id="${item.id}" aria-label="Reducir cantidad" ${item.cantidad <= 1 ? 'disabled' : ''}>-</button>
              <span class="carrito-item-cantidad">${item.cantidad}</span>
              <button class="aumentar-cantidad" data-id="${item.id}" aria-label="Aumentar cantidad" ${stockDisponible <= 0 ? 'disabled' : ''}>+</button>
            </div>
            <span class="carrito-item-subtotal">Subtotal: $U ${(item.precio * item.cantidad).toLocaleString('es-UY')}</span>
          </div>
        </li>
      `;
      }).join('');

  const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
  elementos.totalCarrito.textContent = `Total: $U ${total.toLocaleString('es-UY')}`;

  // Remove previous listeners to prevent memory leaks
  const disminuirBotones = elementos.listaCarrito.querySelectorAll('.disminuir-cantidad');
  const aumentarBotones = elementos.listaCarrito.querySelectorAll('.aumentar-cantidad');

  disminuirBotones.forEach(btn => {
    btn.replaceWith(btn.cloneNode(true));
  });
  aumentarBotones.forEach(btn => {
    btn.replaceWith(btn.cloneNode(true));
  });

  // Add new listeners
  elementos.listaCarrito.querySelectorAll('.disminuir-cantidad').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = parseInt(e.target.dataset.id);
      const item = carrito.find(item => item.id === id);
      if (item && item.cantidad > 1) awaits modificarCantidadCarrito(id, item.cantidad - 1);
    });
  });

  elementos.listaCarrito.querySelectorAll('.aumentar-cantidad').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = parseInt(e.target.dataset.id);
      const item = carrito.find(item => item.id === id);
      if (item) await modificarCantidadCarrito(id, item.cantidad + 1);
    });
  });
}

// ===============================
// CARRITO: UI FUNCTIONS
// ===============================
function abrirCarrito() {
  console.log('🛒 Intentando abrir carrito...');
  if (elementos.carritoPanel && elementos.carritoOverlay) {
    elementos.carritoPanel.classList.add('abierto');
    elementos.carritoOverlay.classList.add('activo');
    renderizarCarrito();
    console.log('✅ Carrito abierto correctamente');
  } else {
    console.error('❌ Elementos del carrito no encontrados');
    mostrarNotificacion('Error al abrir el carrito. Verifica la configuración.', 'error');
  }
}

function cerrarCarrito() {
  if (elementos.carritoPanel && elementos.carritoOverlay) {
    elementos.carritoPanel.classList.remove('abierto');
    elementos.carritoOverlay.classList.remove('activo');
  }
}

function mostrarAvisoPreCompra() {
  if (carrito.length === 0) {
    mostrarNotificacion('Tu carrito está vacío', 'info');
    return;
  }
  if (elementos.avisoPreCompraModal) {
    elementos.avisoPreCompraModal.hidden = false;
  }
}

function mostrarModalDatosEnvio() {
  const modalDatosEnvio = document.getElementById('modal-datos-envio');
  if (modalDatosEnvio) {
    modalDatosEnvio.hidden = false;
    const resumenProductos = document.getElementById('resumen-productos');
    const totalFinal = document.getElementById('total-final');

    if (resumenProductos) {
      resumenProductos.innerHTML = carrito.map(item => `
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <span>${item.nombre} x ${item.cantidad}</span>
          <span>$U ${(item.precio * item.cantidad).toLocaleString('es-UY')}</span>
        </div>
      `).join('');
    }

    if (totalFinal) {
      const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
      totalFinal.textContent = `$U ${total.toLocaleString('es-UY')}`;
    }
  }
}

// ===============================
// PRODUCTOS: CARGA Y PROCESAMIENTO
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

    onValue(productosRef, (snapshot) => {
      if (!snapshot.exists()) {
        productos = [];
        renderizarProductos();
        actualizarCategorias();
        return;
      }
      procesarDatosProductos(snapshot.val());
    }, (error) => {
      console.error('Error en listener de productos Firebase:', error);
      mostrarNotificacion('Error al recibir actualizaciones de productos', 'error');
    });
  } catch (e) {
    console.error('Error al cargar productos desde Firebase:',e);
    mostrarNotificacion('Error al cargar productos: ' + (e.message || 'Error desconocido'), 'error');
    elementos.galeriaProductos.innerHTML = '<p class="error-c polygon">No se pudieron cargar los productos.</p>';
  } finally {
    if (elementos.productLoader) {
      elementos.productLoader.style.display = 'none';
      elementos.productLoader.hidden = true;
    }
  }
}

function procesarDatosProductos(data) {
  productos = Object.keys(data).map(key => {
    const p = data[key];
    if (!p || typeof p !== 'object') {
      console.warn(`Producto ${key} tiene datos inválidos o faltantes`, p);
      return null;
    }
    return {
      id: Number.isFinite(p.id) ? parseInt(p.id) : parseInt(key),
      nombre: typeof p.nombre === 'string' ? p.nombre.trim() : 'Sin nombre',
      descripcion: typeof p.descripcion === 'string' ? p.descripcion.trim() : '',
      precio: Number.isFinite(parseFloat(p.precio)) ? parseFloat(p.precio) : 0,
      stock: Number.isFinite(parseInt(p.stock, 10)) ? Math.max(0, parseInt(p.stock, 10)) : 0,
      imagenes: Array.isArray(p.imagenes) ? p.imagenes.filter(img => typeof img === 'string' && img.trim() !== '') : [PLACEHOLDER_IMAGE],
      categoria: typeof p.categoria === 'string' ? p.categoria.toLowerCase().trim() : 'otros',
      estado: typeof p.estado === 'string' ? p.estado.trim() : '',
      adicionales: typeof p.adicionales === 'string' ? p.adicionales.trim() : '',
      alto: Number.isFinite(parseFloat(p.alto)) ? parseFloat(p.alto) : null,
      ancho: Number.isFinite(parseFloat(p.ancho)) ? parseFloat(p.ancho) : null,
      profundidad: Number.isFinite(parseFloat(p.profundidad)) ? parseFloat(p.profundidad) : null,
    };
  }).filter(p => p !== null);

  renderizarProductos();
  actualizarCategorias();
}

function filtrarProductos() {
  return productos.filter(producto => {
    if (producto.precio < filtrosActuales.precioMin || producto.precio > filtrosActuales.precioMax) {
      return false;
    }
    if (filtrosActuales.categoria !== 'todos' && producto.categoria !== filtrosActuales.categoria) {
      return false;
    }
    if (filtrosActuales.busqueda) {
      const busqueda = filtrosActuales.busqueda;
      const nombre = producto.nombre.toLowerCase();
      const descripcion = producto.descripcion.toLowerCase();
      return nombre.includes(busqueda) || descripcion.includes(busqueda);
    }
    return true;
  });
}

function renderizarProductos() {
  if (!elementos.galeriaProductos) return;

  const productosFiltrados = filtrarProductos();
  const totalPaginas = Math.ceil(productosFiltrados.length / PRODUCTOS_POR_PAGINA);

  if (productosFiltrados.length === 0) {
    elementos.galeriaProductos.innerHTML = '<p class="sin-productos">No se encontraron productos que coincidan con los filtros.</p>';
    if (elementos.paginacion) elementos.paginacion.innerHTML = '';
    return;
  }

  const inicio = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
  const fin = inicio + PRODUCTOS_POR_PAGINA;
  const productosEnPagina = productosFiltrados.slice(inicio, fin);

  elementos.galeriaProductos.innerHTML = productosEnPagina.map(producto => {
    const stockTexto = producto.stock > 0
      ? `<span class="texto-disponible">Stock: ${producto.stock}</span>`
      : '<span class="texto-agotado">Agotado</span>';
    const botonAgregar = producto.stock > 0
      ? `<button class="boton-agregar" data-id="${producto.id}"><i class="fas fa-cart-plus"></i> Agregar</button>`
      : `<button class="boton-agregar agotado" disabled>Agotado</button>`;

    return `
      <article class="producto-card" data-id="${producto.id}">
        <img src="${producto.imagenes[0]}" alt="${producto.nombre}" class="producto-img" loading="lazy">
        <div class="producto-info">
          <h3 class="producto-nombre">${producto.nombre}</h3>
          <p class="producto-precio">$U ${producto.precio.toLocaleString('es-UY')}</p>
          <p class="producto-stock">${stockTexto}</p>
          <div class="card-acciones">
            <input type="number" min="1" max="${producto.stock}" value="1" class="cantidad-input" ${producto.stock <= 0 ? 'disabled' : ''}>
            ${botonAgregar}
          </div>
          <button class="boton-detalles">Ver Detalles</button>
        </div>
      </article>
    `;
  }).join('');

  renderizarPaginacion(totalPaginas);
}

function renderizarPaginacion(totalPaginas) {
  if (!elementos.paginacion || totalPaginas <= 1) {
    if (elementos.paginacion) elementos.paginacion.innerHTML = '';
    return;
  }

  let paginacionHTML = `
    <button ${paginaActual <= 1 ? 'disabled' : ''} data-page="${paginaActual - 1}">
      ‹ Anterior
    </button>
  `;

  for (let i = 1; i <= totalPaginas; i++) {
    if (i === paginaActual || i === 1 || i === totalPaginas || Math.abs(i - paginaActual) <= 1) {
      paginacionHTML += `
        <button ${i === paginaActual ? 'class="activa"' : ''} data-page="${i}">
          ${i}
        </button>
      `;
    } else if (i === 2 && paginaActual > 4) {
      paginacionHTML += '<span>...</span>';
    } else if (i === totalPaginas - 1 && paginaActual < totalPaginas - 3) {
      paginacionHTML += '<span>...</span>';
    }
  }

  paginacionHTML += `
    <button ${paginaActual >= totalPaginas ? 'disabled' : ''} data-page="${paginaActual + 1}">
      Siguiente ›
    </button>
  `;

  elementos.paginacion.innerHTML = paginacionHTML;

  elementos.paginacion.querySelectorAll('button[data-page]').forEach(btn => {
    btn.addEventListener('click', () => cambiarPagina(parseInt(btn.dataset.page)));
  });
}

function actualizarCategorias() {
  if (!elementos.selectCategoria) return;

  const categoriasUnicas = [...new Set(productos.map(p => p.categoria))].sort();
  const currentValue = elementos.selectCategoria.value;

  elementos.selectCategoria.innerHTML = `
    <option value="todos">Todas las categorías</option>
    ${categoriasUnicas.map(cat => 
      `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`
    ).join('')}
  `;

  if (categoriasUnicas.includes(currentValue) || currentValue === 'todos') {
    elementos.selectCategoria.value = currentValue;
  }
}

// ===============================
// MODAL FUNCTIONS
// ===============================
function abrirModal(producto) {
  console.log('🔍 Intentando abrir modal para producto:', producto);
  if (!producto || !elementos.productoModal) {
    console.error('❌ Producto o modal no disponible');
    mostrarNotificacion('Error al abrir el modal del producto.', 'error');
    return;
  }

  productoModalActual = producto;
  imagenModalActual = 0;

  if (elementos.modalNombre) elementos.modalNombre.textContent = producto.nombre;
  if (elementos.modalDescripcion) elementos.modalDescripcion.textContent = producto.descripcion || 'Sin descripción disponible';
  if (elementos.modalPrecio) elementos.modalPrecio.textContent = `Precio: $U ${producto.precio.toLocaleString('es-UY')}`;
  if (elementos.modalCantidad) {
    elementos.modalCantidad.max = producto.stock;
    elementos.modalCantidad.value = 1;
    elementos.modalCantidad.disabled = producto.stock <= 0;
  }
  if (elementos.modalAgregarCarrito) {
    elementos.modalAgregarCarrito.disabled = producto.stock <= 0;
    elementos.modalAgregarCarrito.textContent = producto.stock <= 0 ? 'Agotado' : 'Agregar al Carrito';
  }

  actualizarImagenModal();
  crearThumbnails();

  elementos.productoModal.classList.add('active');
  elementos.productoModal.hidden = false; // Asegura que el modal sea visible
  console.log('✅ Modal abierto correctamente');
}

function cerrarModal() {
  if (elementos.productoModal) {
    elementos.productoModal.classList.remove('active');
    elementos.productoModal.hidden = true;
  }
  productoModalActual = null;
  imagenModalActual = 0;
}

function actualizarImagenModal() {
  if (!productoModalActual || !elementos.modalImagen) return;

  const imagenes = productoModalActual.imagenes;
  if (imagenes?.length > 0) {
    elementos.modalImagen.src = imagenes[imagenModalActual];
    elementos.modalImagen.alt = productoModalActual.nombre;
  }

  if (elementos.modalPrev) elementos.modalPrev.style.display = imagenes.length > 1 ? 'block' : 'none';
  if (elementos.modalNext) elementos.modalNext.style.display = imagenes.length > 1 ? 'block' : 'none';

  actualizarThumbnailsActivos();
}

function cambiarImagenModal(direccion) {
  if (!productoModalActual) return;

  const imagenes = productoModalActual.imagenes;
  if (!imagenes || imagenes.length <= 1) return;

  imagenModalActual = (imagenModalActual + direccion + imagenes.length) % imagenes.length;
  actualizarImagenModal();
}

function crearThumbnails() {
  if (!productoModalActual || !elementos.modalThumbnails) return;

  const imagenes = productoModalActual.imagenes;
  if (!imagenes || imagenes.length <= 1) {
    elementos.modalThumbnails.innerHTML = '';
    return;
  }

  elementos.modalThumbnails.innerHTML = imagenes.map((img, index) => `
    <img src="${img}" alt="Thumbnail ${index + 1}" class="modal-thumbnail" data-index="${index}">
  `).join('');

  elementos.modalThumbnails.querySelectorAll('.modal-thumbnail').forEach((thumb, index) => {
    thumb.replaceWith(thumb.cloneNode(true));
    elementos.modalThumbnails.querySelectorAll('.modal-thumbnail')[index].addEventListener('click', () => {
      imagenModalActual = index;
      actualizarImagenModal();
    });
  });

  actualizarThumbnailsActivos();
}

function actualizarThumbnailsActivos() {
  if (!elementos.modalThumbnails) return;

  elementos.modalThumbnails.querySelectorAll('.modal-thumbnail').forEach((thumb, index) => {
    thumb.classList.toggle('active', index === imagenModalActual);
  });
}

async function agregarDesdeModal() {
  if (!productoModalActual || !elementos.modalCantidad) return;

  const cantidad = parseInt(elementos.modalCantidad.value) || 1;
  await agregarAlCarrito(productoModalActual.id, cantidad);
  cerrarModal();
}

// ===============================
// FILTROS Y UTILIDADES
// ===============================
function aplicarRango() {
  if (elementos.precioMinInput && elementos.precioMaxInput) {
    filtrosActuales.precioMin = parseInt(elementos.precioMinInput.value);
    filtrosActuales.precioMax = parseInt(elementos.precioMaxInput.value);
    paginaActual = 1;
    renderizarProductos();
  }
}

function cambiarPagina(nuevaPagina) {
  paginaActual = nuevaPagina;
  renderizarProductos();
  const productosSection = document.getElementById('productos');
  if (productosSection) {
    productosSection.scrollIntoView({ behavior: 'smooth' });
  }
}
