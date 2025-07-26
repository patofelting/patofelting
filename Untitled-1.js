// ===============================
// CONFIGURACIÓN GLOBAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const CSV_URL = window.SHEET_CSV_URL;
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';
const STOCK_API_URL = 'https://script.google.com/macros/s/AKfycbwMFWe0EU_g3Xu9hpNnIww9SVtGxU7ZMJj2dcCL0gbNe6Sj46dlfT3w8D5Fvb2cebKwKw/exec';
const WHATSAPP_NUMBER = '59893566283';
const COSTO_ENVIO_MONTEVIDEO = 150;
const COSTO_ENVIO_INTERIOR = 300;

// ===============================
// ESTADO GLOBAL
// ===============================
const estado = {
  productos: [],
  carrito: [],
  paginaActual: 1,
  filtros: {
    precioMin: null,
    precioMax: null,
    categoria: 'todos',
    busqueda: ''
  }
};

// ===============================
// REFERENCIAS AL DOM
// ===============================
const elementos = {
  // Galería y productos
  galeriaProductos: document.getElementById('galeria-productos'),
  paginacion: document.getElementById('paginacion'),
  productoModal: document.getElementById('producto-modal'),
  modalContenido: document.getElementById('modal-contenido'),
  productLoader: document.getElementById('product-loader'),
  
  // Carrito
  listaCarrito: document.getElementById('lista-carrito'),
  totalCarrito: document.getElementById('total'),
  contadorCarrito: document.getElementById('contador-carrito'),
  carritoBtnMain: document.getElementById('carrito-btn-main'),
  carritoPanel: document.getElementById('carrito-panel'),
  carritoOverlay: document.querySelector('.carrito-overlay'),
  btnVaciarCarrito: document.querySelector('.boton-vaciar-carrito'),
  btnFinalizarCompra: document.querySelector('.boton-finalizar-compra'),
  btnCerrarCarrito: document.querySelector('.cerrar-carrito'),
  
  // Filtros
  inputBusqueda: document.getElementById('input-busqueda'),
  selectCategoria: document.getElementById('filtro-categoria'),
  precioMinInput: document.getElementById('precio-min'),
  precioMaxInput: document.getElementById('precio-max'),
  botonResetearFiltros: document.getElementById('boton-resetear-filtros'),
  
  // Modales
  avisoPreCompraModal: document.getElementById('aviso-pre-compra-modal'),
  btnEntendidoAviso: document.getElementById('btn-entendido-aviso'),
  btnCancelarAviso: document.getElementById('btn-cancelar-aviso'),
  modalDatosEnvio: document.getElementById('modal-datos-envio'),
  formEnvio: document.getElementById('form-envio'),
  resumenProductos: document.getElementById('resumen-productos'),
  resumenTotal: document.getElementById('resumen-total'),
  
  // Menú
  hamburguesa: document.querySelector('.hamburguesa'),
  menu: document.getElementById('menu'),
  
  // Contacto
  formContacto: document.getElementById('formContacto'),
  successMessage: document.getElementById('successMessage'),
  errorMessage: document.getElementById('errorMessage')
};

// ===============================
// FUNCIONES AUXILIARES
// ===============================
/**
 * Muestra una notificación al usuario
 * @param {string} mensaje - Texto a mostrar
 * @param {string} tipo - Tipo de notificación ('exito', 'error', 'info')
 */
function mostrarNotificacion(mensaje, tipo = 'exito') {
  const notificacion = document.createElement('div');
  notificacion.className = `notificacion ${tipo}`;
  notificacion.textContent = mensaje;
  document.body.appendChild(notificacion);
  
  // Animación de entrada
  requestAnimationFrame(() => {
    notificacion.classList.add('show');
  });
  
  // Eliminar después de 2.5 segundos
  setTimeout(() => {
    notificacion.classList.remove('show');
    setTimeout(() => notificacion.remove(), 300);
  }, 2500);
}

/**
 * Formatea un número como precio en pesos uruguayos
 * @param {number} precio - Valor a formatear
 * @returns {string} Precio formateado
 */
function formatearPrecio(precio) {
  return `$U ${precio.toLocaleString('es-UY')}`;
}

/**
 * Verifica el stock disponible de un producto
 * @param {number} id - ID del producto
 * @param {number} cantidad - Cantidad a verificar
 * @returns {Promise<number|boolean>} Stock restante o false si hay error
 */
async function verificarStock(id, cantidad) {
  try {
    const response = await fetch(STOCK_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, cantidad })
    });
    
    const data = await response.json();
    return data.success ? data.stockRestante : false;
  } catch (error) {
    console.error('Error al verificar stock:', error);
    return false;
  }
}

// ===============================
// MANEJO DEL CARRITO
// ===============================
/**
 * Guarda el carrito en localStorage y actualiza la UI
 */
function guardarCarrito() {
  localStorage.setItem(LS_CARRITO_KEY, JSON.stringify(estado.carrito));
  actualizarContadorCarrito();
}

/**
 * Carga el carrito desde localStorage
 */
function cargarCarrito() {
  try {
    estado.carrito = JSON.parse(localStorage.getItem(LS_CARRITO_KEY)) || [];
    actualizarContadorCarrito();
  } catch (error) {
    console.error('Error al cargar carrito:', error);
    estado.carrito = [];
  }
}

/**
 * Vacía el carrito después de confirmación
 */
function vaciarCarrito() {
  if (estado.carrito.length === 0) {
    mostrarNotificacion('El carrito ya está vacío', 'info');
    return;
  }
  
  if (confirm('¿Estás seguro de vaciar el carrito?')) {
    estado.carrito = [];
    guardarCarrito();
    renderizarCarrito();
    actualizarUI();
    mostrarNotificacion('Carrito vaciado', 'info');
    toggleCarrito(false);
  }
}

/**
 * Actualiza el contador visual del carrito
 */
function actualizarContadorCarrito() {
  const total = estado.carrito.reduce((sum, item) => sum + item.cantidad, 0);
  
  if (elementos.contadorCarrito) {
    elementos.contadorCarrito.textContent = total;
    elementos.contadorCarrito.classList.toggle('visible', total > 0);
  }
}

/**
 * Agrega un producto al carrito verificando stock
 * @param {number} id - ID del producto
 * @param {number} cantidad - Cantidad a agregar
 */
async function agregarAlCarrito(id, cantidad = 1) {
  const producto = estado.productos.find(p => p.id === id);
  if (!producto) return mostrarNotificacion('Producto no encontrado', 'error');
  
  cantidad = parseInt(cantidad, 10);
  if (isNaN(cantidad) || cantidad < 1) {
    return mostrarNotificacion('Cantidad inválida', 'error');
  }
  
  // Verificar stock con el servidor
  const stockDisponible = await verificarStock(id, cantidad);
  if (stockDisponible === false) {
    return mostrarNotificacion('Error al verificar el stock', 'error');
  }
  
  if (cantidad > stockDisponible) {
    mostrarNotificacion(`Solo hay ${stockDisponible} unidades disponibles de ${producto.nombre}`, 'error');
    return;
  }
  
  // Buscar si el producto ya está en el carrito
  const itemEnCarrito = estado.carrito.find(item => item.id === id);
  
  if (itemEnCarrito) {
    itemEnCarrito.cantidad += cantidad;
  } else {
    estado.carrito.push({
      id,
      nombre: producto.nombre,
      precio: producto.precio,
      cantidad,
      imagen: producto.imagenes[0] || PLACEHOLDER_IMAGE
    });
  }
  
  // Actualizar el stock localmente
  producto.stock = stockDisponible;
  
  guardarCarrito();
  actualizarUI();
  mostrarNotificacion(`"${producto.nombre}" x${cantidad} añadido al carrito`, 'exito');
}

/**
 * Renderiza el contenido del carrito
 */
function renderizarCarrito() {
  if (!elementos.listaCarrito || !elementos.totalCarrito) return;
  
  if (estado.carrito.length === 0) {
    elementos.listaCarrito.innerHTML = '<p class="carrito-vacio">Tu carrito está vacío</p>';
    elementos.totalCarrito.textContent = 'Total: $U 0';
    return;
  }
  
  elementos.listaCarrito.innerHTML = estado.carrito.map(item => {
    const producto = estado.productos.find(p => p.id === item.id);
    const stockDisponible = producto ? producto.stock : 0;
    const maxCantidad = Math.min(stockDisponible, item.cantidad + stockDisponible);
    
    return `
      <li class="carrito-item" data-id="${item.id}">
        <img src="${item.imagen}" class="carrito-item-img" alt="${item.nombre}" loading="lazy">
        <div class="carrito-item-info">
          <span class="carrito-item-nombre">${item.nombre}</span>
          <span class="carrito-item-precio">${formatearPrecio(item.precio)} c/u</span>
          <div class="carrito-item-controls">
            <button class="disminuir-cantidad" data-id="${item.id}" aria-label="Reducir cantidad">-</button>
            <span class="carrito-item-cantidad">${item.cantidad}</span>
            <button class="aumentar-cantidad" data-id="${item.id}" aria-label="Aumentar cantidad" ${item.cantidad >= stockDisponible ? 'disabled' : ''}>+</button>
          </div>
          <span class="carrito-item-subtotal">Subtotal: ${formatearPrecio(item.precio * item.cantidad)}</span>
        </div>
        <button class="eliminar-item" data-id="${item.id}" aria-label="Eliminar producto">
          <i class="fas fa-trash"></i>
        </button>
      </li>
    `;
  }).join('');

  // Calcular y mostrar total
  const total = estado.carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
  elementos.totalCarrito.textContent = `Total: ${formatearPrecio(total)}`;
  
  // Agregar eventos a los botones
  agregarEventosCarrito();
}

/**
 * Agrega eventos a los controles del carrito
 */
function agregarEventosCarrito() {
  // Disminuir cantidad
  document.querySelectorAll('.disminuir-cantidad').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      const item = estado.carrito.find(item => item.id === id);
      
      if (item && item.cantidad > 1) {
        item.cantidad--;
        guardarCarrito();
        renderizarCarrito();
      }
    });
  });

  // Aumentar cantidad
  document.querySelectorAll('.aumentar-cantidad').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = parseInt(e.target.dataset.id);
      const item = estado.carrito.find(item => item.id === id);
      const producto = estado.productos.find(p => p.id === id);
      
      if (item && producto) {
        // Verificar stock antes de aumentar
        const stockDisponible = await verificarStock(id, 1);
        
        if (stockDisponible !== false && item.cantidad < stockDisponible) {
          item.cantidad++;
          producto.stock = stockDisponible;
          guardarCarrito();
          renderizarCarrito();
        } else {
          mostrarNotificacion(`No hay más stock disponible de ${producto.nombre}`, 'error');
        }
      }
    });
  });

  // Eliminar item
  document.querySelectorAll('.eliminar-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.closest('button').dataset.id);
      estado.carrito = estado.carrito.filter(item => item.id !== id);
      guardarCarrito();
      renderizarCarrito();
    });
  });
}

// ===============================
// MANEJO DEL CARRITO (UI)
// ===============================
/**
 * Abre o cierra el panel del carrito
 * @param {boolean} [forceState] - Forzar estado (opcional)
 */
function toggleCarrito(forceState) {
  if (!elementos.carritoPanel || !elementos.carritoOverlay) return;
  
  const isOpen = typeof forceState === 'boolean' 
    ? forceState 
    : elementos.carritoPanel.classList.toggle('active');
  
  elementos.carritoPanel.classList.toggle('active', isOpen);
  elementos.carritoOverlay.classList.toggle('active', isOpen);
  document.body.classList.toggle('no-scroll', isOpen);
  
  if (isOpen) renderizarCarrito();
}

// ===============================
// MANEJO DE PRODUCTOS
// ===============================
/**
 * Carga productos desde Google Sheets
 */
async function cargarProductosDesdeSheets() {
  try {
    // Mostrar loader
    if (elementos.productLoader) {
      elementos.productLoader.style.display = 'block';
      elementos.productLoader.hidden = false;
    }
    
    if (elementos.galeriaProductos) elementos.galeriaProductos.innerHTML = '';
    
    // Fetch CSV
    const resp = await fetch(CSV_URL, { 
      headers: { 'Cache-Control': 'no-store' },
      cache: 'no-store'
    });
    
    if (!resp.ok) throw new Error('Error al cargar productos');
    
    const csvText = await resp.text();
    if (typeof Papa === 'undefined') throw new Error('Papa Parse no disponible');
    
    // Parsear CSV
    const { data } = Papa.parse(csvText, { 
      header: true, 
      skipEmptyLines: true,
      transform: value => value.trim()
    });
    
    if (!data || data.length === 0) {
      if (elementos.galeriaProductos) {
        elementos.galeriaProductos.innerHTML = '<p class="sin-productos">No hay productos disponibles en este momento.</p>';
      }
      return;
    }

    // Procesar productos y verificar stock en paralelo
    estado.productos = await Promise.all(
      data
        .filter(row => row.id && row.nombre && row.precio)
        .map(async row => {
          // Verificar stock actual desde la API
          const stockResponse = await verificarStock(row.id, 0); // Consulta sin modificar
          const stockActual = stockResponse !== false ? stockResponse : parseInt(row.cantidad, 10) || 0;
          
          return {
            id: parseInt(row.id, 10),
            nombre: row.nombre,
            descripcion: row.descripcion || '',
            precio: parseFloat(row.precio) || 0,
            stock: stockActual,
            imagenes: row.foto && row.foto.trim() !== "" 
              ? row.foto.split(',').map(url => url.trim()) 
              : [PLACEHOLDER_IMAGE],
            adicionales: row.adicionales || '',
            alto: parseFloat(row.alto) || null,
            ancho: parseFloat(row.ancho) || null,
            profundidad: parseFloat(row.profundidad) || null,
            categoria: row.categoria ? row.categoria.toLowerCase() : 'otros',
            vendido: row.vendido ? row.vendido.toLowerCase() === 'true' : false,
            estado: row.estado || ''
          };
        })
    );

    // Ocultar loader
    if (elementos.productLoader) {
      elementos.productLoader.style.display = 'none';
      elementos.productLoader.hidden = true;
    }
    
    actualizarCategorias();
    actualizarUI();
  } catch (error) {
    console.error('Error al cargar productos:', error);
    
    if (elementos.productLoader) {
      elementos.productLoader.style.display = 'none';
      elementos.productLoader.hidden = true;
    }
    
    if (elementos.galeriaProductos) {
      elementos.galeriaProductos.innerHTML = '<p class="error-carga">No se pudieron cargar los productos.</p>';
    }
    
    mostrarNotificacion('Error al cargar productos: ' + (error.message || error), 'error');
  }
}

/**
 * Actualiza las opciones de categorías en el filtro
 */
function actualizarCategorias() {
  if (!elementos.selectCategoria) return;

  const categoriasUnicas = [
    'todos',
    ...new Set(
      estado.productos
        .map(p => p.categoria)
        .filter(Boolean)
        .map(c => c.charAt(0).toUpperCase() + c.slice(1))
    )
  ];

  elementos.selectCategoria.innerHTML = categoriasUnicas
    .map(cat => `<option value="${cat}">${cat}</option>`)
    .join('');
}

/**
 * Filtra productos según los criterios actuales
 * @returns {Array} Productos filtrados
 */
function filtrarProductos() {
  const { precioMin, precioMax, categoria, busqueda } = estado.filtros;
  const busquedaLower = busqueda.toLowerCase();
  
  return estado.productos.filter(producto => {
    const enCarrito = estado.carrito.find(item => item.id === producto.id);
    const disponibles = Math.max(0, producto.stock - (enCarrito?.cantidad || 0));
    
    return (
      (precioMin === null || producto.precio >= precioMin) &&
      (precioMax === null || producto.precio <= precioMax) &&
      (categoria === 'todos' || producto.categoria === categoria.toLowerCase()) &&
      (!busqueda || 
        producto.nombre.toLowerCase().includes(busquedaLower) || 
        producto.descripcion.toLowerCase().includes(busquedaLower)) &&
      (disponibles > 0)
    );
  });
}

/**
 * Crea el HTML para una tarjeta de producto
 * @param {Object} producto - Datos del producto
 * @returns {string} HTML de la tarjeta
 */
function crearCardProducto(producto) {
  const enCarrito = estado.carrito.find(item => item.id === producto.id);
  const disponibles = Math.max(0, producto.stock - (enCarrito?.cantidad || 0));
  const agotado = disponibles <= 0;
  
  return `
    <div class="producto-card" data-id="${producto.id}">
      <img src="${producto.imagenes[0] || PLACEHOLDER_IMAGE}" 
           alt="${producto.nombre}" 
           class="producto-img" 
           loading="lazy">
      <h3 class="producto-nombre">${producto.nombre}</h3>
      <p class="producto-precio">${formatearPrecio(producto.precio)}</p>
      <p class="producto-stock">
        ${agotado ? '<span class="texto-agotado">Agotado</span>' : `Stock: ${disponibles}`}
      </p>
      <div class="card-acciones">
        <button class="boton-agregar${agotado ? ' agotado' : ''}" 
                data-id="${producto.id}" 
                ${agotado ? 'disabled' : ''}>
          ${agotado ? '<i class="fas fa-times-circle"></i> Agotado' : '<i class="fas fa-cart-plus"></i> Agregar'}
        </button>
      </div>
      <button class="boton-detalles" data-id="${producto.id}">🛈 Ver Detalle</button>
    </div>
  `;
}

/**
 * Renderiza la paginación
 * @param {number} totalProductos - Total de productos filtrados
 */
function renderizarPaginacion(totalProductos) {
  const totalPaginas = Math.ceil(totalProductos / PRODUCTOS_POR_PAGINA);
  const contenedor = elementos.paginacion;
  
  if (!contenedor) return;
  contenedor.innerHTML = '';
  
  if (totalPaginas <= 1) return;
  
  for (let i = 1; i <= totalPaginas; i++) {
    const boton = document.createElement('button');
    boton.textContent = i;
    boton.className = i === estado.paginaActual ? 'pagina-activa' : '';
    boton.addEventListener('click', () => {
      estado.paginaActual = i;
      renderizarProductos();
    });
    contenedor.appendChild(boton);
  }
}

/**
 * Renderiza los productos en la galería
 */
function renderizarProductos() {
  if (!elementos.galeriaProductos) return;
  
  const productosFiltrados = filtrarProductos();
  const inicio = (estado.paginaActual - 1) * PRODUCTOS_POR_PAGINA;
  const productosPagina = productosFiltrados.slice(inicio, inicio + PRODUCTOS_POR_PAGINA);
  
  if (productosPagina.length === 0) {
    elementos.galeriaProductos.innerHTML = `
      <p class="sin-resultados">
        No se encontraron productos con los filtros aplicados.
        <button onclick="resetearFiltros()">Mostrar todos</button>
      </p>
    `;
  } else {
    elementos.galeriaProductos.innerHTML = productosPagina.map(crearCardProducto).join('');
  }
  
  renderizarPaginacion(productosFiltrados.length);
}

// ===============================
// MODAL DE PRODUCTO
// ===============================
/**
 * Muestra el modal con los detalles del producto
 * @param {Object} producto - Producto a mostrar
 */
function mostrarModalProducto(producto) {
  const modal = elementos.productoModal;
  const contenido = elementos.modalContenido;
  
  if (!modal || !contenido) return;

  const enCarrito = estado.carrito.find(item => item.id === producto.id) || { cantidad: 0 };
  const disponibles = Math.max(0, producto.stock - enCarrito.cantidad);
  const agotado = disponibles <= 0;
  let indiceImagenActual = 0;

  /**
   * Renderiza el contenido del carrusel de imágenes
   */
  function renderCarrusel() {
    const tieneMultiplesImagenes = producto.imagenes.length > 1;
    
    contenido.innerHTML = `
      <button class="cerrar-modal" aria-label="Cerrar modal">×</button>
      <div class="modal-flex">
        <div class="modal-carrusel">
          <img src="${producto.imagenes[indiceImagenActual] || PLACEHOLDER_IMAGE}" 
               class="modal-img" 
               alt="${producto.nombre}"
               loading="lazy">
          
          ${tieneMultiplesImagenes ? `
            <div class="modal-controls">
              <button class="modal-prev" 
                      aria-label="Imagen anterior" 
                      ${indiceImagenActual === 0 ? 'disabled' : ''}>
                <svg width="26" height="26" viewBox="0 0 26 26">
                  <polyline points="17 22 9 13 17 4" fill="none" stroke="#2e7d32" 
                            stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <button class="modal-next" 
                      aria-label="Siguiente imagen" 
                      ${indiceImagenActual === producto.imagenes.length - 1 ? 'disabled' : ''}>
                <svg width="26" height="26" viewBox="0 0 26 26">
                  <polyline points="9 4 17 13 9 22" fill="none" stroke="#2e7d32" 
                            stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
          ` : ''}
          
          <div class="modal-thumbnails">
            ${producto.imagenes.map((img, i) => `
              <img src="${img}" 
                   class="thumbnail ${i === indiceImagenActual ? 'active' : ''}" 
                   data-index="${i}" 
                   alt="Miniatura ${i + 1}"
                   loading="lazy">
            `).join('')}
          </div>
        </div>
        
        <div class="modal-info">
          <h1 class="modal-nombre">${producto.nombre}</h1>
          <p class="modal-precio">${formatearPrecio(producto.precio)}</p>
          <p class="modal-stock ${agotado ? 'agotado' : 'disponible'}">
            ${agotado ? 'AGOTADO' : `Disponible: ${disponibles}`}
          </p>
          
          <div class="modal-descripcion">
            ${producto.descripcion || ''}
            <br>
            ${producto.adicionales ? `<small><b>Adicionales:</b> ${producto.adicionales}</small><br>` : ''}
            ${(producto.alto || producto.ancho || producto.profundidad) ? `
              <small>
                <b>Medidas:</b> 
                ${producto.alto ? producto.alto + ' cm (alto)' : ''} 
                ${producto.ancho ? ' × ' + producto.ancho + ' cm (ancho)' : ''} 
                ${producto.profundidad ? ' × ' + producto.profundidad + ' cm (prof.)' : ''}
              </small>
            ` : ''}
          </div>
          
          <div class="modal-acciones">
            <input type="number" 
                   value="1" 
                   min="1" 
                   max="${disponibles}" 
                   class="cantidad-modal-input" 
                   ${agotado ? 'disabled' : ''}>
            <button class="boton-agregar-modal ${agotado ? 'agotado' : ''}" 
                    data-id="${producto.id}" 
                    ${agotado ? 'disabled' : ''}>
              ${agotado ? 'Agotado' : 'Agregar al carrito'}
            </button>
          </div>
        </div>
      </div>
    `;

    // Eventos del modal
    contenido.querySelector('.cerrar-modal').onclick = cerrarModal;
    
    const btnAgregar = contenido.querySelector('.boton-agregar-modal');
    if (btnAgregar) {
      btnAgregar.addEventListener('click', () => {
        const cantidad = +(contenido.querySelector('.cantidad-modal-input').value || 1);
        agregarAlCarrito(producto.id, cantidad);
        cerrarModal();
      });
    }

    // Miniaturas
    contenido.querySelectorAll('.thumbnail').forEach((thumb, i) => {
      thumb.onclick = () => {
        indiceImagenActual = i;
        renderCarrusel();
      };
    });
    
    // Flechas de navegación
    contenido.querySelector('.modal-prev')?.addEventListener('click', () => {
      if (indiceImagenActual > 0) {
        indiceImagenActual--;
        renderCarrusel();
      }
    });
    
    contenido.querySelector('.modal-next')?.addEventListener('click', () => {
      if (indiceImagenActual < producto.imagenes.length - 1) {
        indiceImagenActual++;
        renderCarrusel();
      }
    });
  }

  // Cerrar modal al hacer clic fuera del contenido
  function cerrarModal() {
    modal.classList.remove('visible');
    setTimeout(() => {
      modal.style.display = 'none';
      document.body.classList.remove('no-scroll');
    }, 300);
  }

  // Mostrar modal
  renderCarrusel();
  modal.style.display = 'flex';
  
  requestAnimationFrame(() => {
    modal.classList.add('visible');
    document.body.classList.add('no-scroll');
  });

  modal.onclick = e => {
    if (e.target === modal) cerrarModal();
  };
}

/**
 * Conecta los eventos para abrir el modal desde las tarjetas de producto
 */
function conectarEventoModal() {
  if (!elementos.galeriaProductos) return;
  
  elementos.galeriaProductos.addEventListener('click', (e) => {
    const btnDetalles = e.target.closest('.boton-detalles');
    const btnAgregar = e.target.closest('.boton-agregar');
    
    if (btnDetalles) {
      const id = +btnDetalles.dataset.id;
      const producto = estado.productos.find(p => p.id === id);
      if (producto) mostrarModalProducto(producto);
    }
    
    if (btnAgregar) {
      const id = +btnAgregar.dataset.id;
      agregarAlCarrito(id, 1);
    }
  });
}

// ===============================
// ACTUALIZACIÓN DE LA UI
// ===============================
/**
 * Actualiza toda la interfaz de usuario
 */
function actualizarUI() {
  renderizarProductos();
  renderizarCarrito();
  actualizarContadorCarrito();
}

// ===============================
// MANEJO DE FILTROS
// ===============================
/**
 * Aplica los filtros actuales y renderiza los productos
 */
function aplicarFiltros() {
  estado.paginaActual = 1;
  renderizarProductos();
}

/**
 * Resetea todos los filtros a sus valores por defecto
 */
function resetearFiltros() {
  estado.filtros = {
    precioMin: null,
    precioMax: null,
    categoria: 'todos',
    busqueda: ''
  };
  
  if (elementos.inputBusqueda) elementos.inputBusqueda.value = '';
  if (elementos.selectCategoria) elementos.selectCategoria.value = 'todos';
  if (elementos.precioMinInput) elementos.precioMinInput.value = '';
  if (elementos.precioMaxInput) elementos.precioMaxInput.value = '';
  
  aplicarFiltros();
}

// ===============================
// FAQ INTERACTIVO
// ===============================
function inicializarFAQ() {
  document.querySelectorAll('.faq-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', !isExpanded);
      
      const content = toggle.nextElementSibling;
      if (content) content.hidden = isExpanded;
    });
  });
}

// ===============================
// MENÚ HAMBURGUESA RESPONSIVE
// ===============================
function inicializarMenuHamburguesa() {
  if (!elementos.hamburguesa || !elementos.menu) return;
  
  elementos.hamburguesa.addEventListener('click', function() {
    const expanded = elementos.menu.classList.toggle('active');
    elementos.hamburguesa.setAttribute('aria-expanded', expanded);
    document.body.classList.toggle('no-scroll', expanded);
  });
  
  // Cierra el menú al hacer click en un link
  elementos.menu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      elementos.menu.classList.remove('active');
      elementos.hamburguesa.setAttribute('aria-expanded', false);
      document.body.classList.remove('no-scroll');
    });
  });
}

// ===============================
// FORMULARIO DE CONTACTO
// ===============================
function setupContactForm() {
  if (!elementos.formContacto) return;
  
  elementos.formContacto.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const nombre = document.getElementById('nombre').value;
    const email = document.getElementById('email').value;
    const mensaje = document.getElementById('mensaje').value;

    emailjs.send('service_89by24g', 'template_8mn7hdp', {
      from_name: nombre,
      from_email: email,
      message: mensaje
    })
    .then(() => {
      elementos.successMessage.classList.remove('hidden');
      elementos.errorMessage.classList.add('hidden');
      elementos.formContacto.reset();
      
      setTimeout(() => {
        elementos.successMessage.classList.add('hidden');
      }, 3000);
    }, (error) => {
      console.error('Error al enviar el mensaje:', error);
      elementos.errorMessage.classList.remove('hidden');
      elementos.successMessage.classList.add('hidden');
      
      setTimeout(() => {
        elementos.errorMessage.classList.add('hidden');
      }, 3000);
    });
  });
}

// ===============================
// FINALIZACIÓN DE COMPRA
// ===============================
/**
 * Actualiza el resumen del pedido en el modal de envío
 */
function actualizarResumenPedido() {
  if (!elementos.resumenProductos || !elementos.resumenTotal) return;
  
  if (estado.carrito.length === 0) {
    elementos.resumenProductos.innerHTML = '<p class="carrito-vacio">No hay productos en el carrito</p>';
    elementos.resumenTotal.textContent = '$U 0';
    return;
  }

  let html = '';
  let subtotal = 0;
  
  estado.carrito.forEach(item => {
    const itemTotal = item.precio * item.cantidad;
    subtotal += itemTotal;
    html += `
      <div class="resumen-item">
        <span>${item.nombre} x${item.cantidad}</span>
        <span>${formatearPrecio(itemTotal)}</span>
      </div>
    `;
  });

  // Agregar subtotal
  html += `
    <div class="resumen-item resumen-subtotal">
      <span>Subtotal:</span>
      <span>${formatearPrecio(subtotal)}</span>
    </div>
  `;

  elementos.resumenProductos.innerHTML = html;
  
  // Calcular costo de envío
  const envioSelect = document.getElementById('select-envio');
  const metodoEnvio = envioSelect ? envioSelect.value : 'retiro';
  let costoEnvio = 0;

  if (metodoEnvio === 'montevideo') {
    costoEnvio = COSTO_ENVIO_MONTEVIDEO;
  } else if (metodoEnvio === 'interior') {
    costoEnvio = COSTO_ENVIO_INTERIOR;
  }

  // Mostrar total
  const total = subtotal + costoEnvio;
  elementos.resumenTotal.textContent = formatearPrecio(total);
}

/**
 * Configura el envío del pedido por WhatsApp
 */
async function configurarEnvioWhatsApp() {
  if (!elementos.formEnvio) return;

  elementos.formEnvio.addEventListener('submit', async function(e) {
    e.preventDefault();

    // Validar campos
    const nombre = document.getElementById('input-nombre').value.trim();
    const apellido = document.getElementById('input-apellido').value.trim();
    const telefono = document.getElementById('input-telefono').value.trim();
    const direccion = document.getElementById('input-direccion').value.trim();
    const envio = document.getElementById('select-envio').value;
    const notas = document.getElementById('input-notas').value.trim();

    if (!nombre || !apellido || !telefono || (!direccion && envio !== 'retiro') || !envio) {
      mostrarNotificacion('Por favor completa todos los campos obligatorios', 'error');
      return;
    }

    // 1. Verifica y reserva el stock de todos los productos antes de enviar pedido
    let stockOK = true;
    for (const item of estado.carrito) {
      const stockRestante = await verificarStock(item.id, item.cantidad);
      if (stockRestante === false || stockRestante < 0) {
        mostrarNotificacion(
          `Stock insuficiente para "${item.nombre}". Ajusta la cantidad o selecciona otro producto.`,
          'error'
        );
        stockOK = false;
        break;
      }
    }

    if (!stockOK) return;

    // 2. Si el stock está OK, arma el mensaje de WhatsApp
    let mensaje = `¡Hola! Quiero hacer un pedido en Patofelting:%0A%0A`;
    estado.carrito.forEach(item => {
      mensaje += `🧶 *${item.nombre}* x${item.cantidad} - ${formatearPrecio(item.precio * item.cantidad)}%0A`;
    });

    mensaje += `%0A*Nombre:* ${nombre} ${apellido}%0A`;
    mensaje += `*Teléfono:* ${telefono}%0A`;

    if (envio === 'retiro') {
      mensaje += `*Método de entrega:* Retiro en local%0A`;
    } else {
      mensaje += `*Método de entrega:* Envío a ${envio === 'montevideo' ? 'Montevideo' : 'Interior'}%0A`;
      mensaje += `*Dirección:* ${direccion}%0A`;
    }
    if (notas) mensaje += `*Notas:* ${notas}%0A`;

    // 3. Calcula totales
    let subtotal = estado.carrito.reduce((sum, i) => sum + (i.precio * i.cantidad), 0);
    let costoEnvio = envio === 'montevideo' ? COSTO_ENVIO_MONTEVIDEO : envio === 'interior' ? COSTO_ENVIO_INTERIOR : 0;
    mensaje += `%0A*Subtotal:* ${formatearPrecio(subtotal)}`;
    mensaje += `%0A*Envío:* ${formatearPrecio(costoEnvio)}`;
    mensaje += `%0A*Total:* ${formatearPrecio(subtotal + costoEnvio)}`;

    // 4. Abre WhatsApp
    const urlWhatsapp = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURI(mensaje)}`;
    window.open(urlWhatsapp, '_blank');

    mostrarNotificacion('¡Pedido preparado! Será enviado por WhatsApp.', 'exito');

    // 5. Opcional: Vacía el carrito tras enviar
    estado.carrito = [];
    guardarCarrito();
    renderizarCarrito();
    actualizarResumenPedido();
  });
}
