// ========== CONFIGURACIÓN GLOBAL ==========
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const PLACEHOLDER_IMAGE = 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

// ========== INICIALIZAR FIREBASE ==========
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, onValue, runTransaction, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
signInAnonymously(auth);

// ========== ESTADO GLOBAL ==========
let productos = [];
let carrito = [];
let paginaActual = 1;
let filtrosActuales = {
  precioMin: null,
  precioMax: null,
  categoria: 'todos',
  busqueda: ''
};

// ========== REFERENCIAS DOM ==========
function getEl(id) { return document.getElementById(id); }
const elementos = {
  galeria: getEl('galeria-productos'),
  paginacion: getEl('paginacion'),
  modal: getEl('producto-modal'),
  modalContenido: getEl('modal-contenido'),
  carritoBtn: getEl('carrito-btn-main'),
  carritoPanel: getEl('carrito-panel'),
  carritoOverlay: document.querySelector('.carrito-overlay'),
  listaCarrito: getEl('lista-carrito'),
  totalCarrito: getEl('total'),
  contadorCarrito: getEl('contador-carrito'),
  inputBusqueda: document.querySelector('.input-busqueda'),
  selectCategoria: getEl('filtro-categoria'),
  minSlider: getEl('min-slider'),
  maxSlider: getEl('max-slider'),
  resetFiltros: document.querySelector('.boton-resetear-filtros'),
  btnCerrarCarrito: document.querySelector('.cerrar-carrito'),
  btnVaciarCarrito: document.querySelector('.boton-vaciar-carrito'),
  btnFinalizarCompra: document.querySelector('.boton-finalizar-compra'),
  faqToggles: document.querySelectorAll('.faq-toggle')
};

// ========== UTILIDADES ==========
function mostrarNotificacion(msg, tipo = 'exito') {
  const noti = document.createElement('div');
  noti.className = `notificacion ${tipo}`;
  noti.textContent = msg;
  document.body.appendChild(noti);
  setTimeout(() => noti.classList.add('show'), 10);
  setTimeout(() => {
    noti.classList.remove('show');
    setTimeout(() => noti.remove(), 300);
  }, 2200);
}

// ========== CARRITO (SOLO FRONTEND) ==========
function guardarCarrito() {
  localStorage.setItem(LS_CARRITO_KEY, JSON.stringify(carrito));
  actualizarContadorCarrito();
}
function cargarCarrito() {
  carrito = JSON.parse(localStorage.getItem(LS_CARRITO_KEY)) || [];
  actualizarContadorCarrito();
}
function actualizarContadorCarrito() {
  const total = carrito.reduce((a, i) => a + i.cantidad, 0);
  if (elementos.contadorCarrito) {
    elementos.contadorCarrito.textContent = total;
    elementos.contadorCarrito.classList.toggle('visible', total > 0);
  }
}
function renderizarCarrito() {
  if (!elementos.listaCarrito || !elementos.totalCarrito) return;
  if (carrito.length === 0) {
    elementos.listaCarrito.innerHTML = '<p class="carrito-vacio">Tu carrito está vacío</p>';
    elementos.totalCarrito.textContent = 'Total: $U 0';
    return;
  }
  elementos.listaCarrito.innerHTML = carrito.map(item => {
    const prod = productos.find(p => p.id === item.id) || item;
    const stockTotal = prod.stock || 0;
    const disponibles = Math.max(0, stockTotal + item.cantidad); // Stock real + lo que ya tengo en carrito
    const puedeAumentar = item.cantidad < disponibles;
    
    return `
      <li class="carrito-item" data-id="${item.id}">
        <img src="${prod.imagenes?.[0] || PLACEHOLDER_IMAGE}" class="carrito-item-img" alt="${prod.nombre}">
        <div class="carrito-item-info">
          <span class="carrito-item-nombre">${prod.nombre}</span>
          <span class="carrito-item-precio">$U ${prod.precio.toLocaleString('es-UY')}</span>
          <div class="carrito-stock-info">
            <small>Stock disponible: ${disponibles} unidades</small>
          </div>
          <div class="carrito-item-controls">
            <button class="disminuir-cantidad" data-id="${item.id}" ${item.cantidad <= 1 ? 'disabled' : ''}>-</button>
            <input type="number" class="carrito-cantidad-input" value="${item.cantidad}" min="1" max="${disponibles}" data-id="${item.id}">
            <button class="aumentar-cantidad" data-id="${item.id}" ${!puedeAumentar ? 'disabled' : ''}>+</button>
          </div>
          <span class="carrito-item-subtotal">Subtotal: $U ${(item.precio * item.cantidad).toLocaleString('es-UY')}</span>
        </div>
      </li>
    `;
  }).join('');
  const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
  elementos.totalCarrito.textContent = `Total: $U ${total.toLocaleString('es-UY')}`;
  
  // Event listeners para los controles
  document.querySelectorAll('.disminuir-cantidad').forEach(btn => {
    btn.onclick = () => modificarCantidadEnCarrito(parseInt(btn.dataset.id), -1);
  });
  document.querySelectorAll('.aumentar-cantidad').forEach(btn => {
    btn.onclick = () => modificarCantidadEnCarrito(parseInt(btn.dataset.id), 1);
  });
  document.querySelectorAll('.carrito-cantidad-input').forEach(input => {
    input.addEventListener('change', (e) => {
      const id = parseInt(e.target.dataset.id);
      const nuevaCantidad = parseInt(e.target.value);
      const item = carrito.find(i => i.id === id);
      if (item && nuevaCantidad > 0) {
        const diferencia = nuevaCantidad - item.cantidad;
        modificarCantidadEnCarrito(id, diferencia);
      }
    });
  });
}
async function modificarCantidadEnCarrito(id, delta) {
  const item = carrito.find(i => i.id === id);
  if (!item) return;
  
  const prod = productos.find(p => p.id === id);
  if (!prod) return;

  const nuevaCantidad = item.cantidad + delta;
  
  // Si vamos a disminuir, solo validamos que no sea menor a 1
  if (delta < 0) {
    if (nuevaCantidad < 1) return;
    
    // Devolver stock a Firebase
    const productoRef = ref(db, `productos/${id}`);
    try {
      await runTransaction(productoRef, (currentData) => {
        if (currentData === null) return currentData;
        return {
          ...currentData,
          stock: (currentData.stock || 0) + Math.abs(delta)
        };
      });
      
      item.cantidad = nuevaCantidad;
      guardarCarrito();
      renderizarCarrito();
      renderizarProductos();
      
    } catch (error) {
      console.error("Error al devolver stock:", error);
      mostrarNotificacion("❌ Error al actualizar cantidad", "error");
    }
    return;
  }
  
  // Si vamos a aumentar, validamos stock y usamos transacción
  if (delta > 0) {
    const productoRef = ref(db, `productos/${id}`);
    try {
      await runTransaction(productoRef, (currentData) => {
        if (currentData === null) {
          throw new Error("Producto no encontrado");
        }
        
        const stockActual = currentData.stock || 0;
        
        if (stockActual < delta) {
          throw new Error("Stock insuficiente");
        }
        
        return {
          ...currentData,
          stock: stockActual - delta
        };
      });

      item.cantidad = nuevaCantidad;
      guardarCarrito();
      renderizarCarrito();
      renderizarProductos();
      
    } catch (error) {
      console.error("Error al modificar cantidad:", error);
      if (error.message === "Stock insuficiente") {
        mostrarNotificacion("❌ Stock insuficiente", "error");
      } else {
        mostrarNotificacion("❌ Error al actualizar cantidad", "error");
      }
    }
  }
}

// ========== LECTURA DE PRODUCTOS (SOLO LEE FIREBASE) ==========
function escucharProductosFirebase() {
  const productosRef = ref(db, 'productos');
  onValue(productosRef, snap => {
    const data = snap.val();
    productos = [];
    for (let key in data) {
      productos.push({
        ...data[key],
        id: data[key].id ? parseInt(data[key].id) : parseInt(key),
        imagenes: Array.isArray(data[key].imagenes) ? data[key].imagenes : [PLACEHOLDER_IMAGE],
        precio: parseFloat(data[key].precio) || 0,
        stock: parseInt(data[key].stock) || 0,
        categoria: (data[key].categoria || 'otros').toLowerCase()
      });
    }
    // Sync carrito: Si stock bajó, ajusta cantidades
    let cambiado = false;
    carrito.forEach(item => {
      const prod = productos.find(p => p.id === item.id);
      if (prod && item.cantidad > prod.stock) {
        item.cantidad = prod.stock;
        cambiado = true;
      }
      if (prod && prod.stock === 0) {
        item.cantidad = 0;
        cambiado = true;
      }
    });
    if (cambiado) {
      carrito = carrito.filter(i => i.cantidad > 0);
      guardarCarrito();
      mostrarNotificacion("⚠️ ¡Stock actualizado!", "info");
    }
    renderizarProductos();
    renderizarCarrito();
    actualizarCategorias();
  }, (error) => {
    console.error("Error al cargar productos:", error);
    // Fallback con productos mock para demostración
    loadMockProducts();
  });
}

// Mock products for demonstration when Firebase is not available
function loadMockProducts() {
  productos = [
    {
      id: 1,
      nombre: "Gatito de fieltro",
      precio: 850,
      stock: 5,
      categoria: "animales",
      descripcion: "Adorable gatito hecho en fieltro con aguja. Perfecto para decorar o regalar.",
      imagenes: [PLACEHOLDER_IMAGE]
    },
    {
      id: 2,
      nombre: "Hongo mágico",
      precio: 650,
      stock: 0,
      categoria: "fantasia",
      descripcion: "Hongo fantástico con detalles únicos.",
      imagenes: [PLACEHOLDER_IMAGE]
    },
    {
      id: 3,
      nombre: "Perrito golden",
      precio: 1200,
      stock: 2,
      categoria: "animales",
      descripcion: "Perrito golden retriever en miniatura.",
      imagenes: [PLACEHOLDER_IMAGE]
    },
    {
      id: 4,
      nombre: "Unicornio rosa",
      precio: 950,
      stock: 8,
      categoria: "fantasia",
      descripcion: "Unicornio mágico con crin de colores.",
      imagenes: [PLACEHOLDER_IMAGE]
    },
    {
      id: 5,
      nombre: "Búho nocturno",
      precio: 780,
      stock: 1,
      categoria: "animales",
      descripcion: "Búho con grandes ojos expresivos.",
      imagenes: [PLACEHOLDER_IMAGE]
    },
    {
      id: 6,
      nombre: "Dragón bebé",
      precio: 1450,
      stock: 3,
      categoria: "fantasia",
      descripción: "Pequeño dragón amigable con alas extendidas.",
      imagenes: [PLACEHOLDER_IMAGE]
    }
  ];
  
  // Sync carrito con productos mock
  let cambiado = false;
  carrito.forEach(item => {
    const prod = productos.find(p => p.id === item.id);
    if (prod && item.cantidad > prod.stock) {
      item.cantidad = prod.stock;
      cambiado = true;
    }
    if (prod && prod.stock === 0) {
      item.cantidad = 0;
      cambiado = true;
    }
  });
  if (cambiado) {
    carrito = carrito.filter(i => i.cantidad > 0);
    guardarCarrito();
    mostrarNotificacion("⚠️ ¡Stock actualizado!", "info");
  }
  
  renderizarProductos();
  renderizarCarrito();
  actualizarCategorias();
}

// ========== RENDER Y FILTROS ==========
function filtrarProductos() {
  const { precioMin, precioMax, categoria, busqueda } = filtrosActuales;
  return productos.filter(p => {
    return (
      (precioMin == null || p.precio >= precioMin) &&
      (precioMax == null || p.precio <= precioMax) &&
      (categoria === 'todos' || p.categoria === categoria) &&
      (!busqueda || p.nombre.toLowerCase().includes(busqueda))
    );
  });
}
function renderizarProductos() {
  const productosFiltrados = filtrarProductos();
  const inicio = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
  const paginados = productosFiltrados.slice(inicio, inicio + PRODUCTOS_POR_PAGINA);
  if (!elementos.galeria) return;
  if (paginados.length === 0) {
    elementos.galeria.innerHTML = '<p class="sin-productos">No se encontraron productos.</p>';
    return;
  }
  elementos.galeria.innerHTML = paginados.map(crearCardProducto).join('');
  renderizarPaginacion(productosFiltrados.length);
  elementos.galeria.querySelectorAll('.producto-card').forEach(card => {
    card.querySelector('.boton-agregar')?.addEventListener('click', e => {
      e.stopPropagation();
      const id = parseInt(card.dataset.id);
      const cantidadInput = card.querySelector(`#cantidad-${id}`);
      const cantidad = parseInt(cantidadInput?.value || 1);
      agregarAlCarrito(id, cantidad);
    });
    card.querySelector('.boton-detalles')?.addEventListener('click', e => {
      e.stopPropagation();
      verDetalle(parseInt(card.dataset.id));
    });
  });
}
function crearCardProducto(p) {
  const enCarrito = carrito.find(i => i.id === p.id);
  const disp = Math.max(0, p.stock - (enCarrito?.cantidad || 0));
  const agot = disp <= 0;
  return `
    <div class="producto-card ${agot ? 'agotado' : ''}" data-id="${p.id}">
      <img src="${p.imagenes[0] || PLACEHOLDER_IMAGE}" alt="${p.nombre}" class="producto-img">
      <h3 class="producto-nombre">${p.nombre}</h3>
      <p class="producto-precio">$U ${p.precio.toLocaleString('es-UY')}</p>
      <p class="producto-stock ${agot ? 'agotado' : 'disponible'}">
        ${agot ? 'AGOTADO' : `Stock: ${disp} disponible${disp !== 1 ? 's' : ''}`}
      </p>
      <div class="card-acciones">
        <div class="cantidad-controls ${agot ? 'disabled' : ''}">
          <label for="cantidad-${p.id}" class="cantidad-label" style="font-size:12px;">Cantidad:</label>
          <input type="number" id="cantidad-${p.id}" class="cantidad-input" value="1" min="1" max="${disp}" ${agot ? 'disabled' : ''}>
        </div>
        <button class="boton-agregar${agot ? ' agotado' : ''}" ${agot ? 'disabled' : ''}>
          ${agot ? 'Agotado' : 'Agregar'}
        </button>
        <button class="boton-detalles">Ver Detalle</button>
      </div>
    </div>
  `;
}
function renderizarPaginacion(total) {
  if (!elementos.paginacion) return;
  const totalPages = Math.ceil(total / PRODUCTOS_POR_PAGINA);
  if (totalPages <= 1) return elementos.paginacion.innerHTML = '';
  elementos.paginacion.innerHTML = '';
  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;
    btn.className = i === paginaActual ? 'active' : '';
    btn.onclick = () => {
      paginaActual = i;
      renderizarProductos();
    };
    elementos.paginacion.appendChild(btn);
  }
}
function actualizarCategorias() {
  if (!elementos.selectCategoria) return;
  const cats = ['todos', ...new Set(productos.map(p => p.categoria).filter(Boolean))];
  elementos.selectCategoria.innerHTML = cats
    .map(cat => `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`)
    .join('');
}

// ========== AGREGAR AL CARRITO ==========
async function agregarAlCarrito(id, cantidad = 1) {
  const prod = productos.find(p => p.id === id);
  if (!prod) {
    mostrarNotificacion("❌ Producto no encontrado", "error");
    return;
  }

  // Validación inicial de stock
  const itemEnCarrito = carrito.find(i => i.id === id);
  const cantidadActualEnCarrito = itemEnCarrito ? itemEnCarrito.cantidad : 0;
  const cantidadTotal = cantidadActualEnCarrito + cantidad;
  
  if (cantidadTotal > prod.stock) {
    mostrarNotificacion("❌ Stock insuficiente", "error");
    return;
  }

  // Usar transacción para validar y descontar stock atómicamente
  const productoRef = ref(db, `productos/${prod.id}`);
  
  try {
    await runTransaction(productoRef, (currentData) => {
      if (currentData === null) {
        throw new Error("Producto no encontrado");
      }
      
      const stockActual = currentData.stock || 0;
      
      // Validar stock real contra cantidad solicitada
      if (stockActual < cantidad) {
        throw new Error("Stock insuficiente");
      }
      
      // Descontar stock
      return {
        ...currentData,
        stock: stockActual - cantidad
      };
    });

    // Si llegamos aquí, la transacción fue exitosa
    const item = carrito.find(i => i.id === id);
    if (item) {
      item.cantidad += cantidad;
    } else {
      carrito.push({ ...prod, cantidad });
    }
    
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion("✅ Producto agregado al carrito", "exito");
    
  } catch (error) {
    console.error("Error al agregar al carrito:", error);
    if (error.message === "Stock insuficiente") {
      mostrarNotificacion("❌ Stock insuficiente - Otro usuario compró este producto", "error");
    } else {
      mostrarNotificacion("❌ Error al agregar al carrito", "error");
    }
  }
}
window.agregarAlCarrito = agregarAlCarrito;

// ========== MODAL DETALLE ==========
function verDetalle(id) {
  const prod = productos.find(p => p.id === id);
  if (!prod) return mostrarNotificacion("Producto no encontrado", "error");
  mostrarModalProducto(prod);
}
window.verDetalle = verDetalle;
function mostrarModalProducto(prod) {
  if (!elementos.modal || !elementos.modalContenido) return;
  let currentIndex = 0;
  function renderCarrusel() {
    const disp = Math.max(0, prod.stock - (carrito.find(i => i.id === prod.id)?.cantidad || 0));
    const agotado = disp <= 0;
    elementos.modalContenido.innerHTML = `
      <button class="cerrar-modal" aria-label="Cerrar modal">×</button>
      <div class="modal-flex">
        <div class="modal-carrusel">
          <img src="${prod.imagenes[currentIndex] || PLACEHOLDER_IMAGE}" class="modal-img" alt="${prod.nombre}">
          ${prod.imagenes.length > 1 ? `
            <div class="modal-controls">
              <button class="modal-prev" ${currentIndex === 0 ? 'disabled' : ''}>←</button>
              <button class="modal-next" ${currentIndex === prod.imagenes.length - 1 ? 'disabled' : ''}>→</button>
            </div>
          ` : ''}
          <div class="modal-thumbnails">
            ${prod.imagenes.map((img, i) =>
              `<img src="${img}" class="thumbnail ${i === currentIndex ? 'active' : ''}" data-index="${i}">`
            ).join('')}
          </div>
        </div>
        <div class="modal-info">
          <h1>${prod.nombre}</h1>
          <p class="modal-precio">$U ${prod.precio.toLocaleString('es-UY')}</p>
          <p class="modal-stock ${agotado ? 'agotado' : 'disponible'}">
            ${agotado ? '❌ AGOTADO' : `✅ Stock disponible: ${disp} unidad${disp !== 1 ? 'es' : ''}`}
          </p>
          <div class="modal-descripcion">${prod.descripcion || ''}</div>
          <div class="modal-acciones">
            <div class="cantidad-modal-container">
              <label for="cantidad-modal-input">Cantidad:</label>
              <input type="number" value="1" min="1" max="${disp}" class="cantidad-modal-input" ${agotado ? 'disabled' : ''}>
            </div>
            <button class="boton-agregar-modal${agotado ? ' agotado' : ''}" ${agotado ? 'disabled' : ''}>
              ${agotado ? 'Agotado' : 'Agregar al carrito'}
            </button>
          </div>
        </div>
      </div>
    `;
    elementos.modalContenido.querySelector('.cerrar-modal').onclick = cerrarModal;
    elementos.modalContenido.querySelector('.modal-prev')?.addEventListener('click', () => { currentIndex--; renderCarrusel(); });
    elementos.modalContenido.querySelector('.modal-next')?.addEventListener('click', () => { currentIndex++; renderCarrusel(); });
    elementos.modalContenido.querySelectorAll('.thumbnail').forEach(th => {
      th.addEventListener('click', () => { currentIndex = parseInt(th.dataset.index); renderCarrusel(); });
    });
    elementos.modalContenido.querySelector('.boton-agregar-modal')?.addEventListener('click', () => {
      const inputCantidad = elementos.modalContenido.querySelector('.cantidad-modal-input');
      const cantidadAgregar = parseInt(inputCantidad.value, 10) || 1;
      agregarAlCarrito(prod.id, cantidadAgregar);
      cerrarModal();
    });
  }
  elementos.modal.classList.add('visible');
  renderCarrusel();
}
function cerrarModal() {
  elementos.modal?.classList.remove('visible');
}

// ========== CARRITO UI ==========
function toggleCarrito(forceState) {
  if (!elementos.carritoPanel || !elementos.carritoOverlay) return;
  let isOpen = typeof forceState === 'boolean'
    ? forceState
    : !elementos.carritoPanel.classList.contains('active');
  elementos.carritoPanel.classList.toggle('active', isOpen);
  elementos.carritoOverlay.classList.toggle('active', isOpen);
  document.body.classList.toggle('no-scroll', isOpen);
  if (isOpen) renderizarCarrito();
}

// ========== FILTROS, FAQ, EVENTOS ==========
function aplicarFiltros() {
  paginaActual = 1;
  renderizarProductos();
}
function resetearFiltros() {
  filtrosActuales = { precioMin: null, precioMax: null, categoria: 'todos', busqueda: '' };
  if (elementos.inputBusqueda) elementos.inputBusqueda.value = '';
  if (elementos.selectCategoria) elementos.selectCategoria.value = 'todos';
  if (elementos.minSlider) elementos.minSlider.value = '';
  if (elementos.maxSlider) elementos.maxSlider.value = '';
  aplicarFiltros();
}
function inicializarFAQ() {
  document.querySelectorAll('.faq-toggle').forEach(toggle => {
    toggle.addEventListener('click', function () {
      const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', !isExpanded);
      const content = toggle.nextElementSibling;
      if (content) content.hidden = isExpanded;
    });
  });
}
function inicializarEventos() {
  elementos.carritoBtn?.addEventListener('click', () => toggleCarrito(true));
  elementos.carritoOverlay?.addEventListener('click', () => toggleCarrito(false));
  elementos.btnCerrarCarrito?.addEventListener('click', () => toggleCarrito(false));
  elementos.btnVaciarCarrito?.addEventListener('click', () => {
    carrito = [];
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion('🧹 Carrito vaciado', 'exito');
  });
  elementos.inputBusqueda?.addEventListener('input', e => {
    filtrosActuales.busqueda = e.target.value.toLowerCase();
    aplicarFiltros();
  });
  elementos.selectCategoria?.addEventListener('change', e => {
    filtrosActuales.categoria = e.target.value;
    aplicarFiltros();
  });
  elementos.minSlider?.addEventListener('input', e => {
    filtrosActuales.precioMin = e.target.value ? parseFloat(e.target.value) : null;
    aplicarFiltros();
  });
  elementos.maxSlider?.addEventListener('input', e => {
    filtrosActuales.precioMax = e.target.value ? parseFloat(e.target.value) : null;
    aplicarFiltros();
  });
  elementos.resetFiltros?.addEventListener('click', resetearFiltros);
  inicializarFAQ();
}

// ========== INICIO ==========
document.addEventListener('DOMContentLoaded', () => {
  // Try Firebase first, fallback to mock data
  try {
    escucharProductosFirebase();
  } catch (error) {
    console.log("Firebase no disponible, usando datos mock");
    loadMockProducts();
  }
  cargarCarrito();
  renderizarCarrito();
  inicializarEventos();
});
