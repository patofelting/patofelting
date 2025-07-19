// ===============================
// CONFIGURACIÓN INICIAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';

// URL pública de tu Google Sheets en formato CSV
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
  btnFlotante: document.querySelector('.boton-flotante'),
  avisoPreCompraModal: getElement('aviso-pre-compra-modal'),
  btnEntendidoAviso: getElement('btn-entendido-aviso'),
  btnCancelarAviso: getElement('btn-cancelar-aviso')
};

// ===============================
// NOTIFICACIONES
// ===============================
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
// LOCALSTORAGE: CARRITO
// ===============================
function guardarCarrito() {
  localStorage.setItem(LS_CARRITO_KEY, JSON.stringify(carrito));
  actualizarContadorCarrito();
}
function cargarCarrito() {
  try {
    const data = localStorage.getItem(LS_CARRITO_KEY);
    carrito = data ? JSON.parse(data) : [];
    actualizarContadorCarrito();
  } catch (e) {
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

// ===============================
// ACTUALIZAR CATEGORÍAS
// ===============================
function actualizarCategorias() {
  if (!elementos.selectCategoria) return;
  const categorias = ['todos', ...new Set(productos.map(p => p.categoria))];
  elementos.selectCategoria.innerHTML = categorias
    .map(cat => `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`)
    .join('');
}

// ===============================
// CARGA DE PRODUCTOS DESDE SHEETS
// ===============================
async function cargarProductosDesdeSheets() {
  try {
    if (elementos.galeriaProductos) {
      elementos.galeriaProductos.innerHTML = '<p>Cargando productos...</p>';
    }
    const resp = await fetch(SHEET_CSV_URL, { headers: { 'Cache-Control': 'no-store' } });
    if (!resp.ok) throw new Error(`Error HTTP: ${resp.status} - ${resp.statusText}`);
    const csvText = await resp.text();
    if (typeof Papa === 'undefined') throw new Error('Papa Parse no está disponible');

    const { data, errors } = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true
    });
    if (errors.length) throw new Error('Error al procesar los datos del CSV');
    productos = data.filter(r => r.id && r.nombre && r.precio).map(r => ({
      id: parseInt(r.id, 10),
      nombre: r.nombre ? r.nombre.trim() : 'Sin Nombre',
      descripcion: r.descripcion ? r.descripcion.trim() : '',
      precio: parseFloat(r.precio) || 0,
      stock: parseInt(r.cantidad, 10) || 0,
      imagenes: (r.foto ? r.foto.split(',').map(f=>f.trim()) : ['/img/placeholder.jpg']),
      adicionales: r.adicionales ? r.adicionales.trim() : '',
      alto: parseFloat(r.alto) || null,
      ancho: parseFloat(r.ancho) || null,
      profundidad: parseFloat(r.profundidad) || null,
      categoria: r.categoria ? r.categoria.trim().toLowerCase() : 'otros',
      tamaño: parseFloat(r.tamaño) || null,
      vendido: r.vendido ? r.vendido.trim().toLowerCase() === 'true' : false,
      estado: r.estado ? r.estado.trim() : ''
    }));
    actualizarCategorias();
    actualizarUI();
  } catch (e) {
    if (elementos.galeriaProductos) {
      elementos.galeriaProductos.innerHTML = '<p>No se pudieron cargar los productos. Intente recargar la página.</p>';
    }
    mostrarNotificacion(`Error al cargar productos: ${e.message}`, 'error');
  }
}

// ===============================
// FILTRADO DE PRODUCTOS Y RENDER
// ===============================
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
      (!busqueda || 
       p.nombre.toLowerCase().includes(busquedaLower) || 
       p.descripcion.toLowerCase().includes(busquedaLower))
    );
  });
}
function crearCardProducto(p) {
  const enCarrito = carrito.find(i => i.id === p.id);
  const disp = p.stock - (enCarrito?.cantidad || 0);
  const agot = disp <= 0;
  const imgUrl = p.imagenes[0] || '/img/placeholder.jpg';
  return `
    <div class="producto-card" data-id="${p.id}">
      <img src="${imgUrl}" alt="${p.nombre}" class="producto-img" loading="lazy">
      <h3 class="producto-nombre">${p.nombre}</h3>
      <p class="producto-precio">$U ${p.precio.toLocaleString('es-UY')}</p>
      <p class="producto-stock">${agot ? '<span class="texto-agotado">Agotado</span>' : `Stock: ${disp}`}</p>
      <div class="card-acciones">
        <input type="number" value="1" min="1" max="${disp}" class="cantidad-input" id="cantidad-${p.id}" ${agot ? 'disabled' : ''}>
        <button class="boton-agregar ${agot ? 'agotado' : ''}" data-id="${p.id}" ${agot ? 'disabled' : ''}>
          ${agot ? 'Agotado' : 'Agregar'}
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
    b.addEventListener('click', () => {
      paginaActual = i;
      renderizarProductos();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    cont.appendChild(b);
  }
}
function renderizarProductos() {
  if (!elementos.galeriaProductos) return;
  const list = filtrarProductos(productos);
  const inicio = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
  const slice = list.slice(inicio, inicio + PRODUCTOS_POR_PAGINA);
  if (slice.length === 0) {
    elementos.galeriaProductos.innerHTML = '<p>No se encontraron productos con los filtros aplicados.</p>';
  } else {
    elementos.galeriaProductos.innerHTML = slice.map(crearCardProducto).join('');
  }
  elementos.galeriaProductos.onclick = function (e) {
    const btn = e.target.closest('.boton-agregar');
    if (btn) {
      const id = +btn.dataset.id;
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
// CARRITO Y MODAL
// (puedes mantener lo que tenías, por espacio lo corto, pero avísame si quieres todo el carrito)
function agregarAlCarrito(id, cantidad = 1) {
  const prod = productos.find(p => p.id === id);
  if (!prod) return;
  cantidad = parseInt(cantidad, 10);
  const enCarrito = carrito.find(item => item.id === id);
  const disponibles = prod.stock - (enCarrito?.cantidad || 0);
  if (cantidad > disponibles) {
    mostrarNotificacion(`Solo hay ${disponibles} unidades disponibles`, 'error');
    return;
  }
  if (enCarrito) enCarrito.cantidad += cantidad;
  else carrito.push({ id, nombre: prod.nombre, precio: prod.precio, cantidad, imagen: prod.imagenes[0] || '/img/placeholder.jpg' });
  guardarCarrito();
  actualizarUI();
  mostrarNotificacion(`"${prod.nombre}" x${cantidad} añadido al carrito`, 'exito');
}
function actualizarUI() {
  renderizarProductos();
  // Renderiza carrito aquí si usas panel lateral
  actualizarContadorCarrito();
}

// ===============================
// INICIALIZACIÓN DE EVENTOS
// ===============================
function inicializarEventos() {
  // Aquí van tus listeners como en tu código original, o ajusta a tus necesidades.
  elementos.inputBusqueda?.addEventListener('input', (e) => {
    filtrosActuales.busqueda = e.target.value.toLowerCase();
    paginaActual = 1;
    actualizarUI();
  });
  elementos.selectCategoria?.addEventListener('change', (e) => {
    filtrosActuales.categoria = e.target.value;
    paginaActual = 1;
    actualizarUI();
  });
  elementos.botonResetearFiltros?.addEventListener('click', () => {
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
    paginaActual = 1;
    actualizarUI();
  });
  // Otros listeners...
}

// ===============================
// INICIALIZACIÓN APP
// ===============================
function init() {
  cargarCarrito();
  inicializarEventos();
  cargarProductosDesdeSheets();
}

// Usa DOMContentLoaded para evitar llamar funciones antes de definirlas
document.addEventListener('DOMContentLoaded', init);

