/*********************************************************
 * Blog Patofelting – Carrusel Pro (slide + auto‑height)
 * Limpio y robusto
 **********************************************************/

class BlogUtils {
  static formatearFecha(fecha) {
    if (!fecha) return '';
    const [d, m, y] = fecha.split('/');
    return `${d}/${m}/${y}`;
  }

  static mostrarMensajeError() {
    const c = document.getElementById('main-content');
    if (!c) return;
    c.innerHTML = `
      <div class="blog-error" role="alert">
        <span class="error-icon">❌</span>
        <div class="error-message">Hubo un error al cargar las entradas. Por favor, intenta de nuevo.</div>
        <button class="retry-button" onclick="window.recargarBlog()">Reintentar</button>
      </div>`;
  }

  static mostrarMensajeVacio() {
    const c = document.getElementById('main-content');
    if (!c) return;
    c.innerHTML = `
      <div class="blog-error">
        <span class="error-icon">📝</span>
        <div class="error-message">No hay historias para mostrar aún. ¡Vuelve pronto!</div>
      </div>`;
  }

  // Acepta URLs separadas por comas y/o espacios; filtra las inválidas
  static limpiarURLs(urls) {
    return (urls || '')
      .split(/[\s,]+/)
      .map(u => u.trim())
      .filter(u => /^https?:\/\//i.test(u));
  }

  static calculateReadingTime() {
    const m = document.querySelector('.blog-main');
    if (!m) return 1;
    const words = m.textContent.trim().split(/\s+/).length;
    return Math.max(1, Math.ceil(words / 200));
  }
}

/* ====== Efectos suaves (tema + stitch + tiempo lectura) ====== */
class PremiumEffects {
  static init() {
    const io = new IntersectionObserver((es) => {
      es.forEach(e => { if (e.isIntersecting) e.target.classList.add('stitch-animation'); });
    }, { threshold: 0.4 });
    document.querySelectorAll('.entry-title').forEach(t => io.observe(t));

    const nav = document.querySelector('.nav-container');
    if (nav && !document.getElementById('theme-toggle')) {
      const b = document.createElement('button');
      b.id = 'theme-toggle';
      b.className = 'theme-toggle';
      b.type = 'button';
      b.setAttribute('aria-label', 'Cambiar tema');
      b.textContent = 'Tema: Artesanal';
      b.addEventListener('click', () => PremiumEffects.cycleTheme());
      nav.appendChild(b);
    }

    const rt = BlogUtils.calculateReadingTime();
    const el = document.createElement('div');
    el.className = 'reading-time';
    el.innerHTML = `<span>📖 ${rt} min</span>`;
    document.body.appendChild(el);
  }

  static cycleTheme() {
    const themes = ['default', 'acuarela', 'lana'];
    const cur = document.documentElement.getAttribute('data-theme') || 'default';
    const next = themes[(themes.indexOf(cur) + 1) % themes.length];
    if (next === 'default') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('pf_theme', next);
  }

  static restoreTheme() {
    const s = localStorage.getItem('pf_theme');
    if (s && s !== 'default') document.documentElement.setAttribute('data-theme', s);
  }
}

/* ===================== Manager ===================== */
class BlogManager {
  constructor() { this.entradas = []; }

  async init() {
    PremiumEffects.restoreTheme();
    await this.cargarEntradasDesdeCSV();
    this.addImageEnhancements();
    PremiumEffects.init();
  }

  async cargarEntradasDesdeCSV() {
    try {
      const r = await fetch(CSV_URL, { cache: 'reload' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const txt = await r.text();

      const res = Papa.parse(txt, {
        header: true,
        skipEmptyLines: true,
        transform: v => (v || '').toString().trim()
      });

      this.entradas = res.data
        .filter(f => f.titulo && f.contenido)
        .map((f, i) => ({
          id: f.id || String(i),
          fecha: f.fecha || '',
          titulo: f.titulo,
          contenido: f.contenido,
          imagenes: BlogUtils.limpiarURLs(f.imagenPrincipal || ''),
          videos: BlogUtils.limpiarURLs(f.videoURL || ''),
          orden: parseInt(f.orden) || 0,
          postit: f.postit || '',
          ordenpostit: parseInt(f.ordenpostit) || 0
        }))
        .sort((a, b) => a.orden - b.orden);

      this.renderizarBlog();
    } catch (e) {
      console.error('Error CSV', e);
      BlogUtils.mostrarMensajeError();
    }
  }

  renderizarBlog() {
    const cont = document.getElementById('main-content');
    const tpl  = document.getElementById('entry-template');
    const loader = document.getElementById('blog-loading');
    if (loader) loader.style.display = 'none';
    if (!cont || !tpl || !tpl.content) return;

    cont.innerHTML = '';
    if (this.entradas.length === 0) { BlogUtils.mostrarMensajeVacio(); return; }

    this.entradas.forEach(entrada => {
      const clone = tpl.content.cloneNode(true);
      const article = clone.querySelector('.blog-entry');
      article.setAttribute('data-entry-id', entrada.id);

      clone.querySelector('.entry-title').textContent = entrada.titulo;
      clone.querySelector('.entry-date').textContent  = BlogUtils.formatearFecha(entrada.fecha);

      const texto = clone.querySelector('.entry-text');
      entrada.contenido.split('\n').forEach(linea => {
        if (!linea.trim()) return;
        const p = document.createElement('p');
        p.className = 'notebook-line';
        p.textContent = linea.trim();
        texto.appendChild(p);
      });

      /* ------ Carrusel Pro (slide) ------ */
      const gallery = clone.querySelector('.media-gallery');
      const media = [];
      (entrada.imagenes || []).forEach((u, i) => media.push({ type: 'img', url: u, alt: `${entrada.titulo} — imagen ${i + 1}` }));
      (entrada.videos   || []).forEach((u, i) => media.push({ type: 'video', url: u, alt: `${entrada.titulo} — video ${i + 1}` }));

      if (media.length) {
        const carousel = document.createElement('div');
        carousel.className = 'carousel-pro'; // usa modo slide de CSS

        const track = document.createElement('div');
        track.className = 'carousel-track';
        carousel.appendChild(track);

        media.forEach((m, i) => {
          const slide = document.createElement('div');
          slide.className = 'carousel-slide' + (i === 0 ? ' active' : '');

          if (m.type === 'img') {
            const img = document.createElement('img');
            img.src = m.url;
            img.alt = m.alt;
            img.loading = 'lazy';
            img.decoding = 'async';
            slide.appendChild(img);
          } else {
            const iframe = document.createElement('iframe');
            iframe.src = m.url;
            iframe.loading = 'lazy';
            iframe.title = m.alt;
            iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
            iframe.setAttribute('allowfullscreen', '');
            slide.appendChild(iframe);
          }

          track.appendChild(slide);
        });

        const nav = document.createElement('div');
        nav.className = 'carousel-nav';
        nav.innerHTML = `
          <button class="carousel-btn prev" aria-label="Anterior">❮</button>
          <button class="carousel-btn next" aria-label="Siguiente">❯</button>`;

        const dots = document.createElement('div');
        dots.className = 'carousel-indicators';
        media.forEach((_, i) => {
          const b = document.createElement('button');
          if (i === 0) b.classList.add('active');
          b.setAttribute('aria-label', 'Ir al slide ' + (i + 1));
          dots.appendChild(b);
        });

        carousel.appendChild(nav);
        carousel.appendChild(dots);
        gallery.appendChild(carousel);
      } else {
        gallery.remove();
      }

      // Post-it opcional
      if (entrada.postit) {
        const entryContent = clone.querySelector('.entry-content');
        const wrap = document.createElement('div');
        wrap.className = 'postit-container';
        const postit = document.createElement('div');
        postit.className = 'postit';
        postit.textContent = entrada.postit;
        postit.setAttribute('tabindex', '0');
        wrap.appendChild(postit);
        entryContent.prepend(wrap);
      }

      cont.appendChild(clone);
    });

    initCarouselPro(cont);
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

  async recargar() { await this.cargarEntradasDesdeCSV(); }
}

/* ====== Inicializador Carrusel (slide + autoHeight) ====== */
function initCarouselPro(root) {
  root.querySelectorAll('.carousel-pro').forEach(carousel => {
    const track = carousel.querySelector('.carousel-track');
    const slides = Array.from(track.children);
    const prev   = carousel.querySelector('.carousel-btn.prev');
    const next   = carousel.querySelector('.carousel-btn.next');
    const dots   = Array.from(carousel.querySelectorAll('.carousel-indicators button'));
    let index = 0;

    function setAutoHeight() {
      const s = slides[index];
      const m = s?.querySelector('img,iframe,video') || s;
      requestAnimationFrame(() => {
        const h = m.getBoundingClientRect().height || m.naturalHeight || 0;
        if (h) carousel.style.height = h + 'px';
      });
    }

    function update() {
      track.style.transform = `translateX(-${index * 100}%)`;
      slides.forEach((s, i) => s.classList.toggle('active', i === index));
      dots.forEach((d, i)   => d.classList.toggle('active', i === index));
      setAutoHeight();
    }

    function go(n) {
      index = (n + slides.length) % slides.length;
      update();
    }

    prev?.addEventListener('click', () => go(index - 1));
    next?.addEventListener('click', () => go(index + 1));
    dots.forEach((d, i) => d.addEventListener('click', () => go(i)));

    // Gestos táctiles
    let startX = 0, down = false, pid = null;
    track.addEventListener('pointerdown', e => { down = true; startX = e.clientX; pid = e.pointerId; track.setPointerCapture(pid); });
    track.addEventListener('pointerup', e => {
      if (!down) return; down = false;
      const dx = e.clientX - startX;
      if (dx > 50) go(index - 1);
      else if (dx < -50) go(index + 1);
      try { track.releasePointerCapture(pid); } catch {}
    });
    track.addEventListener('pointercancel', () => { down = false; });

    // Teclado
    carousel.setAttribute('tabindex', '0');
    carousel.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft')  go(index - 1);
      if (e.key === 'ArrowRight') go(index + 1);
    });

    // Altura inicial al cargar medios
    slides.forEach(s => {
      const m = s.querySelector('img,iframe,video');
      if (!m) return;
      m.addEventListener('load', setAutoHeight);
      if (m.tagName === 'IMG' && m.complete) setAutoHeight();
    });

    update();
  });
}

/* ====== Ecommerce hooks ====== */
class BlogEcommerceIntegration {
  constructor() { this.addProductLinks(); this.addCallToActionTracking(); }
  addProductLinks() {
    document.querySelectorAll('[data-product]').forEach(m => {
      const id = m.dataset.product;
      m.addEventListener('click', () => { window.location.href = `index.html#productos?highlight=${id}`; });
      m.style.cursor = 'pointer';
    });
  }
  addCallToActionTracking() {
    document.querySelectorAll('.cta-button-blog').forEach(cta => {
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

  setInterval(() => blogManager.recargar(), 120000); // auto‑refresh suave

  const y = document.getElementById('current-year');
  if (y) y.textContent = new Date().getFullYear();
});

window.recargarBlog = () => blogManager?.recargar();
