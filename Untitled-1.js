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
// PRODUCTOS: carga
// ---------------------------------
async function cargarProductosDesdeFirebase(){
  const productosRef = ref(db, 'productos');
  try{
    if (elementos.productLoader) elementos.productLoader.hidden = false;

    const snap = await get(productosRef);
    if (snap.exists()) procesarDatosProductos(snap.val());

    // tiempo real
    onValue(productosRef, (s)=>{
      if (!s.exists()){
        productos=[];
        renderizarProductos();
        actualizarCategorias();
        actualizarUI();
        return;
      }
      procesarDatosProductos(s.val());
    });
  }catch(e){
    console.error('Error al cargar productos:', e);
    if (elementos.galeriaProductos) {
      elementos.galeriaProductos.innerHTML = '<p class="error-carga">No se pudieron cargar los productos.</p>';
    }
  }finally{
    if (elementos.productLoader) elementos.productLoader.hidden = true;
  }
}

function procesarDatosProductos(data){
  productos = [];
  Object.keys(data).forEach(key=>{
    const p = data[key] ?? {};
    productos.push({
      id: p.id && !isNaN(p.id) ? parseInt(p.id) : parseInt(key),
      nombre: (p.nombre ?? 'Sin nombre').trim(),
      descripcion: (p.descripcion ?? '').trim(),
      precio: !isNaN(+p.precio) ? +p.precio : 0,
      stock: !isNaN(parseInt(p.stock)) ? Math.max(0, parseInt(p.stock)) : 0,
      imagenes: Array.isArray(p.imagenes) && p.imagenes.length ? p.imagenes : [PLACEHOLDER_IMAGE],
      categoria: (p.categoria ?? 'otros').toLowerCase().trim(),
      estado: (p.estado ?? '').trim(),
      adicionales: (p.adicionales ?? '').trim(),
      alto: !isNaN(+p.alto) ? +p.alto : null,
      ancho: !isNaN(+p.ancho) ? +p.ancho : null,
      profundidad: !isNaN(+p.profundidad) ? +p.profundidad : null,
    });
  });

  renderizarProductos();
  actualizarCategorias();
  actualizarUI();
}

function actualizarUI(){
  renderizarCarrito();
  actualizarContadorCarrito();
}

// ---------------------------------
// MODAL DE PRODUCTO
// ---------------------------------
function verDetalle(id){
  const p = productos.find(x=>x.id===id);
  if (!p){
    mostrarNotificacion('Producto no encontrado','error');
    return;
  }
  mostrarModalProducto(p);
}
window.verDetalle = verDetalle;

function mostrarModalProducto(producto){
  const modal = elementos.productoModal, cont = elementos.modalContenido;
  if (!modal || !cont) return;

  const enCarrito = carrito.find(i=>i.id===producto.id) ?? {cantidad:0};
  const disponibles = Math.max(0, producto.stock - enCarrito.cantidad);
  const agotado = disponibles <= 0;
  let idx = 0;

  function render(){
    const medidas =
      (producto.alto || producto.ancho || producto.profundidad)
        ? `<small><b>Medidas:</b> ${producto.alto ? `${producto.alto} cm (alto)` : ''}${producto.ancho ? ` x ${producto.ancho} cm (ancho)` : ''}${producto.profundidad ? ` x ${producto.profundidad} cm (prof.)` : ''}</small>`
        : '';

    const adicionales = producto.adicionales
      ? `<small><b>Adicionales:</b> ${producto.adicionales}</small>`
      : '';

    cont.innerHTML = `
      <button class="cerrar-modal" aria-label="Cerrar" id="btn-close-modal">×</button>
      <div class="modal-flex">
        <div class="modal-carrusel">
          <img id="modal-imagen" src="${producto.imagenes[idx] ?? PLACEHOLDER_IMAGE}" class="modal-img" alt="${producto.nombre}">
          ${producto.imagenes.length>1 ? `
            <div class="modal-controls">
              <button class="modal-prev" ${idx===0 ? 'disabled' : ''} aria-label="Imagen anterior">&lt;</button>
              <button class="modal-next" ${idx===producto.imagenes.length-1 ? 'disabled' : ''} aria-label="Imagen siguiente">&gt;</button>
            </div>
          ` : ''}
          <div class="modal-thumbnails">
            ${producto.imagenes.map((img,i)=>`
              <img src="${img}" class="thumbnail ${i===idx ? 'active' : ''}" data-index="${i}" alt="Miniatura ${i+1}">
            `).join('')}
          </div>
        </div>

        <div class="modal-info">
          <h1 class="modal-nombre">${producto.nombre}</h1>
          <p class="modal-precio">$U ${formatearUY(producto.precio)}</p>
          <p class="modal-stock ${agotado ? 'agotado' : 'disponible'}">${agotado ? 'AGOTADO' : `Disponible: ${disponibles}`}</p>

          <div class="modal-descripcion">
            ${producto.descripcion || ''}
            ${adicionales ? `<br>${adicionales}` : ''}
            ${medidas ? `<br>${medidas}` : ''}
          </div>

          <div class="modal-acciones">
            <input type="number" value="1" min="1" max="${disponibles}" class="cantidad-modal-input" ${agotado ? 'disabled' : ''}>
            <button class="boton-agregar-modal ${agotado ? 'agotado' : ''}" data-id="${producto.id}" ${agotado ? 'disabled' : ''} aria-label="${agotado?'Agotado':'Agregar al carrito'}">
              ${agotado ? 'Agotado' : 'Agregar al carrito'}
            </button>
          </div>
        </div>
      </div>
    `;

    // eventos internos
    cont.querySelector('#btn-close-modal')?.addEventListener('click', cerrarModal);
    cont.querySelector('.modal-prev')?.addEventListener('click', ()=>{ if(idx>0){ idx--; render(); }});
    cont.querySelector('.modal-next')?.addEventListener('click', ()=>{ if(idx<producto.imagenes.length-1){ idx++; render(); }});
    cont.querySelectorAll('.thumbnail').forEach(th=>{
      th.addEventListener('click', ()=>{
        idx = parseInt(th.dataset.index);
        render();
      });
    });
    const btnAdd   = cont.querySelector('.boton-agregar-modal');
    const inputCant = cont.querySelector('.cantidad-modal-input');
    btnAdd?.addEventListener('click', ()=>{
      const cant = Math.max(1, parseInt(inputCant.value ?? 1));
      agregarAlCarrito(producto.id, cant, btnAdd);
    });
  }

  render();

  // Abrir modal accesible
  modal.classList.add('active');
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden','false');
  document.body.classList.add('no-scroll');
}

function cerrarModal(){
  if (elementos.productoModal){
    elementos.productoModal.classList.remove('active');
    elementos.productoModal.style.display = 'none';
    elementos.productoModal.setAttribute('aria-hidden','true');
  }
  document.body.classList.remove('no-scroll');
}
window.cerrarModal = cerrarModal;

// ---------------------------------
// AGREGAR AL CARRITO
// ---------------------------------
function agregarAlCarrito(id, cantidad=1, boton=null){
  const p = productos.find(x=>x.id===id);
  if (!p){
    mostrarNotificacion('Producto no encontrado','error');
    return;
  }

  const enCarrito = carrito.find(i=>i.id===id);
  const ya = enCarrito ? enCarrito.cantidad : 0;
  const disponibles = p.stock - ya;
  const cant = Math.max(1, parseInt(cantidad ?? 1));

  if (disponibles < cant || cant < 1){
    mostrarNotificacion('Stock insuficiente o cantidad inválida','error');
    return;
  }

  let original=null;
  if (boton){
    original = boton.innerHTML;
    boton.disabled = true;
    boton.innerHTML = 'Agregando <span class="spinner"></span>';
  }

  const r = ref(db, `productos/${id}/stock`);
  runTransaction(r, (cur)=>{
    cur = (typeof cur !== 'number' || isNaN(cur)) ? 0 : cur;
    if (cur < cant) return undefined; // aborta transacción
    return Math.max(0, cur - cant);
  }).then(res=>{
    if (!res.committed){
      mostrarNotificacion('Stock actualizado por otro usuario','error');
      return;
    }
    if (enCarrito) enCarrito.cantidad += cant;
    else carrito.push({
      id: p.id, nombre: p.nombre, precio: p.precio, cantidad: cant,
      imagen: p.imagenes?.[0] ?? PLACEHOLDER_IMAGE
    });

    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion('✅ Producto agregado','exito');
  }).catch(err=>{
    console.error(err);
    mostrarNotificacion('Error al agregar','error');
  }).finally(()=>{
    if (boton){ boton.disabled=false; boton.innerHTML = original; }
  });
}
window.agregarAlCarrito = agregarAlCarrito;

// ---------------------------------
// AVISO DE STOCK (mail rápido)
// ---------------------------------
function preguntarStock(nombre){
  const asunto = encodeURIComponent('Aviso de stock');
  const cuerpo  = encodeURIComponent(`Hola, me gustaría saber cuándo vuelve a estar disponible: ${nombre}. Gracias.`);
  window.location.href = `mailto:${window.STOCK_EMAIL ?? 'patofelting@gmail.com'}?subject=${asunto}&body=${cuerpo}`;
}
window.preguntarStock = preguntarStock;

// ---------------------------------
// RESUMEN DE COMPRA
// ---------------------------------
function renderResumenDeCompra(){
  if (!elementos.resumenProductos || !elementos.resumenTotal) return;

  if (!carrito.length){
    elementos.resumenProductos.innerHTML = '<p>No hay productos en el carrito.</p>';
    elementos.resumenTotal.textContent = '$U 0';
    return;
  }

  elementos.resumenProductos.innerHTML = carrito.map(i=>`
    <div class="resumen-item">
      <span>${i.nombre} x${i.cantidad}</span>
      <span>$U ${formatearUY(i.precio * i.cantidad)}</span>
    </div>
  `).join('');

  const subtotal = carrito.reduce((s,i)=> s + i.precio*i.cantidad, 0);
  const envio = calcularEnvioActual();
  elementos.resumenTotal.textContent = `$U ${formatearUY(subtotal + envio)}`;
}

function calcularEnvioActual(){
  const val = elementos.selectEnvio?.value ?? '';
  if (val==='montevideo') return 150;
  if (val==='interior')   return 300;
  return 0;
}

function actualizarResumenPedido(){
  renderResumenDeCompra();
}

// ---------------------------------
// FORMULARIO DE CONTACTO (EmailJS)
// ---------------------------------
function setupContactForm(){
  const form = elementos.formContacto;
  if (!form) return;

  const PUBLIC_KEY  = 'o4IxJz0Zz-LQ8jYKG';
  const SERVICE_ID  = 'service_89by24g';
  const TEMPLATE_ID = 'template_8mn7hdp';

  if (!window.__emailjsInited){
    if (window.emailjs && typeof window.emailjs.init === 'function'){
      window.emailjs.init(PUBLIC_KEY);
      window.__emailjsInited = true;
    }else{
      console.error('EmailJS no cargó.');
    }
  }

  form.setAttribute('autocomplete','on');

  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const {successMessage, errorMessage} = elementos;

    if (!window.emailjs || !window.__emailjsInited){
      if (errorMessage){
        errorMessage.classList.remove('hidden');
        errorMessage.textContent = 'Servicio de email no disponible.';
        setTimeout(()=>errorMessage.classList.add('hidden'),3000);
      }
      return;
    }

    const nombre  = form.querySelector('[name="nombre"]')?.value ?? '';
    const email   = form.querySelector('[name="email"]')?.value ?? '';
    const mensaje = form.querySelector('[name="mensaje"]')?.value ?? '';

    // Validación de email mínimamente decente
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      mostrarNotificacion('Email inválido','error');
      return;
    }

    emailjs.send(SERVICE_ID, TEMPLATE_ID, {
      from_name: nombre,
      from_email: email,
      message: mensaje
    }).then(()=>{
      if (successMessage){
        successMessage.classList.remove('hidden');
        setTimeout(()=>successMessage.classList.add('hidden'),3000);
      }
      if (errorMessage) errorMessage.classList.add('hidden');
      form.reset();
    }).catch(err=>{
      console.error(err);
      if (errorMessage){
        errorMessage.classList.remove('hidden');
        errorMessage.textContent = 'Error al enviar el mensaje. Intenta de nuevo.';
        setTimeout(()=>errorMessage.classList.add('hidden'),3000);
      }
    });
  });
}

// ---------------------------------
// EVENTOS GLOBALES
// ---------------------------------
function inicializarEventos() {
  // carrito
  elementos.carritoBtnMain?.addEventListener('click', () => toggleCarrito(true));
  elementos.carritoOverlay?.addEventListener('click', () => toggleCarrito(false));
  elementos.btnCerrarCarrito?.addEventListener('click', () => toggleCarrito(false));
  elementos.btnVaciarCarrito?.addEventListener('click', vaciarCarrito);

  elementos.btnFinalizarCompra?.addEventListener('click', () => {
    if (!carrito.length) { mostrarNotificacion('El carrito está vacío', 'error'); return; }
    if (elementos.avisoPreCompraModal) {
      elementos.avisoPreCompraModal.hidden = false;
      elementos.avisoPreCompraModal.style.display = 'flex';
      elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'false');
    }
  });

  elementos.btnEntendidoAviso?.addEventListener('click', () => {
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
    }
  });

  elementos.btnCancelarAviso?.addEventListener('click', () => {
    if (elementos.avisoPreCompraModal) {
      elementos.avisoPreCompraModal.hidden = true;
      elementos.avisoPreCompraModal.style.display = 'none';
      elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'true');
    }
  });

  elementos.selectEnvio?.addEventListener('change', actualizarResumenPedido);

  // filtros
  elementos.inputBusqueda?.addEventListener('input', (e) => {
    filtrosActuales.busqueda = (e.target.value ?? '').toLowerCase();
    aplicarFiltros();
  });
  elementos.selectCategoria?.addEventListener('change', (e) => {
    filtrosActuales.categoria = e.target.value;
    aplicarFiltros();
  });
  elementos.precioMinInput?.addEventListener('input', () => { updateRange(); aplicarFiltros(); });
  elementos.precioMaxInput?.addEventListener('input', () => { updateRange(); aplicarFiltros(); });
  elementos.aplicarRangoBtn?.addEventListener('click', () => { updateRange(); aplicarFiltros(); });

  // catálogo (delegación sobre el contenedor)
  elementos.galeriaProductos?.addEventListener('click', (e) => {
    const card = e.target.closest('.producto-card');
    if (!card) return;

    const btnDetalle = e.target.closest('.boton-detalles');
    const btnAgregar = e.target.closest('.boton-agregar');
    const btnAviso   = e.target.closest('.boton-aviso-stock');

    if (btnDetalle) {
      const id = Number(btnDetalle.dataset.id || card.dataset.id);
      if (Number.isFinite(id)) verDetalle(id);
      return;
    }
    if (btnAgregar) {
      const id = Number(card.dataset.id);
      if (Number.isFinite(id)) agregarAlCarrito(id, 1, btnAgregar);
      return;
    }
    if (btnAviso) {
      preguntarStock(btnAviso.dataset.nombre);
      return;
    }
  });

  // Respaldo: click directo sobre un botón de detalles que no esté dentro del contenedor
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.boton-detalles');
    if (btn) {
      const id = Number(btn.dataset.id || btn.closest('.producto-card')?.dataset.id);
      if (Number.isFinite(id)) verDetalle(id);
    }
  });

  // Cerrar modal de datos de envío (si existe el botón)
  document.getElementById('btn-cerrar-modal-envio')?.addEventListener('click', ()=>{
    elementos.modalDatosEnvio?.classList.remove('visible');
    if (elementos.modalDatosEnvio){
      elementos.modalDatosEnvio.style.display = 'none';
      elementos.modalDatosEnvio.hidden = true;
    }
  });
}

function inicializarMenuHamburguesa(){
  const {hamburguesa, menu} = elementos;
  if (!hamburguesa || !menu) return;

  hamburguesa.addEventListener('click', ()=>{
    const open = menu.classList.toggle('active');
    hamburguesa.setAttribute('aria-expanded', open);
    document.body.classList.toggle('no-scroll', open);
  });

  menu.querySelectorAll('a').forEach(a=>{
    a.addEventListener('click', ()=>{
      menu.classList.remove('active');
      hamburguesa.setAttribute('aria-expanded', false);
      document.body.classList.remove('no-scroll');
    });
  });
}

function inicializarFAQ(){
  document.querySelectorAll('.faq-toggle').forEach(t=>{
    t.addEventListener('click', ()=>{
      const exp = t.getAttribute('aria-expanded')==='true';
      t.setAttribute('aria-expanded', String(!exp));
      const content = t.nextElementSibling;
      if (content) content.hidden = exp;
    });
  });
}

// ---------------------------------
// INIT
// ---------------------------------
async function init(){
  inicializarMenuHamburguesa();
  inicializarFAQ();
  setupContactForm();
  inicializarEventos();
  updateRange();      // sincroniza sliders visualmente
  aplicarFiltros();   // primera render del catálogo
  actualizarResumenPedido();
}

// ---------------------------------
// ARRANQUE
// ---------------------------------
document.addEventListener('DOMContentLoaded', async ()=>{
  try{
    await signInAnonymously(auth);
    console.log('✅ Signed in anonymously to Firebase.');
    await cargarProductosDesdeFirebase();
  }catch(e){
    console.error('❌ Error de autenticación Firebase:', e);
    mostrarNotificacion('Error de autenticación con Firebase','error');
  }
  cargarCarrito();
  init();
});
