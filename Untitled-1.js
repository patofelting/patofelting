// ===============================
// CONFIGURACIÓN GLOBAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const CSV_URL = window.SHEET_CSV_URL;
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

// Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, runTransaction, onValue, get, set } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyD261TL6XuBp12rUNCcMKyP7_nMaCVYc7Y",
  authDomain: "patofelting-b188f.firebaseapp.com",
  databaseURL: "https://patofelting-b188f-default-rtdb.firebaseio.com",
  projectId: "patofelting-b188f",
  storageBucket: "patofelting-b188f.appspot.com",
  messagingSenderId: "858377467588",
  appId: "1:858377467588:web:cade9de05ebccc17f87b91"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// User ID único
const obtenerUserId = () => {
  let userId = localStorage.getItem('uid');
  if (!userId) {
    userId = 'anon_' + Math.random().toString(36).substring(2, 15);
    localStorage.setItem('uid', userId);
  }
  return userId;
};
const USER_ID = obtenerUserId();

// Estado
let productos = [];
let carrito = [];
let paginaActual = 1;
let filtrosActuales = {
  precioMin: null,
  precioMax: null,
  categoria: 'todos',
  busqueda: ''
};

// DOM elementos
const getElement = id => document.getElementById(id);
const elementos = {
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
  productLoader: getElement('product-loader')
};

// Notificación
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

// Guardar carrito en localStorage + Firebase
function guardarCarrito() {
  localStorage.setItem(LS_CARRITO_KEY, JSON.stringify(carrito));
  actualizarContadorCarrito();

  const carritoRef = ref(db, `carritos/${USER_ID}`);
  set(carritoRef, carrito)
    .then(() => console.log("🛒 Carrito sincronizado con Firebase"))
    .catch(err => console.error("❌ Error al guardar carrito:", err));
}

// Cargar carrito inicial desde Firebase
function cargarCarrito() {
  const carritoRef = ref(db, `carritos/${USER_ID}`);
  onValue(carritoRef, (snapshot) => {
    if (snapshot.exists()) {
      carrito = snapshot.val() || [];
      localStorage.setItem(LS_CARRITO_KEY, JSON.stringify(carrito));
      actualizarContadorCarrito();
      renderizarCarrito();
    }
  }, (error) => {
    console.error("Error al escuchar carrito:", error);
    mostrarNotificacion("Error al cargar el carrito", "error");
  });
}

// Actualizar contador carrito
function actualizarContadorCarrito() {
  const total = carrito.reduce((sum, i) => sum + i.cantidad, 0);
  if (elementos.contadorCarrito) {
    elementos.contadorCarrito.textContent = total;
    elementos.contadorCarrito.classList.toggle('visible', total > 0);
  }
}

// Vaciar carrito y restaurar stock
async function vaciarCarrito() {
  if (carrito.length === 0) {
    mostrarNotificacion('El carrito ya está vacío', 'info');
    return;
  }

  try {
    for (const item of carrito) {
      const productoRef = ref(db, `productos/${item.id}/stock`);
      await runTransaction(productoRef, stock => (stock || 0) + item.cantidad);
    }

    carrito = [];
    guardarCarrito();

    const carritoRef = ref(db, `carritos/${USER_ID}`);
    await set(carritoRef, []);

    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion('🗑️ Carrito vaciado', 'exito');
  } catch (err) {
    console.error("Error al vaciar carrito:", err);
    mostrarNotificacion("❌ Error al vaciar", "error");
  }
}

// Listener
elementos.btnVaciarCarrito?.addEventListener('click', vaciarCarrito);

// Inicialización
async function init() {
  try {
    await signInAnonymously(auth);
    console.log('✅ Signed in anonymously to Firebase.');
    cargarCarrito();
    await cargarProductosDesdeFirebase();
    setupContactForm();
    inicializarMenuHamburguesa();
    updateRange();
    aplicarFiltros();
  } catch (error) {
    console.error('❌ Error during initialization:', error);
    mostrarNotificacion('Error al iniciar la aplicación', 'error');
  }
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
  
  menu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      menu.classList.remove('active');
      hamburguesa.setAttribute('aria-expanded', false);
      document.body.classList.remove('no-scroll');
    });
  });
}

// ===============================
// CONTROLADORES PARA LOS SLIDERS DE PRECIO
// ===============================
const minSlider = document.getElementById('min-slider');
const maxSlider = document.getElementById('max-slider');
const minPrice = document.getElementById('min-price');
const maxPrice = document.getElementById('max-price');
const range = document.querySelector('.range');

function updateRange() {
  let minVal = parseInt(minSlider.value);
  let maxVal = parseInt(maxSlider.value);

  if (minVal > maxVal) {
    [minVal, maxVal] = [maxVal, minVal];
    minSlider.value = minVal;
    maxSlider.value = maxVal;
  }

  const porcentajeMin = (minVal / 3000) * 100;
  const porcentajeMax = (maxVal / 3000) * 100;

  range.style.left = porcentajeMin + '%';
  range.style.width = (porcentajeMax - porcentajeMin) + '%';

  minPrice.textContent = `$U${minVal}`;
  maxPrice.textContent = `$U${maxVal}`;
}

function aplicarFiltros() {
  filtrosActuales.busqueda = elementos.inputBusqueda?.value.trim().toLowerCase() || '';
  filtrosActuales.categoria = elementos.selectCategoria?.value || 'todos';
  filtrosActuales.precioMin = parseInt(minSlider?.value) || null;
  filtrosActuales.precioMax = parseInt(maxSlider?.value) || null;

  renderizarProductos();
}

minSlider?.addEventListener('input', updateRange);
maxSlider?.addEventListener('input', updateRange);
elementos.aplicarRangoBtn?.addEventListener('click', aplicarFiltros);
if (minSlider && maxSlider) updateRange();

// ===============================
// FUNCIONES DE PRODUCTOS
// ===============================
function preguntarStock(nombreProducto) {
  const asunto = encodeURIComponent(`Consulta sobre disponibilidad de "${nombreProducto}"`);
  const cuerpo = encodeURIComponent(`Hola Patofelting,\n\nMe gustaría saber cuándo estará disponible el producto: ${nombreProducto}\n\nSaludos cordiales,\n[Nombre del Cliente]`);
  window.location.href = `mailto:patofelting@gmail.com?subject=${asunto}&body=${cuerpo}`;
}

function verDetalle(id) {
  const producto = productos.find(p => p.id === id);
  if (producto) {
    mostrarModalProducto(producto);
  } else {
    mostrarNotificacion("Producto no encontrado", "error");
  }
}

async function cargarProductosDesdeFirebase() {
  try {
    if (elementos.productLoader) {
      elementos.productLoader.style.display = 'flex';
      elementos.productLoader.hidden = false;
    }

    const productosRef = ref(db, 'productos');
    const snapshot = await get(productosRef);

    if (!snapshot.exists()) {
      console.warn("📭 No se encontraron productos en Firebase");
      productos = [];
      renderizarProductos();
      return;
    }

    const data = snapshot.val();
    productos = Object.entries(data)
      .map(([key, value]) => {
        const p = {
          ...value,
          id: parseInt(key),
          precio: parseFloat(value.precio) || 0,
          imagenes: Array.isArray(value.imagenes) ? value.imagenes : [PLACEHOLDER_IMAGE],
          vendido: value.vendido?.toString().toLowerCase() || ''
        };
        return p.vendido !== 'vendido' ? p : null;
      })
      .filter(p => p !== null);

    console.log("✅ Productos cargados:", productos);
    renderizarProductos();
    actualizarCategorias();
  } catch (error) {
    console.error("❌ Error al cargar productos desde Firebase:", error);
    mostrarNotificacion("Error al cargar productos: " + (error.message || 'Desconocido'), "error");
  } finally {
    if (elementos.productLoader) {
      elementos.productLoader.style.display = 'none';
      elementos.productLoader.hidden = true;
    }
  }
}

function renderizarProductos() {
  if (!elementos.galeriaProductos) {
    console.error("❌ Galería de productos no encontrada");
    return;
  }

  const productosFiltrados = aplicarFiltros();
  const totalPaginas = Math.ceil(productosFiltrados.length / PRODUCTOS_POR_PAGINA);

  elementos.galeriaProductos.innerHTML = productosFiltrados
    .slice((paginaActual - 1) * PRODUCTOS_POR_PAGINA, paginaActual * PRODUCTOS_POR_PAGINA)
    .map(producto => `
      <div class="producto" data-id="${producto.id}">
        <img src="${producto.imagenes?.[0] || PLACEHOLDER_IMAGE}" alt="${producto.nombre}" />
        <h3>${producto.nombre}</h3>
        <p>$U${producto.precio.toLocaleString('es-UY')}</p>
        <button class="boton-agregar" data-id="${producto.id}">Agregar</button>
        <button class="boton-detalles" data-id="${producto.id}">Ver</button>
      </div>
    `).join('');

  renderizarPaginacion(totalPaginas);
}

function renderizarPaginacion(totalPaginas) {
  if (!elementos.paginacion || totalPaginas <= 1) {
    elementos.paginacion.innerHTML = '';
    return;
  }

  elementos.paginacion.innerHTML = `
    <button ${paginaActual <= 1 ? 'disabled' : ''} onclick="cambiarPagina(${paginaActual - 1})">Anterior</button>
    ${Array.from({ length: totalPaginas }, (_, i) => `
      <button ${i + 1 === paginaActual ? 'class="activa"' : ''} onclick="cambiarPagina(${i + 1})">${i + 1}</button>
    `).join('')}
    <button ${paginaActual >= totalPaginas ? 'disabled' : ''} onclick="cambiarPagina(${paginaActual + 1})">Siguiente</button>
  `;
}

function actualizarCategorias() {
  if (!elementos.selectCategoria) return;

  const categorias = [...new Set(productos.map(p => p.categoria))];
  elementos.selectCategoria.innerHTML = `<option value="todos">Todos</option>` + 
    categorias.map(cat => `<option value="${cat}">${cat}</option>`).join('');
}

function mostrarModalProducto(producto) {
  if (!elementos.modalContenido || !elementos.productoModal) {
    console.error("❌ Elementos del modal no encontrados");
    mostrarNotificacion("Error al mostrar el modal", "error");
    return;
  }

  elementos.modalContenido.innerHTML = `
    <h2>${producto.nombre}</h2>
    <img src="${producto.imagenes?.[0] || PLACEHOLDER_IMAGE}" alt="${producto.nombre}" />
    <p>${producto.descripcion || 'Sin descripción'}</p>
    <p>Precio: $U${producto.precio.toLocaleString('es-UY')}</p>
    <button class="boton-agregar" data-id="${producto.id}">Agregar al carrito</button>
    <button class="cerrar-modal">Cerrar</button>
  `;
  elementos.productoModal.classList.add('visible');
  elementos.productoModal.hidden = false;
}

function cerrarModal() {
  if (elementos.productoModal) {
    elementos.productoModal.classList.remove('visible');
    elementos.productoModal.hidden = true;
  }
}

function cambiarPagina(nuevaPagina) {
  if (nuevaPagina > 0) {
    paginaActual = nuevaPagina;
    renderizarProductos();
  }
}

function agregarAlCarrito(id) {
  const producto = productos.find(p => p.id === id);
  if (!producto) {
    mostrarNotificacion("Producto no encontrado", "error");
    return;
  }

  if (producto.stock <= 0) {
    mostrarNotificacion("Producto agotado", "error");
    preguntarStock(producto.nombre);
    return;
  }

  const itemExistente = carrito.find(item => item.id === id);
  if (itemExistente) {
    itemExistente.cantidad++;
  } else {
    carrito.push({ id, nombre: producto.nombre, precio: producto.precio, cantidad: 1, imagen: producto.imagenes[0] });
  }

  guardarCarrito();
  renderizarCarrito();
  mostrarNotificacion(`${producto.nombre} agregado al carrito`, "exito");
}

function renderizarCarrito() {
  if (!elementos.listaCarrito || !elementos.totalCarrito) {
    console.error("❌ Elementos del carrito no encontrados");
    return;
  }

  elementos.listaCarrito.innerHTML = carrito.length === 0
    ? '<p>Tu carrito está vacío</p>'
    : carrito.map(item => `
      <li>
        <img src="${item.imagen}" alt="${item.nombre}" />
        <span>${item.nombre}</span>
        <span>$U${item.precio.toLocaleString('es-UY')}</span>
        <span>Cantidad: ${item.cantidad}</span>
        <button onclick="eliminarDelCarrito(${item.id})">Eliminar</button>
      </li>
    `).join('');

  const total = carrito.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  elementos.totalCarrito.textContent = `Total: $U${total.toLocaleString('es-UY')}`;
}

function eliminarDelCarrito(id) {
  carrito = carrito.filter(item => item.id !== id);
  guardarCarrito();
  renderizarCarrito();
  renderizarProductos();
  mostrarNotificacion("Producto eliminado del carrito", "exito");
}

// Event Listeners
document.addEventListener('DOMContentLoaded', init);
document.querySelectorAll('.boton-agregar').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const id = parseInt(e.target.dataset.id);
    agregarAlCarrito(id);
  });
});
document.querySelectorAll('.boton-detalles').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const id = parseInt(e.target.dataset.id);
    verDetalle(id);
  });
});
document.querySelectorAll('.cerrar-modal').forEach(btn => {
  btn.addEventListener('click', cerrarModal);
});
elementos.carritoBtnMain?.addEventListener('click', () => {
  if (elementos.carritoPanel) {
    elementos.carritoPanel.classList.toggle('abierto');
    elementos.carritoOverlay.classList.toggle('activo');
  }
});
elementos.btnCerrarCarrito?.addEventListener('click', () => {
  if (elementos.carritoPanel) {
    elementos.carritoPanel.classList.remove('abierto');
    elementos.carritoOverlay.classList.remove('activo');
  }
});
elementos.carritoOverlay?.addEventListener('click', () => {
  if (elementos.carritoPanel) {
    elementos.carritoPanel.classList.remove('abierto');
    elementos.carritoOverlay.classList.remove('activo');
  }
});
