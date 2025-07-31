// ===============================
// CONFIGURACIÓN GLOBAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const CSV_URL = window.SHEET_CSV_URL;
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

// Import Firebase core module for initializeApp
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

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

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD261TL6XuBp12rUNCcMKyP7_nMaCVYc7Y",
  authDomain: "patofelting-b188f.firebaseapp.com",
  databaseURL: "https://patofelting-b188f-default-rtdb.firebaseio.com",
  projectId: "patofelting-b188f",
  storageBucket: "patofelting-b188f.appspot.com",
  messagingSenderId: "858377467588",
  appId: "1:858377467588:web:cade9de05ebccc17f87b91"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Obtain service instances
const db = getDatabase(app);
const auth = getAuth(app);

// Anonymous authentication
signInAnonymously(auth)
  .then(() => console.log("✅ Signed in anonymously"))
  .catch(error => console.error("❌ Error signing in:", error));

// ===============================
// ESTADO GLOBAL
// ===============================
let productos = [];
let carrito = [];
let paginaActual = 1;

let filtrosActuales = {
  precioMin: null,
  precioMax: null,
  categoria: 'todos',
  busqueda: ''
};
// ===============================
// LOAD PRODUCTS ON PAGE LOAD
// ===============================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Si estás cargando desde un CSV y luego fusionando con Firebase,
    // asegúrate de que Papa Parse esté disponible globalmente o importarlo.
    // Por ahora, lo dejaré comentado si no lo usas activamente o Papa Parse no está incluido en tu HTML.
    // await cargarProductosDesdeCSV();
  } catch (e) {
    console.warn("No se pudo cargar productos desde CSV (posiblemente Papa Parse no está cargado o CSV_URL es nulo):", e);
  }

  try {
    await signInAnonymously(auth);
    console.log('✅ Signed in anonymously to Firebase.');
    cargarProductosDesdeFirebase(); // Ahora cargarProductosDesdeFirebase se encarga de la fusión si CSV se carga primero
    cargarCarrito(); // Load cart from localStorage
    init(); // Initialize other UI elements and event listeners
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

// Cargar datos de productos desde Google Sheets (CSV)
async function cargarProductosDesdeCSV() {
  if (!CSV_URL || typeof Papa === 'undefined') {
    // console.warn("CSV_URL no definida o Papa Parse no cargado. Saltando carga de CSV.");
    return Promise.resolve(); // Resuelve inmediatamente si no hay CSV_URL o Papa Parse
  }
  return new Promise((resolve, reject) => {
    Papa.parse(CSV_URL, {
      download: true,
      header: true,
      dynamicTyping: true,
      complete: (result) => {
        try {
          // Cargar productos desde CSV inicialmente
          productos = result.data
            .filter(row => row && row.id)
            .map(row => ({
              id: parseInt(row.id),
              nombre: row.nombre ? String(row.nombre).trim() : 'Sin nombre',
              descripcion: row.descripcion ? String(row.descripcion).trim() : '',
              precio: !isNaN(parseFloat(row.precio)) ? parseFloat(row.precio) : 0,
              stock: !isNaN(parseInt(row.stock)) ? parseInt(row.stock) : 0,
              imagenes: row.imagenes
                ? String(row.imagenes)
                    .split('|')
                    .map(u => u.trim())
                    .filter(Boolean)
                : [PLACEHOLDER_IMAGE],
              categoria: row.categoria
                ? String(row.categoria).toLowerCase().trim()
                : 'otros',
              estado: row.estado ? String(row.estado).trim() : ''
            }));
          // console.log("Productos cargados desde CSV:", productos.length);
          resolve();
        } catch (err) {
          console.error("Error al procesar datos CSV:", err);
          reject(err);
        }
      },
      error: (err) => {
        console.error("Error al descargar CSV:", err);
        reject(err);
      }
    });
  }).catch(err => {
    console.error('Error al cargar CSV:', err);
    mostrarNotificacion('Error al cargar hoja de productos desde CSV', 'error');
  });
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
      // Si no hay productos en Firebase, y no se cargaron desde CSV, mostrar mensaje.
      if (productos.length === 0) {
        elementos.galeriaProductos.innerHTML = '<p class="sin-productos">No hay productos disponibles.</p>';
      }
      return;
    }

    // Process initial data, merging with existing 'productos' if loaded from CSV
    mergeProductosConFirebase(snapshot.val());

    // Set up real-time listener for subsequent changes
    onValue(productosRef, (snapshot) => {
      if (!snapshot.exists()) {
        productos = []; // Clear products if no data
        renderizarProductos();
        actualizarCategorias();
        actualizarUI();
        return;
      }
      mergeProductosConFirebase(snapshot.val());
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

// Auxiliary function to process and merge product data from Firebase
function mergeProductosConFirebase(firebaseData) {
  const firebaseProducts = [];
  Object.keys(firebaseData).forEach(key => {
    const p = firebaseData[key];
    if (!p || typeof p !== 'object') {
      console.warn(`Producto ${key} tiene datos inválidos o faltantes en Firebase`, p);
      return; // Skip invalid product entries
    }
    firebaseProducts.push({
      id: p.id && !isNaN(p.id) ? parseInt(p.id) : parseInt(key), // Use key as ID if p.id is missing/invalid
      nombre: typeof p.nombre === 'string' ? p.nombre.trim() : 'Sin nombre',
      descripcion: typeof p.descripcion === 'string' ? p.descripcion.trim() : '',
      precio: !isNaN(parseFloat(p.precio)) ? parseFloat(p.precio) : 0,
      stock: !isNaN(parseInt(p.stock, 10)) ? Math.max(0, parseInt(p.stock, 10)) : 0,
      imagenes: Array.isArray(p.imagenes) ? p.imagenes.filter(img => typeof img === 'string' && img.trim() !== '') : [PLACEHOLDER_IMAGE],
      categoria: typeof p.categoria === 'string' ? p.categoria.toLowerCase().trim() : 'otros',
      estado: typeof p.estado === 'string' ? p.estado.trim() : '',
      adicionales: typeof p.adicionales === 'string' ? p.adicionales.trim() : '',
      alto: !isNaN(parseFloat(p.alto)) ? parseFloat(p.alto) : null,
      ancho: !isNaN(parseFloat(p.ancho)) ? parseFloat(p.ancho) : null,
      profundidad: !isNaN(parseFloat(p.profundidad)) ? parseFloat(p.profundidad) : null,
    });
  });

  // Merge firebaseProducts into 'productos' array
  firebaseProducts.forEach(fp => {
    const existingIndex = productos.findIndex(p => p.id === fp.id);
    if (existingIndex !== -1) {
      // Update existing product with Firebase data (Firebase takes precedence for stock/price)
      productos[existingIndex] = { ...productos[existingIndex], ...fp };
    } else {
      // Add new product from Firebase
      productos.push(fp);
    }
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
    const disponiblesParaAgregar = producto ? obtenerStockDisponible(producto) : 0;

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

/**
 * Calcula el stock disponible de un producto, restando la cantidad que ya está en el carrito.
 * @param {object} producto - El objeto producto.
 * @returns {number} El stock disponible para agregar al carrito.
 */
function obtenerStockDisponible(producto) {
  const enCarrito = carrito.find(i => i.id === producto.id);
  return Math.max(0, producto.stock - (enCarrito?.cantidad || 0));
}

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
      if (textoOriginal !== null) {
        boton.innerHTML = textoOriginal;
      }
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
  const disponibles = obtenerStockDisponible(p); // Usar la nueva función
  const agotado = disponibles <= 0;
  const imagenPrincipal = p.imagenes && p.imagenes.length > 0 ? p.imagenes[0] : PLACEHOLDER_IMAGE;

  return `
    <div class="producto-card ${agotado ? 'agotado' : ''}" data-id="${p.id}">
      <img src="${imagenPrincipal}" alt="${p.nombre}" class="producto-img" loading="lazy">
      <h3 class="producto-nombre">${p.nombre}</h3>
      <p class="producto-precio">$U ${p.precio.toLocaleString('es-UY')}</p>
      <p class="producto-stock-info">
        ${agotado ? 'AGOTADO' : `Stock: ${disponibles} unidades`}
      </p>
      <div class="card-acciones">
        <button class="boton-agregar${agotado ? ' agotado' : ''}" data-id="${p.id}" ${agotado ? 'disabled' : ''}>
          ${agotado ? '<i class="fas fa-times-circle"></i> Agotado' : '<i class="fas fa-cart-plus"></i> Agregar'}
        </button>
        ${agotado ? `
        <button class="boton-aviso-stock" data-nombre="${p.nombre.replace(/'/g, "\\'")}" style="background-color: #ffd93b; color: #333; font-weight: bold;">
          📩 Avisame cuando haya stock
        </button>` : ''}
      </div>
      <button class="boton-detalles" data-id="${p.id}">🔍 Ver Detalle</button>
    </div>
  `;
}


function manejarEventosGaleria(e) {
  const boton = e.target.closest('button');
  const tarjeta = e.target.closest('.producto-card');

  if (!tarjeta || !boton) return;

  const id = parseInt(tarjeta.dataset.id);
  const producto = productos.find(p => p.id === id);
  if (!producto || isNaN(id)) return;

  e.stopPropagation(); // Prevent duplicate clicks from propagating

  if (boton.classList.contains('boton-detalles')) {
    verDetalle(id);
  } else if (boton.classList.contains('boton-agregar')) {
    agregarAlCarrito(id, 1, boton);
  } else if (boton.classList.contains('boton-aviso-stock')) {
    preguntarStock(boton.dataset.nombre || producto.nombre);
  }
}

function renderizarProductos() {
  const productosFiltrados = filtrarProductos();
  const inicio = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
  const paginados = productosFiltrados.slice(inicio, inicio + PRODUCTOS_POR_PAGINA);

  if (!elementos.galeriaProductos) return;

  // Eliminar los escuchadores de eventos existentes de todas las tarjetas de producto antes de volver a renderizar
  elementos.galeriaProductos.querySelectorAll('.producto-card').forEach(card => {
    card.removeEventListener('click', manejarEventosGaleria);
  });

  if (paginados.length === 0) {
    elementos.galeriaProductos.innerHTML = '<p class="sin-productos">No se encontraron productos que coincidan con los filtros.</p>';
  } else {
    elementos.galeriaProductos.innerHTML = paginados.map(crearCardProducto).join('');
  }

  renderizarPaginacion(productosFiltrados.length);

  // Añadir escuchadores de eventos a las tarjetas de producto recién renderizadas o actualizadas
  elementos.galeriaProductos.querySelectorAll('.producto-card').forEach(card => {
    card.addEventListener('click', manejarEventosGaleria);
  });
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

  const disponibles = obtenerStockDisponible(producto); // Usar la nueva función
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
            ${agotado ? 'AGOTADO' : `Stock disponible: ${disponibles} unidades`}
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
    // Ya no es necesario setear el onclick en el HTML si lo hacemos aquí
    // contenido.querySelector('.cerrar-modal').onclick = () => cerrarModal();

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
        // Optional: add a class for CSS transitions
        // content.classList.toggle('active', !isExpanded);
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

  if (formContacto && window.emailjs) { // Ensure emailjs library is loaded
    // Initialize EmailJS with your user ID
    emailjs.init("YOUR_EMAILJS_USER_ID"); // Reemplazar con tu ID de usuario real de EmailJS. No lo he puesto en el código ya que no lo proporcionaste.

    formContacto.addEventListener('submit', (e) => {
      e.preventDefault();

      // Check if emailjs is available
      if (!window.emailjs) {
        console.error('EmailJS library is not loaded.');
        errorMessage.classList.remove('hidden');
        errorMessage.textContent = 'Error: Servicio de email no disponible. Intenta de nuevo más tarde.';
        setTimeout(() => errorMessage.classList.add('hidden'), 3000);
        return;
      }

      const nombre = document.getElementById('nombre').value;
      const email = document.getElementById('email').value;
      const mensaje = document.getElementById('mensaje').value;

      // Reemplaza 'service_89by24g' y 'template_8mn7hdp' con tu Service ID y Template ID reales de EmailJS.
      emailjs.send('service_89by24g', 'template_8mn7hdp', {
          from_name: nombre,
          from_email: email,
          message: mensaje
        })
        .then(() => {
          successMessage.classList.remove('hidden');
          errorMessage.classList.add('hidden');
          formContacto.reset();
          setTimeout(() => successMessage.classList.add('hidden'), 3000);
        }, (error) => {
          console.error('Error al enviar el mensaje:', error);
          errorMessage.classList.remove('hidden');
          successMessage.classList.add('hidden');
          errorMessage.textContent = 'Error al enviar el mensaje. Intenta de nuevo.';
          setTimeout(() => errorMessage.classList.add('hidden'), 3000);
        });
    });
  } else if (formContacto && !window.emailjs) {
    console.warn('EmailJS library not found. Contact form will not function.');
    // Optionally disable the form or show a message
    // formContacto.querySelector('button[type="submit"]').disabled = true;
    // errorMessage.textContent = 'El servicio de contacto no está disponible.';
    // errorMessage.classList.remove('hidden');
  }
}


// ===============================
// INICIALIZACIÓN GENERAL
// ===============================
function init() {
  inicializarMenuHamburguesa();
  inicializarFAQ();
  setupContactForm();
  // cargarCarrito() is called in DOMContentLoaded before init now
  inicializarEventos();
  updateRange(); // Initialize slider positions
}

// ===============================
// EVENTOS
// ===============================
function inicializarEventos() {
  elementos.carritoBtnMain?.addEventListener('click', () => toggleCarrito(true));
  elementos.carritoOverlay?.addEventListener('click', () => toggleCarrito(false));
  elementos.btnCerrarCarrito?.addEventListener('click', () => toggleCarrito(false));

  document.getElementById('select-envio')?.addEventListener('change', actualizarResumenPedido);
  // Se ha quitado la doble llamada a vaciarCarrito
  elementos.btnVaciarCarrito?.addEventListener('click', vaciarCarrito);
  elementos.btnFinalizarCompra?.addEventListener('click', () => {
    if (carrito.length === 0) {
      mostrarNotificacion('El carrito está vacío', 'error');
      return;
    }
    elementos.avisoPreCompraModal.style.display = 'flex';
    elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'false');
  });

  elementos.btnEntendidoAviso?.addEventListener('click', () => {
    const modalEnvio = document.getElementById('modal-datos-envio');
    if (modalEnvio) {
      elementos.avisoPreCompraModal.style.display = 'none';
      elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'true');
      modalEnvio.style.display = 'flex';
      modalEnvio.classList.add('visible'); // Add visible class for animation
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

  // Update filters immediately when sliders are moved
  elementos.precioMinInput?.addEventListener('input', () => {
    filtrosActuales.precioMin = parseFloat(elementos.precioMinInput.value); // Asegúrate de actualizar el filtro
    updateRange();
    aplicarFiltros(); // Apply filters immediately on slider change
  });

  elementos.precioMaxInput?.addEventListener('input', () => {
    filtrosActuales.precioMax = parseFloat(elementos.precioMaxInput.value); // Asegúrate de actualizar el filtro
    updateRange();
    aplicarFiltros(); // Apply filters immediately on slider change
  });

  elementos.aplicarRangoBtn?.addEventListener('click', () => {
    // This button is redundant if filters apply on input, but keep if user needs explicit apply.
    // Ensure that the filter values are updated from the slider inputs, not just by updateRange()
    filtrosActuales.precioMin = parseInt(elementos.precioMinInput.value);
    filtrosActuales.precioMax = parseInt(elementos.precioMaxInput.value);
    aplicarFiltros();
  });

  // Delegated event listener for product cards (add to cart, view details, stock notification)
  elementos.galeriaProductos?.addEventListener('click', (e) => {
    const boton = e.target.closest('button');
    const tarjeta = e.target.closest('.producto-card');

    if (!tarjeta || !boton) return;

    const id = parseInt(tarjeta.dataset.id);
    const producto = productos.find(p => p.id === id);
    if (!producto || isNaN(id)) return;

    e.stopPropagation(); // Prevent duplicate clicks from propagating

    if (boton.classList.contains('boton-detalles')) {
      verDetalle(id);
    } else if (boton.classList.contains('boton-agregar')) {
      agregarAlCarrito(id, 1, boton);
    } else if (boton.classList.contains('boton-aviso-stock')) {
      preguntarStock(boton.dataset.nombre || producto.nombre);
    }
  });

}


function actualizarResumenPedido() {
  const resumenProductos = document.getElementById('resumen-productos');
  const resumenTotal = document.getElementById('resumen-total');

  if (!resumenProductos || !resumenTotal) {
    console.error('Elements for the summary not found');
    return;
  }

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

  if (metodoEnvio === 'montevideo') {
    costoEnvio = 150;
  } else if (metodoEnvio === 'interior') {
    costoEnvio = 300;
  }

  html += `
    <div class="resumen-item resumen-subtotal">
      <span>Subtotal:</span>
      <span>$U ${subtotal.toLocaleString('es-UY')}</span>
    </div>
    ${metodoEnvio !== 'retiro' ? `
    <div class="resumen-item resumen-envio">
      <span>Envío (${metodoEnvio === 'montevideo' ? 'Montevideo' : 'Interior'}):</span>
      <span>$U ${costoEnvio.toLocaleString('es-UY')}</span>
    </div>
    ` : ''}
  `;

  resumenProductos.innerHTML = html;
  const total = subtotal + costoEnvio;
  resumenTotal.textContent = `$U ${total.toLocaleString('es-UY')}`;

  // Toggle direction input visibility based on shipping method
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

// Cerrar modal de envío
document.getElementById('btn-cerrar-modal-envio')?.addEventListener('click', function() {
  const modalEnvio = document.getElementById('modal-datos-envio');
  modalEnvio.classList.remove('visible');
  modalEnvio.setAttribute('aria-hidden', 'true');
  setTimeout(() => {
    modalEnvio.style.display = 'none';
  }, 300);
});


// Validar y enviar por WhatsApp
document.getElementById('form-envio')?.addEventListener('submit', async function(e) {
  e.preventDefault();

  const nombre = document.getElementById('input-nombre').value.trim();
  const apellido = document.getElementById('input-apellido').value.trim();
  const telefono = document.getElementById('input-telefono').value.trim();
  const envio = document.getElementById('select-envio').value;
  const direccion = envio !== 'retiro' ? document.getElementById('input-direccion').value.trim() : '';
  const notas = document.getElementById('input-notas').value.trim();

  if (!nombre || !apellido || !telefono || (envio !== 'retiro' && !direccion)) {
    mostrarNotificacion('Por favor complete todos los campos obligatorios', 'error');
    return;
  }

  // Double check stock before sending order
  for (const item of carrito) {
    const productoReal = productos.find(p => p.id === item.id);
    if (!productoReal || productoReal.stock < item.cantidad) {
      mostrarNotificacion(`Stock insuficiente para "${item.nombre}". Por favor, actualice su carrito.`, 'error');
      return; // Stop the process
    }
  }

  let mensaje = `¡Hola Patofelting! Quiero hacer un pedido:\n\n`;
  mensaje += `*📋 Detalles del pedido:*\n`;

  carrito.forEach(item => {
    mensaje += `➤ ${item.nombre} x${item.cantidad} - $U ${(item.precio * item.cantidad).toLocaleString('es-UY')}\n`;
  });

  const subtotal = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
  const costoEnvio = envio === 'montevideo' ? 150 : envio === 'interior' ? 300 : 0;
  const total = subtotal + costoEnvio;

  mensaje += `\n*💰 Total:*\n`;
  mensaje += `Subtotal: $U ${subtotal.toLocaleString('es-UY')}\n`;
  mensaje += `Envío: $U ${costoEnvio.toLocaleString('es-UY')}\n`;
  mensaje += `*TOTAL A PAGAR: $U ${total.toLocaleString('es-UY')}*\n\n`;

  mensaje += `*👤 Datos del cliente:*\n`;
  mensaje += `Nombre: ${nombre} ${apellido}\n`;
  mensaje += `Teléfono: ${telefono}\n`;
  mensaje += `Método de envío: ${envio === 'montevideo' ? 'Envío Montevideo ($150)' : envio === 'interior' ? 'Envío Interior ($300)' : 'Retiro en local (Gratis)'}\n`;

  if (envio !== 'retiro') {
    mensaje += `Dirección: ${direccion}\n`;
  }

  if (notas) {
    mensaje += `\n*📝 Notas adicionales:*\n${notas}`;
  }

  const numeroWhatsApp = '59893566283'; // Your WhatsApp number
  sessionStorage.setItem('ultimoPedidoWhatsApp', mensaje); // Save for potential recovery

  const urlWhatsApp = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje)}`;

  // Try opening in new tab, fall back to current tab if blocked by browser
  const nuevaPestaña = window.open(urlWhatsApp, '_blank');
  if (!nuevaPestaña || nuevaPestaña.closed || typeof nuevaPestaña.closed == 'undefined') {
    // Fallback if popup is blocked
    window.location.href = `https://api.whatsapp.com/send?phone=${numeroWhatsApp}&text=${encodeURIComponent(mensaje)}`;
  }

  // Clear cart and UI after a small delay, assuming user proceeds to WhatsApp
  setTimeout(() => {
    document.getElementById('modal-datos-envio').classList.remove('visible');
    document.getElementById('modal-datos-envio').setAttribute('aria-hidden', 'true');
    setTimeout(() => {
      document.getElementById('modal-datos-envio').style.display = 'none';
      carrito = []; // Clear local cart
      guardarCarrito(); // Update localStorage
      actualizarUI(); // Re-render cart counter and other UI
      mostrarNotificacion('Pedido listo para enviar por WhatsApp', 'exito');
      document.getElementById('form-envio').reset(); // Reset the form
    }, 300);
  }, 1000);
});

// ===============================
// CONTROLADORES PARA LOS SLIDERS DE PRECIO
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

  // Ensure minVal is always less than or equal to maxVal
  if (minVal > maxVal) {
    // Swap values and update slider positions
    [minVal, maxVal] = [maxVal, minVal];
    minSlider.value = minVal;
    maxSlider.value = maxVal;
  }

  const sliderMax = parseInt(minSlider.max); // Both sliders should have the same max
  const porcentajeMin = (minVal / sliderMax) * 100;
  const porcentajeMax = (maxVal / sliderMax) * 100;

  range.style.left = porcentajeMin + '%';
  range.style.width = (porcentajeMax - porcentajeMin) + '%';

  minPriceSpan.textContent = `$U${minVal}`;
  maxPriceSpan.textContent = `$U${maxVal}`;
}

// Initial update for sliders and their display
if (minSlider && maxSlider) {
  minSlider.addEventListener('input', updateRange);
  maxSlider.addEventListener('input', updateRange);
  updateRange(); // Call once on load to set initial state
}


function preguntarStock(nombreProducto) {
  const asunto = encodeURIComponent(`Consulta sobre disponibilidad de "${nombreProducto}"`);
  const cuerpo = encodeURIComponent(`Hola Patofelting,\n\nMe gustaría saber cuándo estará disponible el producto: ${nombreProducto}\n\nSaludos cordiales,\n[Nombre del Cliente]`);
  window.location.href = `mailto:patofelting@gmail.com?subject=${asunto}&body=${cuerpo}`;
}

// Attach init to DOMContentLoaded (already done at the top, moved down for logical flow)
// document.addEventListener('DOMContentLoaded', init);

function verDetalle(id) {
  const producto = productos.find(p => p.id === id);
  if (producto) {
    mostrarModalProducto(producto);
  } else {
    mostrarNotificacion("Producto no encontrado", "error");
  }
}

// Expose functions to global scope if they are called from inline HTML event handlers (e.g., onclick)
window.verDetalle = verDetalle;
window.agregarAlCarrito = agregarAlCarrito;
window.aplicarRango = aplicarRango; // Expose aplicarRango if needed by HTML button
window.preguntarStock = preguntarStock;
