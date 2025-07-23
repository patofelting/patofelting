// ==================== CONFIGURACIÓN ====================
const CONFIG = {
  COSTOS_ENVIO: {
    RETIRO_LOCAL: 0,
    MONTEVIDEO: 150,
    INTERIOR: 300
  },
  MP_PUBLIC_KEY: 'TEST-ced49cc8-fa7c-403e-a284-52ae3712c614',
  WHATSAPP_NUMBER: '59894955466',
  MAP_CENTER: [-34.9011, -56.1645],
  MAP_ZOOM: 13
};

const params = new URLSearchParams(window.location.search);
if (params.has('carrito')) {
  try {
    carrito = JSON.parse(LZString.decompressFromEncodedURIComponent(params.get('carrito')));
    console.log('Carrito cargado desde URL:', carrito);
  } catch (e) {
    console.error('Error al cargar carrito desde URL:', e);
    carrito = cargarCarrito(); // Usar el método anterior como fallback
  }
}


// ==================== ESTADO GLOBAL ====================
let carrito = [];

// Cargar carrito desde sessionStorage (método más confiable)
try {
  const carritoGuardado = sessionStorage.getItem('carritoActual');
  carrito = carritoGuardado ? JSON.parse(carritoGuardado) : [];
} catch (e) {
  console.error('Error al cargar carrito:', e);
  carrito = [];
}

let estado = {
  carrito,
  mp: null,
  map: null,
  marker: null
};

// ==================== INICIALIZACIÓN ====================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Verificar si hay productos en el carrito
    if (estado.carrito.length === 0) {
      mostrarNotificacion('No hay productos en el carrito', '#ff9800');
      setTimeout(() => window.location.href = 'index.html', 3000);
      return;
    }

    await inicializarAplicacion();
    configurarEventListeners();
    
    // Debug: mostrar carrito cargado
    console.log('Carrito cargado:', estado.carrito);
  } catch (error) {
    console.error('Error en inicialización:', error);
    mostrarNotificacion('Error al cargar la página', '#f44336');
  }
});

async function inicializarAplicacion() {
  mostrarResumenPedido();
  renderizarOpcionesEnvio();
  inicializarMapa();
}

function configurarEventListeners() {
  // Botón de WhatsApp
  document.getElementById('btn-whatsapp')?.addEventListener('click', enviarPorWhatsApp);
  
  // Botón de búsqueda en mapa
  document.getElementById('search-button')?.addEventListener('click', buscarDireccionEnMapa);

  // Eliminar productos del carrito
  document.getElementById('lista-productos')?.addEventListener('click', (e) => {
    if (e.target.closest('.btn-eliminar')) {
      const id = e.target.closest('.btn-eliminar').dataset.id;
      quitarProductoDelCarrito(id);
    }
  });

  // Opciones de envío
  document.querySelectorAll('input[name="envio"]').forEach(radio => {
    radio.addEventListener('change', mostrarResumenPedido);
  });
}

// ==================== MANEJO DEL CARRITO ====================
function mostrarResumenPedido() {
  const { carrito } = estado;
  const listaProductos = document.getElementById('lista-productos');
  const detalleTotal = document.getElementById('detalle-total');
  const totalPedido = document.getElementById('total-pedido');

  if (!listaProductos || !detalleTotal) return;

  // Mostrar mensaje si no hay productos
  if (carrito.length === 0) {
    listaProductos.innerHTML = '<li class="no-productos">No hay productos en el carrito</li>';
    detalleTotal.innerHTML = '';
    if (totalPedido) totalPedido.textContent = 'Total: $ 0';
    return;
  }

  // Generar lista de productos
  listaProductos.innerHTML = carrito.map(item => `
    <li class="producto-item">
      <span class="producto-nombre">${escapeHtml(item.nombre)}</span>
      <span class="producto-cantidad">${item.cantidad} x</span>
      <span class="producto-precio">$ ${item.precio.toFixed(2)}</span>
      <span class="producto-subtotal">$ ${(item.precio * item.cantidad).toFixed(2)}</span>
      <button class="btn-eliminar" data-id="${item.id}">
        <i class="fas fa-trash"></i>
      </button>
    </li>
  `).join('');

  // Calcular y mostrar totales
  const { subtotal, envio, total } = calcularTotales();

  detalleTotal.innerHTML = `
    <div class="linea-detalle">
      <span>Subtotal (${carrito.reduce((sum, item) => sum + item.cantidad, 0)} productos):</span>
      <span>$${subtotal.toFixed(2)}</span>
    </div>
    <div class="linea-detalle envio">
      <span>Envío:</span>
      <span id="costo-envio">$${envio.toFixed(2)}</span>
    </div>
    <div class="linea-detalle total">
      <strong>Total a pagar:</strong>
      <strong>$${total.toFixed(2)}</strong>
    </div>
  `;

  if (totalPedido) {
    totalPedido.textContent = `Total: $ ${total.toFixed(2)}`;
  }
}

function calcularTotales() {
  const subtotal = estado.carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
  const envio = calcularCostoEnvio();
  const total = subtotal + envio;
  return { subtotal, envio, total };
}

function quitarProductoDelCarrito(id) {
  const index = estado.carrito.findIndex(item => item.id === id);
  if (index >= 0) {
    estado.carrito.splice(index, 1);
    actualizarEstadoCarrito();
    mostrarNotificacion('Producto eliminado del carrito', '#ff4444');
  }
}

function actualizarEstadoCarrito() {
  try {
    sessionStorage.setItem('carritoActual', JSON.stringify(estado.carrito));
    mostrarResumenPedido();
  } catch (e) {
    console.error('Error al actualizar carrito:', e);
    mostrarNotificacion('Error al actualizar el carrito', '#f44336');
  }
}

// ==================== OPCIONES DE ENVÍO ====================
function renderizarOpcionesEnvio() {
  const opcionesEnvio = document.getElementById('opciones-envio');
  if (!opcionesEnvio) return;

  opcionesEnvio.innerHTML = `
    <div class="opcion-envio">
      <input type="radio" name="envio" id="retiroLocal" value="retiroLocal" checked>
      <label for="retiroLocal">
        <strong><i class="fas fa-store"></i> Retiro en Local</strong>
        <span>Gratis</span>
        <p class="descripcion">Retira tu pedido en nuestro local</p>
      </label>
    </div>
    <div class="opcion-envio">
      <input type="radio" name="envio" id="envioMontevideo" value="envioMontevideo">
      <label for="envioMontevideo">
        <strong><i class="fas fa-truck"></i> Envío a Montevideo</strong>
        <span>$${CONFIG.COSTOS_ENVIO.MONTEVIDEO}</span>
        <p class="descripcion">Entrega en 24-48 horas</p>
      </label>
    </div>
    <div class="opcion-envio">
      <input type="radio" name="envio" id="envioInterior" value="envioInterior">
      <label for="envioInterior">
        <strong><i class="fas fa-truck-moving"></i> Envío al Interior</strong>
        <span>$${CONFIG.COSTOS_ENVIO.INTERIOR}</span>
        <p class="descripcion">Entrega en 3-5 días hábiles</p>
      </label>
    </div>
  `;
}

function calcularCostoEnvio() {
  if (document.getElementById('retiroLocal')?.checked) return CONFIG.COSTOS_ENVIO.RETIRO_LOCAL;
  if (document.getElementById('envioMontevideo')?.checked) return CONFIG.COSTOS_ENVIO.MONTEVIDEO;
  if (document.getElementById('envioInterior')?.checked) return CONFIG.COSTOS_ENVIO.INTERIOR;
  return 0;
}

// ==================== MAPA ====================
function inicializarMapa() {
  const mapElement = document.getElementById('map');
  if (!mapElement) return;

  estado.map = L.map(mapElement).setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);
  mapElement.style.height = '400px';

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(estado.map);

  estado.marker = L.marker(CONFIG.MAP_CENTER, { draggable: true })
    .addTo(estado.map)
    .bindPopup('Arrástrame a tu ubicación exacta')
    .openPopup();

  setTimeout(() => estado.map.invalidateSize(), 100);
}

async function buscarDireccionEnMapa() {
  const address = document.getElementById('address')?.value.trim();
  const department = document.getElementById('department')?.value;

  if (!address || !department) {
    mostrarNotificacion('Complete dirección y departamento', '#ff9800');
    return;
  }

  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}, ${encodeURIComponent(department)}, Uruguay&limit=1`);
    const data = await response.json();

    if (!data?.length) throw new Error('Dirección no encontrada');

    const [lat, lon] = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    actualizarMapa(lat, lon, address, department);
  } catch (error) {
    console.error('Error en geocodificación:', error);
    mostrarNotificacion('Dirección no encontrada. Sea más específico.', '#f44336');
  }
}

function actualizarMapa(lat, lon, address, department) {
  estado.map.setView([lat, lon], 16);
  estado.marker.setLatLng([lat, lon])
    .bindPopup(`<b>${escapeHtml(address)}</b><br>${escapeHtml(department)}`)
    .openPopup();

  setTimeout(() => estado.map.invalidateSize(), 100);
}

// ==================== WHATSAPP ====================
function enviarPorWhatsApp() {
  if (estado.carrito.length === 0) {
    mostrarNotificacion('No hay productos en el carrito', '#ff9800');
    return;
  }

  const datos = obtenerDatosPago();
  if (!validarDatosEnvio(datos)) return;

  const mensaje = generarMensajeWhatsApp(datos);
  window.open(`https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(mensaje)}`, '_blank');
}

function generarMensajeWhatsApp(datos) {
  const { subtotal, envio, total } = calcularTotales();
  const { metodoEnvio } = obtenerInfoEnvio();

  let mensaje = `¡Hola! Quiero hacer un pedido:\n\n*Productos:*\n`;
  estado.carrito.forEach(item => {
    mensaje += `- ${item.nombre} x ${item.cantidad}: $${(item.precio * item.cantidad).toFixed(2)}\n`;
  });

  mensaje += `\n*Subtotal:* $${subtotal.toFixed(2)}\n`;
  mensaje += `*${metodoEnvio}:* $${envio.toFixed(2)}\n`;
  mensaje += `*Total:* $${total.toFixed(2)}\n\n`;
  mensaje += `*Datos de envío:*\n`;
  mensaje += `Nombre: ${datos.name} ${datos.surname}\n`;
  mensaje += `Teléfono: ${datos.phone || 'No proporcionado'}\n`;
  mensaje += `Departamento: ${document.getElementById('department').value}\n`;
  mensaje += `Dirección: ${document.getElementById('address').value}\n`;
  mensaje += `\n¿Cómo procedemos con el pago?`;

  return mensaje;
}

// ==================== UTILIDADES ====================
function mostrarNotificacion(mensaje, color = '#4CAF50') {
  const notificacion = document.createElement('div');
  notificacion.className = 'notificacion';
  notificacion.textContent = mensaje;
  notificacion.style.backgroundColor = color;
  document.body.appendChild(notificacion);

  setTimeout(() => {
    notificacion.classList.add('mostrar');
    setTimeout(() => {
      notificacion.classList.remove('mostrar');
      setTimeout(() => document.body.removeChild(notificacion), 300);
    }, 3000);
  }, 10);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function obtenerDatosPago() {
  return {
    name: document.getElementById('first-name')?.value.trim() || '',
    surname: document.getElementById('last-name')?.value.trim() || '',
    phone: document.getElementById('phone')?.value.trim() || '',
    address: {
      street_name: document.getElementById('address')?.value.trim() || ''
    }
  };
}

function obtenerInfoEnvio() {
  let metodoEnvio = "Retiro en local";
  let costoEnvio = 0;

  if (document.getElementById('envioMontevideo')?.checked) {
    metodoEnvio = "Envío a Montevideo";
    costoEnvio = CONFIG.COSTOS_ENVIO.MONTEVIDEO;
  } else if (document.getElementById('envioInterior')?.checked) {
    metodoEnvio = "Envío al Interior";
    costoEnvio = CONFIG.COSTOS_ENVIO.INTERIOR;
  }

  return { metodoEnvio, costoEnvio };
}

function validarDatosEnvio(datos = null) {
  if (document.getElementById('retiroLocal')?.checked) return true;

  const datosPago = datos || obtenerDatosPago();
  const department = document.getElementById('department')?.value;

  if (!datosPago.name || !datosPago.surname || !datosPago.address.street_name || !department) {
    mostrarNotificacion('Complete todos los campos obligatorios', '#ff9800');
    return false;
  }
  return true;
}
