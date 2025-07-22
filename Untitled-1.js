// ===============================
// 1. CONFIGURACIÓN Y CONSTANTES
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const CSV_URL = window.SHEET_CSV_URL;
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

// ===============================
// 2. ESTADO GLOBAL
// ===============================
let productos = [];
let carrito = [];
let paginaActual = 1;
let filtrosActuales = {
  precioMin: null,
  precioMax: null,
  categoria: 'Todos',
  busqueda: ''
};

// ===============================
// 3. REFERENCIAS AL DOM
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
  carritoPanel: document.getElementById('carrito-panel'),
  carritoOverlay: document.querySelector('.carrito-overlay'),
  btnVaciarCarrito: document.querySelector('.boton-vaciar-carrito'),
  btnCerrarCarrito: document.querySelector('.cerrar-carrito'),
  btnFinalizarCompra: document.querySelector('.boton-finalizar-compra'),
};

// ===============================
// 4. FUNCIONES AUXILIARES
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
// 5. CARGA Y FILTRO DE PRODUCTOS
// ===============================
async function cargarProductosDesdeSheets() {
  try {
    const resp = await fetch(CSV_URL, { headers: { 'Cache-Control': 'no-store' } });
    if (!resp.ok) throw new Error('Error al cargar productos');
    const csvText = await resp.text();
    if (typeof Papa === 'undefined') throw new Error('Papa Parse no disponible');
    const { data } = Papa.parse(csvText, { header: true, skipEmptyLines: true });
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
        categoria: r.categoria ? r.categoria.trim() : 'Otros',
        vendido: r.vendido ? r.vendido.trim().toLowerCase() === 'true' : false
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
  const cats = ['Todos', ...new Set(productos.map(p => p.categoria).filter(Boolean))];
  elementos.selectCategoria.innerHTML = cats
    .map(cat => `<option value="${cat}">${cat}</option>`)
    .join('');
}

function filtrarProductos() {
  return productos.filter(p => {
    const { precioMin, precioMax, categoria, busqueda } = filtrosActuales;
    const b = busqueda?.toLowerCase() || "";
    return (
      (precioMin === null || p.precio >= precioMin) &&
      (precioMax === null || p.precio <= precioMax) &&
      (categoria === 'Todos' || p.categoria === categoria) &&
      (!b || p.nombre.toLowerCase().includes(b) || p.descripcion.toLowerCase().includes(b))
    );
  });
}

// ===============================
// 6. RENDER DE PRODUCTOS Y PAGINACIÓN
// ===============================
function crearCardProducto(p) {
  const agotado = p.stock <= 0;
  return `
    <div class="producto-card" data-id="${p.id}">
      <img src="${p.imagenes[0] || PLACEHOLDER_IMAGE}" alt="${p.nombre}" class="producto-img" loading="lazy">
      <h3 class="producto-nombre">${p.nombre}</h3>
      <p class="producto-precio">$U ${p.precio.toLocaleString('es-UY')}</p>
      <p class="producto-stock">
        ${agotado ? '<span class="texto-agotado">Agotado</span>' : `Stock: ${p.stock}`}
      </p>
      <div class="card-acciones">
        <input type="number" value="1" min="1" max="${p.stock}" class="cantidad-input" id="cantidad-${p.id}" ${agotado ? 'disabled' : ''} style="background:#f7fff7;">
        <button class="boton-agregar${agotado ? ' agotado' : ''}" data-id="${p.id}" ${agotado ? 'disabled' : ''}>
          ${agotado ? '<i class="fas fa-times-circle"></i> Agotado' : '<i class="fas fa-cart-plus"></i> Agregar'}
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
// 7. MODAL DE PRODUCTO (DETALLE)
// ===============================
function mostrarModalProducto(producto) {
  const modal = elementos.productoModal;
  const contenido = elementos.modalContenido;
  if (!modal || !contenido) return;

  // Medidas y adicionales
  const medidas = [];
  if (producto.alto) medidas.push(`Alto: ${producto.alto} cm`);
  if (producto.ancho) medidas.push(`Ancho: ${producto.ancho} cm`);
  if (producto.profundidad) medidas.push(`Profundidad: ${producto.profundidad} cm`);
  const medidasStr = medidas.length ? medidas.join(' &nbsp; | &nbsp; ') : '';
  const adicionalesStr = producto.adicionales ? `<p class="modal-adicionales"><b>Adicionales:</b> ${producto.adicionales}</p>` : '';

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
        <p class="modal-stock ${producto.stock > 0 ? 'disponible' : 'agotado'}">
          ${producto.stock > 0 ? `Disponible: ${producto.stock}` : 'Agotado'}
        </p>
        <div class="modal-descripcion">${producto.descripcion || ''}</div>
        ${medidasStr ? `<div class="modal-medidas"><b>Medidas:</b> ${medidasStr}</div>` : ''}
        ${adicionalesStr}
        <div class="modal-thumbnails">
          ${producto.imagenes.map((img, i) => `
            <img src="${img}" class="thumbnail ${i === 0 ? 'active' : ''}" 
                 data-index="${i}" alt="Miniatura ${i + 1}">
          `).join('')}
        </div>
        <div class="modal-acciones">
          <input type="number" value="1" min="1" max="${producto.stock}" class="cantidad-modal-input" ${producto.stock === 0 ? 'disabled' : ''}>
          <button class="boton-agregar-modal ${producto.stock === 0 ? 'agotado' : ''}" data-id="${producto.id}" ${producto.stock === 0 ? 'disabled' : ''}>
            ${producto.stock === 0 ? 'Agotado' : 'Agregar al carrito'}
          </button>
        </div>
      </div>
    </div>
  `;

  // Carrusel funcional
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
  contenido.querySelector('.boton-agregar-modal').onclick = () => {
    const cantidad = +(contenido.querySelector('.cantidad-modal-input').value || 1);
    agregarAlCarrito(producto.id, cantidad);
    cerrarModal();
  };

  modal.style.display = 'flex';
  setTimeout(() => {
    modal.classList.add('visible');
    document.body.classList.add('no-scroll');
  }, 10);

  function cerrarModal() {
    modal.classList.remove('visible');
    setTimeout(() => { modal.style.display = 'none'; document.body.classList.remove('no-scroll'); }, 300);
  }
}

// ===============================
// 8. CARRITO DE COMPRAS Y STOCK
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
  if (!prod || prod.stock <= 0) {
    mostrarNotificacion('Producto agotado', 'error');
    return;
  }
  cantidad = Math.min(cantidad, prod.stock);

  let itemCarrito = carrito.find(i => i.id === id);
  if (itemCarrito) {
    if (itemCarrito.cantidad + cantidad > prod.stock) {
      mostrarNotificacion('No hay más stock disponible', 'error');
      return;
    }
    itemCarrito.cantidad += cantidad;
  } else {
    carrito.push({
      id: prod.id,
      nombre: prod.nombre,
      precio: prod.precio,
      cantidad: cantidad,
      imagen: prod.imagenes ? prod.imagenes[0] : PLACEHOLDER_IMAGE
    });
  }
  // Restar stock del producto
  prod.stock -= cantidad;
  guardarCarrito();
  renderizarProductos(); // Actualiza las cards y botones
  renderizarCarrito();
  mostrarNotificacion(`"${prod.nombre}" x${cantidad} añadido al carrito`, 'exito');
}

function vaciarCarrito() {
  if (carrito.length === 0) {
    mostrarNotificacion('El carrito ya está vacío', 'info');
    return;
  }
  if (confirm('¿Estás seguro de vaciar el carrito?')) {
    // Devuelve el stock a cada producto
    carrito.forEach(item => {
      const prod = productos.find(p => p.id === item.id);
      if (prod) prod.stock += item.cantidad;
    });
    carrito = [];
    guardarCarrito();
    renderizarProductos(); // Actualiza los botones y stock
    renderizarCarrito();
    mostrarNotificacion('Carrito vaciado', 'info');
    toggleCarrito();
  }
}

function renderizarCarrito() {
  if (!elementos.listaCarrito || !elementos.totalCarrito) return;
  if (carrito.length === 0) {
    elementos.listaCarrito.innerHTML = '<p class="carrito-vacio">Tu carrito está vacío</p>';
    elementos.totalCarrito.textContent = 'Total: $U 0';
    return;
  }
  let total = 0;
  elementos.listaCarrito.innerHTML = carrito.map(item => {
    total += item.precio * item.cantidad;
    return `
      <li class="carrito-item" data-id="${item.id}">
        <img src="${item.imagen}" class="carrito-item-img" alt="${item.nombre}">
        <div class="carrito-item-info">
          <span class="carrito-item-nombre">${item.nombre}</span>
          <span class="carrito-item-cantidad">x${item.cantidad}</span>
          <span class="carrito-item-precio">$U ${(item.precio * item.cantidad).toLocaleString('es-UY')}</span>
        </div>
      </li>
    `;
  }).join('');
  elementos.totalCarrito.textContent = `Total: $U ${total.toLocaleString('es-UY')}`;
}

// ===============================
// 9. EVENTOS Y UI
// ===============================
function toggleCarrito() {
  if (!elementos.carritoPanel || !elementos.carritoOverlay) return;
  const isOpen = elementos.carritoPanel.classList.toggle('active');
  elementos.carritoOverlay.classList.toggle('active', isOpen);
  document.body.classList.toggle('no-scroll', isOpen);
  if (isOpen) renderizarCarrito();
}

// ===============================
// 10. FILTROS Y BUSQUEDA
// ===============================
function aplicarFiltros() {
  paginaActual = 1;
  renderizarProductos();
}

function resetearFiltros() {
  filtrosActuales = {
    precioMin: null,
    precioMax: null,
    categoria: 'Todos',
    busqueda: ''
  };
  if (elementos.inputBusqueda) elementos.inputBusqueda.value = '';
  if (elementos.selectCategoria) elementos.selectCategoria.value = 'Todos';
  if (elementos.precioMinInput) elementos.precioMinInput.value = '';
  if (elementos.precioMaxInput) elementos.precioMaxInput.value = '';
  aplicarFiltros();
}

// ===============================
// 11. CONEXIÓN DE EVENTOS
// ===============================
function actualizarUI() {
  renderizarProductos();
  actualizarContadorCarrito();
}

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

// Carrito abrir/cerrar
document.getElementById('carrito-btn-main')?.addEventListener('click', toggleCarrito);
document.querySelector('.carrito-overlay')?.addEventListener('click', toggleCarrito);
document.querySelector('.cerrar-carrito')?.addEventListener('click', toggleCarrito);
document.querySelector('.boton-vaciar-carrito')?.addEventListener('click', vaciarCarrito);

// Filtros
elementos.inputBusqueda?.addEventListener('input', (e) => {
  filtrosActuales.busqueda = e.target.value.toLowerCase();
  aplicarFiltros();
});
elementos.selectCategoria?.addEventListener('change', (e) => {
  filtrosActuales.categoria = e.target.value;
  aplicarFiltros();
});
elementos.botonResetearFiltros?.addEventListener('click', resetearFiltros);

// ===============================
// 12. INICIALIZACIÓN GENERAL
// ===============================
function init() {
  cargarCarrito();
  cargarProductosDesdeSheets();
  conectarEventoModal();
}

if (document.readyState !== 'loading') {
  init();
} else {
  document.addEventListener('DOMContentLoaded', init);
}


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
