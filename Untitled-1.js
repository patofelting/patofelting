// ===============================
// CONFIGURACIÓN GLOBAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const CSV_URL = window.SHEET_CSV_URL;
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

// ======== Firebase ========
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, runTransaction, onValue, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = { /* ...tu config... */ };
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

signInAnonymously(auth)
  .then(() => console.log("Signed in anonymously"))
  .catch(error => console.error("Error signing in:", error));

// ===============================
// ESTADO GLOBAL
// ===============================
let productos = [];
let carrito = [];
let paginaActual = 1;
let filtrosActuales = { precioMin: null, precioMax: null, categoria: 'todos', busqueda: '' };

// ===============================
// REFERENCIAS AL DOM
// ===============================
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

// ===============================
// NOTIFICACIONES
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
// CARRITO: GUARDAR, CARGAR Y RENDERIZAR
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

function actualizarContadorCarrito() {
  const total = carrito.reduce((sum, i) => sum + i.cantidad, 0);
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
    const producto = productos.find(p => p.id === item.id);
    const disponibles = producto ? Math.max(0, producto.stock - item.cantidad) : 0;
    return `
    <li class="carrito-item" data-id="${item.id}">
      <img src="${item.imagen}" class="carrito-item-img" alt="${item.nombre}" loading="lazy">
      <div class="carrito-item-info">
        <span class="carrito-item-nombre">${item.nombre}</span>
        <span class="carrito-item-precio">$U ${item.precio.toLocaleString('es-UY')} c/u</span>
        <div class="carrito-item-controls">
          <button class="disminuir-cantidad" data-id="${item.id}" aria-label="Reducir cantidad" ${item.cantidad <= 1 ? 'disabled' : ''}>-</button>
          <span class="carrito-item-cantidad">${item.cantidad}</span>
          <button class="aumentar-cantidad" data-id="${item.id}" aria-label="Aumentar cantidad" ${disponibles <= 0 ? 'disabled' : ''}>+</button>
        </div>
        <span class="carrito-item-subtotal">Subtotal: $U ${(item.precio * item.cantidad).toLocaleString('es-UY')}</span>
      </div>
    </li>
  `}).join('');
  const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
  elementos.totalCarrito.textContent = `Total: $U ${total.toLocaleString('es-UY')}`;
  document.querySelectorAll('.disminuir-cantidad').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      const item = carrito.find(item => item.id === id);
      if (item && item.cantidad > 1) {
        item.cantidad--;
        guardarCarrito();
        renderizarCarrito();
        mostrarNotificacion(`Reducida cantidad de "${item.nombre}"`, 'info');
      }
    });
  });
  document.querySelectorAll('.aumentar-cantidad').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      agregarAlCarrito(id, 1);
    });
  });
}

// ===============================
// PRODUCTOS, FILTROS Y PAGINACIÓN
// ===============================
function renderizarProductos(datos = productos) {
  const galeria = elementos.galeriaProductos;
  if (!galeria) return;
  const productosFiltrados = filtrarProductos();
  const totalProductos = productosFiltrados.length;
  const startIndex = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
  const endIndex = startIndex + PRODUCTOS_POR_PAGINA;
  const productosAPerPage = productosFiltrados.slice(startIndex, endIndex);
  galeria.innerHTML = '';
  if (!productosAPerPage || productosAPerPage.length === 0) {
    galeria.innerHTML = `
      <div class="sin-resultados">
        <i class="fas fa-search"></i>
        <p>No encontramos productos que coincidan con tus filtros</p>
        <button class="boton-resetear-filtros" onclick="resetearFiltros()">
          <i class="fas fa-undo"></i> Reiniciar filtros
        </button>
      </div>
    `;
    return;
  }
  const fragment = document.createDocumentFragment();
  productosAPerPage.forEach(producto => {
    const enCarrito = carrito.find(item => item.id === producto.id);
    const disponibles = Math.max(0, producto.stock - (enCarrito?.cantidad || 0));
    const agotado = disponibles <= 0;
    const imagenValida = producto.imagenes?.[0] || PLACEHOLDER_IMAGE;
    const escapeHTML = str => str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
    const card = document.createElement('div');
    card.className = `producto-card ${agotado ? 'agotado' : ''} ${producto.estado === 'nuevo' ? 'nuevo' : ''}`;
    card.dataset.id = producto.id;
    card.dataset.categoria = producto.categoria;
    card.innerHTML = `
      <div class="producto-imagen-container">
        <img src="${imagenValida}" alt="${escapeHTML(producto.nombre)}" class="producto-img" loading="lazy">
        ${producto.estado === 'oferta' ? '<span class="etiqueta-oferta">OFERTA</span>' : ''}
        ${producto.estado === 'nuevo' ? '<span class="etiqueta-nuevo">NUEVO</span>' : ''}
      </div>
      <div class="producto-info">
        <h3 class="producto-nombre">${escapeHTML(producto.nombre)}</h3>
        <p class="producto-precio">$U ${producto.precio.toLocaleString('es-UY')}</p>
        <p class="producto-stock ${agotado ? 'texto-agotado' : 'texto-disponible'}">
          ${agotado ? '<i class="fas fa-times-circle"></i> AGOTADO' : `<i class="fas fa-check-circle"></i> Disponible: ${disponibles}`}
        </p>
        <div class="card-acciones">
          <button class="boton-agregar ${agotado ? 'agotado' : ''}" data-id="${producto.id}" ${agotado ? 'disabled aria-disabled="true"' : ''}>
            ${agotado ? 'Agotado' : '<i class="fas fa-cart-plus"></i> Agregar'}
          </button>
          ${agotado ? `
          <button class="boton-aviso-stock" data-id="${producto.id}" data-nombre="${escapeHTML(producto.nombre)}">
            <i class="fas fa-bell"></i> Avisame
          </button>` : ''}
        </div>
        <button class="boton-detalles" data-id="${producto.id}">
          <i class="fas fa-search"></i> Ver Detalle
        </button>
      </div>
    `;
    fragment.appendChild(card);
  });
  galeria.appendChild(fragment);
  renderizarPaginacion(totalProductos);
  // Delegación de eventos (SOLO UNA VEZ)
  galeria.removeEventListener('click', manejarEventosGaleria);
  galeria.addEventListener('click', manejarEventosGaleria);
}

function manejarEventosGaleria(e) {
  const btnDetalle = e.target.closest('.boton-detalles');
  if (btnDetalle) {
    const id = parseInt(btnDetalle.dataset.id);
    verDetalle(id);
    return;
  }
  const btnAgregar = e.target.closest('.boton-agregar');
  if (btnAgregar && !btnAgregar.disabled) {
    const id = parseInt(btnAgregar.dataset.id);
    agregarAlCarrito(id, 1);
    return;
  }
  const btnAviso = e.target.closest('.boton-aviso-stock');
  if (btnAviso) {
    preguntarStock(btnAviso.dataset.nombre);
    return;
  }
}

function filtrarProductos() {
  return productos.filter(p => {
    if (!p) return false;
    const { precioMin, precioMax, categoria, busqueda } = filtrosActuales;
    const b = busqueda?.toLowerCase() || "";
    return (
      (precioMin === null || p.precio >= precioMin) &&
      (precioMax === null || p.precio <= precioMax) &&
      (categoria === 'todos' || p.categoria === categoria) &&
      (!b || p.nombre.toLowerCase().includes(b) || p.descripcion.toLowerCase().includes(b))
    );
  });
}

function renderizarPaginacion(totalProductos) {
  const totalPages = Math.ceil(totalProductos / PRODUCTOS_POR_PAGINA);
  const paginacionContainer = elementos.paginacion;
  if (totalPages <= 1) {
    paginacionContainer.innerHTML = '';
    return;
  }
  paginacionContainer.innerHTML = '';
  for (let i = 1; i <= totalPages; i++) {
    const pageButton = document.createElement('button');
    pageButton.textContent = i;
    pageButton.className = i === paginaActual ? 'active' : '';
    pageButton.addEventListener('click', () => {
      paginaActual = i;
      renderizarProductos();
    });
    paginacionContainer.appendChild(pageButton);
  }
}

// ===============================
// MODAL DE PRODUCTO
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
          ${
            producto.imagenes.length > 1
              ? `
          <div class="modal-controls">
            <button class="modal-prev" aria-label="Imagen anterior" ${currentIndex === 0 ? 'disabled' : ''}>←</button>
            <button class="modal-next" aria-label="Siguiente imagen" ${currentIndex === producto.imagenes.length - 1 ? 'disabled' : ''}>→</button>
          </div>
          `
              : ''
          }
          <div class="modal-thumbnails">
            ${producto.imagenes
              .map(
                (img, i) =>
                  `<img src="${img}" class="thumbnail ${i === currentIndex ? 'active' : ''}" data-index="${i}" alt="Miniatura ${i + 1}">`
              )
              .join('')}
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
    contenido.querySelector('.cerrar-modal').onclick = () => cerrarModal();
    const botonAgregar = contenido.querySelector('.boton-agregar-modal');
    if (botonAgregar) {
      const nuevoBoton = botonAgregar.cloneNode(true);
      botonAgregar.parentNode.replaceChild(nuevoBoton, botonAgregar);
      nuevoBoton.addEventListener('click', () => {
        const input = contenido.querySelector('.cantidad-modal-input');
        const cantidad = +(input?.value || 1);
        agregarAlCarrito(producto.id, cantidad);
        cerrarModal();
      });
    }
    // Carrusel
    const btnPrev = contenido.querySelector('.modal-prev');
    const btnNext = contenido.querySelector('.modal-next');
    if (btnPrev) btnPrev.onclick = () => { currentIndex--; renderCarrusel(); };
    if (btnNext) btnNext.onclick = () => { currentIndex++; renderCarrusel(); };
    contenido.querySelectorAll('.thumbnail').forEach(thumb => {
      thumb.onclick = () => { currentIndex = parseInt(thumb.dataset.index); renderCarrusel(); };
    });
  }
  renderCarrusel();
  modal.style.display = 'flex';
  setTimeout(() => {
    modal.classList.add('visible');
    document.body.classList.add('no-scroll');
  }, 10);
  modal.onclick = e => {
    if (e.target === modal) cerrarModal();
  };
  function cerrarModal() {
    modal.classList.remove('visible');
    setTimeout(() => {
      modal.style.display = 'none';
      document.body.classList.remove('no-scroll');
    }, 300);
  }
}

// ===============================
// CLICK EN DETALLE DEL PRODUCTO
// ===============================
function verDetalle(id) {
  const producto = productos.find(p => p.id === id);
  if (producto) {
    mostrarModalProducto(producto);
  } else {
    mostrarNotificacion("Producto no encontrado", "error");
  }
}

// ===============================
// AGREGAR AL CARRITO (SIN DUPLICADOS)
// ===============================
function agregarAlCarrito(id, cantidadAgregar = 1) {
  const producto = productos.find(p => p.id === id);
  if (!producto) {
    mostrarNotificacion("Producto no encontrado", "error");
    return;
  }
  const enCarrito = carrito.find(item => item.id === id);
  const productRef = ref(db, `productos/${id}/stock`);
  runTransaction(productRef, (currentStock) => {
    if (currentStock === null) return currentStock;
    if (currentStock < cantidadAgregar) return;
    return currentStock - cantidadAgregar;
  }).then(result => {
    if (!result.committed) {
      mostrarNotificacion("No hay suficiente stock", "error");
      return;
    }
    if (enCarrito) {
      enCarrito.cantidad += cantidadAgregar;
    } else {
      carrito.push({
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        cantidad: cantidadAgregar,
        imagen: producto.imagenes?.[0] || PLACEHOLDER_IMAGE
      });
    }
    guardarCarrito();
    renderizarProductos();
    renderizarCarrito();
    mostrarNotificacion("Producto agregado al carrito", "exito");
  }).catch((error) => {
    console.error("Error al agregar al carrito:", error);
    mostrarNotificacion("No se pudo agregar al carrito", "error");
  });
}

// ===============================
// INICIALIZACIÓN GENERAL
// ===============================
function init() {
  cargarCarrito();
  renderizarProductos();
  // ...otros inits...
}
document.addEventListener('DOMContentLoaded', init);

// ===============================
// EXPORTS PARA HTML
// ===============================
window.verDetalle = verDetalle;
window.agregarAlCarrito = agregarAlCarrito;
