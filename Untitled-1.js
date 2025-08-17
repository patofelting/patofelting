// ===============================
// CONFIGURACIÓN GLOBAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

// Import Firebase modules (v10+ modular SDK)
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, runTransaction, onValue, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const db = window.firebaseDatabase;
const auth = getAuth(window.firebaseApp);

// ===============================
// ESTADO GLOBAL
// ===============================
let productos = [];
let carrito = [];
let paginaActual = 1;

let filtrosActuales = {
  precioMin: 0,
  precioMax: 3000,
  categoria: 'todos',
  busqueda: ''
};

// ===============================
// UTILIDADES GENERALES
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

function getElement(id) {
  return document.getElementById(id);
}

// Referencias al DOM agrupadas
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
  avisoPreCompraModal: getElement('aviso-pre-compra-modal'),
  btnEntendidoAviso: getElement('btn-entendido-aviso'),
  btnCancelarAviso: getElement('btn-cancelar-aviso'),
  productLoader: getElement('product-loader'),
  hamburguesa: document.querySelector('.hamburguesa'),
  menu: getElement('menu'),
  aplicarRangoBtn: document.querySelector('.aplicar-rango-btn')
};

// ===============================
// MANEJO DE CARRITO
// ===============================
function guardarCarrito() {
  try {
    localStorage.setItem(LS_CARRITO_KEY, JSON.stringify(carrito));
    actualizarContadorCarrito();
  } catch (error) {
    console.error('Error al guardar carrito en localStorage:', error);
    mostrarNotificacion('Error al guardar el carrito', 'error');
  }
}

function cargarCarrito() {
  try {
    const stored = localStorage.getItem(LS_CARRITO_KEY);
    carrito = stored ? JSON.parse(stored) : [];
    actualizarContadorCarrito();
  } catch (error) {
    console.error('Error al cargar carrito de localStorage:', error);
    carrito = [];
    mostrarNotificacion('Error al cargar el carrito', 'error');
  }
}

async function vaciarCarrito() {
  if (carrito.length === 0) {
    mostrarNotificacion('El carrito ya está vacío', 'info');
    return;
  }

  try {
    await Promise.all(
      carrito.map(async (item) => {
        const productRef = ref(db, `productos/${item.id}/stock`);
        await runTransaction(productRef, (currentStock) => (currentStock || 0) + item.cantidad);
      })
    );

    carrito = [];
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion('Carrito vaciado y stock restaurado', 'exito');
  } catch (error) {
    console.error('Error al vaciar carrito:', error);
    mostrarNotificacion('Error al vaciar el carrito', 'error');
  }
}

function actualizarContadorCarrito() {
  const total = carrito.reduce((sum, i) => sum + i.cantidad, 0);
  if (elementos.contadorCarrito) {
    elementos.contadorCarrito.textContent = total;
    elementos.contadorCarrito.classList.toggle('visible', total > 0);
  }
}

function toggleCarrito(forceState) {
  if (!elementos.carritoPanel || !elementos.carritoOverlay) return;
  const isOpen = typeof forceState === 'boolean' ? forceState : !elementos.carritoPanel.classList.contains('active');

  elementos.carritoPanel.classList.toggle('active', isOpen);
  elementos.carritoOverlay.classList.toggle('active', isOpen);
  document.body.classList.toggle('no-scroll', isOpen);

  if (isOpen) renderizarCarrito();
}

// ===============================
// MANEJO DE PRODUCTOS DESDE FIREBASE
// ===============================
async function cargarProductosDesdeFirebase() {
  const productosRef = ref(db, 'productos');

  try {
    if (elementos.productLoader) elementos.productLoader.style.display = 'flex';

    const snapshot = await get(productosRef);
    if (!snapshot.exists()) {
      elementos.galeriaProductos.innerHTML = '<p class="sin-productos">No hay productos disponibles.</p>';
      return;
    }

    procesarDatosProductos(snapshot.val());

    // Listener en tiempo real para actualizaciones (rendimiento: solo se activa en cambios)
    onValue(productosRef, (snap) => {
      if (!snap.exists()) {
        productos = [];
      } else {
        procesarDatosProductos(snap.val());
      }
      renderizarProductos();
      actualizarCategorias();
      actualizarUI();
    }, (error) => {
      console.error('Error en listener de productos:', error);
      mostrarNotificacion('Error al recibir actualizaciones de productos', 'error');
    });
  } catch (error) {
    console.error('Error al cargar productos:', error);
    mostrarNotificacion('Error al cargar productos', 'error');
    elementos.galeriaProductos.innerHTML = '<p class="error-carga">No se pudieron cargar los productos.</p>';
  } finally {
    if (elementos.productLoader) elementos.productLoader.style.display = 'none';
  }
}

function procesarDatosProductos(data) {
  productos = Object.entries(data || {}).map(([key, p]) => {
    if (typeof p !== 'object' || !p) return null;
    return {
      id: parseInt(p.id || key),
      nombre: (p.nombre || 'Sin nombre').trim(),
      descripcion: (p.descripcion || '').trim(),
      precio: parseFloat(p.precio) || 0,
      stock: Math.max(0, parseInt(p.stock, 10) || 0),
      imagenes: Array.isArray(p.imagenes) ? p.imagenes.filter(img => typeof img === 'string' && img.trim()) : [PLACEHOLDER_IMAGE],
      categoria: (p.categoria || 'otros').toLowerCase().trim(),
      estado: (p.estado || '').trim(),
      adicionales: (p.adicionales || '').trim(),
      alto: parseFloat(p.alto) || null,
      ancho: parseFloat(p.ancho) || null,
      profundidad: parseFloat(p.profundidad) || null,
    };
  }).filter(Boolean); // Filtra productos inválidos
}

// ===============================
// RENDERIZADO DE CARRITO
// ===============================
function renderizarCarrito() {
  if (!elementos.listaCarrito || !elementos.totalCarrito) return;

  elementos.listaCarrito.innerHTML = carrito.length === 0
    ? '<p class="carrito-vacio">Tu carrito está vacío</p>'
    : carrito.map(item => {
        const producto = productos.find(p => p.id === item.id) || { stock: 0 };
        const disponibles = Math.max(0, producto.stock - item.cantidad);
        return `
          <li class="carrito-item" data-id="${item.id}">
            <img src="${item.imagen}" class="carrito-item-img" alt="${item.nombre}" loading="lazy">
            <div class="carrito-item-info">
              <span class="carrito-item-nombre">${item.nombre}</span>
              <span class="carrito-item-precio">$U ${item.precio.toLocaleString('es-UY')} c/u</span>
              <div class="carrito-item-controls">
                <button class="disminuir-cantidad" data-id="${item.id}" ${item.cantidad <= 1 ? 'disabled' : ''}>-</button>
                <span class="carrito-item-cantidad">${item.cantidad}</span>
                <button class="aumentar-cantidad" data-id="${item.id}" ${disponibles <= 0 ? 'disabled' : ''}>+</button>
              </div>
              <span class="carrito-item-subtotal">Subtotal: $U ${(item.precio * item.cantidad).toLocaleString('es-UY')}</span>
            </div>
          </li>
        `;
      }).join('');

  const total = carrito.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  elementos.totalCarrito.textContent = `Total: $U ${total.toLocaleString('es-UY')}`;

  // Event listeners para controles (agrupados para evitar duplicados)
  elementos.listaCarrito.querySelectorAll('.disminuir-cantidad').forEach(btn => {
    btn.onclick = async (e) => {
      const id = parseInt(e.target.dataset.id);
      const item = carrito.find(i => i.id === id);
      if (item && item.cantidad > 1) {
        item.cantidad--;
        const productRef = ref(db, `productos/${id}/stock`);
        try {
          await runTransaction(productRef, (stock) => (stock || 0) + 1);
          guardarCarrito();
          renderizarCarrito();
          renderizarProductos();
          mostrarNotificacion(`Reducida cantidad de "${item.nombre}"`, 'info');
        } catch (error) {
          console.error('Error al disminuir cantidad:', error);
          mostrarNotificacion('Error al actualizar cantidad', 'error');
        }
      }
    };
  });

  elementos.listaCarrito.querySelectorAll('.aumentar-cantidad').forEach(btn => {
    btn.onclick = (e) => agregarAlCarrito(parseInt(e.target.dataset.id), 1);
  });
}

// ===============================
// RENDERIZADO DE PRODUCTOS Y PAGINACIÓN
// ===============================
function crearCardProducto(p) {
  const enCarrito = carrito.find(i => i.id === p.id) || { cantidad: 0 };
  const disp = Math.max(0, p.stock - enCarrito.cantidad);
  const agot = disp <= 0;
  const imagen = p.imagenes[0] || PLACEHOLDER_IMAGE;

  return `
    <div class="producto-card ${agot ? 'agotado' : ''}" data-id="${p.id}">
      <img src="${imagen}" alt="${p.nombre}" class="producto-img" loading="lazy">
      <h3 class="producto-nombre">${p.nombre}</h3>
      <p class="producto-precio">$U ${p.precio.toLocaleString('es-UY')}</p>
      <div class="card-acciones">
        <button class="boton-agregar${agot ? ' agotado' : ''}" data-id="${p.id}" ${agot ? 'disabled' : ''}>
          ${agot ? '<i class="fas fa-times-circle"></i> Agotado' : '<i class="fas fa-cart-plus"></i> Agregar'}
        </button>
        ${agot ? `<button class="boton-aviso-stock" data-nombre="${p.nombre.replace(/'/g, "\\'")}">📩 Avisame cuando haya stock</button>` : ''}
      </div>
      <button class="boton-detalles" data-id="${p.id}">🔍 Ver Detalle</button>
    </div>
  `;
}

function filtrarProductos() {
  return productos.filter(p => {
    const { precioMin, precioMax, categoria, busqueda } = filtrosActuales;
    const b = (busqueda || '').toLowerCase();
    return (
      p.precio >= precioMin &&
      p.precio <= precioMax &&
      (categoria === 'todos' || p.categoria === categoria) &&
      (!b || p.nombre.toLowerCase().includes(b) || p.descripcion.toLowerCase().includes(b))
    );
  });
}

function renderizarProductos() {
  const filtrados = filtrarProductos();
  const inicio = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
  const paginados = filtrados.slice(inicio, inicio + PRODUCTOS_POR_PAGINA);

  elementos.galeriaProductos.innerHTML = paginados.length === 0
    ? '<p class="sin-productos">No se encontraron productos.</p>'
    : paginados.map(crearCardProducto).join('');

  renderizarPaginacion(filtrados.length);
}

function renderizarPaginacion(total) {
  const pages = Math.ceil(total / PRODUCTOS_POR_PAGINA);
  if (!elementos.paginacion || pages <= 1) return (elementos.paginacion.innerHTML = '');

  elementos.paginacion.innerHTML = Array.from({ length: pages }, (_, i) => i + 1).map(page => `
    <button class="${page === paginaActual ? 'active' : ''}" onclick="cambiarPagina(${page})">${page}</button>
  `).join('');
}

window.cambiarPagina = function (page) {
  paginaActual = page;
  renderizarProductos();
  const targetTop = elementos.galeriaProductos.offsetTop - 100;
  if (window.scrollY + 10 < targetTop) window.scrollTo({ top: targetTop, behavior: 'smooth' });
};

// ===============================
// MODAL DE PRODUCTO
// ===============================
function ensureProductModal() {
  if (!getElement('producto-modal')) {
    const modal = document.createElement('div');
    modal.id = 'producto-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-backdrop" data-close="1"></div>
      <div class="modal-content" id="modal-contenido"></div>
    `;
    document.body.appendChild(modal);
  }
  elementos.productoModal = getElement('producto-modal');
  elementos.modalContenido = getElement('modal-contenido');

  elementos.productoModal.addEventListener('click', (e) => {
    if (e.target.dataset.close) cerrarModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && elementos.productoModal.classList.contains('active')) cerrarModal();
  });
}

function mostrarModalProducto(producto) {
  ensureProductModal(); // Asegura que el modal existe antes de mostrar
  const contenido = elementos.modalContenido;
  if (!elementos.productoModal || !contenido) return;

  const enCarrito = carrito.find(item => item.id === producto.id) || { cantidad: 0 };
  const disponibles = Math.max(0, producto.stock - enCarrito.cantidad);
  const agotado = disponibles <= 0;
  let currentIndex = 0;

  function renderModalContent() {
    contenido.innerHTML = `
      <button class="cerrar-modal" onclick="cerrarModal()">&times;</button>
      <div class="modal-flex">
        <div class="modal-carrusel">
          <img id="modal-imagen" src="${producto.imagenes[currentIndex] || PLACEHOLDER_IMAGE}" alt="${producto.nombre}">
          ${producto.imagenes.length > 1 ? `
            <div class="modal-controls">
              <button class="modal-prev" ${currentIndex === 0 ? 'disabled' : ''}>
                <svg width="26" height="26" viewBox="0 0 26 26"><polyline points="17 22 9 13 17 4" fill="none" stroke="#2e7d32" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
              <button class="modal-next" ${currentIndex === producto.imagenes.length - 1 ? 'disabled' : ''}>
                <svg width="26" height="26" viewBox="0 0 26 26"><polyline points="9 4 17 13 9 22" fill="none" stroke="#2e7d32" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </div>` : ''}
          <div class="modal-thumbnails">
            ${producto.imagenes.map((img, i) => `<img src="${img}" class="thumbnail ${i === currentIndex ? 'active' : ''}" data-index="${i}" alt="Miniatura ${i + 1}">`).join('')}
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
            ${(producto.alto || producto.ancho || producto.profundidad) ? `<small><b>Medidas:</b> ${[producto.alto, producto.ancho, producto.profundidad].filter(Boolean).join(' x ')} cm</small>` : ''}
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

    contenido.querySelector('.modal-prev')?.addEventListener('click', () => {
      if (currentIndex > 0) { currentIndex--; renderModalContent(); }
    });
    contenido.querySelector('.modal-next')?.addEventListener('click', () => {
      if (currentIndex < producto.imagenes.length - 1) { currentIndex++; renderModalContent(); }
    });
    contenido.querySelectorAll('.thumbnail').forEach(th => th.addEventListener('click', () => {
      currentIndex = parseInt(th.dataset.index);
      renderModalContent();
    }));
    contenido.querySelector('.boton-agregar-modal')?.addEventListener('click', (e) => {
      const id = parseInt(e.target.dataset.id);
      const cantidad = parseInt(contenido.querySelector('.cantidad-modal-input').value);
      agregarAlCarrito(id, cantidad, e.target);
    });
  }

  renderModalContent();
  elementos.productoModal.classList.add('active');
  document.body.classList.add('no-scroll');
}

function cerrarModal() {
  if (elementos.productoModal) {
    elementos.productoModal.classList.remove('active');
    document.body.classList.remove('no-scroll');
  }
}
window.cerrarModal = cerrarModal;

// ===============================
// LÓGICA DE AGREGAR AL CARRITO
// ===============================
async function agregarAlCarrito(id, cantidad = 1, boton = null) {
  if (isNaN(id) || id <= 0) return mostrarNotificacion('ID de producto inválido', 'error');

  const producto = productos.find(p => p.id === id);
  if (!producto) return mostrarNotificacion('Producto no encontrado', 'error');

  const cantidadAgregar = Math.max(1, parseInt(cantidad));
  if (isNaN(cantidadAgregar)) return mostrarNotificacion('Cantidad inválida', 'error');

  const enCarrito = carrito.find(item => item.id === id);
  const cantidadEnCarrito = enCarrito ? enCarrito.cantidad : 0;
  if (producto.stock - cantidadEnCarrito < cantidadAgregar) return mostrarNotificacion('Stock insuficiente', 'error');

  let textoOriginal = boton?.innerHTML;
  if (boton) {
    boton.disabled = true;
    boton.innerHTML = 'Agregando <span class="spinner"></span>';
  }

  const productRef = ref(db, `productos/${id}/stock`);
  try {
    const { committed } = await runTransaction(productRef, (stock) => {
      stock = stock || 0;
      if (stock < cantidadAgregar) return undefined;
      return stock - cantidadAgregar;
    });

    if (!committed) throw new Error('Stock insuficiente o actualizado por otro usuario');

    if (enCarrito) {
      enCarrito.cantidad += cantidadAgregar;
    } else {
      carrito.push({
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        cantidad: cantidadAgregar,
        imagen: producto.imagenes[0] || PLACEHOLDER_IMAGE
      });
    }

    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion('Producto agregado al carrito', 'exito');
  } catch (error) {
    console.error('Error al agregar al carrito:', error);
    mostrarNotificacion('Error al agregar al carrito', 'error');
  } finally {
    if (boton) {
      boton.disabled = false;
      boton.innerHTML = textoOriginal;
    }
  }
}

// ===============================
// UI Y FILTROS
// ===============================
function actualizarCategorias() {
  if (!elementos.selectCategoria) return;
  const cats = ['todos', ...new Set(productos.map(p => p.categoria).sort())];
  elementos.selectCategoria.innerHTML = cats.map(cat => `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`).join('');
  elementos.selectCategoria.value = filtrosActuales.categoria;
}

function actualizarUI() {
  renderizarCarrito();
  actualizarContadorCarrito();
}

function aplicarFiltros() {
  paginaActual = 1;
  renderizarProductos();
}

function resetearFiltros() {
  filtrosActuales = { precioMin: 0, precioMax: 3000, categoria: 'todos', busqueda: '' };
  if (elementos.inputBusqueda) elementos.inputBusqueda.value = '';
  if (elementos.selectCategoria) elementos.selectCategoria.value = 'todos';
  if (elementos.precioMinInput) elementos.precioMinInput.value = '0';
  if (elementos.precioMaxInput) elementos.precioMaxInput.value = '3000';
  updateRange();
  aplicarFiltros();
}

// ===============================
// INICIALIZACIONES ESPECÍFICAS
// ===============================
function inicializarFAQ() {
  document.querySelectorAll('.faq-toggle').forEach(toggle => {
    toggle.onclick = () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', !expanded);
      toggle.nextElementSibling.hidden = expanded;
    };
  });
}

function inicializarMenuHamburguesa() {
  const hamburguesa = elementos.hamburguesa;
  const menu = elementos.menu;
  if (!hamburguesa || !menu) return;

  hamburguesa.onclick = () => {
    const expanded = menu.classList.toggle('active');
    hamburguesa.setAttribute('aria-expanded', expanded);
    document.body.classList.toggle('no-scroll', expanded);
  };

  menu.querySelectorAll('a').forEach(link => link.onclick = () => {
    menu.classList.remove('active');
    hamburguesa.setAttribute('aria-expanded', false);
    document.body.classList.remove('no-scroll');
  });
}

function setupContactForm() {
  const form = getElement('formContacto');
  if (!form || !window.emailjs) return console.warn('EmailJS no cargado o formulario no encontrado.');

  emailjs.init("YOUR_EMAILJS_USER_ID");
  form.onsubmit = (e) => {
    e.preventDefault();
    const nombre = getElement('nombre').value;
    const email = getElement('email').value;
    const mensaje = getElement('mensaje').value;

    emailjs.send('service_89by24g', 'template_8mn7hdp', { from_name: nombre, from_email: email, message: mensaje })
      .then(() => {
        getElement('successMessage').classList.remove('hidden');
        form.reset();
        setTimeout(() => getElement('successMessage').classList.add('hidden'), 3000);
      }, (error) => {
        console.error('Error al enviar email:', error);
        const errorMsg = getElement('errorMessage');
        errorMsg.textContent = 'Error al enviar el mensaje. Intenta de nuevo.';
        errorMsg.classList.remove('hidden');
        setTimeout(() => errorMsg.classList.add('hidden'), 3000);
      });
  };
}

// ===============================
// EVENTOS Y DELEGACIÓN
// ===============================
function initEventos() {
  elementos.carritoBtnMain?.addEventListener('click', () => toggleCarrito(true));
  elementos.carritoOverlay?.addEventListener('click', () => toggleCarrito(false));
  elementos.btnCerrarCarrito?.addEventListener('click', () => toggleCarrito(false));

  getElement('select-envio')?.addEventListener('change', actualizarResumenPedido);
  elementos.btnVaciarCarrito?.addEventListener('click', vaciarCarrito);
  elementos.btnFinalizarCompra?.addEventListener('click', () => {
    if (carrito.length === 0) return mostrarNotificacion('El carrito está vacío', 'error');
    elementos.avisoPreCompraModal.style.display = 'flex';
    elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'false');
  });

  elementos.btnEntendidoAviso?.addEventListener('click', () => {
    elementos.avisoPreCompraModal.style.display = 'none';
    elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'true');
    const modalEnvio = getElement('modal-datos-envio');
    if (modalEnvio) {
      modalEnvio.style.display = 'flex';
      modalEnvio.classList.add('visible');
      actualizarResumenPedido();
    }
  });

  elementos.btnCancelarAviso?.addEventListener('click', () => {
    elementos.avisoPreCompraModal.style.display = 'none';
    elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'true');
  });

  elementos.inputBusqueda?.addEventListener('input', (e) => {
    filtrosActuales.busqueda = e.target.value.toLowerCase().trim(); // Trim para seguridad
    aplicarFiltros();
  });

  elementos.selectCategoria?.addEventListener('change', (e) => {
    filtrosActuales.categoria = e.target.value.trim();
    aplicarFiltros();
  });

  elementos.precioMinInput?.addEventListener('input', () => updateRange());
  elementos.precioMaxInput?.addEventListener('input', () => updateRange());

  elementos.aplicarRangoBtn?.addEventListener('click', () => {
    filtrosActuales.precioMin = parseInt(elementos.precioMinInput.value) || 0;
    filtrosActuales.precioMax = parseInt(elementos.precioMaxInput.value) || 3000;
    aplicarFiltros();
  });

  // Delegación de eventos en galería
  const galeria = elementos.galeriaProductos;
  if (galeria) {
    galeria.addEventListener('click', (e) => {
      const target = e.target.closest('.boton-detalles, .boton-agregar, .boton-aviso-stock');
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      const card = target.closest('.producto-card');
      const id = parseInt(card.dataset.id);
      const producto = productos.find(p => p.id === id);
      if (!producto) return;

      if (target.classList.contains('boton-detalles')) {
        mostrarModalProducto(producto);
      } else if (target.classList.contains('boton-agregar')) {
        agregarAlCarrito(id, 1, target);
      } else if (target.classList.contains('boton-aviso-stock')) {
        preguntarStock(producto.nombre);
      }
    });
  }
}

// ===============================
// RESUMEN Y ENVÍO
// ===============================
function actualizarResumenPedido() {
  const resumenProductos = getElement('resumen-productos');
  const resumenTotal = getElement('resumen-total');
  if (!resumenProductos || !resumenTotal) return;

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

  const envioSelect = getElement('select-envio');
  const metodo = envioSelect?.value || 'retiro';
  let costoEnvio = metodo === 'montevideo' ? 150 : metodo === 'interior' ? 300 : 0;

  html += `
    <div class="resumen-item resumen-subtotal">
      <span>Subtotal:</span>
      <span>$U ${subtotal.toLocaleString('es-UY')}</span>
    </div>
    ${metodo !== 'retiro' ? `
      <div class="resumen-item resumen-envio">
        <span>Envío (${metodo === 'montevideo' ? 'Montevideo' : 'Interior'}):</span>
        <span>$U ${costoEnvio.toLocaleString('es-UY')}</span>
      </div>` : ''}
  `;

  resumenProductos.innerHTML = html;
  const total = subtotal + costoEnvio;
  resumenTotal.textContent = `$U ${total.toLocaleString('es-UY')}`;

  const grupoDireccion = getElement('grupo-direccion');
  const inputDireccion = getElement('input-direccion');
  if (grupoDireccion && inputDireccion) {
    grupoDireccion.style.display = metodo === 'retiro' ? 'none' : 'flex';
    inputDireccion.required = metodo !== 'retiro';
  }
}

getElement('btn-cerrar-modal-envio')?.addEventListener('click', () => {
  const modal = getElement('modal-datos-envio');
  modal.classList.remove('visible');
  setTimeout(() => modal.style.display = 'none', 300);
});

getElement('form-envio')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const nombre = getElement('input-nombre').value.trim();
  const apellido = getElement('input-apellido').value.trim();
  const telefono = getElement('input-telefono').value.trim();
  const envio = getElement('select-envio').value;
  const direccion = envio !== 'retiro' ? getElement('input-direccion').value.trim() : '';
  const notas = getElement('input-notas').value.trim();

  if (!nombre || !apellido || !telefono || (envio !== 'retiro' && !direccion)) {
    return mostrarNotificacion('Complete todos los campos obligatorios', 'error');
  }

  // Validar stock antes de proceder (seguridad)
  for (const item of carrito) {
    const prod = productos.find(p => p.id === item.id);
    if (!prod || prod.stock < item.cantidad) {
      return mostrarNotificacion(`Stock insuficiente para "${item.nombre}"`, 'error');
    }
  }

  let mensaje = `¡Hola Patofelting! Quiero hacer un pedido:\n\n*📋 Detalles del pedido:*\n`;
  carrito.forEach(item => mensaje += `➤ ${item.nombre} x${item.cantidad} - $U ${(item.precio * item.cantidad).toLocaleString('es-UY')}\n`);

  const subtotal = carrito.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
  const costoEnvio = envio === 'montevideo' ? 150 : envio === 'interior' ? 300 : 0;
  const total = subtotal + costoEnvio;

  mensaje += `\n*💰 Total:*\nSubtotal: $U ${subtotal.toLocaleString('es-UY')}\nEnvío: $U ${costoEnvio.toLocaleString('es-UY')}\n*TOTAL A PAGAR: $U ${total.toLocaleString('es-UY')}*\n\n`;
  mensaje += `*👤 Datos del cliente:*\nNombre: ${nombre} ${apellido}\nTeléfono: ${telefono}\nMétodo de envío: ${envio === 'montevideo' ? 'Envío Montevideo ($150)' : envio === 'interior' ? 'Envío Interior ($300)' : 'Retiro en local (Gratis)'}\n`;
  if (envio !== 'retiro') mensaje += `Dirección: ${direccion}\n`;
  if (notas) mensaje += `\n*📝 Notas adicionales:*\n${notas}`;

  const numeroWhatsApp = '59893566283';
  const url = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank') || (window.location.href = url.replace('wa.me', 'api.whatsapp.com/send?phone='));

  const modal = getElement('modal-datos-envio');
  modal.classList.remove('visible');
  setTimeout(() => {
    modal.style.display = 'none';
    carrito = [];
    guardarCarrito();
    actualizarUI();
    mostrarNotificacion('Pedido listo para enviar por WhatsApp', 'exito');
    getElement('form-envio').reset();
  }, 300);
});

// ===============================
// SLIDERS DE PRECIO
// ===============================
function updateRange() {
  const minSlider = elementos.precioMinInput;
  const maxSlider = elementos.precioMaxInput;
  const minPrice = getElement('min-price');
  const maxPrice = getElement('max-price');
  const range = document.querySelector('.range');
  if (!minSlider || !maxSlider || !minPrice || !maxPrice || !range) return;

  let minVal = parseInt(minSlider.value);
  let maxVal = parseInt(maxSlider.value);
  if (minVal > maxVal) [minVal, maxVal] = [maxVal, minVal];

  minSlider.value = minVal;
  maxSlider.value = maxVal;

  const sliderMax = parseInt(minSlider.max);
  range.style.left = (minVal / sliderMax * 100) + '%';
  range.style.width = ((maxVal - minVal) / sliderMax * 100) + '%';

  minPrice.textContent = `$U${minVal}`;
  maxPrice.textContent = `$U${maxVal}`;

  filtrosActuales.precioMin = minVal;
  filtrosActuales.precioMax = maxVal;
  aplicarFiltros();
}

// ===============================
// OTRAS FUNCIONES
// ===============================
function preguntarStock(nombre) {
  const asunto = encodeURIComponent(`Consulta sobre disponibilidad de "${nombre}"`);
  const cuerpo = encodeURIComponent(`Hola Patofelting,\n\nMe gustaría saber cuándo estará disponible el producto: ${nombre}\n\nSaludos,\n[Tu nombre]`);
  window.location.href = `mailto:patofelting@gmail.com?subject=${asunto}&body=${cuerpo}`;
}

// ===============================
// INICIALIZACIÓN
// ===============================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await signInAnonymously(auth);
    console.log('✅ Signed in anonymously to Firebase.');
    cargarProductosDesdeFirebase();
  } catch (error) {
    console.error('❌ Error signing in:', error);
    let msg = 'Error de autenticación con Firebase.';
    if (error.code === 'auth/configuration-not-found') msg = 'Autenticación anónima no habilitada.';
    else if (error.code === 'auth/network-request-failed') msg = 'Error de red.';
    mostrarNotificacion(msg, 'error');
  }

  cargarCarrito();
  ensureProductModal();
  inicializarMenuHamburguesa();
  inicializarFAQ();
  setupContactForm();
  initEventos();
  updateRange();
});

window.agregarAlCarrito = agregarAlCarrito;
window.preguntarStock = preguntarStock;
