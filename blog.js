/* =========================================================
   BLOG - Patofelting (CSV → UI)
   Mantiene tu estructura + añade TOC, reacciones, post-its,
   carrusel robusto, lazy y JSON-LD.
========================================================= */

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
    return (urls || '')
      .split(',')
      .map(u => u.trim())
      .filter(Boolean);
  }

  static calculateReadingTime() {
    const blogMain = document.querySelector('.blog-main');
    if (!blogMain) return 1;
    const text = blogMain.textContent || '';
    const words = text.trim().split(/\s+/).length;
    const time = Math.ceil(words / 200);
    return Math.max(1, time);
  }

  static initCarousel(mediaBook, images) {
    if (!mediaBook || !images || images.length === 0) return;
    const carousel = mediaBook.querySelector('.carousel');
    if (!carousel) return;

    const items = carousel.querySelectorAll('.carousel-item');
    const prev = carousel.querySelector('.carousel-prev');
    const next = carousel.querySelector('.carousel-next');
    let current = 0;

    const show = (i) => {
      items.forEach((it, idx) => it.classList.toggle('active', idx === i));
    };
    prev?.addEventListener('click', () => { current = (current - 1 + items.length) % items.length; show(current); });
    next?.addEventListener('click', () => { current = (current + 1) % items.length; show(current); });
    show(current);
  }
}

class BlogManager {
  constructor() {
    this.entradas = [];
    this.init();
  }

  async init() {
    await this.cargarEntradasDesdeCSV();
    this.addImageLazyLoading();
    this.addVideoPlayPause();
    this.buildIndex();
    this.initReactions();
    this.enablePostits();
    this.injectJSONLD();
    this.wireIndexMobile();

    // Burbuja de tiempo de lectura
    setTimeout(() => {
      const readingTime = BlogUtils.calculateReadingTime();
      const timeElement = document.createElement('div');
      timeElement.className = 'reading-time';
      timeElement.innerHTML = `<span>📖 Tiempo de lectura: ${readingTime} min</span>`;
      Object.assign(timeElement.style, {
        position: 'fixed', bottom: '20px', left: '20px', background: 'white',
        padding: '0.5rem 1rem', borderRadius: '25px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
        fontSize: '.9rem', color: 'var(--pencil-gray)', zIndex: 1000
      });
      document.body.appendChild(timeElement);
    }, 1000);
  }

  /* ================== DATOS ================== */
  async cargarEntradasDesdeCSV() {
    try {
      const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJwvzHZQN3CQarSDqjk_nShegf8F4ydARvkSK55VabxbCi9m8RuGf2Nyy9ScriFRfGdhZd0P54VS5z/pub?gid=127717360&single=true&output=csv';

      const respuesta = await fetch(CSV_URL, { cache: 'reload' });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status} - ${respuesta.statusText}`);

      const texto = await respuesta.text();
      const resultado = Papa.parse(texto, { header: true, skipEmptyLines: true, transform: v => (v ?? '').trim() });

      this.entradas = resultado.data
        .filter(f => f.titulo && f.contenido)
        .map((fila, i) => ({
          id: fila.id || String(i),
          fecha: fila.fecha || '',
          titulo: fila.titulo,
          contenido: fila.contenido,
          imagenes: BlogUtils.limpiarURLs(fila.imagenPrincipal || ''),
          videos: BlogUtils.limpiarURLs(fila.videoURL || ''),
          orden: parseInt(fila.orden) || i,
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

  /* ================== RENDER ================== */
  renderizarBlog() {
    const contenedor = document.getElementById('blog-entries');
    const template = document.getElementById('entry-template');
    const loader = document.getElementById('blog-loading');
    if (!contenedor || !template?.content) return;

    if (loader) loader.style.display = 'none';
    contenedor.innerHTML = '';

    if (this.entradas.length === 0) {
      BlogUtils.mostrarMensajeVacio();
      return;
    }

    this.entradas.forEach((entrada, idx) => {
      const clone = template.content.cloneNode(true);
      const entry = clone.querySelector('.blog-entry');
      entry.setAttribute('data-entry-id', entrada.id);
      entry.id = `entry-${entrada.id}`;

      // Título y fecha
      clone.querySelector('.entry-title').textContent = entrada.titulo;
      clone.querySelector('.entry-date').textContent = BlogUtils.formatearFecha(entrada.fecha);

      // Contenido (línea por párrafo)
      const textoContainer = clone.querySelector('.entry-text');
      entrada.contenido.split('\n').forEach(linea => {
        if (linea.trim()) {
          const p = document.createElement('p');
          p.className = 'notebook-line';
          p.textContent = linea.trim();
          textoContainer.appendChild(p);
        }
      });

      // Galería de imágenes → Carrusel
      const mediaBook = clone.querySelector('.media-book');
      if (entrada.imagenes?.length) {
        const carousel = document.createElement('div');
        carousel.className = 'carousel';
        entrada.imagenes.forEach((url, i) => {
          const item = document.createElement('div');
          item.className = `carousel-item ${i === 0 ? 'active' : ''}`;
          const polaroid = document.createElement('div');
          polaroid.className = 'photo-polaroid';
          const img = document.createElement('img');
          img.src = url; img.alt = `${entrada.titulo} — imagen ${i + 1}`;
          img.loading = 'lazy';
          img.classList.add('entrada-imagen');
          img.onerror = () => { polaroid.style.opacity = .5; };
          polaroid.appendChild(img);
          item.appendChild(polaroid);
          carousel.appendChild(item);
        });

        if (entrada.imagenes.length > 1) {
          const prev = document.createElement('button'); prev.className = 'carousel-prev'; prev.innerHTML = '◄';
          const next = document.createElement('button'); next.className = 'carousel-next'; next.innerHTML = '►';
          carousel.appendChild(prev); carousel.appendChild(next);
        }
        mediaBook.appendChild(carousel);
      }

      // Videos
      if (entrada.videos?.length) {
        const mediaBook2 = clone.querySelector('.media-book');
        entrada.videos.forEach(url => {
          const video = document.createElement('iframe');
          video.src = url; video.className = 'entrada-video'; video.loading = 'lazy';
          video.allowFullscreen = true; video.setAttribute('title', entrada.titulo);
          mediaBook2.appendChild(video);
        });
      }

      // Post-it inicial desde CSV (opcional)
      if (entrada.postit) {
        const box = clone.querySelector('.postit-container');
        const p = { text: entrada.postit, x: 6, y: 6, color: '#ffeb3b', id: crypto.randomUUID() };
        box.appendChild(this._renderPostit(p));
      }

      contenedor.appendChild(clone);

      // Iniciar carrusel si corresponde
      if (entrada.imagenes?.length) {
        BlogUtils.initCarousel(mediaBook, entrada.imagenes);
      }
    });

    // Extras tras render
    this.addImageLazyLoading();
    this.addVideoPlayPause();
    this.buildIndex();
    this.initReactions();
    this.enablePostits();
    this.injectJSONLD();
  }

  /* ================== TOC / ÍNDICE ================== */
  buildIndex() {
    const index = document.getElementById('blog-index');
    if (!index) return;
    const entries = document.querySelectorAll('.blog-entry');
    const ul = document.createElement('ul');

    entries.forEach((art, i) => {
      const id = art.getAttribute('data-entry-id') || `e${i}`;
      const t = art.querySelector('.entry-title')?.textContent?.trim() || `Entrada ${i + 1}`;
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#entry-${id}`;
      a.textContent = t;
      a.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (index.classList.contains('menu-mobile-open')) this.toggleIndex(false);
      });
      li.appendChild(a); ul.appendChild(li);
    });

    index.innerHTML = '';
    index.appendChild(ul);
  }

  wireIndexMobile() {
    const btn = document.querySelector('.index-toggle');
    const index = document.getElementById('blog-index');
    const overlay = document.getElementById('blog-index-overlay');
    if (!btn || !index || !overlay) return;

    btn.addEventListener('click', () => this.toggleIndex(!index.classList.contains('menu-mobile-open')));
    overlay.addEventListener('click', () => this.toggleIndex(false));
  }

  toggleIndex(open) {
    const btn = document.querySelector('.index-toggle');
    const index = document.getElementById('blog-index');
    const overlay = document.getElementById('blog-index-overlay');
    if (!btn || !index || !overlay) return;
    index.classList.toggle('menu-mobile-open', open);
    overlay.classList.toggle('hidden', !open);
    btn.setAttribute('aria-expanded', String(open));
  }

  /* ================== Reacciones / Favoritos ================== */
  initReactions() {
    const KEY = 'pf_reactions';
    const cache = JSON.parse(localStorage.getItem(KEY) || '{}');

    document.querySelectorAll('.blog-entry').forEach(entry => {
      const id = entry.getAttribute('data-entry-id');
      const wrap = entry.querySelector('.entry-reactions');
      if (!wrap) return;

      const state = cache[id] || { '🧶': 0, '✨': 0, fav: false };

      wrap.querySelectorAll('[data-emoji]').forEach(btn => {
        const emoji = btn.dataset.emoji;
        btn.querySelector('span').textContent = state[emoji] || 0;
        btn.setAttribute('aria-pressed', 'false');
        btn.addEventListener('click', () => {
          state[emoji] = (state[emoji] || 0) + 1;
          btn.querySelector('span').textContent = state[emoji];
          cache[id] = state; localStorage.setItem(KEY, JSON.stringify(cache));
          btn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 180 });
        });
      });

      const fav = wrap.querySelector('.entry-fav');
      if (fav) {
        fav.classList.toggle('active', !!state.fav);
        fav.setAttribute('aria-pressed', String(!!state.fav));
        fav.addEventListener('click', () => {
          state.fav = !state.fav;
          fav.classList.toggle('active', state.fav);
          fav.setAttribute('aria-pressed', String(state.fav));
          cache[id] = state; localStorage.setItem(KEY, JSON.stringify(cache));
        });
      }
    });
  }

  /* ================== Post-its avanzados ================== */
  enablePostits() {
    const KEY = 'pf_postits';
    const store = JSON.parse(localStorage.getItem(KEY) || '{}');

    document.querySelectorAll('.blog-entry').forEach(entry => {
      const id = entry.getAttribute('data-entry-id');
      const box = entry.querySelector('.postit-container');
      if (!box) return;

      // restaurar
      (store[id] || []).forEach(p => box.appendChild(this._renderPostit(p)));

      // botón para crear
      if (!box.querySelector('.postit-add')) {
        const add = document.createElement('button');
        add.textContent = '➕ Post-it';
        add.className = 'postit-add';
        add.addEventListener('click', () => {
          const p = { text: 'Escribe aquí…', x: 8 + Math.random() * 50, y: 8 + Math.random() * 20, color: '#ffeb3b', id: crypto.randomUUID() };
          box.appendChild(this._renderPostit(p));
          this._persistPostits(entry, KEY);
        });
        box.appendChild(add);
      }

      ['pointerup', 'keyup'].forEach(evt => box.addEventListener(evt, () => this._persistPostits(entry, KEY)));
      window.addEventListener('beforeunload', () => this._persistPostits(entry, KEY), { once: true });
    });
  }

  _renderPostit(p) {
    const el = document.createElement('div');
    el.className = 'postit'; el.contentEditable = true;
    el.textContent = p.text;
    el.style.background = p.color;
    el.style.position = 'absolute';
    el.style.left = p.x + '%';
    el.style.top = p.y + '%';
    el.dataset.pid = p.id;

    // Drag
    let drag = false, sx = 0, sy = 0, lx = 0, ly = 0;
    el.addEventListener('pointerdown', (e) => {
      drag = true; sx = e.clientX; sy = e.clientY;
      const r = el.getBoundingClientRect(); lx = r.left; ly = r.top;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      el.style.left = `calc(${lx}px + ${dx}px)`;
      el.style.top = `calc(${ly}px + ${dy}px)`;
    });
    el.addEventListener('pointerup', (e) => { drag = false; el.releasePointerCapture(e.pointerId); });

    // Paleta
    const palette = document.createElement('div');
    palette.className = 'postit-color-options';
    ['#f5eead', '#fca8c4', '#b8f1bb', '#42a5f5'].forEach(c => {
      const dot = document.createElement('span');
      dot.className = 'color-option'; dot.style.background = c;
      dot.addEventListener('click', () => { el.style.background = c; });
      palette.appendChild(dot);
    });
    el.appendChild(palette);
    return el;
  }

  _persistPostits(entry, KEY) {
    const id = entry.getAttribute('data-entry-id');
    const list = [...entry.querySelectorAll('.postit')].map(el => {
      const rect = el.getBoundingClientRect(), parent = entry.getBoundingClientRect();
      return {
        id: el.dataset.pid,
        text: el.textContent.trim(),
        color: el.style.background || '#ffeb3b',
        x: ((rect.left - parent.left) / parent.width) * 100,
        y: ((rect.top - parent.top) / parent.height) * 100,
      };
    });
    const store = JSON.parse(localStorage.getItem(KEY) || '{}');
    store[id] = list; localStorage.setItem(KEY, JSON.stringify(store));
  }

  /* ================== Lazy / Videos ================== */
  addImageLazyLoading() {
    const imgs = document.querySelectorAll('.entrada-imagen');
    if (!imgs.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      imgs.forEach(i => i.style.opacity = 1);
      return;
    }
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const img = e.target;
        img.decode?.().catch(() => {}).finally(() => img.style.opacity = 1);
        obs.unobserve(img);
      });
    }, { rootMargin: '200px 0px 200px 0px' });
    imgs.forEach(i => { i.style.opacity = .001; io.observe(i); });
  }

  addVideoPlayPause() {
    const iframes = document.querySelectorAll('.entrada-video');
    if (!iframes.length) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(({ isIntersecting, target }) => {
        if (!/youtube|vimeo/.test(target.src)) return;
        const cmd = JSON.stringify({ event: 'command', func: isIntersecting ? 'playVideo' : 'pauseVideo' });
        target.contentWindow?.postMessage(cmd, '*');
      });
    }, { threshold: .3 });
    iframes.forEach(v => io.observe(v));
  }

  /* ================== SEO ================== */
  injectJSONLD() {
    const slot = document.getElementById('jsonld-slot');
    if (!slot) return;
    const items = [...document.querySelectorAll('.blog-entry')].map(e => {
      const name = e.querySelector('.entry-title')?.textContent?.trim();
      const dateTxt = e.querySelector('.entry-date')?.textContent?.trim();
      const img = e.querySelector('.entrada-imagen')?.src;
      const text = e.querySelector('.entry-text')?.innerText?.trim();
      const dateISO = dateTxt?.split('/')?.reverse()?.join('-');
      return {
        "@type": "BlogPosting",
        "headline": name,
        "image": img ? [img] : undefined,
        "datePublished": dateISO,
        "articleBody": text,
        "author": { "@type": "Person", "name": "Patofelting" }
      };
    });
    const graph = { "@context": "https://schema.org", "@graph": items };
    slot.textContent = JSON.stringify(graph);
  }

  /* ================== Util ================== */
  recargar() { this.cargarEntradasDesdeCSV(); }
}

/* Exponer util para reintentar */
window.recargarBlog = () => { window.blogManager?.recargar(); };

/* Ecommerce (opcional, mantiene tus ganchos) */
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
      Object.assign(mention.style, { cursor: 'pointer', textDecoration: 'underline', color: 'var(--primary-green)' });
    });
  }
  addCallToActionTracking() {
    document.querySelectorAll('.cta-button-blog').forEach((cta) => {
      cta.addEventListener('click', (e) => {
        const action = e.target.textContent.trim();
        console.log(`Blog CTA clicked: ${action}`);
        if (typeof gtag !== 'undefined') {
          gtag('event', 'blog_cta_click', { event_category: 'Blog', event_label: action });
        }
      });
    });
  }
}

/* Arranque */
let blogManager;
document.addEventListener('DOMContentLoaded', () => {
  blogManager = new BlogManager();
  new BlogEcommerceIntegration();
  // año en footer
  const y = document.getElementById('current-year');
  if (y) y.textContent = new Date().getFullYear();
});
