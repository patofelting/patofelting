// ==================== CONFIGURACIÓN ====================
const COSTOS_ENVIO = {
  RETIRO_LOCAL: 0,
  MONTEVIDEO: 150,
  INTERIOR: 300
};
const MP_PUBLIC_KEY = 'TEST-ced49cc8-fa7c-403e-a284-52ae3712c614';

// ==================== ESTADO GLOBAL ====================
let carrito = JSON.parse(localStorage.getItem('carritoActual')) || [];
let mp, map, marker;

// ==================== INICIALIZACIÓN ====================
document.addEventListener("DOMContentLoaded", async () => {
  try {
    await cargarSdkMercadoPago();
    mostrarResumenPedido();
    renderizarOpcionesEnvio();
    initMap();
    renderizarMercadoPago();
    
    // Event listeners
    document.getElementById('btn-whatsapp')?.addEventListener('click', enviarPorWhatsApp);
    document.getElementById('search-button')?.addEventListener('click', buscarDireccionEnMapa);
  } catch (error) {
    console.error('Error en inicialización:', error);
    mostrarNotificacion('Error al cargar la página', '#f44336');
  }
});

// ==================== MANEJO DEL CARRITO ====================
function mostrarResumenPedido() {
  const listaProductos = document.getElementById('lista-productos');
  const detalleTotal = document.getElementById('detalle-total');
  const totalPedido = document.getElementById('total-pedido');
  
  listaProductos.innerHTML = carrito.length ? '' : '<li class="no-productos">No hay productos en el carrito</li>';
  
  carrito.forEach(item => {
    const li = document.createElement('li');
    li.className = 'producto-item';
    li.innerHTML = `
      <span class="producto-nombre">${escapeHtml(item.nombre)}</span>
      <span class="producto-cantidad">${item.cantidad} x</span>
      <span class="producto-precio">$ ${item.precio.toFixed(2)}</span>
      <span class="producto-subtotal">$ ${(item.precio * item.cantidad).toFixed(2)}</span>
      <button class="btn-eliminar" onclick="quitarProductoDelCarrito('${escapeHtml(item.nombre)}')">
        <i class="fas fa-trash"></i>
      </button>
    `;
    listaProductos.appendChild(li);
  });
  
  const subtotal = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
  const envio = calcularCostoEnvio();
  const total = subtotal + envio;
  
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

function quitarProductoDelCarrito(nombre) {
  const index = carrito.findIndex(item => item.nombre === nombre);
  if (index >= 0) {
    carrito.splice(index, 1);
    localStorage.setItem('carritoActual', JSON.stringify(carrito));
    mostrarResumenPedido();
    renderizarMercadoPago();
    mostrarNotificacion('Producto eliminado del carrito', '#ff4444');
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
        <span>$${COSTOS_ENVIO.MONTEVIDEO}</span>
        <p class="descripcion">Entrega en 24-48 horas</p>
      </label>
    </div>
    <div class="opcion-envio">
      <input type="radio" name="envio" id="envioInterior" value="envioInterior">
      <label for="envioInterior">
        <strong><i class="fas fa-truck-moving"></i> Envío al Interior</strong>
        <span>$${COSTOS_ENVIO.INTERIOR}</span>
        <p class="descripcion">Entrega en 3-5 días hábiles</p>
      </label>
    </div>
  `;
  
  document.querySelectorAll('input[name="envio"]').forEach(radio => {
    radio.addEventListener('change', () => {
      mostrarResumenPedido();
      renderizarMercadoPago();
    });
  });
}

function calcularCostoEnvio() {
  const retiroLocal = document.getElementById('retiroLocal');
  if (!retiroLocal) return 0;
  
  if (retiroLocal.checked) return COSTOS_ENVIO.RETIRO_LOCAL;
  if (document.getElementById('envioMontevideo')?.checked) return COSTOS_ENVIO.MONTEVIDEO;
  if (document.getElementById('envioInterior')?.checked) return COSTOS_ENVIO.INTERIOR;
  return 0;
}

// ==================== MERCADO PAGO ====================
async function cargarSdkMercadoPago() {
  return new Promise((resolve, reject) => {
    if (typeof MercadoPago !== 'undefined') {
      mp = new MercadoPago(MP_PUBLIC_KEY, { locale: 'es-UY' });
      return resolve();
    }

    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.onload = () => {
      mp = new MercadoPago(MP_PUBLIC_KEY, { locale: 'es-UY' });
      resolve();
    };
    script.onerror = () => {
      reject(new Error('Error al cargar el SDK de Mercado Pago'));
    };
    document.head.appendChild(script);
  });
}

async function crearPreferencia() {
  if (carrito.length === 0) {
    mostrarNotificacion('No hay productos en el carrito', '#ff9800');
    return null;
  }

  // Validar datos de envío si no es retiro en local
  if (!document.getElementById('retiroLocal').checked) {
    const department = document.getElementById('department')?.value;
    const address = document.getElementById('address')?.value;
    if (!department || !address) {
      mostrarNotificacion('Complete los datos de envío', '#ff9800');
      return null;
    }
  }

  // Construir items
  const items = carrito.map(item => ({
    title: item.nombre.substring(0, 50),
    unit_price: parseFloat(item.precio),
    quantity: parseInt(item.cantidad),
    currency_id: "UYU"
  }));

  // Agregar costo de envío
  const costoEnvio = calcularCostoEnvio();
  if (costoEnvio > 0) {
    items.push({
      title: 'Costo de envío',
      unit_price: costoEnvio,
      quantity: 1,
      currency_id: "UYU"
    });
  }

  // Crear payload
  const payload = {
    items,
    payer: {
      ...obtenerDatosPago(),
      email: "test@user.com" // Email requerido por MP
    },
    back_urls: obtenerUrlsRetorno(),
    auto_return: "approved",
    statement_descriptor: "PELUCHONCITOS"
  };

  try {
    // Enviar a tu backend (debes implementar este endpoint)
    const response = await fetch('/crear-preferencia', {
      method: 'POST',
      headers: { 'Content-Type': 'Backend/kage.json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error('Error en el servidor');
    }

    return await response.json();
  } catch (error) {
    console.error('Error al crear preferencia:', error);
    mostrarNotificacion('Error al procesar el pago', '#f44336');
    return null;
  }
}

async function renderizarMercadoPago() {
  const container = document.getElementById('wallet_container');
  if (!container) return;

  try {
    container.innerHTML = '<div class="cargando-pago">Cargando métodos de pago...</div>';

    if (typeof mp === 'undefined') {
      await cargarSdkMercadoPago();
    }

    const preference = await crearPreferencia();
    if (!preference) return;

    container.innerHTML = '';

    await mp.bricks().create("wallet", container, {
      initialization: { 
        preferenceId: preference.id,
        redirectMode: 'self'
      },
      customization: {
        texts: { 
          valueProp: "smart_option", 
          action: "pay",
          paymentPending: "Pago pendiente",
          paymentApproved: "Pago aprobado"
        },
        visual: {
          buttonBackground: "#009ee3",
          buttonTextColor: "#ffffff",
          borderRadius: "8px",
          height: 48
        }
      }
    });
  } catch (error) {
    console.error('Error al renderizar MercadoPago:', error);
    container.innerHTML = `
      <div class="error-pago">
        <p>Error al cargar Mercado Pago</p>
        <button class="boton-reintentar" onclick="renderizarMercadoPago()">
          Reintentar
        </button>
      </div>
    `;
  }
}

// ==================== MAPA ====================
function initMap() {
  if (!document.getElementById('map')) return;
  
  map = L.map('map').setView([-34.9011, -56.1645], 13);
  document.getElementById('map').style.height = '400px';
  
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);
  
  marker = L.marker([-34.9011, -56.1645], { draggable: true })
    .addTo(map)
    .bindPopup('Arrástrame a tu ubicación exacta')
    .openPopup();
  
  setTimeout(() => map.invalidateSize(), 100);
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
    
    const lat = parseFloat(data[0].lat);
    const lon = parseFloat(data[0].lon);
    
    map.setView([lat, lon], 16);
    marker.setLatLng([lat, lon])
      .bindPopup(`<b>${escapeHtml(address)}</b><br>${escapeHtml(department)}`)
      .openPopup();
    
    setTimeout(() => map.invalidateSize(), 100);
  } catch (error) {
    console.error('Error en geocodificación:', error);
    mostrarNotificacion('Dirección no encontrada. Sea más específico.', '#f44336');
  }
}

// ==================== WHATSAPP ====================
function enviarPorWhatsApp() {
  if (carrito.length === 0) {
    mostrarNotificacion('No hay productos en el carrito', '#ff9800');
    return;
  }
  
  const datos = obtenerDatosPago();
  if (!datosValidados(datos)) return;
  
  const { metodoEnvio, costoEnvio } = obtenerInfoEnvio();
  const subtotal = carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
  const total = subtotal + costoEnvio;
  
  let mensaje = `¡Hola! Quiero hacer un pedido:%0A%0A*Productos:*%0A`;
  carrito.forEach(item => {
    mensaje += `- ${item.nombre} x ${item.cantidad}: $${(item.precio * item.cantidad).toFixed(2)}%0A`;
  });
  
  mensaje += `%0A*Subtotal:* $${subtotal.toFixed(2)}%0A`;
  mensaje += `*${metodoEnvio}:* $${costoEnvio.toFixed(2)}%0A`;
  mensaje += `*Total:* $${total.toFixed(2)}%0A%0A`;
  mensaje += `*Datos de envío:*%0A`;
  mensaje += `Nombre: ${datos.name} ${datos.surname}%0A`;
  mensaje += `Departamento: ${document.getElementById('department').value}%0A`;
  mensaje += `Dirección: ${document.getElementById('address').value}%0A`;
  mensaje += `%0A¿Cómo procedemos con el pago?`;
  
  window.open(`https://wa.me/59894955466?text=${mensaje}`, '_blank');
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
    costoEnvio = COSTOS_ENVIO.MONTEVIDEO;
  } else if (document.getElementById('envioInterior')?.checked) {
    metodoEnvio = "Envío al Interior";
    costoEnvio = COSTOS_ENVIO.INTERIOR;
  }
  
  return { metodoEnvio, costoEnvio };
}

function datosValidados(datos) {
  if (!document.getElementById('retiroLocal').checked) {
    if (!datos.name || !datos.surname || !datos.address.street_name || !document.getElementById('department')?.value) {
      mostrarNotificacion('Complete todos los campos obligatorios', '#ff9800');
      return false;
    }
  }
  return true;
}
