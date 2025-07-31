// ===============================
// CONFIGURACIÓN GLOBAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const CSV_URL = window.SHEET_CSV_URL;
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

// ======== Primero declaramos firebaseConfig y luego inicializamos Firebase ========
// Import Firebase core module for initializeApp
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

// Import Authentication functions
import {
  getAuth,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Import Realtime Database functions
import {
  getDatabase,
  ref,
  runTransaction,
  onValue,
  get
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD261TL6XuBp12rUNCcMKyP7_nMaCVYc7Y",
  authDomain: "patofelting-b188f.firebaseapp.com",
  databaseURL: "https://patofelting-b188f-default-rtdb.firebaseio.com",
  projectId: "patofelting-b188f",
  storageBucket: "patofelting-b188f.appspot.com",
  messagingSenderId: "858377467588",
  appId: "1:858377467588:web:cade9de05ebccc17f87b91"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Obtain service instances
const db = getDatabase(app);
const auth = getAuth(app);

// Anonymous authentication
signInAnonymously(auth)
  .then(() => console.log("✅ Signed in anonymously"))
  .catch(error => console.error("❌ Error signing in:", error));

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
// ELEMENTOS DEL DOM
// ===============================
const elementos = {
  galeriaProductos: document.getElementById('galeria-productos'),
  paginacion: document.getElementById('paginacion'),
  contadorCarrito: document.getElementById('contador-carrito'),
  btnVaciarCarrito: document.getElementById('btn-vaciar-carrito'),
  listaCarrito: document.getElementById('lista-carrito'),
  totalCarrito: document.getElementById('total-carrito'),
  filtros: document.getElementById('filtros'),
  inputBusqueda: document.getElementById('input-busqueda'),
  btnAplicarFiltros: document.getElementById('btn-aplicar-filtros'),
  btnLimpiarFiltros: document.getElementById('btn-limpiar-filtros'),
  modalProducto: document.getElementById('modal-producto'),
  modalContenido: document.getElementById('modal-contenido'),
  modalCerrar: document.getElementById('modal-cerrar'),
  notificacion: document.getElementById('notificacion')
};

// ===============================
// CARGA DE PRODUCTOS
// ===============================
async function cargarProductos() {
  try {
    // Cargar productos desde Firebase
    const productosRef = ref(db, 'productos');
    const snapshot = await get(productosRef);
    if (snapshot.exists()) {
      productos = Object.entries(snapshot.val()).map(([id, prod]) => ({
        id: parseInt(id),
        ...prod
      }));
    } else {
      productos = [];
    }
    renderizarProductos();
    renderizarPaginacion();
  } catch (error) {
    console.error('Error al cargar productos:', error);
    mostrarNotificacion('Error al cargar productos', 'error');
  }
}

// ===============================
// RENDERIZADO DE PRODUCTOS
// ===============================
function renderizarProductos() {
  if (!elementos.galeriaProductos) return;
  elementos.galeriaProductos.innerHTML = '';

  // Filtrar productos según filtros actuales
  let productosFiltrados = productos.filter(prod => {
    let cumple = true;
    if (filtrosActuales.categoria !== 'todos' && prod.categoria !== filtrosActuales.categoria) cumple = false;
    if (filtrosActuales.precioMin !== null && prod.precio < filtrosActuales.precioMin) cumple = false;
    if (filtrosActuales.precioMax !== null && prod.precio > filtrosActuales.precioMax) cumple = false;
    if (filtrosActuales.busqueda && !prod.nombre.toLowerCase().includes(filtrosActuales.busqueda.toLowerCase())) cumple = false;
    return cumple;
  });

  // Paginación
  const inicio = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
  const fin = inicio + PRODUCTOS_POR_PAGINA;
  const productosPagina = productosFiltrados.slice(inicio, fin);

  productosPagina.forEach(prod => {
    const card = document.createElement('div');
    card.className = 'producto-card';
    card.innerHTML = `
      <img src="${prod.imagen || PLACEHOLDER_IMAGE}" alt="${prod.nombre}">
      <h3>${prod.nombre}</h3>
      <p>${prod.descripcion || ''}</p>
      <p class="precio">$${prod.precio}</p>
      <p class="stock">Stock: ${prod.stock}</p>
      <button class="boton-agregar" data-id="${prod.id}" ${prod.stock === 0 ? 'disabled' : ''}>Agregar al carrito</button>
    `;
    elementos.galeriaProductos.appendChild(card);
  });
}

// ===============================
// RENDERIZADO DE PAGINACIÓN
// ===============================
function renderizarPaginacion() {
  if (!elementos.paginacion) return;
  elementos.paginacion.innerHTML = '';

  let productosFiltrados = productos.filter(prod => {
    let cumple = true;
    if (filtrosActuales.categoria !== 'todos' && prod.categoria !== filtrosActuales.categoria) cumple = false;
    if (filtrosActuales.precioMin !== null && prod.precio < filtrosActuales.precioMin) cumple = false;
    if (filtrosActuales.precioMax !== null && prod.precio > filtrosActuales.precioMax) cumple = false;
    if (filtrosActuales.busqueda && !prod.nombre.toLowerCase().includes(filtrosActuales.busqueda.toLowerCase())) cumple = false;
    return cumple;
  });

  const totalPaginas = Math.ceil(productosFiltrados.length / PRODUCTOS_POR_PAGINA);
  for (let i = 1; i <= totalPaginas; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    btn.className = (i === paginaActual) ? 'activo' : '';
    btn.addEventListener('click', () => {
      paginaActual = i;
      renderizarProductos();
      renderizarPaginacion();
    });
    elementos.paginacion.appendChild(btn);
  }
}

// ===============================
// CARRITO: LOCAL STORAGE
// ===============================
function guardarCarrito() {
  localStorage.setItem(LS_CARRITO_KEY, JSON.stringify(carrito));
  actualizarContadorCarrito();
}

function cargarCarrito() {
  const data = localStorage.getItem(LS_CARRITO_KEY);
  carrito = data ? JSON.parse(data) : [];
  actualizarContadorCarrito();
}

// ===============================
// ACTUALIZAR CONTADOR CARRITO
// ===============================
function actualizarContadorCarrito() {
  if (elementos.contadorCarrito) {
    elementos.contadorCarrito.textContent = carrito.reduce((acc, item) => acc + item.cantidad, 0);
  }
}

// ===============================
// RENDERIZAR CARRITO
// ===============================
function renderizarCarrito() {
  if (!elementos.listaCarrito) return;
  elementos.listaCarrito.innerHTML = '';
  let total = 0;
  carrito.forEach(item => {
    const prod = productos.find(p => p.id === item.id);
    if (!prod) return;
    const li = document.createElement('li');
    li.innerHTML = `
      <span>${prod.nombre}</span>
      <span>x${item.cantidad}</span>
      <span>$${prod.precio * item.cantidad}</span>
      <button class="aumentar-cantidad" data-id="${item.id}">+</button>
      <button class="disminuir-cantidad" data-id="${item.id}">-</button>
      <button class="eliminar-item" data-id="${item.id}">Eliminar</button>
    `;
    elementos.listaCarrito.appendChild(li);
    total += prod.precio * item.cantidad;
  });
  if (elementos.totalCarrito) {
    elementos.totalCarrito.textContent = `$${total}`;
  }
}

// ===============================
// AGREGAR AL CARRITO (con fix de doble agregado)
// ===============================
let bloqueadoAgregar = false; // Para evitar doble click rápido

async function agregarAlCarrito(id, cantidadAgregar = 1, boton = null) {
  if (bloqueadoAgregar) return;
  bloqueadoAgregar = true;

  try {
    const prod = productos.find(p => p.id === id);
    if (!prod) {
      mostrarNotificacion('Producto no encontrado', 'error');
      return;
    }

    // Validar stock en Firebase
    const productRef = ref(db, `productos/${id}/stock`);
    const res = await runTransaction(productRef, (currentStock) => {
      if (typeof currentStock !== 'number' || isNaN(currentStock)) currentStock = 0;
      if (currentStock < cantidadAgregar) return; // aborta si no hay stock suficiente
      return currentStock - cantidadAgregar;
    });

    if (!res.committed) {
      mostrarNotificacion('No hay suficiente stock', 'error');
      return;
    }

    // Actualizar carrito local
    const enCarrito = carrito.find(item => item.id === id);
    if (enCarrito) {
      enCarrito.cantidad += cantidadAgregar;
    } else {
      carrito.push({ id, cantidad: cantidadAgregar });
    }
    guardarCarrito();
    renderizarCarrito();
    mostrarNotificacion('Producto agregado al carrito', 'exito');
    cargarProductos(); // Para actualizar el stock en la vista
  } catch (error) {
    console.error('Error al agregar al carrito:', error);
    mostrarNotificacion('Error al agregar al carrito', 'error');
  } finally {
    bloqueadoAgregar = false;
  }
}

// ===============================
// VACIAR CARRITO (con fix de suma incorrecta)
// ===============================
async function vaciarCarrito() {
  if (carrito.length === 0) return;
  try {
    // Por cada item, devolver la cantidad al stock en Firebase
    for (const item of carrito) {
      const productRef = ref(db, `productos/${item.id}/stock`);
      await runTransaction(productRef, (currentStock) => {
        if (typeof currentStock !== 'number' || isNaN(currentStock)) currentStock = 0;
        return currentStock + item.cantidad;
      });
    }
    carrito = [];
    guardarCarrito();
    renderizarCarrito();
    mostrarNotificacion('Carrito vaciado', 'exito');
    cargarProductos(); // Para actualizar el stock en la vista
  } catch (error) {
    console.error('Error al vaciar carrito:', error);
    mostrarNotificacion('Error al vaciar carrito', 'error');
  }
}

// ===============================
// EVENTOS (con delegación y sin duplicados)
// ===============================

// Delegación para agregar al carrito
if (elementos.galeriaProductos) {
  elementos.galeriaProductos.addEventListener('click', (e) => {
    const boton = e.target.closest('.boton-agregar');
    if (boton) {
      const id = parseInt(boton.dataset.id);
      agregarAlCarrito(id, 1, boton);
    }
  });
}

// Delegación para aumentar/disminuir/eliminar en carrito
if (elementos.listaCarrito) {
  elementos.listaCarrito.addEventListener('click', (e) => {
    const btnAumentar = e.target.closest('.aumentar-cantidad');
    const btnDisminuir = e.target.closest('.disminuir-cantidad');
    const btnEliminar = e.target.closest('.eliminar-item');
    if (btnAumentar) {
      const id = parseInt(btnAumentar.dataset.id);
      agregarAlCarrito(id, 1);
    }
    if (btnDisminuir) {
      const id = parseInt(btnDisminuir.dataset.id);
      const item = carrito.find(i => i.id === id);
      if (item && item.cantidad > 1) {
        item.cantidad--;
        guardarCarrito();
        renderizarCarrito();
      } else if (item) {
        carrito = carrito.filter(i => i.id !== id);
        guardarCarrito();
        renderizarCarrito();
      }
    }
    if (btnEliminar) {
      const id = parseInt(btnEliminar.dataset.id);
      carrito = carrito.filter(i => i.id !== id);
      guardarCarrito();
      renderizarCarrito();
    }
  });
}

// Listener único para vaciar carrito
if (elementos.btnVaciarCarrito) {
  elementos.btnVaciarCarrito.addEventListener('click', vaciarCarrito);
}

// Filtros y búsqueda
if (elementos.btnAplicarFiltros) {
  elementos.btnAplicarFiltros.addEventListener('click', () => {
    const min = parseFloat(document.getElementById('filtro-precio-min')?.value) || null;
    const max = parseFloat(document.getElementById('filtro-precio-max')?.value) || null;
    const cat = document.getElementById('filtro-categoria')?.value || 'todos';
    filtrosActuales.precioMin = min;
    filtrosActuales.precioMax = max;
    filtrosActuales.categoria = cat;
    paginaActual = 1;
    renderizarProductos();
    renderizarPaginacion();
  });
}
if (elementos.btnLimpiarFiltros) {
  elementos.btnLimpiarFiltros.addEventListener('click', () => {
    filtrosActuales = { precioMin: null, precioMax: null, categoria: 'todos', busqueda: '' };
    paginaActual = 1;
    renderizarProductos();
    renderizarPaginacion();
  });
}
if (elementos.inputBusqueda) {
  elementos.inputBusqueda.addEventListener('input', (e) => {
    filtrosActuales.busqueda = e.target.value;
    paginaActual = 1;
    renderizarProductos();
    renderizarPaginacion();
  });
}

// ===============================
// NOTIFICACIONES
// ===============================
function mostrarNotificacion(mensaje, tipo = 'info') {
  if (!elementos.notificacion) return;
  elementos.notificacion.textContent = mensaje;
  elementos.notificacion.className = `notificacion ${tipo}`;
  elementos.notificacion.style.display = 'block';
  setTimeout(() => {
    elementos.notificacion.style.display = 'none';
  }, 2000);
}

// ===============================
// INICIALIZACIÓN
// ===============================
window.addEventListener('DOMContentLoaded', () => {
  cargarCarrito();
  cargarProductos();
  renderizarCarrito();
});

// ===============================
// OTRAS FUNCIONALIDADES (contacto, menú, FAQ, etc.)
// ===============================
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
// Validar y enviar por WhatsApp
document.getElementById('form-envio')?.addEventListener('submit', function(e) {
  e.preventDefault();
  
  const nombre = document.getElementById('input-nombre').value.trim();
  const apellido = document.getElementById('input-apellido').value.trim();
  const telefono = document.getElementById('input-telefono').value.trim();
  const envio = document.getElementById('select-envio').value;
  const direccion = envio !== 'retiro' ? document.getElementById('input-direccion').value.trim() : '';
  const notas = document.getElementById('input-notas').value.trim();

  if (!nombre || !apellido || !telefono || (envio !== 'retiro' && !direccion)) {
    mostrarNotificacion('Por favor complete todos los campos obligatorios', 'error');
    return;
  }

  let mensaje = `¡Hola Patofelting! Quiero hacer un pedido:\n\n`;
  mensaje += `*📋 Detalles del pedido:*\n`;
  
  carrito.forEach(item => {
    mensaje += `➤ ${item.nombre} x${item.cantidad} - $U ${(item.precio * item.cantidad).toLocaleString('es-UY')}\n`;
  });
  
  const subtotal = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
  const costoEnvio = envio === 'montevideo' ? 150 : envio === 'interior' ? 300 : 0;
  const total = subtotal + costoEnvio;
  
  mensaje += `\n*💰 Total:*\n`;
  mensaje += `Subtotal: $U ${subtotal.toLocaleString('es-UY')}\n`;
  mensaje += `Envío: $U ${costoEnvio.toLocaleString('es-UY')}\n`;
  mensaje += `*TOTAL A PAGAR: $U ${total.toLocaleString('es-UY')}*\n\n`;
  
  mensaje += `*👤 Datos del cliente:*\n`;
  mensaje += `Nombre: ${nombre} ${apellido}\n`;
  mensaje += `Teléfono: ${telefono}\n`;
  mensaje += `Método de envío: ${envio === 'montevideo' ? 'Envío Montevideo ($150)' : envio === 'interior' ? 'Envío Interior ($300)' : 'Retiro en local (Gratis)'}\n`;
  
  if (envio !== 'retiro') {
    mensaje += `Dirección: ${direccion}\n`;
  }
  
  if (notas) {
    mensaje += `\n*📝 Notas adicionales:*\n${notas}`;
  }

  const numeroWhatsApp = '59893566283';
  sessionStorage.setItem('ultimoPedidoWhatsApp', mensaje);
  const urlWhatsApp = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje)}`;
  
  const nuevaPestaña = window.open(urlWhatsApp, '_blank');
  
  setTimeout(() => {
    if (!nuevaPestaña || nuevaPestaña.closed) {
      window.location.href = `https://api.whatsapp.com/send?phone=${numeroWhatsApp}&text=${encodeURIComponent(mensaje)}`;
    }
  }, 500);

  setTimeout(() => {
    document.getElementById('modal-datos-envio').classList.remove('visible');
    setTimeout(() => {
      document.getElementById('modal-datos-envio').style.display = 'none';
      carrito = [];
      guardarCarrito();
      actualizarUI();
      mostrarNotificacion('Pedido listo para enviar por WhatsApp', 'exito');
      document.getElementById('form-envio').reset();
    }, 300);
  }, 1000);
});

function preguntarStock(nombreProducto) {
  const asunto = encodeURIComponent(`Consulta sobre disponibilidad de "${nombreProducto}"`);
  const cuerpo = encodeURIComponent(`Hola Patofelting,\n\nMe gustaría saber cuándo estará disponible el producto: ${nombreProducto}\n\nSaludos cordiales,\n[Nombre del Cliente]`);
  window.location.href = `mailto:patofelting@gmail.com?subject=${asunto}&body=${cuerpo}`;
}


// ... (mantén aquí el resto de tu código, como EmailJS, menú hamburguesa, FAQ, etc.)
