// ===============================
// CONFIGURACIÓN INICIAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const CSV_URL = window.SHEET_CSV_URL;
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

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
  btnCerrarCarrito: document.querySelector('.cerrar-carrito'),
  btnEntendidoAviso: getElement('btn-entendido-aviso'),
  btnCancelarAviso: getElement('btn-cancelar-aviso'),
  avisoPreCompraModal: getElement('aviso-pre-compra-modal'),
  productLoader: getElement('product-loader')
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
  }, 3000);
}

// ===============================
// MANEJO DEL CARRITO
// ===============================
function guardarCarrito() {
  localStorage.setItem(LS_CARRITO_KEY, JSON.stringify(carrito));
  actualizarContadorCarrito();
}

function cargarCarrito() {
  try {
    carrito = JSON.parse(localStorage.getItem(LS_CARRITO_KEY)) || [];
    actualizarContadorCarrito();
  } catch {
    carrito = [];
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
  const disponibles = Math.max(0, prod.stock - (enCarrito?.cantidad || 0));
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
  elementos.listaCarrito.innerHTML = carrito.map(i => {
    const prod = productos.find(p => p.id === i.id);
    const disp = Math.max(0, prod ? prod.stock - i.cantidad : 0);
    return `
      <li class="carrito-item">
        ${i.imagen ? `<img src="${i.imagen}" class="carrito-item-img" alt="${i.nombre}" loading="lazy">` : ''}
        <div class="carrito-item-info">
          <span class="carrito-item-nombre">${i.nombre}</span>
          <span class="carrito-item-subtotal">$U ${(i.precio * i.cantidad).toLocaleString('es-UY')}</span>
          <div class="carrito-item-controls">
            <button data-id="${i.id}" data-action="decrementar" aria-label="Reducir cantidad">-</button>
            <span class="carrito-item-cantidad">${i.cantidad}</span>
            <button data-id="${i.id}" data-action="incrementar" aria-label="Aumentar cantidad" ${disp <= 0 ? 'disabled' : ''}>+</button>
            <button data-id="${i.id}" class="eliminar-item" aria-label="Eliminar del carrito">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      </li>`;
  }).join('');
  const total = carrito.reduce((sum, i) => sum + i.precio * i.cantidad, 0);
  elementos.totalCarrito.textContent = `Total: $U ${total.toLocaleString('es-UY')}`;
  elementos.listaCarrito.onclick = (e) => {
    const target = e.target.closest('[data-id]');
    if (!target) return;
    const id = +target.dataset.id;
    const action = target.dataset.action;
    const item = carrito.find(i => i.id === id);
    const prod = productos.find(p => p.id === id);
    if (!item || !prod) return;
    if (action === 'incrementar') {
      const disp = prod.stock - item.cantidad;
      if (disp > 0) {
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
  };
}

function toggleCarrito() {
  if (!elementos.carritoPanel || !elementos.carritoOverlay) return;
  const isOpen = elementos.carritoPanel.classList.toggle('active');
  elementos.carritoOverlay.classList.toggle('active', isOpen);
  document.body.classList.toggle('no-scroll', isOpen);
  if (isOpen) renderizarCarrito();
}

// ===============================
// MANEJO DE PRODUCTOS Y FILTROS
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
  } catch (e) {
    if (elementos.galeriaProductos)
      elementos.galeriaProductos.innerHTML = '<p class="error-carga">No se pudieron cargar los productos.</p>';
    mostrarNotificacion('Error al cargar productos: ' + (e.message || e), 'error');
  }
}

function actualizarCategorias() {
  if (!elementos.selectCategoria) return;
  const cats = ['todos', ...new Set(productos.map(p => p.categoria))];
  elementos.selectCategoria.innerHTML = cats
    .map(cat => `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`)
    .join('');
}

function filtrarProductos() {
  return productos.filter(p => {
    const { precioMin, precioMax, categoria, busqueda } = filtrosActuales;
    const b = busqueda?.toLowerCase() || "";
    return (
      (precioMin === null || p.precio >= precioMin) &&
      (precioMax === null || p.precio <= precioMax) &&
      (categoria === 'todos' || p.categoria === categoria) &&
      (!b || p.nombre.toLowerCase().includes(b) || p.descripcion.toLowerCase().includes(b))
    );
  });
}

// ===============================
// RENDER PRODUCTOS Y PAGINACIÓN
// ===============================
function crearCardProducto(p) {
  const enCarrito = carrito.find(i => i.id === p.id);
  const disp = Math.max(0, p.stock - (enCarrito?.cantidad || 0));
  const agot = disp <= 0;
  return `
    <div class="producto-card" data-id="${p.id}">
      <img src="${p.imagenes[0] || PLACEHOLDER_IMAGE}" alt="${p.nombre}" class="producto-img" loading="lazy">
      <h3 class="producto-nombre">${p.nombre}</h3>
      <p class="producto-precio">$U ${p.precio.toLocaleString('es-UY')}</p>
      <p class="producto-stock">
        ${agot ? '<span class="texto-agotado">Agotado</span>' : `Stock: ${disp}`}
      </p>
      <div class="card-acciones">
        <input type="number" value="1" min="1" max="${disp}" class="cantidad-input" id="cantidad-${p.id}" ${agot || disp === 1 ? 'disabled' : ''} style="background:#f7fff7;">
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

  contenido.innerHTML = `
    <button class="cerrar-modal" aria-label="Cerrar modal">×</button>
    <div class="modal-flex">
      <div class="modal-carrusel">
        <img src="${producto.imagenes[0] || PLACEHOLDER_IMAGE}" class="modal-img" alt="${producto.nombre}">
        ${producto.imagenes.length > 1 ? `
          <div class="modal-controls">
            <button class="modal-prev" aria-label="Imagen anterior">‹</button>
            <button class="modal-next" aria-label="Siguiente imagen">›</button>
          </div>
        ` : ''}
      </div>
      <div class="modal-info">
        <h1 class="modal-nombre">${producto.nombre}</h1>
        <p class="modal-precio">$U ${producto.precio.toLocaleString('es-UY')}</p>
        <p class="modal-stock ${agotado ? 'agotado' : 'disponible'}">
          ${agotado ? 'AGOTADO' : `Disponible: ${disponibles}`}
        </p>
        <div class="modal-descripcion">
          ${producto.descripcion || ''}
        </div>
        <div class="modal-thumbnails">
          ${producto.imagenes.map((img, i) => `
            <img src="${img}" class="thumbnail ${i === 0 ? 'active' : ''}" 
                 data-index="${i}" alt="Miniatura ${i + 1}">
          `).join('')}
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

  // Carrusel
  if (producto.imagenes.length > 1) {
    let currentIndex = 0;
    const mainImage = contenido.querySelector('.modal-img');
    const thumbnails = contenido.querySelectorAll('.thumbnail');
    function updateImage(index) {
      currentIndex = index;
      mainImage.src = producto.imagenes[index];
      thumbnails.forEach((thumb, i) => {
        thumb.classList.toggle('active', i === index);
      });
    }
    contenido.querySelector('.modal-prev')?.addEventListener('click', () => {
      const newIndex = (currentIndex - 1 + producto.imagenes.length) % producto.imagenes.length;
      updateImage(newIndex);
    });
    contenido.querySelector('.modal-next')?.addEventListener('click', () => {
      const newIndex = (currentIndex + 1) % producto.imagenes.length;
      updateImage(newIndex);
    });
    thumbnails.forEach((thumb, i) => {
      thumb.addEventListener('click', () => updateImage(i));
    });
  }
  contenido.querySelector('.cerrar-modal').onclick = () => cerrarModal();
  const agregarBtn = contenido.querySelector('.boton-agregar-modal');
  agregarBtn.onclick = () => {
    const cantidad = +(contenido.querySelector('.cantidad-modal-input').value || 1);
    agregarAlCarrito(producto.id, cantidad);
    cerrarModal();
  };
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
    setTimeout(() => { modal.style.display = 'none'; document.body.classList.remove('no-scroll'); }, 300);
  }
}

// ===============================
// EVENTO CLICK EN DETALLE DEL PRODUCTO
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
      const cantidadInput = document.getElementById(`cantidad-${id}`);
      const cantidad = cantidadInput ? parseInt(cantidadInput.value) : 1;
      agregarAlCarrito(id, cantidad);
    }
  };
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
// MENÚ HAMBURGUESA Y FAQ
// ===============================
function inicializarMenuHamburguesa() {
  const hamburguesa = document.querySelector('.hamburguesa');
  const menu = document.getElementById('menu');
  if (!hamburguesa || !menu) return;
  hamburguesa.addEventListener('click', function () {
    const expanded = menu.classList.toggle('active'); // Usa .active (ajusta aquí si tu CSS usa .menu-abierto)
    hamburguesa.setAttribute('aria-expanded', expanded);
    document.body.classList.toggle('no-scroll', expanded);
  });
  menu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      menu.classList.remove('active');
      hamburguesa.setAttribute('aria-expanded', false);
      document.body.classList.remove('no-scroll');
    });
  });
}

function inicializarFAQ() {
  const faqToggles = document.querySelectorAll('.faq-toggle');
  faqToggles.forEach(toggle => {
    toggle.addEventListener('click', () => {
      const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', !isExpanded);
      const content = toggle.nextElementSibling;
      content.hidden = isExpanded;
    });
  });
}

// ===============================
// INICIALIZACIÓN
// ===============================
function inicializarEventos() {
  // Carrito
  elementos.carritoBtnMain?.addEventListener('click', toggleCarrito);
  elementos.carritoOverlay?.addEventListener('click', toggleCarrito);
  elementos.btnCerrarCarrito?.addEventListener('click', toggleCarrito);
  elementos.btnVaciarCarrito?.addEventListener('click', () => {
    if (carrito.length === 0) return mostrarNotificacion('El carrito ya está vacío', 'info');
    if (confirm('¿Vaciar carrito?')) {
      carrito = [];
      guardarCarrito();
      actualizarUI();
      mostrarNotificacion('Carrito vaciado', 'info');
    }
  });

  // Finalizar compra
  elementos.btnFinalizarCompra?.addEventListener('click', () => {
    if (carrito.length === 0) return mostrarNotificacion('El carrito está vacío', 'error');
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
      filtrosActuales.precioMin = elementos.precioMinInput.value ? parseFloat(elementos.precioMinInput.value) : null;
      filtrosActuales.precioMax = elementos.precioMaxInput.value ? parseFloat(elementos.precioMaxInput.value) : null;
      aplicarFiltros();
    });
  });
  elementos.botonResetearFiltros?.addEventListener('click', resetearFiltros);

  // Modal de producto
  conectarEventoModal();
}

// ===============================
// INICIALIZACIÓN UNIFICADA Y SEGURA
// ===============================
function init() {
  inicializarMenuHamburguesa();
  inicializarFAQ();

  // Ocultar modales y loader al inicio
  if (elementos.avisoPreCompraModal) elementos.avisoPreCompraModal.style.display = 'none';
  if (elementos.productoModal) elementos.productoModal.style.display = 'none';
  if (elementos.productLoader) {
    elementos.productLoader.style.display = 'none';
    elementos.productLoader.hidden = true;
  }
  cargarCarrito();
  cargarProductosDesdeSheets();
  inicializarEventos();
}

// Arranque seguro, una sola vez:
if (document.readyState !== 'loading') {
  init();
} else {
  document.addEventListener('DOMContentLoaded', init);
}

// ==== FUNCIONES GLOBALES SI LAS NECESITAS ====
window.resetearFiltros = resetearFiltros;
window.toggleCarrito = toggleCarrito;
window.agregarAlCarrito = agregarAlCarrito;
window.mostrarModalProducto = mostrarModalProducto;
window.mostrarNotificacion = mostrarNotificacion;
window.cargarProductosDesdeSheets = cargarProductosDesdeSheets;
window.guardarCarrito = guardarCarrito;


// Initialize EmailJS with your public key

js.init('o4IxJz0Zz-LQ8jYKG'); // Replace with your EmailJS public key
// ===============================
// CONTACT FORM
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

// Inicializar EmailJS con tu clave pública
emailjs.init('o4IxJz0Zz-LQ8jYKG'); // Reemplaza con tu clave pública de EmailJS

// Llamar a la función para configurar el formulario de contacto
setupContactForm();
