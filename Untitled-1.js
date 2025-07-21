// ===============================
// CONFIGURACIÓN INICIAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const CSV_URL = window.SHEET_CSV_URL;
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE || 'img/placeholder.png';
const PLACEHOLDER_VIDEO = 'img/placeholder-video.jpg';
const HERO_FALLBACK = 'img/hero-fallback.jpg';

// ===============================
// ESTADO GLOBAL
// ===============================
let productos = [];
let carrito = [];
let paginaActual = 1;
let filtrosActuales = {
  precioMin: null,
  precioMax: null,
  tamañoMin: null,
  tamañoMax: null,
  categoria: 'todos',
  busqueda: ''
};

// ===============================
// MANEJO DE IMÁGENES Y RECURSOS
// ===============================

function manejarErroresImagenes() {
  // Manejar error en imagen de video de fondo
  const videoFondo = document.querySelector('.video-fondo');
  if (videoFondo) {
    videoFondo.addEventListener('error', function() {
      console.log('No se pudo cargar el video, mostrando imagen de respaldo');
      this.poster = PLACEHOLDER_VIDEO;
      const fallback = this.querySelector('.video-fallback');
      if (fallback) fallback.style.display = 'block';
    });
  }

  // Manejar error en imagen de respaldo del hero
  const heroFallback = document.querySelector('.video-fallback');
  if (heroFallback) {
    heroFallback.addEventListener('error', function() {
      console.log('No se pudo cargar la imagen de respaldo');
      this.src = PLACEHOLDER_IMAGE;
    });
  }

  // Manejar errores en imágenes de productos
  document.addEventListener('error', function(e) {
    if (e.target.tagName === 'IMG' && e.target.classList.contains('producto-img')) {
      e.target.src = PLACEHOLDER_IMAGE;
    }
  }, true);
}

// ===============================
// PREGUNTAS FRECUENTES (FAQs)
// ===============================

function inicializarFAQs() {
  const faqItems = document.querySelectorAll('.faq-item');
  
  faqItems.forEach(item => {
    const toggle = item.querySelector('.faq-toggle');
    const content = item.querySelector('.faq-content');
    
    toggle.addEventListener('click', () => {
      const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
      
      // Cerrar todos los demás FAQs
      document.querySelectorAll('.faq-item').forEach(otherItem => {
        if (otherItem !== item) {
          otherItem.querySelector('.faq-toggle').setAttribute('aria-expanded', 'false');
          otherItem.querySelector('.faq-content').hidden = true;
          otherItem.classList.remove('active');
        }
      });
      
      // Alternar el FAQ actual
      if (isExpanded) {
        toggle.setAttribute('aria-expanded', 'false');
        content.hidden = true;
        item.classList.remove('active');
      } else {
        toggle.setAttribute('aria-expanded', 'true');
        content.hidden = false;
        item.classList.add('active');
      }
    });
  });
}

// ===============================
// FORMULARIO DE CONTACTO
// ===============================

function inicializarFormularioContacto() {
  const form = document.getElementById('form-contacto');
  if (!form) return;

  const btnEnviar = document.getElementById('btn-enviar');
  const successMessage = document.getElementById('success-message');

  // Validación en tiempo real
  form.addEventListener('input', function() {
    const nombre = form.from_name.value.trim();
    const email = form.from_email.value.trim();
    const mensaje = form.message.value.trim();
    const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    
    btnEnviar.disabled = !(nombre && emailValido && mensaje);
  });

  // Manejar envío del formulario
  form.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const nombre = form.from_name.value.trim();
    const email = form.from_email.value.trim();
    const mensaje = form.message.value.trim();
    
    if (!nombre || !email || !mensaje) {
      mostrarNotificacion('Por favor complete todos los campos', 'error');
      return;
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      mostrarNotificacion('Por favor ingrese un email válido', 'error');
      return;
    }
    
    btnEnviar.disabled = true;
    btnEnviar.textContent = 'Enviando...';
    
    try {
      // Inicializar EmailJS solo si está disponible
      if (window.emailjs && !window.emailjsInitialized) {
        await emailjs.init("o4IxJz0Zz-LQ8jYKG");
        window.emailjsInitialized = true;
      }
      
      // Enviar formulario
      if (window.emailjs) {
        await emailjs.sendForm('service_89by24g', 'template_8mn7hdp', form);
      } else {
        // Fallback con fetch
        const response = await fetch('/api/contacto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from_name: nombre, from_email: email, message: mensaje })
        });
        if (!response.ok) throw new Error('Error en el servidor');
      }
      
      // Éxito
      form.reset();
      mostrarNotificacion('¡Mensaje enviado con éxito!', 'exito');
      
      if (successMessage) {
        successMessage.textContent = '¡Mensaje enviado con éxito!';
        successMessage.className = 'success-message success';
        successMessage.hidden = false;
        setTimeout(() => successMessage.hidden = true, 5000);
      }
    } catch (error) {
      console.error('Error al enviar:', error);
      mostrarNotificacion('Error al enviar. Intente nuevamente.', 'error');
      
      if (successMessage) {
        successMessage.textContent = 'Error al enviar';
        successMessage.className = 'success-message error';
        successMessage.hidden = false;
        setTimeout(() => successMessage.hidden = true, 5000);
      }
    } finally {
      btnEnviar.disabled = false;
      btnEnviar.textContent = 'Enviar Mensaje';
    }
  });
}

// ===============================
// FUNCIONES AUXILIARES
// ===============================

function mostrarNotificacion(mensaje, tipo = 'exito') {
  const notificacion = document.createElement('div');
  notificacion.className = `notificacion ${tipo}`;
  notificacion.textContent = mensaje;
  document.body.appendChild(notificacion);
  
  setTimeout(() => {
    notificacion.classList.add('show');
    setTimeout(() => {
      notificacion.classList.remove('show');
      setTimeout(() => notificacion.remove(), 300);
    }, 3000);
  }, 10);
}

// ===============================
// INICIALIZACIÓN PRINCIPAL
// ===============================

document.addEventListener('DOMContentLoaded', function() {
  // Manejar errores de imágenes
  manejarErroresImagenes();
  
  // Inicializar FAQs
  inicializarFAQs();
  
  // Inicializar formulario de contacto
  inicializarFormularioContacto();
  
  // Resto de tu inicialización...
  console.log('Aplicación inicializada correctamente');
});

// Manejar caso en que el DOM ya esté cargado
if (document.readyState === 'complete') {
  manejarErroresImagenes();
  inicializarFAQs();
  inicializarFormularioContacto();
}
