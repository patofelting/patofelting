// ========== CONFIGURACIÓN DEL BLOG CON GOOGLE SHEETS ==========
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJwvzHZQN3CQarSDqjk_nShegf8F4ydARvkSK55VabxbCi9m8RuGf2Nyy9ScriFRfGdhZd0P54VS5z/pub?gid=127717360&single=true&output=csv';

class BlogManager {
  constructor() {
    this.entradas = [];
    this.init();
  }

  async init() {
    await this.cargarEntradasDesdeCSV();
    this.addScrollEffects();
    this.addImageLazyLoading();
    this.addVideoPlayPause();
    this.addTouchInteractions();
    this.addReadingProgress();
    this.initializeAnimations();
  }

  // ========== CARGA DE DATOS DESDE GOOGLE SHEETS ==========
  async cargarEntradasDesdeCSV() {
    try {
      console.log('🔄 Cargando entradas del blog desde Google Sheets...');
      console.log('📍 URL:', CSV_URL);

      const respuesta = await fetch(CSV_URL, { cache: 'reload' });
      if (!respuesta.ok) {
        throw new Error(`HTTP error! status: ${respuesta.status}`);
      }

      const texto = await respuesta.text();
      console.log('📄 CSV recibido:', texto.substring(0, 300) + '...');

      const filas = this.parseCSVManual(texto);
      console.log('📊 Filas parseadas:', filas);

      this.entradas = filas
        .filter((fila) => fila.titulo && fila.titulo.trim() !== '')
        .map((fila) => {
          console.log('🔍 Procesando fila:', fila);
          const entrada = {
            id: fila.id || Date.now().toString(),
            fecha: this.formatearFecha(fila.fecha),
            fechaRaw: fila.fecha,
            titulo: fila.titulo,
            contenido: fila.contenido || '',
            imagenes: this.limpiarURLs(fila.imagenPrincipal || fila.imegenPrincipal || ''),
            videos: this.limpiarURLs(fila.videoURL || ''),
            orden: parseInt(fila.orden) || 0,
            categoria: fila.categoria || 'general'
          };
          console.log('✅ Entrada procesada:', entrada);
          return entrada;
        })
        .sort((a, b) => {
          if (a.orden !== 0 && b.orden !== 0) return a.orden - b.orden;
          const dateA = new Date(a.fechaRaw);
          const dateB = new Date(b.fechaRaw);
          return dateB - dateA;
        });

      console.log('✅ Total entradas cargadas:', this.entradas.length);

      if (this.entradas.length > 0) {
        this.renderizarBlog();
      } else {
        this.mostrarMensajeVacio();
      }
    } catch (error) {
      console.error('❌ Error al cargar el blog desde CSV:', error);
      this.mostrarMensajeError();
    }
  }

  limpiarURLs(urlsString) {
    if (!urlsString) return [];
    return urlsString
      .split(',')
      .map((url) => url.trim())
      .filter((url) => url && url.length > 0);
  }

  parseCSVManual(texto) {
    const lineas = texto.trim().split('\n');
    if (lineas.length < 2) return [];
    
    const headers = lineas[0].split(',').map((h) => h.trim().replace(/"/g, ''));
    console.log('📋 Headers encontrados:', headers);

    return lineas.slice(1).map((linea) => {
      const valores = this.parsearLineaCSV(linea);
      const objeto = {};
      
      headers.forEach((header, index) => {
        objeto[header] = valores[index] || '';
      });
      
      return objeto;
    });
  }

  parsearLineaCSV(linea) {
    const resultado = [];
    let valorActual = '';
    let dentroComillas = false;
    let i = 0;

    while (i < linea.length) {
      const char = linea[i];
      
      if (char === '"') {
        dentroComillas = !dentroComillas;
      } else if (char === ',' && !dentroComillas) {
        resultado.push(valorActual.trim());
        valorActual = '';
      } else {
        valorActual += char;
      }
      
      i++;
    }
    
    resultado.push(valorActual.trim());
    return resultado;
  }

  formatearFecha(fechaString) {
    if (!fechaString) return 'Sin fecha';
    
    try {
      if (fechaString.includes('de')) return fechaString;
      
      const fecha = new Date(fechaString);
      if (isNaN(fecha.getTime())) {
        const partes = fechaString.split('/');
        if (partes.length === 3) {
          const nuevaFecha = new Date(partes[2], partes[1] - 1, partes[0]);
          if (!isNaN(nuevaFecha.getTime())) {
            return nuevaFecha.toLocaleDateString('es-ES', {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            });
          }
        }
        return fechaString;
      }
      
      return fecha.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch (error) {
      console.warn('Error al formatear fecha:', fechaString);
      return fechaString;
    }
  }

  renderizarBlog() {
    const contenedor = document.querySelector('.blog-main');
    if (!contenedor) {
      console.error('❌ No se encontró el contenedor .blog-main');
      return;
    }

    const loading = document.getElementById('blog-loading');
    if (loading) loading.style.display = 'none';

    const entradasHTML = this.entradas
      .map((entrada, index) => this.renderEntradaBlog(entrada, index))
      .join('');

    contenedor.innerHTML = entradasHTML;

    setTimeout(() => {
      this.aplicarEfectosPostRenderizado();
    }, 100);
  }

  renderEntradaBlog(entrada, index) {
    const esDestacada = index === 0;
    
    return `
      <article class="blog-entry ${esDestacada ? 'featured' : ''}" data-entry-id="${entrada.id}">
        <div class="notebook-page">
          <div class="red-margin"></div>
          <div class="entry-content">
            <div class="entry-date">${entrada.fecha}</div>
            <h2 class="entry-title">${entrada.titulo}</h2>
            
            <div class="entry-text">
              ${this.procesarContenido(entrada.contenido)}
            </div>
            
            ${this.renderMediaContent(entrada)}
            
            ${esDestacada ? this.renderCallToAction() : ''}
          </div>
        </div>
      </article>
    `;
  }

  procesarContenido(contenido) {
    if (!contenido) return '<p>Sin contenido disponible.</p>';
    
    if (contenido.includes('<') && contenido.includes('>')) {
      return contenido;
    }
    
    return contenido
      .split('\n')
      .filter((parrafo) => parrafo.trim() !== '')
      .map((parrafo) => `<p>${parrafo.trim()}</p>`)
      .join('');
  }

  renderMediaContent(entrada) {
    let mediaHTML = '';
    
    if (entrada.imagenes.length > 0 || entrada.videos.length > 0) {
      mediaHTML += '<div class="media-gallery">';
      
      if (entrada.imagenes.length > 0) {
        console.log('🖼️ Procesando imágenes:', entrada.imagenes);
        entrada.imagenes.forEach((url, index) => {
          mediaHTML += `
            <div class="photo-polaroid">
              <img src="${url}" 
                   alt="${entrada.titulo} - Imagen ${index + 1}" 
                   class="entrada-imagen"
                   loading="lazy"
                   onerror="this.closest('.photo-polaroid').classList.add('image-error'); this.style.display='none';">
              <div class="polaroid-caption">Momento especial de Patofelting ✨</div>
            </div>
          `;
        });
      }
      
      if (entrada.videos.length > 0) {
        console.log('🎥 Procesando videos:', entrada.videos);
        entrada.videos.forEach((url) => {
          mediaHTML += `
            <div class="video-container">
              <video controls class="entrada-video" preload="metadata">
                <source src="${url}" type="video/mp4">
                Tu navegador no soporta video HTML5.
              </video>
              <div class="video-caption">Proceso creativo en acción 🎬</div>
            </div>
          `;
        });
      }
      
      mediaHTML += '</div>';
    }
    
    return mediaHTML;
  }

  renderCallToAction() {
    return `
      <div class="call-to-action-blog">
        <h3>¿Quieres ser parte de esta historia?</h3>
        <p>Cada pedido que me haces se convierte en una nueva entrada en este cuaderno. Tu idea, tu sueño, tu momento especial.</p>
        <a href="index.html#productos" class="cta-button-blog">Ver productos disponibles</a>
        <a href="index.html#contacto" class="cta-button-blog secondary">Contarme tu idea</a>
      </div>
    `;
  }

  mostrarMensajeVacio() {
    const contenedor = document.querySelector('.blog-main');
    if (contenedor) {
      contenedor.innerHTML = `
        <div class="empty-state">
          <div class="notebook-page">
            <div class="red-margin"></div>
            <div class="entry-content">
              <h2>El cuaderno está esperando...</h2>
              <p>Pronto comenzaré a escribir aquí mis aventuras con el fieltro. ¡Vuelve pronto para leer mis historias! 🧶</p>
              <div class="loading-animation">
                <div class="yarn-ball"></div>
                <div class="needle"></div>
              </div>
            </div>
          </div>
        </div>
      `;
    }
  }

  mostrarMensajeError() {
    const contenedor = document.querySelector('.blog-main');
    if (contenedor) {
      contenedor.innerHTML = `
        <div class="blog-error">
          <div class="error-icon">😔</div>
          <div class="error-message">
            <h3>¡Ups! Algo salió mal</h3>
            <p>No pude cargar las entradas del blog en este momento. Por favor, intenta recargar la página.</p>
          </div>
          <button onclick="location.reload()" class="retry-button">🔄 Reintentar</button>
        </div>
      `;
    }
  }

  aplicarEfectosPostRenderizado() {
    this.addImageLazyLoading();
    this.addVideoPlayPause();

    document.querySelectorAll('.blog-entry').forEach((entry, index) => {
      setTimeout(() => {
        entry.classList.add('fade-in');
      }, index * 200);
    });
  }

  addScrollEffects() {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('fade-in');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    setTimeout(() => {
      document.querySelectorAll('.blog-entry').forEach((entry) => {
        observer.observe(entry);
      });
    }, 1000);

    window.addEventListener('scroll', () => {
      const scrolled = window.pageYOffset;
      const parallax = document.querySelectorAll('.photo-polaroid, .video-container');

      parallax.forEach((element) => {
        const speed = 0.02;
        const yPos = -(scrolled * speed);
        const currentRotation = element.style.transform.match(/rotate\(([^)]+)\)/);
        const rotation = currentRotation ? currentRotation[1] : '0deg';
        element.style.transform = `translateY(${yPos}px) rotate(${rotation})`;
      });
    });
  }

  addImageLazyLoading() {
    const imageObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target;
            img.classList.add('loaded');
            imageObserver.unobserve(img);
          }
        });
      },
      { threshold: 0.1 }
    );

    document.querySelectorAll('.entrada-imagen').forEach((img) => {
      imageObserver.observe(img);
    });
  }

  addVideoPlayPause() {
    document.querySelectorAll('.entrada-video').forEach((video) => {
      const videoObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              // Video visible
            } else {
              if (!video.paused) {
                video.pause();
              }
            }
          });
        },
        { threshold: 0.5 }
      );

      videoObserver.observe(video);

      video.addEventListener('click', () => {
        if (video.paused) {
          video.play();
        } else {
          video.pause();
        }
      });

      video.addEventListener('loadedmetadata', () => {
        video.setAttribute(
          'aria-label',
          `Video: ${video.closest('.blog-entry')?.querySelector('.entry-title')?.textContent || 'Contenido del blog'}`
        );
      });
    });
  }

  addTouchInteractions() {
    document.querySelectorAll('.photo-polaroid').forEach((polaroid) => {
      polaroid.addEventListener('touchstart', () => {
        polaroid.style.transform = 'rotate(0deg) scale(1.05)';
      });

      polaroid.addEventListener('touchend', () => {
        setTimeout(() => {
          polaroid.style.transform = 'rotate(-2deg) scale(1)';
        }, 150);
      });
    });

    document.querySelectorAll('button, .cta-button-blog').forEach((button) => {
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
      
      .entrada-imagen, .entrada-video {
        transition: opacity 0.5s ease;
      }
      
      .entrada-imagen.loaded {
        animation: fadeIn 0.5s ease;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      .empty-state, .blog-error {
        text-align: center;
        padding: 4rem 2rem;
      }
      
      .loading-animation {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 1rem;
        margin: 2rem 0;
      }
      
      .yarn-ball {
        width: 30px;
        height: 30px;
        background: var(--primary-green);
        border-radius: 50%;
        animation: bounce 1.5s infinite;
      }
      
      .needle {
        width: 2px;
        height: 40px;
        background: linear-gradient(to bottom, #c0c0c0, #808080);
        border-radius: 1px;
        animation: sewing 2s infinite;
      }
      
      @keyframes bounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-10px); }
      }
      
      @keyframes sewing {
        0%, 100% { transform: translateY(0) rotate(0deg); }
        25% { transform: translateY(-5px) rotate(-5deg); }
        75% { transform: translateY(5px) rotate(5deg); }
      }
    `;
    document.head.appendChild(style);
  }

  async recargar() {
    console.log('🔄 Recargando entradas del blog...');
    await this.cargarEntradasDesdeCSV();
  }
}

// ========== FUNCIONES UTILITARIAS ==========
class BlogUtils {
  static formatDate(dateString) {
    const options = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      locale: 'es-ES',
    };
    return new Date(dateString).toLocaleDateString('es-ES', options);
  }

  static shareOnSocial(platform, url = window.location.href, text = 'Mira esta historia de Patofelting') {
    const encodedUrl = encodeURIComponent(url);
    const encodedText = encodeURIComponent(text);

    const urls = {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
      twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
      whatsapp: `https://wa.me/?text=${encodedText} ${encodedUrl}`,
      pinterest: `https://pinterest.com/pin/create/button/?url=${encodedUrl}&description=${encodedText}`,
    };

    if (urls[platform]) {
      window.open(urls[platform], '_blank', 'width=600,height=400');
    }
  }

  static calculateReadingTime() {
    const blogMain = document.querySelector('.blog-main');
    if (!blogMain) return 1;

    const text = blogMain.textContent;
    const wordsPerMinute = 200;
    const words = text.trim().split(/\s+/).length;
    const time = Math.ceil(words / wordsPerMinute);

    return Math.max(1, time);
  }
}

// ========== INTEGRACIÓN CON E-COMMERCE ==========
class BlogEcommerceIntegration {
  constructor() {
    this.addProductLinks();
    this.addCallToActionTracking();
  }

  addProductLinks() {
    const productMentions = document.querySelectorAll('[data-product]');

    productMentions.forEach((mention) => {
      const productId = mention.dataset.product;
      mention.addEventListener('click', () => {
        window.location.href = `index.html#productos?highlight=${productId}`;
      });

      mention.style.cursor = 'pointer';
      mention.style.textDecoration = 'underline';
      mention.style.color = 'var(--primary-green)';
    });
  }

  addCallToActionTracking() {
    document.querySelectorAll('.cta-button-blog').forEach((cta) => {
      cta.addEventListener('click', (e) => {
        const action = e.target.textContent.trim();
        console.log(`Blog CTA clicked: ${action}`);

        if (typeof gtag !== 'undefined') {
          gtag('event', 'blog_cta_click', {
            event_category: 'Blog',
            event_label: action,
          });
        }
      });
    });
  }
}

// ========== INICIALIZACIÓN ==========
let blogManager;

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Iniciando Blog de Patofelting...');

  setTimeout(() => {
    blogManager = new BlogManager();
    new BlogEcommerceIntegration();
  }, 100);

  setTimeout(() => {
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
  }, 3000);

  setInterval(() => {
    if (blogManager) {
      blogManager.recargar();
    }
  }, 300000);

  console.log('✨ Blog de Patofelting cargado correctamente');
});

window.BlogUtils = BlogUtils;
window.recargarBlog = () => {
  if (blogManager) {
    blogManager.recargar();
  }
};
