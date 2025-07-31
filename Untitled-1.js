// ========== CONFIGURACIÓN GLOBAL ==========
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const PLACEHOLDER_IMAGE = 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

// ========== INICIALIZAR FIREBASE ==========
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, onValue, update, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
  }, tipo === 'error' ? 4000 : 2200); // Mostrar errores más tiempo
}

// ========== PREVENCIÓN DE CONFLICTOS ==========
function mostrarConflictoStock(productoNombre, stockDisponible) {
  mostrarNotificacion(
    `⚠️ ${productoNombre}: Otro usuario puede haber reservado este stock. Disponible: ${stockDisponible}`,
    "error"
  );
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
    const disponibles = Math.max(0, prod.stock - item.cantidad);
    return `
      <li class="carrito-item" data-id="${item.id}">
        <img src="${prod.imagenes?.[0] || PLACEHOLDER_IMAGE}" class="carrito-item-img" alt="${prod.nombre}">
        <div class="carrito-item-info">
          <span class="carrito-item-nombre">${prod.nombre}</span>
          <span class="carrito-item-precio">$U ${prod.precio.toLocaleString('es-UY')}</span>
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
  const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
  elementos.totalCarrito.textContent = `Total: $U ${total.toLocaleString('es-UY')}`;
  document.querySelectorAll('.disminuir-cantidad').forEach(btn => {
    btn.onclick = () => modificarCantidadEnCarrito(parseInt(btn.dataset.id), -1);
  });
  document.querySelectorAll('.aumentar-cantidad').forEach(btn => {
    btn.onclick = () => modificarCantidadEnCarrito(parseInt(btn.dataset.id), 1);
  });
}
async function modificarCantidadEnCarrito(id, delta) {
  const item = carrito.find(i => i.id === id);
  if (!item) return;
  
  try {
    // Si se intenta aumentar, validar contra Firebase
    if (delta > 0) {
      const productRef = ref(db, `productos/${id}`);
      const snapshot = await get(productRef);
      
      if (snapshot.exists()) {
        const stockActual = parseInt(snapshot.val().stock) || 0;
        if (item.cantidad >= stockActual) {
          mostrarNotificacion("❌ No hay más stock disponible", "error");
          return;
        }
      }
    }
    
    // Aplicar cambio
    if (delta > 0) {
      item.cantidad++;
    } else if (delta < 0 && item.cantidad > 1) {
      item.cantidad--;
    }
    
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    
  } catch (error) {
    console.error('Error al modificar cantidad:', error);
    mostrarNotificacion("❌ Error al verificar stock", "error");
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
    // Sync carrito: Si stock bajó, ajusta cantidades automáticamente
    let cambiado = false;
    let productosEliminados = [];
    let productosReducidos = [];
    
    carrito.forEach(item => {
      const prod = productos.find(p => p.id === item.id);
      if (prod) {
        if (prod.stock === 0) {
          productosEliminados.push(prod.nombre);
          item.cantidad = 0;
          cambiado = true;
        } else if (item.cantidad > prod.stock) {
          productosReducidos.push(`${prod.nombre} (de ${item.cantidad} a ${prod.stock})`);
          item.cantidad = prod.stock;
          cambiado = true;
        }
      }
    });
    
    if (cambiado) {
      carrito = carrito.filter(i => i.cantidad > 0);
      guardarCarrito();
      
      // Notificaciones más específicas y claras
      if (productosEliminados.length > 0) {
        mostrarNotificacion(`🚫 Productos sin stock eliminados del carrito: ${productosEliminados.join(', ')}`, "error");
      }
      if (productosReducidos.length > 0) {
        mostrarNotificacion(`⚠️ Cantidades ajustadas: ${productosReducidos.join(', ')}`, "info");
      }
    }
    renderizarProductos();
    renderizarCarrito();
    actualizarCategorias();
  });
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
      agregarAlCarrito(parseInt(card.dataset.id), 1);
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
      <div class="card-acciones">
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
  try {
    // Validar siempre contra Firebase en tiempo real
    const productRef = ref(db, `productos/${id}`);
    const snapshot = await get(productRef);
    
    if (!snapshot.exists()) {
      mostrarNotificacion("❌ Producto no encontrado", "error");
      return;
    }
    
    const prodFirebase = snapshot.val();
    const stockActual = parseInt(prodFirebase.stock) || 0;
    
    // Verificar stock disponible considerando lo que ya está en el carrito
    const item = carrito.find(i => i.id === id);
    const cantidadEnCarrito = item ? item.cantidad : 0;
    const stockDisponible = stockActual - cantidadEnCarrito;
    
    // Verificar si el stock local difiere del stock de Firebase (posible conflicto)
    const prodLocal = productos.find(p => p.id === id);
    if (prodLocal && prodLocal.stock !== stockActual) {
      mostrarConflictoStock(prodFirebase.nombre, stockDisponible);
      // Actualizar stock local
      prodLocal.stock = stockActual;
      renderizarProductos();
    }
    
    if (stockDisponible < cantidad) {
      if (stockDisponible <= 0) {
        mostrarNotificacion("❌ No hay stock disponible", "error");
      } else {
        mostrarNotificacion(`❌ Solo hay ${stockDisponible} unidades disponibles`, "error");
      }
      return;
    }
    
    // Agregar al carrito
    if (item) {
      item.cantidad += cantidad;
    } else {
      carrito.push({ 
        ...prodFirebase,
        id: parseInt(id),
        cantidad,
        precio: parseFloat(prodFirebase.precio) || 0
      });
    }
    
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion("✅ Producto agregado al carrito", "exito");
    
  } catch (error) {
    console.error('Error al agregar al carrito:', error);
    mostrarNotificacion("❌ Error al verificar stock", "error");
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
          <p>$U ${prod.precio.toLocaleString('es-UY')}</p>
          <p class="${agotado ? 'agotado' : 'disponible'}">${agotado ? 'AGOTADO' : `Disponible: ${disp}`}</p>
          <div class="modal-descripcion">${prod.descripcion || ''}</div>
          <div class="modal-acciones">
            <input type="number" value="1" min="1" max="${disp}" class="cantidad-modal-input" ${agotado ? 'disabled' : ''}>
            <button class="boton-agregar-modal${agotado ? ' agotado' : ''}" ${agotado ? 'disabled' : ''}>Agregar al carrito</button>
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

// ========== STOCK UPDATE IN FIREBASE ==========
async function actualizarStockEnFirebase(compraItems) {
  try {
    const updates = {};
    
    for (const item of compraItems) {
      const productRef = ref(db, `productos/${item.id}`);
      const snapshot = await get(productRef);
      
      if (snapshot.exists()) {
        const stockActual = parseInt(snapshot.val().stock) || 0;
        const nuevoStock = Math.max(0, stockActual - item.cantidad);
        updates[`productos/${item.id}/stock`] = nuevoStock;
      }
    }
    
    if (Object.keys(updates).length > 0) {
      await update(ref(db), updates);
      mostrarNotificacion("✅ Stock actualizado correctamente", "exito");
    }
    
  } catch (error) {
    console.error('Error al actualizar stock:', error);
    mostrarNotificacion("⚠️ Error al actualizar stock", "error");
  }
}

// ========== FINALIZAR COMPRA ==========
function iniciarProcesoPedido() {
  if (carrito.length === 0) {
    mostrarNotificacion("❌ Tu carrito está vacío", "error");
    return;
  }
  
  // Mostrar modal de aviso previo
  const modalAviso = document.getElementById('aviso-pre-compra-modal');
  if (modalAviso) {
    modalAviso.hidden = false;
    modalAviso.style.display = 'flex';
  }
}

function mostrarModalDatosEnvio() {
  const modalEnvio = document.getElementById('modal-datos-envio');
  if (modalEnvio) {
    modalEnvio.hidden = false;
    modalEnvio.style.display = 'flex';
    
    // Actualizar resumen del pedido
    actualizarResumenPedido();
    
    // Cerrar carrito
    toggleCarrito(false);
  }
}

function actualizarResumenPedido() {
  const resumenProductos = document.getElementById('resumen-productos');
  const resumenTotal = document.getElementById('resumen-total');
  
  if (resumenProductos && resumenTotal) {
    resumenProductos.innerHTML = carrito.map(item => 
      `<div class="resumen-item">
        <span>${item.nombre} x${item.cantidad}</span>
        <span>$U ${(item.precio * item.cantidad).toLocaleString('es-UY')}</span>
      </div>`
    ).join('');
    
    const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    resumenTotal.textContent = `$U ${total.toLocaleString('es-UY')}`;
  }
}

async function procesarPedidoFinal(datosEnvio) {
  try {
    // Validar stock una vez más antes de finalizar
    for (const item of carrito) {
      const productRef = ref(db, `productos/${item.id}`);
      const snapshot = await get(productRef);
      
      if (!snapshot.exists()) {
        throw new Error(`Producto ${item.nombre} ya no está disponible`);
      }
      
      const stockActual = parseInt(snapshot.val().stock) || 0;
      if (stockActual < item.cantidad) {
        throw new Error(`Stock insuficiente para ${item.nombre}. Disponible: ${stockActual}`);
      }
    }
    
    // Actualizar stock en Firebase
    await actualizarStockEnFirebase([...carrito]);
    
    // Generar mensaje de WhatsApp
    const mensaje = generarMensajeWhatsApp(datosEnvio);
    const numeroWhatsApp = "59898765432"; // TODO: Reemplazar con número real de Patofelting
    const urlWhatsApp = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje)}`;
    
    // Abrir WhatsApp
    window.open(urlWhatsApp, '_blank');
    
    // Limpiar carrito
    carrito = [];
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    
    // Cerrar modal
    const modalEnvio = document.getElementById('modal-datos-envio');
    if (modalEnvio) {
      modalEnvio.hidden = true;
      modalEnvio.style.display = 'none';
    }
    
    mostrarNotificacion("🎉 ¡Pedido enviado! Te contactaremos pronto", "exito");
    
  } catch (error) {
    console.error('Error al procesar pedido:', error);
    mostrarNotificacion(`❌ ${error.message}`, "error");
    
    // Actualizar carrito por si cambió el stock
    escucharProductosFirebase();
  }
}

function generarMensajeWhatsApp(datos) {
  const total = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
  
  let mensaje = `🧶 *Nuevo Pedido - Patofelting*\n\n`;
  mensaje += `👤 *Cliente:* ${datos.nombre} ${datos.apellido}\n`;
  mensaje += `📞 *Teléfono:* ${datos.telefono}\n`;
  
  if (datos.envio !== 'retiro') {
    mensaje += `📍 *Dirección:* ${datos.direccion}\n`;
  }
  
  mensaje += `🚚 *Envío:* ${datos.envio === 'retiro' ? 'Retiro en local' : datos.envio === 'montevideo' ? 'Envío Montevideo' : 'Envío Interior'}\n\n`;
  
  mensaje += `🛍️ *Productos:*\n`;
  carrito.forEach(item => {
    mensaje += `• ${item.nombre} x${item.cantidad} - $U ${(item.precio * item.cantidad).toLocaleString('es-UY')}\n`;
  });
  
  mensaje += `\n💰 *Total: $U ${total.toLocaleString('es-UY')}*\n`;
  
  if (datos.notas) {
    mensaje += `\n📝 *Notas:* ${datos.notas}`;
  }
  
  return mensaje;
}
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
  
  // Evento para iniciar proceso de pedido
  elementos.btnFinalizarCompra?.addEventListener('click', iniciarProcesoPedido);
  
  // Eventos para modal de aviso pre-compra
  document.getElementById('btn-entendido-aviso')?.addEventListener('click', () => {
    const modalAviso = document.getElementById('aviso-pre-compra-modal');
    if (modalAviso) {
      modalAviso.hidden = true;
      modalAviso.style.display = 'none';
    }
    mostrarModalDatosEnvio();
  });
  
  document.getElementById('btn-cancelar-aviso')?.addEventListener('click', () => {
    const modalAviso = document.getElementById('aviso-pre-compra-modal');
    if (modalAviso) {
      modalAviso.hidden = true;
      modalAviso.style.display = 'none';
    }
  });
  
  // Eventos para modal de datos de envío
  document.getElementById('btn-cerrar-modal-envio')?.addEventListener('click', () => {
    const modalEnvio = document.getElementById('modal-datos-envio');
    if (modalEnvio) {
      modalEnvio.hidden = true;
      modalEnvio.style.display = 'none';
    }
  });
  
  // Evento para procesar pedido final
  document.getElementById('form-envio')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const datosEnvio = {
      nombre: document.getElementById('input-nombre').value.trim(),
      apellido: document.getElementById('input-apellido').value.trim(),
      telefono: document.getElementById('input-telefono').value.trim(),
      direccion: document.getElementById('input-direccion').value.trim(),
      envio: document.getElementById('select-envio').value,
      notas: document.getElementById('input-notas').value.trim()
    };
    
    // Validar campos requeridos
    if (!datosEnvio.nombre || !datosEnvio.apellido || !datosEnvio.telefono || !datosEnvio.envio) {
      mostrarNotificacion("❌ Por favor completa todos los campos requeridos", "error");
      return;
    }
    
    if (datosEnvio.envio !== 'retiro' && !datosEnvio.direccion) {
      mostrarNotificacion("❌ La dirección es requerida para envíos", "error");
      return;
    }
    
    await procesarPedidoFinal(datosEnvio);
  });
  
  // Mostrar/ocultar campo dirección según método de envío
  document.getElementById('select-envio')?.addEventListener('change', (e) => {
    const grupoDireccion = document.getElementById('grupo-direccion');
    const inputDireccion = document.getElementById('input-direccion');
    
    if (e.target.value === 'retiro') {
      grupoDireccion.style.display = 'none';
      inputDireccion.required = false;
    } else {
      grupoDireccion.style.display = 'block';
      inputDireccion.required = true;
    }
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
  escucharProductosFirebase();
  cargarCarrito();
  renderizarCarrito();
  inicializarEventos();
});
