const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const CSV_URL = window.SHEET_CSV_URL;
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

// ===============================
// INICIALIZACIÓN
// ===============================
function inicializarEventos() {
  // Carrito
  elementos.carritoBtnMain?.addEventListener('click', toggleCarrito);
  elementos.carritoOverlay?.addEventListener('click', toggleCarrito);
  elementos.btnCerrarCarrito?.addEventListener('click', toggleCarrito);
  elementos.btnVaciarCarrito?.addEventListener('click', () => {
    if (carrito.length === 0) return mostrarNotificacion('El carrito ya está vacío', 'info');
    if (confirm('¿Vaciar carrito?')) {
      carrito = [];
      guardarCarrito();
      actualizarUI();
      mostrarNotificacion('Carrito vaciado', 'info');
    }
  });

  // Finalizar compra
  elementos.btnFinalizarCompra?.addEventListener('click', () => {
    if (carrito.length === 0) return mostrarNotificacion('El carrito está vacío', 'error');
    elementos.avisoPreCompraModal.style.display = 'flex';
  });
  elementos.btnEntendidoAviso?.addEventListener('click', () => {
    mostrarNotificacion('Compra finalizada con éxito', 'exito');
    carrito = [];
    guardarCarrito();
    actualizarUI();
    toggleCarrito();
    elementos.avisoPreCompraModal.style.display = 'none';
  });
  elementos.btnCancelarAviso?.addEventListener('click', () => {
    elementos.avisoPreCompraModal.style.display = 'none';
  });

  // Filtros
  elementos.inputBusqueda?.addEventListener('input', (e) => {
    filtrosActuales.busqueda = e.target.value.toLowerCase();
    aplicarFiltros();
  });
  elementos.selectCategoria?.addEventListener('change', (e) => {
    filtrosActuales.categoria = e.target.value;
    aplicarFiltros();
  });
  document.querySelectorAll('.aplicar-rango-btn').forEach(boton => {
    boton.addEventListener('click', () => {
      filtrosActuales.precioMin = elementos.precioMinInput.value ? parseFloat(elementos.precioMinInput.value) : null;
      filtrosActuales.precioMax = elementos.precioMaxInput.value ? parseFloat(elementos.precioMaxInput.value) : null;
      aplicarFiltros();
    });
  });
  elementos.botonResetearFiltros?.addEventListener('click', resetearFiltros);

  // Modal de producto
  conectarEventoModal();
}

// ===============================
// INICIALIZACIÓN UNIFICADA Y SEGURA
// ===============================
function init() {
  inicializarMenuHamburguesa();
  inicializarFAQ();

  // Ocultar modales y loader al inicio
  if (elementos.avisoPreCompraModal) elementos.avisoPreCompraModal.style.display = 'none';
  if (elementos.productoModal) elementos.productoModal.style.display = 'none';
  if (elementos.productLoader) {
    elementos.productLoader.style.display = 'none';
    elementos.productLoader.hidden = true;
  }
  cargarCarrito();
  cargarProductosDesdeSheets();
  inicializarEventos();

  // FAQ acordeón simple y minimalista (solo una vez)
  document.querySelectorAll('.faq-toggle').forEach(btn => {
    btn.addEventListener('click', function() {
      const expanded = this.getAttribute('aria-expanded') === 'true';
      // Cierra todos
      document.querySelectorAll('.faq-toggle').forEach(b => {
        b.setAttribute('aria-expanded', 'false');
        if (b.nextElementSibling) b.nextElementSibling.hidden = true;
      });
      // Abre solo el clickeado
      if (!expanded) {
        this.setAttribute('aria-expanded', 'true');
        if (this.nextElementSibling) this.nextElementSibling.hidden = false;
      }
    });
  });

  // Menú sección activa
  window.addEventListener('scroll', marcarMenuActivo);
  window.addEventListener('DOMContentLoaded', marcarMenuActivo);

  // EmailJS - Formulario de contacto
  setupContactForm();
}

// Arranque seguro, una sola vez:
if (document.readyState !== 'loading') {
  init();
} else {
  document.addEventListener('DOMContentLoaded', init);
}

// ==== FUNCIONES GLOBALES SI LAS NECESITAS ====
window.resetearFiltros = resetearFiltros;
window.toggleCarrito = toggleCarrito;
window.agregarAlCarrito = agregarAlCarrito;
window.mostrarModalProducto = mostrarModalProducto;
window.mostrarNotificacion = mostrarNotificacion;
window.cargarProductosDesdeSheets = cargarProductosDesdeSheets;
window.guardarCarrito = guardarCarrito;

// ===============================
// CONTACT FORM
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

// Inicializar EmailJS con tu clave pública
emailjs.init('o4IxJz0Zz-LQ8jYKG'); // Reemplaza con tu clave pública de EmailJS

// ====================
// MENÚ SECCIÓN ACTIVA
// ====================
function marcarMenuActivo() {
  const secciones = ['inicio', 'sobre', 'productos', 'contacto', 'preguntas'];
  let seccionActual = secciones[0];
  const offset = 90; // Ajusta según altura navbar

  for (const id of secciones) {
    const seccion = document.getElementById(id);
    if (seccion) {
      const top = seccion.getBoundingClientRect().top + window.scrollY - offset;
      if (window.scrollY >= top - 5) {
        seccionActual = id;
      }
    }
  }
  document.querySelectorAll('.menu li a').forEach(a => {
    if (a.getAttribute('href') === '#' + seccionActual) {
      a.classList.add('active');
      a.setAttribute('aria-current', 'page');
    } else {
      a.classList.remove('active');
      a.removeAttribute('aria-current');
    }
  });
}
