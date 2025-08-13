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
      <div class="blog-error" role="alert">
        <span class="error-icon">❌</span>
        <div class="error-message">Hubo un error al cargar las entradas. Por favor, intenta de nuevo.</div>
        <button class="retry-button" onclick="window.recargarBlog()">Reintentar</button>
      </div>`;
  }

  static mostrarMensajeVacio() {
    const contenedor = document.getElementById('main-content');
    if (!contenedor) return;
    contenedor.innerHTML = `
      <div class="blog-error">
        <span class="error-icon">📝</span>
        <div class="error-message">No hay historias para mostrar aún. ¡Vuelve pronto!</div>
      </div>`;
  }

  static limpiarURLs(urls) {
    return (urls || '')
      .split(',')
      .map(url => url.trim())
      .filter(url => url);
  }

  static calculateReadingTime() {
    const blogMain = document.querySelector('.blog-main');
    if (!blogMain) return 1;
    const text = blogMain.textContent;
    const wordsPerMinute = 200;
    const words = text.trim().split(/\s+/).length;
    return Math.max(1, Math.ceil(words / wordsPerMinute));
  }
}

class PremiumEffects {
  static init() {
    // Stitch animation cuando los títulos entran en viewport
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) e.target.classList.add('stitch-animation');
      });
    }, { threshold: 0.4 });
    document.querySelectorAll('.entry-title').forEach(t => io.observe(t));

    // Inserta botón de tema sin tocar estructura HTML base
    const nav = document.querySelector('.nav-container');
    if (nav && !document.getElementById('theme-toggle')) {
      const btn = document.createElement('button');
      btn.id = 'theme-toggle';
      btn.className = 'theme-toggle';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Cambiar tema');
      btn.textContent = 'Tema: Artesanal';
      btn.addEventListener('click', () => PremiumEffects.cycleTheme());
      nav.appendChild(btn);
    }

    // Tiempo de lectura
    const readingTime = BlogUtils.calculateReadingTime();
    const timeElement = document.createElement('div');
    timeElement.className = 'reading-time';
    timeElement.innerHTML = `<span>📖 ${readingTime} min</span>`;
    document.body.appendChild(timeElement);
  }

  static cycleTheme() {
    const themes = ['default','acuarela','lana'];
    const current = document.documentElement.getAttribute('data-theme') || 'default';
    const next = themes[(themes.indexOf(current) + 1) % themes.length];
    if (next === 'default') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', next);
    }
    localStorage.setItem('pf_theme', next);
  }

  static restoreTheme() {
    const saved = localStorage.getItem('pf_theme');
    if (saved && saved !== 'default') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  }
}

class BlogManager {
  constructor() {
    this.entradas = [];
  }

  async init() {
    PremiumEffects.restoreTheme();
    await this.cargarEntradasDesdeCSV();
    this.addImageEnhancements();
    this.addKeyboardCloseLightbox();
    PremiumEffects.init();
  }

  async cargarEntradasDesdeCSV() {
    try {
      const respuesta = await fetch(CSV_URL, { cache: 'reload' });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const texto = await respuesta.text();

      const resultado = Papa.parse(texto, {
        header: true,
        skipEmptyLines: true,
        transform: (value) => (value || '').toString().trim(),
      });

      this.entradas = resultado.data
        .filter((fila) => fila.titulo && fila.contenido)
        .map((fila, i) => ({
          id: fila.id || String(i),
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
    } catch (e) {
      console.error('Error CSV', e);
      BlogUtils.mostrarMensajeError();
    }
  }

  renderizarBlog() {
    const contenedor = document.getElementById('main-content');
    const template = document.getElementById('entry-template');
    const loader = document.getElementById('blog-loading');
    if (loader) loader.style.display = 'none';
    if (!contenedor || !template || !template.content) return;

    contenedor.innerHTML = '';

    if (this.entradas.length === 0) {
      BlogUtils.mostrarMensajeVacio();
      return;
    }

    this.entradas.forEach((entrada) => {
      const clone = template.content.cloneNode(true);
      const entryElement = clone.querySelector('.blog-entry');
      entryElement.setAttribute('data-entry-id', entrada.id);

      clone.querySelector('.entry-title').textContent = entrada.titulo;
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

      // --- GALERÍA INTERACTIVA (reemplaza carrusel) ---
      const gallery = clone.querySelector('.media-gallery');
      const lightboxes = []; // acumulamos para insertar luego

      // Imágenes
      (entrada.imagenes || []).forEach((url, idx) => {
        const lbId = `lb-${entrada.id}-${idx}`;
        const a = document.createElement('a');
        a.href = `#${lbId}`;
        a.className = 'gallery-item';
        const img = document.createElement('img');
        img.src = url;
        img.alt = `${entrada.titulo} — imagen ${idx+1}`;
        img.loading = 'lazy';
        img.decoding = 'async';
        a.appendChild(img);
        gallery.appendChild(a);

        const lb = document.createElement('div');
        lb.className = 'lightbox';
        lb.id = lbId;
        lb.innerHTML = `<a href="#" class="lb-close" aria-label="Cerrar">×</a><img src="${url}" alt="${entrada.titulo}">`;
        lightboxes.push(lb);
      });

      // Videos (YouTube/Vimeo embebidos)
      (entrada.videos || []).forEach((url, idx) => {
        const lbId = `lbv-${entrada.id}-${idx}`;
        const a = document.createElement('a');
        a.href = `#${lbId}`;
        a.className = 'gallery-item';
        const thumb = document.createElement('img');
        thumb.src = `https://image.thum.io/get/width/800/crop/600/${encodeURIComponent(url)}`;
        thumb.alt = `${entrada.titulo} — video ${idx+1}`;
        thumb.loading = 'lazy'; thumb.decoding='async';
        a.appendChild(thumb);
        gallery.appendChild(a);

        const lb = document.createElement('div');
        lb.className = 'lightbox';
        lb.id = lbId;
        lb.innerHTML = `<a href="#" class="lb-close" aria-label="Cerrar">×</a>
          <iframe src="${url}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen title="${entrada.titulo}"></iframe>`;
        lightboxes.push(lb);
      });

      // Insertar lightboxes al final del article (manteniendo estructura padre)
      const entryContent = clone.querySelector('.entry-content');
      lightboxes.forEach(lb => entryContent.appendChild(lb));

      // Post-it (drag simple manteniendo estructura)
      if (entrada.postit) {
        const postitContainer = document.createElement('div');
        postitContainer.className = 'postit-container';
        const postit = document.createElement('div');
        postit.className = 'postit';
        postit.textContent = entrada.postit;
        postit.setAttribute('tabindex', '0');
        postitContainer.appendChild(postit);
        entryContent.prepend(postitContainer);
      }

      contenedor.appendChild(clone);
    });
  }

  addImageEnhancements() {
    document.querySelectorAll('img[loading="lazy"]').forEach(img => {
      img.addEventListener('load', () => img.closest('.gallery-item')?.classList.add('loaded'));
      img.addEventListener('error', () => {
        img.alt = (img.alt || '') + ' (no disponible)';
        img.style.opacity = .3;
      });
    });
  }

  addKeyboardCloseLightbox(){
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && location.hash.startsWith('#lb')) {
        history.pushState("", document.title, window.location.pathname + window.location.search);
      }
    });
  }

  async recargar(){
    await this.cargarEntradasDesdeCSV();
  }
}

class BlogEcommerceIntegration {
  constructor() {
    this.addProductLinks();
    this.addCallToActionTracking();
  }
  addProductLinks() {
    document.querySelectorAll('[data-product]').forEach((mention) => {
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

const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJwvzHZQN3CQarSDqjk_nShegf8F4ydARvkSK55VabxbCi9m8RuGf2Nyy9ScriFRfGdhZd0P54VS5z/pub?gid=127717360&single=true&output=csv';

let blogManager;
document.addEventListener('DOMContentLoaded', async () => {
  blogManager = new BlogManager();
  await blogManager.init();
  new BlogEcommerceIntegration();

  // Auto refresh ligero (sin jank)
  setInterval(() => blogManager.recargar(), 120000);

  // Año dinámico
  const y = document.getElementById('current-year');
  if (y) y.textContent = new Date().getFullYear();
});

// API para reintentar desde botón
window.recargarBlog = () => blogManager?.recargar();
