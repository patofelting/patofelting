// ===============================
// CONFIGURACIÓN INICIAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const CSV_URL = window.SHEET_CARRITO_URL || '';
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/200';

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
let lazyObserver = null;

// ===============================
// REFERENCIAS AL DOM
// ===============================
const getElement = (id) => document.getElementById(id) || null;
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
  btnFlotante: document.querySelector('.boton-flotante'),
  avisoPreCompraModal: getElement('aviso-pre-compra-modal'),
  btnEntendidoAviso: getElement('btn-entendido-aviso'),
  btnCancelarAviso: getElement('btn-cancelar-aviso')
};

// ===============================
// FUNCIONES AUXILIARES
// ===============================
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

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
  requestAnimationFrame(() => notificacion.classList.add('show'));
  setTimeout(() => {
    notificacion.classList.remove('show');
    setTimeout(() => notificacion.remove(), 300);
  }, 3000);
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
  }
}

function cargarCarrito() {
  try {
    const data = localStorage.getItem(LS_CARRITO_KEY);
    carrito = data ? JSON.parse(data) : [];
    actualizarContadorCarrito();
  } catch {
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
  if (!prod) return mostrarNotificacion('Producto no encontrado', 'error');

  cantidad = Math.min(parseInt(cantidad, 10) || 1, prod.stock);
  if (cantidad < 1) return mostrarNotificacion('Cantidad inválida', 'error');

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

  elementos.listaCarrito.innerHTML = carrito.map(i => `
    <li class="carrito-item" data-id="${i.id}">
      ${i.imagen ? `<img src="${i.imagen}" class="carrito-item-img" alt="${i.nombre}" loading="lazy">` : ''}
      <div class="carrito-item-info">
        <span class="carrito-item-nombre">${i.nombre}</span>
        <span class="carrito-item-subtotal">$U ${(i.precio * i.cantidad).toLocaleString('es-UY')}</span>
        <div class="carrito-item-controls">
          <button data-action="decrementar" aria-label="Reducir cantidad">-</button>
          <span class="carrito-item-cantidad">${i.cantidad}</span>
          <button data-action="incrementar" aria-label="Aumentar cantidad">+</button>
          <button class="eliminar-item" aria-label="Eliminar del carrito">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    </li>`).join('');

  const total = carrito.reduce((sum, i) => sum + i.precio * i.cantidad, 0);
  elementos.totalCarrito.textContent = `Total: $U ${total.toLocaleString('es-UY')}`;

  elementos.listaCarrito.onclick = (e) => {
    const item = e.target.closest('.carrito-item');
    if (!item) return;

    const id = +item.dataset.id;
    const target = e.target.closest('button');
    if (!target) return;

    const action = target.dataset.action;
    const prod = productos.find(p => p.id === id);
    const cartItem = carrito.find(i => i.id === id);

    if (!cartItem || !prod) return;

    if (action === 'incrementar') {
      const disp = prod.stock - cartItem.cantidad;
      if (disp > 0) {
        cartItem.cantidad++;
        guardarCarrito();
        renderizarCarrito();
      } else {
        mostrarNotificacion('No hay más stock disponible', 'error');
      }
    } else if (action === 'decrementar') {
      cartItem.cantidad--;
      if (cartItem.cantidad <= 0) {
        carrito = carrito.filter(i => i.id !== id);
      }
      guardarCarrito();
      renderizarCarrito();
    } else if (target.classList.contains('eliminar-item')) {
      carrito = carrito.filter(i => i.id !== id);
      guardarCarrito();
      renderizarCarrito();
      mostrarNotificacion('Producto eliminado del carrito', 'info');
    }
  };
}

function toggleCarrito() {
  if (!elementos.carritoPanel || !elementos.carritoOverlay) return;

  const isOpen = elementos.carritoPanel.classList.toggle('open');
  elementos.carritoOverlay.classList.toggle('active', isOpen);
  document.body.classList.toggle('no-scroll', isOpen);

  if (isOpen) {
    setTimeout(() => elementos.carritoPanel.focus(), 100);
    renderizarCarrito();
  }
}

// ===============================
// MANEJO DE PRODUCTOS
// ===============================
async function cargarProductosDesdeSheets() {
  if (!elementos.galeriaProductos) return;

  elementos.galeriaProductos.innerHTML = '<p>Cargando productos...</p>';

  try {
    const resp = await fetch(CSV_URL, { headers: { 'Cache-Control': 'no-store' } });
    if (!resp.ok) throw new Error('Error al cargar productos desde el servidor');

    const csvText = await resp.text();
    if (typeof Papa === 'undefined') throw new Error('Papa Parse no está disponible');

    const { data, errors } = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '_')
    });

    if (errors.length) throw new Error('Errores al procesar el CSV: ' + errors.map(e => e.message).join('; '));
    if (!data || data.length === 0) throw new Error('No se encontraron productos en el CSV');

    productos = data
      .filter(r => r.id && r.nombre && r.precio)
      .map(r => ({
        id: parseInt(r.id, 10),
        nombre: r.nombre.trim() || 'Sin Nombre',
        descripcion: r.descripcion?.trim() || '',
        precio: parseFloat(r.precio) || 0,
        stock: parseInt(r.cantidad, 10) || 0,
        imagenes: (r.foto && r.foto.trim()) ? r.foto.split(',').map(x => x.trim()).filter(x => x) : [],
        adicionales: r.adicionales?.trim() || '',
        alto: parseFloat(r.alto) || null,
        ancho: parseFloat(r.ancho) || null,
        profundidad: parseFloat(r.profundidad) || null,
        categoria: r.categoria?.trim().toLowerCase() || 'otros',
        tamaño: parseFloat(r.tamaño) || null,
        vendido: r.vendido?.trim().toLowerCase() === 'true',
        estado: r.estado?.trim() || ''
      }));

    actualizarCategorias();
    actualizarUI();
  } catch (e) {
    elementos.galeriaProductos.innerHTML = '<p>No se pudieron cargar los productos. Intente recargar la página.</p>';
    mostrarNotificacion('Error al cargar productos: ' + e.message, 'error');
  }
}

function actualizarCategorias() {
  if (!elementos.selectCategoria) return;
  const categorias = ['todos', ...new Set(productos.map(p => p.categoria))];
  elementos.selectCategoria.innerHTML = categorias
    .map(cat => `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`)
    .join('');
}

function filtrarProductos(lista) {
  return lista.filter(p => {
    const { precioMin, precioMax, tamañoMin, tamañoMax, categoria, busqueda } = filtrosActuales;
    const busquedaLower = busqueda.toLowerCase();

    return (
      (precioMin === null || p.precio >= precioMin) &&
      (precioMax === null || p.precio <= precioMax) &&
      (tamañoMin === null || (p.tamaño !== null && p.tamaño >= tamañoMin)) &&
      (tamañoMax === null || (p.tamaño !== null && p.tamaño <= tamañoMax)) &&
      (categoria === 'todos' || p.categoria === categoria) &&
      (!busqueda || p.nombre.toLowerCase().includes(busquedaLower) || p.descripcion.toLowerCase().includes(busquedaLower))
    );
  });
}

function crearCardProducto(p) {
  const enCarrito = carrito.find(i => i.id === p.id) || { cantidad: 0 };
  const disp = p.stock - enCarrito.cantidad;
  const agot = disp <= 0;
  const primeraImagen = p.imagenes[0] || PLACEHOLDER_IMAGE;
  return `
    <div class="producto-card" data-id="${p.id}">
      <img src="${primeraImagen}" alt="${p.nombre}" class="producto-img" loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}'">
      <h3 class="producto-nombre">${p.nombre}</h3>
      <p class="producto-precio">$U ${p.precio.toLocaleString('es-UY')}</p>
      <p class="producto-stock">${agot ? '<span class="texto-agotado">Agotado</span>' : `Stock: ${disp}`}</p>
      <div class="card-acciones">
        <input type="number" value="1" min="1" max="${disp}" class="cantidad-input" id="cantidad-${p.id}" ${agot ? 'disabled' : ''}>
        <button class="boton-agregar ${agot ? 'agotado' : ''}" data-id="${p.id}" ${agot ? 'disabled' : ''}>
          ${agot ? '<i class="fas fa-times-circle"></i> Agotado' : '<i class="fas fa-cart-plus"></i> Agregar'}
        </button>
      </div>
      <button class="boton-detalles" data-id="${p.id}">Ver Detalles</button>
    </div>
  `;
}

function renderizarPaginacion(total) {
  const pages = Math.ceil(total / PRODUCTOS_POR_PAGINA);
  if (!elementos.paginacion || pages <= 1) return;

  elementos.paginacion.innerHTML = Array.from({ length: pages }, (_, i) => {
    const page = i + 1;
    return `<button class="${page === paginaActual ? 'pagina-activa' : ''}" data-page="${page}">${page}</button>`;
  }).join('');

  elementos.paginacion.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      paginaActual = +btn.dataset.page;
      renderizarProductos();
    });
  });
}

function renderizarProductos() {
  if (!elementos.galeriaProductos) return;

  const list = filtrarProductos(productos);
  const inicio = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
  const slice = list.slice(inicio, inicio + PRODUCTOS_POR_PAGINA);

  elementos.galeriaProductos.innerHTML = slice.length
    ? slice.map(crearCardProducto).join('')
    : '<p>No se encontraron productos con los filtros aplicados.</p>';

  elementos.galeriaProductos.onclick = (e) => {
    const target = e.target.closest('.boton-agregar');
    if (target) {
      const id = +target.dataset.id;
      const cant = +document.getElementById(`cantidad-${id}`).value || 1;
      agregarAlCarrito(id, cant);
      return;
    }

    const detalleBtn = e.target.closest('.boton-detalles');
    if (detalleBtn) {
      const id = +detalleBtn.dataset.id;
      const prod = productos.find(p => p.id === id);
      if (prod) mostrarModalProducto(prod);
    }
  };

  renderizarPaginacion(list.length);
}

// ===============================
// MODAL DE PRODUCTO
// ===============================
function mostrarModalProducto(producto) {
  if (!elementos.productoModal || !elementos.modalContenido) return;

  const enCarrito = carrito.find(item => item.id === producto.id) || { cantidad: 0 };
  const disponible = Math.max(0, producto.stock - enCarrito.cantidad);
  const estaAgotado = disponible <= 0;

  const generarCarrusel = () => {
    const imagenesValidas = (producto.imagenes || []).filter(img => img);
    const tieneImagenes = imagenesValidas.length > 0;
    const primeraImagen = tieneImagenes ? imagenesValidas[0] : PLACEHOLDER_IMAGE;

    let html = `
      <img src="${primeraImagen}" 
           class="modal-img" 
           id="modal-img-principal" 
           alt="${producto.nombre}" 
           loading="lazy"
           onerror="this.onerror=null;this.src='${PLACEHOLDER_IMAGE}'">`;

    if (tieneImagenes && imagenesValidas.length > 1) {
      html += `
        <div class="modal-thumbnails">
          ${imagenesValidas.map((img, index) => `
            <img src="${img}" 
                 class="modal-thumbnail ${index === 0 ? 'active' : ''}" 
                 alt="Miniatura ${index + 1} de ${producto.nombre}"
                 data-index="${index}"
                 onerror="this.onerror=null;this.src='${PLACEHOLDER_IMAGE}'">
          `).join('')}
        </div>`;
    }

    return html;
  };

  elementos.modalContenido.innerHTML = `
    <button class="cerrar-modal" aria-label="Cerrar modal de producto">×</button>
    <div class="modal-flex">
      <div class="modal-carrusel">${generarCarrusel()}</div>
      <div class="modal-info">
        <h1 class="modal-nombre">${producto.nombre}</h1>
        <div class="modal-precio" aria-label="Precio">$U ${producto.precio.toLocaleString('es-UY')}</div>
        <div class="modal-stock ${estaAgotado ? 'agotado' : 'disponible'}" aria-live="polite">
          ${estaAgotado ? 'AGOTADO' : `Disponible: ${disponible}`}
        </div>
        ${producto.descripcion ? `<div class="modal-descripcion"><h2 class="sr-only">Descripción</h2><p>${producto.descripcion}</p></div>` : ''}
        <div class="modal-detalles-container">
          ${producto.adicionales ? `<div class="modal-detalle"><span class="detalle-etiqueta">Material:</span><span class="detalle-valor">${producto.adicionales}</span></div>` : ''}
          ${producto.alto && producto.ancho ? `<div class="modal-detalle"><span class="detalle-etiqueta">Medidas:</span><span class="detalle-valor">${producto.alto} × ${producto.ancho}${producto.profundidad ? ' × ' + producto.profundidad : ''} cm</span></div>` : ''}
        </div>
        <div class="modal-acciones">
          <label for="cantidad-modal-${producto.id}" class="sr-only">Cantidad</label>
          <input type="number" 
                 id="cantidad-modal-${producto.id}"
                 value="1" 
                 min="1" 
                 max="${disponible}" 
                 class="cantidad-modal-input" 
                 ${estaAgotado ? 'disabled aria-disabled="true"' : ''}>
          <button class="boton-agregar-modal ${estaAgotado ? 'agotado' : ''}" 
                  data-id="${producto.id}"
                  ${estaAgotado ? 'disabled aria-disabled="true"' : ''}
                  aria-label="${estaAgotado ? 'Producto agotado' : 'Agregar al carrito'}">
            ${estaAgotado ? 'Agotado' : 'Agregar al carrito'}
          </button>
        </div>
      </div>
    </div>
  `;

  const configurarEventos = () => {
    const mainImg = elementos.modalContenido.querySelector('#modal-img-principal');
    const thumbnails = elementos.modalContenido.querySelectorAll('.modal-thumbnail');
    const cerrarBtn = elementos.modalContenido.querySelector('.cerrar-modal');
    const agregarBtn = elementos.modalContenido.querySelector('.boton-agregar-modal');

    if (thumbnails.length > 1) {
      thumbnails.forEach(thumb => {
        thumb.addEventListener('click', () => {
          thumbnails.forEach(t => t.classList.remove('active'));
          thumb.classList.add('active');
          mainImg.src = producto.imagenes[thumb.dataset.index];
        });
      });
    }

    cerrarBtn.addEventListener('click', cerrarModal);
    agregarBtn.addEventListener('click', () => {
      const cantidadInput = elementos.modalContenido.querySelector('.cantidad-modal-input');
      const cantidad = Math.min(parseInt(cantidadInput.value) || 1, disponible);
      agregarAlCarrito(producto.id, cantidad);
      mostrarNotificacion(`${producto.nombre} agregado al carrito`, 'exito');
      cerrarModal();
    });

    elementos.productoModal.addEventListener('click', (e) => {
      if (e.target === elementos.productoModal) cerrarModal();
    });
  };

  const mostrarModal = () => {
    elementos.productoModal.style.display = 'flex';
    document.body.classList.add('no-scroll');
    requestAnimationFrame(() => {
      elementos.productoModal.style.opacity = '1';
      elementos.productoModal.style.visibility = 'visible';
      cerrarBtn.focus();
    });
  };

  const cerrarModal = () => {
    elementos.productoModal.style.opacity = '0';
    elementos.productoModal.style.visibility = 'hidden';
    setTimeout(() => {
      elementos.productoModal.style.display = 'none';
      document.body.classList.remove('no-scroll');
    }, 300);
  };

  configurarEventos();
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
// INICIALIZACIÓN DE EVENTOS
// ===============================
function inicializarEventos() {
  // Carrito
  [elementos.carritoBtnMain, elementos.carritoOverlay, elementos.btnCerrarCarrito].forEach(el => {
    el?.addEventListener('click', toggleCarrito);
  });

  elementos.btnVaciarCarrito?.addEventListener('click', () => {
    carrito = [];
    guardarCarrito();
    actualizarUI();
    toggleCarrito();
    mostrarNotificacion('Carrito vaciado', 'info');
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
  elementos.inputBusqueda?.addEventListener('input', debounce((e) => {
    filtrosActuales.busqueda = e.target.value.toLowerCase();
    aplicarFiltros();
  }, 300));

  elementos.selectCategoria?.addEventListener('change', (e) => {
    filtrosActuales.categoria = e.target.value;
    aplicarFiltros();
  });

  document.querySelectorAll('.aplicar-rango-btn').forEach(b => {
    b.addEventListener('click', () => {
      const t = b.dataset.rangeType;
      if (t === 'precio') {
        filtrosActuales.precioMin = elementos.precioMinInput?.value ? +elementos.precioMinInput.value : null;
        filtrosActuales.precioMax = elementos.precioMaxInput?.value ? +elementos.precioMaxInput.value : null;
      } else if (t === 'tamaño') {
        filtrosActuales.tamañoMin = elementos.tamañoMinInput?.value ? +elementos.tamañoMinInput.value : null;
        filtrosActuales.tamañoMax = elementos.tamañoMaxInput?.value ? +elementos.tamañoMaxInput.value : null;
      }
      aplicarFiltros();
    });
  });

  elementos.botonResetearFiltros?.addEventListener('click', resetearFiltros);

  // Menú hamburguesa
  elementos.hamburguesaBtn?.addEventListener('click', () => {
    elementos.menu?.classList.toggle('open');
  });

  // Botón flotante
  elementos.btnFlotante?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Tecla Escape para cerrar modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elementos.productoModal?.style.display === 'flex') {
      cerrarModal();
    }
  });

  // FAQs
  if (elementos.faqToggles?.length) {
    elementos.faqToggles.forEach(toggle => {
      toggle.addEventListener('click', () => {
        const faqItem = toggle.closest('.faq-item');
        if (faqItem) faqItem.classList.toggle('active');
      });
    });
  } else {
    console.warn('No se encontraron elementos .faq-toggle en el DOM');
  }

  // Formulario de contacto
  if (window.emailjs) {
    emailjs.init('o4IxJz0Zz-LQ8jYKG');

    elementos.formContacto?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const btnEnviar = getElement('btn-enviar');
      const successMessage = getElement('success-message');

      if (!btnEnviar) return;

      btnEnviar.disabled = true;
      btnEnviar.textContent = 'Enviando...';

      try {
        const formData = new FormData(elementos.formContacto);
        const data = Object.fromEntries(formData.entries());

        // Intento de envío al backend (opcional)
        let backendResponse = true; // Simulamos éxito por ahora
        if (window.location.hostname !== 'localhost') { // Evitar en desarrollo local
          const resp = await fetch('/api/contacto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          backendResponse = resp.ok;
          if (!resp.ok) throw new Error('Error en el backend');
        }

        // Envío con EmailJS
        await emailjs.sendForm('service_89by24g', 'template_8mn7hdp', elementos.formContacto);

        elementos.formContacto.reset();
        if (successMessage) {
          successMessage.classList.add('success');
          setTimeout(() => successMessage.classList.remove('success'), 5000);
        }
        mostrarNotificacion('¡Mensaje enviado con éxito!', 'exito');
      } catch (err) {
        console.error('Error en el envío:', err);
        mostrarNotificacion('Error al enviar el mensaje. Por favor, intente nuevamente.', 'error');
      } finally {
        btnEnviar.disabled = false;
        btnEnviar.textContent = 'Enviar mensaje';
      }
    });
  }
}

// ===============================
// INICIALIZACIÓN PRINCIPAL
// ===============================
function init() {
  if (typeof document === 'undefined') {
    console.warn('Este script debe ejecutarse en el navegador');
    return;
  }

  console.log('Inicializando la aplicación... a las', new Date().toLocaleString());
  cargarCarrito();
  cargarProductosDesdeSheets();
  inicializarEventos();
  evitarScrollPorDefecto();

  // Lazy loading para imágenes
  if ('IntersectionObserver' in window) {
    lazyObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src || img.src;
          lazyObserver.unobserve(img);
        }
      });
    }, { rootMargin: '100px' });

    document.querySelectorAll('img[data-src]').forEach(img => {
      lazyObserver.observe(img);
    });
  }
}

if (document.readyState !== 'loading') {
  init();
} else {
  document.addEventListener('DOMContentLoaded', init);
}
