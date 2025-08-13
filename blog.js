/*********************************************************
 * Blog Patofelting – Carrusel Pro (fade + scale + auto‑height)
 * - Solo renderiza si hay media real
 * - Transición Apple‑like (fade + micro‑zoom)
 * - Gestos táctiles y teclado
 * - Alturas autoajustables y lazy loading
 **********************************************************/

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
    // Títulos con “stitch” al entrar
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('stitch-animation'); });
    }, { threshold: 0.4 });
    document.querySelectorAll('.entry-title').forEach(t => io.observe(t));

    // Botón de tema (inyectado)
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
    const el = document.createElement('div');
    el.className = 'reading-time';
    el.innerHTML = `<span>📖 ${readingTime} min</span>`;
    document.body.appendChild(el);
  }

  static cycleTheme() {
    const themes = ['default', 'acuarela', 'lana'];
    const current = document.documentElement.getAttribute('data-theme') || 'default';
    const next = themes[(themes.indexOf(current) + 1) % themes.length];
    if (next === 'default') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('pf_theme', next);
  }

  static restoreTheme() {
    const saved = localStorage.getItem('pf_theme');
    if (saved && saved !== 'default') document.documentElement.setAttribute('data-theme', saved);
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

      // --- CAROUSEL PRO (solo si hay media) ---
      const gallery = clone.querySelector('.media-gallery');
      const sources = [];
      (entrada.imagenes || []).forEach((url, idx) => sources.push({ type: 'img', url, alt: `${entrada.titulo} — imagen ${idx + 1}` }));
      (entrada.videos || []).forEach((url, idx) => sources.push({ type: 'video', url, alt: `${entrada.titulo} — video ${idx + 1}` }));

      if (sources.length > 0) {
        const carousel = document.createElement('div');
        carousel.className = 'carousel-pro fade'; // modo fade
        const track = document.createElement('div');
        track.className = 'carousel-track';
        carousel.appendChild(track);

        sources.forEach((item, i) => {
          const slide = document.createElement('div');
          slide.className = 'carousel-slide' + (i === 0 ? ' active' : '');
          if (item.type === 'img') {
            const img = document.createElement('img');
            img.src = item.url;
            img.alt = item.alt;
            img.loading = 'lazy';
            img.decoding = 'async';
            // placeholder blur suave antes de cargar
            img.style.opacity = '0';
            img.addEventListener('load', () => { img.style.opacity = '1'; });
            slide.appendChild(img);
          } else {
            const iframe = document.createElement('iframe');
            iframe.src = item.url;
            iframe.loading = 'lazy';
            iframe.title = item.alt;
            iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
            iframe.setAttribute('allowfullscreen', '');
            slide.appendChild(iframe);
          }
          track.appendChild(slide);
        });

        // Controles + indicadores
        const nav = document.createElement('div');
        nav.className = 'carousel-nav';
        nav.innerHTML = `
          <button class="carousel-btn prev" aria-label="Anterior">❮</button>
          <button class="carousel-btn next" aria-label="Siguiente">❯</button>`;
        const dots = document.createElement('div');
        dots.className = 'carousel-indicators';
        sources.forEach((_, i) => {
          const dot = document.createElement('button');
          if (i === 0) dot.classList.add('active');
          dot.setAttribute('aria-label', 'Ir al slide ' + (i + 1));
          dots.appendChild(dot);
        });

        carousel.appendChild(nav);
        carousel.appendChild(dots);
        gallery.appendChild(carousel);
      } else {
        // si no hay media, no mostramos contenedor vacío
        gallery.remove();
      }

      // Post‑it (opcional)
      if (entrada.postit) {
        const entryContent = clone.querySelector('.entry-content');
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

    // Inicializar todos los carruseles renderizados
    initCarouselPro(contenedor);
  }

  addImageEnhancements() {
    document.addEventListener('error', (e) => {
      const t = e.target;
      if (t.tagName === 'IMG') {
        t.alt = (t.alt || '') + ' (no disponible)';
        t.style.opacity = '.3';
      }
    }, true);
  }

  async recargar() {
    await this.cargarEntradasDesdeCSV();
  }
}

/* ====== Carrusel Pro – Inicializador (fade + autoHeight) ====== */
function initCarouselPro(root) {
  root.querySelectorAll('.carousel-pro').forEach(carousel => {
    const track = carousel.querySelector('.carousel-track');
    const slides = Array.from(track.children);
    const prevBtn = carousel.querySelector('.carousel-btn.prev');
    const nextBtn = carousel.querySelector('.carousel-btn.next');
    const dots = Array.from(carousel.querySelectorAll('.carousel-indicators button'));

    let index = 0;

    function activeMedia() {
      const s = slides[index];
      return s ? (s.querySelector('img,iframe,video') || s) : null;
    }

    function setAutoHeight() {
      const media = activeMedia();
      if (!media) return;
      // esperar layout
      requestAnimationFrame(() => {
        const h = media.getBoundingClientRect().height || media.naturalHeight || 0;
        if (h) {
          carousel.style.height = h + 'px';
        }
      });
    }

    function go(n) {
      index = (n + slides.length) % slides.length;
      slides.forEach((s, i) => s.classList.toggle('active', i === index));
      dots.forEach((d, i) => d.classList.toggle('active', i === index));
      setAutoHeight();
    }

    prevBtn?.addEventListener('click', () => go(index - 1));
    nextBtn?.addEventListener('click', () => go(index + 1));
    dots.forEach((d, i) => d.addEventListener('click', () => go(i)));

    // Gestos táctiles / puntero
    let startX = 0, isDown = false, pid = null;
    track.addEventListener('pointerdown', e => { isDown = true; startX = e.clientX; pid = e.pointerId; track.setPointerCapture(pid); });
    track.addEventListener('pointerup', e => {
      if (!isDown) return; isDown = false;
      const dx = e.clientX - startX;
      if (dx > 50) go(index - 1);
      else if (dx < -50) go(index + 1);
      try { track.releasePointerCapture(pid); } catch {}
    });
    track.addEventListener('pointercancel', () => { isDown = false; });

    // Teclado
    carousel.setAttribute('tabindex', '0');
    carousel.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') go(index - 1);
      if (e.key === 'ArrowRight') go(index + 1);
    });

    // Ajustar altura al cargar cada media
    slides.forEach(s => {
      const m = s.querySelector('img,iframe,video');
      if (!m) return;
      m.addEventListener('load', setAutoHeight, { once: false });
      if (m.tagName === 'IMG' && m.complete) setAutoHeight();
    });

    go(0);
  });
}

/* ====== Integración básica con e‑commerce ====== */
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

/* ====== Datos ====== */
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJwvzHZQN3CQarSDqjk_nShegf8F4ydARvkSK55VabxbCi9m8RuGf2Nyy9ScriFRfGdhZd0P54VS5z/pub?gid=127717360&single=true&output=csv';

/* ====== Boot ====== */
let blogManager;
document.addEventListener('DOMContentLoaded', async () => {
  blogManager = new BlogManager();
  await blogManager.init();
  new BlogEcommerceIntegration();

  // Auto‑refresh suave
  setInterval(() => blogManager.recargar(), 120000);

  // Año footer
  const y = document.getElementById('current-year');
  if (y) y.textContent = new Date().getFullYear();
});

// API reintentar
window.recargarBlog = () => blogManager?.recargar();
