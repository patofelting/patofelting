document.addEventListener('DOMContentLoaded', function() {
  // Carga carrito desde sessionStorage
  const carrito = JSON.parse(sessionStorage.getItem('carritoActual')) || [];
  const COSTOS_ENVIO = { retiro: 0, montevideo: 150, interior: 300 };
  const numeroWhatsApp = "+59894955466"; // Cambia por el tuyo

  // Mostrar productos y resumen
  function mostrarResumenCarrito() {
    const ul = document.getElementById('resumen-productos');
    ul.innerHTML = '';
    let subtotal = 0;
    carrito.forEach(item => {
      subtotal += item.precio * item.cantidad;
      const li = document.createElement('li');
      li.textContent = `${item.nombre} x${item.cantidad} - $${item.precio.toFixed(2)} (Subtotal: $${(item.precio*item.cantidad).toFixed(2)})`;
      ul.appendChild(li);
    });

    // Mostrar subtotales (sin envío todavía)
    document.getElementById('resumen-subtotales').innerHTML = `
      <p><b>Subtotal:</b> $${subtotal.toFixed(2)}</p>
      <p><b>Envío:</b> <span id="envio-monto">$${COSTOS_ENVIO.retiro.toFixed(2)}</span></p>
      <p><b>Total:</b> <span id="total-monto">$${subtotal.toFixed(2)}</span></p>
    `;
  }

  mostrarResumenCarrito();

  // Cambia monto de envío y total al cambiar el tipo
  document.querySelectorAll('input[name="envio"]').forEach(radio => {
    radio.addEventListener('change', function() {
      const tipo = this.value;
      const envio = COSTOS_ENVIO[tipo];
      const subtotal = carrito.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
      document.getElementById('envio-monto').textContent = `$${envio.toFixed(2)}`;
      document.getElementById('total-monto').textContent = `$${(subtotal + envio).toFixed(2)}`;

      // Mostrar/ocultar datos de dirección
      document.getElementById('datos-envio').style.display = tipo === 'retiro' ? 'none' : 'block';
    });
  });

  // Validación y armado de mensaje
  document.getElementById('btn-whatsapp').addEventListener('click', function() {
    // Datos usuario
    const nombre = document.getElementById('nombre').value.trim();
    const apellido = document.getElementById('apellido').value.trim();

    if (!nombre || !apellido) {
      alert("Completá tu nombre y apellido.");
      return;
    }

    // Tipo envío y dirección
    const tipoEnvio = document.querySelector('input[name="envio"]:checked').value;
    let envioLabel = "";
    let envioDetalle = "";
    let direccion = "", departamento = "", codigoPostal = "";

    if (tipoEnvio === "retiro") {
      envioLabel = "Retiro en local";
    } else {
      envioLabel = tipoEnvio === "montevideo" ? "Envío a Montevideo" : "Envío al Interior";
      direccion = document.getElementById('direccion').value.trim();
      departamento = document.getElementById('departamento').value.trim();
      codigoPostal = document.getElementById('codigo-postal').value.trim();
      if (!direccion || !departamento || !codigoPostal) {
        alert("Completá todos los datos de envío.");
        return;
      }
      envioDetalle = `Dirección: ${direccion}\nDepartamento: ${departamento}\nCódigo Postal: ${codigoPostal}`;
    }

    // Armar resumen productos
    let productosDetalle = carrito.map(item =>
      `- ${item.nombre} x${item.cantidad}: $${item.precio.toFixed(2)} (Subtotal: $${(item.precio*item.cantidad).toFixed(2)})`
    ).join("\n");

    // Subtotal y total
    const subtotal = carrito.reduce((sum, item) => sum + item.precio * item.cantidad, 0);
    const costoEnvio = COSTOS_ENVIO[tipoEnvio];
    const total = subtotal + costoEnvio;

    // Mensaje WhatsApp
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
