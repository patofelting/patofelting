// ===============================
// CONFIGURACIÓN GLOBAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const CSV_URL = window.SHEET_CSV_URL;
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

// Import Firebase (el index expone app/db)
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, runTransaction, onValue, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const db = window.firebaseDatabase;
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
    console.log('✅ Signed in anonymously to Firebase.');
    cargarProductosDesdeFirebase();
  } catch (error) {
    console.error('❌ Error signing in to Firebase:', error);
    let errorMessage = 'Error de autenticación con Firebase.';
    if (error.code === 'auth/configuration-not-found') {
      errorMessage = 'La autenticación anónima no está habilitada en Firebase.';
    } else if (error.code === 'auth/network-request-failed') {
      errorMessage = 'Error de red. Verificá tu conexión.';
    }
    mostrarNotificacion(errorMessage, 'error');
  }

  cargarCarrito();
  ensureProductModal();      // crea/referencia el modal si falta
  init();                    // listeners base
});

// ===============================
// Referencias al DOM
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
// UTILIDADES
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
    await Promise.all(
      carrito.map(async (item) => {
        const productRef = ref(db, `productos/${item.id}/stock`);
        await runTransaction(productRef, (currentStock) => {
          if (typeof currentStock !== 'number' || isNaN(currentStock)) currentStock = 0;
          return currentStock + item.cantidad; // restaurar stock
        });
      })
    );

    carrito = [];
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion('Carrito vaciado y stock restaurado correctamente', 'exito');
  } catch (error) {
    console.error("Error al vaciar el carrito y restaurar el stock:", error);
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

    // Escucha en vivo
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
      console.error('Error en listener de productos Firebase:', error);
      mostrarNotificacion('Error al recibir actualizaciones de productos', 'error');
    });

  } catch (e) {
    console.error('Error al cargar productos desde Firebase:', e);
    mostrarNotificacion('Error al cargar productos: ' + (e.message || 'Error desconocido'), 'error');
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
    if (!p || typeof p !== 'object') {
      console.warn(`Producto ${key} inválido`, p);
      return;
    }
    productos.push({
      id: p.id && !isNaN(p.id) ? parseInt(p.id) : parseInt(key),
      nombre: typeof p.nombre === 'string' ? p.nombre : `Producto ${key}`,
      descripcion: typeof p.descripcion === 'string' ? p.descripcion : '',
      precio: Number(p.precio) || 0,
      stock: Number.isFinite(p.stock) ? p.stock : 0,
      categoria: p.categoria || 'otros',
      imagenes: Array.isArray(p.imagenes) ? p.imagenes.filter(Boolean) : [p.imagen || PLACEHOLDER_IMAGE],
      imagen: p.imagen || PLACEHOLDER_IMAGE
    });
  });

  // Orden opcional (por id) para estabilidad visual
  productos.sort((a, b) => a.id - b.id);

  actualizarCategorias();
  aplicarFiltros();
  actualizarUI();
}

// ===============================
// RENDER: CARRITO
// ===============================
function renderizarCarrito() {
  if (!elementos.listaCarrito) return;

  if (carrito.length === 0) {
    elementos.listaCarrito.innerHTML = '<li class="carrito-vacio">No hay productos en tu carrito</li>';
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

  // listeners +/- cantidad
  elementos.listaCarrito.querySelectorAll('.disminuir-cantidad').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      const item = carrito.find(i => i.id === id);
      if (item && item.cantidad > 1) {
        item.cantidad--;
        const productRef = ref(db, `productos/${id}/stock`);
        runTransaction(productRef, (currentStock) => {
          if (typeof currentStock !== 'number' || isNaN(currentStock)) currentStock = 0;
          return currentStock + 1; // devolvemos 1 al stock
        }).then(() => {
          guardarCarrito();
          renderizarCarrito();
          renderizarProductos();
          mostrarNotificacion(`Reducida cantidad de "${item.nombre}"`, 'info');
        }).catch(error => {
          console.error("Error al disminuir cantidad:", error);
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
  const imagenPrincipal = p.imagenes && p.imagenes.length > 0 ? p.imagenes[0] : PLACEHOLDER_IMAGE;

  return `
    <div class="producto-card ${agot ? 'agotado' : ''}" data-id="${p.id}" tabindex="0" role="group" aria-label="${p.nombre}">
      <img class="producto-img" src="${imagenPrincipal}" alt="${p.nombre}" loading="lazy">
      <h3 class="producto-nombre">${p.nombre}</h3>
      <span class="producto-precio">$U ${p.precio.toLocaleString('es-UY')}</span>
      <div class="producto-stock">
        ${agot ? `<span class="texto-agotado">Agotado</span>` : `Stock disponible: ${disp}`}
      </div>
      <div class="card-acciones">
        <button class="boton-agregar ${agot ? 'agotado' : ''}" ${agot ? 'disabled' : ''} data-action="agregar">Agregar</button>
        <button class="boton-detalles" data-action="detalle">Ver detalle</button>
        ${agot ? `<button class="boton-aviso-stock" data-action="aviso" data-nombre="${p.nombre}">Avisame cuando haya</button>` : ''}
      </div>
    </div>
  `;
}

function renderizarProductos() {
  if (!elementos.galeriaProductos) return;

  // filtros + paginación simple
  const filtrados = productos.filter(p => {
    const pasaPrecio = p.precio >= filtrosActuales.precioMin && p.precio <= filtrosActuales.precioMax;
    const pasaBusqueda = !filtrosActuales.busqueda || (p.nombre + ' ' + p.descripcion).toLowerCase().includes(filtrosActuales.busqueda);
    const pasaCategoria = filtrosActuales.categoria === 'todos' || p.categoria === filtrosActuales.categoria;
    return pasaPrecio && pasaBusqueda && pasaCategoria;
  });

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / PRODUCTOS_POR_PAGINA));
  paginaActual = Math.min(paginaActual, totalPaginas);
  const inicio = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
  const pagina = filtrados.slice(inicio, inicio + PRODUCTOS_POR_PAGINA);

  elementos.galeriaProductos.innerHTML = pagina.map(crearCardProducto).join('');
  renderizarPaginacion(totalPaginas);
}

function renderizarPaginacion(totalPaginas) {
  const paginacionContainer = elementos.paginacion;
  if (!paginacionContainer) return;
  paginacionContainer.innerHTML = '';

  for (let i = 1; i <= totalPaginas; i++) {
    const pageButton = document.createElement('button');
    pageButton.textContent = i;
    pageButton.className = (paginaActual === i) ? 'active' : '';
    pageButton.addEventListener('click', () => {
      paginaActual = i;
      renderizarProductos();

      // scroll suave sólo si estás por encima de la galería
      const targetTop = elementos.galeriaProductos.offsetTop - 100;
      if (window.scrollY + 10 < targetTop) {
        window.scrollTo({ top: targetTop, behavior: 'smooth' });
      }
    });
    paginacionContainer.appendChild(pageButton);
  }
}

// ===============================
// MODAL DE PRODUCTO
// ===============================
function ensureProductModal() {
  // Si falta el modal, lo creamos mínimo
  if (!document.getElementById('producto-modal')) {
    const modal = document.createElement('div');
    modal.id = 'producto-modal';
    modal.className = 'modal-overlay'; // respeta tu CSS
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="modal-backdrop" data-close="1"></div>
      <div class="modal-contenido-producto" id="modal-contenido"></div>
    `;
    document.body.appendChild(modal);
  }
  // Actualizamos referencias
  elementos.productoModal = document.getElementById('producto-modal');
  elementos.modalContenido = document.getElementById('modal-contenido');

  // Cerrar por backdrop o ESC
  elementos.productoModal.addEventListener('click', (e) => {
    if (e.target.dataset.close === '1') cerrarModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elementos.productoModal.classList.contains('visible')) cerrarModal();
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

  function renderCarruselAndContent() {
    contenido.innerHTML = `
      <button class="cerrar-modal" aria-label="Cerrar modal" onclick="cerrarModal()">&times;</button>
      <div class="modal-flex">
        <div class="modal-carrusel">
          <img id="modal-imagen" src="${producto.imagenes[currentIndex] || PLACEHOLDER_IMAGE}" class="modal-img" alt="${producto.nombre}">
          ${producto.imagenes.length > 1 ? `
            <div class="modal-controls">
              <button class="modal-prev" aria-label="Imagen anterior" ${currentIndex === 0 ? 'disabled' : ''}>&lt;</button>
              <button class="modal-next" aria-label="Siguiente imagen" ${currentIndex === producto.imagenes.length - 1 ? 'disabled' : ''}>&gt;</button>
            </div>` : ''
          }
          <div class="modal-thumbnails">
            ${producto.imagenes.map((img, i) => `
              <img src="${img}" class="thumbnail ${i === currentIndex ? 'active' : ''}" data-index="${i}" alt="Vista ${i+1} de ${producto.nombre}">
            `).join('')}
          </div>
        </div>
        <div class="modal-info">
          <h2>${producto.nombre}</h2>
          <p class="modal-descripcion">${producto.descripcion || ''}</p>
          <p class="modal-precio">$U ${producto.precio.toLocaleString('es-UY')}</p>
          <div class="modal-stock">${agotado ? '<span class="texto-agotado">Agotado</span>' : `Stock: ${disponibles}`}</div>
          <div class="modal-acciones">
            <input type="number" value="1" min="1" max="${disponibles}" class="cantidad-modal-input" ${agotado ? 'disabled' : ''}>
            <button class="boton-agregar-modal ${agotado ? 'agotado' : ''}" data-id="${producto.id}" ${agotado ? 'disabled' : ''}>
              ${agotado ? 'Agotado' : 'Agregar al carrito'}
            </button>
          </div>
        </div>
      </div>
    `;

    const btnPrev = contenido.querySelector('.modal-prev');
    const btnNext = contenido.querySelector('.modal-next');
    const thumbnails = contenido.querySelectorAll('.thumbnail');
    const addModalBtn = contenido.querySelector('.boton-agregar-modal');
    const cantidadInput = contenido.querySelector('.cantidad-modal-input');

    btnPrev?.addEventListener('click', () => { if (currentIndex > 0) { currentIndex--; renderCarruselAndContent(); } });
    btnNext?.addEventListener('click', () => { if (currentIndex < producto.imagenes.length - 1) { currentIndex++; renderCarruselAndContent(); } });
    thumbnails.forEach(th => th.addEventListener('click', () => {
      currentIndex = parseInt(th.dataset.index);
      renderCarruselAndContent();
    }));
    addModalBtn?.addEventListener('click', (e) => {
      const id = parseInt(e.currentTarget.dataset.id);
      const cantidad = parseInt(cantidadInput.value);
      agregarAlCarrito(id, cantidad, addModalBtn);
    });
  }

  renderCarruselAndContent();

  // 👇 Corregido: usar la clase que tu CSS escucha (#producto-modal.visible)
  modal.classList.add('visible');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');
}

function cerrarModal() {
  if (elementos.productoModal) {
    elementos.productoModal.classList.remove('visible'); // corregido
    elementos.productoModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
  }
}
window.cerrarModal = cerrarModal;

// ===============================
// LÓGICA DE COMPRA
// ===============================
function agregarAlCarrito(id, cantidad = 1, boton = null) {
  if (isNaN(id) || id === null) {
    mostrarNotificacion("ID de producto inválido", "error");
    return;
  }
  const producto = productos.find(p => p.id === id);
  if (!producto) {
    mostrarNotificacion("Producto no encontrado", "error");
    return;
  }

  const cantidadAgregar = Math.max(1, parseInt(cantidad));
  if (isNaN(cantidadAgregar)) {
    mostrarNotificacion("Cantidad inválida", "error");
    return;
  }

  const enCarrito = carrito.find(item => item.id === id);
  const cantidadYaEnCarrito = enCarrito ? enCarrito.cantidad : 0;
  const stockDisponible = producto.stock - cantidadYaEnCarrito;

  if (stockDisponible < cantidadAgregar) {
    mostrarNotificacion("Stock insuficiente", "error");
    return;
  }

  let textoOriginal = null;
  if (boton) {
    boton.disabled = true;
    textoOriginal = boton.innerHTML;
    boton.innerHTML = `Agregando <span class="spinner"></span>`;
  }

  const productRef = ref(db, `productos/${id}/stock`);
  runTransaction(productRef, (currentStock) => {
    if (typeof currentStock !== 'number' || isNaN(currentStock)) currentStock = 0;
    if (currentStock < cantidadAgregar) return; // aborta transacción si no hay stock
    return currentStock - cantidadAgregar;
  }).then(result => {
    if (!result.committed) {
      mostrarNotificacion("Stock insuficiente", "error");
      return;
    }
    // actualizar carrito local
    if (enCarrito) {
      enCarrito.cantidad += cantidadAgregar;
    } else {
      carrito.push({
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        imagen: producto.imagenes?.[0] || producto.imagen,
        cantidad: cantidadAgregar
      });
    }
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion(`"${producto.nombre}" agregado al carrito`, "exito");
  }).catch(err => {
    console.error("Error al agregar al carrito:", err);
    mostrarNotificacion("No se pudo agregar al carrito", "error");
  }).finally(() => {
    if (boton) {
      boton.disabled = false;
      boton.innerHTML = textoOriginal;
    }
  });
}

// ===============================
// FILTROS UI
// ===============================
function aplicarFiltros() {
  renderizarProductos();
}

function updateRange() {
  const min = parseInt(elementos.precioMinInput.value) || 0;
  const max = parseInt(elementos.precioMaxInput.value) || 3000;
  filtrosActuales.precioMin = Math.min(min, max);
  filtrosActuales.precioMax = Math.max(min, max);

  const minLabel = document.getElementById('min-price');
  const maxLabel = document.getElementById('max-price');
  if (minLabel && maxLabel) {
    minLabel.textContent = `$U${filtrosActuales.precioMin}`;
    maxLabel.textContent = `$U${filtrosActuales.precioMax}`;
  }
}

// ===============================
// EVENTOS
// ===============================
function init() {
  // carrito
  elementos.carritoBtnMain?.addEventListener('click', () => toggleCarrito(true));
  elementos.carritoOverlay?.addEventListener('click', () => toggleCarrito(false));
  elementos.btnCerrarCarrito?.addEventListener('click', () => toggleCarrito(false));
  elementos.btnVaciarCarrito?.addEventListener('click', vaciarCarrito);

  // compra flow
  document.getElementById('select-envio')?.addEventListener('change', actualizarResumenPedido);
  elementos.btnFinalizarCompra?.addEventListener('click', () => {
    if (carrito.length === 0) {
      mostrarNotificacion('El carrito está vacío', 'error');
      return;
    }
    elementos.avisoPreCompraModal.style.display = 'flex';
    elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'false');
  });

  document.getElementById('btn-cerrar-modal-envio')?.addEventListener('click', () => {
    const modalEnvio = document.getElementById('modal-datos-envio');
    if (modalEnvio) {
      modalEnvio.style.display = 'none';
      modalEnvio.setAttribute('hidden', 'hidden');
    }
  });

  elementos.btnEntendidoAviso?.addEventListener('click', () => {
    const modalEnvio = document.getElementById('modal-datos-envio');
    if (modalEnvio) {
      elementos.avisoPreCompraModal.style.display = 'none';
      elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'true');
      modalEnvio.style.display = 'flex';
      modalEnvio.classList.add('visible');
      modalEnvio.removeAttribute('hidden');
      actualizarResumenPedido();
    }
  });
  elementos.btnCancelarAviso?.addEventListener('click', () => {
    if (elementos.avisoPreCompraModal) {
      elementos.avisoPreCompraModal.style.display = 'none';
      elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'true');
    }
  });

  // filtros
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

  // Delegación para tarjetas (detalle/agregar/aviso) + accesibilidad
  (function initGaleriaDelegation() {
    const root = elementos.galeriaProductos;
    if (!root) return;

    if (root._pfDelegationAttached) {
      root.removeEventListener('click', root._pfDelegationAttached);
    }
    const handler = (e) => {
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
          try { ensureProductModal?.(); } catch(_) {}
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

    root.addEventListener('click', handler, { passive: false });
    root._pfDelegationAttached = handler;

    root.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const btn = e.target.closest('.boton-detalles, .boton-agregar, .boton-aviso-stock, [data-action]');
      if (btn) {
        e.preventDefault();
        btn.click();
      }
    });
  })();
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

// ===============================
// ACCIONES: VER DETALLE / AVISO STOCK
// ===============================
function verDetalle(id) {
  const producto = productos.find(p => p.id === id);
  if (!producto) {
    mostrarNotificacion('Producto no encontrado', 'error');
    return;
  }
  mostrarModalProducto(producto);
}

function preguntarStock(nombreProducto) {
  const modal = document.getElementById('stock-modal');
  const form = document.getElementById('stock-form');
  const input = document.getElementById('stock-email');
  const feedback = document.getElementById('stock-modal-feedback');
  const close = document.querySelector('.modal-stock-close');

  if (!modal || !form || !input) return;

  modal.hidden = false;
  input.value = '';
  feedback.hidden = true;

  const submit = (e) => {
    e.preventDefault();
    const email = input.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      feedback.textContent = 'Ingresá un email válido.';
      feedback.hidden = false;
      return;
    }
    // Aquí podrías guardar en Firebase / enviar email
    feedback.textContent = `Te avisaremos cuando "${nombreProducto}" tenga stock.`;
    feedback.hidden = false;
    setTimeout(() => { modal.hidden = true; }, 1600);
  };

  const closeFn = () => (modal.hidden = true);

  form.addEventListener('submit', submit, { once: true });
  close.addEventListener('click', closeFn, { once: true });
}
