/* ===============================
   Blog de Patofelting – JS corregido
   Mantiene la estructura HTML existente
=================================*/

class BlogUtils {
  static formatearFecha(fecha) {
    if (!fecha) return '';
    const [day, month, year] = String(fecha).split('/');
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
    return String(urls || '')
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);
  }

  static calculateReadingTime() {
    const blogMain = document.querySelector('.blog-main');
    if (!blogMain) return 1;
    const text = blogMain.textContent || '';
    const wordsPerMinute = 200;
    const words = text.trim().split(/\s+/).length;
    return Math.max(1, Math.ceil(words / wordsPerMinute));
  }
}

class BlogManager {
  constructor() {
    this.entradas = [];
  }

  async init() {
    await this.cargarEntradasDesdeCSV();
    this.addReadingProgressBar();
  }

  // ========== CARGA DE DATOS DESDE GOOGLE SHEETS ==========
  async cargarEntradasDesdeCSV() {
    try {
      const respuesta = await fetch(CSV_URL, { cache: 'reload' });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status} - ${respuesta.statusText}`);

      const texto = await respuesta.text();
      const resultado = Papa.parse(texto, {
        header: true,
        skipEmptyLines: true,
        transform: (value) => (value ? value.trim() : ''),
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

      this.renderizarBlog();
    } catch (error) {
      console.error('❌ Error al cargar CSV:', error);
      BlogUtils.mostrarMensajeError();
    }
  }

  // ========== RENDER ==========
  renderizarBlog() {
    const wrap = document.getElementById('blog-entries');
    const template = document.getElementById('entry-template');
    const loader = document.getElementById('blog-loading');
    if (loader) loader.style.display = 'none';

    if (!wrap || !template || !template.content) {
      console.error('❌ Faltan elementos base en el HTML (blog-entries o entry-template).');
      return;
    }

    wrap.innerHTML = '';

    if (this.entradas.length === 0) {
      BlogUtils.mostrarMensajeVacio();
      return;
    }

    this.entradas.forEach((entrada) => {
      const clone = template.content.cloneNode(true);
      const entry = clone.querySelector('.blog-entry');
      entry.setAttribute('data-entry-id', entrada.id);

      // Título y fecha
      clone.querySelector('.entry-title').textContent = entrada.titulo;
      clone.querySelector('.entry-date').textContent = BlogUtils.formatearFecha(entrada.fecha);

      // Contenido (líneas del cuaderno)
      const textoContainer = clone.querySelector('.entry-text');
      entrada.contenido.split('\n').forEach((linea) => {
        if (linea.trim()) {
          const p = document.createElement('p');
          p.className = 'notebook-line';
          p.textContent = linea.trim();
          textoContainer.appendChild(p);
        }
      });

      // Medios en el contenedor YA EXISTENTE .media-gallery
      const media = clone.querySelector('.media-gallery');
      if (media) {
        // Imágenes
        if (entrada.imagenes && entrada.imagenes.length > 0) {
          entrada.imagenes.forEach((url) => {
            const fig = document.createElement('figure');
            fig.className = 'photo-polaroid';
            const img = document.createElement('img');
            img.src = url;
            img.alt = entrada.titulo;
            img.loading = 'lazy';
            img.classList.add('entrada-imagen');
            img.onerror = () => { fig.classList.add('image-error'); img.remove(); };
            fig.appendChild(img);
            media.appendChild(fig);
          });
        }
        // Videos (YouTube/Vimeo embebidos)
        if (entrada.videos && entrada.videos.length > 0) {
          entrada.videos.forEach((url) => {
            const iframe = document.createElement('iframe');
            iframe.src = url;
            iframe.loading = 'lazy';
            iframe.allowFullscreen = true;
            iframe.classList.add('entrada-video');
            media.appendChild(iframe);
          });
        }
      }

      // Post-it (sin requerir .postit-container en HTML)
      if (entrada.postit) {
        const content = clone.querySelector('.entry-content') || entry;
        const postit = document.createElement('div');
        postit.className = 'postit';
        postit.textContent = entrada.postit;
        postit.setAttribute('data-id', `postit_${entrada.id}`);
        content.appendChild(postit);

        // Picker de color
        const colorBox = document.createElement('div');
        colorBox.className = 'postit-color-options';
        ['yellow', 'pink', 'green', 'blue'].forEach((color) => {
          const option = document.createElement('div');
          option.id = `color-${color}`;
          option.className = 'color-option';
          option.addEventListener('click', () => {
            const bg = getComputedStyle(option).backgroundColor;
            postit.style.background = bg;
            BlogManager.persistirPostit(postit);
          });
          colorBox.appendChild(option);
        });
        postit.appendChild(colorBox);

        // Arrastre + persistencia
        this.makeDraggable(postit);
        this.restaurarPostit(postit);
      }

      wrap.appendChild(clone);
    });
  }

  // ========== Post-it: persistencia & drag ==========
  static persistirPostit(el) {
    const id = el.dataset.id || '';
    if (!id) return;
    const data = {
      color: el.style.background || '',
      left: el.style.left || '',
      top: el.style.top || '',
      position: el.style.position || '',
    };
    localStorage.setItem(id, JSON.stringify(data));
  }

  restaurarPostit(el) {
    const id = el.dataset.id || '';
    if (!id) return;
    const saved = localStorage.getItem(id);
    if (!saved) return;
    try {
      const data = JSON.parse(saved);
      if (data.color) el.style.background = data.color;
      if (data.left) el.style.left = data.left;
      if (data.top) el.style.top = data.top;
      el.style.position = data.position || 'absolute';
    } catch { /* noop */ }
  }

  makeDraggable(el) {
    // Desktop
    el.addEventListener('mousedown', (down) => {
      el.style.position = el.style.position || 'absolute';
      let shiftX = down.clientX - el.getBoundingClientRect().left;
      let shiftY = down.clientY - el.getBoundingClientRect().top;

      const move = (e) => {
        el.style.left = e.pageX - shiftX + 'px';
        el.style.top = e.pageY - shiftY + 'px';
      };
      const up = () => {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        BlogManager.persistirPostit(el);
      };

      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
    el.ondragstart = () => false;

    // Touch (móvil)
    el.addEventListener('touchstart', (t) => {
      const touch = t.touches[0];
      el.style.position = el.style.position || 'absolute';
      let shiftX = touch.clientX - el.getBoundingClientRect().left;
      let shiftY = touch.clientY - el.getBoundingClientRect().top;

      const move = (e) => {
        const p = e.touches ? e.touches[0] : e;
        el.style.left = p.pageX - shiftX + 'px';
        el.style.top = p.pageY - shiftY + 'px';
      };
      const end = () => {
        document.removeEventListener('touchmove', move);
        document.removeEventListener('touchend', end);
        BlogManager.persistirPostit(el);
      };

      document.addEventListener('touchmove', move, { passive: true });
      document.addEventListener('touchend', end);
    }, { passive: true });
  }

  // ========== UX: barra de progreso ==========
  addReadingProgressBar() {
    const bar = document.createElement('div');
    bar.className = 'reading-progress';
    document.body.appendChild(bar);

    const onScroll = () => {
      const h = document.documentElement;
      const scrolled = (h.scrollTop) / (h.scrollHeight - h.clientHeight);
      bar.style.width = Math.max(0, Math.min(1, scrolled)) * 100 + '%';
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ========== Recarga segura ==========
  async recargar() {
    await this.cargarEntradasDesdeCSV();
  }
}

/* ============ Integración eCommerce opcional ============ */
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

/* ============ Configuración ============ */
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJwvzHZQN3CQarSDqjk_nShegf8F4ydARvkSK55VabxbCi9m8RuGf2Nyy9ScriFRfGdhZd0P54VS5z/pub?gid=127717360&single=true&output=csv';

let blogManager;

document.addEventListener('DOMContentLoaded', async () => {
  // Año en footer si existe
  const y = document.getElementById('current-year');
  if (y) y.textContent = new Date().getFullYear();

  blogManager = new BlogManager();
  await blogManager.init();
  new BlogEcommerceIntegration();

  // Badge temporal de tiempo de lectura (desaparece)
  setTimeout(() => {
    const readingTime = BlogUtils.calculateReadingTime();
    const timeElement = document.createElement('div');
    timeElement.className = 'reading-time';
    timeElement.innerHTML = `<span>📖 Tiempo de lectura: ${readingTime} min</span>`;
    timeElement.style.cssText = `
      position: fixed; bottom: 20px; left: 20px; background: #fff;
      padding: .5rem 1rem; border-radius: 25px; box-shadow: 0 4px 15px rgba(0,0,0,.1);
      font-size: .9rem; color: var(--pencil-gray); z-index: 1000;
    `;
    document.body.appendChild(timeElement);
    setTimeout(() => timeElement.remove(), 8000);
  }, 2000);

  // Auto-refresh opcional cada 60s
  setInterval(() => {
    if (blogManager && blogManager.entradas.length > 0) {
      blogManager.recargar();
    }
  }, 60000);
});

// Exponer recarga manual para el botón “Reintentar”
window.recargarBlog = () => {
  if (blogManager) blogManager.recargar();
};


const loader = document.getElementById('blog-loading'); if (loader) loader.style.display = 'none';
