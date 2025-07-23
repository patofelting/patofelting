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

// ==================== ESTADO GLOBAL ====================
let carrito = [];
const params = new URLSearchParams(window.location.search);
if (params.has('carrito')) {
  try {
    carrito = JSON.parse(decodeURIComponent(params.get('carrito')));
    sessionStorage.setItem('carritoActual', JSON.stringify(carrito));
  } catch (e) {
    carrito = [];
  }
} else {
  carrito = JSON.parse(sessionStorage.getItem('carritoActual')) || [];
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
    if (estado.carrito.length === 0) {
      mostrarNotificacion('No hay productos en el carrito', '#ff9800');
      setTimeout(() => window.location.href = '/index.html', 3000); // Ajusta la URL si lo necesitas
      return;
    }

    await inicializarAplicacion();
    configurarEventListeners();
  } catch (error) {
    console.error('Error en inicialización:', error);
    mostrarNotificacion('Error al cargar la página', '#f44336');
  }
});

async function inicializarAplicacion() {
  await cargarSdkMercadoPago();
  mostrarResumenPedido();
  renderizarOpcionesEnvio();
  inicializarMapa();
  renderizarMercadoPago();
}

function configurarEventListeners() {
  document.getElementById('btn-whatsapp')?.addEventListener('click', enviarPorWhatsApp);
  document.getElementById('search-button')?.addEventListener('click', buscarDireccionEnMapa);

  // Delegación de eventos para botones de eliminar producto
  document.getElementById('lista-productos')?.addEventListener('click', (e) => {
    if (e.target.closest('.btn-eliminar')) {
      const nombre = e.target.closest('.btn-eliminar').dataset.nombre;
      quitarProductoDelCarrito(nombre);
    }
  });

  // Eventos para opciones de envío
  document.querySelectorAll('input[name="envio"]').forEach(radio => {
    radio.addEventListener('change', () => {
      mostrarResumenPedido();
      renderizarMercadoPago();
    });
  });
}

// ==================== MANEJO DEL CARRITO ====================
function mostrarResumenPedido() {
  const { carrito } = estado;
  const listaProductos = document.getElementById('lista-productos');
  const detalleTotal = document.getElementById('detalle-total');
  const totalPedido = document.getElementById('total-pedido');

  if (!listaProductos || !detalleTotal) return;

  listaProductos.innerHTML = carrito.length ? '' : '<li class="no-productos">No hay productos en el carrito</li>';

  carrito.forEach(item => {
    const li = document.createElement('li');
    li.className = 'producto-item';
    li.innerHTML = `
      <span class="producto-nombre">${escapeHtml(item.nombre)}</span>
      <span class="producto-cantidad">${item.cantidad} x</span>
      <span class="producto-precio">$ ${item.precio.toFixed(2)}</span>
      <span class="producto-subtotal">$ ${(item.precio * item.cantidad).toFixed(2)}</span>
      <button class="btn-eliminar" data-nombre="${escapeHtml(item.nombre)}">
        <i class="fas fa-trash"></i>
      </button>
    `;
    listaProductos.appendChild(li);
  });

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

function quitarProductoDelCarrito(nombre) {
  const index = estado.carrito.findIndex(item => item.nombre === nombre);
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
    renderizarMercadoPago();
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
  window.open(`https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${mensaje}`, '_blank');
}

function generarMensajeWhatsApp(datos) {
  const { subtotal, envio, total } = calcularTotales();
  const { metodoEnvio } = obtenerInfoEnvio();

  let mensaje = `¡Hola! Quiero hacer un pedido:%0A%0A*Productos:*%0A`;
  estado.carrito.forEach(item => {
    mensaje += `- ${item.nombre} x ${item.cantidad}: $${(item.precio * item.cantidad).toFixed(2)}%0A`;
  });

  mensaje += `%0A*Subtotal:* $${subtotal.toFixed(2)}%0A`;
  mensaje += `*${metodoEnvio}:* $${envio.toFixed(2)}%0A`;
  mensaje += `*Total:* $${total.toFixed(2)}%0A%0A`;
  mensaje += `*Datos de envío:*%0A`;
  mensaje += `Nombre: ${datos.name} ${datos.surname}%0A`;
  mensaje += `Departamento: ${document.getElementById('department').value}%0A`;
  mensaje += `Dirección: ${document.getElementById('address').value}%0A`;
  mensaje += `%0A¿Cómo procedemos con el pago?`;

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
    address: {
      zip_code: document.getElementById('postal-code')?.value.trim() || '',
      street_name: document.getElementById('address')?.value.trim() || ''
    }
  };
}

function obtenerUrlsRetorno() {
  const baseUrl = window.location.origin;
  return {
    success: `${baseUrl}/pago-exitoso`,
    failure: `${baseUrl}/pago-fallido`,
    pending: `${baseUrl}/pago-pendiente`
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

