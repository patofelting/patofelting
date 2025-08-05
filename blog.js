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
      console.log('📄 CSV recibido (primeros 500 caracteres):', texto.substring(0, 500));

      let filas;
      if (typeof Papa !== 'undefined') {
        const resultado = Papa.parse(texto, {
          header: true,
          skipEmptyLines: true,
          transform: (value) => value.trim(),
        });
        filas = resultado.data;
        console.log('📊 Filas parseadas con PapaParse:', filas);
      } else {
        filas = this.parseCSVManual(texto);
        console.log('📊 Filas parseadas manualmente:', filas);
      }

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
  imagenes: this.limpiarURLs(fila.imagenPrincipal || fila.imagenes || ''),
  videos: this.limpiarURLs(fila.videoURL || fila.videos || ''),
  orden: parseInt(fila.orden) || 0,
  categoria: fila.categoria || 'general',
  postit: fila.postit || '', // ✅ nuevo campo
  ordenpostit: parseInt(fila.ordenpostit) || 0 // ✅ nuevo campo
};
console.log('✅ Entrada procesada:', entrada);
return entrada;
        })
        .sort((a, b) => {
          if (a.orden !== 0 && b.orden !== 0) return a.orden - b.orden;
          const dateA = new Date(a.fechaRaw);
          const dateB = new Date(b.fechaRaw);
          return dateB - dateA; // Orden descendente por fecha (nuevo primero)
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

  // Limpiar y validar URLs
  limpiarURLs(urlsString) {
    if (!urlsString) return [];
    return urlsString
      .split(',')
      .map((url) => url.trim())
      .filter((url) => url && url.match(/\.(jpeg|jpg|png|gif|mp4)$/i));
  }

  // Parser CSV manual
  parseCSVManual(texto) {
    const lineas = texto.trim().split('\n');
    const headers = lineas[0].split(',').map((h) => h.trim().replace(/"/g, ''));

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

  formatearFecha(fechaString) {
    if (!fechaString) return new Date().toLocaleDateString('es-ES');
    try {
      let fecha;
      if (fechaString.includes('/')) {
        const partes = fechaString.split('/');
        if (partes.length === 3) {
          fecha = new Date(partes[2], partes[1] - 1, partes[0]);
        }
      } else if (fechaString.includes('-')) {
        fecha = new Date(fechaString);
      } else {
        fecha = new Date(fechaString);
      }

      if (isNaN(fecha.getTime())) {
        throw new Error('Fecha inválida');
      }

      return fecha.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch (error) {
      console.warn('⚠️ Error al formatear fecha:', fechaString);
      return fechaString;
    }
  }

// ========== RENDERIZADO DEL BLOG ==========
renderizarBlog() {
  const contenedor = document.querySelector('.blog-main');
  if (!contenedor) {
    console.error('❌ No se encontró el contenedor .blog-main');
    return;
  }

  // 1. Crear sección de post-its si existen
  const postits = this.entradas
    .filter(e => e.postit && e.postit.trim() !== '')
    .sort((a, b) => a.ordenpostit - b.ordenpostit);

  let postitHTML = '';
  if (postits.length > 0) {
    postitHTML += `<section class="postit-section">`;
    postits.forEach(postit => {
      postitHTML += `
        <div class="postit">
          ${postit.postit}
        </div>
      `;
    });
    postitHTML += `</section>`;
  }

  // 2. Renderizar entradas del blog
  const entradasHTML = this.entradas
    .map((entrada, index) => this.renderEntradaBlog(entrada, index))
    .join('');

  // 3. Combinar y volcar en el contenedor
  contenedor.innerHTML = postitHTML + entradasHTML;

  // 4. Aplicar efectos y hacer los post-its arrastrables
  setTimeout(() => {
    this.aplicarEfectosPostRenderizado();
    hacerPostitsArrastrables(); // ✅ se activa el arrastre
  }, 100);
}

// ========== RENDER DE CADA ENTRADA ==========
renderEntradaBlog(entrada, index) {
  const esDestacada = index === 0; // La primera entrada (más reciente) es destacada
  const template = document.getElementById('entry-template');
  if (!template) {
    console.error('❌ No se encontró el template #entry-template');
    return '';
  }

  const clone = template.content.cloneNode(true);
  const article = clone.querySelector('.blog-entry');
  article.setAttribute('data-entry-id', entrada.id);

  const notebookPage = article.querySelector('.notebook-page');
  const entryContent = article.querySelector('.entry-content');

  entryContent.innerHTML = `
    <div class="entry-date">${entrada.fecha}</div>
    <h2 class="entry-title">${entrada.titulo}</h2>
    <div class="entry-text">${this.procesarContenido(entrada.contenido)}</div>
    ${this.renderMediaContent(entrada)}
  `;

  if (esDestacada) {
    article.classList.add('featured');
  }

  return article.outerHTML;
}

// ========== FORMATEAR CONTENIDO DE TEXTO ==========
procesarContenido(contenido) {
  if (!contenido) return '<p>Sin contenido disponible.</p>';
  if (contenido.includes('<') && contenido.includes('>')) {
    return contenido; // ya viene con HTML
  }
  return contenido
    .split('\n')
    .filter((parrafo) => parrafo.trim() !== '')
    .map((parrafo) => `<p>${parrafo.trim()}</p>`)
    .join('');
}

 renderMediaContent(entrada) {
  console.log('Imágenes procesadas:', entrada.imagenes);
  let mediaHTML = '<div class="media-gallery">';
  if (entrada.imagenes.length > 0) {
    if (entrada.imagenes.length > 1) {
      mediaHTML += '<div class="carousel">';
      entrada.imagenes.forEach((url, idx) => {
        console.log('Añadiendo imagen:', url);
        mediaHTML += `
          <div class="carousel-item ${idx === 0 ? 'active' : ''}">
            <div class="photo-polaroid">
              <img src="${url}" alt="${entrada.titulo} - Imagen ${idx + 1}" class="entrada-imagen" loading="lazy" onerror="this.closest('.photo-polaroid').classList.add('image-error'); this.style.display='none';">
              <div class="polaroid-caption">Momento especial de Patofelting ✨</div>
            </div>
          </div>
        `;
      });
      mediaHTML += `
        <button class="carousel-prev">❮</button>
        <button class="carousel-next">❯</button>
      </div>`;
    } else {
      mediaHTML += `
        <div class="photo-polaroid">
          <img src="${entrada.imagenes[0]}" alt="${entrada.titulo}" class="entrada-imagen" loading="lazy" onerror="this.closest('.photo-polaroid').classList.add('image-error'); this.style.display='none';">
          <div class="polaroid-caption">Momento especial de Patofelting ✨</div>
        </div>
      `;
    }
  }
  if (entrada.videos.length > 0) {
    mediaHTML += `
      <div class="video-container">
        <video controls class="entrada-video" preload="metadata">
          <source src="${entrada.videos[0]}" type="video/mp4">
          Tu navegador no soporta video HTML5.
        </video>
        <div class="video-caption">Proceso creativo en acción 🎬</div>
      </div>
    `;
  }
  mediaHTML += '</div>';
  return mediaHTML || '';
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

  aplicarEfectosPostRenderizado() {
    this.addImageLazyLoading();
    this.addVideoPlayPause();
    this.initializeCarousel();

    document.querySelectorAll('.blog-entry').forEach((entry, index) => {
      setTimeout(() => {
        entry.classList.add('fade-in');
      }, index * 200);
    });
  }

  // Inicializar carrusel básico
  initializeCarousel() {
    document.querySelectorAll('.carousel').forEach((carousel) => {
      const items = carousel.querySelectorAll('.carousel-item');
      const prevBtn = carousel.querySelector('.carousel-prev');
      const nextBtn = carousel.querySelector('.carousel-next');
      let currentIndex = 0;

      if (items.length <= 1) {
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        return;
      }

      function updateCarousel() {
        items.forEach((item, index) => {
          item.classList.toggle('active', index === currentIndex);
        });
      }

      prevBtn.addEventListener('click', () => {
        currentIndex = (currentIndex > 0) ? currentIndex - 1 : items.length - 1;
        updateCarousel();
      });

      nextBtn.addEventListener('click', () => {
        currentIndex = (currentIndex < items.length - 1) ? currentIndex + 1 : 0;
        updateCarousel();
      });

      updateCarousel();
    });
  }

  // ========== EFECTOS DE SCROLL ==========
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

    document.querySelectorAll('.blog-entry').forEach((entry) => {
      observer.observe(entry);
    });

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

  // ========== LAZY LOADING DE IMÁGENES ==========
  addImageLazyLoading() {
    const imageObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
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

    document.querySelectorAll('img[data-src], .entrada-imagen').forEach((img) => {
      imageObserver.observe(img);
    });
  }

  // ========== CONTROL DE VIDEOS ==========
  addVideoPlayPause() {
    document.querySelectorAll('video, .entrada-video').forEach((video) => {
      const videoObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              video.play().catch((e) => console.log('Video autoplay prevented:', e));
            } else {
              video.pause();
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

  // ========== INTERACCIONES TÁCTILES ==========
  addTouchInteractions() {
    document.querySelectorAll('.photo-polaroid').forEach((polaroid) => {
      polaroid.addEventListener('touchstart', (e) => {
        polaroid.style.transform = 'rotate(0deg) scale(1.05)';
      });

      polaroid.addEventListener('touchend', (e) => {
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

  blogManager = new BlogManager();
  new BlogEcommerceIntegration();

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

  setInterval(() => {
    if (blogManager) {
      blogManager.recargar();
    }
  }, 60000);

  console.log('✨ Blog de Patofelting cargado correctamente');
});

window.BlogUtils = BlogUtils;
window.recargarBlog = () => {
  if (blogManager) {
    blogManager.recargar();
  }
};


function hacerPostitsArrastrables() {
  const postits = document.querySelectorAll('.postit');

  postits.forEach((postit, index) => {
    const id = `postit-${index}`;
    let isDragging = false;
    let startX = 0, startY = 0;
    let currentX = 0, currentY = 0;

    // Restaurar posición guardada
    const saved = JSON.parse(localStorage.getItem(id));
    if (saved) {
      currentX = saved.x;
      currentY = saved.y;
      postit.style.transform = `translate(${currentX}px, ${currentY}px)`;
    }

    const startDrag = (x, y) => {
      isDragging = true;
      startX = x - currentX;
      startY = y - currentY;
      postit.style.cursor = 'grabbing';
    };

    const moveDrag = (x, y) => {
      if (!isDragging) return;
      currentX = x - startX;
      currentY = y - startY;
      postit.style.transform = `translate(${currentX}px, ${currentY}px)`;
    };

    const endDrag = () => {
      if (!isDragging) return;
      isDragging = false;
      postit.style.cursor = 'grab';
      localStorage.setItem(id, JSON.stringify({ x: currentX, y: currentY }));
    };

    // Mouse
    postit.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startDrag(e.clientX, e.clientY);
    });

    document.addEventListener('mousemove', (e) => {
      moveDrag(e.clientX, e.clientY);
    });

    document.addEventListener('mouseup', () => {
      endDrag();
    });

    // Touch
    postit.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      startDrag(touch.clientX, touch.clientY);
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      moveDrag(touch.clientX, touch.clientY);
    }, { passive: false });

    document.addEventListener('touchend', () => {
      endDrag();
    });
  });
}


// Función para convertir RGB a hexadecimal
function rgbToHex(rgb) {
  if (!rgb) return null;
  const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!match) return rgb; // Si no es RGB, devolver el valor original
  const r = parseInt(match[1]).toString(16).padStart(2, '0');
  const g = parseInt(match[2]).toString(16).padStart(2, '0');
  const b = parseInt(match[3]).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function inicializarPostits() {
  const colores = ['#fff89a', '#ffdab9', '#c8f7dc', '#add8e6', '#ffc0cb'];

  document.querySelectorAll('.postit').forEach((postit, index) => {
    const id = `postit-${index}`;
    let isDragging = false;
    let startX = 0, startY = 0;
    let currentX = 0, currentY = 0;
    let lastTap = 0;

    // Restaurar posición guardada
    const saved = JSON.parse(localStorage.getItem(id));
    if (saved) {
      currentX = saved.x;
      currentY = saved.y;
      postit.style.transform = `translate(${currentX}px, ${currentY}px)`;
    }

    // Restaurar color guardado
    const colorGuardado = localStorage.getItem(`${id}-color`);
    if (colorGuardado) {
      postit.style.backgroundColor = colorGuardado;
    }

    // Función para cambiar color
    const cambiarColor = () => {
      const colorActual = rgbToHex(postit.style.backgroundColor) || colores[0];
      const actualIndex = colores.findIndex(c => c.toLowerCase() === colorActual.toLowerCase());
      const siguienteColor = colores[(actualIndex + 1) % colores.length];
      postit.style.backgroundColor = siguienteColor;
      localStorage.setItem(`${id}-color`, siguienteColor);
      console.log(`Postit ${id} cambió a color ${siguienteColor}`);
    };

    // Arrastrar: Mouse
    postit.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isDragging = true;
      startX = e.clientX - currentX;
      startY = e.clientY - currentY;
      postit.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      currentX = e.clientX - startX;
      currentY = e.clientY - startY;
      postit.style.transform = `translate(${currentX}px, ${currentY}px)`;
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      postit.style.cursor = 'grab';
      localStorage.setItem(id, JSON.stringify({ x: currentX, y: currentY }));
    });

    // Doble clic para cambio de color
    postit.addEventListener('dblclick', (e) => {
      e.preventDefault();
      cambiarColor();
    });

    // Arrastrar y doble toque: Touch
    postit.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTap;

      // Detectar doble toque
      if (tapLength < 300 && tapLength > 0) {
        e.preventDefault();
        cambiarColor();
      } else {
        // Iniciar arrastre
        e.preventDefault();
        isDragging = true;
        startX = touch.clientX - currentX;
        startY = touch.clientY - currentY;
        postit.style.cursor = 'grabbing';
      }
      lastTap = currentTime;
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      const touch = e.touches[0];
      currentX = touch.clientX - startX;
      currentY = touch.clientY - startY;
      postit.style.transform = `translate(${currentX}px, ${currentY}px)`;
    }, { passive: false });

    document.addEventListener('touchend', () => {
      if (!isDragging) return;
      isDragging = false;
      postit.style.cursor = 'grab';
      localStorage.setItem(id, JSON.stringify({ x: currentX, y: currentY }));
    });
  });
}

// Ejecutar cuando el DOM esté cargado
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM cargado, inicializando post-its...');
  console.log(`Número de post-its encontrados: ${document.querySelectorAll('.postit').length}`);
  inicializarPostits();
});
setTimeout(() => {
  if (typeof aplicarEfectosPostRenderizado === 'function') {
    aplicarEfectosPostRenderizado();
  } else if (window.blogManager && typeof blogManager.aplicarEfectosPostRenderizado === 'function') {
    blogManager.aplicarEfectosPostRenderizado();
  }
  hacerPostitsArrastrables();
  activarCambioDeColorEnPostits();
}, 100);

