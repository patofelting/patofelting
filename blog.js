class BlogUtils {
  static formatearFecha(fecha) {
    if (!fecha) return '';
    const [day, month, year] = fecha.split('/');
    return `${day}/${month}/${year}`;
  }

  static mostrarMensajeError() {
    const contenedor = document.getElementById('main-content');
    if (!contenedor) return;

    contenedor.innerHTML = `
      <div class="blog-error">
        <span class="error-icon">❌</span>
        <div class="error-message">Hubo un error al cargar las entradas. Por favor, intenta de nuevo.</div>
        <button class="retry-button" onclick="window.recargarBlog()">Reintentar</button>
      </div>
    `;
  }

  static mostrarMensajeVacio() {
    const contenedor = document.getElementById('main-content');
    if (!contenedor) return;

    contenedor.innerHTML = `
      <div class="blog-error">
        <span class="error-icon">📝</span>
        <div class="error-message">No hay historias para mostrar aún. ¡Vuelve pronto!</div>
      </div>
    `;
  }

  static limpiarURLs(urls) {
    return urls.split(',').map(url => url.trim()).filter(url => url);
  }

  static shareOnSocial(platform, text, url = window.location.href) {
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
    this.initializePostitColors();
  }

  // ========== CARGA DE DATOS DESDE GOOGLE SHEETS ==========
  async cargarEntradasDesdeCSV() {
    try {
      console.log('🔄 Cargando entradas del blog desde Google Sheets...');
      console.log('📍 URL:', CSV_URL);

      const respuesta = await fetch(CSV_URL, { cache: 'reload' });
      if (!respuesta.ok) {
        throw new Error(`HTTP error! status: ${respuesta.status} - ${respuesta.statusText}`);
      }

      const texto = await respuesta.text();
      console.log('📄 CSV recibido:', texto.substring(0, 500));

      const resultado = Papa.parse(texto, {
        header: true,
        skipEmptyLines: true,
        transform: (value) => value.trim(),
      });

      this.entradas = resultado.data
        .filter((fila) => fila.titulo && fila.contenido)
        .map((fila, i) => ({
          id: fila.id || i.toString(),
          fecha: fila.fecha || '',
          titulo: fila.titulo,
          contenido: fila.contenido,
          imagenes: BlogUtils.limpiarURLs(fila.imagenPrincipal || ''),
          videos: BlogUtils.limpiarURLs(fila.videoURL || ''),
          orden: parseInt(fila.orden) || 0,
          postit: fila.postit || '',
          ordenpostit: parseInt(fila.ordenpostit) || 0,
        }))
        .sort((a, b) => a.orden - b.orden);

      console.log('✅ Entradas procesadas:', this.entradas.length);
      this.renderizarBlog();

    } catch (error) {
      console.error('❌ Error al cargar CSV:', error.message);
      BlogUtils.mostrarMensajeError();
    }
  }

  // ========== RENDERIZADO DEL BLOG ==========
  renderizarBlog() {
    const contenedor = document.getElementById('main-content');
    const template = document.getElementById('entry-template');
    const loader = document.getElementById('blog-loading');

    if (!contenedor) {
      console.error('❌ No se encontró el contenedor principal. Verifica el ID "main-content" en el HTML.');
      return;
    }

    if (!template || !template.content) {
      console.error('❌ No se encontró el template para las entradas. Verifica el ID "entry-template" en el HTML.');
      BlogUtils.mostrarMensajeError();
      return;
    }

    if (loader) loader.style.display = 'none';
    contenedor.innerHTML = '';

    if (this.entradas.length === 0) {
      BlogUtils.mostrarMensajeVacio();
      return;
    }

    this.entradas.forEach((entrada) => {
      const clone = template.content.cloneNode(true);
      const entryElement = clone.querySelector('.blog-entry');
      entryElement.setAttribute('data-entry-id', entrada.id);

      // Título y fecha
      clone.querySelector('.entry-title').textContent = entrada.titulo;
      clone.querySelector('.entry-date').textContent = BlogUtils.formatearFecha(entrada.fecha);

      // Contenido
      const textoContainer = clone.querySelector('.entry-text');
      entrada.contenido.split('\n').forEach(linea => {
        if (linea.trim()) {
          const p = document.createElement('p');
          p.className = 'notebook-line';
          p.textContent = linea.trim();
          textoContainer.appendChild(p);
        }
      });

      // Efecto de libro para imágenes
      const mediaBook = clone.querySelector('.media-book');
      if (entrada.imagenes && entrada.imagenes.length > 0) {
        entrada.imagenes.forEach(url => {
          const page = document.createElement('div');
          page.className = 'book-page';
          const img = document.createElement('img');
          img.src = url;
          img.alt = entrada.titulo;
          img.loading = 'lazy';
          img.classList.add('entrada-imagen');
          img.onerror = () => {
            img.style.display = 'none';
            console.error(`Error al cargar imagen: ${url}`);
          };
          page.appendChild(img);
          mediaBook.appendChild(page);
        });
      }

      // Videos
      if (entrada.videos && entrada.videos.length > 0) {
        const mediaBook = clone.querySelector('.media-book');
        entrada.videos.forEach(url => {
          const video = document.createElement('iframe');
          video.src = url;
          video.frameBorder = '0';
          video.allowFullscreen = true;
          video.classList.add('entrada-video');
          mediaBook.appendChild(video);
        });
      }

      // Post-it con arrastrar y soltar
      if (entrada.postit) {
        const postitContainer = clone.querySelector('.postit-container');
        const postit = document.createElement('div');
        postit.className = 'postit';
        postit.textContent = entrada.postit;
        postit.setAttribute('draggable', 'true');
        postitContainer.appendChild(postit);

        // Inicializar arrastrar y soltar
        postit.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', postit.outerHTML);
          postit.classList.add('dragging');
        });

        postit.addEventListener('dragend', () => {
          postit.classList.remove('dragging');
        });

        entryElement.addEventListener('dragover', (e) => {
          e.preventDefault();
        });

        entryElement.addEventListener('drop', (e) => {
          e.preventDefault();
          const data = e.dataTransfer.getData('text/plain');
          const draggedPostit = document.createElement('div');
          draggedPostit.innerHTML = data;
          const newPostit = draggedPostit.querySelector('.postit');
          newPostit.style.position = 'absolute';
          newPostit.style.left = `${e.pageX - entryElement.offsetLeft}px`;
          newPostit.style.top = `${e.pageY - entryElement.offsetTop}px`;
          entryElement.appendChild(newPostit);
          postit.remove(); // Remover el original si se suelta
        });
      }

      contenedor.appendChild(clone);
    });

    // Añadir colores al post-it después de renderizar
    this.initializePostitColors();
  }

  // Método existente para colores de post-it (ajustado)
  initializePostitColors() {
    document.querySelectorAll('.postit').forEach(postit => {
      const colorOptions = document.createElement('div');
      colorOptions.className = 'postit-color-options';
      ['yellow', 'pink', 'green', 'blue'].forEach(color => {
        const option = document.createElement('div');
        option.id = `color-${color}`;
        option.className = 'color-option';
        option.addEventListener('click', () => {
          postit.style.background = getComputedStyle(document.getElementById(`color-${color}`)).backgroundColor;
        });
        colorOptions.appendChild(option);
      });
      postit.appendChild(colorOptions);

      // Mostrar/ocultar colores con mouseleave
      postit.addEventListener('mouseenter', () => {
        colorOptions.style.display = 'block';
      });
      postit.addEventListener('mouseleave', () => {
        setTimeout(() => {
          if (!postit.matches(':hover')) {
            colorOptions.style.display = 'none';
          }
        }, 500); // 0.5 segundos de retraso
      });
    });
  }

  // Otros métodos (addScrollEffects, addImageLazyLoading, etc.) pueden permanecer sin cambios si están definidos...
}

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

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJwvzHZQN3CQarSDqjk_nShegf8F4ydARvkSK55VabxbCi9m8RuGf2Nyy9ScriFRfGdhZd0P54VS5z/pub?gid=127717360&single=true&output=csv';

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
    if (blogManager && blogManager.entradas.length > 0) {
      console.log('🔄 Intentando recargar entradas...');
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
