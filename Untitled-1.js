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

  if (!nombre || !apellido || !telefono || (envio !== 'retiro' && !direccion)) {
    mostrarNotificacion('Por favor complete todos los campos obligatorios', 'error');
    return;
  }

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

    // Si llegamos aquí, el stock fue descontado con éxito para todos los productos

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
    const urlWhatsApp = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensaje)}`;
    const nuevaPestaña = window.open(urlWhatsApp, '_blank');
    setTimeout(() => {
      if (!nuevaPestaña || nuevaPestaña.closed) {
        window.location.href = `https://api.whatsapp.com/send?phone=${numeroWhatsApp}&text=${encodeURIComponent(mensaje)}`;
      }
    }, 500);

    setTimeout(() => {
      modalDatosEnvio.classList.remove('visible');
      setTimeout(() => {
        modalDatosEnvio.setAttribute('hidden', true);
        carrito = [];
        guardarCarrito();
        renderizarCarrito();
        renderizarProductos();
        mostrarNotificacion('Pedido listo para enviar por WhatsApp', 'exito');
        formEnvio.reset();
        renderizarResumenPedidoEnvio();
      }, 300);
    }, 1000);

  } catch (err) {
    mostrarNotificacion('Error al actualizar stock en tiempo real.', 'error');
    return;
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
  
  // Los event listeners de los sliders ahora los maneja mejorarSlidersAutomaticos()
  // elementos.minSlider y elementos.maxSlider se configuran allí
  
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

// =======================================
// MODAL AVISO DE STOCK - FUNCIONALIDAD MODERNA
// =======================================

/**
 * Sistema de notificación de stock con diseño moderno y accesibilidad completa
 * Integrado con EmailJS existente y localStorage para autocompletado
 */

const LS_EMAIL_KEY = 'user_email_stock_notifications';

// Referencias del modal de stock
const modalAvisoStock = document.getElementById('modal-aviso-stock');
const btnCerrarStockModal = document.getElementById('btn-cerrar-stock-modal');
const btnCancelarStock = document.getElementById('btn-cancelar-stock');
const formAvisoStock = document.getElementById('form-aviso-stock');
const emailStockInput = document.getElementById('email-stock-input');
const btnConfirmarStock = document.getElementById('btn-confirmar-stock');
const productoNombreStock = document.getElementById('producto-nombre-stock');

let currentProductoParaStock = null;

/**
 * Abre el modal de aviso de stock para un producto específico
 */
function abrirModalAvisoStock(nombreProducto, idProducto) {
  currentProductoParaStock = { nombre: nombreProducto, id: idProducto };
  
  // Actualizar el nombre del producto en el modal
  if (productoNombreStock) {
    productoNombreStock.textContent = nombreProducto;
  }
  
  // Autocompletar email si existe en localStorage
  const emailGuardado = localStorage.getItem(LS_EMAIL_KEY);
  if (emailGuardado && emailStockInput) {
    emailStockInput.value = emailGuardado;
    // Hacer focus en el botón de confirmar si ya hay email
    setTimeout(() => btnConfirmarStock?.focus(), 100);
  } else {
    // Hacer focus en el input de email si no hay email guardado
    setTimeout(() => emailStockInput?.focus(), 100);
  }
  
  // Mostrar modal con animación
  if (modalAvisoStock) {
    modalAvisoStock.removeAttribute('hidden');
    modalAvisoStock.classList.add('visible');
    
    // Prevenir scroll del body
    document.body.classList.add('no-scroll');
  }
}

/**
 * Cierra el modal de aviso de stock
 */
function cerrarModalAvisoStock() {
  if (modalAvisoStock) {
    modalAvisoStock.classList.remove('visible');
    document.body.classList.remove('no-scroll');
    
    setTimeout(() => {
      modalAvisoStock.setAttribute('hidden', true);
      currentProductoParaStock = null;
      
      // Reset form
      if (formAvisoStock) {
        formAvisoStock.reset();
      }
      
      // Remover estado de loading del botón
      if (btnConfirmarStock) {
        btnConfirmarStock.classList.remove('loading');
        btnConfirmarStock.disabled = false;
      }
    }, 300);
  }
}

/**
 * Envía la notificación de stock usando EmailJS
 */
async function enviarNotificacionStock(email, nombreProducto, idProducto) {
  if (!window.emailjs) {
    mostrarNotificacion('❌ Error: EmailJS no está disponible', 'error');
    return false;
  }
  
  try {
    // Usar la misma configuración de EmailJS que el formulario de contacto
    await emailjs.send('service_89by24g', 'template_8mn7hdp', {
      from_name: 'Usuario de Patofelting',
      from_email: email,
      message: `Solicitud de aviso de stock para: ${nombreProducto} (ID: ${idProducto}). Por favor notificar cuando esté disponible.`,
      subject: `Aviso de Stock - ${nombreProducto}`,
      to_email: 'patofelting@gmail.com'
    });
    
    // Guardar email en localStorage para futuras notificaciones
    localStorage.setItem(LS_EMAIL_KEY, email);
    
    return true;
  } catch (error) {
    console.error('Error al enviar notificación de stock:', error);
    return false;
  }
}

// Event listeners para el modal de stock
if (btnCerrarStockModal) {
  btnCerrarStockModal.addEventListener('click', cerrarModalAvisoStock);
}

if (btnCancelarStock) {
  btnCancelarStock.addEventListener('click', cerrarModalAvisoStock);
}

// Cerrar modal al hacer click en el backdrop
if (modalAvisoStock) {
  modalAvisoStock.addEventListener('click', (e) => {
    if (e.target === modalAvisoStock || e.target.classList.contains('modal-stock-backdrop')) {
      cerrarModalAvisoStock();
    }
  });
}

// Cerrar modal con tecla Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalAvisoStock && modalAvisoStock.classList.contains('visible')) {
    cerrarModalAvisoStock();
  }
});

// Manejar envío del formulario de stock
if (formAvisoStock) {
  formAvisoStock.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    if (!currentProductoParaStock || !emailStockInput || !btnConfirmarStock) {
      return;
    }
    
    const email = emailStockInput.value.trim();
    if (!email) {
      mostrarNotificacion('❌ Por favor ingresa tu email', 'error');
      emailStockInput.focus();
      return;
    }
    
    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      mostrarNotificacion('❌ Por favor ingresa un email válido', 'error');
      emailStockInput.focus();
      return;
    }
    
    // Mostrar estado de carga
    btnConfirmarStock.classList.add('loading');
    btnConfirmarStock.disabled = true;
    
    // Enviar notificación
    const exito = await enviarNotificacionStock(
      email, 
      currentProductoParaStock.nombre, 
      currentProductoParaStock.id
    );
    
    if (exito) {
      mostrarNotificacion(`✅ Te avisaremos cuando ${currentProductoParaStock.nombre} esté disponible`, 'exito');
      cerrarModalAvisoStock();
    } else {
      mostrarNotificacion('❌ Error al enviar la solicitud. Intenta nuevamente.', 'error');
      // Remover estado de loading
      btnConfirmarStock.classList.remove('loading');
      btnConfirmarStock.disabled = false;
    }
  });
}

// =======================================
// MEJORAS EN FILTROS - AUTO-APLICACIÓN 
// =======================================

/**
 * Mejora la funcionalidad de los sliders de precio para auto-aplicación
 * Elimina la necesidad del botón "Aplicar"
 */
function mejorarSlidersAutomaticos() {
  const minPriceDisplay = document.getElementById('min-price');
  const maxPriceDisplay = document.getElementById('max-price');
  
  // Función para actualizar los displays de precio en tiempo real
  function actualizarDisplaysPrecio() {
    if (minPriceDisplay && elementos.minSlider) {
      minPriceDisplay.textContent = `$U${parseInt(elementos.minSlider.value)}`;
    }
    if (maxPriceDisplay && elementos.maxSlider) {
      maxPriceDisplay.textContent = `$U${parseInt(elementos.maxSlider.value)}`;
    }
  }
  
  // Aplicar filtros con debounce para mejor rendimiento
  let timeoutId = null;
  function aplicarFiltrosConDebounce() {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      filtrosActuales.precioMin = elementos.minSlider?.value ? parseFloat(elementos.minSlider.value) : null;
      filtrosActuales.precioMax = elementos.maxSlider?.value ? parseFloat(elementos.maxSlider.value) : null;
      aplicarFiltros();
    }, 300); // 300ms de debounce
  }
  
  // Event listeners mejorados para los sliders
  if (elementos.minSlider) {
    elementos.minSlider.addEventListener('input', () => {
      actualizarDisplaysPrecio();
      aplicarFiltrosConDebounce();
    });
  }
  
  if (elementos.maxSlider) {
    elementos.maxSlider.addEventListener('input', () => {
      actualizarDisplaysPrecio();
      aplicarFiltrosConDebounce();
    });
  }
  
  // Inicializar displays
  actualizarDisplaysPrecio();
  
  console.log('✅ Sliders de precio mejorados con auto-aplicación activada');
}

// =======================================
// CONECTAR BOTONES DE STOCK EXISTENTES
// =======================================

/**
 * Conecta la funcionalidad a los botones de stock existentes
 */
function conectarBotonesStock() {
  // Usar delegación de eventos para manejar botones dinámicos
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('boton-stock-naranja')) {
      e.preventDefault();
      e.stopPropagation();
      
      const nombreProducto = decodeURIComponent(e.target.dataset.producto || 'Producto');
      const idProducto = e.target.dataset.productoid || '';
      
      abrirModalAvisoStock(nombreProducto, idProducto);
    }
  });
  
  console.log('✅ Botones de stock conectados al modal');
}

// =======================================
// INICIALIZACIÓN DE MEJORAS
// =======================================

// Ejecutar mejoras cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  // Pequeño delay para asegurar que otros scripts hayan cargado
  setTimeout(() => {
    mejorarSlidersAutomaticos();
    conectarBotonesStock();
    
    console.log('✅ Mejoras de UX inicializadas correctamente');
  }, 100);
});
