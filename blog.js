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

  // Initialize carousel for a specific media-book container
  static initCarousel(mediaBook, images) {
    if (!mediaBook || images.length === 0) return;

    const carousel = mediaBook.querySelector('.carousel');
    if (!carousel) return;

    const items = carousel.querySelectorAll('.carousel-item');
    const prevButton = carousel.querySelector('.carousel-prev');
    const nextButton = carousel.querySelector('.carousel-next');
    let currentIndex = 0;

    if (images.length <= 1) {
      prevButton.style.display = 'none';
      nextButton.style.display = 'none';
      return;
    }

    const showItem = (index) => {
      items.forEach((item, i) => {
        item.classList.toggle('active', i === index);
      });
    };

    prevButton.addEventListener('click', () => {
      currentIndex = (currentIndex - 1 + items.length) % items.length;
      showItem(currentIndex);
    });

    nextButton.addEventListener('click', () => {
      currentIndex = (currentIndex + 1) % items.length;
      showItem(currentIndex);
    });

    showItem(currentIndex);
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
        const carousel = document.createElement('div');
        carousel.className = 'carousel';
        entrada.imagenes.forEach((url, index) => {
          const item = document.createElement('div');
          item.className = `carousel-item ${index === 0 ? 'active' : ''}`;
          const polaroid = document.createElement('div');
          polaroid.className = 'photo-polaroid';
          const img = document.createElement('img');
          img.src = url;
          img.alt = entrada.titulo;
          img.loading = 'lazy';
          img.classList.add('entrada-imagen');
          img.onerror = () => {
            polaroid.classList.add('image-error');
            img.style.display = 'none';
            console.error(`Error al cargar imagen: ${url}`);
          };
          polaroid.appendChild(img);
          item.appendChild(polaroid);
          carousel.appendChild(item);
        });

        // Add navigation buttons
        if (entrada.imagenes.length > 1) {
          const prevButton = document.createElement('button');
          prevButton.className = 'carousel-prev';
          prevButton.innerHTML = '◄';
          const nextButton = document.createElement('button');
          nextButton.className = 'carousel-next';
          nextButton.innerHTML = '►';
          carousel.appendChild(prevButton);
          carousel.appendChild(nextButton);
        }

        mediaBook.appendChild(carousel);
        BlogUtils.initCarousel(mediaBook, entrada.imagenes);
      }

      // Videos
      if (entrada.videos && entrada.videos.length > 0) {
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
        postit.setAttribute('data-id', entrada.id);
        postitContainer.appendChild(postit);

        // Initialize drag-and-drop and color change
        this.initializePostitDrag(postit, entryElement);
      }

      contenedor.appendChild(clone);
    });

    // Añadir colores al post-it después de renderizar
    this.initializePostitColors();
  }

  initializePostitDrag(postit, entryElement) {
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    // Restore saved position and color
    const saved = localStorage.getItem(`postit_${postit.dataset.id}`);
    if (saved) {
      const data = JSON.parse(saved);
      if (data.left) postit.style.left = data.left;
      if (data.top) postit.style.top = data.top;
      if (data.color) postit.style.background = data.color;
    }

    postit.addEventListener('mousedown', startDragging);
    postit.addEventListener('touchstart', startDragging);

    function startDragging(e) {
      e.preventDefault();
      postit.classList.add('dragging');
      initialX = e.type === 'touchstart' ? e.touches[0].clientX - xOffset : e.clientX - xOffset;
      initialY = e.type === 'touchstart' ? e.touches[0].clientY - yOffset : e.clientY - yOffset;
      isDragging = true;

      document.addEventListener('mousemove', drag);
      document.addEventListener('touchmove', drag);
      document.addEventListener('mouseup', stopDragging);
      document.addEventListener('touchend', stopDragging);
    }

    function drag(e) {
      if (isDragging) {
        e.preventDefault();
        currentX = e.type === 'touchmove' ? e.touches[0].clientX - initialX : e.clientX - initialX;
        currentY = e.type === 'touchmove' ? e.touches[0].clientY - initialY : e.clientY - initialY;
        xOffset = currentX;
        yOffset = currentY;
        postit.style.left = `${currentX}px`;
        postit.style.top = `${currentY}px`;
      }
    }

    function stopDragging() {
      isDragging = false;
      postit.classList.remove('dragging');
      localStorage.setItem(`postit_${postit.dataset.id}`, JSON.stringify({
        color: postit.style.background,
        left: postit.style.left,
        top: postit.style.top
      }));
      document.removeEventListener('mousemove', drag);
      document.removeEventListener('touchmove', drag);
      document.removeEventListener('mouseup', stopDragging);
      document.removeEventListener('touchend', stopDragging);
    }

    postit.ondragstart = () => false;
  }

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
          localStorage.setItem(`postit_${postit.dataset.id}`, JSON.stringify({
            color: postit.style.background,
            left: postit.style.left,
            top: postit.style.top
          }));
        });
        colorOptions.appendChild(option);
      });
      postit.appendChild(colorOptions);

      postit.addEventListener('mouseenter', () => {
        colorOptions.style.display = 'block';
      });
      postit.addEventListener('mouseleave', () => {
        setTimeout(() => {
          if (!postit.matches(':hover')) {
            colorOptions.style.display = 'none';
          }
        }, 500);
      });
    });
  }

  // Placeholder methods
  addScrollEffects() {}
  addImageLazyLoading() {}
  addVideoPlayPause() {}
  addTouchInteractions() {}
  addReadingProgress() {}
  initializeAnimations() {}

  recargar() {
    this.cargarEntradasDesdeCSV();
  }
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
