// ===============================
// CONFIGURACIÓN INICIAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const CSV_URL = window.SHEET_CSV_URL;
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE;

// ===============================
// ESTADO GLOBAL
// ===============================
let productos = [];
let carrito = [];
let paginaActual = 1;
let filtrosActuales = {
  precioMin: null,
  precioMax: null,
  tamañoMin: null,
  tamañoMax: null,
  categoria: 'todos',
  busqueda: ''
};

// ===============================
// REFERENCIAS AL DOM
// ===============================
const getElement = (id) => document.getElementById(id);
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
  tamañoMinInput: getElement('tamaño-min'),
  tamañoMaxInput: getElement('tamaño-max'),
  botonResetearFiltros: getElement('boton-resetear-filtros'),
  carritoBtnMain: getElement('carrito-btn-main'),
  carritoPanel: getElement('carrito-panel'),
  carritoOverlay: document.querySelector('.carrito-overlay'),
  btnVaciarCarrito: document.querySelector('.boton-vaciar-carrito'),
  btnFinalizarCompra: document.querySelector('.boton-finalizar-compra'),
  btnCerrarCarrito: document.querySelector('.cerrar-carrito'),
  hamburguesaBtn: document.querySelector('.hamburguesa'),
  menu: getElement('menu'),
  faqToggles: document.querySelectorAll('.faq-toggle'),
  formContacto: getElement('form-contacto'),
  successMessage: getElement('success-message'),
  btnEnviar: getElement('btn-enviar'),
  btnFlotante: document.querySelector('.boton-flotante'),
  avisoPreCompraModal: getElement('aviso-pre-compra-modal'),
  btnEntendidoAviso: getElement('btn-entendido-aviso'),
  btnCancelarAviso: getElement('btn-cancelar-aviso'),
  productLoader: getElement('product-loader')
};

// ===============================
// FUNCIONES AUXILIARES
// ===============================

function evitarScrollPorDefecto() {
  document.querySelectorAll('button:not([type])').forEach(btn => {
    btn.setAttribute('type', 'button');
  });
}

function mostrarNotificacion(mensaje, tipo = 'exito') {
  const notificacion = document.createElement('div');
  notificacion.className = `notificacion ${tipo}`;
  notificacion.textContent = mensaje;
  document.body.appendChild(notificacion);
  
  // Animación de entrada
  requestAnimationFrame(() => {
    notificacion.style.opacity = '1';
    notificacion.style.transform = 'translateY(0)';
  });
  
  // Eliminar después de 3 segundos
  setTimeout(() => {
    notificacion.style.opacity = '0';
    notificacion.style.transform = 'translateY(-20px)';
    setTimeout(() => notificacion.remove(), 300);
  }, 3000);
}

function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// ===============================
// MANEJO DEL CARRITO
// ===============================

function guardarCarrito() {
  try {
    localStorage.setItem(LS_CARRITO_KEY, JSON.stringify(carrito));
    actualizarContadorCarrito();
  } catch (e) {
    mostrarNotificacion('Error al guardar el carrito', 'error');
    console.error('Error al guardar en localStorage:', e);
  }
}

function cargarCarrito() {
  try {
    const data = localStorage.getItem(LS_CARRITO_KEY);
    carrito = data ? JSON.parse(data) : [];
    actualizarContadorCarrito();
  } catch (e) {
    console.error('Error al cargar el carrito:', e);
    carrito = [];
  }
}

function actualizarContadorCarrito() {
  const total = carrito.reduce((sum, item) => sum + item.cantidad, 0);
  if (elementos.contadorCarrito) {
    elementos.contadorCarrito.textContent = total;
    elementos.contadorCarrito.classList.toggle('visible', total > 0);
  }
}

function agregarAlCarrito(id, cantidad = 1) {
  const prod = productos.find(p => p.id === id);
  if (!prod) {
    mostrarNotificacion('Producto no encontrado', 'error');
    return;
  }
  
  cantidad = parseInt(cantidad, 10);
  if (isNaN(cantidad) || cantidad < 1) {
    mostrarNotificacion('Por favor ingrese una cantidad válida', 'error');
    return;
  }
  
  const enCarrito = carrito.find(item => item.id === id);
  const disponibles = prod.stock - (enCarrito?.cantidad || 0);
  
  if (cantidad > disponibles) {
    mostrarNotificacion(`Solo hay ${disponibles} unidades disponibles`, 'error');
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
}

function renderizarCarrito() {
  if (!elementos.listaCarrito || !elementos.totalCarrito) return;
  
  if (carrito.length === 0) {
    elementos.listaCarrito.innerHTML = '<p class="carrito-vacio">Tu carrito está vacío</p>';
    elementos.totalCarrito.textContent = 'Total: $U 0';
    return;
  }
  
  elementos.listaCarrito.innerHTML = carrito.map(item => `
    <li class="carrito-item">
      <img src="${item.imagen}" 
           class="carrito-item-img" 
           alt="${item.nombre}" 
           loading="lazy" 
           onerror="this.src='${PLACEHOLDER_IMAGE}'">
      <div class="carrito-item-info">
        <span class="carrito-item-nombre">${item.nombre}</span>
        <span class="carrito-item-precio">$U ${item.precio.toLocaleString('es-UY')}</span>
        <div class="carrito-item-controls">
          <button data-id="${item.id}" data-action="decrementar" aria-label="Reducir cantidad">-</button>
          <span class="carrito-item-cantidad">${item.cantidad}</span>
          <button data-id="${item.id}" data-action="incrementar" aria-label="Aumentar cantidad">+</button>
          <button data-id="${item.id}" class="eliminar-item" aria-label="Eliminar del carrito">
            Eliminar
          </button>
        </div>
        <span class="carrito-item-subtotal">Subtotal: $U ${(item.precio * item.cantidad).toLocaleString('es-UY')}</span>
      </div>
    </li>
  `).join('');
  
  const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
  elementos.totalCarrito.textContent = `Total: $U ${total.toLocaleString('es-UY')}`;
  
  // Manejar eventos de los controles del carrito
  elementos.listaCarrito.addEventListener('click', (e) => {
    const target = e.target.closest('[data-id]');
    if (!target) return;
    
    const id = +target.dataset.id;
    const action = target.dataset.action;
    const item = carrito.find(i => i.id === id);
    const producto = productos.find(p => p.id === id);
    
    if (!item || !producto) return;
    
    if (action === 'incrementar') {
      const disponibles = producto.stock - item.cantidad;
      if (disponibles > 0) {
        item.cantidad++;
        guardarCarrito();
        actualizarUI();
      } else {
        mostrarNotificacion('No hay más stock disponible', 'error');
      }
    } else if (action === 'decrementar') {
      item.cantidad--;
      if (item.cantidad <= 0) {
        carrito = carrito.filter(i => i.id !== id);
      }
      guardarCarrito();
      actualizarUI();
    } else if (target.classList.contains('eliminar-item')) {
      carrito = carrito.filter(i => i.id !== id);
      guardarCarrito();
      actualizarUI();
      mostrarNotificacion('Producto eliminado del carrito', 'info');
    }
  });
}

function toggleCarrito() {
  if (!elementos.carritoPanel || !elementos.carritoOverlay) return;
  
  const isOpen = elementos.carritoPanel.classList.toggle('active');
  elementos.carritoOverlay.classList.toggle('active', isOpen);
  document.body.classList.toggle('no-scroll', isOpen);
  
  if (isOpen) {
    renderizarCarrito();
    setTimeout(() => {
      elementos.carritoPanel.focus();
    }, 100);
  }
}

// ===============================
// MANEJO DE PRODUCTOS
// ===============================

async function cargarProductosDesdeSheets() {
  try {
    if (elementos.productLoader) elementos.productLoader.hidden = false;
    if (elementos.galeriaProductos) elementos.galeriaProductos.innerHTML = '';

    const resp = await fetch(CSV_URL, { headers: { 'Cache-Control': 'no-store' } });
    if (!resp.ok) throw new Error('Error al cargar productos.');
    const csvText = await resp.text();

    if (typeof Papa === 'undefined') throw new Error('Papa Parse no disponible');
    const { data } = Papa.parse(csvText, { header: true, skipEmptyLines: true });

    if (!data || data.length === 0) {
      if (elementos.galeriaProductos)
        elementos.galeriaProductos.innerHTML = '<p class="sin-productos">No hay productos disponibles en este momento.</p>';
      if (elementos.productLoader) elementos.productLoader.hidden = true;
      return;
    }
    productos = data
      .filter(row => row.id && row.nombre && row.precio)
      .map(row => ({
        id: parseInt(row.id, 10),
        nombre: row.nombre.trim(),
        descripcion: row.descripcion ? row.descripcion.trim() : '',
        precio: parseFloat(row.precio) || 0,
        stock: parseInt(row.cantidad, 10) || 0,
        imagenes: row.foto 
          ? row.foto.split(',').map(url => url.trim()).filter(url => url)
          : [PLACEHOLDER_IMAGE],
        categoria: row.categoria ? row.categoria.trim().toLowerCase() : 'otros',
        tamaño: parseFloat(row.tamaño) || null,
        alto: parseFloat(row.alto) || null,
        ancho: parseFloat(row.ancho) || null,
        profundidad: parseFloat(row.profundidad) || null,
        adicionales: row.adicionales ? row.adicionales.trim() : '',
        vendido: row.vendido === 'true',
        estado: row.estado ? row.estado.trim() : 'disponible'
      }));
    
    actualizarCategorias();
    actualizarUI();
  } catch (error) {
    console.error('Error al cargar productos:', error);
   if (elementos.galeriaProductos)
      elementos.galeriaProductos.innerHTML = '<p class="error-carga">No se pudieron cargar los productos. Intenta recargar la página.</p>';
    mostrarNotificacion('Error al cargar productos: ' + e.message, 'error');
  } finally {
    if (elementos.productLoader) elementos.productLoader.hidden = true;
  }
}


function actualizarCategorias() {
  if (!elementos.selectCategoria) return;
  
  const categoriasUnicas = [...new Set(productos.map(p => p.categoria))];
  const categorias = ['todos', ...categoriasUnicas];
  
  elementos.selectCategoria.innerHTML = categorias
    .map(cat => `
      <option value="${cat}">
        ${cat.charAt(0).toUpperCase() + cat.slice(1)}
      </option>
    `).join('');
}

function filtrarProductos() {
  return productos.filter(producto => {
    const { precioMin, precioMax, tamañoMin, tamañoMax, categoria, busqueda } = filtrosActuales;
    const busquedaLower = busqueda.toLowerCase();
    
    // Filtro por precio
    if (precioMin !== null && producto.precio < precioMin) return false;
    if (precioMax !== null && producto.precio > precioMax) return false;
    
    // Filtro por tamaño
    if (tamañoMin !== null && (producto.tamaño === null || producto.tamaño < tamañoMin)) return false;
    if (tamañoMax !== null && (producto.tamaño === null || producto.tamaño > tamañoMax)) return false;
    
    // Filtro por categoría
    if (categoria !== 'todos' && producto.categoria !== categoria) return false;
    
    // Filtro por búsqueda
    if (busqueda && 
        !producto.nombre.toLowerCase().includes(busquedaLower) && 
        !producto.descripcion.toLowerCase().includes(busquedaLower)) {
      return false;
    }
    
    return true;
  });
}

function crearCardProducto(producto) {
  const enCarrito = carrito.find(item => item.id === producto.id);
  const disponibles = producto.stock - (enCarrito?.cantidad || 0);
  const agotado = disponibles <= 0;
  const imagenPrincipal = producto.imagenes[0] || PLACEHOLDER_IMAGE;

  return `
  <div class="producto-card" data-id="${p.id}">
    ${imgHtml}
    <h3 class="producto-nombre">${p.nombre}</h3>
    <p class="producto-precio">$U ${p.precio.toLocaleString('es-UY')}</p>
    <p class="producto-stock">
      ${agot ? '<span class="texto-agotado">Agotado</span>' : `Stock: ${disp}`}
    </p>
    <div class="card-acciones">
      <input type="number" value="1" min="1" max="${disp}" class="cantidad-input" id="cantidad-${p.id}" ${agot || disp===1 ? 'disabled' : ''} style="background:#f7fff7;">
      <button class="boton-agregar${agot ? ' agotado' : ''}" data-id="${p.id}" ${agot ? 'disabled' : ''}>
        ${agot ? '<i class="fas fa-times-circle"></i> Agotado' : '<i class="fas fa-cart-plus"></i> Agregar'}
      </button>
    </div>
    <button class="boton-detalles" data-id="${p.id}">👀 Ver Detalle</button>
  </div>
`;
}

function renderizarPaginacion(totalProductos) {
  if (!elementos.paginacion) return;
  
  const totalPaginas = Math.ceil(totalProductos / PRODUCTOS_POR_PAGINA);
  elementos.paginacion.innerHTML = '';
  
  if (totalPaginas <= 1) return;
  
  for (let i = 1; i <= totalPaginas; i++) {
    const botonPagina = document.createElement('button');
    botonPagina.textContent = i;
    botonPagina.className = i === paginaActual ? 'pagina-activa' : '';
    botonPagina.addEventListener('click', () => {
      paginaActual = i;
      renderizarProductos();
    });
    elementos.paginacion.appendChild(botonPagina);
  }
}

function renderizarProductos() {
  if (!elementos.galeriaProductos) return;
  
  const productosFiltrados = filtrarProductos();
  const inicio = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
  const productosPagina = productosFiltrados.slice(inicio, inicio + PRODUCTOS_POR_PAGINA);
  
  if (productosPagina.length === 0) {
    elementos.galeriaProductos.innerHTML = `
      <p class="sin-resultados">
        No se encontraron productos con los filtros aplicados.
        <button onclick="resetearFiltros()">Mostrar todos</button>
      </p>`;
  } else {
    elementos.galeriaProductos.innerHTML = productosPagina.map(crearCardProducto).join('');
  }
  
  renderizarPaginacion(productosFiltrados.length);
  
  // Manejar eventos de los productos
  elementos.galeriaProductos.addEventListener('click', (e) => {
    const botonAgregar = e.target.closest('.boton-agregar');
    if (botonAgregar) {
      const id = +botonAgregar.dataset.id;
      const cantidadInput = document.getElementById(`cantidad-${id}`);
      const cantidad = parseInt(cantidadInput.value) || 1;
      agregarAlCarrito(id, cantidad);
      return;
    }
    
    const botonDetalles = e.target.closest('.boton-detalles');
    if (botonDetalles) {
      const id = +botonDetalles.dataset.id;
      const producto = productos.find(p => p.id === id);
      if (producto) mostrarModalProducto(producto);
    }
  });
}

// ===============================
// MODAL DE PRODUCTO
// ===============================

function mostrarModalProducto(producto) {
  if (!elementos.productoModal || !elementos.modalContenido) {
    console.error('Elementos del modal no encontrados');
    return;
  }

  const enCarrito = carrito.find(item => item.id === producto.id) || { cantidad: 0 };
  const disponibles = Math.max(0, producto.stock - enCarrito.cantidad);
  const agotado = disponibles <= 0;

  // Generar HTML del carrusel de imágenes
  const generarCarrusel = () => {
    const imagenesValidas = producto.imagenes.filter(img => img) || [PLACEHOLDER_IMAGE];
    const primeraImagen = imagenesValidas[0];
    
    let html = `
      <img src="${primeraImagen}" 
           class="modal-img" 
           id="modal-img-principal" 
           alt="${producto.nombre}" 
           loading="lazy"
           onerror="this.src='${PLACEHOLDER_IMAGE}'">`;
    
    if (imagenesValidas.length > 1) {
      html += `
        <div class="modal-thumbnails">
          ${imagenesValidas.map((img, index) => `
            <img src="${img}" 
                 class="modal-thumbnail ${index === 0 ? 'active' : ''}" 
                 alt="Miniatura ${index + 1}" 
                 data-index="${index}"
                 onerror="this.src='${PLACEHOLDER_IMAGE}'">
          `).join('')}
        </div>`;
    }
    
    return html;
  };

  // Generar HTML de los detalles del producto
  const generarDetalles = () => {
    let html = '';
    
    if (producto.adicionales) {
      html += `
        <div class="modal-detalle">
          <span class="detalle-etiqueta">Material:</span>
          <span class="detalle-valor">${producto.adicionales}</span>
        </div>`;
    }
    
    if (producto.alto && producto.ancho) {
      html += `
        <div class="modal-detalle">
          <span class="detalle-etiqueta">Medidas:</span>
          <span class="detalle-valor">
            ${producto.alto} × ${producto.ancho}
            ${producto.profundidad ? ' × ' + producto.profundidad : ''} cm
          </span>
        </div>`;
    }
    
    return html;
  };

  elementos.modalContenido.innerHTML = `
    <button class="cerrar-modal" aria-label="Cerrar modal">×</button>
    <div class="modal-flex">
      <div class="modal-carrusel">
        ${generarCarrusel()}
      </div>
      <div class="modal-info">
        <h1 class="modal-nombre">${producto.nombre}</h1>
        <p class="modal-precio">$U ${producto.precio.toLocaleString('es-UY')}</p>
        <p class="modal-stock ${agotado ? 'agotado' : 'disponible'}">
          ${agotado ? 'AGOTADO' : `Disponible: ${disponibles}`}
        </p>
        
        ${producto.descripcion ? `
          <div class="modal-descripcion">
            <p>${producto.descripcion}</p>
          </div>
        ` : ''}
        
        <div class="modal-detalles-container">
          ${generarDetalles()}
        </div>
        
        <div class="modal-acciones">
          <input type="number" 
                 id="cantidad-modal-${producto.id}"
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

  // Configurar eventos del modal
  const configurarEventosModal = () => {
    // Cambiar imagen principal al hacer clic en miniaturas
    if (producto.imagenes.length > 1) {
      const thumbnails = elementos.modalContenido.querySelectorAll('.modal-thumbnail');
      const mainImg = elementos.modalContenido.querySelector('#modal-img-principal');
      
      thumbnails.forEach(thumb => {
        thumb.addEventListener('click', () => {
          const index = thumb.dataset.index;
          thumbnails.forEach(t => t.classList.remove('active'));
          thumb.classList.add('active');
          mainImg.src = producto.imagenes[index];
        });
      });
    }
    
    // Botón cerrar modal
    const cerrarBtn = elementos.modalContenido.querySelector('.cerrar-modal');
    cerrarBtn.addEventListener('click', cerrarModal);
    
    // Botón agregar al carrito
    const agregarBtn = elementos.modalContenido.querySelector('.boton-agregar-modal');
    agregarBtn.addEventListener('click', () => {
      const cantidadInput = elementos.modalContenido.querySelector('.cantidad-modal-input');
      const cantidad = parseInt(cantidadInput.value) || 1;
      
      if (cantidad > 0 && cantidad <= disponibles) {
        agregarAlCarrito(producto.id, cantidad);
        mostrarNotificacion(`${producto.nombre} agregado al carrito`, 'exito');
        cerrarModal();
      }
    });
    
    // Cerrar al hacer clic fuera del contenido
    elementos.productoModal.addEventListener('click', (e) => {
      if (e.target === elementos.productoModal) {
        cerrarModal();
      }
    });
  };

  const mostrarModal = () => {
    elementos.productoModal.style.display = 'flex';
    document.body.classList.add('no-scroll');
    
    setTimeout(() => {
      elementos.productoModal.style.opacity = '1';
      elementos.productoModal.style.visibility = 'visible';
      elementos.modalContenido.querySelector('.cerrar-modal').focus();
    }, 10);
  };

  const cerrarModal = () => {
    elementos.productoModal.style.opacity = '0';
    elementos.productoModal.style.visibility = 'hidden';
    
    setTimeout(() => {
      elementos.productoModal.style.display = 'none';
      document.body.classList.remove('no-scroll');
    }, 300);
  };

  configurarEventosModal();
  mostrarModal();
}

// ===============================
// MANEJO DE FILTROS
// ===============================

function aplicarFiltros() {
  paginaActual = 1;
  renderizarProductos();
}

function resetearFiltros() {
  filtrosActuales = {
    precioMin: null,
    precioMax: null,
    tamañoMin: null,
    tamañoMax: null,
    categoria: 'todos',
    busqueda: ''
  };
  
  if (elementos.inputBusqueda) elementos.inputBusqueda.value = '';
  if (elementos.selectCategoria) elementos.selectCategoria.value = 'todos';
  if (elementos.precioMinInput) elementos.precioMinInput.value = '';
  if (elementos.precioMaxInput) elementos.precioMaxInput.value = '';
  if (elementos.tamañoMinInput) elementos.tamañoMinInput.value = '';
  if (elementos.tamañoMaxInput) elementos.tamañoMaxInput.value = '';
  
  aplicarFiltros();
}

// ===============================
// ACTUALIZACIÓN DE UI
// ===============================

function actualizarUI() {
  renderizarProductos();
  renderizarCarrito();
  actualizarContadorCarrito();
}

// ===============================
// PREGUNTAS FRECUENTES
// ===============================

function inicializarFAQs() {
  elementos.faqToggles?.forEach(toggle => {
    toggle.addEventListener('click', () => {
      const faqItem = toggle.closest('.faq-item');
      const content = faqItem.querySelector('.faq-content');
      const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
      
      toggle.setAttribute('aria-expanded', !isExpanded);
      
      if (!isExpanded) {
        content.style.maxHeight = content.scrollHeight + 'px';
        faqItem.classList.add('active');
      } else {
        content.style.maxHeight = '0';
        faqItem.classList.remove('active');
      }
    });
  });
}

// ===============================
// FORMULARIO DE CONTACTO
// ===============================

async function enviarFormularioContacto(event) {
  event.preventDefault();
  
  const form = event.target;
  const btnEnviar = elementos.btnEnviar;
  const successMessage = elementos.successMessage;
  
  // Validación
  const nombre = form.from_name.value.trim();
  const email = form.from_email.value.trim();
  const mensaje = form.message.value.trim();
  
  if (!nombre || !email || !mensaje) {
    mostrarNotificacion("Por favor complete todos los campos", "error");
    return;
  }
  
  if (!isValidEmail(email)) {
    mostrarNotificacion("Por favor ingrese un email válido", "error");
    return;
  }
  
  btnEnviar.disabled = true;
  btnEnviar.textContent = 'Enviando...';
  
  try {
    // Configurar EmailJS
    if (window.emailjs && !window.emailjsInitialized) {
      await emailjs.init("TU_USER_ID_DE_EMAILJS");
      window.emailjsInitialized = true;
    }
    
    if (window.emailjs) {
      await emailjs.sendForm(
        'TU_SERVICE_ID_DE_EMAILJS',
        'TU_TEMPLATE_ID_DE_EMAILJS',
        form
      );
    } else {
      // Fallback si EmailJS no está disponible
      const response = await fetch('/api/contacto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre, email, mensaje })
      });
      
      if (!response.ok) throw new Error('Error en el servidor');
    }
    
    // Éxito
    form.reset();
    mostrarNotificacion("¡Mensaje enviado con éxito!", "exito");
    
    if (successMessage) {
      successMessage.textContent = '¡Mensaje enviado con éxito!';
      successMessage.className = 'success-message';
      successMessage.style.display = 'block';
      setTimeout(() => {
        successMessage.style.display = 'none';
      }, 5000);
    }
  } catch (error) {
    console.error("Error al enviar el mensaje:", error);
    mostrarNotificacion("Error al enviar mensaje. Intenta de nuevo.", "error");
  } finally {
    btnEnviar.disabled = false;
    btnEnviar.textContent = 'Enviar mensaje';
  }
}

function inicializarFormularioContacto() {
  if (!elementos.formContacto) return;
  
  elementos.formContacto.addEventListener('input', function() {
    const nombre = this.from_name.value.trim();
    const email = this.from_email.value.trim();
    const mensaje = this.message.value.trim();
    
    elementos.btnEnviar.disabled = !(
      nombre && 
      email && 
      mensaje && 
      isValidEmail(email)
    );
  });
  
  elementos.formContacto.addEventListener('submit', enviarFormularioContacto);
}

// ===============================
// INICIALIZACIÓN DE EVENTOS
// ===============================

function inicializarEventos() {
  // Carrito
  elementos.carritoBtnMain?.addEventListener('click', toggleCarrito);
  elementos.carritoOverlay?.addEventListener('click', toggleCarrito);
  elementos.btnCerrarCarrito?.addEventListener('click', toggleCarrito);
  
  elementos.btnVaciarCarrito?.addEventListener('click', () => {
    if (carrito.length === 0) {
      mostrarNotificacion('El carrito ya está vacío', 'info');
      return;
    }
    
    if (confirm('¿Estás seguro de que deseas vaciar el carrito?')) {
      carrito = [];
      guardarCarrito();
      actualizarUI();
      mostrarNotificacion('Carrito vaciado', 'info');
    }
  });
  
  elementos.btnFinalizarCompra?.addEventListener('click', () => {
    if (carrito.length === 0) {
      mostrarNotificacion('El carrito está vacío', 'error');
      return;
    }
    elementos.avisoPreCompraModal.style.display = 'flex';
  });
  
  elementos.btnEntendidoAviso?.addEventListener('click', () => {
    mostrarNotificacion('Compra finalizada con éxito', 'exito');
    carrito = [];
    guardarCarrito();
    actualizarUI();
    toggleCarrito();
    elementos.avisoPreCompraModal.style.display = 'none';
  });
  
  elementos.btnCancelarAviso?.addEventListener('click', () => {
    elementos.avisoPreCompraModal.style.display = 'none';
  });
  
  // Filtros
  elementos.inputBusqueda?.addEventListener('input', (e) => {
    filtrosActuales.busqueda = e.target.value.toLowerCase();
    aplicarFiltros();
  });
  
  elementos.selectCategoria?.addEventListener('change', (e) => {
    filtrosActuales.categoria = e.target.value;
    aplicarFiltros();
  });
  
  document.querySelectorAll('.aplicar-rango-btn').forEach(boton => {
    boton.addEventListener('click', () => {
      const tipo = boton.dataset.rangeType;
      
      if (tipo === 'precio') {
        filtrosActuales.precioMin = elementos.precioMinInput.value ? 
          parseFloat(elementos.precioMinInput.value) : null;
        filtrosActuales.precioMax = elementos.precioMaxInput.value ? 
          parseFloat(elementos.precioMaxInput.value) : null;
      } else if (tipo === 'tamaño') {
        filtrosActuales.tamañoMin = elementos.tamañoMinInput.value ? 
          parseFloat(elementos.tamañoMinInput.value) : null;
        filtrosActuales.tamañoMax = elementos.tamañoMaxInput.value ? 
          parseFloat(elementos.tamañoMaxInput.value) : null;
      }
      
      aplicarFiltros();
    });
  });
  
  elementos.botonResetearFiltros?.addEventListener('click', resetearFiltros);
  
  // Menú hamburguesa
  elementos.hamburguesaBtn?.addEventListener('click', () => {
    const isOpen = elementos.menu.classList.toggle('active');
    elementos.hamburguesaBtn.setAttribute('aria-expanded', isOpen);
  });
  
  // Cerrar menú al hacer clic en enlaces
  document.querySelectorAll('.menu a').forEach(link => {
    link.addEventListener('click', () => {
      elementos.menu.classList.remove('active');
      elementos.hamburguesaBtn.setAttribute('aria-expanded', 'false');
    });
  });
  
  // Botón flotante
  window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
      elementos.btnFlotante?.classList.add('visible');
    } else {
      elementos.btnFlotante?.classList.remove('visible');
    }
  });
  
  elementos.btnFlotante?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  
  // Tecla Escape para cerrar modales
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (elementos.productoModal.style.display === 'flex') {
        cerrarModal();
      }
      if (elementos.carritoPanel.classList.contains('active')) {
        toggleCarrito();
      }
      if (elementos.avisoPreCompraModal.style.display === 'flex') {
        elementos.avisoPreCompraModal.style.display = 'none';
      }
    }
  });
  
  // Inicializar FAQs
  inicializarFAQs();
  
  // Inicializar formulario de contacto
  inicializarFormularioContacto();
}

// ===============================
// INICIALIZACIÓN PRINCIPAL
// ===============================

function init() {
  if (typeof document === 'undefined') return;
  
  console.log('Inicializando aplicación Patofelting...');
  evitarScrollPorDefecto();
  cargarCarrito();
  cargarProductosDesdeSheets();
  inicializarEventos();
}

// Iniciar la aplicación cuando el DOM esté listo
if (document.readyState !== 'loading') {
  init();
} else {
  document.addEventListener('DOMContentLoaded', init);
}

// Hacer accesible resetearFiltros desde el HTML
window.resetearFiltros = resetearFiltros;
