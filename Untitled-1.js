/* ===============================
 * E-COMMERCE JS – Patofelting
 * Version: 2025 - Modernized & Optimized
 * Author: Patricia - Patofelting
 * =============================== */

// ---------------------------------
// GLOBAL CONFIGURATION
// ---------------------------------
const CONFIG = {
  PRODUCTOS_POR_PAGINA: 6,
  LS_CARRITO_KEY: 'patofelting_carrito',
  PLACEHOLDER_IMAGE: window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen',
  DEBOUNCE_DELAY: 300,
  MAX_RETRY_ATTEMPTS: 3,
  NOTIFICATION_DURATION: 3000,
  EMAIL: {
    PUBLIC_KEY: 'o4IxJz0Zz-LQ8jYKG',
    SERVICE_ID: 'service_89by24g',
    TEMPLATE_ID: 'template_8mn7hdp'
  }
};

// Firebase imports and initialization
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ref, runTransaction, onValue, get, off } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

/**
 * Firebase Database and Auth instances
 */
const db = window.firebaseDatabase;
const auth = getAuth();

// ---------------------------------
// APPLICATION STATE
// ---------------------------------
const state = {
  productos: [],
  carrito: [],
  paginaActual: 1,
  isLoading: false,
  isOnline: navigator.onLine,
  filtrosActuales: {
    precioMin: 0,
    precioMax: 3000,
    categoria: 'todos',
    busqueda: ''
  },
  activeListeners: new Set(),
  retryCount: 0
};

// ---------------------------------
// DOM ELEMENT CACHE & UTILITIES
// ---------------------------------
/**
 * Cached DOM element selectors for better performance
 */
const elementos = (() => {
  const cache = new Map();
  
  const $id = (id) => {
    if (!cache.has(id)) {
      cache.set(id, document.getElementById(id));
    }
    return cache.get(id);
  };
  
  const $qs = (selector) => {
    if (!cache.has(selector)) {
      cache.set(selector, document.querySelector(selector));
    }
    return cache.get(selector);
  };

  return {
    // Catalog elements
    galeriaProductos: $id('galeria-productos'),
    paginacion: $id('paginacion'),
    
    // Product modal elements  
    productoModal: $id('producto-modal'),
    modalContenido: $id('modal-contenido'),
    
    // Cart elements
    carritoBtnMain: $id('carrito-btn-main'),
    carritoPanel: $id('carrito-panel'),
    carritoOverlay: $qs('.carrito-overlay'),
    btnCerrarCarrito: $qs('.cerrar-carrito'),
    listaCarrito: $id('lista-carrito'),
    totalCarrito: $id('total'),
    contadorCarrito: $id('contador-carrito'),
    btnVaciarCarrito: $qs('.boton-vaciar-carrito'),
    btnFinalizarCompra: $qs('.boton-finalizar-compra'),
    
    // Pre-purchase and shipping modals
    avisoPreCompraModal: $id('aviso-pre-compra-modal'),
    btnEntendidoAviso: $id('btn-entendido-aviso'),
    btnCancelarAviso: $id('btn-cancelar-aviso'),
    modalDatosEnvio: $id('modal-datos-envio'),
    selectEnvio: $id('select-envio'),
    resumenPedido: $id('resumen-pedido'),
    resumenProductos: $id('resumen-productos'),
    resumenTotal: $id('resumen-total'),
    
    // Filter elements
    inputBusqueda: $qs('.input-busqueda'),
    selectCategoria: $id('filtro-categoria'),
    precioMinInput: $id('min-slider'),
    precioMaxInput: $id('max-slider'),
    minPriceText: $id('min-price'),
    maxPriceText: $id('max-price'),
    thumbMin: $id('thumb-label-min'),
    thumbMax: $id('thumb-label-max'),
    rangeTrack: $qs('.range-slider .range'),
    aplicarRangoBtn: $qs('.aplicar-rango-btn'),
    
    // Other elements
    productLoader: $id('product-loader'),
    hamburguesa: $qs('.hamburguesa'),
    menu: $id('menu'),
    
    // Contact form elements
    formContacto: $id('formulario-contacto'),
    successMessage: $id('successMessage'),
    errorMessage: $id('errorMessage'),
    
    // Stock modal elements
    stockModal: $id('stock-modal'),
    stockForm: $id('stock-form'),
    stockEmail: $id('stock-email'),
    stockFeedback: $id('stock-modal-feedback'),
    
    // Clear cache method
    clearCache: () => cache.clear()
  };
})();

// ---------------------------------
// UTILITY FUNCTIONS & SECURITY
// ---------------------------------

/**
 * Sanitizes HTML content to prevent XSS attacks
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
function sanitizeHTML(str) {
  if (!str || typeof str !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Validates email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email
 */
function isValidEmail(email) {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email);
}

/**
 * Debounces a function call
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
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

/**
 * Shows notification with better UX and accessibility
 * @param {string} mensaje - Message to show
 * @param {string} tipo - Type of notification ('exito', 'error', 'info', 'warning')
 * @param {number} duracion - Duration in milliseconds
 */
function mostrarNotificacion(mensaje, tipo = 'exito', duracion = CONFIG.NOTIFICATION_DURATION) {
  // Remove any existing notifications
  document.querySelectorAll('.notificacion').forEach(n => n.remove());
  
  const notification = document.createElement('div');
  notification.className = `notificacion ${tipo}`;
  notification.setAttribute('role', 'alert');
  notification.setAttribute('aria-live', 'polite');
  
  // Sanitize message content
  notification.textContent = sanitizeHTML(mensaje);
  
  // Add close button for accessibility
  const closeButton = document.createElement('button');
  closeButton.innerHTML = '×';
  closeButton.className = 'notificacion-close';
  closeButton.setAttribute('aria-label', 'Cerrar notificación');
  closeButton.addEventListener('click', () => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 220);
  });
  
  notification.appendChild(closeButton);
  document.body.appendChild(notification);
  
  // Trigger animation
  requestAnimationFrame(() => notification.classList.add('show'));
  
  // Auto-remove notification
  setTimeout(() => {
    if (notification.parentNode) {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 220);
    }
  }, duracion);
}

/**
 * Formats numbers for Uruguay locale
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
function formatearUY(num) {
  const number = Number(num) || 0;
  return number.toLocaleString('es-UY', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

/**
 * Handles connection state changes
 */
function handleConnectionChange() {
  state.isOnline = navigator.onLine;
  const statusMessage = state.isOnline ? 
    'Conexión restaurada' : 
    'Sin conexión a internet. Algunas funciones pueden no estar disponibles.';
  
  mostrarNotificacion(statusMessage, state.isOnline ? 'exito' : 'warning');
}

/**
 * Retry function for failed operations
 * @param {Function} operation - Function to retry
 * @param {number} maxAttempts - Maximum retry attempts
 * @returns {Promise} Promise that resolves when operation succeeds or max attempts reached
 */
async function retryOperation(operation, maxAttempts = CONFIG.MAX_RETRY_ATTEMPTS) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.warn(`Attempt ${attempt}/${maxAttempts} failed:`, error.message);
      
      if (attempt < maxAttempts) {
        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

// ---------------------------------
// PRODUCT FILTERING & SEARCH
// ---------------------------------

/**
 * Filters products based on current filter state
 * @returns {Array} Filtered products array
 */
function filtrarProductos() {
  const { precioMin, precioMax, categoria, busqueda } = state.filtrosActuales;
  const searchLower = (busqueda || '').toLowerCase().trim();
  
  return state.productos.filter(producto => {
    // Price filter
    if (producto.precio < precioMin || producto.precio > precioMax) {
      return false;
    }
    
    // Category filter
    if (categoria !== 'todos' && producto.categoria !== categoria) {
      return false;
    }
    
    // Search filter - check name and description
    if (searchLower) {
      const nombreLower = (producto.nombre || '').toLowerCase();
      const descripcionLower = (producto.descripcion || '').toLowerCase();
      
      if (!nombreLower.includes(searchLower) && !descripcionLower.includes(searchLower)) {
        return false;
      }
    }
    
    return true;
  });
}

/**
 * Applies current filters and renders products
 * Debounced for better performance
 */
const aplicarFiltros = debounce(() => {
  state.paginaActual = 1;
  renderizarProductos();
}, CONFIG.DEBOUNCE_DELAY);

/**
 * Updates category dropdown with available categories
 */
function actualizarCategorias() {
  const selectCategoria = elementos.selectCategoria;
  if (!selectCategoria) return;
  
  try {
    const categorias = ['todos'];
    const categoriasUnicas = new Set(
      state.productos
        .map(p => p.categoria)
        .filter(Boolean)
    );
    
    categorias.push(...Array.from(categoriasUnicas).sort());
    
    selectCategoria.innerHTML = categorias
      .map(categoria => {
        const displayName = categoria === 'todos' ? 'Todos' : 
          categoria.charAt(0).toUpperCase() + categoria.slice(1);
        return `<option value="${categoria}">${sanitizeHTML(displayName)}</option>`;
      })
      .join('');
      
    selectCategoria.value = state.filtrosActuales.categoria;
  } catch (error) {
    console.error('Error updating categories:', error);
  }
}

/**
 * Updates price range slider with visual feedback
 */
function updateRange() {
  const { precioMinInput, precioMaxInput } = elementos;
  if (!precioMinInput || !precioMaxInput) return;
  
  try {
    let min = parseInt(precioMinInput.value) || 0;
    let max = parseInt(precioMaxInput.value) || 0;
    
    // Ensure min is not greater than max
    if (min > max) {
      [min, max] = [max, min];
      precioMinInput.value = min;
      precioMaxInput.value = max;
    }
    
    state.filtrosActuales.precioMin = min;
    state.filtrosActuales.precioMax = max;
    
    // Update visual elements
    updatePriceLabels(min, max);
    updateRangeTrack(min, max);
    
  } catch (error) {
    console.error('Error updating range:', error);
  }
}

/**
 * Updates price labels with formatted values
 * @param {number} min - Minimum price
 * @param {number} max - Maximum price
 */
function updatePriceLabels(min, max) {
  const { minPriceText, maxPriceText, thumbMin, thumbMax } = elementos;
  
  const formattedMin = `$U ${formatearUY(min)}`;
  const formattedMax = `$U ${formatearUY(max)}`;
  
  if (minPriceText) minPriceText.textContent = formattedMin;
  if (maxPriceText) maxPriceText.textContent = formattedMax;
  if (thumbMin) thumbMin.textContent = formattedMin;
  if (thumbMax) thumbMax.textContent = formattedMax;
}

/**
 * Updates the visual range track
 * @param {number} min - Minimum price
 * @param {number} max - Maximum price
 */
function updateRangeTrack(min, max) {
  const { precioMinInput, precioMaxInput, rangeTrack, thumbMin, thumbMax } = elementos;
  
  if (!precioMinInput || !precioMaxInput || !rangeTrack) return;
  
  const rangeMin = parseInt(precioMinInput.min) || 0;
  const rangeMax = parseInt(precioMaxInput.max) || 3000;
  
  const pctMin = ((min - rangeMin) / (rangeMax - rangeMin)) * 100;
  const pctMax = ((max - rangeMin) / (rangeMax - rangeMin)) * 100;
  
  rangeTrack.style.left = `${pctMin}%`;
  rangeTrack.style.right = `${100 - pctMax}%`;
  
  if (thumbMin) thumbMin.style.left = `${pctMin}%`;
  if (thumbMax) thumbMax.style.left = `${pctMax}%`;
}

// ---------------------------------
// PRODUCT CATALOG RENDERING
// ---------------------------------

/**
 * Creates HTML for a product card with better security and accessibility
 * @param {Object} producto - Product object
 * @returns {string} HTML string for product card
 */
function crearCardProducto(producto) {
  if (!producto || !producto.id) return '';
  
  const enCarrito = state.carrito.find(item => item.id === producto.id);
  const cantidadEnCarrito = enCarrito?.cantidad || 0;
  const disponibles = Math.max(0, producto.stock - cantidadEnCarrito);
  const agotado = disponibles <= 0;
  
  const imagen = (producto.imagenes && producto.imagenes[0]) || CONFIG.PLACEHOLDER_IMAGE;
  const nombre = sanitizeHTML(producto.nombre || 'Sin nombre');
  const precio = formatearUY(producto.precio || 0);
  
  const stockInfo = agotado ? 
    `<span class="stock-info agotado" aria-label="Producto agotado">Sin stock</span>` :
    `<span class="stock-info disponible" aria-label="${disponibles} unidades disponibles">${disponibles} disponibles</span>`;
  
  return `
    <article class="producto-card ${agotado ? 'agotado' : ''}" 
             data-id="${producto.id}" 
             role="article"
             aria-labelledby="producto-${producto.id}-nombre">
      <div class="producto-imagen-container">
        <img src="${imagen}" 
             alt="${nombre}" 
             class="producto-img" 
             loading="lazy"
             decoding="async"
             onerror="this.src='${CONFIG.PLACEHOLDER_IMAGE}'">
        ${stockInfo}
      </div>
      
      <div class="producto-info">
        <h3 id="producto-${producto.id}-nombre" class="producto-nombre">${nombre}</h3>
        <p class="producto-precio" aria-label="Precio: ${precio} pesos uruguayos">$U ${precio}</p>
        
        <div class="producto-acciones">
          <button class="boton-agregar ${agotado ? 'agotado' : ''}" 
                  ${agotado ? 'disabled' : ''} 
                  data-id="${producto.id}"
                  aria-label="${agotado ? 'Producto agotado' : `Agregar ${nombre} al carrito`}">
            ${agotado ? 'Agotado' : 'Agregar al carrito'}
          </button>
          
          ${agotado ? `
            <button class="boton-aviso-stock" 
                    data-nombre="${sanitizeHTML(producto.nombre)}" 
                    aria-label="Recibir aviso cuando ${nombre} esté disponible">
              📧 Avisar cuando esté disponible
            </button>
          ` : ''}
        </div>
        
        <button class="boton-detalles" 
                data-id="${producto.id}" 
                aria-label="Ver detalles de ${nombre}">
          🔍 Ver detalles
        </button>
      </div>
    </article>
  `;
}

/**
 * Renders the product catalog with improved performance and accessibility
 */
function renderizarProductos() {
  const galeriaProductos = elementos.galeriaProductos;
  if (!galeriaProductos) return;
  
  try {
    const productosFiltrados = filtrarProductos();
    const inicio = (state.paginaActual - 1) * CONFIG.PRODUCTOS_POR_PAGINA;
    const productosEnPagina = productosFiltrados.slice(inicio, inicio + CONFIG.PRODUCTOS_POR_PAGINA);
    
    if (productosEnPagina.length === 0) {
      galeriaProductos.innerHTML = `
        <div class="sin-productos" role="status" aria-live="polite">
          <p>No se encontraron productos que coincidan con los filtros seleccionados.</p>
          <button onclick="resetearFiltros()" class="boton-resetear-filtros">
            Resetear filtros
          </button>
        </div>
      `;
    } else {
      galeriaProductos.innerHTML = productosEnPagina
        .map(crearCardProducto)
        .join('');
    }
    
    renderizarPaginacion(productosFiltrados.length);
    
    // Update results counter for accessibility
    actualizarContadorResultados(productosFiltrados.length);
    
  } catch (error) {
    console.error('Error rendering products:', error);
    galeriaProductos.innerHTML = `
      <div class="error-productos" role="alert">
        <p>Error al cargar los productos. Por favor, intenta recargar la página.</p>
        <button onclick="location.reload()" class="boton-recargar">
          Recargar página
        </button>
      </div>
    `;
  }
}

/**
 * Updates results counter for screen readers
 * @param {number} totalResultados - Total number of filtered results
 */
function actualizarContadorResultados(totalResultados) {
  let contador = document.getElementById('contador-resultados');
  
  if (!contador) {
    contador = document.createElement('div');
    contador.id = 'contador-resultados';
    contador.className = 'sr-only';
    contador.setAttribute('aria-live', 'polite');
    elementos.galeriaProductos?.before(contador);
  }
  
  contador.textContent = `${totalResultados} productos encontrados`;
}

/**
 * Renders pagination with better accessibility
 * @param {number} totalProductos - Total number of products
 */
function renderizarPaginacion(totalProductos) {
  const paginacion = elementos.paginacion;
  if (!paginacion) return;
  
  const totalPaginas = Math.ceil(totalProductos / CONFIG.PRODUCTOS_POR_PAGINA);
  
  if (totalPaginas <= 1) {
    paginacion.innerHTML = '';
    return;
  }
  
  let paginacionHTML = '<ul class="paginacion-lista" role="list">';
  
  // Previous button
  if (state.paginaActual > 1) {
    paginacionHTML += `
      <li role="listitem">
        <button class="paginacion-btn" 
                data-pagina="${state.paginaActual - 1}"
                aria-label="Ir a página anterior">
          ← Anterior
        </button>
      </li>
    `;
  }
  
  // Page numbers
  const inicio = Math.max(1, state.paginaActual - 2);
  const fin = Math.min(totalPaginas, state.paginaActual + 2);
  
  for (let i = inicio; i <= fin; i++) {
    const esActual = i === state.paginaActual;
    paginacionHTML += `
      <li role="listitem">
        <button class="paginacion-btn ${esActual ? 'activo' : ''}" 
                data-pagina="${i}"
                ${esActual ? 'aria-current="page"' : ''}
                aria-label="Ir a página ${i}">
          ${i}
        </button>
      </li>
    `;
  }
  
  // Next button
  if (state.paginaActual < totalPaginas) {
    paginacionHTML += `
      <li role="listitem">
        <button class="paginacion-btn" 
                data-pagina="${state.paginaActual + 1}"
                aria-label="Ir a página siguiente">
          Siguiente →
        </button>
      </li>
    `;
  }
  
  paginacionHTML += '</ul>';
  paginacion.innerHTML = paginacionHTML;
  
  // Add event listeners
  paginacion.querySelectorAll('.paginacion-btn').forEach(boton => {
    boton.addEventListener('click', (e) => {
      const nuevaPagina = parseInt(e.target.dataset.pagina);
      if (nuevaPagina && nuevaPagina !== state.paginaActual) {
        state.paginaActual = nuevaPagina;
        renderizarProductos();
        
        // Scroll to top of products section
        elementos.galeriaProductos?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }
    });
  });
}

/**
 * Resets all filters to default values
 */
function resetearFiltros() {
  state.filtrosActuales = {
    precioMin: 0,
    precioMax: 3000,
    categoria: 'todos',
    busqueda: ''
  };
  
  // Update UI elements
  if (elementos.inputBusqueda) elementos.inputBusqueda.value = '';
  if (elementos.selectCategoria) elementos.selectCategoria.value = 'todos';
  if (elementos.precioMinInput) elementos.precioMinInput.value = '0';
  if (elementos.precioMaxInput) elementos.precioMaxInput.value = '3000';
  
  updateRange();
  aplicarFiltros();
  
  mostrarNotificacion('Filtros restablecidos', 'info');
}

// Expose resetearFiltros globally for HTML onclick
window.resetearFiltros = resetearFiltros;

// ---------------------------------
// SHOPPING CART MANAGEMENT
// ---------------------------------

/**
 * Saves cart to localStorage with error handling
 */
function guardarCarrito() {
  try {
    localStorage.setItem(CONFIG.LS_CARRITO_KEY, JSON.stringify(state.carrito));
    actualizarContadorCarrito();
    
    // Update order summary if modal is open
    if (elementos.modalDatosEnvio?.classList.contains('visible')) {
      renderResumenDeCompra();
    }
    
  } catch (error) {
    console.error('Error saving cart:', error);
    mostrarNotificacion('Error al guardar el carrito. Verifique el almacenamiento del navegador.', 'error');
  }
}

/**
 * Loads cart from localStorage with error handling
 */
function cargarCarrito() {
  try {
    const carritoGuardado = localStorage.getItem(CONFIG.LS_CARRITO_KEY);
    state.carrito = carritoGuardado ? JSON.parse(carritoGuardado) : [];
    
    // Validate cart items
    state.carrito = state.carrito.filter(item => 
      item.id && item.nombre && typeof item.precio === 'number' && item.cantidad > 0
    );
    
    actualizarContadorCarrito();
    
  } catch (error) {
    console.error('Error loading cart:', error);
    state.carrito = [];
    mostrarNotificacion('Error al cargar el carrito guardado', 'warning');
  }
}

/**
 * Updates cart counter with improved UX
 */
function actualizarContadorCarrito() {
  const total = state.carrito.reduce((sum, item) => sum + item.cantidad, 0);
  const contador = elementos.contadorCarrito;
  
  if (contador) {
    contador.textContent = total;
    contador.classList.toggle('visible', total > 0);
    contador.setAttribute('aria-label', `${total} productos en el carrito`);
  }
  
  // Update cart button accessibility
  const carritoBtn = elementos.carritoBtnMain;
  if (carritoBtn) {
    carritoBtn.setAttribute('aria-label', 
      total > 0 ? `Abrir carrito con ${total} productos` : 'Abrir carrito vacío'
    );
  }
}

/**
 * Empties cart with Firebase stock restoration
 */
async function vaciarCarrito() {
  if (state.carrito.length === 0) {
    mostrarNotificacion('El carrito ya está vacío', 'info');
    return;
  }
  
  if (!confirm('¿Está seguro de que desea vaciar el carrito? Se restaurará el stock de todos los productos.')) {
    return;
  }
  
  try {
    state.isLoading = true;
    mostrarNotificacion('Vaciando carrito...', 'info');
    
    // Restore stock for all cart items
    await Promise.all(state.carrito.map(async (item) => {
      const stockRef = ref(db, `productos/${item.id}/stock`);
      
      return await retryOperation(async () => {
        return await runTransaction(stockRef, (currentStock) => {
          const stock = (typeof currentStock === 'number' && !isNaN(currentStock)) ? currentStock : 0;
          return Math.max(0, stock + item.cantidad);
        });
      });
    }));
    
    // Clear cart
    state.carrito = [];
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    
    mostrarNotificacion('✅ Carrito vaciado y stock restaurado', 'exito');
    
  } catch (error) {
    console.error('Error emptying cart:', error);
    mostrarNotificacion('Error al vaciar el carrito. Algunos cambios pueden no haberse guardado.', 'error');
  } finally {
    state.isLoading = false;
  }
}

let cartEventListenersAdded = false; // Prevent duplicate listeners

/**
 * Renders shopping cart with improved UX and accessibility
 */
function renderizarCarrito() {
  const listaCarrito = elementos.listaCarrito;
  const totalCarrito = elementos.totalCarrito;
  
  if (!listaCarrito || !totalCarrito) return;
  
  try {
    if (state.carrito.length === 0) {
      listaCarrito.innerHTML = `
        <li class="carrito-vacio" role="status">
          <p>Tu carrito está vacío</p>
          <p class="carrito-vacio-sugerencia">¡Explora nuestros productos únicos!</p>
        </li>
      `;
      totalCarrito.textContent = 'Total: $U 0';
    } else {
      listaCarrito.innerHTML = state.carrito.map(item => {
        const producto = state.productos.find(p => p.id === item.id);
        const stockReal = producto ? producto.stock : 0;
        const disponibles = Math.max(0, stockReal - item.cantidad);
        
        return `
          <li class="carrito-item" data-id="${item.id}" role="listitem">
            <div class="carrito-item-imagen">
              <img src="${item.imagen}" 
                   class="carrito-item-img" 
                   alt="${sanitizeHTML(item.nombre)}"
                   loading="lazy">
            </div>
            
            <div class="carrito-item-info">
              <h4 class="carrito-item-nombre">${sanitizeHTML(item.nombre)}</h4>
              <p class="carrito-item-precio">$U ${formatearUY(item.precio)} c/u</p>
              
              <div class="carrito-item-controls" role="group" aria-label="Controles de cantidad">
                <button class="disminuir-cantidad" 
                        data-id="${item.id}" 
                        ${item.cantidad <= 1 ? 'disabled' : ''} 
                        aria-label="Disminuir cantidad de ${sanitizeHTML(item.nombre)}">
                  −
                </button>
                
                <span class="carrito-item-cantidad" 
                      aria-label="${item.cantidad} unidades">
                  ${item.cantidad}
                </span>
                
                <button class="aumentar-cantidad" 
                        data-id="${item.id}" 
                        ${disponibles <= 0 ? 'disabled' : ''} 
                        aria-label="Aumentar cantidad de ${sanitizeHTML(item.nombre)}">
                  +
                </button>
              </div>
              
              <p class="carrito-item-subtotal">
                Subtotal: $U ${formatearUY(item.precio * item.cantidad)}
              </p>
              
              <button class="carrito-item-eliminar" 
                      data-id="${item.id}"
                      aria-label="Eliminar ${sanitizeHTML(item.nombre)} del carrito">
                🗑️ Eliminar
              </button>
            </div>
          </li>
        `;
      }).join('');
      
      const total = state.carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
      totalCarrito.textContent = `Total: $U ${formatearUY(total)}`;
    }
    
    // Add event listeners only once
    if (!cartEventListenersAdded && listaCarrito) {
      addCartEventListeners();
      cartEventListenersAdded = true;
    }
    
  } catch (error) {
    console.error('Error rendering cart:', error);
    listaCarrito.innerHTML = `
      <li class="error-carrito" role="alert">
        <p>Error al mostrar el carrito</p>
      </li>
    `;
  }
}

/**
 * Adds event listeners for cart interactions
 */
function addCartEventListeners() {
  const listaCarrito = elementos.listaCarrito;
  if (!listaCarrito) return;
  
  listaCarrito.addEventListener('click', async (e) => {
    const boton = e.target;
    const itemId = parseInt(boton.dataset.id);
    
    if (!itemId) return;
    
    try {
      if (boton.classList.contains('disminuir-cantidad')) {
        await cambiarCantidadCarrito(itemId, -1);
      } else if (boton.classList.contains('aumentar-cantidad')) {
        await cambiarCantidadCarrito(itemId, 1);
      } else if (boton.classList.contains('carrito-item-eliminar')) {
        await eliminarDelCarrito(itemId);
      }
    } catch (error) {
      console.error('Cart operation failed:', error);
      mostrarNotificacion('Error al actualizar el carrito', 'error');
    }
  });
}

/**
 * Changes item quantity in cart
 * @param {number} itemId - Product ID
 * @param {number} cambio - Change amount (+1 or -1)
 */
async function cambiarCantidadCarrito(itemId, cambio) {
  const item = state.carrito.find(i => i.id === itemId);
  if (!item) return;
  
  const nuevaCantidad = item.cantidad + cambio;
  
  if (nuevaCantidad <= 0) {
    await eliminarDelCarrito(itemId);
    return;
  }
  
  if (cambio > 0) {
    // Adding item - check if stock is available
    await agregarAlCarrito(itemId, 1);
  } else {
    // Removing item - restore stock
    const stockRef = ref(db, `productos/${itemId}/stock`);
    
    await runTransaction(stockRef, (currentStock) => {
      const stock = (typeof currentStock === 'number' && !isNaN(currentStock)) ? currentStock : 0;
      return stock + 1;
    });
    
    item.cantidad = nuevaCantidad;
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    
    mostrarNotificacion('Cantidad actualizada', 'exito');
  }
}

/**
 * Removes item completely from cart
 * @param {number} itemId - Product ID to remove
 */
async function eliminarDelCarrito(itemId) {
  const item = state.carrito.find(i => i.id === itemId);
  if (!item) return;
  
  if (!confirm(`¿Eliminar ${item.nombre} del carrito?`)) {
    return;
  }
  
  try {
    // Restore stock
    const stockRef = ref(db, `productos/${itemId}/stock`);
    
    await runTransaction(stockRef, (currentStock) => {
      const stock = (typeof currentStock === 'number' && !isNaN(currentStock)) ? currentStock : 0;
      return stock + item.cantidad;
    });
    
    // Remove from cart
    state.carrito = state.carrito.filter(i => i.id !== itemId);
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    
    mostrarNotificacion(`${item.nombre} eliminado del carrito`, 'exito');
    
  } catch (error) {
    console.error('Error removing item from cart:', error);
    mostrarNotificacion('Error al eliminar el producto', 'error');
  }
}

/**
 * Toggles cart panel visibility with improved accessibility
 * @param {boolean} forceState - Force open/close state
 */
function toggleCarrito(forceState) {
  const carritoPanel = elementos.carritoPanel;
  const carritoOverlay = elementos.carritoOverlay;
  
  if (!carritoPanel || !carritoOverlay) return;
  
  const isOpen = typeof forceState === 'boolean' ? 
    forceState : 
    !carritoPanel.classList.contains('active');
  
  carritoPanel.classList.toggle('active', isOpen);
  carritoOverlay.classList.toggle('active', isOpen);
  document.body.classList.toggle('no-scroll', isOpen);
  
  // Update accessibility attributes
  carritoPanel.setAttribute('aria-hidden', !isOpen);
  elementos.carritoBtnMain?.setAttribute('aria-expanded', isOpen);
  
  if (isOpen) {
    renderizarCarrito();
    // Focus on first interactive element
    const firstButton = carritoPanel.querySelector('button');
    if (firstButton) {
      setTimeout(() => firstButton.focus(), 100);
    }
  }
}

// ---------------------------------
// FIREBASE OPERATIONS & PRODUCT MANAGEMENT
// ---------------------------------

/**
 * Loads products from Firebase with improved error handling and retry logic
 */
async function cargarProductosDesdeFirebase() {
  if (!db) {
    console.error('Firebase database not initialized');
    mostrarNotificacion('Error de conexión a la base de datos', 'error');
    return;
  }
  
  const productosRef = ref(db, 'productos');
  const productLoader = elementos.productLoader;
  
  try {
    state.isLoading = true;
    if (productLoader) {
      productLoader.hidden = false;
      productLoader.setAttribute('aria-busy', 'true');
    }
    
    // First load - get current data
    await retryOperation(async () => {
      const snapshot = await get(productosRef);
      if (snapshot.exists()) {
        procesarDatosProductos(snapshot.val());
      } else {
        console.warn('No products found in database');
        state.productos = [];
        renderizarProductos();
        actualizarCategorias();
      }
    });
    
    // Set up real-time listener
    setupRealtimeListener(productosRef);
    
  } catch (error) {
    console.error('Error loading products from Firebase:', error);
    handleFirebaseError(error);
  } finally {
    state.isLoading = false;
    if (productLoader) {
      productLoader.hidden = true;
      productLoader.setAttribute('aria-busy', 'false');
    }
  }
}

/**
 * Sets up real-time listener for product changes
 * @param {DatabaseReference} productosRef - Firebase reference
 */
function setupRealtimeListener(productosRef) {
  // Remove existing listener if any
  if (state.activeListeners.has('productos')) {
    off(productosRef);
    state.activeListeners.delete('productos');
  }
  
  // Add new listener
  const unsubscribe = onValue(productosRef, (snapshot) => {
    try {
      if (!snapshot.exists()) {
        console.log('Products collection is empty');
        state.productos = [];
        renderizarProductos();
        actualizarCategorias();
        actualizarUI();
        return;
      }
      
      procesarDatosProductos(snapshot.val());
      
    } catch (error) {
      console.error('Error in real-time listener:', error);
      mostrarNotificacion('Error al actualizar datos en tiempo real', 'warning');
    }
  }, (error) => {
    console.error('Firebase listener error:', error);
    handleFirebaseError(error);
  });
  
  state.activeListeners.add('productos');
}

/**
 * Processes and validates product data from Firebase
 * @param {Object} data - Raw product data from Firebase
 */
function procesarDatosProductos(data) {
  if (!data || typeof data !== 'object') {
    console.warn('Invalid product data received');
    return;
  }
  
  try {
    const productosNuevos = [];
    
    Object.entries(data).forEach(([key, producto]) => {
      if (!producto || typeof producto !== 'object') {
        console.warn(`Invalid product data for key ${key}:`, producto);
        return;
      }
      
      // Validate and sanitize product data
      const productoValidado = validarProducto(producto, key);
      if (productoValidado) {
        productosNuevos.push(productoValidado);
      }
    });
    
    // Update state
    state.productos = productosNuevos.sort((a, b) => a.nombre.localeCompare(b.nombre));
    
    // Update UI
    renderizarProductos();
    actualizarCategorias();
    actualizarUI();
    
    console.log(`✅ Loaded ${state.productos.length} products successfully`);
    
  } catch (error) {
    console.error('Error processing product data:', error);
    mostrarNotificacion('Error al procesar los datos de productos', 'error');
  }
}

/**
 * Validates and sanitizes a single product
 * @param {Object} producto - Raw product data
 * @param {string} key - Firebase key
 * @returns {Object|null} Validated product or null if invalid
 */
function validarProducto(producto, key) {
  try {
    // Required fields validation
    if (!producto.nombre || typeof producto.nombre !== 'string') {
      console.warn(`Product ${key} missing valid name`);
      return null;
    }
    
    // Sanitize and validate all fields
    const productoValidado = {
      id: producto.id && !isNaN(producto.id) ? parseInt(producto.id) : parseInt(key) || 0,
      nombre: sanitizeHTML(producto.nombre.trim()),
      descripcion: sanitizeHTML((producto.descripcion || '').trim()),
      precio: Math.max(0, parseFloat(producto.precio) || 0),
      stock: Math.max(0, parseInt(producto.stock) || 0),
      categoria: sanitizeHTML((producto.categoria || 'otros').toLowerCase().trim()),
      estado: sanitizeHTML((producto.estado || '').trim()),
      adicionales: sanitizeHTML((producto.adicionales || '').trim()),
      
      // Dimensions - validate as positive numbers
      alto: producto.alto && !isNaN(producto.alto) && producto.alto > 0 ? parseFloat(producto.alto) : null,
      ancho: producto.ancho && !isNaN(producto.ancho) && producto.ancho > 0 ? parseFloat(producto.ancho) : null,
      profundidad: producto.profundidad && !isNaN(producto.profundidad) && producto.profundidad > 0 ? parseFloat(producto.profundidad) : null,
      
      // Images - validate URLs
      imagenes: validarImagenes(producto.imagenes),
      
      // Timestamps
      fechaCreacion: producto.fechaCreacion || Date.now(),
      fechaActualizacion: Date.now()
    };
    
    // Final validation
    if (!productoValidado.nombre || productoValidado.precio < 0) {
      console.warn(`Product ${key} failed final validation`);
      return null;
    }
    
    return productoValidado;
    
  } catch (error) {
    console.error(`Error validating product ${key}:`, error);
    return null;
  }
}

/**
 * Validates and sanitizes image URLs
 * @param {*} imagenes - Image data from Firebase
 * @returns {Array} Array of valid image URLs
 */
function validarImagenes(imagenes) {
  if (!imagenes) {
    return [CONFIG.PLACEHOLDER_IMAGE];
  }
  
  if (typeof imagenes === 'string') {
    return isValidImageUrl(imagenes) ? [imagenes] : [CONFIG.PLACEHOLDER_IMAGE];
  }
  
  if (Array.isArray(imagenes)) {
    const imagenesValidas = imagenes
      .filter(img => typeof img === 'string' && isValidImageUrl(img));
    
    return imagenesValidas.length > 0 ? imagenesValidas : [CONFIG.PLACEHOLDER_IMAGE];
  }
  
  return [CONFIG.PLACEHOLDER_IMAGE];
}

/**
 * Validates if a string is a valid image URL
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid image URL
 */
function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  
  try {
    const urlObj = new URL(url);
    const validProtocols = ['http:', 'https:', 'data:'];
    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];
    
    if (!validProtocols.includes(urlObj.protocol)) return false;
    
    // For data URLs, just check if it starts with data:image
    if (urlObj.protocol === 'data:') {
      return url.startsWith('data:image/');
    }
    
    // For regular URLs, check extension or accept if no extension (might be a service URL)
    const pathname = urlObj.pathname.toLowerCase();
    return validExtensions.some(ext => pathname.endsWith(ext)) || !pathname.includes('.');
    
  } catch (error) {
    return false;
  }
}

/**
 * Handles Firebase-specific errors
 * @param {Error} error - Firebase error
 */
function handleFirebaseError(error) {
  console.error('Firebase error:', error);
  
  let mensaje = 'Error de conexión con la base de datos';
  
  switch (error.code) {
    case 'permission-denied':
      mensaje = 'No tienes permisos para acceder a los datos';
      break;
    case 'network-request-failed':
      mensaje = 'Error de red. Verifica tu conexión a internet';
      break;
    case 'unavailable':
      mensaje = 'Servicio temporalmente no disponible';
      break;
    case 'timeout':
      mensaje = 'La operación tardó demasiado tiempo';
      break;
  }
  
  mostrarNotificacion(mensaje, 'error');
  
  // Update UI with error state
  if (elementos.galeriaProductos) {
    elementos.galeriaProductos.innerHTML = `
      <div class="error-carga" role="alert">
        <h3>Error al cargar productos</h3>
        <p>${mensaje}</p>
        <button onclick="location.reload()" class="boton-reintentar">
          Reintentar
        </button>
      </div>
    `;
  }
}

/**
 * Updates UI components that depend on product data
 */
function actualizarUI() {
  renderizarCarrito();
  actualizarContadorCarrito();
}

// ---------------------------------
// PRODUCT MODAL & DETAILS
// ---------------------------------

/**
 * Shows detailed view of a product
 * @param {number} id - Product ID
 */
function verDetalle(id) {
  const producto = state.productos.find(p => p.id === id);
  if (!producto) {
    mostrarNotificacion('Producto no encontrado', 'error');
    return;
  }
  mostrarModalProducto(producto);
}

/**
 * Shows product modal with carousel and detailed information
 * @param {Object} producto - Product object
 */
function mostrarModalProducto(producto) {
  const modal = elementos.productoModal;
  const contenido = elementos.modalContenido;
  
  if (!modal || !contenido) return;
  
  const enCarrito = state.carrito.find(item => item.id === producto.id) || { cantidad: 0 };
  const disponibles = Math.max(0, producto.stock - enCarrito.cantidad);
  const agotado = disponibles <= 0;
  let imagenActual = 0;
  
  function renderModal() {
    const dimensiones = construirTextoMedidas(producto);
    const adicionales = producto.adicionales ? 
      `<p class="modal-adicionales"><strong>Detalles adicionales:</strong> ${sanitizeHTML(producto.adicionales)}</p>` : '';
    
    contenido.innerHTML = `
      <div class="modal-header">
        <button class="cerrar-modal" aria-label="Cerrar modal" type="button" id="btn-close-modal">
          <span aria-hidden="true">×</span>
        </button>
      </div>
      
      <div class="modal-body">
        <div class="modal-carrusel">
          <div class="imagen-principal">
            <img id="modal-imagen" 
                 src="${producto.imagenes[imagenActual] || CONFIG.PLACEHOLDER_IMAGE}" 
                 class="modal-img" 
                 alt="${sanitizeHTML(producto.nombre)}"
                 onerror="this.src='${CONFIG.PLACEHOLDER_IMAGE}'">
          </div>
          
          ${producto.imagenes.length > 1 ? `
            <div class="modal-controles">
              <button class="modal-prev" 
                      ${imagenActual === 0 ? 'disabled' : ''} 
                      aria-label="Imagen anterior">
                ‹
              </button>
              <span class="contador-imagenes" aria-live="polite">
                ${imagenActual + 1} / ${producto.imagenes.length}
              </span>
              <button class="modal-next" 
                      ${imagenActual === producto.imagenes.length - 1 ? 'disabled' : ''} 
                      aria-label="Imagen siguiente">
                ›
              </button>
            </div>
          ` : ''}
          
          ${producto.imagenes.length > 1 ? `
            <div class="modal-thumbnails" role="tablist" aria-label="Miniaturas de imágenes">
              ${producto.imagenes.map((img, index) => `
                <button class="thumbnail ${index === imagenActual ? 'active' : ''}" 
                        data-index="${index}"
                        role="tab"
                        aria-selected="${index === imagenActual}"
                        aria-label="Ver imagen ${index + 1}">
                  <img src="${img}" 
                       alt="Miniatura ${index + 1}"
                       onerror="this.src='${CONFIG.PLACEHOLDER_IMAGE}'">
                </button>
              `).join('')}
            </div>
          ` : ''}
        </div>
        
        <div class="modal-info">
          <h1 class="modal-nombre">${sanitizeHTML(producto.nombre)}</h1>
          
          <div class="modal-precio-stock">
            <p class="modal-precio">$U ${formatearUY(producto.precio)}</p>
            <p class="modal-stock ${agotado ? 'agotado' : 'disponible'}">
              ${agotado ? '❌ AGOTADO' : `✅ ${disponibles} disponibles`}
            </p>
          </div>
          
          <div class="modal-descripcion">
            ${producto.descripcion ? `<p>${sanitizeHTML(producto.descripcion)}</p>` : ''}
            ${adicionales}
            ${dimensiones ? `<p class="modal-dimensiones">${dimensiones}</p>` : ''}
          </div>
          
          <div class="modal-acciones">
            <div class="cantidad-selector" ${agotado ? 'style="opacity: 0.5"' : ''}>
              <label for="cantidad-modal-input" class="sr-only">Cantidad a agregar</label>
              <input type="number" 
                     id="cantidad-modal-input"
                     class="cantidad-modal-input" 
                     value="1" 
                     min="1" 
                     max="${disponibles}" 
                     ${agotado ? 'disabled' : ''}>
            </div>
            
            <button class="boton-agregar-modal ${agotado ? 'agotado' : ''}" 
                    data-id="${producto.id}" 
                    ${agotado ? 'disabled' : ''} 
                    aria-label="${agotado ? 'Producto agotado' : `Agregar ${sanitizeHTML(producto.nombre)} al carrito`}">
              ${agotado ? '❌ Agotado' : '🛒 Agregar al carrito'}
            </button>
          </div>
        </div>
      </div>
    `;
    
    // Add event listeners
    setupModalEventListeners(producto);
  }
  
  function setupModalEventListeners(producto) {
    // Close button
    contenido.querySelector('#btn-close-modal')?.addEventListener('click', cerrarModal);
    
    // Navigation buttons
    const prevBtn = contenido.querySelector('.modal-prev');
    const nextBtn = contenido.querySelector('.modal-next');
    
    prevBtn?.addEventListener('click', () => {
      if (imagenActual > 0) {
        imagenActual--;
        renderModal();
      }
    });
    
    nextBtn?.addEventListener('click', () => {
      if (imagenActual < producto.imagenes.length - 1) {
        imagenActual++;
        renderModal();
      }
    });
    
    // Thumbnail clicks
    contenido.querySelectorAll('.thumbnail').forEach(thumbnail => {
      thumbnail.addEventListener('click', () => {
        imagenActual = parseInt(thumbnail.dataset.index);
        renderModal();
      });
    });
    
    // Add to cart button
    const addButton = contenido.querySelector('.boton-agregar-modal');
    const quantityInput = contenido.querySelector('.cantidad-modal-input');
    
    addButton?.addEventListener('click', () => {
      const cantidad = Math.max(1, parseInt(quantityInput?.value || 1));
      agregarAlCarrito(producto.id, cantidad, addButton);
    });
    
    // Keyboard navigation
    contenido.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowLeft':
          if (imagenActual > 0) {
            e.preventDefault();
            imagenActual--;
            renderModal();
          }
          break;
        case 'ArrowRight':
          if (imagenActual < producto.imagenes.length - 1) {
            e.preventDefault();
            imagenActual++;
            renderModal();
          }
          break;
        case 'Escape':
          e.preventDefault();
          cerrarModal();
          break;
      }
    });
  }
  
  // Build dimensions text
  function construirTextoMedidas(producto) {
    const medidas = [];
    if (producto.alto) medidas.push(`${producto.alto} cm alto`);
    if (producto.ancho) medidas.push(`${producto.ancho} cm ancho`);
    if (producto.profundidad) medidas.push(`${producto.profundidad} cm prof.`);
    
    return medidas.length > 0 ? 
      `<strong>Medidas:</strong> ${medidas.join(' × ')}` : '';
  }
  
  // Render and show modal
  renderModal();
  
  // Show modal with accessibility
  modal.classList.add('active');
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');
  
  // Focus management
  setTimeout(() => {
    const firstFocusable = contenido.querySelector('button, input, [tabindex]');
    firstFocusable?.focus();
  }, 100);
}

/**
 * Closes the product modal
 */
function cerrarModal() {
  const modal = elementos.productoModal;
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }
  
  document.body.classList.remove('no-scroll');
  
  // Return focus to trigger element
  elementos.carritoBtnMain?.focus();
}

// ---------------------------------
// ADD TO CART FUNCTIONALITY
// ---------------------------------

/**
 * Adds product to cart with Firebase stock management
 * @param {number} id - Product ID
 * @param {number} cantidad - Quantity to add (default: 1)
 * @param {HTMLElement} boton - Button element for UI feedback (optional)
 */
async function agregarAlCarrito(id, cantidad = 1, boton = null) {
  if (!db) {
    mostrarNotificacion('Error de conexión a la base de datos', 'error');
    return;
  }
  
  const producto = state.productos.find(p => p.id === id);
  if (!producto) {
    mostrarNotificacion('Producto no encontrado', 'error');
    return;
  }
  
  const itemEnCarrito = state.carrito.find(item => item.id === id);
  const cantidadEnCarrito = itemEnCarrito?.cantidad || 0;
  const disponibles = producto.stock - cantidadEnCarrito;
  const cantidadAgregar = Math.max(1, parseInt(cantidad) || 1);
  
  // Validate quantity
  if (cantidadAgregar > disponibles || cantidadAgregar < 1) {
    mostrarNotificacion(`Solo hay ${disponibles} unidades disponibles`, 'error');
    return;
  }
  
  if (disponibles <= 0) {
    mostrarNotificacion('Producto agotado', 'error');
    return;
  }
  
  // UI feedback - show loading state
  let originalButtonContent = null;
  if (boton) {
    originalButtonContent = boton.innerHTML;
    boton.disabled = true;
    boton.innerHTML = `
      <span class="loading-spinner" aria-hidden="true"></span>
      Agregando...
    `;
  }
  
  try {
    // Firebase transaction to update stock atomically
    const stockRef = ref(db, `productos/${id}/stock`);
    
    const result = await retryOperation(async () => {
      return await runTransaction(stockRef, (currentStock) => {
        const stock = (typeof currentStock === 'number' && !isNaN(currentStock)) ? 
          currentStock : 0;
        
        if (stock < cantidadAgregar) {
          // Abort transaction - not enough stock
          return undefined;
        }
        
        return Math.max(0, stock - cantidadAgregar);
      });
    });
    
    if (!result.committed) {
      mostrarNotificacion('Stock actualizado por otro usuario. Inténtalo de nuevo.', 'warning');
      return;
    }
    
    // Update local cart
    if (itemEnCarrito) {
      itemEnCarrito.cantidad += cantidadAgregar;
    } else {
      state.carrito.push({
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        cantidad: cantidadAgregar,
        imagen: (producto.imagenes && producto.imagenes[0]) || CONFIG.PLACEHOLDER_IMAGE
      });
    }
    
    // Save and update UI
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    
    const mensaje = cantidadAgregar === 1 ? 
      `✅ ${producto.nombre} agregado al carrito` :
      `✅ ${cantidadAgregar} x ${producto.nombre} agregados al carrito`;
    
    mostrarNotificacion(mensaje, 'exito');
    
  } catch (error) {
    console.error('Error adding to cart:', error);
    const errorMessage = error.code === 'permission-denied' ?
      'No tienes permisos para realizar esta operación' :
      'Error al agregar el producto. Inténtalo de nuevo.';
    
    mostrarNotificacion(errorMessage, 'error');
    
  } finally {
    // Restore button state
    if (boton) {
      boton.disabled = false;
      boton.innerHTML = originalButtonContent;
    }
  }
}

/**
 * Handles stock notification requests
 * @param {string} nombreProducto - Product name for the notification
 */
function preguntarStock(nombreProducto) {
  if (!nombreProducto) return;
  
  const email = window.STOCK_EMAIL || 'patofelting@gmail.com';
  const asunto = encodeURIComponent('Consulta de stock - Patofelting');
  const cuerpo = encodeURIComponent(
    `Hola,\n\nMe gustaría saber cuándo vuelve a estar disponible el producto: "${nombreProducto}".\n\nGracias por tu atención.\n\nSaludos.`
  );
  
  const mailtoUrl = `mailto:${email}?subject=${asunto}&body=${cuerpo}`;
  
  try {
    window.location.href = mailtoUrl;
    mostrarNotificacion('Abriendo cliente de correo...', 'info');
  } catch (error) {
    console.error('Error opening email client:', error);
    mostrarNotificacion('No se pudo abrir el cliente de correo', 'warning');
  }
}

// Expose functions globally for HTML onclick handlers
window.verDetalle = verDetalle;
window.cerrarModal = cerrarModal;
window.agregarAlCarrito = agregarAlCarrito;
window.preguntarStock = preguntarStock;

// ---------------------------------
// ORDER SUMMARY & CHECKOUT
// ---------------------------------

/**
 * Renders order summary for checkout modal
 */
function renderResumenDeCompra() {
  const resumenProductos = elementos.resumenProductos;
  const resumenTotal = elementos.resumenTotal;
  
  if (!resumenProductos || !resumenTotal) return;
  
  if (state.carrito.length === 0) {
    resumenProductos.innerHTML = '<p>No hay productos en el carrito.</p>';
    resumenTotal.textContent = '$U 0';
    return;
  }
  
  try {
    resumenProductos.innerHTML = state.carrito.map(item => `
      <div class="resumen-item" role="listitem">
        <div class="resumen-item-info">
          <span class="resumen-item-nombre">${sanitizeHTML(item.nombre)}</span>
          <span class="resumen-item-cantidad">x${item.cantidad}</span>
        </div>
        <span class="resumen-item-precio">$U ${formatearUY(item.precio * item.cantidad)}</span>
      </div>
    `).join('');
    
    const subtotal = state.carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    const envio = calcularEnvioActual();
    const total = subtotal + envio;
    
    resumenTotal.innerHTML = `
      <div class="resumen-subtotal">
        <span>Subtotal:</span>
        <span>$U ${formatearUY(subtotal)}</span>
      </div>
      ${envio > 0 ? `
        <div class="resumen-envio">
          <span>Envío:</span>
          <span>$U ${formatearUY(envio)}</span>
        </div>
      ` : ''}
      <div class="resumen-total-final">
        <span><strong>Total:</strong></span>
        <span><strong>$U ${formatearUY(total)}</strong></span>
      </div>
    `;
    
  } catch (error) {
    console.error('Error rendering order summary:', error);
    resumenProductos.innerHTML = '<p class="error">Error al mostrar el resumen.</p>';
  }
}

/**
 * Calculates current shipping cost based on selected method
 * @returns {number} Shipping cost
 */
function calcularEnvioActual() {
  const metodoPago = elementos.selectEnvio?.value || '';
  
  switch (metodoPago) {
    case 'montevideo':
      return 150;
    case 'interior':
      return 300;
    case 'retiro':
    default:
      return 0;
  }
}

/**
 * Updates order summary when shipping method changes
 */
function actualizarResumenPedido() {
  renderResumenDeCompra();
  
  // Show/hide address field based on shipping method
  const grupoDireccion = document.getElementById('grupo-direccion');
  const inputDireccion = document.getElementById('input-direccion');
  const metodoPago = elementos.selectEnvio?.value || '';
  
  if (grupoDireccion && inputDireccion) {
    if (metodoPago === 'retiro') {
      grupoDireccion.style.display = 'none';
      inputDireccion.required = false;
    } else {
      grupoDireccion.style.display = 'block';
      inputDireccion.required = true;
    }
  }
}

// ---------------------------------
// CONTACT FORM WITH EMAILJS
// ---------------------------------

/**
 * Sets up the contact form with EmailJS integration
 */
function setupContactForm() {
  const form = elementos.formContacto;
  if (!form) return;
  
  // Initialize EmailJS
  if (!window.__emailjsInitialized && window.emailjs) {
    try {
      window.emailjs.init(CONFIG.EMAIL.PUBLIC_KEY);
      window.__emailjsInitialized = true;
      console.log('✅ EmailJS initialized');
    } catch (error) {
      console.error('❌ EmailJS initialization failed:', error);
    }
  }
  
  // Add form validation and submission handler
  form.addEventListener('submit', handleContactFormSubmit);
  
  // Add real-time validation
  addFormValidation(form);
}

/**
 * Handles contact form submission
 * @param {Event} event - Form submission event
 */
async function handleContactFormSubmit(event) {
  event.preventDefault();
  
  const form = event.target;
  const formData = new FormData(form);
  
  // Clear previous messages
  clearFormMessages();
  
  // Validate form data
  const validationResult = validateContactForm(formData);
  if (!validationResult.isValid) {
    showFormErrors(validationResult.errors);
    return;
  }
  
  // Show loading state
  const submitButton = form.querySelector('button[type="submit"]');
  const originalButtonText = submitButton?.textContent;
  
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.innerHTML = `
      <span class="loading-spinner" aria-hidden="true"></span>
      Enviando...
    `;
  }
  
  try {
    if (!window.emailjs || !window.__emailjsInitialized) {
      throw new Error('EmailJS no está disponible');
    }
    
    const templateParams = {
      from_name: formData.get('nombre'),
      from_email: formData.get('email'),
      message: formData.get('mensaje'),
      to_email: 'patofelting@gmail.com',
      reply_to: formData.get('email')
    };
    
    await window.emailjs.send(
      CONFIG.EMAIL.SERVICE_ID,
      CONFIG.EMAIL.TEMPLATE_ID,
      templateParams
    );
    
    // Show success message
    showFormSuccess('✅ ¡Mensaje enviado con éxito! Te responderemos pronto.');
    form.reset();
    
  } catch (error) {
    console.error('Contact form submission error:', error);
    showFormError('❌ Error al enviar el mensaje. Por favor intenta de nuevo o contáctanos directamente.');
  } finally {
    // Restore button state
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
    }
  }
}

/**
 * Validates contact form data
 * @param {FormData} formData - Form data to validate
 * @returns {Object} Validation result
 */
function validateContactForm(formData) {
  const errors = {};
  
  const nombre = formData.get('nombre')?.trim();
  const email = formData.get('email')?.trim();
  const mensaje = formData.get('mensaje')?.trim();
  
  // Validate name
  if (!nombre || nombre.length < 2) {
    errors.nombre = 'El nombre debe tener al menos 2 caracteres';
  } else if (nombre.length > 50) {
    errors.nombre = 'El nombre no puede tener más de 50 caracteres';
  }
  
  // Validate email
  if (!email) {
    errors.email = 'El email es requerido';
  } else if (!isValidEmail(email)) {
    errors.email = 'Por favor ingresa un email válido';
  } else if (email.length > 100) {
    errors.email = 'El email no puede tener más de 100 caracteres';
  }
  
  // Validate message
  if (!mensaje || mensaje.length < 10) {
    errors.mensaje = 'El mensaje debe tener al menos 10 caracteres';
  } else if (mensaje.length > 1000) {
    errors.mensaje = 'El mensaje no puede tener más de 1000 caracteres';
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

/**
 * Adds real-time form validation
 * @param {HTMLFormElement} form - Form element
 */
function addFormValidation(form) {
  const inputs = form.querySelectorAll('input, textarea');
  
  inputs.forEach(input => {
    // Validate on blur
    input.addEventListener('blur', () => validateField(input));
    
    // Clear error on input
    input.addEventListener('input', () => clearFieldError(input));
  });
}

/**
 * Validates a single form field
 * @param {HTMLElement} field - Field to validate
 */
function validateField(field) {
  const name = field.name;
  const value = field.value.trim();
  const errorElement = document.getElementById(`${name}-error`);
  
  if (!errorElement) return;
  
  let error = '';
  
  switch (name) {
    case 'nombre':
      if (!value || value.length < 2) {
        error = 'El nombre debe tener al menos 2 caracteres';
      } else if (value.length > 50) {
        error = 'El nombre no puede tener más de 50 caracteres';
      }
      break;
      
    case 'email':
      if (!value) {
        error = 'El email es requerido';
      } else if (!isValidEmail(value)) {
        error = 'Por favor ingresa un email válido';
      } else if (value.length > 100) {
        error = 'El email no puede tener más de 100 caracteres';
      }
      break;
      
    case 'mensaje':
      if (!value || value.length < 10) {
        error = 'El mensaje debe tener al menos 10 caracteres';
      } else if (value.length > 1000) {
        error = 'El mensaje no puede tener más de 1000 caracteres';
      }
      break;
  }
  
  if (error) {
    errorElement.textContent = error;
    errorElement.style.display = 'block';
    field.setAttribute('aria-invalid', 'true');
  } else {
    clearFieldError(field);
  }
}

/**
 * Clears error for a specific field
 * @param {HTMLElement} field - Field to clear error for
 */
function clearFieldError(field) {
  const errorElement = document.getElementById(`${field.name}-error`);
  if (errorElement) {
    errorElement.textContent = '';
    errorElement.style.display = 'none';
  }
  field.setAttribute('aria-invalid', 'false');
}

/**
 * Shows form validation errors
 * @param {Object} errors - Validation errors object
 */
function showFormErrors(errors) {
  Object.entries(errors).forEach(([fieldName, errorMessage]) => {
    const errorElement = document.getElementById(`${fieldName}-error`);
    const field = document.querySelector(`[name="${fieldName}"]`);
    
    if (errorElement && field) {
      errorElement.textContent = errorMessage;
      errorElement.style.display = 'block';
      field.setAttribute('aria-invalid', 'true');
    }
  });
  
  // Focus first invalid field
  const firstError = Object.keys(errors)[0];
  const firstField = document.querySelector(`[name="${firstError}"]`);
  if (firstField) {
    firstField.focus();
  }
}

/**
 * Shows form success message
 * @param {string} message - Success message
 */
function showFormSuccess(message) {
  const successElement = elementos.successMessage;
  if (successElement) {
    successElement.textContent = message;
    successElement.classList.remove('hidden');
    successElement.style.display = 'block';
    successElement.setAttribute('role', 'status');
    successElement.setAttribute('aria-live', 'polite');
    
    setTimeout(() => {
      successElement.classList.add('hidden');
      successElement.style.display = 'none';
    }, 5000);
  }
}

/**
 * Shows form error message
 * @param {string} message - Error message
 */
function showFormError(message) {
  const errorElement = elementos.errorMessage;
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.classList.remove('hidden');
    errorElement.style.display = 'block';
    errorElement.setAttribute('role', 'alert');
    errorElement.setAttribute('aria-live', 'assertive');
    
    setTimeout(() => {
      errorElement.classList.add('hidden');
      errorElement.style.display = 'none';
    }, 5000);
  }
}

/**
 * Clears all form messages
 */
function clearFormMessages() {
  const successElement = elementos.successMessage;
  const errorElement = elementos.errorMessage;
  
  if (successElement) {
    successElement.classList.add('hidden');
    successElement.style.display = 'none';
  }
  
  if (errorElement) {
    errorElement.classList.add('hidden');
    errorElement.style.display = 'none';
  }
  
  // Clear field errors
  document.querySelectorAll('.error-message').forEach(el => {
    el.textContent = '';
    el.style.display = 'none';
  });
  
  // Reset aria-invalid attributes
  document.querySelectorAll('[aria-invalid="true"]').forEach(field => {
    field.setAttribute('aria-invalid', 'false');
  });
}

// ---------------------------------
// EVENT HANDLERS & INITIALIZATION
// ---------------------------------

/**
 * Initializes all event listeners with improved error handling
 */
function inicializarEventos() {
  try {
    // Cart event listeners
    setupCartEventListeners();
    
    // Modal event listeners
    setupModalEventListeners();
    
    // Filter event listeners
    setupFilterEventListeners();
    
    // Product catalog event listeners
    setupCatalogEventListeners();
    
    // Global keyboard event listeners
    setupKeyboardEventListeners();
    
    console.log('✅ Event listeners initialized');
    
  } catch (error) {
    console.error('Error initializing events:', error);
  }
}

/**
 * Sets up cart-related event listeners
 */
function setupCartEventListeners() {
  // Cart toggle buttons
  elementos.carritoBtnMain?.addEventListener('click', () => toggleCarrito(true));
  elementos.carritoOverlay?.addEventListener('click', () => toggleCarrito(false));
  elementos.btnCerrarCarrito?.addEventListener('click', () => toggleCarrito(false));
  
  // Cart action buttons
  elementos.btnVaciarCarrito?.addEventListener('click', vaciarCarrito);
  elementos.btnFinalizarCompra?.addEventListener('click', handleFinalizarCompra);
  
  // Pre-purchase modal buttons
  elementos.btnEntendidoAviso?.addEventListener('click', handleEntendidoAviso);
  elementos.btnCancelarAviso?.addEventListener('click', handleCancelarAviso);
  
  // Shipping method selector
  elementos.selectEnvio?.addEventListener('change', actualizarResumenPedido);
}

/**
 * Sets up modal-related event listeners
 */
function setupModalEventListeners() {
  // Close modal buttons
  document.getElementById('btn-cerrar-modal-envio')?.addEventListener('click', cerrarModalEnvio);
  
  // Modal overlay clicks (close on outside click)
  elementos.productoModal?.addEventListener('click', (e) => {
    if (e.target === elementos.productoModal) {
      cerrarModal();
    }
  });
  
  elementos.avisoPreCompraModal?.addEventListener('click', (e) => {
    if (e.target === elementos.avisoPreCompraModal) {
      handleCancelarAviso();
    }
  });
}

/**
 * Sets up filter-related event listeners with debouncing
 */
function setupFilterEventListeners() {
  // Search input with debouncing
  const debouncedSearch = debounce((e) => {
    state.filtrosActuales.busqueda = (e.target.value || '').toLowerCase().trim();
    aplicarFiltros();
  }, CONFIG.DEBOUNCE_DELAY);
  
  elementos.inputBusqueda?.addEventListener('input', debouncedSearch);
  
  // Category selector
  elementos.selectCategoria?.addEventListener('change', (e) => {
    state.filtrosActuales.categoria = e.target.value;
    aplicarFiltros();
  });
  
  // Price range sliders with debouncing
  const debouncedPriceUpdate = debounce(() => {
    updateRange();
    aplicarFiltros();
  }, CONFIG.DEBOUNCE_DELAY);
  
  elementos.precioMinInput?.addEventListener('input', debouncedPriceUpdate);
  elementos.precioMaxInput?.addEventListener('input', debouncedPriceUpdate);
  elementos.aplicarRangoBtn?.addEventListener('click', debouncedPriceUpdate);
}

/**
 * Sets up product catalog event listeners using event delegation
 */
function setupCatalogEventListeners() {
  const galeria = elementos.galeriaProductos;
  if (!galeria) return;
  
  galeria.addEventListener('click', async (e) => {
    const card = e.target.closest('.producto-card');
    if (!card) return;
    
    const productId = parseInt(card.dataset.id);
    if (!productId) return;
    
    const button = e.target.closest('button');
    if (!button) return;
    
    try {
      if (button.classList.contains('boton-detalles')) {
        verDetalle(productId);
      } else if (button.classList.contains('boton-agregar')) {
        await agregarAlCarrito(productId, 1, button);
      } else if (button.classList.contains('boton-aviso-stock')) {
        const nombreProducto = button.dataset.nombre;
        if (nombreProducto) {
          preguntarStock(nombreProducto);
        }
      }
    } catch (error) {
      console.error('Catalog event handler error:', error);
      mostrarNotificacion('Error al procesar la acción', 'error');
    }
  });
}

/**
 * Sets up global keyboard event listeners for accessibility
 */
function setupKeyboardEventListeners() {
  document.addEventListener('keydown', (e) => {
    // Close modals with Escape key
    if (e.key === 'Escape') {
      if (elementos.productoModal?.classList.contains('active')) {
        e.preventDefault();
        cerrarModal();
      } else if (elementos.carritoPanel?.classList.contains('active')) {
        e.preventDefault();
        toggleCarrito(false);
      } else if (elementos.avisoPreCompraModal && !elementos.avisoPreCompraModal.hidden) {
        e.preventDefault();
        handleCancelarAviso();
      } else if (elementos.modalDatosEnvio?.classList.contains('visible')) {
        e.preventDefault();
        cerrarModalEnvio();
      }
    }
  });
}

/**
 * Handles "Finalizar Compra" button click
 */
function handleFinalizarCompra() {
  if (state.carrito.length === 0) {
    mostrarNotificacion('El carrito está vacío', 'error');
    return;
  }
  
  if (elementos.avisoPreCompraModal) {
    elementos.avisoPreCompraModal.hidden = false;
    elementos.avisoPreCompraModal.style.display = 'flex';
    elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'false');
    
    // Focus management
    const firstButton = elementos.avisoPreCompraModal.querySelector('button');
    if (firstButton) {
      setTimeout(() => firstButton.focus(), 100);
    }
  }
}

/**
 * Handles "Entendido" button click in pre-purchase modal
 */
function handleEntendidoAviso() {
  if (elementos.avisoPreCompraModal) {
    elementos.avisoPreCompraModal.hidden = true;
    elementos.avisoPreCompraModal.style.display = 'none';
    elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'true');
  }
  
  if (elementos.modalDatosEnvio) {
    elementos.modalDatosEnvio.hidden = false;
    elementos.modalDatosEnvio.style.display = 'flex';
    elementos.modalDatosEnvio.classList.add('visible');
    renderResumenDeCompra();
    
    // Focus management
    const firstInput = elementos.modalDatosEnvio.querySelector('input');
    if (firstInput) {
      setTimeout(() => firstInput.focus(), 100);
    }
  }
}

/**
 * Handles "Cancelar" button click in pre-purchase modal
 */
function handleCancelarAviso() {
  if (elementos.avisoPreCompraModal) {
    elementos.avisoPreCompraModal.hidden = true;
    elementos.avisoPreCompraModal.style.display = 'none';
    elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Closes the shipping data modal
 */
function cerrarModalEnvio() {
  if (elementos.modalDatosEnvio) {
    elementos.modalDatosEnvio.classList.remove('visible');
    elementos.modalDatosEnvio.style.display = 'none';
    elementos.modalDatosEnvio.hidden = true;
  }
}

/**
 * Initializes hamburger menu with accessibility
 */
function inicializarMenuHamburguesa() {
  const { hamburguesa, menu } = elementos;
  if (!hamburguesa || !menu) return;
  
  hamburguesa.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('active');
    hamburguesa.setAttribute('aria-expanded', isOpen);
    document.body.classList.toggle('no-scroll', isOpen);
    
    // Focus management
    if (isOpen) {
      const firstLink = menu.querySelector('a');
      if (firstLink) {
        setTimeout(() => firstLink.focus(), 100);
      }
    }
  });
  
  // Close menu when clicking links
  menu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      menu.classList.remove('active');
      hamburguesa.setAttribute('aria-expanded', false);
      document.body.classList.remove('no-scroll');
    });
  });
}

/**
 * Initializes FAQ section with improved accessibility
 */
function inicializarFAQ() {
  document.querySelectorAll('.faq-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
      const newState = !isExpanded;
      
      toggle.setAttribute('aria-expanded', newState);
      
      const content = document.getElementById(toggle.getAttribute('aria-controls'));
      if (content) {
        content.hidden = !newState;
        
        // Smooth scroll to expanded content
        if (newState) {
          setTimeout(() => {
            toggle.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 100);
        }
      }
    });
  });
}

/**
 * Handles online/offline connection changes
 */
function setupConnectionHandlers() {
  window.addEventListener('online', handleConnectionChange);
  window.addEventListener('offline', handleConnectionChange);
  
  // Initial connection state
  state.isOnline = navigator.onLine;
}

/**
 * Cleanup function to remove listeners and prevent memory leaks
 */
function cleanup() {
  // Remove Firebase listeners
  state.activeListeners.forEach(listenerType => {
    if (listenerType === 'productos') {
      const productosRef = ref(db, 'productos');
      off(productosRef);
    }
  });
  state.activeListeners.clear();
  
  // Clear DOM cache
  elementos.clearCache();
  
  console.log('🧹 Cleanup completed');
}

// ---------------------------------
// INITIALIZATION & STARTUP
// ---------------------------------

/**
 * Main initialization function
 */
async function init() {
  try {
    console.log('🚀 Initializing Patofelting E-commerce...');
    
    // Initialize UI components
    inicializarMenuHamburguesa();
    inicializarFAQ();
    setupContactForm();
    inicializarEventos();
    
    // Initialize connection handlers
    setupConnectionHandlers();
    
    // Initialize UI state
    updateRange();
    aplicarFiltros();
    actualizarResumenPedido();
    
    console.log('✅ Initialization completed successfully');
    
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    mostrarNotificacion('Error al inicializar la aplicación', 'error');
  }
}

/**
 * Application startup sequence
 */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Check Firebase initialization
    if (!db) {
      throw new Error('Firebase database not available');
    }
    
    console.log('🔐 Authenticating with Firebase...');
    
    // Authenticate anonymously with Firebase
    await retryOperation(async () => {
      await signInAnonymously(auth);
    });
    
    console.log('✅ Firebase authentication successful');
    
    // Load cart from localStorage
    cargarCarrito();
    
    // Load products from Firebase
    await cargarProductosDesdeFirebase();
    
    // Initialize the application
    await init();
    
    console.log('🎉 Patofelting E-commerce is ready!');
    
  } catch (error) {
    console.error('💥 Application startup failed:', error);
    
    // Show user-friendly error message
    const errorMessage = error.code === 'auth/network-request-failed' ?
      'No se pudo conectar con el servidor. Verifica tu conexión a internet.' :
      'Error al inicializar la aplicación. Por favor recarga la página.';
    
    mostrarNotificacion(errorMessage, 'error', 10000);
    
    // Still try to initialize basic functionality
    try {
      cargarCarrito();
      await init();
    } catch (fallbackError) {
      console.error('Fallback initialization also failed:', fallbackError);
    }
  }
});

// Cleanup on page unload
window.addEventListener('beforeunload', cleanup);

// ---------------------------------
// ERROR BOUNDARY
// ---------------------------------

/**
 * Global error handler
 */
window.addEventListener('error', (event) => {
  console.error('Global error caught:', event.error);
  
  // Don't show errors for external scripts or resources
  if (event.filename && !event.filename.includes(window.location.origin)) {
    return;
  }
  
  mostrarNotificacion('Ha ocurrido un error inesperado', 'error');
});

/**
 * Global promise rejection handler
 */
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  
  // Prevent default browser behavior
  event.preventDefault();
  
  mostrarNotificacion('Error en operación asíncrona', 'warning');
});

// ---------------------------------
// PERFORMANCE MONITORING
// ---------------------------------

if (typeof performance !== 'undefined' && performance.mark) {
  performance.mark('patofelting-start');
  
  window.addEventListener('load', () => {
    performance.mark('patofelting-end');
    performance.measure('patofelting-load', 'patofelting-start', 'patofelting-end');
    
    const measure = performance.getEntriesByName('patofelting-load')[0];
    console.log(`⚡ Patofelting loaded in ${measure.duration.toFixed(2)}ms`);
  });
}
