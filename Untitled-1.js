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
    
    // Verificar si EmailJS está disponible
    if (typeof emailjs === 'undefined') {
      console.warn('EmailJS no está cargado');
      document.getElementById('form-contacto')?.classList.add('hidden');
    }

    // Resto de tu inicialización...
    cargarCarrito();
    cargarProductosDesdeSheets();
    inicializarEventos();
    inicializarFAQ();
    
    if (typeof emailjs !== 'undefined') {
      inicializarFormularioContacto();
    }

  } catch (error) {
    console.error('Error en la inicialización:', error);
    mostrarNotificacion('Error al iniciar la aplicación', 'error');
  }
}

// Manejo mejorado de eventos de error
window.addEventListener('error', event => {
  console.error('Error global:', event.error);
  mostrarNotificacion('Ocurrió un error inesperado', 'error');
});

window.addEventListener('unhandledrejection', event => {
  console.error('Error no manejado:', event.reason);
  mostrarNotificacion('Error en operación asíncrona', 'error');
});
