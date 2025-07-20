// ===============================
// FUNCIONALIDAD DE FAQ MEJORADA
// ===============================

function inicializarFAQ() {
  // Inicializar toggles de FAQ
  elementos.faqToggles?.forEach(toggle => {
    const content = toggle.nextElementSibling;
    
    // Configurar atributos ARIA para accesibilidad
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('role', 'button');
    content.hidden = true;
    
    // Evento click para mostrar/ocultar
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', !expanded);
      content.hidden = expanded;
      
      // Animación suave
      if (!expanded) {
        content.style.overflow = 'hidden';
        content.style.maxHeight = '0';
        content.hidden = false;
        const height = content.scrollHeight;
        content.style.maxHeight = `${height}px`;
        setTimeout(() => content.style.overflow = 'auto', 300);
      } else {
        content.style.overflow = 'hidden';
        content.style.maxHeight = `${content.scrollHeight}px`;
        setTimeout(() => {
          content.style.maxHeight = '0';
        }, 10);
      }
    });
    
    // Permitir activar con teclado (accesibilidad)
    toggle.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle.click();
      }
    });
  });

  // Filtro de categorías (si existe)
  elementos.faqCategory?.addEventListener('change', (e) => {
    const category = e.target.value.toLowerCase();
    const items = document.querySelectorAll('.faq-item');
    
    items.forEach(item => {
      const itemCategory = item.dataset.category?.toLowerCase() || '';
      const shouldShow = category === 'todos' || itemCategory.includes(category);
      
      item.style.display = shouldShow ? 'block' : 'none';
      
      // Cerrar items al filtrar
      if (!shouldShow) {
        const toggle = item.querySelector('.faq-toggle');
        const content = item.querySelector('.faq-content');
        if (toggle && content) {
          toggle.setAttribute('aria-expanded', 'false');
          content.hidden = true;
          content.style.maxHeight = '0';
        }
      }
    });
  });

  // Búsqueda en FAQ (si existe)
  elementos.faqSearch?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const items = document.querySelectorAll('.faq-item');
    
    items.forEach(item => {
      const question = item.querySelector('.faq-toggle')?.textContent.toLowerCase() || '';
      const answer = item.querySelector('.faq-content')?.textContent.toLowerCase() || '';
      const matches = query === '' || question.includes(query) || answer.includes(query);
      
      item.style.display = matches ? 'block' : 'none';
      
      // Resaltar texto coincidente
      if (matches && query) {
        highlightText(item, query);
      } else {
        removeHighlights(item);
      }
    });
  });
}

// Función para resaltar texto en las FAQs
function highlightText(element, query) {
  const textNodes = [];
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  let node;
  while (node = walker.nextNode()) {
    if (node.nodeValue.trim()) {
      textNodes.push(node);
    }
  }
  
  textNodes.forEach(node => {
    const text = node.nodeValue;
    const regex = new RegExp(query, 'gi');
    const newText = text.replace(regex, match => 
      `<span class="highlight">${match}</span>`
    );
    
    if (newText !== text) {
      const span = document.createElement('span');
      span.innerHTML = newText;
      node.parentNode.replaceChild(span, node);
    }
  });
}

// Función para quitar resaltados
function removeHighlights(element) {
  element.querySelectorAll('.highlight').forEach(highlight => {
    const parent = highlight.parentNode;
    parent.replaceWith(highlight.textContent);
  });
}

// ===============================
// MODIFICACIÓN A LA FUNCIÓN init()
// ===============================

function init() {
  if (typeof document === 'undefined') {
    console.warn('Este script debe ejecutarse en el navegador');
    return;
  }
  
  console.log('Inicializando la aplicación...');
  cargarCarrito();
  cargarProductosDesdeSheets();
  inicializarEventos();
  inicializarFAQ(); // <-- Añadir esta línea
  evitarScrollPorDefecto();
  
  // Lazy loading para imágenes
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src || img.src;
          observer.unobserve(img);
        }
      });
    }, { rootMargin: '100px' });
    
    document.querySelectorAll('img[data-src]').forEach(img => {
      observer.observe(img);
    });
  }
}
