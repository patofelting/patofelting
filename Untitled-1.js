// ===============================
// CONFIGURACIÓN GLOBAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const CSV_URL = window.SHEET_CSV_URL;
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

// Import Firebase Authentication functions
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

// Use the globally exposed Firebase instances
const db = window.firebaseDatabase;
const auth = getAuth(window.firebaseApp);

// Global flag to prevent multiple simultaneous adds
let isProcessingAdd = false;

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
  console.log('Elementos disponibles:', {
    carritoBtnMain: elementos.carritoBtnMain,
    carritoPanel: elementos.carritoPanel,
    carritoOverlay: elementos.carritoOverlay,
    productoModal: elementos.productoModal,
    galeriaProductos: elementos.galeriaProductos
  });
  
  // Cart events
  if (elementos.carritoBtnMain) {
    elementos.carritoBtnMain.addEventListener('click', abrirCarrito);
    console.log('✅ Event listener para carrito configurado');
  } else {
    console.error('❌ Botón carrito no encontrado');
  }
  
  if (elementos.btnCerrarCarrito) {
    elementos.btnCerrarCarrito.addEventListener('click', cerrarCarrito);
  }
  
  if (elementos.carritoOverlay) {
    elementos.carritoOverlay.addEventListener('click', cerrarCarrito);
  }
  
  if (elementos.btnVaciarCarrito) {
    elementos.btnVaciarCarrito.addEventListener('click', vaciarCarrito);
  }
  
  if (elementos.btnFinalizarCompra) {
    elementos.btnFinalizarCompra.addEventListener('click', mostrarAvisoPreCompra);
  }

  // Pre-purchase warning modal events
  if (elementos.btnEntendidoAviso) {
    elementos.btnEntendidoAviso.addEventListener('click', () => {
      elementos.avisoPreCompraModal.hidden = true;
      mostrarModalDatosEnvio();
    });
  }
  
  if (elementos.btnCancelarAviso) {
    elementos.btnCancelarAviso.addEventListener('click', () => {
      elementos.avisoPreCompraModal.hidden = true;
    });
  }

  // Product modal events
  if (elementos.modalAgregarCarrito) {
    elementos.modalAgregarCarrito.addEventListener('click', agregarDesdeModal);
  }
  
  if (elementos.modalPrev) {
    elementos.modalPrev.addEventListener('click', () => cambiarImagenModal(-1));
  }
  
  if (elementos.modalNext) {
    elementos.modalNext.addEventListener('click', () => cambiarImagenModal(1));
  }

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
  if (elementos.hamburguesa) {
    elementos.hamburguesa.addEventListener('click', toggleMenu);
  }

  // Range filter application
  if (elementos.aplicarRangoBtn) {
    elementos.aplicarRangoBtn.addEventListener('click', aplicarRango);
  }

  // Event delegation for dynamically generated product cards
  if (elementos.galeriaProductos) {
    elementos.galeriaProductos.addEventListener('click', async (e) => {
      // Immediately prevent default and stop propagation
      e.preventDefault();
      e.stopPropagation();
      
      const productCard = e.target.closest('.producto-card');
      if (!productCard) return;

      const productId = parseInt(productCard.dataset.id);
      const producto = productos.find(p => p.id === productId);
      if (!producto) return;

      // Handle "Agregar" button clicks ONLY
      if (e.target.classList.contains('boton-agregar')) {
        // Check if already processing globally
        if (isProcessingAdd) {
          console.log('🚫 Operación global en proceso, ignorando clic...');
          return;
        }
        
        const cantidadInput = productCard.querySelector('.cantidad-input');
        const cantidad = cantidadInput ? parseInt(cantidadInput.value) || 1 : 1;
        console.log(`🎯 Clic en agregar - Producto: ${productId}, Cantidad: ${cantidad}`);
        await agregarAlCarrito(productId, cantidad);
        
      } else if (e.target.classList.contains('boton-detalles')) {
        // Handle "Ver Detalles" button clicks ONLY
        abrirModal(producto);
        
      } else if (!e.target.closest('.boton-agregar, .boton-detalles, .cantidad-input')) {
        // Click anywhere else on card (except buttons/inputs) opens modal
        abrirModal(producto);
      }
    });
  }
}

function configurarFiltros() {
  if (elementos.inputBusqueda) {
    elementos.inputBusqueda.addEventListener('input', debounce(() => {
      filtrosActuales.busqueda = elementos.inputBusqueda.value.trim().toLowerCase();
      paginaActual = 1;
      renderizarProductos();
    }, 300));
  }

  if (elementos.selectCategoria) {
    elementos.selectCategoria.addEventListener('change', () => {
      filtrosActuales.categoria = elementos.selectCategoria.value;
      paginaActual = 1;
      renderizarProductos();
    });
  }
}

function configurarPriceSlider() {
  if (elementos.precioMinInput && elementos.precioMaxInput) {
    const updateSliderVisuals = () => {
      const min = parseInt(elementos.precioMinInput.value);
      const max = parseInt(elementos.precioMaxInput.value);
      
      // Update price display
      if (document.getElementById('min-price')) {
        document.getElementById('min-price').textContent = `$U${min}`;
      }
      if (document.getElementById('max-price')) {
        document.getElementById('max-price').textContent = `$U${max}`;
      }
      
      // Update visual range
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
    
    // Prevent min from being higher than max
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
  if (elementos.menu) {
    elementos.menu.classList.toggle('activo');
  }
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
    // Create an array of promises for stock restoration
    const stockRestorePromises = carrito.map(async (item) => {
      const productRef = ref(db, `productos/${item.id}/stock`);
      return runTransaction(productRef, (currentStock) => {
        // Ensure currentStock is a valid number
        const validStock = (typeof currentStock === 'number' && !isNaN(currentStock)) ? currentStock : 0;
        return validStock + item.cantidad;
      });
    });

    // Wait for all stock restoration transactions to complete
    await Promise.all(stockRestorePromises);

    // Clear local cart and update UI
    carrito = [];
    guardarCarrito();
    renderizarCarrito();
    mostrarNotificacion('Carrito vaciado y stock restaurado correctamente', 'exito');
  } catch (error) {
    console.error("Error al vaciar el carrito y restaurar el stock:", error);
    mostrarNotificacion('Ocurrió un error al vaciar el carrito. Inténtalo de nuevo.', 'error');
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
  // Global flag to prevent multiple simultaneous operations
  if (isProcessingAdd) {
    console.log('⚠️ Ya hay una operación en progreso, ignorando...');
    return;
  }
  
  isProcessingAdd = true;
  console.log(`🔄 Iniciando agregar al carrito - ID: ${id}, Cantidad: ${cantidad}`);
  
  try {
    // Prevent adding items with invalid quantity
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

    console.log(`📦 Producto encontrado: ${producto.nombre}, Stock actual: ${producto.stock}`);

    // Check if product is out of stock
    if (producto.stock <= 0) {
      mostrarNotificacion('Producto agotado', 'error');
      return;
    }

    // Find existing item in cart BEFORE any Firebase operations
    const itemEnCarrito = carrito.find(item => item.id === parseInt(id));
    const cantidadEnCarrito = itemEnCarrito ? itemEnCarrito.cantidad : 0;
    const stockDisponible = producto.stock - cantidadEnCarrito;
    
    console.log(`🛒 Cantidad en carrito: ${cantidadEnCarrito}, Stock disponible: ${stockDisponible}`);
    
    if (cantidad > stockDisponible) {
      mostrarNotificacion(`Solo hay ${stockDisponible} unidades disponibles`, 'error');
      return;
    }

    // Update stock in Firebase using transaction
    const productRef = ref(db, `productos/${id}/stock`);
    console.log(`🔥 Iniciando transacción Firebase para producto ${id}`);
    
    const transactionResult = await runTransaction(productRef, (currentStock) => {
      console.log(`📊 Stock actual en Firebase: ${currentStock}`);
      // Ensure we have a valid number for stock
      const validStock = (typeof currentStock === 'number' && !isNaN(currentStock)) ? currentStock : 0;
      
      // Check if we still have enough stock
      if (validStock < cantidad) {
        console.log(`❌ No hay suficiente stock. Requerido: ${cantidad}, Disponible: ${validStock}`);
        return; // Abort transaction if not enough stock
      }
      
      const newStock = validStock - cantidad;
      console.log(`✅ Reduciendo stock de ${validStock} a ${newStock}`);
      return newStock;
    });

    if (!transactionResult.committed) {
      mostrarNotificacion('No hay suficiente stock disponible', 'error');
      return;
    }

    console.log(`✅ Transacción exitosa. Nuevo stock: ${transactionResult.snapshot.val()}`);

    // Update local cart ONLY after successful Firebase transaction
    if (itemEnCarrito) {
      console.log(`🔄 Actualizando cantidad existente de ${itemEnCarrito.cantidad} a ${itemEnCarrito.cantidad + cantidad}`);
      itemEnCarrito.cantidad += cantidad;
    } else {
      console.log(`➕ Agregando nuevo item al carrito`);
      carrito.push({
        id: parseInt(producto.id),
        nombre: producto.nombre,
        precio: producto.precio,
        imagen: producto.imagenes[0],
        cantidad: cantidad
      });
    }

    // Update local product stock to reflect Firebase change
    producto.stock = transactionResult.snapshot.val();

    guardarCarrito();
    renderizarCarrito();
    renderizarProductos(); // Re-render to show updated stock
    mostrarNotificacion(`${producto.nombre} agregado al carrito`, 'exito');
    
  } catch (error) {
    console.error('❌ Error al agregar producto al carrito:', error);
    mostrarNotificacion('Error al agregar el producto. Inténtalo de nuevo.', 'error');
  } finally {
    // Always clear the global flag after a delay to prevent rapid clicks
    setTimeout(() => {
      isProcessingAdd = false;
      console.log(`🏁 Finalizando proceso para producto ${id}`);
    }, 500);
  }
}

async function modificarCantidadCarrito(id, nuevaCantidad) {
  const item = carrito.find(item => item.id === id);
  if (!item) return;

  const producto = productos.find(p => p.id === id);
  if (!producto) return;

  const diferencia = nuevaCantidad - item.cantidad;
  
  if (diferencia === 0) return; // No change needed

  try {
    const productRef = ref(db, `productos/${id}/stock`);
    
    await runTransaction(productRef, (currentStock) => {
      const validStock = (typeof currentStock === 'number' && !isNaN(currentStock)) ? currentStock : 0;
      
      if (diferencia > 0) {
        // Adding more items - check if we have enough stock
        if (validStock < diferencia) {
          return; // Abort transaction
        }
        return validStock - diferencia;
      } else {
        // Removing items - add stock back
        return validStock + Math.abs(diferencia);
      }
    });

    // Update local cart
    item.cantidad = nuevaCantidad;
    
    if (item.cantidad <= 0) {
      const index = carrito.findIndex(c => c.id === id);
      if (index > -1) {
        carrito.splice(index, 1);
      }
    }

    guardarCarrito();
    renderizarCarrito();
    
  } catch (error) {
    console.error('Error al modificar cantidad en carrito:', error);
    mostrarNotificacion('Error al actualizar la cantidad', 'error');
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

  // Add event listeners for quantity controls
  elementos.listaCarrito.querySelectorAll('.disminuir-cantidad').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = parseInt(e.target.dataset.id);
      const item = carrito.find(item => item.id === id);
      if (item && item.cantidad > 1) {
        await modificarCantidadCarrito(id, item.cantidad - 1);
      }
    });
  });

  elementos.listaCarrito.querySelectorAll('.aumentar-cantidad').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = parseInt(e.target.dataset.id);
      const item = carrito.find(item => item.id === id);
      if (item) {
        await modificarCantidadCarrito(id, item.cantidad + 1);
      }
    });
  });
}

// ===============================
// CARRITO: UI FUNCTIONS
// ===============================
function abrirCarrito() {
  console.log('🛒 Intentando abrir carrito...');
  console.log('Panel:', elementos.carritoPanel);
  console.log('Overlay:', elementos.carritoOverlay);
  
  if (elementos.carritoPanel && elementos.carritoOverlay) {
    elementos.carritoPanel.classList.add('abierto');
    elementos.carritoOverlay.classList.add('activo');
    renderizarCarrito();
    console.log('✅ Carrito abierto correctamente');
  } else {
    console.error('❌ Elementos del carrito no encontrados');
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
    
    // Populate order summary
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

    // Use get() for initial load
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
      console.warn(`Producto ${key} tiene datos inválidos o faltantes`, p);
      return;
    }

    productos.push({
      id: p.id && !isNaN(p.id) ? parseInt(p.id) : parseInt(key),
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

  renderizarProductos();
  actualizarCategorias();
}

function filtrarProductos() {
  return productos.filter(producto => {
    // Price filter
    if (producto.precio < filtrosActuales.precioMin || producto.precio > filtrosActuales.precioMax) {
      return false;
    }
    
    // Category filter
    if (filtrosActuales.categoria !== 'todos' && producto.categoria !== filtrosActuales.categoria) {
      return false;
    }
    
    // Search filter
    if (filtrosActuales.busqueda) {
      const busqueda = filtrosActuales.busqueda;
      const nombre = producto.nombre.toLowerCase();
      const descripcion = producto.descripcion.toLowerCase();
      
      if (!nombre.includes(busqueda) && !descripcion.includes(busqueda)) {
        return false;
      }
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
    if (elementos.paginacion) {
      elementos.paginacion.innerHTML = '';
    }
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
      ? `<button class="boton-agregar" data-id="${producto.id}">
           <i class="fas fa-cart-plus"></i> Agregar
         </button>`
      : `<button class="boton-agregar agotado" disabled>
           Agotado
         </button>`;

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
    if (elementos.paginacion) {
      elementos.paginacion.innerHTML = '';
    }
    return;
  }

  let paginacionHTML = '';
  
  // Previous button
  paginacionHTML += `
    <button ${paginaActual <= 1 ? 'disabled' : ''} onclick="cambiarPagina(${paginaActual - 1})">
      ‹ Anterior
    </button>
  `;
  
  // Page numbers
  for (let i = 1; i <= totalPaginas; i++) {
    if (i === paginaActual || i === 1 || i === totalPaginas || Math.abs(i - paginaActual) <= 1) {
      paginacionHTML += `
        <button ${i === paginaActual ? 'class="activa"' : ''} onclick="cambiarPagina(${i})">
          ${i}
        </button>
      `;
    } else if (i === 2 && paginaActual > 4) {
      paginacionHTML += '<span>...</span>';
    } else if (i === totalPaginas - 1 && paginaActual < totalPaginas - 3) {
      paginacionHTML += '<span>...</span>';
    }
  }
  
  // Next button
  paginacionHTML += `
    <button ${paginaActual >= totalPaginas ? 'disabled' : ''} onclick="cambiarPagina(${paginaActual + 1})">
      Siguiente ›
    </button>
  `;
  
  elementos.paginacion.innerHTML = paginacionHTML;
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
  
  // Restore previous selection if it still exists
  if (categoriasUnicas.includes(currentValue) || currentValue === 'todos') {
    elementos.selectCategoria.value = currentValue;
  }
}

// ===============================
// MODAL FUNCTIONS
// ===============================
function abrirModal(producto) {
  console.log('🔍 Intentando abrir modal para producto:', producto);
  console.log('Modal element:', elementos.productoModal);
  
  if (!producto || !elementos.productoModal) {
    console.error('❌ Producto o modal no disponible');
    return;
  }

  productoModalActual = producto;
  imagenModalActual = 0;

  // Populate modal content
  if (elementos.modalNombre) {
    elementos.modalNombre.textContent = producto.nombre;
  }
  
  if (elementos.modalDescripcion) {
    elementos.modalDescripcion.textContent = producto.descripcion || 'Sin descripción disponible';
  }
  
  if (elementos.modalPrecio) {
    elementos.modalPrecio.textContent = `Precio: $U ${producto.precio.toLocaleString('es-UY')}`;
  }
  
  if (elementos.modalCantidad) {
    elementos.modalCantidad.max = producto.stock;
    elementos.modalCantidad.value = 1;
    elementos.modalCantidad.disabled = producto.stock <= 0;
  }
  
  if (elementos.modalAgregarCarrito) {
    elementos.modalAgregarCarrito.disabled = producto.stock <= 0;
    elementos.modalAgregarCarrito.textContent = producto.stock <= 0 ? 'Agotado' : 'Agregar al Carrito';
  }

  // Set up images
  actualizarImagenModal();
  crearThumbnails();

  // Show modal
  elementos.productoModal.classList.add('active');
  console.log('✅ Modal abierto correctamente');
}

function cerrarModal() {
  if (elementos.productoModal) {
    elementos.productoModal.classList.remove('active');
  }
  productoModalActual = null;
  imagenModalActual = 0;
}

function actualizarImagenModal() {
  if (!productoModalActual || !elementos.modalImagen) return;

  const imagenes = productoModalActual.imagenes;
  if (imagenes && imagenes.length > 0) {
    elementos.modalImagen.src = imagenes[imagenModalActual];
    elementos.modalImagen.alt = productoModalActual.nombre;
  }

  // Update navigation buttons
  if (elementos.modalPrev) {
    elementos.modalPrev.style.display = imagenes.length > 1 ? 'block' : 'none';
  }
  
  if (elementos.modalNext) {
    elementos.modalNext.style.display = imagenes.length > 1 ? 'block' : 'none';
  }

  // Update thumbnails
  actualizarThumbnailsActivos();
}

function cambiarImagenModal(direccion) {
  if (!productoModalActual) return;

  const imagenes = productoModalActual.imagenes;
  if (!imagenes || imagenes.length <= 1) return;

  imagenModalActual += direccion;
  
  if (imagenModalActual < 0) {
    imagenModalActual = imagenes.length - 1;
  } else if (imagenModalActual >= imagenes.length) {
    imagenModalActual = 0;
  }

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

  // Add click listeners to thumbnails
  elementos.modalThumbnails.querySelectorAll('.modal-thumbnail').forEach((thumb, index) => {
    thumb.addEventListener('click', () => {
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

// Global functions for pagination (called from inline onclick)
window.cambiarPagina = function(nuevaPagina) {
  paginaActual = nuevaPagina;
  renderizarProductos();
  
  // Scroll to products section
  const productosSection = document.getElementById('productos');
  if (productosSection) {
    productosSection.scrollIntoView({ behavior: 'smooth' });
  }
};

// Global function for closing modal (called from inline onclick)
window.cerrarModal = cerrarModal;

// Global function for applying range filter (called from inline onclick)
window.aplicarRango = aplicarRango;
