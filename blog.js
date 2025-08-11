/* ===============================
   Blog de Patofelting – JS completo y estable
   (respeta tu HTML/CSS actuales)
=================================*/

class BlogUtils {
  static formatearFecha(fecha) {
    if (!fecha) return '';
    const [day, month, year] = String(fecha).split('/');
    return `${day}/${month}/${year}`;
  }

  // dd/mm/yyyy (también acepta d/m/yyyy) y valida fecha real
  static esFechaValida(fecha) {
    if (!fecha) return false;
    const m = String(fecha).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return false;
    const d = +m[1], mo = +m[2], y = +m[3];
    const dt = new Date(y, mo - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === (mo - 1) && dt.getDate() === d;
  }

  static mostrarMensajeError() {
    const loader = document.getElementById('blog-loading');
    if (loader) loader.style.display = 'none';

    const cont = document.getElementById('blog-entries');
    if (!cont) return;
    cont.innerHTML = `
      <div class="blog-error">
        <span class="error-icon">❌</span>
        <div class="error-message">Hubo un error al cargar las entradas. Por favor, intenta de nuevo.</div>
        <button class="retry-button" onclick="window.recargarBlog()">Reintentar</button>
      </div>
    `;
  }

  static mostrarMensajeVacio() {
    const loader = document.getElementById('blog-loading');
    if (loader) loader.style.display = 'none';

    const cont = document.getElementById('blog-entries');
    if (!cont) return;
    cont.innerHTML = `
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
    const wpm = 200;
    const words = text.trim().split(/\s+/).length;
    return Math.max(1, Math.ceil(words / wpm));
  }
}

class BlogManager {
  constructor() {
    this.entradas = [];
    this._tieneRenderPrevio = false; // evita pisar contenido si una recarga viene vacía
  }

  async init() {
    await this.cargarEntradasDesdeCSV();
    this.addReadingProgressBar(); // UX
  }

  // ========== CARGA DE DATOS DESDE GOOGLE SHEETS ==========
  async cargarEntradasDesdeCSV() {
    try {
      const respuesta = await fetch(CSV_URL, { cache: 'reload' });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status} - ${respuesta.statusText}`);

      const texto = await respuesta.text();
      console.log('📄 CSV recibido:', texto.substring(0, 500));

      const resultado = Papa.parse(texto, {
        header: true,
        skipEmptyLines: true,
        transform: (value) => (value ? value.trim() : ''),
      });

      const nuevas = resultado.data
        .filter((fila) =>
          fila.titulo &&
          fila.contenido &&
          BlogUtils.esFechaValida(fila.fecha) // ← exige fecha válida
        )
        .map((fila, i) => ({
          id: fila.id || i.toString(),
          fecha: fila.fecha,
          titulo: fila.titulo,
          contenido: fila.contenido,
          imagenes: BlogUtils.limpiarURLs(fila.imagenPrincipal || ''),
          videos: BlogUtils.limpiarURLs(fila.videoURL || ''),
          orden: parseInt(fila.orden) || 0,
          postit: fila.postit || '',
          ordenpostit: parseInt(fila.ordenpostit) || 0,
        }))
        .sort((a, b) => a.orden - b.orden);

      console.log('✅ Entradas procesadas:', nuevas.length);

      // Si vino vacío y ya había algo, no tocar el DOM (Sheets puede tardar)
      if (nuevas.length === 0 && this._tieneRenderPrevio) {
        const loader = document.getElementById('blog-loading');
        if (loader) loader.style.display = 'none';
        console.warn('⚠️ CSV vacío temporalmente. Mantengo la vista actual.');
        return;
      }

      this.entradas = nuevas;
      this.renderizarBlog();
    } catch (error) {
      console.error('❌ Error al cargar CSV:', error);
      BlogUtils.mostrarMensajeError();
    }
  }

  // ========== RENDER ==========
  renderizarBlog() {
    const contenedor = document.getElementById('blog-entries');
    const template = document.getElementById('entry-template');

    // Apagar loader SIEMPRE
    const loader = document.getElementById('blog-loading');
    if (loader) loader.style.display = 'none';

    if (!contenedor || !template || !template.content) {
      console.error('❌ Faltan #blog-entries o #entry-template en el HTML.');
      return;
    }

    contenedor.innerHTML = '';

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

      // Medios en el contenedor YA EXISTENTE .media-gallery (si está)
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
        // Videos embebidos
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

      // Post-it (sin requerir contenedor extra)
      if (entrada.postit) {
        const content = clone.querySelector('.entry-content') || entry;
        const postit = document.createElement('div');
        postit.className = 'postit';
        postit.textContent = entrada.postit;
        postit.setAttribute('data-id', `postit_${entrada.id}`);
        content.appendChild(postit);

        // Selector de color
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

        // Drag + persistencia
        this.makeDraggable(postit);
        this.restaurarPostit(postit);
      }

      contenedor.appendChild(clone);
    });

    this._tieneRenderPrevio = true; // ya hay contenido en pantalla
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

/* ===============================
   Integración eCommerce (opcional)
=================================*/
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
          gtag('event', 'blog_cta_click', { event_category: 'Blog', event_label: action });
        }
      });
    });
  }
}

/* ===============================
   Config / Bootstrap
=================================*/
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJwvzHZQN3CQarSDqjk_nShegf8F4ydARvkSK55VabxbCi9m8RuGf2Nyy9ScriFRfGdhZd0P54VS5z/pub?gid=127717360&single=true&output=csv';

let blogManager;

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Iniciando Blog de Patofelting...');

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

  // Auto-refresh opcional (cada 5 min). Comentá mientras testeás si querés.
  setInterval(() => {
    if (blogManager && blogManager.entradas.length > 0) {
      blogManager.recargar();
    }
  }, 300000);

  console.log('✨ Blog de Patofelting cargado correctamente');
});

// Exponer recarga manual para el botón “Reintentar”
window.recargarBlog = () => {
  if (blogManager) blogManager.recargar();
};
