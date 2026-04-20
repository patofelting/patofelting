/*********************************************************
 * Blog Patofelting – JS con Carrusel Pro (slide + auto‑height)
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

  // Acepta URLs separadas por comas (como venías usando)
  // Si querés, podés mejorarla a split por coma o espacios.
  static limpiarURLs(urls) {
    return (urls || '')
      .split(',')
      .map(url => url.trim())
      .filter(url => url);
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
    this.addScrollEffects?.();
    this.addImageLazyLoading?.();
    this.addVideoPlayPause?.();
    this.addTouchInteractions?.();
    this.addReadingProgress?.();
    this.initializeAnimations?.();
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
        transform: (value) => (value || '').toString().trim(),
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

      // === CARRUSEL PRO (slide + auto‑height) ===
      const gallery = clone.querySelector('.media-gallery'); // existe en tu template
      const sources = [];

      (entrada.imagenes || []).forEach((url, idx) => {
        sources.push({ type: 'img', url, alt: `${entrada.titulo} — imagen ${idx + 1}` });
      });
      (entrada.videos || []).forEach((url, idx) => {
        sources.push({ type: 'video', url, alt: `${entrada.titulo} — video ${idx + 1}` });
      });

      if (sources.length > 0) {
        const carousel = document.createElement('div');
        carousel.className = 'carousel-pro'; // modo slide

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
        // sin media: no dejamos hueco
        gallery.remove();
      }

      // Post-it (si viene texto)
      if (entrada.postit) {
        const postitContainer = clone.querySelector('.postit-container') || clone.querySelector('.entry-content');
        const postit = document.createElement('div');
        postit.className = 'postit';
        postit.textContent = entrada.postit;
        postit.setAttribute('draggable', 'true');
        postitContainer.appendChild(postit);

        // Drag & drop simple
        postit.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', postit.outerHTML);
          postit.classList.add('dragging');
        });
        postit.addEventListener('dragend', () => postit.classList.remove('dragging'));

        entryElement.addEventListener('dragover', (e) => e.preventDefault());
        entryElement.addEventListener('drop', (e) => {
          e.preventDefault();
          const data = e.dataTransfer.getData('text/plain');
          const wrap = document.createElement('div');
          wrap.innerHTML = data;
          const newPostit = wrap.querySelector('.postit');
          newPostit.style.position = 'absolute';
          newPostit.style.left = `${e.pageX - entryElement.offsetLeft}px`;
          newPostit.style.top = `${e.pageY - entryElement.offsetTop}px`;
          entryElement.appendChild(newPostit);
          postit.remove();
        });
      }

      contenedor.appendChild(clone);
    });

    // Inicializar todos los carruseles ya renderizados
    initCarouselPro(contenedor);
  }

  // Colores del post‑it
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

      postit.addEventListener('mouseenter', () => { colorOptions.style.display = 'block'; });
      postit.addEventListener('mouseleave', () => {
        setTimeout(() => { if (!postit.matches(':hover')) colorOptions.style.display = 'none'; }, 500);
      });
    });
  }
}

/* ====== Carrusel Pro – Inicializador (slide + autoHeight) ====== */
function initCarouselPro(root) {
  root.querySelectorAll('.carousel-pro').forEach(carousel => {
    const track  = carousel.querySelector('.carousel-track');
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

    // Gestos (pointer)
    let startX = 0, down = false, pid = null;
    track.addEventListener('pointerdown', e => {
      down = true; startX = e.clientX; pid = e.pointerId; track.setPointerCapture(pid);
    });
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

/* ====== Integración e‑commerce ====== */
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

/* ====== Datos ====== */
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJwvzHZQN3CQarSDqjk_nShegf8F4ydARvkSK55VabxbCi9m8RuGf2Nyy9ScriFRfGdhZd0P54VS5z/pub?gid=127717360&single=true&output=csv';

/* ====== Boot ====== */
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
      blogManager.recargar?.();
    }
  }, 60000);

  console.log('✨ Blog de Patofelting cargado correctamente');
});

// API reintentar
window.BlogUtils = BlogUtils;
window.recargarBlog = () => { blogManager?.recargar?.(); };

/* ====== Extras post-it persistencia (opcional, como tenías) ====== */
document.querySelectorAll('.color-option').forEach(btn => {
  btn.addEventListener('click', function() {
    const color = window.getComputedStyle(this).backgroundColor;
    const postit = this.closest('.postit');
    if (!postit) return;
    postit.style.background = color;

    const id = postit.dataset.id;
    const pos = { left: postit.style.left, top: postit.style.top };
    if (id) localStorage.setItem('postit_' + id, JSON.stringify({ color, ...pos }));
  });
});

document.querySelectorAll('.postit').forEach(postit => {
  postit.onmousedown = function(e) {
    let shiftX = e.clientX - postit.getBoundingClientRect().left;
    let shiftY = e.clientY - postit.getBoundingClientRect().top;
    postit.classList.add('dragging');
    function moveAt(pageX, pageY) {
      postit.style.left = pageX - shiftX + 'px';
      postit.style.top = pageY - shiftY + 'px';
    }
    function onMouseMove(ev) { moveAt(ev.pageX, ev.pageY); }
    document.addEventListener('mousemove', onMouseMove);
    postit.onmouseup = function() {
      document.removeEventListener('mousemove', onMouseMove);
      postit.onmouseup = null;
      postit.classList.remove('dragging');
      const id = postit.dataset.id;
      const color = postit.style.background;
      if (id) {
        localStorage.setItem('postit_' + id, JSON.stringify({
          color,
          left: postit.style.left,
          top: postit.style.top
        }));
      }
    };
  };
  postit.ondragstart = () => false;

  const id = postit.dataset.id;
  const saved = id ? localStorage.getItem('postit_' + id) : null;
  if (saved) {
    const data = JSON.parse(saved);
    if (data.color) postit.style.background = data.color;
    if (data.left)  postit.style.left = data.left;
    if (data.top)   postit.style.top = data.top;
  }
});
