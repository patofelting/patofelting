/* =========================================================
   Blog Patofelting — CSV → UI + Post-its + Reacciones + Comentarios
   - Funciona con Firebase (compat) si está configurado
   - Si no hay Firebase, usa localStorage (todos los features siguen andando)
========================================================= */

/* ---------- CONFIG ---------- */
const CSV_URL = window.BLOG_CSV_URL || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJwvzHZQN3CQarSDqjk_nShegf8F4ydARvkSK55VabxbCi9m8RuGf2Nyy9ScriFRfGdhZd0P54VS5z/pub?gid=127717360&single=true&output=csv';

const HAS_FIREBASE = !!(window.firebaseCompatDb && window.firebaseCompatAuth && window.firebaseFirestore);
const ADMIN = (() => {
  const q = new URLSearchParams(location.search);
  if (q.has('pfadmin')) {
    const on = q.get('pfadmin') === '1';
    localStorage.setItem('pf_admin', on ? '1' : '0');
    return on;
  }
  return localStorage.getItem('pf_admin') === '1';
})();

const LS_KEYS = {
  reactions: 'pf_reactions_v2',
  postits: 'pf_postits_v2',
  comments: (id) => `pf_comments_${id}_v2`,
  lastCommentAt: 'pf_last_comment_ts'
};

const PATHS = {
  reactions: (id) => `/blog/reactions/${id}`,
  reactionsByUser: (id, uid) => `/blog/reactionsByUser/${id}/${uid}`,
  favorites: (id, uid) => `/blog/favorites/${id}/${uid}`,
  comments: (id) => `/blog/comments/${id}`,
  // Firestore collections
  firestoreComments: 'comments'
};

/* ---------- UTILS ---------- */
const BlogUtils = {
  formatearFecha(fecha) {
    if (!fecha) return '';
    const [d, m, y] = fecha.split('/');
    return `${d}/${m}/${y}`;
  },
  mostrarMensajeError() {
    const c = document.getElementById('main-content');
    if (!c) return;
    c.innerHTML = `
      <div class="blog-error" style="padding:2rem;text-align:center">
        <div class="error-message">
          Hubo un error al cargar las entradas.
          <button class="retry-button" onclick="window.recargarBlog()">Reintentar</button>
        </div>
      </div>`;
  },
  mostrarMensajeVacio() {
    const c = document.getElementById('main-content');
    if (!c) return;
    c.innerHTML = `
      <div class="blog-error" style="padding:2rem;text-align:center">
        <div class="error-message">No hay historias para mostrar aún. ¡Vuelve pronto!</div>
      </div>`;
  },
  limpiarURLs(urls) {
    return (urls || '').split(',').map(u => u.trim()).filter(Boolean);
  },
  calculateReadingTime() {
    const blogMain = document.querySelector('.blog-main');
    if (!blogMain) return 1;
    const text = blogMain.textContent || '';
    const words = text.trim().split(/\s+/).length;
    return Math.max(1, Math.ceil(words / 200));
  },
  sanitize(s) {
    return (s || '').replace(/[<>]/g, '');
  },
  initCarousel(container) {
    const carousel = container.querySelector('.carousel');
    if (!carousel) return;
    const items = carousel.querySelectorAll('.carousel-item');
    const prev = carousel.querySelector('.carousel-prev');
    const next = carousel.querySelector('.carousel-next');
    let i = 0;
    const show = (k) => items.forEach((it, idx) => it.classList.toggle('active', idx === k));
    prev?.addEventListener('click', () => { i = (i - 1 + items.length) % items.length; show(i); });
    next?.addEventListener('click', () => { i = (i + 1) % items.length; show(i); });
    show(i);
  }
};

/* ---------- BLOG MANAGER ---------- */
class BlogManager {
  constructor() {
    this.uid = null;
    this.entradas = [];
    this.init();
  }

  async init() {
    if (HAS_FIREBASE) {
      window.firebaseCompatAuth.onAuthStateChanged(user => { 
        this.uid = user ? user.uid : null;
        console.log('Usuario Firebase:', this.uid ? 'Conectado' : 'Desconectado');
      });
    }

    await this.cargarEntradasDesdeCSV();
    this.addImageLazyLoading();
    this.addVideoPlayPause();
    this.buildIndex();
    this.initReactions();
    this.enablePostits();
    this.initCommentsAll();
    this.injectJSONLD();
    this.wireIndexMobile();

    // Tiempo de lectura
    setTimeout(() => {
      const t = BlogUtils.calculateReadingTime();
      const el = document.createElement('div');
      el.className = 'reading-time';
      el.innerHTML = `<span>📖 Tiempo de lectura: ${t} min</span>`;
      Object.assign(el.style, {
        position: 'fixed', bottom: '20px', left: '20px', background: 'white',
        padding: '0.5rem 1rem', borderRadius: '25px',
        boxShadow: '0 4px 15px rgba(0,0,0,0.1)', fontSize: '.9rem',
        color: 'var(--pencil-gray)', zIndex: 1000
      });
      document.body.appendChild(el);
    }, 600);

    // Botón de exportación para admin
    if (ADMIN) {
      const adminBtn = document.createElement('button');
      adminBtn.textContent = '📤 Exportar comentarios';
      adminBtn.style.position = 'fixed';
      adminBtn.style.bottom = '60px';
      adminBtn.style.right = '20px';
      adminBtn.style.zIndex = '1000';
      adminBtn.style.padding = '0.5rem 1rem';
      adminBtn.style.background = '#fff';
      adminBtn.style.borderRadius = '25px';
      adminBtn.style.boxShadow = '0 4px 15px rgba(0,0,0,0.1)';
      adminBtn.addEventListener('click', () => {
        const comments = this.exportAllComments();
        prompt('Copia todos los comentarios (JSON):', JSON.stringify(comments, null, 2));
      });
      document.body.appendChild(adminBtn);
    }
  }

  exportAllComments() {
    const all = {};
    this.entradas.forEach(entrada => {
      const key = LS_KEYS.comments(entrada.id);
      const comments = JSON.parse(localStorage.getItem(key) || '[]');
      if (comments.length) all[entrada.id] = comments;
    });
    
    // Si hay Firebase, también exportar comentarios de Firestore
    if (HAS_FIREBASE) {
      console.log('Exportando comentarios desde Firestore...');
      window.firebaseFirestore.collection(PATHS.firestoreComments)
        .get()
        .then(snapshot => {
          const firestoreComments = {};
          snapshot.docs.forEach(doc => {
            const data = doc.data();
            if (!firestoreComments[data.postId]) {
              firestoreComments[data.postId] = [];
            }
            firestoreComments[data.postId].push({
              id: doc.id,
              ...data
            });
          });
          console.log('Comentarios de Firestore:', firestoreComments);
          console.log('Comentarios de localStorage:', all);
        })
        .catch(console.error);
    }
    
    console.log('Todos los comentarios (localStorage):', all);
    return all;
  }

  /* ===== DATOS ===== */
  async cargarEntradasDesdeCSV() {
    try {
      if (!window.Papa) throw new Error('PapaParse no está cargado');
      const resp = await fetch(CSV_URL, { cache: 'reload' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} - ${resp.statusText}`);
      const texto = await resp.text();
      const parsed = Papa.parse(texto, { header: true, skipEmptyLines: true, transform: v => (v ?? '').trim() });

      this.entradas = parsed.data
        .filter(f => f.titulo && f.contenido)
        .map((f, i) => ({
          id: f.id || String(i),
          fecha: f.fecha || '',
          titulo: f.titulo,
          contenido: f.contenido,
          imagenes: BlogUtils.limpiarURLs(f.imagenPrincipal || ''),
          videos: BlogUtils.limpiarURLs(f.videoURL || ''),
          orden: parseInt(f.orden) || i,
          postit: f.postit || '',
          ordenpostit: parseInt(f.ordenpostit) || 0
        }))
        .sort((a, b) => a.orden - b.orden);

      this.renderizarBlog();
    } catch (e) {
      console.error('CSV error:', e);
      BlogUtils.mostrarMensajeError();
    }
  }

  /* ===== RENDER ===== */
  renderizarBlog() {
    const wrap = document.getElementById('blog-entries');
    const tmpl = document.getElementById('entry-template');
    const loader = document.getElementById('blog-loading');
    if (!wrap || !tmpl?.content) return;

    if (loader) loader.style.display = 'none';
    wrap.innerHTML = '';

    if (!this.entradas.length) { BlogUtils.mostrarMensajeVacio(); return; }

    this.entradas.forEach((entrada) => {
      const frag = tmpl.content.cloneNode(true);
      const entry = frag.querySelector('.blog-entry');
      entry.setAttribute('data-entry-id', entrada.id);
      entry.id = `entry-${entrada.id}`;

      // Fecha + título
      frag.querySelector('.entry-title').textContent = entrada.titulo;
      frag.querySelector('.entry-date').textContent = BlogUtils.formatearFecha(entrada.fecha);

      // Contenido
      const texto = frag.querySelector('.entry-text');
      entrada.contenido.split('\n').forEach(linea => {
        const t = linea.trim();
        if (!t) return;
        const p = document.createElement('p');
        p.className = 'notebook-line';
        p.textContent = t;
        texto.appendChild(p);
      });

      const content = frag.querySelector('.entry-content');

      // Media
      let media = content.querySelector('.media-gallery');
      if (!media) {
        media = document.createElement('div');
        media.className = 'media-gallery';
        content.appendChild(media);
      }

      // Imágenes → carrusel
      if (entrada.imagenes?.length) {
        const c = document.createElement('div');
        c.className = 'carousel';
        entrada.imagenes.forEach((url, i) => {
          const it = document.createElement('div');
          it.className = `carousel-item ${i === 0 ? 'active' : ''}`;
          const pol = document.createElement('div'); pol.className = 'photo-polaroid';
          const img = document.createElement('img');
          img.className = 'entrada-imagen';
          img.src = url;
          img.alt = `${entrada.titulo} — imagen ${i + 1}`;
          img.loading = 'lazy';
          pol.appendChild(img);
          it.appendChild(pol);
          c.appendChild(it);
        });
        if (entrada.imagenes.length > 1) {
          const prev = document.createElement('button'); prev.className = 'carousel-prev'; prev.textContent = '◄';
          const next = document.createElement('button'); next.className = 'carousel-next'; next.textContent = '►';
          c.appendChild(prev); c.appendChild(next);
        }
        media.appendChild(c);
      }

      // Videos
      if (entrada.videos?.length) {
        entrada.videos.forEach(url => {
          const v = document.createElement('iframe');
          v.className = 'entrada-video';
          v.src = url;
          v.loading = 'lazy';
          v.allowFullscreen = true;
          v.setAttribute('title', entrada.titulo);
          media.appendChild(v);
        });
      }

      wrap.appendChild(frag);
    });

    // Extras tras render
    this.addImageLazyLoading();
    this.addVideoPlayPause();
    this.buildIndex();
    this.initReactions();
    this.enablePostits();
    this.initCommentsAll();
    this.injectJSONLD();
  }

  /* ===== ÍNDICE ===== */
  buildIndex() {
    const nav = document.getElementById('blog-index');
    if (!nav) return;
    const entries = document.querySelectorAll('.blog-entry');
    const ul = document.createElement('ul');
    entries.forEach((e, i) => {
      const id = e.getAttribute('data-entry-id') || `e${i}`;
      const t = e.querySelector('.entry-title')?.textContent?.trim() || `Entrada ${i + 1}`;
      const li = document.createElement('li'); 
      const a = document.createElement('a');
      a.href = `#entry-${id}`; 
      a.textContent = t;
      a.addEventListener('click', (ev) => { 
        ev.preventDefault(); 
        document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth' }); 
      });
      li.appendChild(a); 
      ul.appendChild(li);
    });
    nav.innerHTML = ''; 
    nav.appendChild(ul);
  }

  wireIndexMobile() {
    const btn = document.querySelector('.index-toggle');
    const index = document.getElementById('blog-index');
    const overlay = document.getElementById('blog-index-overlay');
    if (!btn || !index || !overlay) return;
    const toggle = (open) => {
      index.classList.toggle('menu-mobile-open', open);
      overlay.classList.toggle('hidden', !open);
      btn.setAttribute('aria-expanded', String(open));
    };
    btn.addEventListener('click', () => toggle(!index.classList.contains('menu-mobile-open')));
    overlay.addEventListener('click', () => toggle(false));
  }

  /* ===== REACCIONES ===== */
  initReactions() {
    const cache = JSON.parse(localStorage.getItem(LS_KEYS.reactions) || '{}');

    document.querySelectorAll('.blog-entry').forEach(entry => {
      const id = entry.getAttribute('data-entry-id');
      const wrap = entry.querySelector('.entry-reactions');
      if (!wrap) return;

      const emojiBtns = wrap.querySelectorAll('[data-emoji]');
      const favBtn = wrap.querySelector('.entry-fav');

      if (HAS_FIREBASE) {
        // Contadores live
        window.firebaseCompatDb.ref(PATHS.reactions(id)).on('value', snap => {
          const counts = snap.val() || {};
          emojiBtns.forEach(btn => {
            const emoji = btn.dataset.emoji;
            btn.querySelector('span').textContent = counts[emoji] || 0;
          });
        });

        const setPressed = (flags = {}) => {
          emojiBtns.forEach(btn => {
            const emoji = btn.dataset.emoji;
            btn.setAttribute('aria-pressed', String(!!flags[emoji]));
          });
        };
        const setFav = (v) => {
          favBtn?.classList.toggle('active', !!v);
          favBtn?.setAttribute('aria-pressed', String(!!v));
        };

        const attachUser = () => {
          const uid = this.uid;
          if (!uid) return;
          window.firebaseCompatDb.ref(PATHS.reactionsByUser(id, uid)).on('value', s => setPressed(s.val() || {}));
          window.firebaseCompatDb.ref(PATHS.favorites(id, uid)).on('value', s => setFav(!!s.val()));
        };
        attachUser();
        if (!this.uid) window.firebaseCompatAuth.onAuthStateChanged(() => attachUser());

        // Clicks
        emojiBtns.forEach(btn => {
          btn.addEventListener('click', async () => {
            const emoji = btn.dataset.emoji;
            const uid = this.uid;
            if (!uid) { alert('Conectando… probá en 1 segundo'); return; }
            const byUserRef = window.firebaseCompatDb.ref(`${PATHS.reactionsByUser(id, uid)}/${emoji}`);
            const exists = (await byUserRef.get()).exists();
            if (exists) return;
            const countRef = window.firebaseCompatDb.ref(`${PATHS.reactions(id)}/${emoji}`);
            await countRef.transaction(n => (typeof n === 'number' ? n : 0) + 1);
            await byUserRef.set(true);
            btn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 180 });
          });
        });

        favBtn?.addEventListener('click', async () => {
          const uid = this.uid;
          if (!uid) { alert('Conectando… probá en 1 segundo'); return; }
          const ref = window.firebaseCompatDb.ref(PATHS.favorites(id, uid));
          const cur = (await ref.get()).val();
          await ref.set(!cur);
        });

      } else {
        // Fallback local
        const state = cache[id] || { '🧶': 0, '✨': 0, fav: false };
        emojiBtns.forEach(btn => {
          const emoji = btn.dataset.emoji;
          btn.querySelector('span').textContent = state[emoji] || 0;
          btn.addEventListener('click', () => {
            state[emoji] = (state[emoji] || 0) + 1;
            btn.querySelector('span').textContent = state[emoji];
            cache[id] = state;
            localStorage.setItem(LS_KEYS.reactions, JSON.stringify(cache));
            btn.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 180 });
          });
        });
        if (favBtn) {
          favBtn.classList.toggle('active', !!state.fav);
          favBtn.setAttribute('aria-pressed', String(!!state.fav));
          favBtn.addEventListener('click', () => {
            state.fav = !state.fav;
            favBtn.classList.toggle('active', state.fav);
            favBtn.setAttribute('aria-pressed', String(state.fav));
            cache[id] = state;
            localStorage.setItem(LS_KEYS.reactions, JSON.stringify(cache));
          });
        }
      }
    });
  }

  /* ===== POST-ITS ===== */
  enablePostits() {
    const store = JSON.parse(localStorage.getItem(LS_KEYS.postits) || '{}');

    document.querySelectorAll('.blog-entry').forEach(entry => {
      const id = entry.getAttribute('data-entry-id');
      const box = entry.querySelector('.postit-container');
      if (!box) return;

      box.style.position = box.style.position || 'relative';

      // Restaurar guardados
      (store[id] || []).forEach(p => box.appendChild(this._renderPostit(box, p, entry)));

      // Botón para crear
      if (!box.querySelector('.postit-add')) {
        const add = document.createElement('button');
        add.textContent = '➕ Post-it';
        add.className = 'postit-add';
        add.addEventListener('click', () => {
          const p = { 
            id: crypto.randomUUID(), 
            text: 'Escribe aquí…', 
            x: 6 + Math.random() * 40, 
            y: 4 + Math.random() * 30, 
            color: '#ffeb3b', 
            w: 220, 
            h: 150 
          };
          box.appendChild(this._renderPostit(box, p, entry));
          this._persistPostits(entry);
        });
        box.appendChild(add);
      }
    });
  }

  _renderPostit(container, p, entryEl) {
    const el = document.createElement('div');
    el.className = 'postit';
    el.dataset.pid = p.id;
    el.style.position = 'absolute';
    el.style.zIndex = '20';
    el.style.cursor = 'grab';
    el.style.background = p.color || '#ffeb3b';
    el.style.left = (typeof p.x === 'number' ? p.x + '%' : p.x || '6%');
    el.style.top = (typeof p.y === 'number' ? p.y + '%' : p.y || '6%');
    if (p.w) el.style.width = (typeof p.w === 'number' ? p.w + 'px' : p.w);
    if (p.h) el.style.height = (typeof p.h === 'number' ? p.h + 'px' : p.h);

    // Barra
    const bar = document.createElement('div');
    bar.className = 'postit-bar';
    bar.style.display = 'flex';
    bar.style.alignItems = 'center';
    bar.style.justifyContent = 'space-between';
    bar.style.gap = '.5rem';
    bar.style.padding = '.25rem .4rem';
    bar.style.cursor = 'grab';
    bar.style.userSelect = 'none';
    bar.style.touchAction = 'none';

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = 'Nota';

    const tools = document.createElement('div');
    tools.className = 'tools';
    tools.style.display = 'flex';
    tools.style.alignItems = 'center';
    tools.style.gap = '.35rem';

    const palette = document.createElement('div');
    palette.className = 'postit-color-options';
    palette.style.display = 'inline-flex';
    palette.style.gap = '.25rem';

    ['#f5eead', '#fca8c4', '#b8f1bb', '#42a5f5'].forEach(c => {
      const dot = document.createElement('span');
      dot.className = 'color-option';
      Object.assign(dot.style, {
        width: '14px', height: '14px', borderRadius: '999px',
        border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,.1)',
        background: c, display: 'inline-block'
      });
      dot.addEventListener('pointerdown', e => e.stopPropagation());
      dot.addEventListener('click', (e) => { 
        e.stopPropagation(); 
        el.style.background = c; 
        this._persistPostits(entryEl); 
      });
      palette.appendChild(dot);
    });

    const btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.title = 'Eliminar';
    btnDel.setAttribute('aria-label', 'Eliminar nota');
    btnDel.textContent = '🗑️';
    btnDel.style.background = 'none';
    btnDel.style.border = '0';
    btnDel.style.cursor = 'pointer';
    btnDel.addEventListener('pointerdown', e => e.stopPropagation());
    btnDel.addEventListener('click', (e) => {
      e.stopPropagation();
      el.remove();
      this._persistPostits(entryEl);
    });

    tools.appendChild(palette);
    tools.appendChild(btnDel);
    bar.appendChild(title);
    bar.appendChild(tools);

    const content = document.createElement('div');
    content.className = 'postit-content';
    content.contentEditable = true;
    content.textContent = p.text || '';
    content.style.padding = '.5rem .6rem .7rem';
    content.style.minHeight = '110px';
    content.style.lineHeight = '1.25';
    content.addEventListener('input', () => this._persistPostits(entryEl));

    el.appendChild(bar);
    el.appendChild(content);

    // Drag
    let dragging = false, offsetX = 0, offsetY = 0;
    const crect = () => container.getBoundingClientRect();

    bar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.tools')) return;
      dragging = true;
      el.classList.add('dragging');
      bar.setPointerCapture?.(e.pointerId);
      const r = el.getBoundingClientRect();
      offsetX = e.clientX - r.left;
      offsetY = e.clientY - r.top;
    });

    bar.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const c = crect();
      let left = e.clientX - c.left - offsetX;
      let top = e.clientY - c.top - offsetY;
      left = Math.max(0, Math.min(left, c.width - el.offsetWidth));
      top = Math.max(0, Math.min(top, c.height - el.offsetHeight));
      el.style.left = (left / c.width) * 100 + '%';
      el.style.top = (top / c.height) * 100 + '%';
    });

    const stop = (e) => {
      if (!dragging) return;
      dragging = false;
      el.classList.remove('dragging');
      bar.releasePointerCapture?.(e.pointerId);
      this._persistPostits(entryEl);
    };
    bar.addEventListener('pointerup', stop);
    bar.addEventListener('pointercancel', stop);

    return el;
  }

  _persistPostits(entryEl) {
    const id = entryEl.getAttribute('data-entry-id');
    const list = [...entryEl.querySelectorAll('.postit')].map(el => {
      const style = getComputedStyle(el);
      return {
        id: el.dataset.pid,
        text: el.querySelector('.postit-content')?.textContent?.trim() || '',
        color: style.backgroundColor,
        x: parseFloat(style.left),
        y: parseFloat(style.top),
        w: parseInt(style.width, 10),
        h: parseInt(style.height, 10)
      };
    });
    const store = JSON.parse(localStorage.getItem(LS_KEYS.postits) || '{}');
    store[id] = list;
    localStorage.setItem(LS_KEYS.postits, JSON.stringify(store));
  }

  /* ===== COMENTARIOS (Firestore) ===== */
  initCommentsAll() {
    document.querySelectorAll('.blog-entry').forEach(entry => {
      const id = entry.getAttribute('data-entry-id');
      const section = entry.querySelector('.entry-comments');
      const list = section.querySelector('.comments-list');
      const form = section.querySelector('.comment-form');

      const render = (comments) => {
        const arr = Array.isArray(comments) ? comments.slice().sort((a, b) => a.timestamp - b.timestamp) : [];
        if (!arr.length) {
          list.innerHTML = '<li class="comment-item"><div class="comment-text">Sé el primero en comentar ✨</div></li>';
          return;
        }
        list.innerHTML = arr.map(c => `
          <li class="comment-item" data-id="${c.id}">
            <div class="comment-meta">
              <span class="comment-name">${c.name || 'Anónimo'}</span>
              <span>•</span>
              <time datetime="${new Date(c.timestamp).toISOString()}">${new Date(c.timestamp).toLocaleString()}</time>
              ${ADMIN ? `<button class="comment-del" data-id="${c.id}" title="Eliminar">🗑️</button>` : ''}
            </div>
            <div class="comment-text">${c.text}</div>
          </li>
        `).join('');

        if (ADMIN) {
          list.querySelectorAll('.comment-del').forEach(btn => {
            btn.addEventListener('click', async () => {
              const cid = btn.dataset.id;
              if (!confirm('¿Eliminar comentario?')) return;
              if (HAS_FIREBASE) {
                try {
                  await window.firebaseFirestore.collection(PATHS.firestoreComments)
                    .where('postId', '==', id)
                    .where('id', '==', cid)
                    .get()
                    .then(snapshot => {
                      snapshot.docs[0]?.ref.delete();
                    });
                } catch (error) {
                  console.error('Error eliminando comentario de Firestore:', error);
                }
              } else {
                const key = LS_KEYS.comments(id);
                const current = JSON.parse(localStorage.getItem(key) || '[]').filter(c => c.id !== cid);
                localStorage.setItem(key, JSON.stringify(current));
                render(current);
              }
            });
          });
        }
      };

      // Suscripción / carga con Firestore
      if (HAS_FIREBASE) {
        try {
          window.firebaseFirestore.collection(PATHS.firestoreComments)
            .where('postId', '==', id)
            .orderBy('timestamp', 'asc')
            .onSnapshot(snapshot => {
              const comments = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
              }));
              console.log('Comentarios recibidos de Firestore:', comments);
              render(comments);
            }, err => {
              console.warn('Firestore comments error, fallback to localStorage:', err);
              const ls = JSON.parse(localStorage.getItem(LS_KEYS.comments(id)) || '[]');
              render(ls);
            });
        } catch (error) {
          console.warn('Error inicializando Firestore comments, usando localStorage:', error);
          const ls = JSON.parse(localStorage.getItem(LS_KEYS.comments(id)) || '[]');
          render(ls);
        }
      } else {
        const ls = JSON.parse(localStorage.getItem(LS_KEYS.comments(id)) || '[]');
        render(ls);
      }

      // Publicar comentario
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = BlogUtils.sanitize((form.name.value || 'Anónimo').trim());
        const text = BlogUtils.sanitize((form.text.value || '').trim());
        if (!text) return;

        // Anti-spam simple: 10s
        const last = Number(localStorage.getItem(LS_KEYS.lastCommentAt) || 0);
        if (Date.now() - last < 10_000) { 
          alert('Esperá unos segundos antes de comentar de nuevo 🙏'); 
          return; 
        }

        const comment = { 
          id: crypto.randomUUID(),
          postId: id,
          name, 
          text, 
          timestamp: Date.now(),
          uid: this.uid || null 
        };

        console.log('Publicando comentario:', comment);

        if (HAS_FIREBASE) {
          try {
            // Guardar en Firestore
            await window.firebaseFirestore.collection(PATHS.firestoreComments).add(comment);
            console.log('Comentario guardado en Firestore exitosamente');
          } catch (e) {
            console.error('Error al guardar en Firestore, usando localStorage:', e);
            const key = LS_KEYS.comments(id);
            const arr = JSON.parse(localStorage.getItem(key) || '[]'); 
            arr.push(comment);
            localStorage.setItem(key, JSON.stringify(arr));
            render(arr);
          }
        } else {
          const key = LS_KEYS.comments(id);
          const arr = JSON.parse(localStorage.getItem(key) || '[]'); 
          arr.push(comment);
          localStorage.setItem(key, JSON.stringify(arr));
          render(arr);
        }

        form.reset();
        localStorage.setItem(LS_KEYS.lastCommentAt, String(Date.now()));
      });
    });
  }

  /* ===== MEDIA ===== */
  addImageLazyLoading() {
    const imgs = document.querySelectorAll('.entrada-imagen');
    if (!imgs.length) return;
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        const img = e.target;
        img.decode?.().catch(() => { }).finally(() => img.style.opacity = 1);
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

  /* ===== SEO ===== */
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
    slot.textContent = JSON.stringify({ "@context": "https://schema.org", "@graph": items });
  }

  recargar() { this.cargarEntradasDesdeCSV(); }
}

/* ---------- EXPOSE ---------- */
window.recargarBlog = () => window.blogManager?.recargar();

/* ---------- Arranque ---------- */
let blogManager;
document.addEventListener('DOMContentLoaded', () => {
  blogManager = new BlogManager();
  const y = document.getElementById('current-year');
  if (y) y.textContent = new Date().getFullYear();
});
