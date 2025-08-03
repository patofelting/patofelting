// ========== CONFIGURACIÓN MEJORADA DEL BLOG ==========
const BLOG_CONFIG = {
  CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJwvzHZQN3CQarSDqjk_nShegf8F4ydARvkSK55VabxbCi9m8RuGf2Nyy9ScriFRfGdhZd0P54VS5z/pub?output=csv',
  CACHE_KEY: 'patofelting_blog_cache',
  CACHE_TTL: 3600000, // 1 hora en milisegundos
  LAZY_LOAD_THRESHOLD: 0.1,
  SCROLL_OFFSET: 100
};

class BlogManager {
  constructor() {
    this.entradas = [];
    this.observers = [];
    this.init();
  }

  async init() {
    this.setupServiceWorker();
    await this.loadEntries();
    this.setupUI();
    this.setupEventListeners();
  }

  // ========== MANEJO DE CACHÉ Y SERVICE WORKER ==========
  async setupServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/sw.js');
        console.log('Service Worker registrado correctamente');
      } catch (error) {
        console.warn('Error al registrar Service Worker:', error);
      }
    }
  }

  // ========== CARGA DE ENTRADAS CON CACHÉ ==========
  async loadEntries() {
    try {
      const cachedData = this.getCachedData();
      if (cachedData) {
        this.entradas = cachedData;
        this.renderBlog();
        console.log('✅ Entradas cargadas desde caché');
      }

      const freshData = await this.fetchEntries();
      if (JSON.stringify(freshData) !== JSON.stringify(cachedData)) {
        this.entradas = freshData;
        this.cacheData(freshData);
        this.renderBlog();
        console.log('✅ Entradas actualizadas desde la red');
      }
    } catch (error) {
      console.error('Error al cargar entradas:', error);
      this.showErrorState();
    }
  }

  async fetchEntries() {
    console.log('🔄 Obteniendo entradas desde Google Sheets...');
    const response = await fetch(BLOG_CONFIG.CSV_URL);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const text = await response.text();
    const rows = this.parseCSV(text);
    
    return rows
      .filter(row => row.titulo?.trim())
      .map(row => this.formatEntry(row))
      .sort((a, b) => a.orden - b.orden);
  }

  // ========== MANEJO DE DATOS ==========
  parseCSV(text) {
    // Usar PapaParse si está disponible
    if (typeof Papa !== 'undefined') {
      return Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        transform: value => value?.trim()
      }).data;
    }
    return this.parseCSVManual(text);
  }

  formatEntry(row) {
    return {
      id: row.id || Date.now().toString(),
      fecha: this.formatDate(row.fecha),
      titulo: row.titulo,
      contenido: row.contenido || '',
      imagenPrincipal: row.imagenPrincipal || '',
      videoURL: row.videoURL || '',
      orden: parseInt(row.orden) || 0,
      categoria: row.categoria || 'general'
    };
  }

  // ========== RENDERIZADO DEL BLOG ==========
  renderBlog() {
    const container = document.querySelector('.blog-main');
    if (!container) return;

    if (!this.entradas.length) {
      this.showEmptyState();
      return;
    }

    // Usar template para mejor rendimiento
    const template = document.getElementById('entry-template');
    if (!template) return;

    container.innerHTML = '';
    
    this.entradas.forEach((entry, index) => {
      const isFeatured = index === this.entradas.length - 1;
      const clone = template.content.cloneNode(true);
      
      const article = clone.querySelector('.blog-entry');
      article.dataset.entryId = entry.id;
      if (isFeatured) article.classList.add('featured');
      
      clone.querySelector('.entry-date').textContent = entry.fecha;
      clone.querySelector('.entry-title').textContent = entry.titulo;
      clone.querySelector('.entry-text').innerHTML = this.processContent(entry.contenido);
      
      if (entry.imagenPrincipal || entry.videoURL) {
        const mediaGallery = clone.querySelector('.media-gallery');
        mediaGallery.innerHTML = this.renderMedia(entry);
      }
      
      if (isFeatured) {
        const entryContent = clone.querySelector('.entry-content');
        entryContent.insertAdjacentHTML('beforeend', this.renderCTA());
      }
      
      container.appendChild(clone);
      
      // Lazy loading para imágenes y videos
      this.setupLazyLoading(article);
    });

    this.setupIntersectionObservers();
  }

  // ========== MANEJO DE MEDIA ==========
  renderMedia(entry) {
    let html = '';
    
    if (entry.imagenPrincipal) {
      html += `
        <div class="photo-polaroid">
          <img src="placeholder.jpg" 
               data-src="${entry.imagenPrincipal}" 
               alt="${entry.titulo}" 
               class="entrada-imagen"
               width="500" height="300"
               loading="lazy">
          <div class="polaroid-caption">Momento especial de Patofelting ✨</div>
        </div>
      `;
    }
    
    if (entry.videoURL) {
      html += `
        <div class="video-container">
          <video controls class="entrada-video" preload="none" aria-label="Video: ${entry.titulo}">
            <source src="${entry.videoURL}" type="video/mp4">
            Tu navegador no soporta video HTML5.
          </video>
          <div class="video-caption">Proceso creativo en acción 🎬</div>
        </div>
      `;
    }
    
    return html;
  }

  // ========== INTERSECCIÓN Y OBSERVERS ==========
  setupIntersectionObservers() {
    // Observar entradas para animaciones
    const entryObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('fade-in');
          entryObserver.unobserve(entry.target);
        }
      });
    }, { threshold: BLOG_CONFIG.LAZY_LOAD_THRESHOLD });

    document.querySelectorAll('.blog-entry').forEach(entry => {
      entryObserver.observe(entry);
    });
  }

  // ========== MANEJO DE EVENTOS ==========
  setupEventListeners() {
    // Navegación sticky
    let lastScroll = 0;
    window.addEventListener('scroll', () => {
      const currentScroll = window.pageYOffset;
      const nav = document.querySelector('.blog-nav');
      
      if (currentScroll <= 0) {
        nav.classList.remove('hidden');
      } else if (currentScroll > lastScroll) {
        nav.classList.add('hidden');
      } else {
        nav.classList.remove('hidden');
      }
      
      lastScroll = currentScroll;
    });

    // Mejorar accesibilidad del teclado
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('video').forEach(video => video.pause());
      }
    });
  }

  // ========== MANEJO DE ERRORES ==========
  showErrorState() {
    const container = document.querySelector('.blog-main');
    if (!container) return;

    container.innerHTML = `
      <div class="error-state" aria-live="assertive">
        <div class="notebook-page">
          <div class="red-margin" aria-hidden="true"></div>
          <div class="entry-content">
            <h2>¡Ups! Algo salió mal</h2>
            <p>No pude cargar las entradas del blog en este momento. Por favor, intenta recargar la página.</p>
            <button onclick="window.blogManager.loadEntries()" class="cta-button-blog">
              🔄 Reintentar
            </button>
            <p><small>Si el problema persiste, puedes contactarme directamente.</small></p>
          </div>
        </div>
      </div>
    `;
  }

  // ========== UTILIDADES ==========
  formatDate(dateString) {
    if (!dateString) return new Date().toLocaleDateString('es-ES');
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? dateString : date.toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  }

  // ========== CACHÉ ==========
  getCachedData() {
    const cached = localStorage.getItem(BLOG_CONFIG.CACHE_KEY);
    if (!cached) return null;
    
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > BLOG_CONFIG.CACHE_TTL) return null;
    
    return data;
  }

  cacheData(data) {
    localStorage.setItem(BLOG_CONFIG.CACHE_KEY, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  }

  // ========== API PÚBLICA ==========
  async refresh() {
    await this.loadEntries();
  }
}

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', () => {
  window.blogManager = new BlogManager();
  
  // Año actual en el footer
  document.getElementById('current-year').textContent = new Date().getFullYear();
  
  // Focus management para mejor accesibilidad
  document.getElementById('main-content').setAttribute('tabindex', '-1');
});

// ========== SERVICE WORKER ==========
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('ServiceWorker registration successful');
      })
      .catch(err => {
        console.log('ServiceWorker registration failed: ', err);
      });
  });
}
