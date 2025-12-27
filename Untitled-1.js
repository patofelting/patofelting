// ===============================
// CONFIGURACIÓN GLOBAL
// ===============================
const CONFIG = {
  PRODUCTOS_POR_PAGINA: 6,
  LS_CARRITO_KEY: 'carrito',
  PLACEHOLDER_IMAGE: window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen',
  BACK_IN_STOCK_DUR_MS: 1000 * 60 * 60 * 24 * 5, // 5 días
};

// ===============================
// ESTADO DE LA APLICACIÓN
// ===============================
const AppState = {
  productos: [],
  carrito: [],
  paginaActual: 1,
  filtrosActuales: {
    precioMin: 0,
    precioMax: 3000,
    categoria: 'todos',
    busqueda: ''
  },
  busyButtons: new WeakSet(),
  inFlightAdds: new Set(),
  suprimirRealtime: 0,
  prevStockById: {},
  elementos: {},
  isInitialized: false
};

// ===============================
// UTILIDADES
// ===============================
const getElement = (id) => document.getElementById(id);

function mostrarNotificacion(mensaje, tipo = 'exito') {
  const noti = document.createElement('div');
  noti.className = `notificacion ${tipo}`;
  noti.textContent = mensaje;
  document.body.appendChild(noti);
  requestAnimationFrame(() => noti.classList.add('show'));
  setTimeout(() => {
    noti.classList.remove('show');
    setTimeout(() => noti.remove(), 250);
  }, 2500);
}

// ===============================
// GESTIÓN DE ELEMENTOS DOM
// ===============================
function inicializarElementos() {
  AppState.elementos = {
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
    aplicarRangoBtn: document.querySelector('.aplicar-rango-btn'),
    minPrice: getElement('min-price'),
    maxPrice: getElement('max-price'),
    range: document.querySelector('.range'),
    thumbMin: getElement('thumb-label-min'),
    thumbMax: getElement('thumb-label-max'),
    successMessage: getElement('successMessage'),
    errorMessage: getElement('errorMessage'),
    formContacto: getElement('formulario-contacto'),
    modalEnvio: getElement('modal-datos-envio'),
    btnCerrarModalEnvio: getElement('btn-cerrar-modal-envio'),
    formEnvio: getElement('form-envio'),
    selectEnvio: getElement('select-envio'),
    resumenProductos: getElement('resumen-productos'),
    resumenTotal: getElement('resumen-total'),
    grupoDireccion: getElement('grupo-direccion'),
    inputDireccion: getElement('input-direccion'),
    inputNombre: getElement('input-nombre'),
    inputApellido: getElement('input-apellido'),
    inputTelefono: getElement('input-telefono'),
    inputNotas: getElement('input-notas'),
  };
}

// ===============================
// CARRITO
// ===============================
function guardarCarrito() {
  try {
    localStorage.setItem(CONFIG.LS_CARRITO_KEY, JSON.stringify(AppState.carrito));
    actualizarContadorCarrito();
  } catch (e) {
    console.error('localStorage error:', e);
    mostrarNotificacion('Error al guardar el carrito', 'error');
  }
}

function cargarCarrito() {
  try {
    const stored = localStorage.getItem(CONFIG.LS_CARRITO_KEY);
    AppState.carrito = stored ? JSON.parse(stored) : [];
    actualizarContadorCarrito();
  } catch (e) {
    console.error('localStorage error:', e);
    AppState.carrito = [];
    mostrarNotificacion('Error al cargar el carrito', 'error');
  }
}

async function vaciarCarrito() {
  if (AppState.carrito.length === 0) {
    mostrarNotificacion('El carrito ya está vacío', 'info');
    return;
  }

  const { db } = getFirebaseInstances();
  if (!db) return;

  try {
    await Promise.all(
      AppState.carrito.map(item => 
        runTransaction(ref(db, `productos/${item.id}/stock`), s => (s || 0) + item.cantidad)
      )
    );
    
    AppState.suprimirRealtime += AppState.carrito.length;
    AppState.carrito = [];
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion('Carrito vaciado y stock restaurado', 'exito');
  } catch (error) {
    console.error('Error vaciando carrito:', error);
    mostrarNotificacion('Error al vaciar el carrito', 'error');
  }
}

function actualizarContadorCarrito() {
  const total = AppState.carrito.reduce((sum, i) => sum + i.cantidad, 0);
  const { contadorCarrito } = AppState.elementos;
  if (contadorCarrito) {
    contadorCarrito.textContent = total;
    contadorCarrito.classList.toggle('visible', total > 0);
  }
}

function toggleCarrito(forceState) {
  const { carritoPanel, carritoOverlay } = AppState.elementos;
  if (!carritoPanel || !carritoOverlay) return;

  const isOpen = typeof forceState === 'boolean' 
    ? forceState 
    : !carritoPanel.classList.contains('active');

  carritoPanel.classList.toggle('active', isOpen);
  carritoOverlay.classList.toggle('active', isOpen);
  document.body.classList.toggle('no-scroll', isOpen);

  if (isOpen) renderizarCarrito();
}

// ===============================
// PROCESAMIENTO DE PRODUCTOS
// ===============================
function procesarDatosProductos(data) {
  const now = Date.now();
  const { db } = getFirebaseInstances();

  AppState.productos = Object.entries(data || {}).map(([key, p]) => {
    if (!p || typeof p !== 'object') return null;

    const stockRaw = p.stock !== undefined ? p.stock : p.cantidad;
    const stock = Math.max(0, parseInt(String(stockRaw).replace(',', '.'), 10) || 0);
    
    const id = parseInt(p.id || key, 10);
    const nombre = (p.nombre || 'Sin nombre').trim();
    
    // Detección de transición 0 -> >0
    const stockAnterior = AppState.prevStockById[id] || 0;
    let restockedAt = p.restockedAt ? parseFloat(p.restockedAt) : null;
    
    if (stockAnterior === 0 && stock > 0 && !restockedAt) {
      console.log(`📦 Producto vuelve a stock: ${nombre} (${stock} unidades)`);
      restockedAt = now;
      
      // Guardar en Firebase (no bloqueante)
      if (db) {
        setTimeout(() => {
          update(ref(db, `productos/${id}`), { restockedAt: serverTimestamp() })
            .then(() => console.log(`✅ restockedAt guardado para ${id}`))
            .catch(e => console.error('Error guardando restockedAt:', e));
        }, 100);
      }
      
      // Notificar solo una vez
      if (!AppState.prevStockById[`${id}_notified`]) {
        setTimeout(() => {
          mostrarNotificacion(`🎉 "${nombre}" ¡de nuevo en stock!`, 'exito');
          AppState.prevStockById[`${id}_notified`] = true;
        }, 500);
      }
    }
    
    AppState.prevStockById[id] = stock;

    // Determinar si mostrar cinta "De nuevo en stock"
    const backInStock = !!(stock > 0 && restockedAt && (now - restockedAt) < CONFIG.BACK_IN_STOCK_DUR_MS);

    return {
      id,
      nombre,
      descripcion: (p.descripcion || '').trim(),
      precio: parseFloat(String(p.precio).replace(',', '.')) || 0,
      stock,
      imagenes: Array.isArray(p.imagenes) 
        ? p.imagenes.filter(img => typeof img === 'string' && img.trim())
        : [p.imagen || CONFIG.PLACEHOLDER_IMAGE],
      categoria: (p.categoria || 'otros').toLowerCase().trim(),
      estado: (p.estado || '').trim(),
      adicionales: ((p.adicionales || '').toString().trim() || '').replace(/^[-–]$/, ''),
      alto: parseFloat(p.alto) || null,
      ancho: parseFloat(p.ancho) || null,
      profundidad: parseFloat(p.profundidad) || null,
      backInStock,
      restockedAt
    };
  }).filter(Boolean).sort((a, b) => a.id - b.id);
}

// ===============================
// RENDERIZADO
// ===============================
function crearCardProducto(p) {
  const disp = Math.max(0, p.stock || 0);
  const agotado = disp <= 0;
  const imagen = (p.imagenes && p.imagenes[0]) || CONFIG.PLACEHOLDER_IMAGE;

  const ribbonHTML = (p.backInStock && disp > 0)
    ? `<span class="ribbon ribbon-back">¡De nuevo en stock!</span>`
    : '';

  return `
    <div class="producto-card ${agotado ? 'agotado' : ''}" data-id="${p.id}">
      ${ribbonHTML}
      <img src="${imagen}" alt="${p.nombre}" class="producto-img" loading="lazy" decoding="async">
      <h3 class="producto-nombre">${p.nombre}</h3>
      <p class="producto-precio">$U ${p.precio.toLocaleString('es-UY')}</p>
      <div class="producto-stock">
        ${agotado ? `<span class="texto-agotado">Agotado</span>` : `Stock disponible: ${disp}`}
      </div>
      <div class="card-acciones">
        <button class="boton-agregar${agotado ? ' agotado' : ''}" data-id="${p.id}" ${agotado ? 'disabled' : ''}>
          ${agotado ? '<i class="fas fa-times-circle"></i> Agotado' : '<i class="fas fa-cart-plus"></i> Agregar'}
        </button>
        ${agotado ? `<button class="boton-aviso-stock" data-nombre="${p.nombre.replace(/'/g, "\\'")}">📩 Avisame cuando haya stock</button>` : ''}
      </div>
      <button class="boton-detalles" data-id="${p.id}">🔍 Ver Detalle</button>
    </div>
  `;
}

function filtrarProductos() {
  const { precioMin, precioMax, categoria, busqueda } = AppState.filtrosActuales;
  const b = (busqueda || '').toLowerCase();

  return AppState.productos.filter(p => {
    if (p.precio < precioMin || p.precio > precioMax) return false;
    if (categoria !== 'todos' && p.categoria !== categoria) return false;
    if (b) {
      return p.nombre.toLowerCase().includes(b) || p.descripcion.toLowerCase().includes(b);
    }
    return true;
  });
}

function prewarmImages(lista) {
  lista.forEach(p => {
    (p.imagenes || []).slice(0, 2).forEach(src => {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
    });
  });
}

function renderizarProductos() {
  const { galeriaProductos } = AppState.elementos;
  if (!galeriaProductos) return;

  const filtrados = filtrarProductos();
  const inicio = (AppState.paginaActual - 1) * CONFIG.PRODUCTOS_POR_PAGINA;
  const paginados = filtrados.slice(inicio, inicio + CONFIG.PRODUCTOS_POR_PAGINA);

  galeriaProductos.innerHTML = paginados.length === 0
    ? '<p class="sin-productos">No se encontraron productos.</p>'
    : paginados.map(crearCardProducto).join('');

  prewarmImages(paginados);
  renderizarPaginacion(filtrados.length);
}

function renderizarPaginacion(total) {
  const { paginacion } = AppState.elementos;
  if (!paginacion) return;

  const pages = Math.ceil(total / CONFIG.PRODUCTOS_POR_PAGINA);
  if (pages <= 1) {
    paginacion.innerHTML = '';
    return;
  }

  paginacion.innerHTML = Array.from({ length: pages }, (_, i) => `
    <button class="${i + 1 === AppState.paginaActual ? 'active' : ''}" data-page="${i + 1}">
      ${i + 1}
    </button>
  `).join('');
}

// ===============================
// MODAL DE PRODUCTO
// ===============================
function ensureModalStructure() {
  if (!getElement('producto-modal')) {
    const modal = document.createElement('div');
    modal.id = 'producto-modal';
    modal.className = 'modal-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `<div class="modal-contenido-producto" id="modal-contenido"></div>`;
    document.body.appendChild(modal);
  }
  AppState.elementos.productoModal = getElement('producto-modal');
  AppState.elementos.modalContenido = getElement('modal-contenido');
}

function mostrarModalProducto(producto) {
  ensureModalStructure();
  const { productoModal, modalContenido } = AppState.elementos;
  if (!productoModal || !modalContenido) return;

  let currentIndex = 0;

  const renderModal = () => {
    const disp = Math.max(0, producto.stock || 0);
    const agotado = disp <= 0;
    
    const ribbonModalHTML = (producto.backInStock && disp > 0)
      ? `<div class="ribbon-modal">¡De nuevo en stock!</div>`
      : '';

    modalContenido.innerHTML = `
      <button class="cerrar-modal" aria-label="Cerrar modal">&times;</button>
      ${ribbonModalHTML}
      <div class="modal-flex">
        <div class="modal-carrusel">
          <img id="modal-imagen" src="${producto.imagenes[currentIndex] || CONFIG.PLACEHOLDER_IMAGE}" class="modal-img" alt="${producto.nombre}">
          <div class="modal-thumbnails">
            ${producto.imagenes.map((img, i) => `
              <img src="${img}" class="thumbnail ${i === currentIndex ? 'active' : ''}" data-index="${i}" alt="Miniatura ${i + 1}">
            `).join('')}
          </div>
        </div>
        <div class="modal-info">
          <h1 class="modal-nombre">${producto.nombre}</h1>
          <p class="modal-precio">$U ${producto.precio.toLocaleString('es-UY')}</p>

          <div class="modal-descripcion">
            ${producto.descripcion ? `<p>${producto.descripcion}</p>` : ''}
            ${producto.adicionales ? `<p><b>Adicionales:</b> ${producto.adicionales}</p>` : ''}
            ${(producto.alto || producto.ancho || producto.profundidad)
              ? `<p><b>Medidas:</b> ${[producto.alto, producto.ancho, producto.profundidad].filter(Boolean).join(' x ')} cm</p>`
              : ''}
          </div>

          <p class="modal-stock ${agotado ? 'agotado' : 'disponible'}">
            ${agotado ? 'AGOTADO' : `Disponible: ${disp}`}
            ${producto.backInStock && !agotado ? ' <span class="new-stock-badge">(¡Recién llegado!)</span>' : ''}
          </p>

          <div class="modal-acciones">
            <input type="number" value="1" min="1" max="${disp}" class="cantidad-modal-input" ${agotado ? 'disabled' : ''}>
            <button class="boton-agregar-modal ${agotado ? 'agotado' : ''}" data-id="${producto.id}" ${agotado ? 'disabled' : ''}>
              ${agotado ? 'Agotado' : 'Agregar al carrito'}
            </button>
          </div>
        </div>
      </div>
    `;

    // Event listeners del modal
    modalContenido.querySelector('.cerrar-modal')?.addEventListener('click', cerrarModal);
    
    // Carrusel de imágenes
    const imgGrande = modalContenido.querySelector('#modal-imagen');
    if (imgGrande && producto.imagenes.length > 1) {
      imgGrande.addEventListener('click', (e) => {
        e.stopPropagation();
        currentIndex = (currentIndex + 1) % producto.imagenes.length;
        renderModal();
      });
    }

    modalContenido.querySelectorAll('.thumbnail').forEach(thumb => {
      thumb.addEventListener('click', (e) => {
        e.stopPropagation();
        const index = parseInt(e.currentTarget.dataset.index);
        if (!isNaN(index)) {
          currentIndex = index;
          renderModal();
        }
      });
    });

    // Botón agregar al carrito
    const btnAgregarModal = modalContenido.querySelector('.boton-agregar-modal');
    if (btnAgregarModal) {
      btnAgregarModal.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(e.currentTarget.dataset.id);
        const cantidadInput = modalContenido.querySelector('.cantidad-modal-input');
        const qty = cantidadInput ? parseInt(cantidadInput.value) || 1 : 1;
        agregarAlCarrito(id, qty, e.currentTarget);
      });
    }
  };

  renderModal();
  productoModal.classList.add('visible');
  productoModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');
}

function cerrarModal() {
  const { productoModal } = AppState.elementos;
  if (productoModal) {
    productoModal.classList.remove('visible');
    productoModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
  }
}

// ===============================
// AGREGAR AL CARRITO
// ===============================
async function agregarAlCarrito(id, cantidad = 1, boton = null) {
  if (AppState.inFlightAdds.has(id)) return;
  AppState.inFlightAdds.add(id);

  const { db } = getFirebaseInstances();
  if (!db) {
    AppState.inFlightAdds.delete(id);
    return mostrarNotificacion('Error de conexión con la base de datos', 'error');
  }

  if (!Number.isFinite(id) || id <= 0) {
    AppState.inFlightAdds.delete(id);
    return mostrarNotificacion('ID de producto inválido', 'error');
  }

  const producto = AppState.productos.find(p => p.id === id);
  if (!producto) {
    AppState.inFlightAdds.delete(id);
    return mostrarNotificacion('Producto no encontrado', 'error');
  }

  const cantidadAgregar = Math.max(1, parseInt(cantidad));
  if (!Number.isFinite(cantidadAgregar)) {
    AppState.inFlightAdds.delete(id);
    return mostrarNotificacion('Cantidad inválida', 'error');
  }

  // Bloquear botón
  if (boton) {
    if (AppState.busyButtons.has(boton)) {
      AppState.inFlightAdds.delete(id);
      return;
    }
    AppState.busyButtons.add(boton);
    boton.disabled = true;
    boton._oldHTML = boton.innerHTML;
    boton.innerHTML = 'Agregando <span class="spinner"></span>';
  }

  // Verificar stock
  if ((producto.stock || 0) < cantidadAgregar) {
    if (boton) {
      boton.disabled = false;
      boton.innerHTML = boton._oldHTML;
      AppState.busyButtons.delete(boton);
    }
    AppState.inFlightAdds.delete(id);
    return mostrarNotificacion('Stock insuficiente', 'error');
  }

  try {
    const productRef = ref(db, `productos/${id}/stock`);
    const { committed } = await runTransaction(productRef, (stock) => {
      stock = stock || 0;
      if (stock < cantidadAgregar) return;
      return stock - cantidadAgregar;
    });

    if (!committed) throw new Error('Stock insuficiente o cambiado por otro usuario');

    AppState.suprimirRealtime++;
    producto.stock = Math.max(0, (producto.stock || 0) - cantidadAgregar);

    // Actualizar carrito
    const enCarrito = AppState.carrito.find(item => item.id === id);
    if (enCarrito) {
      enCarrito.cantidad += cantidadAgregar;
    } else {
      AppState.carrito.push({
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        cantidad: cantidadAgregar,
        imagen: (producto.imagenes && producto.imagenes[0]) || CONFIG.PLACEHOLDER_IMAGE
      });
    }

    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion('Producto agregado al carrito', 'exito');
  } catch (error) {
    console.error('Error agregando al carrito:', error);
    mostrarNotificacion('Error al agregar al carrito', 'error');
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.innerHTML = boton._oldHTML;
      AppState.busyButtons.delete(boton);
    }
    AppState.inFlightAdds.delete(id);
  }
}

// ===============================
// RENDERIZADO DE CARRITO
// ===============================
function renderizarCarrito() {
  const { listaCarrito, totalCarrito } = AppState.elementos;
  if (!listaCarrito || !totalCarrito) return;

  if (AppState.carrito.length === 0) {
    listaCarrito.innerHTML = '<p class="carrito-vacio">Tu carrito está vacío</p>';
    totalCarrito.textContent = 'Total: $U 0';
    return;
  }

  listaCarrito.innerHTML = AppState.carrito.map(item => {
    const producto = AppState.productos.find(p => p.id === item.id) || { stock: 0 };
    const disponibles = Math.max(0, producto.stock || 0);
    return `
      <li class="carrito-item" data-id="${item.id}">
        <img src="${item.imagen}" class="carrito-item-img" alt="${item.nombre}" loading="lazy">
        <div class="carrito-item-info">
          <span class="carrito-item-nombre">${item.nombre}</span>
          <span class="carrito-item-precio">$U ${item.precio.toLocaleString('es-UY')} c/u</span>
          <div class="carrito-item-controls">
            <button class="disminuir-cantidad" data-id="${item.id}" ${item.cantidad <= 1 ? 'disabled' : ''}>-</button>
            <span class="carrito-item-cantidad">${item.cantidad}</span>
            <button class="aumentar-cantidad" data-id="${item.id}" ${disponibles <= 0 ? 'disabled' : ''}>+</button>
          </div>
          <span class="carrito-item-subtotal">Subtotal: $U ${(item.precio * item.cantidad).toLocaleString('es-UY')}</span>
          <button class="eliminar-item" data-id="${item.id}">🗑️</button>
        </div>
      </li>
    `;
  }).join('');

  const total = AppState.carrito.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  totalCarrito.textContent = `Total: $U ${total.toLocaleString('es-UY')}`;

  // Event listeners de controles del carrito
  listaCarrito.querySelectorAll('.disminuir-cantidad').forEach(btn => {
    btn.onclick = (e) => modificarCantidad(parseInt(e.currentTarget.dataset.id), -1);
  });

  listaCarrito.querySelectorAll('.aumentar-cantidad').forEach(btn => {
    btn.onclick = (e) => modificarCantidad(parseInt(e.currentTarget.dataset.id), 1);
  });

  listaCarrito.querySelectorAll('.eliminar-item').forEach(btn => {
    btn.onclick = (e) => eliminarDelCarrito(parseInt(e.currentTarget.dataset.id));
  });
}

async function modificarCantidad(id, delta) {
  const { db } = getFirebaseInstances();
  if (!db) return;

  const item = AppState.carrito.find(i => i.id === id);
  const producto = AppState.productos.find(p => p.id === id);
  
  if (!item || !producto) return;

  const nuevaCantidad = item.cantidad + delta;
  if (nuevaCantidad < 1) return;

  const stockDisponible = producto.stock + item.cantidad; // Stock total disponible
  if (delta > 0 && stockDisponible < nuevaCantidad) {
    return mostrarNotificacion('Stock insuficiente', 'error');
  }

  try {
    await runTransaction(ref(db, `productos/${id}/stock`), s => (s || 0) - delta);
    AppState.suprimirRealtime++;
    
    producto.stock = Math.max(0, producto.stock - delta);
    item.cantidad = nuevaCantidad;
    
    if (item.cantidad === 0) {
      AppState.carrito = AppState.carrito.filter(i => i.id !== id);
    }
    
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion(`Cantidad ${delta > 0 ? 'aumentada' : 'reducida'}`, 'info');
  } catch (error) {
    console.error('Error modificando cantidad:', error);
    mostrarNotificacion('Error al modificar cantidad', 'error');
  }
}

async function eliminarDelCarrito(id) {
  const { db } = getFirebaseInstances();
  if (!db) return;

  const item = AppState.carrito.find(i => i.id === id);
  if (!item) return;

  try {
    await runTransaction(ref(db, `productos/${id}/stock`), s => (s || 0) + item.cantidad);
    AppState.suprimirRealtime++;
    
    const producto = AppState.productos.find(p => p.id === id);
    if (producto) producto.stock += item.cantidad;
    
    AppState.carrito = AppState.carrito.filter(i => i.id !== id);
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion('Producto eliminado del carrito', 'info');
  } catch (error) {
    console.error('Error eliminando del carrito:', error);
    mostrarNotificacion('Error al eliminar producto', 'error');
  }
}

// ===============================
// FILTROS Y UI
// ===============================
function actualizarCategorias() {
  const { selectCategoria } = AppState.elementos;
  if (!selectCategoria) return;

  const cats = ['todos', ...new Set(AppState.productos.map(p => p.categoria).filter(c => c).sort())];
  selectCategoria.innerHTML = cats.map(cat => 
    `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`
  ).join('');
  
  if (AppState.filtrosActuales.categoria && cats.includes(AppState.filtrosActuales.categoria)) {
    selectCategoria.value = AppState.filtrosActuales.categoria;
  }
}

function aplicarFiltros() {
  AppState.paginaActual = 1;
  renderizarProductos();
}

function resetearFiltros() {
  AppState.filtrosActuales = { precioMin: 0, precioMax: 3000, categoria: 'todos', busqueda: '' };
  const { inputBusqueda, selectCategoria, precioMinInput, precioMaxInput } = AppState.elementos;
  
  if (inputBusqueda) inputBusqueda.value = '';
  if (selectCategoria) selectCategoria.value = 'todos';
  if (precioMinInput) precioMinInput.value = '0';
  if (precioMaxInput) precioMaxInput.value = '3000';
  
  updateRange();
  aplicarFiltros();
}

// ===============================
// FIREBASE - INSTANCIAS
// ===============================
function getFirebaseInstances() {
  if (!window.firebaseApp) {
    console.error('Firebase no inicializado');
    return { db: null, auth: null };
  }
  return {
    db: window.firebaseDatabase || getDatabase(window.firebaseApp),
    auth: getAuth(window.firebaseApp)
  };
}

// ===============================
// CARGAR PRODUCTOS
// ===============================
async function cargarProductosDesdeFirebase() {
  const { db } = getFirebaseInstances();
  if (!db) {
    mostrarNotificacion('Error de conexión con Firebase', 'error');
    return;
  }

  const productosRef = ref(db, 'productos');

  try {
    const { productLoader, galeriaProductos } = AppState.elementos;
    if (productLoader) {
      productLoader.hidden = false;
      productLoader.style.display = 'flex';
    }

    const snapshot = await get(productosRef);
    if (!snapshot.exists()) {
      if (galeriaProductos) {
        galeriaProductos.innerHTML = '<p class="sin-productos">No hay productos disponibles.</p>';
      }
    } else {
      procesarDatosProductos(snapshot.val());
      renderizarProductos();
      actualizarCategorias();
      actualizarUI();
    }

    // Inicializar listener solo una vez
    if (!cargarProductosDesdeFirebase._listening) {
      onValue(productosRef, (snap) => {
        if (AppState.suprimirRealtime > 0) {
          AppState.suprimirRealtime--;
          return;
        }
        if (!snap.exists()) {
          AppState.productos = [];
        } else {
          procesarDatosProductos(snap.val());
        }
        renderizarProductos();
        actualizarCategorias();
        actualizarUI();
      }, (error) => {
        console.error('Listener productos error:', error);
        mostrarNotificacion('Error al recibir actualizaciones', 'error');
      });
      cargarProductosDesdeFirebase._listening = true;
    }
  } catch (error) {
    console.error('Error cargando productos:', error);
    mostrarNotificacion('Error al cargar productos', 'error');
    const { galeriaProductos } = AppState.elementos;
    if (galeriaProductos) {
      galeriaProductos.innerHTML = '<p class="error-carga">No se pudieron cargar los productos.</p>';
    }
  } finally {
    const { productLoader } = AppState.elementos;
    if (productLoader) {
      setTimeout(() => {
        productLoader.style.display = 'none';
        productLoader.hidden = true;
      }, 500);
    }
  }
}

// ===============================
// SLIDERS DE PRECIO
// ===============================
function updateRange() {
  const { precioMinInput, precioMaxInput, minPrice, maxPrice, range, thumbMin, thumbMax } = AppState.elementos;
  if (!precioMinInput || !precioMaxInput) return;

  let minVal = parseInt(precioMinInput.value) || 0;
  let maxVal = parseInt(precioMaxInput.value) || 3000;

  if (minVal > maxVal) {
    [minVal, maxVal] = [maxVal, minVal];
    precioMinInput.value = minVal;
    precioMaxInput.value = maxVal;
  }

  const sliderMax = parseInt(precioMinInput.max) || 3000;

  if (range) {
    range.style.left = (minVal / sliderMax * 100) + '%';
    range.style.width = ((maxVal - minVal) / sliderMax * 100) + '%';
  }

  if (minPrice) minPrice.textContent = `$U${minVal}`;
  if (maxPrice) maxPrice.textContent = `$U${maxVal}`;
  if (thumbMin) thumbMin.textContent = `$U${minVal}`;
  if (thumbMax) thumbMax.textContent = `$U${maxVal}`;

  const sliderWidth = precioMinInput.offsetWidth || 300;
  const minPos = (minVal / sliderMax) * sliderWidth;
  const maxPos = (maxVal / sliderMax) * sliderWidth;

  if (thumbMin) thumbMin.style.left = `${minPos}px`;
  if (thumbMax) thumbMax.style.left = `${maxPos}px`;

  AppState.filtrosActuales.precioMin = minVal;
  AppState.filtrosActuales.precioMax = maxVal;
}

// ===============================
// EVENTOS PRINCIPALES
// ===============================
function initEventos() {
  // Inicializar elementos si no están listos
  if (!AppState.isInitialized) {
    inicializarElementos();
  }

  const {
    carritoBtnMain, carritoOverlay, btnCerrarCarrito, inputBusqueda, selectCategoria,
    precioMinInput, precioMaxInput, aplicarRangoBtn, btnVaciarCarrito, btnFinalizarCompra,
    galeriaProductos, hamburguesa, menu, btnEntendidoAviso, btnCancelarAviso,
    selectEnvio, btnCerrarModalEnvio, formEnvio
  } = AppState.elementos;

  // Carrito
  carritoBtnMain?.addEventListener('click', () => toggleCarrito(true));
  carritoOverlay?.addEventListener('click', () => toggleCarrito(false));
  btnCerrarCarrito?.addEventListener('click', () => toggleCarrito(false));

  // Filtros
  if (inputBusqueda) {
    inputBusqueda.addEventListener('input', (e) => {
      AppState.filtrosActuales.busqueda = e.target.value.toLowerCase().trim();
      aplicarFiltros();
    });
  }

  selectCategoria?.addEventListener('change', (e) => {
    AppState.filtrosActuales.categoria = e.target.value.trim();
    aplicarFiltros();
  });

  precioMinInput?.addEventListener('input', updateRange);
  precioMaxInput?.addEventListener('input', updateRange);
  aplicarRangoBtn?.addEventListener('click', aplicarFiltros);

  // Carrito actions
  btnVaciarCarrito?.addEventListener('click', vaciarCarrito);
  btnFinalizarCompra?.addEventListener('click', iniciarCompra);

  // Delegación de eventos en galería (HANDLER ÚNICO)
  if (galeriaProductos) {
    // Remover handler previo si existe
    if (galeriaProductos._handler) {
      galeriaProductos.removeEventListener('click', galeriaProductos._handler);
    }

    const handler = (e) => {
      const boton = e.target.closest('button');
      if (!boton) return;

      const card = boton.closest('.producto-card');
      if (!card) return;

      const id = parseInt(card.dataset.id);
      if (isNaN(id)) return;

      const producto = AppState.productos.find(p => p.id === id);
      if (!producto) return;

      e.preventDefault();
      e.stopPropagation();

      if (boton.classList.contains('boton-detalles')) {
        mostrarModalProducto(producto);
      } else if (boton.classList.contains('boton-agregar')) {
        agregarAlCarrito(id, 1, boton);
      } else if (boton.classList.contains('boton-aviso-stock')) {
        preguntarStock(producto.nombre);
      }
    };

    galeriaProductos.addEventListener('click', handler);
    galeriaProductos._handler = handler;
  }

  // Menú hamburguesa
  hamburguesa?.addEventListener('click', () => {
    const expanded = menu?.classList.toggle('active') || false;
    hamburguesa.setAttribute('aria-expanded', expanded);
    document.body.classList.toggle('no-scroll', expanded);
  });

  menu?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      menu.classList.remove('active');
      hamburguesa?.setAttribute('aria-expanded', false);
      document.body.classList.remove('no-scroll');
    });
  });

  // Modal de aviso pre-compra
  btnEntendidoAviso?.addEventListener('click', () => {
    const { avisoPreCompraModal, modalEnvio } = AppState.elementos;
    if (avisoPreCompraModal) {
      avisoPreCompraModal.style.display = 'none';
      avisoPreCompraModal.setAttribute('aria-hidden', 'true');
    }
    if (modalEnvio) {
      modalEnvio.style.display = 'flex';
      modalEnvio.classList.add('visible');
      modalEnvio.removeAttribute('hidden');
      actualizarResumenPedido();
    }
  });

  btnCancelarAviso?.addEventListener('click', () => {
    const { avisoPreCompraModal } = AppState.elementos;
    if (avisoPreCompraModal) {
      avisoPreCompraModal.style.display = 'none';
      avisoPreCompraModal.setAttribute('aria-hidden', 'true');
    }
  });

  // Modal de envío
  selectEnvio?.addEventListener('change', actualizarResumenPedido);
  btnCerrarModalEnvio?.addEventListener('click', cerrarModalEnvio);
  formEnvio?.addEventListener('submit', manejarSubmitEnvio);

  // Paginación (delegación)
  paginacion?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-page]');
    if (btn) {
      e.preventDefault();
      const page = parseInt(btn.dataset.page);
      if (!isNaN(page) && page !== AppState.paginaActual) {
        cambiarPagina(page);
      }
    }
  });

  // FAQ
  document.querySelectorAll('.faq-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', !expanded);
      const content = toggle.nextElementSibling;
      if (content) content.hidden = expanded;
    });
  });

  // Contacto
  setupContactForm();

  AppState.isInitialized = true;
}

// ===============================
// COMPRA Y ENVÍO
// ===============================
function iniciarCompra() {
  if (AppState.carrito.length === 0) {
    mostrarNotificacion('El carrito está vacío', 'error');
    return;
  }
  const { avisoPreCompraModal } = AppState.elementos;
  if (avisoPreCompraModal) {
    avisoPreCompraModal.style.display = 'flex';
    avisoPreCompraModal.setAttribute('aria-hidden', 'false');
  }
}

function cerrarModalEnvio() {
  const { modalEnvio } = AppState.elementos;
  if (modalEnvio) {
    modalEnvio.classList.remove('visible');
    setTimeout(() => {
      modalEnvio.style.display = 'none';
    }, 300);
  }
}

function actualizarResumenPedido() {
  const { resumenProductos, resumenTotal, selectEnvio, grupoDireccion, inputDireccion } = AppState.elementos;
  if (!resumenProductos || !resumenTotal) return;

  if (AppState.carrito.length === 0) {
    resumenProductos.innerHTML = '<p class="carrito-vacio">No hay productos</p>';
    resumenTotal.textContent = '$U 0';
    return;
  }

  let html = '';
  let subtotal = 0;
  AppState.carrito.forEach(item => {
    const itemTotal = item.precio * item.cantidad;
    subtotal += itemTotal;
    html += `
      <div class="resumen-item">
        <span>${item.nombre} x${item.cantidad}</span>
        <span>$U ${itemTotal.toLocaleString('es-UY')}</span>
      </div>
    `;
  });

  const metodo = selectEnvio?.value || 'retiro';
  const costoEnvio = metodo === 'montevideo' ? 200 : metodo === 'interior' ? 250 : 0;

  html += `
    <div class="resumen-item resumen-subtotal">
      <span>Subtotal:</span>
      <span>$U ${subtotal.toLocaleString('es-UY')}</span>
    </div>
    ${metodo !== 'retiro' ? `
      <div class="resumen-item resumen-envio">
        <span>Envío (${metodo === 'montevideo' ? 'Montevideo' : 'Interior'}):</span>
        <span>$U ${costoEnvio.toLocaleString('es-UY')}</span>
      </div>` : ''}
  `;

  resumenProductos.innerHTML = html;
  const total = subtotal + costoEnvio;
  resumenTotal.textContent = `$U ${total.toLocaleString('es-UY')}`;

  if (grupoDireccion && inputDireccion) {
    grupoDireccion.style.display = metodo === 'retiro' ? 'none' : 'flex';
    inputDireccion.required = metodo !== 'retiro';
  }
}

let enviandoPedido = false;

function manejarSubmitEnvio(e) {
  e.preventDefault();
  if (enviandoPedido) return;
  enviandoPedido = true;

  const { inputNombre, inputApellido, inputTelefono, selectEnvio, inputDireccion, inputNotas } = AppState.elementos;
  
  const nombre = inputNombre?.value.trim() || '';
  const apellido = inputApellido?.value.trim() || '';
  const telefono = inputTelefono?.value.trim() || '';
  const envio = selectEnvio?.value || 'retiro';
  const direccion = envio !== 'retiro' ? (inputDireccion?.value.trim() || '') : '';
  const notas = inputNotas?.value.trim() || '';

  if (!nombre || !apellido || !telefono || (envio !== 'retiro' && !direccion)) {
    mostrarNotificacion('Complete todos los campos obligatorios', 'error');
    enviandoPedido = false;
    return;
  }

  // Validar stock
  for (const item of AppState.carrito) {
    const prod = AppState.productos.find(p => p.id === item.id);
    if (!prod || prod.stock < 0) {
      mostrarNotificacion(`Stock insuficiente para "${item.nombre}"`, 'error');
      enviandoPedido = false;
      return;
    }
  }

  // Construir mensaje WhatsApp
  let mensaje = `¡Hola Patofelting! Quiero hacer un pedido:\n\n*📋 Detalles del pedido:*\n`;
  AppState.carrito.forEach(item => {
    mensaje += `➤ ${item.nombre} x${item.cantidad} - $U ${(item.precio * item.cantidad).toLocaleString('es-UY')}\n`;
  });

  const subtotal = AppState.carrito.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  const costoEnvio = envio === 'montevideo' ? 200 : envio === 'interior' ? 250 : 0;
  const total = subtotal + costoEnvio;

  mensaje += `\n*💰 Total:*\nSubtotal: $U ${subtotal.toLocaleString('es-UY')}\n`;
  mensaje += `Envío: $U ${costoEnvio.toLocaleString('es-UY')}\n`;
  mensaje += `*TOTAL A PAGAR: $U ${total.toLocaleString('es-UY')}*\n\n`;
  mensaje += `*👤 Datos del cliente:*\n`;
  mensaje += `Nombre: ${nombre} ${apellido}\n`;
  mensaje += `Teléfono: ${telefono}\n`;
  mensaje += `Método de envío: ${envio === 'montevideo' ? 'Envío Montevideo ($200)' : envio === 'interior' ? 'Envío Interior ($250)' : 'Retiro en local (Gratis)'}\n`;
  if (envio !== 'retiro') mensaje += `Dirección: ${direccion}\n`;
  if (notas) mensaje += `\n*📝 Notas adicionales:*\n${notas}`;

  // Abrir WhatsApp
  const txt = encodeURIComponent(mensaje);
  const numero = '59893566283';
  const url = `https://wa.me/${numero}?text=${txt}`;
  
  // Intentar abrir en app móvil o web
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile) {
    window.location.href = url;
  } else {
    window.open(url, '_blank');
  }

  // Limpiar carrito
  setTimeout(() => {
    AppState.carrito = [];
    guardarCarrito();
    actualizarUI();
    cerrarModalEnvio();
    mostrarNotificacion('Pedido listo para enviar por WhatsApp', 'exito');
    const { formEnvio } = AppState.elementos;
    if (formEnvio) formEnvio.reset();
    enviandoPedido = false;
  }, 1500);
}

// ===============================
// OTRAS FUNCIONES
// ===============================
function preguntarStock(nombre) {
  const asunto = encodeURIComponent(`Consulta sobre disponibilidad de "${nombre}"`);
  const cuerpo = encodeURIComponent(`Hola Patofelting,\n\nMe gustaría saber cuándo estará disponible el producto: ${nombre}\n\nSaludos,\n[Tu nombre]`);
  window.location.href = `mailto:patofelting@gmail.com?subject=${asunto}&body=${cuerpo}`;
}

function setupContactForm() {
  const { formContacto } = AppState.elementos;
  if (!formContacto || !window.emailjs) return;

  try {
    window.emailjs.init("o4IxJz0Zz-LQ8jYKG");
    formContacto.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const nombre = getElement('nombre')?.value || '';
      const email = getElement('email')?.value || '';
      const mensaje = getElement('mensaje')?.value || '';

      try {
        await window.emailjs.send('service_89by24g', 'template_8mn7hdp', {
          from_name: nombre,
          from_email: email,
          message: mensaje
        });
        
        const { successMessage } = AppState.elementos;
        if (successMessage) {
          successMessage.classList.remove('hidden');
          formContacto.reset();
          setTimeout(() => successMessage.classList.add('hidden'), 3000);
        }
      } catch (error) {
        console.error('Error enviando email:', error);
        const { errorMessage } = AppState.elementos;
        if (errorMessage) {
          errorMessage.textContent = 'Error al enviar el mensaje. Intenta de nuevo.';
          errorMessage.classList.remove('hidden');
          setTimeout(() => errorMessage.classList.add('hidden'), 3000);
        }
      }
    });
  } catch (error) {
    console.error('Error inicializando emailjs:', error);
  }
}

function actualizarUI() {
  renderizarCarrito();
  actualizarContadorCarrito();
}

window.cambiarPagina = function(page) {
  AppState.paginaActual = page;
  renderizarProductos();
  const { galeriaProductos } = AppState.elementos;
  if (galeriaProductos) {
    const targetTop = galeriaProductos.offsetTop - 100;
    if (window.scrollY + 10 < targetTop) {
      window.scrollTo({ top: targetTop, behavior: 'smooth' });
    }
  }
};

window.cerrarModal = cerrarModal;
window.agregarAlCarrito = agregarAlCarrito;
window.preguntarStock = preguntarStock;

// ===============================
// INICIALIZACIÓN PRINCIPAL
// ===============================
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Inicializar elementos DOM
  inicializarElementos();
  
  // 2. Inyectar CSS de cinta
  if (!document.getElementById('pf-back-in-stock-ribbon-css')) {
    const style = document.createElement('style');
    style.id = 'pf-back-in-stock-ribbon-css';
    style.textContent = `
      .producto-card .ribbon {
        position: absolute;
        top: 14px;
        left: -44px;
        transform: rotate(-45deg);
        background: linear-gradient(135deg, #ff7eb3, #ff758c);
        color: #fff;
        padding: 8px 48px;
        font-weight: 800;
        font-size: 0.85rem;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        box-shadow: 0 6px 12px rgba(0,0,0,0.15);
        border-radius: 4px;
        text-shadow: 0 1px 0 rgba(0,0,0,0.25);
        z-index: 5;
        pointer-events: none;
        animation: ribbonPulse 2s infinite;
      }
      .producto-card .ribbon.ribbon-back {
        background: linear-gradient(135deg, #7ed957, #45a13f);
        animation: ribbonPulse 3s infinite;
      }
      .ribbon-modal {
        position: absolute;
        top: 15px;
        right: 15px;
        background: linear-gradient(135deg, #7ed957, #45a13f);
        color: white;
        padding: 8px 15px;
        border-radius: 20px;
        font-weight: bold;
        font-size: 0.9rem;
        z-index: 10;
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
      }
      .new-stock-badge {
        background: #7ed957;
        color: white;
        padding: 3px 8px;
        border-radius: 10px;
        font-size: 0.8rem;
        margin-left: 5px;
      }
      @keyframes ribbonPulse {
        0% { box-shadow: 0 6px 12px rgba(126, 217, 87, 0.4); }
        50% { box-shadow: 0 6px 20px rgba(126, 217, 87, 0.7); }
        100% { box-shadow: 0 6px 12px rgba(126, 217, 87, 0.4); }
      }
      @media (max-width: 600px) {
        .producto-card .ribbon { 
          top: 10px; 
          left: -38px; 
          padding: 6px 40px; 
          font-size: 0.78rem; 
          border-radius: 3px; 
        }
      }
    `;
    document.head.appendChild(style);
  }

  // 3. Cargar carrito desde localStorage
  cargarCarrito();

  // 4. Autenticar Firebase y cargar productos
  try {
    const { auth } = getFirebaseInstances();
    if (auth) {
      await signInAnonymously(auth);
      console.log('✅ Firebase: Autenticación anónima exitosa');
    }
    cargarProductosDesdeFirebase();
  } catch (error) {
    console.error('❌ Firebase auth error:', error);
    let msg = 'Error de autenticación';
    if (error.code === 'auth/configuration-not-found') msg = 'Auth no habilitada';
    else if (error.code === 'auth/network-request-failed') msg = 'Error de red';
    mostrarNotificacion(msg, 'error');
  }

  // 5. Inicializar UI y eventos
  ensureModalStructure();
  initEventos();
  updateRange();
  actualizarUI();
});
