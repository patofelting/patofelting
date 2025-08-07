class BlogUtils {
  static formatearFecha(fecha) {
    if (!fecha) return '';
    const [day, month, year] = fecha.split('/');
    return `${day}/${month}/${year}`;
  }

  static parseDate(fecha) {
    if (!fecha) return new Date(0);
    const [day, month, year] = fecha.split('/').map(Number);
    return new Date(year, month - 1, day);
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
    this.renderizarIndice();
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
        .sort((a, b) => {
          const dateA = BlogUtils.parseDate(a.fecha);
          const dateB = BlogUtils.parseDate(b.fecha);
          return dateB - dateA || a.orden - b.orden;
        });

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
      console.error('❌ No se encontró el contenedor principal.');
      return;
    }

    if (!template || !template.content) {
      console.error('❌ No se encontró el template para las entradas.');
      BlogUtils.mostrarMensajeError();
      return;
    }

    if (loader) loader.style.display = 'none';
    contenedor.innerHTML = '';

    if (this.entradas.length === 0) {
      BlogUtils.mostrarMensajeVacio();
      this.renderizarIndice();
      return;
    }

    this.entradas.forEach((entrada) => {
      const clone = template.content.cloneNode(true);
      const entryElement = clone.querySelector('.blog-entry');
      entryElement.setAttribute('data-entry-id', entrada.id);
      entryElement.setAttribute('aria-labelledby', `entry-title-${entrada.id}`);

      clone.querySelector('.entry-title').textContent = entrada.titulo;
      clone.querySelector('.entry-title').id = `entry-title-${entrada.id}`;
      clone.querySelector('.entry-date').textContent = BlogUtils.formatearFecha(entrada.fecha);

      const textoContainer = clone.querySelector('.entry-text');
      entrada.contenido.split('\n').forEach(linea => {
        if (linea.trim()) {
          const p = document.createElement('p');
          p.className = 'notebook-line';
          p.textContent = linea.trim();
          textoContainer.appendChild(p);
        }
      });

      const mediaBook = clone.querySelector('.media-book');
      if (entrada.imagenes && entrada.imagenes.length > 0) {
        entrada.imagenes.forEach(url => {
          const page = document.createElement('div');
          page.className = 'book-page';
          const img = document.createElement('img');
          img.src = url;
          img.alt = `Imagen para ${entrada.titulo}`;
          img.loading = 'lazy';
          img.classList.add('entrada-imagen');
          img.onerror = () => {
            img.hidden = true;
            console.warn(`Error al cargar imagen: ${url}`);
          };
          page.appendChild(img);
          mediaBook.appendChild(page);
        });
      }

      if (entrada.videos && entrada.videos.length > 0) {
        entrada.videos.forEach(url => {
          const video = document.createElement('iframe');
          video.src = url;
          video.frameBorder = '0';
          video.allowFullscreen = true;
          video.classList.add('entrada-video');
          video.setAttribute('aria-label', `Video para ${entrada.titulo}`);
          mediaBook.appendChild(video);
        });
      }

      if (entrada.postit) {
        const postitContainer = clone.querySelector('.postit-container');
        const postit = document.createElement('div');
        postit.className = 'postit';
        postit.textContent = entrada.postit;
        postit.setAttribute('draggable', 'true');
        postit.setAttribute('data-id', `postit-${entrada.id}`);
        postitContainer.appendChild(postit);

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
          postit.remove();
          this.savePostitPosition(newPostit);
        });
      }

      contenedor.appendChild(clone);
    });

    this.initializePostitColors();
    this.renderizarIndice();
  }

  renderizarIndice() {
    const indexList = document.getElementById('index-list');
    const indexNav = document.getElementById('blog-index');
    if (!indexList || !indexNav) return;

    indexList.innerHTML = '';
    if (this.entradas.length === 0) {
      indexNav.style.display = 'none';
      return;
    }

    indexNav.style.display = 'block';
    this.entradas.forEach(entrada => {
      const li = document.createElement('li');
      li.className = 'index-item';
      li.textContent = entrada.titulo;
      li.setAttribute('role', 'link');
      li.setAttribute('tabindex', '0');
      li.setAttribute('aria-label', `Ir a la entrada: ${entrada.titulo}`);
      li.addEventListener('click', () => {
        document.querySelector(`[data-entry-id="${entrada.id}"]`).scrollIntoView({ behavior: 'smooth' });
      });
      li.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          document.querySelector(`[data-entry-id="${entrada.id}"]`).scrollIntoView({ behavior: 'smooth' });
        }
      });
      indexList.appendChild(li);
    });

    const toggleButton = document.querySelector('.index-toggle');
    if (toggleButton) {
      toggleButton.addEventListener('click', () => {
        const isExpanded = toggleButton.getAttribute('aria-expanded') === 'true';
        toggleButton.setAttribute('aria-expanded', !isExpanded);
        indexList.classList.toggle('hidden');
      });
    }
  }

  savePostitPosition(postit) {
    const id = postit.dataset.id;
    const color = postit.style.background;
    const pos = { left: postit.style.left, top: postit.style.top };
    localStorage.setItem(`postit_${id}`, JSON.stringify({ color, ...pos }));
  }

  initializePostitColors() {
    document.querySelectorAll('.postit').forEach(postit => {
      const colorOptions = document.createElement('div');
      colorOptions.className = 'postit-color-options';
      ['yellow', 'pink', 'green', 'blue'].forEach(color => {
        const option = document.createElement('div');
        option.id = `color-${color}`;
        option.className = 'color-option';
        option.setAttribute('aria-label', `Cambiar a color ${color}`);
        option.addEventListener('click', () => {
          postit.style.background = getComputedStyle(document.getElementById(`color-${color}`)).backgroundColor;
          this.savePostitPosition(postit);
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

      const id = postit.dataset.id;
      const saved = localStorage.getItem(`postit_${id}`);
      if (saved) {
        const data = JSON.parse(saved);
        if (data.color) postit.style.background = data.color;
        if (data.left) postit.style.left = data.left;
        if (data.top) postit.style.top = data.top;
      }
    });
  }

  addScrollEffects() {
    // Placeholder for scroll effects
  }

  addImageLazyLoading() {
    // Already implemented via loading="lazy"
  }

  addVideoPlayPause() {
    // Placeholder for video controls
  }

  addTouchInteractions() {
    // Placeholder for touch interactions
  }

  addReadingProgress() {
    // Placeholder for reading progress
  }

  initializeAnimations() {
    // Placeholder for animations
  }

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
      background: var(--paper-white);
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

// Manejo de post-it dragging
document.querySelectorAll('.postit').forEach(postit => {
  postit.onmousedown = function(e) {
    let shiftX = e.clientX - postit.getBoundingClientRect().left;
    let shiftY = e.clientY - postit.getBoundingClientRect().top;
    postit.classList.add('dragging');
    function moveAt(pageX, pageY) {
      postit.style.left = pageX - shiftX + 'px';
      postit.style.top = pageY - shiftY + 'px';
    }
    function onMouseMove(e) {
      moveAt(e.pageX, e.pageY);
    }
    document.addEventListener('mousemove', onMouseMove);
    postit.onmouseup = function() {
      document.removeEventListener('mousemove', onMouseMove);
      postit.onmouseup = null;
      postit.classList.remove('dragging');
      const id = postit.dataset.id;
      const color = postit.style.background;
      localStorage.setItem(`postit_${id}`, JSON.stringify({ 
        color, 
        left: postit.style.left, 
        top: postit.style.top 
      }));
    };
  };
  postit.ondragstart = () => false;
});
