// ===============================
// CONFIGURACIÓN GLOBAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const CSV_URL = window.SHEET_CSV_URL;
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

// Import Firebase core module for initializeApp (Already done in index.html, so removed here)
// Import Authentication functions
import {
  getAuth,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Import Realtime Database functions
import {
  getDatabase,
  ref,
  runTransaction,
  onValue,
  get
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// We assume Firebase is already initialized in index.html and its instances are available globally
// const app = initializeApp(firebaseConfig); // REMOVED: Already initialized in index.html
const db = window.firebaseDatabase; // Use the globally exposed database instance
const auth = getAuth(window.firebaseApp); // Assuming firebaseApp is also exposed globally or derive from `db`

// ===============================
// ESTADO GLOBAL
// ===============================
let productos = [];
let carrito = [];
let paginaActual = 1;

let filtrosActuales = {
  precioMin: 0, // Default to 0 for min price
  precioMax: 3000, // Default to 3000 for max price, based on slider max
  categoria: 'todos',
  busqueda: ''
};

// ===============================
// LOAD PRODUCTS ON PAGE LOAD
// ===============================
document.addEventListener('DOMContentLoaded', async () => {
  // It's generally better to load from Firebase as it's real-time and should be the source of truth for stock.
  // CSV can be used for initial data import if needed, but Firebase should override.
  try {
    await signInAnonymously(auth);
    console.log('✅ Signed in anonymously to Firebase.');
    cargarProductosDesdeFirebase();
  } catch (error) {
    console.error('❌ Error signing in to Firebase:', error);
    let errorMessage = 'Error de autenticación con Firebase.';
    if (error.code === 'auth/configuration-not-found') {
      errorMessage = 'Autenticación anónima no está habilitada en Firebase. Por favor, contacta al administrador.';
    } else if (error.code === 'auth/network-request-failed') {
      errorMessage = 'Error de red. Por favor, verifica tu conexión a internet.';
    }
    mostrarNotificacion(errorMessage, 'error');
  }

  cargarCarrito(); // Load cart from localStorage
  init(); // Initialize other UI elements and event listeners
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
    // Perform a transaction for each item to restore stock in Firebase
    await Promise.all(
      carrito.map(async (item) => {
        const productRef = ref(db, `productos/${item.id}/stock`);
        await runTransaction(productRef, (currentStock) => {
          // If stock is null or not a number, initialize it to 0 before adding back
          if (typeof currentStock !== 'number' || isNaN(currentStock)) {
            currentStock = 0;
          }
          return currentStock + item.cantidad;
        });
      })
    );

    carrito = []; // Clear the local cart
    guardarCarrito(); // Update localStorage
    renderizarCarrito(); // Re-render the cart UI
    renderizarProductos(); // Re-render product gallery to show updated stock
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

// Cargar datos de productos desde Firebase
async function cargarProductosDesdeFirebase() {
  const productosRef = ref(db, 'productos');

  try {
    if (elementos.productLoader) {
      elementos.productLoader.style.display = 'flex';
      elementos.productLoader.hidden = false;
    }

    // Use get() for initial load to avoid flickering if onValue takes time
    const snapshot = await get(productosRef);

    if (!snapshot.exists()) {
      elementos.galeriaProductos.innerHTML = '<p class="sin-productos">No hay productos disponibles.</p>';
      return;
    }

    // Process initial data
    procesarDatosProductos(snapshot.val());

    // Set up real-time listener for subsequent changes
    onValue(productosRef, (snapshot) => {
      if (!snapshot.exists()) {
        productos = []; // Clear products if no data
        renderizarProductos();
        actualizarCategorias();
        actualizarUI();
        return;
      }
      procesarDatosProductos(snapshot.val());
    }, (error) => {
      console.error('Error en listener de productos Firebase:', error);
      mostrarNotificacion('Error al recibir actualizaciones de productos', 'error');
    });

  } catch (e) {
    console.error('Error al cargar productos desde Firebase:', e);
    mostrarNotificacion('Error al cargar productos: ' + (e.message || 'Error desconocido'), 'error');
    elementos.galeriaProductos.innerHTML = '<p class="error-carga">No se pudieron cargar los productos.</p>';
  } finally {
    setTimeout(() => { // Small delay to ensure loader is seen if load is too fast
      if (elementos.productLoader) {
        elementos.productLoader.style.display = 'none';
        elementos.productLoader.hidden = true;
      }
    }, 300);
  }
}

// Auxiliary function to process product data from Firebase
function procesarDatosProductos(data) {
  // Clear existing products to avoid duplicates when onValue is triggered
  productos = [];
  Object.keys(data).forEach(key => {
    const p = data[key];
    if (!p || typeof p !== 'object') {
      console.warn(`Producto ${key} tiene datos inválidos o faltantes`, p);
      return; // Skip invalid product entries
    }

    productos.push({
      id: p.id && !isNaN(p.id) ? parseInt(p.id) : parseInt(key), // Use key as ID if p.id is missing/invalid
      nombre: typeof p.nombre === 'string' ? p.nombre.trim() : 'Sin nombre',
      descripcion: typeof p.descripcion === 'string' ? p.descripcion.trim() : '',
      precio: !isNaN(parseFloat(p.precio)) ? parseFloat(p.precio) : 0,
      stock: !isNaN(parseInt(p.stock, 10)) ? Math.max(0, parseInt(p.stock, 10)) : 0,
      imagenes: Array.isArray(p.imagenes) ? p.imagenes.filter(img => typeof img === 'string' && img.trim() !== '') : [PLACEHOLDER_IMAGE],
      categoria: typeof p.categoria === 'string' ? p.categoria.toLowerCase().trim() : 'otros',
      estado: typeof p.estado === 'string' ? p.estado.trim() : '',
      // Add other properties if they exist in your Firebase data
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

function renderizarCarrito() {
  if (!elementos.listaCarrito || !elementos.totalCarrito) return;

  if (carrito.length === 0) {
    elementos.listaCarrito.innerHTML = '<p class="carrito-vacio">Tu carrito está vacío</p>';
    elementos.totalCarrito.textContent = 'Total: $U 0';
    return;
  }

  elementos.listaCarrito.innerHTML = carrito.map(item => {
    const producto = productos.find(p => p.id === item.id);
    // Calculate available stock based on current product stock minus what's already in the cart for this item
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

  // Delegate events for quantity buttons
  elementos.listaCarrito.querySelectorAll('.disminuir-cantidad').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      const item = carrito.find(item => item.id === id);
      if (item && item.cantidad > 1) {
        // Decrease quantity in cart
        item.cantidad--;
        // Restore stock in Firebase for the decreased amount
        const productRef = ref(db, `productos/${id}/stock`);
        runTransaction(productRef, (currentStock) => {
          if (typeof currentStock !== 'number' || isNaN(currentStock)) {
            currentStock = 0;
          }
          return currentStock + 1; // Add back 1 to stock
        }).then(() => {
          guardarCarrito();
          renderizarCarrito();
          renderizarProductos(); // Re-render product gallery to show updated stock
          mostrarNotificacion(`Reducida cantidad de "${item.nombre}"`, 'info');
        }).catch(error => {
          console.error("Error al disminuir cantidad y restaurar stock:", error);
          mostrarNotificacion("Error al actualizar cantidad", "error");
        });
      }
    });
  });

  elementos.listaCarrito.querySelectorAll('.aumentar-cantidad').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      agregarAlCarrito(id, 1); // Use transaction-based add to check stock and decrement
    });
  });
}

// ===============================
// ABRIR Y CERRAR CARRITO
// ===============================
function toggleCarrito(forceState) {
  if (!elementos.carritoPanel || !elementos.carritoOverlay) return;
  let isOpen;
  if (typeof forceState === 'boolean') {
    isOpen = forceState;
  } else {
    isOpen = !elementos.carritoPanel.classList.contains('active');
  }

  elementos.carritoPanel.classList.toggle('active', isOpen);
  elementos.carritoOverlay.classList.toggle('active', isOpen);
  document.body.classList.toggle('no-scroll', isOpen);

  if (isOpen) renderizarCarrito();
}

// ===============================
// PRODUCTOS, FILTROS Y PAGINACIÓN
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

  // Check how much of this product is already in the cart
  const enCarrito = carrito.find(item => item.id === id);
  const cantidadYaEnCarrito = enCarrito ? enCarrito.cantidad : 0;

  // Calculate actual stock available for new additions
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
    // If stock is null or not a number, initialize it to 0
    if (typeof currentStock !== 'number' || isNaN(currentStock)) {
      currentStock = 0;
    }

    if (currentStock < cantidadAgregar) {
      // Abort transaction if stock is insufficient
      return undefined;
    }
    return currentStock - cantidadAgregar; // Decrement stock
  }).then((res) => {
    if (!res.committed) {
      // Transaction was aborted, likely due to insufficient stock
      mostrarNotificacion('❌ Stock insuficiente o actualizado por otro usuario. Intente de nuevo.', 'error');
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
    renderizarCarrito();
    renderizarProductos(); // Re-render gallery to reflect stock change
    mostrarNotificacion("✅ Producto agregado al carrito", "exito");

  }).catch((error) => {
    console.error("Error al agregar al carrito (transacción Firebase):", error);
    mostrarNotificacion("⚠️ Error inesperado al agregar al carrito", "error");
  }).finally(() => {
    if (boton) {
      boton.disabled = false;
      boton.innerHTML = textoOriginal;
    }
  });
}

function filtrarProductos() {
  return productos.filter(p => {
    if (!p) return false; // Ensure product is valid
    const {
      precioMin,
      precioMax,
      categoria,
      busqueda
    } = filtrosActuales;
    const b = busqueda?.toLowerCase() || "";

    const matchesPrice = (p.precio >= precioMin) && (p.precio <= precioMax);
    const matchesCategory = (categoria === 'todos' || p.categoria === categoria);
    const matchesSearch = (!b || p.nombre.toLowerCase().includes(b) || p.descripcion.toLowerCase().includes(b));

    return matchesPrice && matchesCategory && matchesSearch;
  });
}

function actualizarCategorias() {
  if (!elementos.selectCategoria) return;
  // Get unique categories from products, filter out empty/null values, and sort
  const cats = ['todos', ...new Set(productos.map(p => p.categoria).filter(Boolean).sort())];
  elementos.selectCategoria.innerHTML = cats
    .map(cat => `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`)
    .join('');
  // Set the selected category back if it was previously set
  elementos.selectCategoria.value = filtrosActuales.categoria;
}

// ===============================
// FUNCIONES GLOBALES
// ===============================

function crearCardProducto(p) {
  const enCarrito = carrito.find(i => i.id === p.id);
  const disp = Math.max(0, p.stock - (enCarrito?.cantidad || 0));
  const agot = disp <= 0;
  const imagenPrincipal = p.imagenes && p.imagenes.length > 0 ? p.imagenes[0] : PLACEHOLDER_IMAGE;

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
        <button class="boton-aviso-stock" data-nombre="${p.nombre.replace(/'/g, "\\'")}" style="background-color: #ffd93b; color: #333; font-weight: bold;">
          📩 Avisame cuando haya stock
        </button>` : ''}
      </div>
      <button class="boton-detalles" data-id="${p.id}">🔍 Ver Detalle</button>
    </div>
  `;
}

function renderizarProductos() {
  const productosFiltrados = filtrarProductos();
  const inicio = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
  const paginados = productosFiltrados.slice(inicio, inicio + PRODUCTOS_POR_PAGINA);

  if (!elementos.galeriaProductos) return;

  // Clear existing products and re-render
  elementos.galeriaProductos.innerHTML = ''; // Clear content first

  if (paginados.length === 0) {
    elementos.galeriaProductos.innerHTML = '<p class="sin-productos">No se encontraron productos que coincidan con los filtros.</p>';
  } else {
    elementos.galeriaProductos.innerHTML = paginados.map(crearCardProducto).join('');
  }

  renderizarPaginacion(productosFiltrados.length);
}

function renderizarPaginacion(totalProductos) {
  const totalPages = Math.ceil(totalProductos / PRODUCTOS_POR_PAGINA);
  const paginacionContainer = elementos.paginacion;

  if (!paginacionContainer) return;

  paginacionContainer.innerHTML = ''; // Clear existing pagination buttons

  if (totalPages <= 1) {
    return;
  }

  for (let i = 1; i <= totalPages; i++) {
    const pageButton = document.createElement('button');
    pageButton.textContent = i;
    pageButton.className = i === paginaActual ? 'active' : '';
    pageButton.addEventListener('click', () => {
      paginaActual = i;
      renderizarProductos();
      window.scrollTo({
        top: elementos.galeriaProductos.offsetTop - 100,
        behavior: 'smooth'
      }); // Scroll to products section
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

  const enCarrito = carrito.find(item => item.id === producto.id) || {
    cantidad: 0
  };
  const disponibles = Math.max(0, producto.stock - enCarrito.cantidad);
  const agotado = disponibles <= 0;
  let currentIndex = 0; // Reset index each time modal opens

  function renderCarruselAndContent() {
    contenido.innerHTML = `
      <button class="cerrar-modal" aria-label="Cerrar modal" onclick="cerrarModal()">&times;</button>
      <div class="modal-flex">
        <div class="modal-carrusel">
          <img id="modal-imagen" src="${producto.imagenes[currentIndex] || PLACEHOLDER_IMAGE}" class="modal-img" alt="${producto.nombre}">
          ${
            producto.imagenes.length > 1
              ? `
          <div class="modal-controls">
            <button class="modal-prev" aria-label="Imagen anterior" ${currentIndex === 0 ? 'disabled' : ''}>
              <svg width="26" height="26" viewBox="0 0 26 26"><polyline points="17 22 9 13 17 4" fill="none" stroke="#2e7d32" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button class="modal-next" aria-label="Siguiente imagen" ${currentIndex === producto.imagenes.length - 1 ? 'disabled' : ''}>
              <svg width="26" height="26" viewBox="0 0 26 26"><polyline points="9 4 17 13 9 22" fill="none" stroke="#2e7d32" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
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
            <br>
            ${producto.adicionales ? `<small><b>Adicionales:</b> ${producto.adicionales}</small><br>` : ''}
            ${
              producto.alto || producto.ancho || producto.profundidad
                ? `<small><b>Medidas:</b> ${producto.alto ? producto.alto + ' cm (alto)' : ''}${producto.ancho ? ' x ' + producto.ancho + ' cm (ancho)' : ''}${producto.profundidad ? ' x ' + producto.profundidad + ' cm (prof.)' : ''}</small>`
                : ''
            }
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

    // Event listeners for modal elements
    contenido.querySelector('.cerrar-modal').onclick = () => cerrarModal();

    const btnPrev = contenido.querySelector('.modal-prev');
    const btnNext = contenido.querySelector('.modal-next');
    const thumbnails = contenido.querySelectorAll('.thumbnail');
    const addModalBtn = contenido.querySelector('.boton-agregar-modal');
    const cantidadInput = contenido.querySelector('.cantidad-modal-input');

    btnPrev?.addEventListener('click', () => {
      if (currentIndex > 0) {
        currentIndex--;
        renderCarruselAndContent();
      }
    });

    btnNext?.addEventListener('click', () => {
      if (currentIndex < producto.imagenes.length - 1) {
        currentIndex++;
        renderCarruselAndContent();
      }
    });

    thumbnails.forEach(th => {
      th.addEventListener('click', () => {
        currentIndex = parseInt(th.dataset.index);
        renderCarruselAndContent();
      });
    });

    addModalBtn?.addEventListener('click', (e) => {
      const id = parseInt(e.currentTarget.dataset.id);
      const cantidad = parseInt(cantidadInput.value);
      agregarAlCarrito(id, cantidad, addModalBtn);
    });
  }

  renderCarruselAndContent();
  modal.classList.add('active'); // Use a class to control visibility and animation
  document.body.classList.add('no-scroll'); // Prevent scrolling body when modal is open
}

function cerrarModal() {
  if (elementos.productoModal) {
    elementos.productoModal.classList.remove('active');
    document.body.classList.remove('no-scroll');
  }
}
window.cerrarModal = cerrarModal; // Expose to global scope for onclick in HTML

// ===============================
// ACTUALIZAR UI
// ===============================
function actualizarUI() {
  renderizarCarrito();
  actualizarContadorCarrito();
}

// ===============================
// FILTROS Y RESET
// ===============================
function aplicarFiltros() {
  paginaActual = 1; // Reset to first page when filters change
  renderizarProductos();
}

function resetearFiltros() {
  filtrosActuales = {
    precioMin: 0,
    precioMax: 3000, // Assuming max price is 3000 from the slider setup
    categoria: 'todos',
    busqueda: ''
  };
  if (elementos.inputBusqueda) elementos.inputBusqueda.value = '';
  if (elementos.selectCategoria) elementos.selectCategoria.value = 'todos';
  if (elementos.precioMinInput) elementos.precioMinInput.value = '0'; // Reset slider values
  if (elementos.precioMaxInput) elementos.precioMaxInput.value = '3000'; // Reset slider values
  updateRange(); // Update slider UI
  aplicarFiltros();
}

// ===============================
// FAQ INTERACTIVO
// ===============================
function inicializarFAQ() {
  const faqToggles = document.querySelectorAll('.faq-toggle');
  faqToggles.forEach(toggle => {
    toggle.addEventListener('click', () => {
      const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', !isExpanded);
      const content = toggle.nextElementSibling;
      if (content) {
        content.hidden = isExpanded; // Toggle hidden attribute
      }
    });
  });
}

// ===============================
// MENÚ HAMBURGUESA RESPONSIVE
// ===============================
function inicializarMenuHamburguesa() {
  const hamburguesa = document.querySelector('.hamburguesa');
  const menu = document.getElementById('menu');
  if (!hamburguesa || !menu) return;

  hamburguesa.addEventListener('click', function() {
    const expanded = menu.classList.toggle('active');
    hamburguesa.setAttribute('aria-expanded', expanded);
    document.body.classList.toggle('no-scroll', expanded);
  });

  // Close menu when a link is clicked (for single-page navigation)
  menu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      menu.classList.remove('active');
      hamburguesa.setAttribute('aria-expanded', false);
      document.body.classList.remove('no-scroll');
    });
  });
}

// ===============================
// CONTACT FORM CON EMAILJS
// ===============================
function setupContactForm() {
  const formContacto = document.getElementById('formContacto');
  const successMessage = document.getElementById('successMessage');
  const errorMessage = document.getElementById('errorMessage');

  if (!formContacto) return;

  formContacto.addEventListener('submit', (e) => {
    e.preventDefault();

    // Check if emailjs is available
    if (!window.emailjs) {
      console.error('EmailJS library is not loaded.');
      if (errorMessage) {
        errorMessage.classList.remove('hidden');
        errorMessage.textContent = 'Error: Servicio de email no disponible. Intenta de nuevo más tarde.';
        setTimeout(() => errorMessage.classList.add('hidden'), 3000);
      }
      return;
    }

    // Initialize EmailJS if not already initialized
    if (!window.emailjs.init) {
      console.error('EmailJS not properly loaded');
      return;
    }

    try {
      // Initialize with your user ID (only once)
      if (!window.emailjsInitialized) {
        emailjs.init('o4IxJz0Zz-LQ8jYKG'); // Replace with your actual EmailJS User ID
        window.emailjsInitialized = true;
      }

      const nombre = document.getElementById('nombre').value;
      const email = document.getElementById('email').value;
      const mensaje = document.getElementById('mensaje').value;

      emailjs.send('service_89by24g', 'template_8mn7hdp', {
          from_name: nombre,
          from_email: email,
          message: mensaje
        })
        .then(() => {
          if (successMessage) {
            successMessage.classList.remove('hidden');
            if (errorMessage) errorMessage.classList.add('hidden');
            formContacto.reset();
            setTimeout(() => successMessage.classList.add('hidden'), 3000);
          }
        }, (error) => {
          console.error('Error al enviar el mensaje:', error);
          if (errorMessage) {
            errorMessage.classList.remove('hidden');
            if (successMessage) successMessage.classList.add('hidden');
            errorMessage.textContent = 'Error al enviar el mensaje. Intenta de nuevo.';
            setTimeout(() => errorMessage.classList.add('hidden'), 3000);
          }
        });
    } catch (error) {
      console.error('Error in EmailJS:', error);
      if (errorMessage) {
        errorMessage.classList.remove('hidden');
        errorMessage.textContent = 'Error en el servicio de contacto. Intenta de nuevo más tarde.';
        setTimeout(() => errorMessage.classList.add('hidden'), 3000);
      }
    }
  });
}

// ===============================
// INICIALIZACIÓN GENERAL
// ===============================
function init() {
  inicializarMenuHamburguesa();
  inicializarFAQ();
  setupContactForm();
  inicializarEventos();
  updateRange(); // Initialize slider positions
}

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
    if (elementos.avisoPreCompraModal) {
      elementos.avisoPreCompraModal.style.display = 'none';
      elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'true');
    }
  });

  elementos.inputBusqueda?.addEventListener('input', (e) => {
    filtrosActuales.busqueda = e.target.value.toLowerCase();
    aplicarFiltros();
  });

  elementos.selectCategoria?.addEventListener('change', (e) => {
    filtrosActuales.categoria = e.target.value;
    aplicarFiltros();
  });

  elementos.precioMinInput?.addEventListener('input', () => {
    updateRange();
    aplicarFiltros();
  });
  elementos.precioMaxInput?.addEventListener('input', () => {
    updateRange();
    aplicarFiltros();
  });

  elementos.aplicarRangoBtn?.addEventListener('click', () => {
    filtrosActuales.precioMin = parseInt(elementos.precioMinInput.value);
    filtrosActuales.precioMax = parseInt(elementos.precioMaxInput.value);
    aplicarFiltros();
  });

  // Delegación segura para los botones de producto
  elementos.galeriaProductos?.addEventListener('click', (e) => {
    const card = e.target.closest('.producto-card');
    if (!card) return;
    const id = Number(card.dataset.id);
    if (!Number.isFinite(id)) return;

    if (e.target.closest('.boton-detalles')) {
      verDetalle(id);
      return;
    }
    if (e.target.closest('.boton-agregar')) {
      agregarAlCarrito(id, 1, e.target.closest('button'));
      return;
    }
    if (e.target.closest('.boton-aviso-stock')) {
      preguntarStock(e.target.closest('.boton-aviso-stock').dataset.nombre);
      return;
    }
  });


// ===============================
// SLIDERS DE PRECIO (ya incluido arriba, pero asegúrate que se ejecute al cargar)
// ===============================
if (elementos.precioMinInput && elementos.precioMaxInput) {
  elementos.precioMinInput.addEventListener('input', updateRange);
  elementos.precioMaxInput.addEventListener('input', updateRange);
  updateRange();
}

// ===============================
// EXPORTAR FUNCIONES PARA HTML
// ===============================
window.verDetalle = verDetalle;
window.agregarAlCarrito = agregarAlCarrito;
window.preguntarStock = preguntarStock;

// ===============================
// INICIALIZACIÓN FINAL
// ===============================
init();
