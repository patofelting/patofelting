// ===============================
// CONFIGURACIÓN
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJwvzHZQN3CQarSDqjk_nShegf8F4ydARvkSK55VabxbCi9m8RuGf2Nyy9ScriFRfGdhZd0P54VS5z/pub?output=csv';

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
// REFERENCIAS DOM
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
};

// ===============================
// NOTIFICACIONES
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
// LOCALSTORAGE: CARRITO
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

// ===============================
// CARGA DE PRODUCTOS DESDE SHEETS
// ===============================
async function cargarProductosDesdeSheets() {
  try {
    if (elementos.galeriaProductos)
      elementos.galeriaProductos.innerHTML = '<p>Cargando productos...</p>';
    const resp = await fetch(SHEET_CSV_URL, { headers: { 'Cache-Control': 'no-store' } });
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
        stock: parseInt(r.cantidad, 10) || 0, // <-- Stock de la hoja
        imagenes: (r.foto && r.foto.trim() !== "") ? r.foto.split(',').map(x => x.trim()) : [],
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
      elementos.galeriaProductos.innerHTML = '<p>No se pudieron cargar los productos.</p>';
    mostrarNotificacion('Error al cargar productos: ' + e.message, 'error');
  }
}

// ===============================
// CATEGORÍAS DINÁMICAS
// ===============================
function actualizarCategorias() {
  if (!elementos.selectCategoria) return;
  const cats = ['todos', ...new Set(productos.map(p => p.categoria))];
  elementos.selectCategoria.innerHTML = cats
    .map(cat => `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`)
    .join('');
}

// ===============================
// FILTRADO Y RENDER DE PRODUCTOS
// ===============================
function filtrarProductos(lista) {
  return lista.filter(p => {
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

function crearCardProducto(p) {
  const enCarrito = carrito.find(i => i.id === p.id);
  const disp = Math.max(0, p.stock - (enCarrito?.cantidad || 0));
  const agot = disp <= 0;
  const imgHtml = p.imagenes[0] ? `<img src="${p.imagenes[0]}" alt="${p.nombre}" class="producto-img" loading="lazy">` : '';
  return `
    <div class="producto-card" data-id="${p.id}">
      ${imgHtml}
      <h3 class="producto-nombre">${p.nombre}</h3>
      <p class="producto-precio">$U ${p.precio.toLocaleString('es-UY')}</p>
      <p class="producto-stock">
        ${agot ? '<span class="texto-agotado">Agotado</span>' : `Stock: ${disp}`}
      </p>
      <div class="card-acciones">
        <input type="number" value="1" min="1" max="${disp}" class="cantidad-input" id="cantidad-${p.id}" ${agot ? 'disabled' : ''}>
        <button class="boton-agregar${agot ? ' agotado' : ''}" data-id="${p.id}" ${agot ? 'disabled' : ''}>
          ${agot ? '<i class="fas fa-times-circle"></i> Agotado' : '<i class="fas fa-cart-plus"></i> Agregar'}
        </button>
      </div>
      <button class="boton-detalles" data-id="${p.id}">Ver Detalles</button>
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
    b.addEventListener('click', (e) => {
      e.preventDefault(); // 👈 ¡Evita el salto!
      paginaActual = i;
      renderizarProductos();
      const galeria = document.getElementById('galeria-productos');
      if (galeria) {
        galeria.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    cont.appendChild(b);
  }
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
    b.addEventListener('click', (e) => {
      e.preventDefault(); // 👈 ¡Evita el salto!
      paginaActual = i;
      renderizarProductos();
      const galeria = document.getElementById('galeria-productos');
      if (galeria) {
        galeria.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    cont.appendChild(b);
  }
}


// ===============================
// MODAL DE PRODUCTO (con stock real)
// ===============================
function mostrarModalProducto(p) {
  if (!elementos.productoModal || !elementos.modalContenido) return;
  const enCarrito = carrito.find(i => i.id === p.id);
  const disp = Math.max(0, p.stock - (enCarrito?.cantidad || 0));

  let carruselHtml = '';
  if (p.imagenes.length > 0) {
    carruselHtml += `<img src="${p.imagenes[0]}" class="modal-img" id="modal-img-principal" alt="${p.nombre}" loading="lazy">`;
    if (p.imagenes.length > 1) {
      carruselHtml += `<div class="modal-thumbnails">
        ${p.imagenes.map((img, i) => `
          <img src="${img}" class="modal-thumbnail${i === 0 ? ' active' : ''}" alt="Miniatura ${i + 1}" data-index="${i}">
        `).join('')}
      </div>`;
    }
  }

  elementos.modalContenido.innerHTML = `
    <button class="cerrar-modal" aria-label="Cerrar modal"></button>
    <div class="modal-flex">
      <div class="modal-carrusel">
        ${carruselHtml}
      </div>
      <div class="modal-info">
        <h2 class="modal-nombre">${p.nombre}</h2>
        <div class="modal-precio">$U ${p.precio.toLocaleString('es-UY')}</div>
        <div class="modal-stock ${disp > 0 ? 'disponible' : 'agotado'}">${disp > 0 ? `Disponible: ${disp}` : 'AGOTADO'}</div>
        <div class="modal-descripcion">${p.descripcion || ''}</div>
        ${p.adicionales ? `<div class="modal-detalles"><span>Material:</span> ${p.adicionales}</div>` : ''}
        ${p.alto && p.ancho ? `<div class="modal-detalles"><span>Medidas:</span> ${p.alto}x${p.ancho}${p.profundidad ? 'x' + p.profundidad : ''} cm</div>` : ''}
        ${p.estado ? `<div class="modal-detalles"><span>Estado:</span> ${p.estado}</div>` : ''}
        <div class="modal-acciones">
          <input type="number" value="1" min="1" max="${disp}" class="cantidad-modal-input" ${disp <= 0 ? 'disabled' : ''}>
          <button class="boton-agregar-modal${disp <= 0 ? ' agotado' : ''}" ${disp <= 0 ? 'disabled' : ''} data-id="${p.id}">
            ${disp <= 0 ? 'Agotado' : 'Agregar al carrito'}
          </button>
        </div>
      </div>
    </div>
  `;
  // Carrusel
  if (p.imagenes.length > 1) {
    const mainImg = elementos.modalContenido.querySelector('#modal-img-principal');
    const thumbnails = elementos.modalContenido.querySelectorAll('.modal-thumbnail');
    thumbnails.forEach((thumb, i) => {
      thumb.addEventListener('click', () => {
        thumbnails.forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
        mainImg.src = p.imagenes[i];
      });
    });
  }
  // Botón cerrar
  elementos.modalContenido.querySelector('.cerrar-modal').addEventListener('click', cerrarModal);
  // Botón agregar al carrito
  const agregarBtn = elementos.modalContenido.querySelector('.boton-agregar-modal');
  if (agregarBtn) {
    agregarBtn.addEventListener('click', () => {
      const cantidad = +elementos.modalContenido.querySelector('.cantidad-modal-input').value || 1;
      agregarAlCarrito(p.id, cantidad);
      cerrarModal();
    });
  }
  // Cierra modal al tocar fuera
  elementos.productoModal.style.display = 'flex';
  document.body.classList.add('no-scroll');
  elementos.productoModal.addEventListener('click', (e) => {
    if (e.target === elementos.productoModal) cerrarModal();
  });
  function cerrarModal() {
    elementos.productoModal.style.display = 'none';
    document.body.classList.remove('no-scroll');
  }
}

// ===============================
// CARRITO Y CONTROL DE STOCK
// ===============================
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
      imagen: prod.imagenes[0] || ''
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

// ===============================
// ACTUALIZACIÓN DE UI
// ===============================
function actualizarUI() {
  renderizarProductos();
  renderizarCarrito();
  actualizarContadorCarrito();
}

// ===============================
// FILTROS
// ===============================
function aplicarFiltros() {
  paginaActual = 1;
  actualizarUI();
}

// ===============================
// INICIALIZACIÓN DE EVENTOS
// ===============================
function inicializarEventos() {
  elementos.carritoBtnMain?.addEventListener('click', toggleCarrito);
  elementos.carritoOverlay?.addEventListener('click', toggleCarrito);
  elementos.btnCerrarCarrito?.addEventListener('click', toggleCarrito);
  elementos.btnVaciarCarrito?.addEventListener('click', () => {
    carrito = [];
    guardarCarrito();
    actualizarUI();
    toggleCarrito();
    mostrarNotificacion('Carrito vaciado', 'info');
  });

  elementos.inputBusqueda?.addEventListener('input', (e) => {
    filtrosActuales.busqueda = e.target.value.toLowerCase();
    aplicarFiltros();
  });
  elementos.selectCategoria?.addEventListener('change', (e) => {
    filtrosActuales.categoria = e.target.value;
    aplicarFiltros();
  });
  document.querySelectorAll('.aplicar-rango-btn').forEach(b => {
    b.addEventListener('click', () => {
      filtrosActuales.precioMin = elementos.precioMinInput?.value ? +elementos.precioMinInput.value : null;
      filtrosActuales.precioMax = elementos.precioMaxInput?.value ? +elementos.precioMaxInput.value : null;
      aplicarFiltros();
    });
  });
  elementos.botonResetearFiltros?.addEventListener('click', () => {
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
  });
}

// ===============================
// TOGGLE CARRITO
// ===============================
function toggleCarrito() {
  if (!elementos.carritoPanel || !elementos.carritoOverlay) return;
  const isOpen = elementos.carritoPanel.classList.toggle('open');
  elementos.carritoOverlay.classList.toggle('active', isOpen);
  document.body.classList.toggle('no-scroll', isOpen);
}

// ===============================
// INICIALIZACIÓN
// ===============================
function init() {
  cargarCarrito();
  cargarProductosDesdeSheets();
  inicializarEventos();
}
if (document.readyState !== 'loading') {
  init();
} else {
  document.addEventListener('DOMContentLoaded', init);
}
