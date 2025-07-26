// ===============================
// CONFIGURACIÓN GLOBAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const CSV_URL = window.SHEET_CSV_URL;
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';
const MP_ACCESS_TOKEN = window.MP_ACCESS_TOKEN || '';

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
  inputBusqueda: getElement('input-busqueda'),
  selectCategoria: getElement('filtro-categoria'),
  precioMinInput: getElement('precio-min'),
  precioMaxInput: getElement('precio-max'),
  botonResetearFiltros: getElement('boton-resetear-filtros'),
  carritoBtnMain: getElement('carrito-btn-main'),
  carritoPanel: getElement('carrito-panel'),
  carritoOverlay: document.querySelector('.carrito-overlay'),
  btnVaciarCarrito: document.querySelector('.boton-vaciar-carrito'),
  btnFinalizarCompra: document.querySelector('.boton-finalizar-compra'),
  btnMercadoPago: null,
  btnCerrarCarrito: document.querySelector('.cerrar-carrito'),
  avisoPreCompraModal: getElement('aviso-pre-compra-modal'),
  btnEntendidoAviso: getElement('btn-entendido-aviso'),
  btnCancelarAviso: getElement('btn-cancelar-aviso'),
  productLoader: getElement('product-loader'),
  hamburguesa: document.querySelector('.hamburguesa'),
  menu: getElement('menu'),
  modalDatosEnvio: getElement('modal-datos-envio'),
  formEnvio: getElement('form-envio')
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
    actualizarBotonMercadoPago();
  } catch {
    carrito = [];
  }
}

function vaciarCarrito() {
  if (carrito.length === 0) {
    mostrarNotificacion('El carrito ya está vacío', 'info');
    return;
  }
  if (confirm('¿Estás seguro de vaciar el carrito?')) {
    carrito = [];
    guardarCarrito();
    renderizarCarrito();
    actualizarUI();
    mostrarNotificacion('Carrito vaciado', 'info');
    toggleCarrito(false);
    actualizarBotonMercadoPago();
  }
}

function actualizarContadorCarrito() {
  const total = carrito.reduce((sum, i) => sum + i.cantidad, 0);
  if (elementos.contadorCarrito) {
    elementos.contadorCarrito.textContent = total;
    elementos.contadorCarrito.classList.toggle('visible', total > 0);
  }
}

function agregarAlCarrito(id, cantidad = 1) {
  const prod = productos.find(p => p.id === id);
  if (!prod) return mostrarNotificacion('Producto no encontrado', 'error');
  
  cantidad = parseInt(cantidad, 10);
  if (isNaN(cantidad) || cantidad < 1) return mostrarNotificacion('Cantidad inválida', 'error');
  
  const enCarrito = carrito.find(item => item.id === id);
  const enCarritoCant = enCarrito ? enCarrito.cantidad : 0;
  const disponibles = Math.max(0, prod.stock - enCarritoCant);
  
  if (cantidad > disponibles) {
    mostrarNotificacion(`Solo hay ${disponibles} unidades disponibles de ${prod.nombre}`, 'error');
    return;
  }
  
  if (enCarrito) {
    enCarrito.cantidad += cantidad;
  } else {
    carrito.push({
      id,
      nombre: prod.nombre,
      precio: prod.precio,
      cantidad,
      imagen: prod.imagenes[0] || PLACEHOLDER_IMAGE
    });
  }
  
  guardarCarrito();
  actualizarUI();
  mostrarNotificacion(`"${prod.nombre}" x${cantidad} añadido al carrito`, 'exito');
  actualizarBotonMercadoPago();
}

function renderizarCarrito() {
  if (!elementos.listaCarrito || !elementos.totalCarrito) return;
  
  if (carrito.length === 0) {
    elementos.listaCarrito.innerHTML = '<p class="carrito-vacio">Tu carrito está vacío</p>';
    elementos.totalCarrito.textContent = 'Total: $U 0';
    actualizarBotonMercadoPago();
    return;
  }
  
  elementos.listaCarrito.innerHTML = carrito.map(item => {
    const producto = productos.find(p => p.id === item.id);
    const stockDisponible = producto ? producto.stock : 0;
    const maxCantidad = Math.min(stockDisponible, item.cantidad + stockDisponible);
    
    return `
    <li class="carrito-item" data-id="${item.id}">
      <img src="${item.imagen}" class="carrito-item-img" alt="${item.nombre}" loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}'">
      <div class="carrito-item-info">
        <span class="carrito-item-nombre">${item.nombre}</span>
        <span class="carrito-item-precio">$U ${item.precio.toLocaleString('es-UY')} c/u</span>
        <div class="carrito-item-controls">
          <button class="disminuir-cantidad" data-id="${item.id}" aria-label="Reducir cantidad">-</button>
          <span class="carrito-item-cantidad">${item.cantidad}</span>
          <button class="aumentar-cantidad" data-id="${item.id}" aria-label="Aumentar cantidad" ${item.cantidad >= stockDisponible ? 'disabled' : ''}>+</button>
        </div>
        <span class="carrito-item-subtotal">Subtotal: $U ${(item.precio * item.cantidad).toLocaleString('es-UY')}</span>
      </div>
      <button class="eliminar-item" data-id="${item.id}" aria-label="Eliminar producto">
        <i class="fas fa-trash"></i>
      </button>
    </li>
    `;
  }).join('');

  // Actualizar el total
  const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
  elementos.totalCarrito.textContent = `Total: $U ${total.toLocaleString('es-UY')}`;
  
  // Agregar eventos a los botones
  document.querySelectorAll('.disminuir-cantidad').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      const item = carrito.find(item => item.id === id);
      if (item && item.cantidad > 1) {
        item.cantidad--;
        guardarCarrito();
        renderizarCarrito();
      }
    });
  });

  document.querySelectorAll('.aumentar-cantidad').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      const item = carrito.find(item => item.id === id);
      const producto = productos.find(p => p.id === id);
      
      if (item && producto) {
        if (item.cantidad < producto.stock) {
          item.cantidad++;
          guardarCarrito();
          renderizarCarrito();
        } else {
          mostrarNotificacion(`No hay más stock disponible de ${producto.nombre}`, 'error');
        }
      }
    });
  });

  document.querySelectorAll('.eliminar-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      carrito = carrito.filter(item => item.id !== id);
      guardarCarrito();
      renderizarCarrito();
    });
  });

  actualizarBotonMercadoPago();
}

// ===============================
// ABRIR Y CERRAR CARRITO
// ===============================
function toggleCarrito(forceState) {
  if (!elementos.carritoPanel || !elementos.carritoOverlay) return;
  let isOpen;
  if (typeof forceState === 'boolean') {
    isOpen = forceState;
    elementos.carritoPanel.classList.toggle('active', isOpen);
    elementos.carritoOverlay.classList.toggle('active', isOpen);
    document.body.classList.toggle('no-scroll', isOpen);
  } else {
    isOpen = elementos.carritoPanel.classList.toggle('active');
    elementos.carritoOverlay.classList.toggle('active', isOpen);
    document.body.classList.toggle('no-scroll', isOpen);
  }
  if (isOpen) renderizarCarrito();
}

// ===============================
// PRODUCTOS, FILTROS Y PAGINACIÓN
// ===============================
async function cargarProductosDesdeSheets() {
  try {
    if (elementos.productLoader) {
      elementos.productLoader.style.display = 'none';
      elementos.productLoader.hidden = true;
    }
    if (elementos.galeriaProductos) elementos.galeriaProductos.innerHTML = '';
    const resp = await fetch(CSV_URL, { headers: { 'Cache-Control': 'no-store' } });
    if (!resp.ok) throw new Error('Error al cargar productos');
    const csvText = await resp.text();
    if (typeof Papa === 'undefined') throw new Error('Papa Parse no disponible');
    const { data } = Papa.parse(csvText, { header: true, skipEmptyLines: true });
    if (!data || data.length === 0) {
      if (elementos.galeriaProductos)
        elementos.galeriaProductos.innerHTML = '<p class="sin-productos">No hay productos disponibles en este momento.</p>';
      return;
    }
    productos = data
      .filter(r => r.id && r.nombre && r.precio)
      .map(r => ({
        id: parseInt(r.id, 10),
        nombre: r.nombre.trim(),
        descripcion: r.descripcion || '',
        precio: parseFloat(r.precio) || 0,
        stock: parseInt(r.cantidad, 10) || 0,
        imagenes: (r.foto && r.foto.trim() !== "") ? r.foto.split(',').map(x => x.trim()) : [PLACEHOLDER_IMAGE],
        adicionales: r.adicionales ? r.adicionales.trim() : '',
        alto: parseFloat(r.alto) || null,
        ancho: parseFloat(r.ancho) || null,
        profundidad: parseFloat(r.profundidad) || null,
        categoria: r.categoria ? r.categoria.trim().toLowerCase() : 'otros',
        vendido: r.vendido ? r.vendido.trim().toLowerCase() === 'true' : false,
        estado: r.estado ? r.estado.trim() : ''
      }));
    actualizarCategorias();
    actualizarUI();
    actualizarBotonMercadoPago();
  } catch (e) {
    if (elementos.galeriaProductos)
      elementos.galeriaProductos.innerHTML = '<p class="error-carga">No se pudieron cargar los productos.</p>';
    mostrarNotificacion('Error al cargar productos: ' + (e.message || e), 'error');
  }
}

function actualizarCategorias() {
  if (!elementos.selectCategoria) return;
  const cats = ['todos', ...new Set(productos.map(p => p.categoria).filter(Boolean))];
  elementos.selectCategoria.innerHTML = cats
    .map(cat => `<option value="${cat.charAt(0).toUpperCase() + cat.slice(1)}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`)
    .join('');
}

function filtrarProductos() {
  return productos.filter(p => {
    const { precioMin, precioMax, categoria, busqueda } = filtrosActuales;
    const b = busqueda?.toLowerCase() || "";
    const enCarrito = carrito.find(i => i.id === p.id);
    const disponibles = Math.max(0, p.stock - (enCarrito?.cantidad || 0));
    return (
      (precioMin === null || p.precio >= precioMin) &&
      (precioMax === null || p.precio <= precioMax) &&
      (categoria === 'todos' || p.categoria === categoria) &&
      (!b || p.nombre.toLowerCase().includes(b) || p.descripcion.toLowerCase().includes(b)) &&
      (disponibles > 0)
    );
  });
}

function crearCardProducto(p) {
  const enCarrito = carrito.find(i => i.id === p.id);
  const disp = Math.max(0, p.stock - (enCarrito?.cantidad || 0));
  const agot = disp <= 0;
  return `
    <div class="producto-card" data-id="${p.id}">
      <img src="${p.imagenes[0] || PLACEHOLDER_IMAGE}" alt="${p.nombre}" class="producto-img" loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}'">
      <h3 class="producto-nombre">${p.nombre}</h3>
      <p class="producto-precio">$U ${p.precio.toLocaleString('es-UY')}</p>
      <p class="producto-stock">
        ${agot ? '<span class="texto-agotado">Agotado</span>' : `Stock: ${disp}`}
      </p>
      <div class="card-acciones">
        <button class="boton-agregar${agot ? ' agotado' : ''}" data-id="${p.id}" ${agot ? 'disabled' : ''}>
          ${agot ? '<i class="fas fa-times-circle"></i> Agotado' : '<i class="fas fa-cart-plus"></i> Agregar'}
        </button>
      </div>
      <button class="boton-detalles" data-id="${p.id}">🛈 Ver Detalle</button>
    </div>
  `;
}

function renderizarPaginacion(total) {
  const pages = Math.ceil(total / PRODUCTOS_POR_PAGINA);
  const cont = elementos.paginacion;
  if (!cont) return;
  cont.innerHTML = '';
  if (pages <= 1) return;
  for (let i = 1; i <= pages; i++) {
    const b = document.createElement('button');
    b.textContent = i;
    b.className = i === paginaActual ? 'pagina-activa' : '';
    b.addEventListener('click', () => {
      paginaActual = i;
      renderizarProductos();
    });
    cont.appendChild(b);
  }
}

function renderizarProductos() {
  if (!elementos.galeriaProductos) return;
  const productosFiltrados = filtrarProductos();
  const inicio = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
  const productosPagina = productosFiltrados.slice(inicio, inicio + PRODUCTOS_POR_PAGINA);
  if (productosPagina.length === 0) {
    elementos.galeriaProductos.innerHTML = `<p class="sin-resultados">No se encontraron productos con los filtros aplicados.<button onclick="resetearFiltros()">Mostrar todos</button></p>`;
  } else {
    elementos.galeriaProductos.innerHTML = productosPagina.map(crearCardProducto).join('');
  }
  renderizarPaginacion(productosFiltrados.length);
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
          <img src="${producto.imagenes[currentIndex] || PLACEHOLDER_IMAGE}" class="modal-img" alt="${producto.nombre}" onerror="this.src='${PLACEHOLDER_IMAGE}'">
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
                  `<img src="${img}" class="thumbnail ${i === currentIndex ? 'active' : ''}" data-index="${i}" alt="Miniatura ${i + 1}" onerror="this.src='${PLACEHOLDER_IMAGE}'">`
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
                ? `<small><b>Medidas:</b> ${producto.alto ? producto.alto + ' cm (alto)' : ''} ${producto.ancho ? ' x ' + producto.ancho + ' cm (ancho)' : ''} ${producto.profundidad ? ' x ' + producto.profundidad + ' cm (prof.)' : ''}</small>`
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
    // Listeners para cerrar modal, agregar al carrito, carrusel y miniaturas
    contenido.querySelector('.cerrar-modal').onclick = () => cerrarModal();
    contenido.querySelector('.boton-agregar-modal')?.addEventListener('click', () => {
      const cantidad = +(contenido.querySelector('.cantidad-modal-input').value || 1);
      agregarAlCarrito(producto.id, cantidad);
      cerrarModal();
    });

    // Miniaturas clickeables
    contenido.querySelectorAll('.thumbnail').forEach((thumb, i) => {
      thumb.onclick = () => {
        currentIndex = i;
        renderCarrusel();
      };
    });
    // Flechas
    contenido.querySelector('.modal-prev')?.addEventListener('click', () => {
      if (currentIndex > 0) {
        currentIndex--;
        renderCarrusel();
      }
    });
    contenido.querySelector('.modal-next')?.addEventListener('click', () => {
      if (currentIndex < producto.imagenes.length - 1) {
        currentIndex++;
        renderCarrusel();
      }
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
function conectarEventoModal() {
  if (!elementos.galeriaProductos) return;
  elementos.galeriaProductos.onclick = (e) => {
    const btn = e.target.closest('.boton-detalles');
    if (btn) {
      const id = +btn.dataset.id;
      const producto = productos.find(p => p.id === id);
      if (producto) mostrarModalProducto(producto);
    }
    const btnAgregar = e.target.closest('.boton-agregar');
    if (btnAgregar) {
      const id = +btnAgregar.dataset.id;
      agregarAlCarrito(id, 1);
    }
  };
}

// ===============================
// ACTUALIZAR UI
// ===============================
function actualizarUI() {
  renderizarProductos();
  renderizarCarrito();
  actualizarContadorCarrito();
}

// ===============================
// FILTROS Y RESET
// ===============================
function aplicarFiltros() {
  paginaActual = 1;
  renderizarProductos();
}

function resetearFiltros() {
  filtrosActuales = {
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
  const faqToggles = document.querySelectorAll('.faq-toggle');
  faqToggles.forEach(toggle => {
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
  const hamburguesa = document.querySelector('.hamburguesa');
  const menu = document.getElementById('menu');
  if (!hamburguesa || !menu) return;
  hamburguesa.addEventListener('click', function () {
    const expanded = menu.classList.toggle('active');
    hamburguesa.setAttribute('aria-expanded', expanded);
    document.body.classList.toggle('no-scroll', expanded);
  });
  // Cierra el menú al hacer click en un link
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

  if (formContacto) {
    formContacto.addEventListener('submit', (e) => {
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
        successMessage.classList.remove('hidden');
        errorMessage.classList.add('hidden');
        formContacto.reset();
        setTimeout(() => successMessage.classList.add('hidden'), 3000);
      }, (error) => {
        console.error('Error al enviar el mensaje:', error);
        errorMessage.classList.remove('hidden');
        successMessage.classList.add('hidden');
        setTimeout(() => errorMessage.classList.add('hidden'), 3000);
      });
    });
  }
}

// ===============================
// FUNCIONES PARA FINALIZAR COMPRA
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

  // Agregar línea de subtotal
  html += `
    <div class="resumen-item resumen-subtotal">
      <span>Subtotal:</span>
      <span>$U ${subtotal.toLocaleString('es-UY')}</span>
    </div>
  `;

  resumenProductos.innerHTML = html;
  
  // Obtener método de envío seleccionado
  const envioSelect = document.getElementById('select-envio');
  const metodoEnvio = envioSelect ? envioSelect.value : 'retiro';
  let costoEnvio = 0;

  if (metodoEnvio === 'montevideo') {
    costoEnvio = 150;
  } else if (metodoEnvio === 'interior') {
    costoEnvio = 300;
  }

  const total = subtotal + costoEnvio;
  resumenTotal.textContent = `$U ${total.toLocaleString('es-UY')}`;
}

function configurarEnvioWhatsApp() {
  const formEnvio = document.getElementById('form-envio');
  if (!formEnvio) return;

  formEnvio.addEventListener('submit', function(e) {
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

    // Calcular total con envío
    let subtotal = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    let envioTxt = 'Retiro en local (Gratis)';
    let costoEnvio = 0;
    
    if (envio === 'montevideo') {
      costoEnvio = 150;
      envioTxt = `Envío Montevideo ($U ${costoEnvio})`;
    } else if (envio === 'interior') {
      costoEnvio = 300;
      envioTxt = `Envío Interior ($U ${costoEnvio})`;
    }
    
    const total = subtotal + costoEnvio;

    // Crear mensaje detallado
    let productosMsg = '';
    if (carrito.length === 0) {
      productosMsg = 'No hay productos en el carrito';
    } else {
      productosMsg = carrito.map(item => 
        `➤ ${item.nombre} x${item.cantidad} - $U ${(item.precio * item.cantidad).toLocaleString('es-UY')}`
      ).join('\n');
    }
    
    const mensaje = `¡Hola Patofelting! Quiero hacer un pedido:\n\n*Productos:*\n${productosMsg}\n\n*Datos del cliente:*\n👤 ${nombre} ${apellido}\n📞 ${telefono}\n\n*Envío:*\n${envioTxt}\n${envio !== 'retiro' ? `📍 Dirección: ${direccion}\n` : ''}\n*Subtotal:* $U ${subtotal.toLocaleString('es-UY')}\n*Costo de envío:* $U ${costoEnvio.toLocaleString('es-UY')}\n*Total a pagar:* $U ${total.toLocaleString('es-UY')}\n\n${notas ? `*Notas:*\n${notas}` : ''}`;

    // Abrir WhatsApp
    window.open(`https://wa.me/59893566283?text=${encodeURIComponent(mensaje)}`, '_blank');
    
    // Cerrar modal y limpiar carrito
    document.getElementById('modal-datos-envio').classList.remove('visible');
    setTimeout(() => {
      document.getElementById('modal-datos-envio').hidden = true;
      carrito = [];
      guardarCarrito();
      actualizarUI();
      mostrarNotificacion('Pedido enviado con éxito', 'exito');
      document.getElementById('form-envio').reset();
    }, 300);
  });
}

// ===============================
// MERCADO PAGO INTEGRATION
// ===============================
function insertarBotonMercadoPago() {
  const cont = document.querySelector('.carrito-acciones');
  if (!cont) return;
  const btn = document.createElement('button');
  btn.id = 'btn-mercado-pago';
  btn.className = 'boton-mercado-pago';
  btn.innerHTML = `<img src="https://www.mercadopago.com/org-img/MP3/home/logomp3.gif" alt="Mercado Pago" loading="lazy"> Pagar con Mercado Pago`;
  cont.appendChild(btn);
  elementos.btnMercadoPago = btn;
  btn.dataset.text = btn.innerHTML;
  btn.addEventListener('click', iniciarPagoMercadoPago);
  actualizarBotonMercadoPago();
}

function actualizarBotonMercadoPago() {
  const btn = elementos.btnMercadoPago;
  if (!btn) return;
  const vacio = carrito.length === 0;
  btn.disabled = vacio;
  btn.style.display = vacio ? 'none' : 'block';
}

function setMercadoPagoLoading(state) {
  const btn = elementos.btnMercadoPago;
  if (!btn) return;
  if (state) {
    btn.disabled = true;
    btn.innerHTML = `<svg class="spinner" viewBox="0 0 50 50"><circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="4"/></svg>`;
  } else {
    btn.innerHTML = btn.dataset.text;
    actualizarBotonMercadoPago();
  }
}

async function iniciarPagoMercadoPago() {
  if (carrito.length === 0) return;
  if (!MP_ACCESS_TOKEN) {
    mostrarNotificacion('Integración de pago no configurada', 'error');
    return;
  }
  const total = carrito.reduce((sum, i) => sum + i.precio * i.cantidad, 0);
  const body = {
    items: [
      {
        title: 'Compra en Patofelting',
        quantity: 1,
        unit_price: total,
        currency_id: 'UYU'
      }
    ]
  };
  try {
    setMercadoPagoLoading(true);
    const resp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`
      },
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.message || 'No se pudo generar la preferencia');
    const url = data.init_point || data.sandbox_init_point;
    if (!url) throw new Error('Enlace de pago no disponible');
    window.location.href = url;
  } catch (e) {
    console.error('Mercado Pago', e);
    mostrarNotificacion('Ocurrió un error al iniciar el pago', 'error');
  } finally {
    setMercadoPagoLoading(false);
  }
}

// ===============================
// INICIALIZACIÓN GENERAL
// ===============================
function inicializarEventos() {
  // Carrito
  elementos.carritoBtnMain?.addEventListener('click', () => toggleCarrito(true));
  elementos.carritoOverlay?.addEventListener('click', () => toggleCarrito(false));
  elementos.btnCerrarCarrito?.addEventListener('click', () => toggleCarrito(false));
  elementos.btnVaciarCarrito?.addEventListener('click', vaciarCarrito);
  
  elementos.btnFinalizarCompra?.addEventListener('click', () => {
    if (carrito.length === 0) {
      mostrarNotificacion('El carrito está vacío', 'error');
      return;
    }
    
    // Mostrar aviso pre-compra
    elementos.avisoPreCompraModal.style.display = 'flex';
  });

  elementos.btnEntendidoAviso?.addEventListener('click', function() {
    elementos.avisoPreCompraModal.style.display = 'none';
    const modalEnvio = document.getElementById('modal-datos-envio');
    modalEnvio.hidden = false;
    setTimeout(() => {
      modalEnvio.classList.add('visible');
      actualizarResumenPedido();
    }, 10);
  });

  elementos.btnCancelarAviso?.addEventListener('click', () => {
    elementos.avisoPreCompraModal.style.display = 'none';
  });

  // Cerrar modal de envío
  document.getElementById('btn-cerrar-modal-envio')?.addEventListener('click', function() {
    const modalEnvio = document.getElementById('modal-datos-envio');
    modalEnvio.classList.remove('visible');
    setTimeout(() => {
      modalEnvio.hidden = true;
    }, 300);
  });

  // Actualizar total cuando cambia el método de envío
  document.getElementById('select-envio')?.addEventListener('change', function() {
    const grupoDireccion = document.getElementById('grupo-direccion');
    const resumenTotal = document.getElementById('resumen-total');
    
    // Mostrar/ocultar campo dirección
    if (this.value === 'retiro') {
      grupoDireccion.style.display = 'none';
      document.getElementById('input-direccion').required = false;
    } else {
      grupoDireccion.style.display = 'flex';
      document.getElementById('input-direccion').required = true;
    }
    
    // Calcular nuevo total con envío
    if (resumenTotal && carrito.length > 0) {
      const subtotal = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
      let costoEnvio = 0;
      
      if (this.value === 'montevideo') {
        costoEnvio = 150;
      } else if (this.value === 'interior') {
        costoEnvio = 300;
      }
      
      const total = subtotal + costoEnvio;
      resumenTotal.textContent = `$U ${total.toLocaleString('es-UY')}`;
    }
  });

  // Filtros
  elementos.inputBusqueda?.addEventListener('input', (e) => {
    filtrosActuales.busqueda = e.target.value.toLowerCase();
    aplicarFiltros();
  });
  elementos.selectCategoria?.addEventListener('change', (e) => {
    filtrosActuales.categoria = e.target.value.toLowerCase();
    aplicarFiltros();
  });
  document.querySelectorAll('.aplicar-rango-btn').forEach(boton => {
    boton.addEventListener('click', () => {
      filtrosActuales.precioMin = elementos.precioMinInput.value ? parseFloat(elementos.precioMinInput.value) : null;
      filtrosActuales.precioMax = elementos.precioMaxInput.value ? parseFloat(elementos.precioMaxInput.value) : null;
      aplicarFiltros();
    });
  });
  elementos.botonResetearFiltros?.addEventListener('click', resetearFiltros);

  // Modal de producto y botones agregar
  conectarEventoModal();

  // Configurar envío por WhatsApp
  configurarEnvioWhatsApp();
}

// ===============================
// INICIALIZADOR ÚNICO
// ===============================
function init() {
  // Inicializar EmailJS con tu clave pública
  emailjs.init('o4IxJz0Zz-LQ8jYKG');

  inicializarMenuHamburguesa();
  inicializarFAQ();
  setupContactForm();
  insertarBotonMercadoPago();

  // Ocultar modales y loader al inicio
  if (elementos.avisoPreCompraModal) elementos.avisoPreCompraModal.style.display = 'none';
  if (elementos.productoModal) elementos.productoModal.style.display = 'none';
  if (elementos.modalDatosEnvio) elementos.modalDatosEnvio.hidden = true;
  if (elementos.productLoader) {
    elementos.productLoader.style.display = 'none';
    elementos.productLoader.hidden = true;
  }
  
  cargarCarrito();
  cargarProductosDesdeSheets();
  inicializarEventos();
}

// Arranque seguro
if (document.readyState !== 'loading') {
  init();
} else {
  document.addEventListener('DOMContentLoaded', init);
}

// ==== FUNCIONES GLOBALES POR SI SE NECESITAN EN EL HTML ====
window.resetearFiltros = resetearFiltros;
window.toggleCarrito = toggleCarrito;
window.agregarAlCarrito = agregarAlCarrito;
window.mostrarModalProducto = mostrarModalProducto;
window.mostrarNotificacion = mostrarNotificacion;
window.cargarProductosDesdeSheets = cargarProductosDesdeSheets;
window.guardarCarrito = guardarCarrito;
