/* Estilos para FAQ */
.faq-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.faq-filters {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.faq-item {
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-bottom: 10px;
  overflow: hidden;
}

.faq-toggle {
  width: 100%;
  padding: 15px 20px;
  text-align: left;
  background: #f8f8f8;
  border: none;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
}

.faq-toggle:hover {
  background: #eee;
}

.faq-content {
  padding: 0;
  max-height: 0;
  transition: max-height 0.3s ease, padding 0.3s ease;
  overflow: hidden;
}

.faq-toggle[aria-expanded="true"] + .faq-content {
  padding: 15px 20px;
  max-height: 1000px; /* Ajusta según necesidad */
}

.faq-toggle[aria-expanded="true"] .faq-icon {
  transform: rotate(45deg);
}

.faq-icon {
  transition: transform 0.3s ease;
  font-size: 1.2em;
}

.highlight {
  background-color: yellow;
  font-weight: bold;
}
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
   
