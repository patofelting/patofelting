// ========== CONFIGURACIÓN GLOBAL ==========
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const PLACEHOLDER_IMAGE = 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

// ========== INICIALIZAR FIREBASE ==========
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase, ref, onValue, update, runTransaction } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
function modificarCantidadEnCarrito(id, delta) {
  const item = carrito.find(i => i.id === id);
  if (!item) return;
  const prod = productos.find(p => p.id === id);
  if (delta > 0 && item.cantidad < prod.stock) {
    item.cantidad++;
  } else if (delta < 0 && item.cantidad > 1) {
    item.cantidad--;
  }
  if (item.cantidad > prod.stock) {
    item.cantidad = prod.stock;
    mostrarNotificacion('⚠️ Stock ajustado por actualización en otro dispositivo', 'info');
  }
  guardarCarrito();
  renderizarCarrito();
  renderizarProductos();
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
      mostrarNotificacion("⚠️ ¡Stock actualizado por cambios en otro dispositivo!", "info");
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
        ${
          agot
            ? `<button class="boton-stock-naranja" data-producto="${encodeURIComponent(p.nombre)}" data-productoid="${p.id}" style="background:#FFA500;color:#fff;">🟠 Avisame cuando haya stock</button>`
            : `<button class="boton-agregar">Agregar</button>`
        }
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
function agregarAlCarrito(id, cantidad = 1) {
  const prod = productos.find(p => p.id === id);
  if (!prod || prod.stock < cantidad) {
    mostrarNotificacion("❌ Stock insuficiente", "error");
    return;
  }
  const item = carrito.find(i => i.id === id);
  if (item) {
    if (item.cantidad + cantidad > prod.stock) {
      mostrarNotificacion("❌ Stock insuficiente", "error");
      return;
    }
    item.cantidad += cantidad;
  } else {
    carrito.push({ ...prod, cantidad });
  }
  guardarCarrito();
  renderizarCarrito();
  renderizarProductos();
  mostrarNotificacion("✅ Producto agregado al carrito", "exito");
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

// ========== MODALES DE PRECOMPRA Y ENVÍO ==========
const avisoPreCompraModal = document.getElementById('aviso-pre-compra-modal');
const btnEntendidoAviso = document.getElementById('btn-entendido-aviso');
const btnCancelarAviso = document.getElementById('btn-cancelar-aviso');
const modalDatosEnvio = document.getElementById('modal-datos-envio');
const btnCerrarModalEnvio = document.getElementById('btn-cerrar-modal-envio');
const formEnvio = document.getElementById('form-envio');

// ---------- RESUMEN DEL PEDIDO EN EL MODAL ----------
function renderizarResumenPedidoEnvio() {
  const resumenProductos = document.getElementById('resumen-productos');
  const resumenTotal = document.getElementById('resumen-total');
  const selectEnvio = document.getElementById('select-envio');
  if (!resumenProductos || !resumenTotal) return;

  let html = '';
  let subtotal = 0;
  carrito.forEach(item => {
    const subtotalItem = item.precio * item.cantidad;
    subtotal += subtotalItem;
    html += `<div>${item.nombre} x${item.cantidad} - $U ${subtotalItem.toLocaleString('es-UY')}</div>`;
  });

  let envio = selectEnvio?.value || '';
  let costoEnvio = 0;
  let textoEnvio = 'Retiro en local (Gratis)';
  if (envio === 'montevideo') {
    costoEnvio = 150;
    textoEnvio = 'Envío Montevideo ($150)';
  } else if (envio === 'interior') {
    costoEnvio = 300;
    textoEnvio = 'Envío Interior ($300)';
  }

  html += `<div><strong>Envío:</strong> $U ${costoEnvio.toLocaleString('es-UY')} (${textoEnvio})</div>`;
  const total = subtotal + costoEnvio;
  resumenProductos.innerHTML = html;
  resumenTotal.textContent = `$U ${total.toLocaleString('es-UY')}`;
}

// Al abrir el modal de datos de envío, renderiza el resumen
btnEntendidoAviso?.addEventListener('click', () => {
  avisoPreCompraModal?.setAttribute('hidden', true);
  avisoPreCompraModal?.classList.remove('visible');
  modalDatosEnvio?.removeAttribute('hidden');
  modalDatosEnvio?.classList.add('visible');
  renderizarResumenPedidoEnvio();
});
// Si cambia el método de envío, actualiza el resumen
document.getElementById('select-envio')?.addEventListener('change', () => {
  renderizarResumenPedidoEnvio();
});

// Resto del flujo de modales
elementos.btnFinalizarCompra?.addEventListener('click', (e) => {
  e.preventDefault();
  avisoPreCompraModal?.removeAttribute('hidden');
  avisoPreCompraModal?.classList.add('visible');
});
btnCancelarAviso?.addEventListener('click', () => {
  avisoPreCompraModal?.setAttribute('hidden', true);
  avisoPreCompraModal?.classList.remove('visible');
});
btnCerrarModalEnvio?.addEventListener('click', () => {
  modalDatosEnvio?.classList.remove('visible');
  setTimeout(() => { modalDatosEnvio?.setAttribute('hidden', true); }, 300);
});

// ========== ENVIAR PEDIDO POR WHATSAPP Y ACTUALIZAR STOCK EN TIEMPO REAL ==========
formEnvio?.addEventListener('submit', async function(e) {
  e.preventDefault();

  const nombre = document.getElementById('input-nombre').value.trim();
  const apellido = document.getElementById('input-apellido').value.trim();
  const telefono = document.getElementById('input-telefono').value.trim();
  const envio = document.getElementById('select-envio').value;
  const direccion = envio !== 'retiro' ? document.getElementById('input-direccion').value.trim() : '';
  const notas = document.getElementById('input-notas').value.trim();

  // Validación de campos obligatorios
  if (!nombre || !apellido || !telefono || !envio) {
    mostrarNotificacion('Por favor complete todos los campos obligatorios', 'error');
    return;
  }
  
  if (envio !== 'retiro' && !direccion) {
    mostrarNotificacion('La dirección es obligatoria para envíos', 'error');
    return;
  }

  const submitBtn = formEnvio.querySelector('button[type="submit"]');
  const originalText = submitBtn.textContent;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Procesando pedido...';

  // ----------- TRANSACCIÓN DE STOCK -----------
  try {
    // Intentar descontar el stock con una transacción atómica por cada producto
    for (const item of carrito) {
      const stockRef = ref(db, `productos/${item.id}/stock`);
      const txResult = await runTransaction(stockRef, currentStock => {
        if (currentStock === null || currentStock < item.cantidad) {
          return; // aborta la transacción
        }
        return currentStock - item.cantidad;
      });
      if (!txResult.committed) {
        mostrarNotificacion(`Stock insuficiente para ${item.nombre}. Actualiza la página.`, 'error');
        return;
      }
    }

    // ---- ARMADO DEL MENSAJE Y LOS TOTALES ----
    let mensaje = `¡Hola Patofelting! Quiero hacer un pedido:\n\n`;
    mensaje += `*📋 Detalles del pedido:*\n`;

    let subtotal = 0;
    carrito.forEach(item => {
      const subtotalItem = item.precio * item.cantidad;
      subtotal += subtotalItem;
      mensaje += `➤ ${item.nombre} x${item.cantidad} - $U ${subtotalItem.toLocaleString('es-UY')}\n`;
    });

    let costoEnvio = 0;
    let textoEnvio = 'Retiro en local (Gratis)';
    if (envio === 'montevideo') {
      costoEnvio = 150;
      textoEnvio = 'Envío Montevideo ($150)';
    } else if (envio === 'interior') {
      costoEnvio = 300;
      textoEnvio = 'Envío Interior ($300)';
    }
    const total = subtotal + costoEnvio;

    mensaje += `\n*💰 Total:*\n`;
    mensaje += `Subtotal: $U ${subtotal.toLocaleString('es-UY')}\n`;
    mensaje += `Envío: $U ${costoEnvio.toLocaleString('es-UY')}\n`;
    mensaje += `*TOTAL A PAGAR: $U ${total.toLocaleString('es-UY')}*\n\n`;

    mensaje += `*👤 Datos del cliente:*\n`;
    mensaje += `Nombre: ${nombre} ${apellido}\n`;
    mensaje += `Teléfono: ${telefono}\n`;
    mensaje += `Método de envío: ${textoEnvio}\n`;
    if (envio !== 'retiro') {
      mensaje += `Dirección: ${direccion}\n`;
    }
    if (notas) {
      mensaje += `\n*📝 Notas adicionales:*\n${notas}`;
    }

    const numeroWhatsApp = '59893566283';
    sessionStorage.setItem('ultimoPedidoWhatsApp', mensaje);

    // Intentar abrir WhatsApp
    const urlWhatsApp = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje)}`;
    const nuevaPestaña = window.open(urlWhatsApp, '_blank');
    
    if (!nuevaPestaña) {
      mostrarNotificacion('Por favor, permite las ventanas emergentes para enviar el pedido por WhatsApp.', 'error');
    } else {
      mostrarNotificacion('✅ Pedido preparado y enviando por WhatsApp...', 'exito');
      
      // Limpiar el formulario y la UI después de un tiempo
      setTimeout(() => {
        modalDatosEnvio.classList.remove('visible');
        setTimeout(() => {
          modalDatosEnvio.setAttribute('hidden', true);
          carrito = [];
          guardarCarrito();
          renderizarCarrito();
          renderizarProductos();
          formEnvio.reset();
          renderizarResumenPedidoEnvio();
          mostrarNotificacion('🎉 ¡Pedido enviado! Te responderemos pronto por WhatsApp.', 'exito');
        }, 300);
      }, 1500);
    }

  } catch (err) {
    console.error('Error al procesar pedido:', err);
    mostrarNotificacion('Error al procesar el pedido. Por favor intenta de nuevo.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalText;
  }
});
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
  escucharProductosFirebase();
  cargarCarrito();
  renderizarCarrito();
  inicializarEventos();
});


function setupContactForm() {
  const formContacto = document.getElementById('formulario-contacto');
  const successMessage = document.getElementById('successMessage');
  const errorMessage = document.getElementById('errorMessage');

  if (formContacto) {
    formContacto.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const nombre = document.getElementById('nombre').value.trim();
      const email = document.getElementById('email').value.trim();
      const mensaje = document.getElementById('mensaje').value.trim();

      // Validación básica de campos
      if (!nombre || !email || !mensaje) {
        errorMessage.textContent = 'Por favor completa todos los campos.';
        errorMessage.classList.remove('hidden');
        successMessage.classList.add('hidden');
        setTimeout(() => errorMessage.classList.add('hidden'), 5000);
        return;
      }

      // Deshabilitar el botón durante el envío
      const submitBtn = formContacto.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';

      // Enviar email de contacto a la tienda con EmailJS
      // El email se envía AL DUEÑO de la tienda con los datos del cliente
      emailjs.send('service_89by24g', 'template_8mn7hdp', {
        from_name: nombre,      // Nombre del cliente
        from_email: email,      // Email del cliente (usar como Reply-To en plantilla)
        reply_to: email,        // Email del cliente (campo adicional por compatibilidad)
        message: mensaje        // Mensaje del cliente
      })
      .then(() => {
        successMessage.classList.remove('hidden');
        errorMessage.classList.add('hidden');
        formContacto.reset();
        setTimeout(() => successMessage.classList.add('hidden'), 5000);
      }, (error) => {
        console.error('Error al enviar el mensaje de contacto:', error);
        errorMessage.textContent = 'Error al enviar el mensaje. Por favor intenta de nuevo.';
        errorMessage.classList.remove('hidden');
        successMessage.classList.add('hidden');
        setTimeout(() => errorMessage.classList.add('hidden'), 5000);
      })
      .finally(() => {
        // Rehabilitar el botón
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      });
    });
  }
}

// ========== CONFIGURACIÓN EMAILJS ==========
// Inicializar EmailJS con la clave pública
emailjs.init('o4IxJz0Zz-LQ8jYKG');

// CONFIGURACIÓN DE PLANTILLAS EMAILJS:
// Para que los formularios funcionen correctamente, la plantilla de EmailJS debe incluir estos campos:
//
// FORMULARIO DE CONTACTO (template_8mn7hdp):
// - {{from_name}} : Nombre del remitente
// - {{from_email}} : Email del remitente (usar como Reply-To)
// - {{message}} : Mensaje del cliente
//
// FORMULARIO DE STOCK (template_8mn7hdp):
// - {{reply_to}} : Email del cliente interesado (para responder)
// - {{producto}} : Nombre del producto sin stock
// - {{producto_id}} : ID del producto
// - {{message}} : Mensaje completo sobre el producto
//
// IMPORTANTE: El email debe enviarse AL DUEÑO de la tienda, no al cliente.
// El campo "reply_to" permite que el dueño responda directamente al cliente.

// Llamar a la función para configurar el formulario de contacto
setupContactForm();


document.addEventListener('DOMContentLoaded', function() {
  const EMAIL_LS_KEY = 'patofelting_stock_email';
  const stockModal = document.getElementById('stock-modal');
  const stockForm = document.getElementById('stock-form');
  const stockInput = document.getElementById('stock-email');
  const stockFeedback = document.getElementById('stock-modal-feedback');
  const stockClose = stockModal?.querySelector('.modal-stock-close');

  function openStockModal(productoId, productoNombre) {
    if (!stockModal) return;
    stockModal.setAttribute('data-producto', productoNombre || '');
    stockModal.setAttribute('data-producto-id', productoId || '');
    stockFeedback.hidden = true;
    stockForm.hidden = false;
    stockInput.value = localStorage.getItem(EMAIL_LS_KEY) || '';
    stockModal.classList.add('visible');
    stockModal.removeAttribute('hidden');
    setTimeout(() => { stockInput.focus(); }, 120);
  }

  function closeStockModal() {
    if (!stockModal) return;
    stockModal.classList.remove('visible');
    setTimeout(() => stockModal.setAttribute('hidden', true), 180);
  }

  // Feedback helper
  function showFeedback(msg, color='#43c160') {
    stockFeedback.textContent = msg;
    stockFeedback.style.color = color;
    stockFeedback.hidden = false;
  }

  stockModal?.addEventListener('click', e => {
    if (e.target === stockModal) closeStockModal();
  });
  stockClose?.addEventListener('click', closeStockModal);
  document.addEventListener('keydown', e => {
    if (stockModal && stockModal.classList.contains('visible') && e.key === 'Escape') closeStockModal();
  });

  stockForm?.addEventListener('submit', function(e) {
    e.preventDefault();
    const email = stockInput.value.trim();
    
    // Validación del email
    if (!email) {
      showFeedback('Por favor ingresa tu correo electrónico.', '#d32f2f');
      return;
    }
    
    // Validación básica de formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showFeedback('Por favor ingresa un email válido.', '#d32f2f');
      return;
    }
    
    localStorage.setItem(EMAIL_LS_KEY, email);

    // Datos del producto
    const producto = stockModal.getAttribute('data-producto') || '';
    const productoId = stockModal.getAttribute('data-producto-id') || '';

    const mensaje = `Hola Patofelting, quería saber por el producto ${producto} (ID: ${productoId}) cuando haya stock. Email del interesado: ${email}`;

    const submitBtn = stockForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';

    // Enviar notificación de stock a la tienda con EmailJS
    // El email se envía AL DUEÑO de la tienda, con el email del cliente como reply_to
    emailjs.send('service_89by24g', 'template_8mn7hdp', {
      reply_to: email,        // Email del cliente (para que el dueño pueda responder)
      from_name: 'Cliente Interesado', // Nombre genérico del remitente
      producto: producto,     // Nombre del producto
      producto_id: productoId, // ID del producto
      message: mensaje        // Mensaje completo formateado
    }).then(() => {
      stockForm.hidden = true;
      showFeedback('¡Gracias por tu interés! Te avisaremos apenas haya stock.');
      setTimeout(closeStockModal, 2500);
    }, (err) => {
      console.error('Error al enviar notificación de stock:', err);
      showFeedback('Ocurrió un error, intenta de nuevo. Verifica tu conexión.', '#d32f2f');
    }).finally(() => {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    });
  });

  document.body.addEventListener('click', function(e) {
    const btn = e.target.closest('.boton-stock-naranja');
    if (btn) {
      e.preventDefault();
      openStockModal(btn.dataset.productoid, btn.dataset.producto);
    }
  });
});


function inicializarMenuHamburguesa() {
  const hamburguesa = document.querySelector('.hamburguesa');
  const menu = document.querySelector('.menu');

  if (!hamburguesa || !menu) return;

  hamburguesa.addEventListener('click', () => {
    menu.classList.toggle('active');
    const expanded = hamburguesa.getAttribute('aria-expanded') === 'true';
    hamburguesa.setAttribute('aria-expanded', !expanded);
  });
}
document.addEventListener('DOMContentLoaded', function() {
  const hamburguesa = document.querySelector('.hamburguesa');
  const menu = document.querySelector('.menu');

  hamburguesa.addEventListener('click', function() {
    menu.classList.toggle('active');
    
    hamburguesa.setAttribute('aria-expanded', menu.classList.contains('active'));
  });
});
