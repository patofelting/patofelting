// ========== CONFIGURACIÓN DEL BLOG CON GOOGLE SHEETS ==========
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJwvzHZQN3CQarSDqjk_nShegf8F4ydARvkSK55VabxbCi9m8RuGf2Nyy9ScriFRfGdhZd0P54VS5z/pub?output=csv';

/* 
 * MEJORAS IMPLEMENTADAS EN EL BLOG (Agosto 2024):
 * ================================================
 * 
 * 1. SOPORTE MULTI-MEDIA:
 *    - Múltiples imágenes por entrada (separadas por coma en Google Sheets)
 *    - Videos de YouTube (detección automática y embed responsivo)
 *    - Videos de Vimeo (detección automática y embed responsivo)
 *    - Videos directos (MP4, WebM, etc.)
 *    - Medios mixtos (imágenes + videos en la misma entrada)
 * 
 * 2. DETECCIÓN INTELIGENTE DE URLs:
 *    - Reconoce automáticamente URLs de YouTube (youtube.com, youtu.be)
 *    - Reconoce URLs de Vimeo (vimeo.com)
 *    - Extrae IDs de video automáticamente
 *    - Manejo de errores robusto
 * 
 * 3. DISEÑO RESPONSIVO:
 *    - Embeds de video responsivos (16:9 aspect ratio)
 *    - Adaptación a dispositivos móviles
 *    - Mantiene el estilo polaroid para imágenes
 * 
 * 4. COMPATIBILIDAD:
 *    - Mantiene compatibilidad con el campo 'videoURL' existente
 *    - Mejora el procesamiento del campo 'imagenPrincipal'
 *    - No rompe entradas existentes
 * 
 * INSTRUCCIONES DE USO:
 * ====================
 * En Google Sheets, el campo 'imagenPrincipal' ahora acepta:
 * - Una sola imagen: https://i.imgur.com/ejemplo.jpg
 * - Múltiples imágenes: https://i.imgur.com/1.jpg, https://i.imgur.com/2.jpg
 * - Videos de YouTube: https://www.youtube.com/watch?v=VIDEO_ID
 * - Videos de Vimeo: https://vimeo.com/VIDEO_ID
 * - Combinaciones: imagen.jpg, https://youtube.com/watch?v=ID, imagen2.jpg
 */

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
      
      const respuesta = await fetch(CSV_URL, {cache: "reload"});
      if (!respuesta.ok) {
        throw new Error(`HTTP error! status: ${respuesta.status}`);
      }
      
      const texto = await respuesta.text();
      console.log('📄 CSV recibido:', texto.substring(0, 200) + '...');
      
      // Usar PapaParse si está disponible, sino parsear manualmente
      let filas;
      if (typeof Papa !== 'undefined') {
        const resultado = Papa.parse(texto, {
          header: true,
          skipEmptyLines: true,
          transform: (value) => value.trim()
        });
        filas = resultado.data;
      } else {
        filas = this.parseCSVManual(texto);
      }

      this.entradas = filas
        .filter(fila => fila.titulo && fila.titulo.trim() !== '')
        .map(fila => ({
          id: fila.id || Date.now().toString(),
          fecha: this.formatearFecha(fila.fecha),
          fechaRaw: fila.fecha,
          titulo: fila.titulo,
          contenido: fila.contenido || '',
          imagenPrincipal: fila.imagenPrincipal || '',
          videoURL: fila.videoURL || '',
          orden: parseInt(fila.orden) || 0,
          categoria: fila.categoria || 'general'
        }))
        .sort((a, b) => {
          // Ordenar por fecha ascendente (más viejo primero)
          const dateA = new Date(a.fechaRaw);
          const dateB = new Date(b.fechaRaw);
          return dateA - dateB;
        });

      console.log('✅ Entradas cargadas:', this.entradas.length);
      
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

  // Parser CSV manual para casos donde PapaParse no esté disponible
  parseCSVManual(texto) {
    const lineas = texto.trim().split('\n');
    const headers = lineas[0].split(',').map(h => h.trim().replace(/"/g, ''));
    
    return lineas.slice(1).map(linea => {
      const valores = this.parsearLineaCSV(linea);
      const objeto = {};
      
      headers.forEach((header, index) => {
        objeto[header] = valores[index] || '';
      });
      
      return objeto;
    });
  }

  // Parsear una línea CSV respetando comillas
  parsearLineaCSV(linea) {
    const resultado = [];
    let valorActual = '';
    let dentroDeComillas = false;
    let i = 0;

    while (i < linea.length) {
      const char = linea[i];
      
      if (char === '"') {
        dentroDeComillas = !dentroDeComillas;
      } else if (char === ',' && !dentroDeComillas) {
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

  // Formatear fecha desde diferentes formatos
  formatearFecha(fechaString) {
    if (!fechaString) return new Date().toLocaleDateString('es-ES');
    
    try {
      // Intentar diferentes formatos
      let fecha;
      
      if (fechaString.includes('/')) {
        // Formato DD/MM/YYYY o MM/DD/YYYY
        const partes = fechaString.split('/');
        if (partes.length === 3) {
          fecha = new Date(partes[2], partes[1] - 1, partes[0]);
        }
      } else if (fechaString.includes('-')) {
        // Formato YYYY-MM-DD
        fecha = new Date(fechaString);
      } else {
        // Intentar parsing directo
        fecha = new Date(fechaString);
      }
      
      if (isNaN(fecha.getTime())) {
        throw new Error('Fecha inválida');
      }
      
      return fecha.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      console.warn('⚠️ Error al formatear fecha:', fechaString);
      return fechaString; // Devolver la fecha original si no se puede parsear
    }
  }

  // ========== RENDERIZADO DEL BLOG ==========
  renderizarBlog() {
    const contenedor = document.querySelector('.blog-main');
    if (!contenedor) {
      console.error('❌ No se encontró el contenedor .blog-main');
      return;
    }

    contenedor.innerHTML = this.entradas.map((entrada, index) => 
      this.renderEntradaBlog(entrada, index)
    ).join('');

    // Aplicar efectos después del renderizado
    setTimeout(() => {
      this.aplicarEfectosPostRenderizado();
    }, 100);
  }

  renderEntradaBlog(entrada, index) {
    const esDestacada = index === this.entradas.length - 1; // La más nueva es destacada (última)
    
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

  // Procesar contenido HTML y añadir elementos interactivos
  procesarContenido(contenido) {
    if (!contenido) return '<p>Sin contenido disponible.</p>';
    
    // Si el contenido ya es HTML, usarlo directamente
    if (contenido.includes('<') && contenido.includes('>')) {
      return contenido;
    }
    
    // Si es texto plano, convertir saltos de línea a párrafos
    return contenido.split('\n')
      .filter(parrafo => parrafo.trim() !== '')
      .map(parrafo => `<p>${parrafo.trim()}</p>`)
      .join('');
  }

  // Renderizar contenido multimedia - Soporta múltiples imágenes, videos de YouTube/Vimeo y medios mixtos
  renderMediaContent(entrada) {
    let mediaHTML = '';
    
    if (entrada.imagenPrincipal || entrada.videoURL) {
      mediaHTML += '<div class="media-gallery">';
      
      // Procesar campo imagenPrincipal que puede contener imágenes Y videos (YouTube/Vimeo)
      if (entrada.imagenPrincipal) {
        const mediaUrls = entrada.imagenPrincipal
          .split(/[\n,]+/) // separa por coma o salto de línea
          .map(url => url.trim()) // elimina espacios
          .filter(url => url.length > 0); // ignora vacíos

        mediaUrls.forEach(url => {
          if (this.isYouTubeURL(url)) {
            // Detectar y renderizar video de YouTube
            mediaHTML += this.renderYouTubeEmbed(url, entrada.titulo);
          } else if (this.isVimeoURL(url)) {
            // Detectar y renderizar video de Vimeo
            mediaHTML += this.renderVimeoEmbed(url, entrada.titulo);
          } else if (this.isVideoURL(url)) {
            // Video directo (MP4, etc.)
            mediaHTML += this.renderDirectVideo(url, entrada.titulo);
          } else {
            // Imagen regular
            mediaHTML += this.renderImage(url, entrada.titulo);
          }
        });
      }
      
      // Campo videoURL separado (mantenido por compatibilidad)
      if (entrada.videoURL) {
        if (this.isYouTubeURL(entrada.videoURL)) {
          mediaHTML += this.renderYouTubeEmbed(entrada.videoURL, entrada.titulo);
        } else if (this.isVimeoURL(entrada.videoURL)) {
          mediaHTML += this.renderVimeoEmbed(entrada.videoURL, entrada.titulo);
        } else {
          mediaHTML += this.renderDirectVideo(entrada.videoURL, entrada.titulo);
        }
      }
      
      mediaHTML += '</div>';
    }
    
    return mediaHTML;
  }

  // Detectar URLs de YouTube
  isYouTubeURL(url) {
    const youtubePatterns = [
      /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/,
      /youtube\.com\/watch\?v=/,
      /youtube\.com\/embed\//,
      /youtu\.be\//
    ];
    return youtubePatterns.some(pattern => pattern.test(url));
  }

  // Detectar URLs de Vimeo
  isVimeoURL(url) {
    const vimeoPatterns = [
      /^https?:\/\/(www\.)?vimeo\.com/,
      /vimeo\.com\/\d+/
    ];
    return vimeoPatterns.some(pattern => pattern.test(url));
  }

  // Detectar URLs de video directo
  isVideoURL(url) {
    const videoExtensions = /\.(mp4|webm|ogg|mov|avi)$/i;
    return videoExtensions.test(url) || url.includes('video');
  }

  // Extraer ID de video de YouTube
  extractYouTubeId(url) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
      /youtube\.com\/embed\/([^&\n?#]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  // Extraer ID de video de Vimeo
  extractVimeoId(url) {
    const match = url.match(/vimeo\.com\/(\d+)/);
    return match ? match[1] : null;
  }

  // Renderizar embed de YouTube
  renderYouTubeEmbed(url, titulo) {
    const videoId = this.extractYouTubeId(url);
    if (!videoId) return this.renderErrorMedia(url, 'YouTube ID no encontrado');

    return `
      <div class="video-embed-container">
        <div class="video-embed-wrapper">
          <iframe 
            src="https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&showinfo=0" 
            title="${titulo} - Video de YouTube"
            frameborder="0" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
            allowfullscreen
            loading="lazy">
          </iframe>
        </div>
        <div class="video-caption">📺 ${titulo} - Video de YouTube</div>
      </div>
    `;
  }

  // Renderizar embed de Vimeo
  renderVimeoEmbed(url, titulo) {
    const videoId = this.extractVimeoId(url);
    if (!videoId) return this.renderErrorMedia(url, 'Vimeo ID no encontrado');

    return `
      <div class="video-embed-container">
        <div class="video-embed-wrapper">
          <iframe 
            src="https://player.vimeo.com/video/${videoId}?title=0&byline=0&portrait=0" 
            title="${titulo} - Video de Vimeo"
            frameborder="0" 
            allow="autoplay; fullscreen; picture-in-picture" 
            allowfullscreen
            loading="lazy">
          </iframe>
        </div>
        <div class="video-caption">🎬 ${titulo} - Video de Vimeo</div>
      </div>
    `;
  }

  // Renderizar video directo
  renderDirectVideo(url, titulo) {
    return `
      <div class="video-container">
        <video controls class="entrada-video" preload="metadata" title="${titulo}">
          <source src="${url}" type="video/mp4">
          Tu navegador no soporta video HTML5.
        </video>
        <div class="video-caption">🎥 Proceso creativo en acción</div>
      </div>
    `;
  }

  // Renderizar imagen
  renderImage(url, titulo) {
    return `
      <div class="photo-polaroid">
        <img src="${url}" 
             alt="${titulo}" 
             class="entrada-imagen"
             loading="lazy"
             onerror="this.closest('.photo-polaroid').style.display='none'">
        <div class="polaroid-caption">✨ Momento especial de Patofelting</div>
      </div>
    `;
  }

  // Renderizar error de media
  renderErrorMedia(url, error) {
    console.warn(`Error procesando media: ${error} - URL: ${url}`);
    return `
      <div class="media-error">
        <div class="error-content">
          <span class="error-icon">⚠️</span>
          <p>No se pudo cargar el contenido multimedia</p>
          <small>${error}</small>
        </div>
      </div>
    `;
  }

  // Renderizar call-to-action para la entrada destacada
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

  // Mostrar mensaje cuando no hay entradas
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

  // Mostrar mensaje de error
  mostrarMensajeError() {
    const contenedor = document.querySelector('.blog-main');
    if (contenedor) {
      contenedor.innerHTML = `
        <div class="error-state">
          <div class="notebook-page">
            <div class="red-margin"></div>
            <div class="entry-content">
              <h2>¡Ups! Algo salió mal</h2>
              <p>No pude cargar las entradas del blog en este momento. Por favor, intenta recargar la página.</p>
              <button onclick="location.reload()" class="cta-button-blog">🔄 Reintentar</button>
              <br><br>
              <p><small>Si el problema persiste, puedes contactarme directamente.</small></p>
            </div>
          </div>
        </div>
      `;
    }
  }

  // Aplicar efectos después del renderizado
  aplicarEfectosPostRenderizado() {
    // Re-observar elementos para lazy loading
    this.addImageLazyLoading();
    this.addVideoPlayPause();
    
    // Añadir efectos de entrada
    document.querySelectorAll('.blog-entry').forEach((entry, index) => {
      setTimeout(() => {
        entry.classList.add('fade-in');
      }, index * 200);
    });
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
        const currentRotation = element.style.transform.match(/rotate\(([^)]+)\)/);
        const rotation = currentRotation ? currentRotation[1] : '0deg';
        element.style.transform = `translateY(${yPos}px) rotate(${rotation})`;
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
            }
            img.classList.add('loaded');
            imageObserver.unobserve(img);
          }
        });
      },
      { threshold: 0.1 }
    );

    document.querySelectorAll('img[data-src], .entrada-imagen').forEach(img => {
      imageObserver.observe(img);
    });
  }

  // ========== CONTROL DE VIDEOS ==========
  addVideoPlayPause() {
    document.querySelectorAll('video, .entrada-video').forEach(video => {
      // Reproducir cuando esté visible
      const videoObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              video.play().catch(e => console.log('Video autoplay prevented:', e));
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

      // Añadir controles personalizados
      video.addEventListener('loadedmetadata', () => {
        video.setAttribute('aria-label', `Video: ${video.closest('.blog-entry')?.querySelector('.entry-title')?.textContent || 'Contenido del blog'}`);
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
      
      .empty-state, .error-state {
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
        background: var(--primary-color);
        border-radius: 50%;
        animation: bounce 1.5s infinite;
      }
      
      .needle {
        width: 2px;
        height: 40px;
        background: var(--gray-500);
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

  // ========== MÉTODO PÚBLICO PARA RECARGAR ==========
  async recargar() {
    console.log('🔄 Recargando entradas del blog...');
    await this.cargarEntradasDesdeCSV();
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
        
        // Integración con Google Analytics si está disponible
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

// ========== INICIALIZACIÓN ==========
let blogManager;

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Iniciando Blog de Patofelting...');
  
  // Crear instancia del gestor del blog
  blogManager = new BlogManager();
  
  // Crear integración con e-commerce
  new BlogEcommerceIntegration();
  
  // Mostrar tiempo de lectura estimado después de cargar
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
  }, 2000);

  // Recarga automática del blog cada minuto
  setInterval(() => {
    if (blogManager) {
      blogManager.recargar();
    }
  }, 60000);

  console.log('✨ Blog de Patofelting cargado correctamente');
});

// ========== EXPORTAR PARA USO GLOBAL ==========
window.BlogUtils = BlogUtils;
window.recargarBlog = () => {
  if (blogManager) {
    blogManager.recargar();
  }
};
