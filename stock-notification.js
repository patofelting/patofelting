// ===============================
// MODAL DE AVISO DE STOCK - STANDALONE
// ===============================

/**
 * Configuración para el servicio de envío de emails
 * IMPORTANTE: Reemplazar con tu endpoint de Formspree
 * 1. Ir a https://formspree.io/
 * 2. Crear una cuenta gratuita
 * 3. Crear un nuevo formulario
 * 4. Reemplazar 'YOUR_FORM_ID' con el ID de tu formulario
 */
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/YOUR_FORM_ID'; // ⚠️ CONFIGURAR AQUÍ

/**
 * Email de destino para las notificaciones de stock
 * Cambiar por el email donde quieres recibir las notificaciones
 */
const EMAIL_DESTINO = 'patofelting@gmail.com'; // ✅ Email configurado

/**
 * Función para mostrar notificaciones básicas
 */
function mostrarNotificacionStock(msg, tipo = 'exito') {
  const noti = document.createElement('div');
  noti.className = `notificacion ${tipo}`;
  noti.style.cssText = `
    position: fixed !important;
    bottom: 32px !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    display: inline-block !important;
    min-width: 100px !important;
    max-width: 340px !important;
    padding: 10px 22px !important;
    border-radius: 16px !important;
    font-size: 1.12rem !important;
    font-weight: 700 !important;
    box-shadow: 0 3px 16px 0 rgba(44,62,80,0.08) !important;
    z-index: 9999 !important;
    color: #fff !important;
    opacity: 0 !important;
    pointer-events: none !important;
    transition: opacity 0.19s, bottom 0.19s !important;
    text-align: center !important;
    line-height: 1.45 !important;
  `;
  noti.style.background = tipo === 'exito' ? '#43b95a !important' : '#e74c3c !important';
  noti.textContent = msg;
  document.body.appendChild(noti);
  
  setTimeout(() => {
    noti.style.opacity = '1';
    noti.style.bottom = '48px';
  }, 10);
  
  setTimeout(() => {
    noti.style.opacity = '0';
    setTimeout(() => noti.remove(), 300);
  }, 2200);
}

/**
 * Inicializar funcionalidad del modal de aviso de stock
 */
function inicializarModalAvisoStock() {
  const modal = document.getElementById('modal-aviso-stock');
  const btnCerrar = document.getElementById('btn-cerrar-modal-stock');
  const form = document.getElementById('form-aviso-stock');
  const inputEmail = document.getElementById('input-email-stock');
  const btnEnviar = document.getElementById('btn-enviar-aviso');
  const textoBoton = btnEnviar?.querySelector('.texto-boton');
  const spinnerBoton = btnEnviar?.querySelector('.spinner-boton');
  const mensajeResultado = document.getElementById('mensaje-resultado-stock');
  const productoNombreModal = document.getElementById('producto-nombre-modal');
  
  let productoActual = null;

  /**
   * Abrir modal de aviso de stock
   * @param {string} nombreProducto - Nombre del producto
   * @param {number} idProducto - ID del producto
   */
  function abrirModalAvisoStock(nombreProducto, idProducto) {
    if (!modal) return;
    
    productoActual = { nombre: nombreProducto, id: idProducto };
    
    // Actualizar nombre del producto en el modal
    if (productoNombreModal) {
      productoNombreModal.textContent = nombreProducto;
    }
    
    // Limpiar formulario y mensajes
    if (form) form.reset();
    ocultarMensajeResultado();
    
    // Mostrar modal
    modal.removeAttribute('hidden');
    setTimeout(() => modal.classList.add('visible'), 10);
    
    // Enfocar el input de email
    setTimeout(() => inputEmail?.focus(), 300);
  }

  /**
   * Cerrar modal de aviso de stock
   */
  function cerrarModalAvisoStock() {
    if (!modal) return;
    
    modal.classList.remove('visible');
    setTimeout(() => {
      modal.setAttribute('hidden', true);
      productoActual = null;
    }, 300);
  }

  /**
   * Mostrar mensaje de resultado
   * @param {string} mensaje - Mensaje a mostrar
   * @param {string} tipo - Tipo de mensaje ('exito' o 'error')
   */
  function mostrarMensajeResultado(mensaje, tipo) {
    if (!mensajeResultado) return;
    
    mensajeResultado.textContent = mensaje;
    mensajeResultado.className = `mensaje-resultado ${tipo}`;
    mensajeResultado.removeAttribute('hidden');
  }

  /**
   * Ocultar mensaje de resultado
   */
  function ocultarMensajeResultado() {
    if (mensajeResultado) {
      mensajeResultado.setAttribute('hidden', true);
    }
  }

  /**
   * Cambiar estado del botón de envío
   * @param {boolean} cargando - Si está en estado de carga
   */
  function cambiarEstadoBoton(cargando) {
    if (!btnEnviar || !textoBoton || !spinnerBoton) return;
    
    btnEnviar.disabled = cargando;
    
    if (cargando) {
      textoBoton.setAttribute('hidden', true);
      spinnerBoton.removeAttribute('hidden');
    } else {
      textoBoton.removeAttribute('hidden');
      spinnerBoton.setAttribute('hidden', true);
    }
  }

  /**
   * Enviar solicitud de aviso de stock
   * @param {string} emailUsuario - Email del usuario
   */
  async function enviarAvisoStock(emailUsuario) {
    if (!productoActual) return;
    
    // Preparar datos para envío
    const datos = {
      // Campos para Formspree
      email: EMAIL_DESTINO, // Email de destino
      subject: `🔔 Solicitud de aviso de stock - ${productoActual.nombre}`,
      message: `Hola, quiero que me avisen cuando haya stock del producto ${productoActual.nombre} (ID: ${productoActual.id}). Mi email es: ${emailUsuario}`,
      // Campos adicionales para seguimiento
      _subject: `🔔 Solicitud de aviso de stock - ${productoActual.nombre}`,
      _replyto: emailUsuario,
      'usuario-email': emailUsuario,
      'producto-nombre': productoActual.nombre,
      'producto-id': productoActual.id,
      'fecha-solicitud': new Date().toLocaleString('es-UY')
    };

    try {
      cambiarEstadoBoton(true);
      
      // Enviar a Formspree
      const response = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(datos)
      });

      if (response.ok) {
        mostrarMensajeResultado(
          '✅ ¡Perfecto! Te avisaremos cuando este producto esté disponible.',
          'exito'
        );
        
        // También mostrar notificación global
        mostrarNotificacionStock('✅ Te avisaremos cuando este producto esté disponible', 'exito');
        
        // Limpiar formulario después del éxito
        setTimeout(() => {
          form?.reset();
          cerrarModalAvisoStock();
        }, 2500);
        
      } else {
        throw new Error('Error en la respuesta del servidor');
      }
      
    } catch (error) {
      console.error('Error al enviar aviso de stock:', error);
      mostrarMensajeResultado(
        '❌ Hubo un problema al enviar tu solicitud. Por favor, inténtalo de nuevo.',
        'error'
      );
      
      // También mostrar notificación global
      mostrarNotificacionStock('❌ Error al enviar solicitud. Inténtalo de nuevo.', 'error');
    } finally {
      cambiarEstadoBoton(false);
    }
  }

  // Event Listeners
  
  // Cerrar modal
  btnCerrar?.addEventListener('click', cerrarModalAvisoStock);
  
  // Cerrar modal al hacer clic fuera
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      cerrarModalAvisoStock();
    }
  });
  
  // Cerrar modal con tecla Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && !modal.hasAttribute('hidden')) {
      cerrarModalAvisoStock();
    }
  });

  // Manejar envío del formulario
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = inputEmail?.value?.trim();
    if (!email) {
      mostrarMensajeResultado('Por favor, ingresa tu email.', 'error');
      return;
    }
    
    if (!productoActual) {
      mostrarMensajeResultado('Error: No se pudo identificar el producto.', 'error');
      return;
    }

    await enviarAvisoStock(email);
  });

  // Exponer función para uso global
  window.abrirModalAvisoStock = abrirModalAvisoStock;
}

/**
 * Inicializar event listeners para botones de aviso de stock
 */
function inicializarBotonesAvisoStock() {
  // Usar delegación de eventos para botones dinámicos
  document.addEventListener('click', (e) => {
    // Verificar si el elemento clickeado es un botón de aviso de stock
    if (e.target.classList.contains('boton-stock-naranja')) {
      e.preventDefault();
      e.stopPropagation();
      
      const nombreProducto = decodeURIComponent(e.target.dataset.producto || '');
      const idProducto = parseInt(e.target.dataset.productoid) || 0;
      
      if (nombreProducto && idProducto) {
        window.abrirModalAvisoStock?.(nombreProducto, idProducto);
      } else {
        mostrarNotificacionStock('Error: No se pudo obtener la información del producto.', 'error');
      }
    }
  });
}

// ===============================
// INICIALIZACIÓN INDEPENDIENTE
// ===============================

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    inicializarModalAvisoStock();
    inicializarBotonesAvisoStock();
  });
} else {
  // DOM ya está listo
  inicializarModalAvisoStock();
  inicializarBotonesAvisoStock();
}