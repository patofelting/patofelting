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

// Firebase instances
let db, auth;

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
  const waitForFirebase = () => {
    return new Promise((resolve) => {
      if (window.firebaseDatabase && window.firebaseApp) {
        db = window.firebaseDatabase;
        auth = getAuth(window.firebaseApp);
        resolve();
      } else {
        setTimeout(() => waitForFirebase().then(resolve), 100);
      }
    });
  };

  try {
    await waitForFirebase();
    await signInAnonymously(auth);
    cargarProductosDesdeFirebase();
  } catch (error) {
    console.error('Error signing in to Firebase:', error);
    cargarProductosDesdeCSV();
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
  // Cart events
  if (elementos.carritoBtnMain) {
    elementos.carritoBtnMain.addEventListener('click', abrirCarrito);
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
      e.preventDefault();
      e.stopPropagation();
      
      const productCard = e.target.closest('.producto-card');
      if (!productCard) return;

      const productId = parseInt(productCard.dataset.id);
      const producto = productos.find(p => p.id === productId);
      if (!producto) return;

      // Handle "Agregar" button clicks ONLY
      if (e.target.classList.contains('boton-agregar')) {
        if (isProcessingAdd) return;
        
        const cantidadInput = productCard.querySelector('.cantidad-input');
        const cantidad = cantidadInput ? parseInt(cantidadInput.value) || 1 : 1;
        await agregarAlCarrito(productId, cantidad);
        
      } else if (e.target.classList.contains('boton-detalles')) {
        abrirModal(producto);
        
      } else if (!e.target.closest('.boton-agregar, .boton-detalles, .cantidad-input')) {
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
      
      if (document.getElementById('min-price')) {
        document.getElementById('min-price').textContent = `$U${min}`;
      }
      if (document.getElementById('max-price')) {
        document.getElementById('max-price').textContent = `$U${max}`;
      }
      
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
    const stockRestorePromises = carrito.map(async (item) => {
      const productRef = ref(db, `productos/${item.id}/stock`);
      return runTransaction(productRef, (currentStock) => {
        const validStock = (typeof currentStock === 'number' && !isNaN(currentStock)) ? currentStock : 0;
        return validStock + item.cantidad;
      });
    });

    await Promise.all(stockRestorePromises);
    
    carrito.forEach(item => {
      const producto = productos.find(p => p.id === item.id);
      if (producto) {
        producto.stock += item.cantidad;
      }
    });

    carrito = [];
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion('Carrito vaciado y stock restaurado', 'exito');
    
  } catch (error) {
    console.error('Error al vaciar carrito:', error);
    mostrarNotificacion('Error al vaciar el carrito', 'error');
  }
}

async function agregarAlCarrito(id, cantidad = 1) {
  if (isProcessingAdd) return;
  
  isProcessingAdd = true;
  
  try {
    if (cantidad <= 0) {
      mostrarNotificacion('La cantidad debe ser mayor a 0', 'error');
      return;
    }

    const producto = productos.find(p => p.id === parseInt(id));
    if (!producto) {
      mostrarNotificacion('Producto no encontrado', 'error');
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

    // Update stock in Firebase
    const productRef = ref(db, `productos/${id}/stock`);
    const transactionResult = await runTransaction(productRef, (currentStock) => {
      const validStock = (typeof currentStock === 'number' && !isNaN(currentStock)) ? currentStock : 0;
      
      if (validStock < cantidad) {
        return; // Abort transaction
      }
      
      return validStock - cantidad;
    });

    if (!transactionResult.committed) {
      mostrarNotificacion('No hay suficiente stock disponible', 'error');
      return;
    }

    // Update local cart
    if (itemEnCarrito) {
      itemEnCarrito.cantidad += cantidad;
    } else {
      carrito.push({
        id: parseInt(producto.id),
        nombre: producto.nombre,
        precio: producto.precio,
        imagen: producto.imagenes[0],
        cantidad: cantidad
      });
    }

    producto.stock = transactionResult.snapshot.val();

    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion(`${producto.nombre} agregado al carrito`, 'exito');
    
  } catch (error) {
    console.error('Error al agregar producto al carrito:', error);
    mostrarNotificacion('Error al agregar el producto. Inténtalo de nuevo.', 'error');
  } finally {
    setTimeout(() => {
      isProcessingAdd = false;
    }, 500);
  }
}

async function modificarCantidadCarrito(id, nuevaCantidad) {
  const item = carrito.find(item => item.id === id);
  const producto = productos.find(p => p.id === id);
  
  if (!item || !producto) return;
  
  const diferencia = nuevaCantidad - item.cantidad;
  
  if (diferencia === 0) return;
  
  try {
    if (diferencia > 0) {
      if (producto.stock < diferencia) {
        mostrarNotificacion(`Solo hay ${producto.stock} unidades disponibles`, 'error');
        return;
      }
      
      const productRef = ref(db, `productos/${id}/stock`);
      await runTransaction(productRef, (currentStock) => {
        const validStock = (typeof currentStock === 'number' && !isNaN(currentStock)) ? currentStock : 0;
        return validStock - diferencia;
      });
      
      producto.stock -= diferencia;
    } else {
      const productRef = ref(db, `productos/${id}/stock`);
      await runTransaction(productRef, (currentStock) => {
        const validStock = (typeof currentStock === 'number' && !isNaN(currentStock)) ? currentStock : 0;
        return validStock + Math.abs(diferencia);
      });
      
      producto.stock += Math.abs(diferencia);
    }
    
    item.cantidad = nuevaCantidad;
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    
  } catch (error) {
    console.error('Error al modificar cantidad:', error);
    mostrarNotificacion('Error al modificar la cantidad', 'error');
  }
}

function renderizarCarrito() {
  if (!elementos.listaCarrito || !elementos.totalCarrito) return;

  if (carrito.length === 0) {
    elementos.listaCarrito.innerHTML = '<li class="carrito-vacio">Tu carrito está vacío</li>';
    elementos.totalCarrito.textContent = '$U 0';
    return;
  }

  const carritoHTML = carrito.map(item => `
    <li class="item-carrito">
      <img src="${item.imagen}" alt="${item.nombre}" class="item-imagen">
      <div class="item-info">
        <h4>${item.nombre}</h4>
        <p class="item-precio">$U ${item.precio.toLocaleString('es-UY')}</p>
        <div class="cantidad-controles">
          <button class="disminuir-cantidad" data-id="${item.id}" ${item.cantidad <= 1 ? 'disabled' : ''}>-</button>
          <span class="cantidad">${item.cantidad}</span>
          <button class="aumentar-cantidad" data-id="${item.id}">+</button>
        </div>
      </div>
      <div class="item-total">$U ${(item.precio * item.cantidad).toLocaleString('es-UY')}</div>
    </li>
  `).join('');

  elementos.listaCarrito.innerHTML = carritoHTML;

  const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
  elementos.totalCarrito.textContent = `$U ${total.toLocaleString('es-UY')}`;

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
  if (elementos.carritoPanel && elementos.carritoOverlay) {
    elementos.carritoPanel.classList.add('abierto');
    elementos.carritoOverlay.classList.add('activo');
    renderizarCarrito();
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

function actualizarContadorCarrito() {
  if (elementos.contadorCarrito) {
    const total = carrito.reduce((sum, item) => sum + item.cantidad, 0);
    elementos.contadorCarrito.textContent = total;
    elementos.contadorCarrito.classList.toggle('visible', total > 0);
  }
}

// ===============================
// PRODUCTOS: CARGA DE DATOS
// ===============================
async function cargarProductosDesdeFirebase() {
  try {
    if (elementos.productLoader) {
      elementos.productLoader.style.display = 'block';
    }

    const productosRef = ref(db, 'productos');
    const snapshot = await get(productosRef);
    
    if (snapshot.exists()) {
      const data = snapshot.val();
      productos = Object.keys(data).map(key => ({
        id: parseInt(key),
        ...data[key],
        imagenes: data[key].imagenes || [PLACEHOLDER_IMAGE]
      }));
      
      renderizarProductos();
      actualizarCategorias();
    } else {
      await cargarProductosDesdeCSV();
    }
  } catch (error) {
    console.error('Error al cargar productos desde Firebase:', error);
    await cargarProductosDesdeCSV();
  } finally {
    if (elementos.productLoader) {
      elementos.productLoader.style.display = 'none';
    }
  }
}

async function cargarProductosDesdeCSV() {
  try {
    if (!CSV_URL) {
      throw new Error('URL del CSV no configurada');
    }

    const response = await fetch(CSV_URL);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const csvText = await response.text();
    const { data } = Papa.parse(csvText, { header: true, skipEmptyLines: true });

    productos = data.map((row, index) => ({
      id: parseInt(row.id) || (index + 1),
      nombre: row.nombre || 'Sin nombre',
      descripcion: row.descripcion || 'Sin descripción',
      precio: parseInt(row.precio) || 0,
      categoria: row.categoria || 'general',
      stock: parseInt(row.stock) || 0,
      imagenes: row.imagenes ? row.imagenes.split(',').map(img => img.trim()) : [PLACEHOLDER_IMAGE]
    }));

    renderizarProductos();
    actualizarCategorias();
  } catch (error) {
    console.error('Error al cargar productos desde CSV:', error);
    mostrarNotificacion('Error al cargar productos. Por favor, recarga la página.', 'error');
  }
}

// ===============================
// PRODUCTOS: FILTROS Y RENDERIZADO
// ===============================
function aplicarFiltros(productos) {
  return productos.filter(producto => {
    const cumplePrecio = producto.precio >= filtrosActuales.precioMin && 
                         producto.precio <= filtrosActuales.precioMax;
    const cumpleCategoria = filtrosActuales.categoria === 'todos' || 
                           producto.categoria === filtrosActuales.categoria;
    const cumpleBusqueda = !filtrosActuales.busqueda || 
                          producto.nombre.toLowerCase().includes(filtrosActuales.busqueda) ||
                          producto.descripcion.toLowerCase().includes(filtrosActuales.busqueda);
    
    return cumplePrecio && cumpleCategoria && cumpleBusqueda;
  });
}

function aplicarRango() {
  if (elementos.precioMinInput && elementos.precioMaxInput) {
    filtrosActuales.precioMin = parseInt(elementos.precioMinInput.value);
    filtrosActuales.precioMax = parseInt(elementos.precioMaxInput.value);
    paginaActual = 1;
    renderizarProductos();
  }
}

function renderizarProductos() {
  if (!elementos.galeriaProductos) return;

  const productosFiltrados = aplicarFiltros(productos);
  const totalPaginas = Math.ceil(productosFiltrados.length / PRODUCTOS_POR_PAGINA);
  const inicio = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
  const fin = inicio + PRODUCTOS_POR_PAGINA;
  const productosEnPagina = productosFiltrados.slice(inicio, fin);

  if (productosEnPagina.length === 0) {
    elementos.galeriaProductos.innerHTML = '<div class="sin-productos">No se encontraron productos</div>';
    renderizarPaginacion(0, 0);
    return;
  }

  const productosHTML = productosEnPagina.map(producto => `
    <div class="producto-card" data-id="${producto.id}">
      <div class="producto-imagen-container">
        <img 
          src="${producto.imagenes[0]}" 
          alt="${producto.nombre}" 
          class="producto-imagen"
          onerror="this.src='${PLACEHOLDER_IMAGE}'"
        >
        ${producto.stock <= 0 ? '<div class="agotado-badge">Agotado</div>' : ''}
      </div>
      <div class="producto-info">
        <h3 class="producto-nombre">${producto.nombre}</h3>
        <p class="producto-precio">$U ${producto.precio.toLocaleString('es-UY')}</p>
        <p class="producto-stock">Stock: ${producto.stock}</p>
        <div class="producto-acciones">
          <input type="number" class="cantidad-input" min="1" max="${producto.stock}" value="1" ${producto.stock <= 0 ? 'disabled' : ''}>
          <button class="boton-agregar" ${producto.stock <= 0 ? 'disabled' : ''}>
            ${producto.stock <= 0 ? 'Agotado' : 'Agregar'}
          </button>
          <button class="boton-detalles">Ver Detalles</button>
        </div>
      </div>
    </div>
  `).join('');

  elementos.galeriaProductos.innerHTML = productosHTML;
  renderizarPaginacion(productosFiltrados.length, totalPaginas);
}

function renderizarPaginacion(totalProductos, totalPaginas) {
  if (!elementos.paginacion || totalPaginas <= 1) {
    if (elementos.paginacion) {
      elementos.paginacion.innerHTML = '';
    }
    return;
  }

  let paginacionHTML = '<div class="paginacion-info">';
  paginacionHTML += `Mostrando ${((paginaActual - 1) * PRODUCTOS_POR_PAGINA) + 1}-${Math.min(paginaActual * PRODUCTOS_POR_PAGINA, totalProductos)} de ${totalProductos} productos`;
  paginacionHTML += '</div><div class="paginacion-controles">';

  if (paginaActual > 1) {
    paginacionHTML += `<button onclick="cambiarPagina(${paginaActual - 1})" class="btn-pagina">« Anterior</button>`;
  }

  const rango = 2;
  let inicio = Math.max(1, paginaActual - rango);
  let fin = Math.min(totalPaginas, paginaActual + rango);

  if (inicio > 1) {
    paginacionHTML += `<button onclick="cambiarPagina(1)" class="btn-pagina">1</button>`;
    if (inicio > 2) {
      paginacionHTML += '<span class="puntos">...</span>';
    }
  }

  for (let i = inicio; i <= fin; i++) {
    paginacionHTML += `<button onclick="cambiarPagina(${i})" class="btn-pagina ${i === paginaActual ? 'activa' : ''}">${i}</button>`;
  }

  if (fin < totalPaginas) {
    if (fin < totalPaginas - 1) {
      paginacionHTML += '<span class="puntos">...</span>';
    }
    paginacionHTML += `<button onclick="cambiarPagina(${totalPaginas})" class="btn-pagina">${totalPaginas}</button>`;
  }

  if (paginaActual < totalPaginas) {
    paginacionHTML += `<button onclick="cambiarPagina(${paginaActual + 1})" class="btn-pagina">Siguiente »</button>`;
  }

  paginacionHTML += '</div>';
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
  
  if (categoriasUnicas.includes(currentValue) || currentValue === 'todos') {
    elementos.selectCategoria.value = currentValue;
  }
}

// Global function for pagination
window.cambiarPagina = function(nuevaPagina) {
  paginaActual = nuevaPagina;
  renderizarProductos();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ===============================
// MODAL FUNCTIONS
// ===============================
function abrirModal(producto) {
  if (!producto || !elementos.productoModal) return;

  productoModalActual = producto;
  imagenModalActual = 0;

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

  actualizarImagenModal();
  crearThumbnails();

  elementos.productoModal.classList.add('active');
}

function cerrarModal() {
  if (elementos.productoModal) {
    elementos.productoModal.classList.remove('active');
  }
  productoModalActual = null;
  imagenModalActual = 0;
}

window.cerrarModal = cerrarModal;

function actualizarImagenModal() {
  if (!productoModalActual || !elementos.modalImagen) return;

  const imagenes = productoModalActual.imagenes;
  if (imagenes && imagenes.length > 0) {
    elementos.modalImagen.src = imagenes[imagenModalActual];
    elementos.modalImagen.alt = productoModalActual.nombre;
  }

  if (elementos.modalPrev) {
    elementos.modalPrev.style.display = imagenes.length > 1 ? 'block' : 'none';
  }
  if (elementos.modalNext) {
    elementos.modalNext.style.display = imagenes.length > 1 ? 'block' : 'none';
  }
}

function crearThumbnails() {
  if (!elementos.modalThumbnails || !productoModalActual) return;

  const imagenes = productoModalActual.imagenes;
  if (imagenes.length <= 1) {
    elementos.modalThumbnails.innerHTML = '';
    return;
  }

  elementos.modalThumbnails.innerHTML = imagenes.map((img, index) => `
    <img src="${img}" 
         alt="Thumbnail ${index + 1}" 
         class="thumbnail ${index === imagenModalActual ? 'active' : ''}"
         onclick="cambiarImagenModal(${index}, true)"
         onerror="this.src='${PLACEHOLDER_IMAGE}'">
  `).join('');
}

function cambiarImagenModal(direccionOIndice, esIndice = false) {
  if (!productoModalActual) return;

  const imagenes = productoModalActual.imagenes;
  if (!imagenes || imagenes.length <= 1) return;

  if (esIndice) {
    imagenModalActual = direccionOIndice;
  } else {
    imagenModalActual = (imagenModalActual + direccionOIndice + imagenes.length) % imagenes.length;
  }

  actualizarImagenModal();
  crearThumbnails();
}

// Global function for thumbnail navigation
window.cambiarImagenModal = cambiarImagenModal;
window.aplicarRango = aplicarRango;

async function agregarDesdeModal() {
  if (!productoModalActual) return;
  
  const cantidad = elementos.modalCantidad ? parseInt(elementos.modalCantidad.value) || 1 : 1;
  await agregarAlCarrito(productoModalActual.id, cantidad);
}
