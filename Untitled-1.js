// ========== CONFIGURACIÓN DEL BLOG CON GOOGLE SHEETS ==========
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJwvzHZQN3CQarSDqjk_nShegf8F4ydARvkSK55VabxbCi9m8RuGf2Nyy9ScriFRfGdhZd0P54VS5z/pub?output=csv';

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
          imagenPrincipal: this.limpiarURLsImagenes(fila.imagenPrincipal || ''),
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
      this.entradas.forEach((entrada, index) => {
        console.log(`📝 Entrada ${index + 1}:`, {
          titulo: entrada.titulo,
          imagenes: entrada.imagenPrincipal ? entrada.imagenPrincipal.split(',').length : 0,
          urls: entrada.imagenPrincipal
        });
      });
      
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

  // Limpiar y validar URLs de imágenes
  limpiarURLsImagenes(urlsString) {
    if (!urlsString || urlsString.trim() === '') return '';
    
    console.log('🧹 Limpiando URLs de imágenes:', urlsString);
    
    // Dividir por comas y saltos de línea
    const urls = urlsString
      .split(/[,\n]+/)
      .map(url => {
        // Limpiar la URL
        let cleanUrl = url.trim()
          .replace(/^["']|["']$/g, '') // Remover comillas al inicio y final
          .replace(/\s+/g, '') // Remover espacios
          .trim();
        
        // Validar que sea una URL válida
        if (cleanUrl && (
          cleanUrl.startsWith('http://') || 
          cleanUrl.startsWith('https://') ||
          cleanUrl.startsWith('//') // URLs protocol-relative
        )) {
          console.log('✅ URL válida encontrada:', cleanUrl);
          return cleanUrl;
        } else if (cleanUrl) {
          console.warn('⚠️ URL inválida ignorada:', cleanUrl);
        }
        
        return null;
      })
      .filter(url => url !== null);
    
    const resultado = urls.join(',');
    console.log('🎯 URLs finales:', resultado);
    
    return resultado;
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

  // Renderizar contenido multimedia (soporta varias imágenes separadas por coma)
  renderMediaContent(entrada) {
    let mediaHTML = '';
    
    if (entrada.imagenPrincipal || entrada.videoURL) {
      mediaHTML += '<div class="media-gallery">';
      
      // Soporta múltiples imágenes separadas por coma
      if (entrada.imagenPrincipal) {
        const imagenes = entrada.imagenPrincipal
          .split(/[,\n]+/) // separa por coma o salto de línea
          .map(url => url.trim()) // elimina espacios
          .filter(url => url.length > 0 && url !== ''); // ignora vacíos
          
        console.log('🖼️ Imágenes encontradas:', imagenes);
        
        imagenes.forEach((url, index) => {
          // Limpiar la URL de comillas y espacios extra
          const cleanUrl = url.replace(/["']/g, '').trim();
          
          console.log(`🔗 Procesando imagen ${index + 1}:`, cleanUrl);
          
          mediaHTML += `
            <div class="photo-polaroid">
              <img src="${cleanUrl}" 
                   alt="${entrada.titulo}" 
                   class="entrada-imagen"
                   loading="lazy"
                   onerror="this.style.display='none'; console.error('Error cargando imagen:', this.src);"
                   onload="console.log('✅ Imagen cargada correctamente:', this.src);">
              <div class="polaroid-caption">Momento especial de Patofelting ✨</div>
            </div>
          `;
        });
      }
      
      if (entrada.videoURL) {
        mediaHTML += `
          <div class="video-container">
            <video controls class="entrada-video" preload="metadata">
              <source src="${entrada.videoURL}" type="video/mp4">
              Tu navegador no soporta video HTML5.
            </video>
            <div class="video-caption">Proceso creativo en acción 🎬</div>
          </div>
        `;
      }
      
      mediaHTML += '</div>';
    }
    
    return mediaHTML;
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

  // ========== APLICAR EFECTOS DESPUÉS DEL RENDERIZADO ==========
  aplicarEfectosPostRenderizado() {
    // Re-observar elementos para lazy loading
    this.addImageLazyLoading();
    this.addVideoPlayPause();
    
    // Debug de imágenes
    this.debugImageUrls();
    
    // Añadir efectos de entrada
    document.querySelectorAll('.blog-entry').forEach((entry, index) => {
      setTimeout(() => {
        entry.classList.add('fade-in');
      }, index * 200);
    });
  }

  // Función de debug para URLs de imágenes
  debugImageUrls() {
    console.log('🔍 Debugeando URLs de imágenes...');
    
    document.querySelectorAll('img').forEach((img, index) => {
      console.log(`Imagen ${index + 1}:`, {
        src: img.src,
        alt: img.alt,
        className: img.className,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        complete: img.complete
      });
      
      // Verificar si es una URL de Google/Imgur
      if (img.src.includes('imgur.com') || 
          img.src.includes('googleusercontent.com') || 
          img.src.includes('drive.google.com')) {
        console.log('📸 URL de servicio externo detectada:', img.src);
        
        // Añadir un timeout para verificar si carga
        setTimeout(() => {
          if (!img.complete || img.naturalWidth === 0) {
            console.warn('⚠️ Imagen no cargó correctamente:', img.src);
            this.handleImageError(img);
          }
        }, 5000);
      }
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
            
            // Si tiene data-src, usarlo (lazy loading)
            if (img.dataset.src) {
              img.src = img.dataset.src;
              img.removeAttribute('data-src');
            }
            
            // Añadir manejadores de eventos para debug
            img.addEventListener('load', () => {
              console.log('✅ Imagen cargada correctamente:', img.src);
              img.classList.add('loaded');
            });
            
            img.addEventListener('error', (e) => {
              console.error('❌ Error cargando imagen:', img.src);
              this.handleImageError(img);
            });
            
            imageObserver.unobserve(img);
          }
        });
      },
      { threshold: 0.1 }
    );

    // Observar todas las imágenes
    document.querySelectorAll('img[data-src], .entrada-imagen, img').forEach(img => {
      imageObserver.observe(img);
    });
  }

  // Manejar errores de carga de imágenes
  handleImageError(img) {
    console.warn('🔄 Intentando cargar imagen con diferentes métodos:', img.src);
    
    // Crear un placeholder
    const placeholder = document.createElement('div');
    placeholder.className = 'image-placeholder';
    placeholder.innerHTML = `
      <div class="placeholder-content">
        <span class="placeholder-icon">🖼️</span>
        <p>Imagen no disponible</p>
        <small>URL: ${img.src}</small>
      </div>
    `;
    
    // Reemplazar la imagen con el placeholder
    img.parentNode.replaceChild(placeholder, img);
    
    // Añadir estilos al placeholder
    if (!document.querySelector('#image-placeholder-styles')) {
      const style = document.createElement('style');
      style.id = 'image-placeholder-styles';
      style.textContent = `
        .image-placeholder {
          width: 100%;
          height: 200px;
          background: var(--paper-white);
          border: 2px dashed var(--line-blue);
          border-radius: var(--border-radius);
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          color: var(--pencil-gray);
          font-family: var(--font-handwritten);
        }
        
        .placeholder-content {
          padding: 1rem;
        }
        
        .placeholder-icon {
          font-size: 2rem;
          display: block;
          margin-bottom: 0.5rem;
        }
        
        .placeholder-content p {
          margin: 0.5rem 0;
          font-weight: 600;
        }
        
        .placeholder-content small {
          font-size: 0.8rem;
          opacity: 0.7;
          word-break: break-all;
        }
      `;
      document.head.appendChild(style);
    }
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
