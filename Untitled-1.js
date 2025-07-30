// ===============================
// CONFIGURACIÓN GLOBAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const CSV_URL = window.SHEET_CSV_URL;
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

// ======== Primero declaramos firebaseConfig y luego inicializamos Firebase ========
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase,
  ref,
  runTransaction,
  get // 👈 AÑADILO ACÁ
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";


const firebaseConfig = {
  apiKey: "AIzaSyD261TL6XuBp12rUNCcMKyP7_nMaCVYc7Y",
  authDomain: "patofelting-b188f.firebaseapp.com",
  databaseURL: "https://patofelting-b188f-default-rtdb.firebaseio.com",
  projectId: "patofelting-b188f",
  storageBucket: "patofelting-b188f.appspot.com",
  messagingSenderId: "858377467588",
  appId: "1:858377467588:web:cade9de05ebccc17f87b91"
};

// ✅ Inicializar Firebase App
const app = initializeApp(firebaseConfig);

// ✅ Obtener instancias de servicios
const db = getDatabase(app);
const auth = getAuth(app);

// ==================== AUTENTICACIÓN ANÓNIMA ====================
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
// LOAD PRODUCTS ON PAGE LOAD
// ===============================
document.addEventListener('DOMContentLoaded', () => {
  signInAnonymously(auth)
    .then(() => {
      console.log('Signed in anonymously');
      cargarProductosDesdeFirebase();
    })
    .catch((error) => {
      console.error('Error signing in:', error);
      let errorMessage = 'Error de autenticación';
      if (error.code === 'auth/configuration-not-found') {
        errorMessage = 'Autenticación anónima no está habilitada en Firebase. Por favor, contacta al administrador.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Error de red. Por favor, verifica tu conexión a internet.';
      }
      mostrarNotificacion(errorMessage, 'error');
    });
});

// Resto del código...

// ===============================
// Referencias al DOM
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
  inputBusqueda: document.querySelector('.input-busqueda'),
  selectCategoria: getElement('filtro-categoria'),
  precioMinInput: getElement('min-slider'),
  precioMaxInput: getElement('max-slider'),
  botonResetearFiltros: document.querySelector('.boton-resetear-filtros'),
  carritoBtnMain: getElement('carrito-btn-main'),
  carritoPanel: getElement('carrito-panel'),
  carritoOverlay: document.querySelector('.carrito-overlay'),
  btnVaciarCarrito: document.querySelector('.boton-vaciar-carrito'),
  btnFinalizarCompra: document.querySelector('.boton-finalizar-compra'),
  btnCerrarCarrito: document.querySelector('.cerrar-carrito'),
  avisoPreCompraModal: getElement('aviso-pre-compra-modal'),
  btnEntendidoAviso: getElement('btn-entendido-aviso'),
  btnCancelarAviso: getElement('btn-cancelar-aviso'),
  productLoader: getElement('product-loader'),
  hamburguesa: document.querySelector('.hamburguesa'),
  menu: getElement('menu'),
  aplicarRangoBtn: document.querySelector('.aplicar-rango-btn')
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
  } catch {
    carrito = [];
  }
}

async function vaciarCarrito() {
  if (carrito.length === 0) return;

  try {
    await Promise.all(carrito.map(async item => {
      const productRef = ref(db, `productos/${item.id}/stock`);
      await runTransaction(productRef, (currentStock) => {
        // Initialize to 0 if stock doesn't exist
        if (currentStock === null || typeof currentStock !== 'number') {
          return item.cantidad;
        }
        return currentStock + item.cantidad;
      });
    }));

    carrito = [];
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion('Carrito vaciado y stock restaurado', 'exito');
  } catch (error) {
    console.error("Error al restaurar stock:", error);
    mostrarNotificacion('Error al restaurar stock', 'error');
  }
}

elementos.btnVaciarCarrito?.addEventListener('click', vaciarCarrito);

elementos.btnVaciarCarrito?.addEventListener('click', async () => {
  if (carrito.length === 0) {
    mostrarNotificacion('El carrito ya está vacío', 'info');
    return;
  }

  for (const item of carrito) {
    const productoRef = ref(firebaseDatabase, `productos/${item.id}/stock`);
    
    await runTransaction(productoRef, (stockActual) => {
      if (stockActual === null) return stockActual;
      return stockActual + item.cantidad;
    });
  }

  carrito = [];
  
  mostrarNotificacion('Carrito vaciado y stock restaurado', 'success');
});

function actualizarContadorCarrito() {
  const total = carrito.reduce((sum, i) => sum + i.cantidad, 0);
  if (elementos.contadorCarrito) {
    elementos.contadorCarrito.textContent = total;
    elementos.contadorCarrito.classList.toggle('visible', total > 0);
  }
}

async function cargarProductosDesdeFirebase() {
  const productosRef = ref(db, 'productos');
  
  try {
    // Mostrar loader
    if (elementos.productLoader) {
      elementos.productLoader.style.display = 'flex';
      elementos.productLoader.hidden = false;
    }

    // Configurar listener en tiempo real
    onValue(productosRef, (snapshot) => {
      if (!snapshot.exists()) {
        elementos.galeriaProductos.innerHTML = '<p class="sin-productos">No hay productos disponibles.</p>';
        return;
      }

      const data = snapshot.val();
      productos = Object.keys(data).map(key => {
        const p = data[key];
        
        // Validación más robusta del producto
        if (!p || typeof p !== 'object') {
          console.warn(`Producto ${key} tiene datos inválidos`, p);
          return null;
        }

        // Procesamiento de imágenes con validación
        let imagenes = [PLACEHOLDER_IMAGE];
        if (Array.isArray(p.imagenes) && p.imagenes.length > 0) {
          imagenes = p.imagenes.filter(img => typeof img === 'string' && img.trim() !== '');
        }

        // Validación y normalización de datos
        return {
          id: p.id && !isNaN(p.id) ? parseInt(p.id) : parseInt(key),
          nombre: typeof p.nombre === 'string' ? p.nombre.trim() : 'Sin nombre',
          descripcion: typeof p.descripcion === 'string' ? p.descripcion.trim() : '',
          precio: !isNaN(parseFloat(p.precio)) ? parseFloat(p.precio) : 0,
          stock: !isNaN(parseInt(p.stock, 10)) ? Math.max(0, parseInt(p.stock, 10)) : 0,
          imagenes: imagenes,
          adicionales: typeof p.adicionales === 'string' ? p.adicionales.trim() : '',
          alto: !isNaN(parseFloat(p.alto)) ? parseFloat(p.alto) : null,
          ancho: !isNaN(parseFloat(p.ancho)) ? parseFloat(p.ancho) : null,
          profundidad: !isNaN(parseFloat(p.profundidad)) ? parseFloat(p.profundidad) : null,
          categoria: typeof p.categoria === 'string' ? p.categoria.toLowerCase().trim() : 'otros',
          vendido: typeof p.vendido === 'string' ? p.vendido.trim() : '',
          estado: typeof p.estado === 'string' ? p.estado.trim() : ''
        };
      }).filter(Boolean);

      console.log("✅ Productos actualizados:", productos);
      renderizarProductos();
      actualizarCategorias();
      actualizarUI();
    }, (error) => {
      console.error('Error en listener de productos:', error);
      mostrarNotificacion('Error al recibir actualizaciones de productos', 'error');
    });

  } catch (e) {
    console.error('Error al cargar productos:', e);
    mostrarNotificacion('Error al cargar productos: ' + (e.message || 'Error desconocido'), 'error');
    elementos.galeriaProductos.innerHTML = '<p class="error-carga">No se pudieron cargar los productos.</p>';
  } finally {
    // Ocultar loader después de un pequeño delay para evitar parpadeo
    setTimeout(() => {
      if (elementos.productLoader) {
        elementos.productLoader.style.display = 'none';
        elementos.productLoader.hidden = true;
      }
    }, 300);
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
    const producto = productos.find(p => p.id === item.id);
    const disponibles = producto ? Math.max(0, producto.stock - item.cantidad) : 0;
    
    return `
    <li class="carrito-item" data-id="${item.id}">
      <img src="${item.imagen}" class="carrito-item-img" alt="${item.nombre}" loading="lazy">
      <div class="carrito-item-info">
        <span class="carrito-item-nombre">${item.nombre}</span>
        <span class="carrito-item-precio">$U ${item.precio.toLocaleString('es-UY')} c/u</span>
        <div class="carrito-item-controls">
          <button class="disminuir-cantidad" data-id="${item.id}" aria-label="Reducir cantidad" ${item.cantidad <= 1 ? 'disabled' : ''}>-</button>
          <span class="carrito-item-cantidad">${item.cantidad}</span>
          <button class="aumentar-cantidad" data-id="${item.id}" aria-label="Aumentar cantidad" ${disponibles <= 0 ? 'disabled' : ''}>+</button>
        </div>
        <span class="carrito-item-subtotal">Subtotal: $U ${(item.precio * item.cantidad).toLocaleString('es-UY')}</span>
      </div>
    </li>
  `}).join('');

  const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
  elementos.totalCarrito.textContent = `Total: $U ${total.toLocaleString('es-UY')}`;
  
  document.querySelectorAll('.disminuir-cantidad').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      const item = carrito.find(item => item.id === id);
      if (item && item.cantidad > 1) {
        item.cantidad--;
        guardarCarrito();
        renderizarCarrito();
        mostrarNotificacion(`Reducida cantidad de "${item.nombre}"`, 'info');
      }
    });
  });

  document.querySelectorAll('.aumentar-cantidad').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      agregarAlCarrito(id, 1); // Use transaction-based add to check stock
    });
  });
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
function renderizarProductos(datos = productos) {
  const galeria = elementos.galeriaProductos;
  if (!galeria) return;

  // Filtrar y paginar productos
  const productosFiltrados = filtrarProductos();
  const totalProductos = productosFiltrados.length;
  const startIndex = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
  const endIndex = startIndex + PRODUCTOS_POR_PAGINA;
  const productosAPerPage = productosFiltrados.slice(startIndex, endIndex);

  // Limpiar galería
  galeria.innerHTML = '';

  // Mostrar mensaje si no hay productos
  if (!productosAPerPage || productosAPerPage.length === 0) {
    galeria.innerHTML = `
      <div class="sin-resultados">
        <i class="fas fa-search"></i>
        <p>No encontramos productos que coincidan con tus filtros</p>
        <button class="boton-resetear-filtros" onclick="resetearFiltros()">
          <i class="fas fa-undo"></i> Reiniciar filtros
        </button>
      </div>
    `;
    return;
  }

  // Crear fragmento de documento para mejor performance
  const fragment = document.createDocumentFragment();

  productosAPerPage.forEach(producto => {
    const enCarrito = carrito.find(item => item.id === producto.id);
    const disponibles = Math.max(0, producto.stock - (enCarrito?.cantidad || 0));
    const agotado = disponibles <= 0;
    const imagenValida = producto.imagenes?.[0] || PLACEHOLDER_IMAGE;

    // Escapar caracteres especiales para prevenir XSS
    const escapeHTML = str => str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));

    const card = document.createElement('div');
    card.className = `producto-card ${agotado ? 'agotado' : ''} ${producto.estado === 'nuevo' ? 'nuevo' : ''}`;
    card.dataset.id = producto.id;
    card.dataset.categoria = producto.categoria;

    // Mejor estructura del card con eventos delegados
    card.innerHTML = `
      <div class="producto-imagen-container">
        <img src="${imagenValida}" alt="${escapeHTML(producto.nombre)}" class="producto-img" loading="lazy">
        ${producto.estado === 'oferta' ? '<span class="etiqueta-oferta">OFERTA</span>' : ''}
        ${producto.estado === 'nuevo' ? '<span class="etiqueta-nuevo">NUEVO</span>' : ''}
      </div>
      <div class="producto-info">
        <h3 class="producto-nombre">${escapeHTML(producto.nombre)}</h3>
        <p class="producto-precio">$U ${producto.precio.toLocaleString('es-UY')}</p>
        <p class="producto-stock ${agotado ? 'texto-agotado' : 'texto-disponible'}">
          ${agotado ? '<i class="fas fa-times-circle"></i> AGOTADO' : `<i class="fas fa-check-circle"></i> Disponible: ${disponibles}`}
        </p>
        <div class="card-acciones">
          <button class="boton-agregar ${agotado ? 'agotado' : ''}" data-id="${producto.id}" ${agotado ? 'disabled aria-disabled="true"' : ''}>
            ${agotado ? 'Agotado' : '<i class="fas fa-cart-plus"></i> Agregar'}
          </button>
          ${agotado ? `
          <button class="boton-aviso-stock" data-id="${producto.id}" data-nombre="${escapeHTML(producto.nombre)}">
            <i class="fas fa-bell"></i> Avisame
          </button>` : ''}
        </div>
        <button class="boton-detalles" data-id="${producto.id}">
          <i class="fas fa-search"></i> Ver Detalle
        </button>
      </div>
    `;

    fragment.appendChild(card);
  });

  galeria.appendChild(fragment);
  renderizarPaginacion(totalProductos);

  // Delegación de eventos para mejor performance
  galeria.addEventListener('click', manejarEventosGaleria);
}

// Función para manejar eventos delegados
function manejarEventosGaleria(e) {
  const target = e.target.closest('[data-id]');
  if (!target) return;

  const id = parseInt(target.dataset.id);
  const producto = productos.find(p => p.id === id);
  if (!producto) return;

  if (target.classList.contains('boton-detalles')) {
    verDetalle(id);
  } else if (target.classList.contains('boton-agregar')) {
    agregarAlCarrito(id, 1);
  } else if (target.classList.contains('boton-aviso-stock')) {
    preguntarStock(target.dataset.nombre || producto.nombre);
  }
}

function filtrarProductos() {
  return productos.filter(p => {
    if (!p) return false;
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

function actualizarCategorias() {
  if (!elementos.selectCategoria) return;
  const cats = ['todos', ...new Set(productos.map(p => p.categoria).filter(Boolean))];
  elementos.selectCategoria.innerHTML = cats
    .map(cat => `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`)
    .join('');
}

// ===============================
// FUNCIONES GLOBALES
// ===============================


function crearCardProducto(p) {
  const enCarrito = carrito.find(i => i.id === p.id);
  const disp = Math.max(0, p.stock - (enCarrito?.cantidad || 0));
  const agot = disp <= 0;
  const imagenPrincipal = p.imagenes && p.imagenes.length > 0 ? p.imagenes[0] : PLACEHOLDER_IMAGE;

  return `
    <div class="producto-card ${agot ? 'agotado' : ''}" data-id="${p.id}">
      <img src="${imagenPrincipal}" alt="${p.nombre}" class="producto-img" loading="lazy">
      <h3 class="producto-nombre">${p.nombre}</h3>
      <p class="producto-precio">$U ${p.precio.toLocaleString('es-UY')}</p>
      <p class="producto-stock">
        ${agot ? '<span class="texto-agotado">Agotado</span>' : `Stock: ${disp}`}
      </p>
      <div class="card-acciones">
        <button class="boton-agregar${agot ? ' agotado' : ''}" data-id="${p.id}" ${agot ? 'disabled' : ''}>
          ${agot ? '<i class="fas fa-times-circle"></i> Agotado' : '<i class="fas fa-cart-plus"></i> Agregar'}
        </button>
        ${agot ? `
        <button class="boton-aviso-stock" onclick="preguntarStock('${p.nombre}', ${p.id})">
          📩 Avisame cuando haya stock
        </button>` : ''}
      </div>
      <button class="boton-detalles" data-id="${p.id}">🔍 Ver Detalle</button>
    </div>
  `;
}

function renderizarPaginacion(totalProductos) {
  const totalPages = Math.ceil(totalProductos / PRODUCTOS_POR_PAGINA);
  const paginacionContainer = elementos.paginacion;

  if (totalPages <= 1) {
    paginacionContainer.innerHTML = '';
    return;
  }

  paginacionContainer.innerHTML = '';
  for (let i = 1; i <= totalPages; i++) {
    const pageButton = document.createElement('button');
    pageButton.textContent = i;
    pageButton.className = i === paginaActual ? 'active' : '';
    pageButton.addEventListener('click', () => {
      paginaActual = i;
      renderizarProductos();
    });
    paginacionContainer.appendChild(pageButton);
  }
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
          <img src="${producto.imagenes[currentIndex] || PLACEHOLDER_IMAGE}" class="modal-img" alt="${producto.nombre}">
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
                  `<img src="${img}" class="thumbnail ${i === currentIndex ? 'active' : ''}" data-index="${i}" alt="Miniatura ${i + 1}">`
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
    
    contenido.querySelector('.cerrar-modal').onclick = () => cerrarModal();
    contenido.querySelector('.boton-agregar-modal')?.addEventListener('click', () => {
      const cantidad = +(contenido.querySelector('.cantidad-modal-input').value || 1);
      agregarAlCarrito(producto.id, cantidad);
      cerrarModal();
    });

    contenido.querySelectorAll('.thumbnail').forEach((thumb, i) => {
      thumb.onclick = () => {
        currentIndex = i;
        renderCarrusel();
      };
    });
    
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
      if (!producto) return mostrarNotificacion('Producto no encontrado', 'error');
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
// INICIALIZACIÓN GENERAL
// ===============================
function init() {
  inicializarMenuHamburguesa();
  inicializarFAQ();
  setupContactForm();
  cargarCarrito();
  inicializarEventos();
}

// ===============================
// EVENTOS
// ===============================
function inicializarEventos() {
  elementos.carritoBtnMain?.addEventListener('click', () => toggleCarrito(true));
  elementos.carritoOverlay?.addEventListener('click', () => toggleCarrito(false));
  elementos.btnCerrarCarrito?.addEventListener('click', () => toggleCarrito(false));

  document.getElementById('select-envio')?.addEventListener('change', actualizarResumenPedido);
  elementos.btnVaciarCarrito?.addEventListener('click', vaciarCarrito);
  elementos.btnFinalizarCompra?.addEventListener('click', () => {
    if (carrito.length === 0) return mostrarNotificacion('El carrito está vacío', 'error');
    elementos.avisoPreCompraModal.style.display = 'flex';
    elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'false');
  });
  
  elementos.btnEntendidoAviso?.addEventListener('click', () => {
    const modalEnvio = document.getElementById('modal-datos-envio');
    if (modalEnvio) {
      elementos.avisoPreCompraModal.style.display = 'none';
      elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'true');
      modalEnvio.style.display = 'flex';
      setTimeout(() => {
        modalEnvio.classList.add('visible');
      }, 10);
      actualizarResumenPedido();
    }
  });

  elementos.inputBusqueda?.addEventListener('input', (e) => {
    filtrosActuales.busqueda = e.target.value.toLowerCase();
    aplicarFiltros();
  });
  
  elementos.selectCategoria?.addEventListener('change', (e) => {
    filtrosActuales.categoria = e.target.value;
    aplicarFiltros();
  });
  
  elementos.precioMinInput?.addEventListener('input', (e) => {
    filtrosActuales.precioMin = e.target.value ? parseFloat(e.target.value) : null;
    aplicarFiltros();
  });
  
  elementos.precioMaxInput?.addEventListener('input', (e) => {
    filtrosActuales.precioMax = e.target.value ? parseFloat(e.target.value) : null;
    aplicarFiltros();
  });
  
  elementos.aplicarRangoBtn?.addEventListener('click', () => {
    filtrosActuales.precioMin = elementos.precioMinInput.value ? parseFloat(elementos.precioMinInput.value) : null;
    filtrosActuales.precioMax = elementos.precioMaxInput.value ? parseFloat(elementos.precioMaxInput.value) : null;
    aplicarFiltros();
  });
  
  elementos.botonResetearFiltros?.addEventListener('click', resetearFiltros);
  conectarEventoModal();
}

function actualizarResumenPedido() {
  const resumenProductos = document.getElementById('resumen-productos');
  const resumenTotal = document.getElementById('resumen-total');
  
  if (!resumenProductos || !resumenTotal) {
    console.error('Elements for the summary not found');
    return;
  }

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

  const envioSelect = document.getElementById('select-envio');
  const metodoEnvio = envioSelect ? envioSelect.value : 'retiro';
  let costoEnvio = 0;
  let envioTexto = '';

  if (metodoEnvio === 'montevideo') {
    costoEnvio = 150;
    envioTexto = 'Envío Montevideo ($150)';
  } else if (metodoEnvio === 'interior') {
    costoEnvio = 300;
    envioTexto = 'Envío Interior ($300)';
  }

  html += `
    <div class="resumen-item resumen-subtotal">
      <span>Subtotal:</span>
      <span>$U ${subtotal.toLocaleString('es-UY')}</span>
    </div>
    ${metodoEnvio !== 'retiro' ? `
    <div class="resumen-item resumen-envio">
      <span>Envío:</span>
      <span>$U ${costoEnvio.toLocaleString('es-UY')}</span>
    </div>
    ` : ''}
  `;

  resumenProductos.innerHTML = html;
  const total = subtotal + costoEnvio;
  resumenTotal.textContent = `$U ${total.toLocaleString('es-UY')}`;
}

// Cerrar modal de envío
document.getElementById('btn-cerrar-modal-envio')?.addEventListener('click', function() {
  const modalEnvio = document.getElementById('modal-datos-envio');
  modalEnvio.classList.remove('visible');
  setTimeout(() => {
    modalEnvio.style.display = 'none';
  }, 300);
});

// Actualizar total cuando cambia el método de envío
document.getElementById('select-envio')?.addEventListener('change', function() {
  const grupoDireccion = document.getElementById('grupo-direccion');
  const resumenTotal = document.getElementById('resumen-total');
  
  if (this.value === 'retiro') {
    grupoDireccion.style.display = 'none';
    document.getElementById('input-direccion').required = false;
  } else {
    grupoDireccion.style.display = 'flex';
    document.getElementById('input-direccion').required = true;
  }
  
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

function aplicarRango() {
  filtrosActuales.precioMin = parseInt(minSlider.value);
  filtrosActuales.precioMax = parseInt(maxSlider.value);
  aplicarFiltros();
}

minSlider?.addEventListener('input', updateRange);
maxSlider?.addEventListener('input', updateRange);
if (minSlider && maxSlider) updateRange();

function preguntarStock(nombreProducto) {
  const asunto = encodeURIComponent(`Consulta sobre disponibilidad de "${nombreProducto}"`);
  const cuerpo = encodeURIComponent(`Hola Patofelting,\n\nMe gustaría saber cuándo estará disponible el producto: ${nombreProducto}\n\nSaludos cordiales,\n[Nombre del Cliente]`);
  window.location.href = `mailto:patofelting@gmail.com?subject=${asunto}&body=${cuerpo}`;
}

document.addEventListener('DOMContentLoaded', init);

function verDetalle(id) {
  const producto = productos.find(p => p.id === id);
  if (producto) {
    mostrarModalProducto(producto);
  } else {
    mostrarNotificacion("Producto no encontrado", "error");
  }
}

function agregarAlCarrito(id) {
  const producto = productos.find(p => p.id === id);
  if (!producto) {
    mostrarNotificacion("Producto no encontrado", "error");
    return;
  }

  const enCarrito = carrito.find(item => item.id === id);
  const cantidadAgregar = 1;

  const productRef = ref(db, `productos/${id}/stock`);
  runTransaction(productRef, (currentStock) => {
    if (currentStock === null) return currentStock;
    if (currentStock < cantidadAgregar) return;

    return currentStock - cantidadAgregar;
  }).then(() => {
    if (enCarrito) {
      enCarrito.cantidad += cantidadAgregar;
    } else {
      carrito.push({
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        cantidad: cantidadAgregar,
        imagen: producto.imagenes?.[0] || PLACEHOLDER_IMAGE
      });
    }
    guardarCarrito();
    renderizarProductos(); // ← AÑADIR ESTA LÍNEA
    renderizarCarrito();   // ← Y ESTA LÍNEA
    mostrarNotificacion("Producto agregado al carrito", "exito");
  }).catch((error) => {
    console.error("Error al agregar al carrito:", error);
    mostrarNotificacion("No se pudo agregar al carrito", "error");
  });
}

function actualizarCarritoUI() {
  const carritoBtn = document.querySelector('.carrito-icono span');
  if (carritoBtn) carritoBtn.textContent = `(${carrito.length})`;
}
window.verDetalle = verDetalle;
window.agregarAlCarrito = agregarAlCarrito;
