// ========== CONFIGURACIÓN DEL BLOG ==========
class BlogManager {
  constructor() {
    this.init();
  }

  init() {
    this.addScrollEffects();
    this.addImageLazyLoading();
    this.addVideoPlayPause();
    this.addTouchInteractions();
    this.addReadingProgress();
    this.initializeAnimations();
  }

  // ========== EFECTOS DE SCROLL ==========
  addScrollEffects() {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('fade-in');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    // Observar todas las entradas del blog
    document.querySelectorAll('.blog-entry').forEach(entry => {
      observer.observe(entry);
    });

    // Efecto parallax suave para elementos multimedia
    window.addEventListener('scroll', () => {
      const scrolled = window.pageYOffset;
      const parallax = document.querySelectorAll('.photo-polaroid, .video-container');
      
      parallax.forEach(element => {
        const speed = 0.02;
        const yPos = -(scrolled * speed);
        element.style.transform = `translateY(${yPos}px) rotate(${element.style.transform.match(/rotate\(([^)]+)\)/) ? element.style.transform.match(/rotate\(([^)]+)\)/)[1] : '0deg'})`;
      });
    });
  }

  // ========== LAZY LOADING DE IMÁGENES ==========
  addImageLazyLoading() {
    const imageObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            if (img.dataset.src) {
              img.src = img.dataset.src;
              img.removeAttribute('data-src');
              img.classList.add('loaded');
            }
            imageObserver.unobserve(img);
          }
        });
      },
      { threshold: 0.1 }
    );

    document.querySelectorAll('img[data-src]').forEach(img => {
      imageObserver.observe(img);
    });
  }

  // ========== CONTROL DE VIDEOS ==========
  addVideoPlayPause() {
    document.querySelectorAll('video').forEach(video => {
      // Reproducir cuando esté visible
      const videoObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              video.play().catch(console.log);
            } else {
              video.pause();
            }
          });
        },
        { threshold: 0.5 }
      );

      videoObserver.observe(video);

      // Control manual al hacer clic
      video.addEventListener('click', () => {
        if (video.paused) {
          video.play();
        } else {
          video.pause();
        }
      });
    });
  }

  // ========== INTERACCIONES TÁCTILES ==========
  addTouchInteractions() {
    // Efecto de inclinación en polaroids al tocar
    document.querySelectorAll('.photo-polaroid').forEach(polaroid => {
      polaroid.addEventListener('touchstart', (e) => {
        polaroid.style.transform = 'rotate(0deg) scale(1.05)';
      });

      polaroid.addEventListener('touchend', (e) => {
        setTimeout(() => {
          polaroid.style.transform = 'rotate(-2deg) scale(1)';
        }, 150);
      });
    });

    // Feedback táctil en botones
    document.querySelectorAll('button, .cta-button-blog').forEach(button => {
      button.addEventListener('touchstart', () => {
        button.style.transform = 'scale(0.95)';
      });

      button.addEventListener('touchend', () => {
        setTimeout(() => {
          button.style.transform = 'scale(1)';
        }, 100);
      });
    });
  }

  // ========== BARRA DE PROGRESO DE LECTURA ==========
  addReadingProgress() {
    const progressBar = document.createElement('div');
    progressBar.className = 'reading-progress';
    progressBar.innerHTML = '<div class="progress-fill"></div>';
    document.body.appendChild(progressBar);

    const progressFill = progressBar.querySelector('.progress-fill');

    window.addEventListener('scroll', () => {
      const winScroll = document.body.scrollTop || document.documentElement.scrollTop;
      const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      const scrolled = (winScroll / height) * 100;
      
      progressFill.style.width = scrolled + '%';
    });

    // Estilos de la barra de progreso
    const style = document.createElement('style');
    style.textContent = `
      .reading-progress {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 4px;
        background: rgba(67, 193, 96, 0.2);
        z-index: 1001;
      }
      
      .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #43c160, #b4f1d9);
        width: 0%;
        transition: width 0.3s ease;
      }
    `;
    document.head.appendChild(style);
  }

  // ========== ANIMACIONES DE ENTRADA ==========
  initializeAnimations() {
    const style = document.createElement('style');
    style.textContent = `
      .blog-entry {
        opacity: 0;
        transform: translateY(30px);
        transition: all 0.6s ease;
      }
      
      .blog-entry.fade-in {
        opacity: 1;
        transform: translateY(0);
      }
      
      .photo-polaroid, .video-container {
        transition: transform 0.3s ease;
      }
      
      img.loaded {
        animation: fadeIn 0.5s ease;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      .technique-card {
        transform: translateY(20px);
        opacity: 0;
        animation: slideUp 0.6s ease forwards;
      }
      
      .technique-card:nth-child(2) {
        animation-delay: 0.2s;
      }
      
      @keyframes slideUp {
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      
      .timeline-item {
        opacity: 0;
        transform: translateX(-30px);
        animation: slideRight 0.5s ease forwards;
      }
      
      .timeline-item:nth-child(2) { animation-delay: 0.1s; }
      .timeline-item:nth-child(3) { animation-delay: 0.2s; }
      .timeline-item:nth-child(4) { animation-delay: 0.3s; }
      
      @keyframes slideRight {
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
    `;
    document.head.appendChild(style);

    // Trigger animations for timeline and technique cards
    setTimeout(() => {
      document.querySelectorAll('.timeline-item, .technique-card').forEach(el => {
        el.style.animation = el.style.animation || 'slideUp 0.6s ease forwards';
      });
    }, 500);
  }
}

// ========== FUNCIONES UTILITARIAS ==========
class BlogUtils {
  // Formatear fechas
  static formatDate(dateString) {
    const options = { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      locale: 'es-ES'
    };
    return new Date(dateString).toLocaleDateString('es-ES', options);
  }

  // Compartir en redes sociales
  static shareOnSocial(platform, url = window.location.href, text = 'Mira esta historia de Patofelting') {
    const encodedUrl = encodeURIComponent(url);
    const encodedText = encodeURIComponent(text);
    
    const urls = {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      whatsapp: `https://wa.me/?text=${encodedText} ${encodedUrl}`,
      pinterest: `https://pinterest.com/pin/create/button/?url=${encodedUrl}&description=${encodedText}`
    };

    if (urls[platform]) {
      window.open(urls[platform], '_blank', 'width=600,height=400');
    }
  }

  // Estimar tiempo de lectura
  static calculateReadingTime() {
    const text = document.querySelector('.blog-main').textContent;
    const wordsPerMinute = 200;
    const words = text.trim().split(/\s+/).length;
    const time = Math.ceil(words / wordsPerMinute);
    
    return time;
  }
}

// ========== INTEGRACIÓN CON E-COMMERCE ==========
class BlogEcommerceIntegration {
  constructor() {
    this.addProductLinks();
    this.addCallToActionTracking();
  }

  // Añadir enlaces a productos mencionados
  addProductLinks() {
    const productMentions = document.querySelectorAll('[data-product]');
    
    productMentions.forEach(mention => {
      const productId = mention.dataset.product;
      mention.addEventListener('click', () => {
        window.location.href = `index.html#productos?highlight=${productId}`;
      });
      
      mention.style.cursor = 'pointer';
      mention.style.textDecoration = 'underline';
      mention.style.color = 'var(--primary-green)';
    });
  }

  // Tracking de CTAs
  addCallToActionTracking() {
    document.querySelectorAll('.cta-button-blog').forEach(cta => {
      cta.addEventListener('click', (e) => {
        const action = e.target.textContent.trim();
        console.log(`Blog CTA clicked: ${action}`);
        
        // Aquí podrías integrar con Google Analytics
        if (typeof gtag !== 'undefined') {
          gtag('event', 'blog_cta_click', {
            'event_category': 'Blog',
            'event_label': action
          });
        }
      });
    });
  }
}

// ========== SISTEMA DE COMENTARIOS SIMPLE ==========
class SimpleBlogComments {
  constructor() {
    this.comments = JSON.parse(localStorage.getItem('blog-comments') || '[]');
    this.createCommentsSection();
  }

  createCommentsSection() {
    const commentsHTML = `
      <section class="comments-section">
        <div class="notebook-page">
          <div class="red-margin"></div>
          <div class="entry-content">
            <h3>Deja tu mensaje 💌</h3>
            <form class="comment-form">
              <input type="text" placeholder="Tu nombre" required>
              <textarea placeholder="Comparte tu experiencia con Patofelting..." required></textarea>
              <button type="submit">Dejar mensaje</button>
            </form>
            <div class="comments-list"></div>
          </div>
        </div>
      </section>
    `;

    document.querySelector('.blog-main').insertAdjacentHTML('beforeend', commentsHTML);
    
    this.renderComments();
    this.attachCommentForm();
  }

  renderComments() {
    const commentsList = document.querySelector('.comments-list');
    
    if (this.comments.length === 0) {
      commentsList.innerHTML = '<p class="no-comments">¡Sé el primero en dejar un mensaje!</p>';
      return;
    }

    commentsList.innerHTML = this.comments.map(comment => `
      <div class="comment">
        <div class="comment-author">${comment.name}</div>
        <div class="comment-text">${comment.text}</div>
        <div class="comment-date">${comment.date}</div>
      </div>
    `).join('');
  }

  attachCommentForm() {
    const form = document.querySelector('.comment-form');
    
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const name = form.querySelector('input').value.trim();
      const text = form.querySelector('textarea').value.trim();
      
      if (name && text) {
        const comment = {
          name,
          text,
          date: new Date().toLocaleDateString('es-ES'),
          id: Date.now()
        };
        
        this.comments.push(comment);
        localStorage.setItem('blog-comments', JSON.stringify(this.comments));
        
        form.reset();
        this.renderComments();
        
        // Mostrar confirmación
        this.showCommentConfirmation();
      }
    });
  }

  showCommentConfirmation() {
    const notification = document.createElement('div');
    notification.className = 'comment-notification';
    notification.textContent = '¡Gracias por tu mensaje! 💚';
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: var(--primary-green);
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 50px;
      font-weight: 500;
      z-index: 1000;
      animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }
}

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', () => {
  new BlogManager();
  new BlogEcommerceIntegration();
  
  // Opcional: Sistema de comentarios
  // new SimpleBlogComments();
  
  // Mostrar tiempo de lectura estimado
  const readingTime = BlogUtils.calculateReadingTime();
  const timeElement = document.createElement('div');
  timeElement.className = 'reading-time';
  timeElement.innerHTML = `<span>📖 Tiempo de lectura: ${readingTime} min</span>`;
  timeElement.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    background: white;
    padding: 0.5rem 1rem;
    border-radius: 25px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
    font-size: 0.9rem;
    color: var(--pencil-gray);
    z-index: 1000;
  `;
  
  document.body.appendChild(timeElement);
  
  console.log('Blog de Patofelting cargado ✨');
});

// ========== EXPORTAR PARA USO GLOBAL ==========
window.BlogUtils = BlogUtils;
function sincronizarBlogConFirebase() {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Blog");
  const datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, 7).getValues();

  const entradas = {};

  datos.forEach((fila, index) => {
    const id = fila[0];
    if (!id) return;

    entradas[id] = {
      id: id,
      fecha: fila[1],
      titulo: fila[2],
      contenidoHTML: fila[3],
      imagenPrincipal: fila[4],
      videoURL: fila[5],
      orden: fila[6] || 0
    };
  });

  const url = 'https://patofelting-b188f-default-rtdb.firebaseio.com/blog.json';
  const opciones = {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify(entradas)
  };

  UrlFetchApp.fetch(url, opciones);
  Logger.log("Entradas del blog sincronizadas con Firebase");
}

// 2. Código para incluir en blog.js
// Esto se conecta a Firebase y renderiza el contenido automáticamente

async function cargarEntradasDesdeFirebase() {
  try {
    const respuesta = await fetch('https://patofelting-b188f-default-rtdb.firebaseio.com/blog.json');
    const data = await respuesta.json();

    if (!data) return;

    const entradas = Object.values(data).sort((a, b) => (a.orden || 0) - (b.orden || 0));

    const contenedor = document.querySelector('.blog-main');
    if (!contenedor) return;

    contenedor.innerHTML = entradas.map(renderEntradaBlog).join('');
  } catch (error) {
    console.error("Error al cargar las entradas del blog:", error);
  }
}

function renderEntradaBlog(entrada) {
  return `
    <article class="blog-entry">
      <div class="notebook-page">
        <div class="red-margin"></div>
        <div class="entry-content">
          <div class="entry-date">${entrada.fecha}</div>
          <h2 class="entry-title">${entrada.titulo}</h2>
          <div class="entry-text">${entrada.contenidoHTML}</div>
          ${entrada.imagenPrincipal ? `<img src="${entrada.imagenPrincipal}" alt="${entrada.titulo}" class="img-blog">` : ''}
          ${entrada.videoURL ? `
            <video controls class="video-blog">
              <source src="${entrada.videoURL}" type="video/mp4">
              Tu navegador no soporta video.
            </video>` : ''}
        </div>
      </div>
    </article>
  `;
}

document.addEventListener('DOMContentLoaded', cargarEntradasDesdeFirebase);