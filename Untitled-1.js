// Configuración inicial con validación
const CONFIG = {
  PRODUCTOS_POR_PAGINA: 6,
  LS_CARRITO_KEY: 'carrito',
  CSV_URL: window.SHEET_CSV_URL || 'data/productos.csv',
  PLACEHOLDER_IMAGE: window.PLACEHOLDER_IMAGE || 'img/placeholder.jpg',
  FALLBACK_IMAGES: {
    hero: 'img/hero-fallback.jpg',
    video: 'img/placeholder-video.jpg'
  }
};

// Verificar recursos críticos al iniciar
function verificarRecursos() {
  const recursosRequeridos = [
    CONFIG.PLACEHOLDER_IMAGE,
    CONFIG.FALLBACK_IMAGES.hero,
    CONFIG.FALLBACK_IMAGES.video
  ];

  recursosRequeridos.forEach(ruta => {
    fetch(ruta, { method: 'HEAD' }).catch(() => {
      console.warn(`Recurso no encontrado: ${ruta}`);
    });
  });
}

// Función de carga segura de imágenes
function cargarImagenSegura(elemento, ruta, fallback) {
  const img = new Image();
  img.src = ruta;
  img.onerror = () => {
    elemento.src = fallback;
    console.warn(`Imagen no encontrada: ${ruta}, usando fallback`);
  };
  return img;
}

// Inicialización con manejo de errores
function init() {
  try {
    verificarRecursos();
    
    // EmailJS init seguro
  if (window.emailjs) {
    emailjs.init("o4IxJz0Zz-LQ8jYKG"); 
    const formContacto = document.getElementById('form-contacto');
    if (formContacto) {
      formContacto.addEventListener('submit', function(event) {
        event.preventDefault();
        const btnEnviar = document.getElementById('btn-enviar');
        const successMessage = document.getElementById('success-message');
        btnEnviar.disabled = true;
        btnEnviar.textContent = 'Enviando...';
        emailjs.sendForm('service_89by24g', 'template_8mn7hdp', this) 
          .then(function() {
            btnEnviar.disabled = false;
            btnEnviar.textContent = 'Enviar mensaje';
            formContacto.reset();
            if (successMessage) {
              successMessage.classList.remove('hidden');
              setTimeout(() => successMessage.classList.add('hidden'), 5000);
            }
            mostrarNotificacion("¡Mensaje enviado con éxito!", "exito");
          }, function() {
            btnEnviar.disabled = false;
            btnEnviar.textContent = 'Enviar mensaje';
            mostrarNotificacion("Error al enviar mensaje. Intenta de nuevo.", "error");
          });
      });
    }
	
  }
  
