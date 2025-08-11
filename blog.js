/* =========================================================
   Blog "El Cuaderno de Patofelting"
   - CSV → UI
   - Reacciones + Favoritos
   - Post-its (mover, color, borrar, persistencia)
   - Comentarios (con eliminación para admin)
   - Lazy images + SEO JSON-LD
   - Firebase (compat) opcional; fallback a localStorage
========================================================= */

/* ============================ CONFIG ============================ */
// Detecta Firebase compat SOLO si hay projectId (evita fatal error)
const FB_PROJECT_ID =
  (window.firebase?.apps?.[0]?.options?.projectId) ||
  (window.firebaseApp?.options?.projectId) ||
  (window.firebaseConfig?.projectId);

const HAS_FIREBASE = !!(
  window.firebaseCompatDb &&
  window.firebaseCompatAuth &&
  FB_PROJECT_ID
);

// Activa modo admin con window.PF_IS_ADMIN = true
// o agregando ?pfadmin=1 a la URL (se guarda en localStorage)
if (new URLSearchParams(location.search).get('pfadmin') === '1') {
  localStorage.setItem('pf_admin', '1');
}
const IS_ADMIN = !!window.PF_IS_ADMIN || localStorage.getItem('pf_admin') === '1';

const LS_KEYS = {
  reactions: 'pf_reactions_v2',
  postits: 'pf_postits_v2',
  comments: (id) => `pf_comments_${id}_v2`,
  lastCommentAt: 'pf_last_comment_ts'
};

const PATHS = {
  reactions: (id) => `/blog/reactions/${id}`,                        // counts { "🧶": n, "✨": m }
  reactionsByUser: (id, uid) => `/blog/reactionsByUser/${id}/${uid}`,// { "🧶": true }
  favorites: (id, uid) => `/blog/favorites/${id}/${uid}`,            // true/false
  comments: (id) => `/blog/comments/${id}`                           // { commentId: {id,name,text,ts,uid} }
};

/* ============================ UTILS ============================ */
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
      <div class="blog-error" style="padding:2rem;text-align:center">
        <div class="error-message">Hubo un error al cargar las entradas.
          <button class="retry-button" onclick="window.recargarBlog()">Reintentar</button>
        </div>
      </div>`;
  }
  static mostrarMensajeVacio() {
    const contenedor = document.getElementById('main-content');
    if (!contenedor) return;
    contenedor.innerHTML = `
      <div class="blog-error" style="padding:2rem;text-align:center">
        <div class="error-message">No hay historias para mostrar aún. ¡Vuelve pronto!</div>
      </div>`;
  }
  static limpiarURLs(urls) {
    return (urls || '').split(',').map(u => u.trim()).filter(Boolean);
  }
  static calculateReadingTime() {
    const blogMain = document.querySelector('.blog-main');
    if (!blogMain) return 1;
    const text = blogMain.textContent || '';
    const words = text.trim().split(/\s+/).length;
    return Math.max(1, Math.ceil(words / 200));
  }
  static initCarousel(mediaBook, images) {
    if (!mediaBook || !images?.length) return;
    const carousel = mediaBook.querySelector('.carousel');
    if (!carousel) return;
    const items = carousel.querySelectorAll('.carousel-item');
    const prev = carousel.querySelector('.carousel-prev');
    const next = carousel.querySelector('.carousel-next');
    let current = 0;
    const show = (i) => items.forEach((it, idx) => it.classList.toggle('active', idx === i));
    prev?.addEventListener('click', () => { current = (current - 1 + items.length) % items.length; show(current); });
    next?.addEventListener('click', () => { current = (current + 1) % items.length; show(current); });
    show(current);
  }
  static sanitize(s){ return (s || '').replace(/[<>]/g, ''); }
}

/* ============================ CORE ============================ */
class BlogManager {
  constructor() {
    this.entradas = [];
    this.uid = null; // auth uid (anónimo si Firebase compat está activo)
    this.init();
  }

  async init() {
    if (HAS_FIREBASE) {
      window.firebaseCompatAuth.onAuthStateChanged(user => { this.uid = user ? user.uid : null; });
    }

    await this.cargarEntradasDesdeCSV();
    this.addImageLazyLoading();
    this.addVideoPlayPause();
    this.buildIndex();
    this.ensurePerEntryUI();     // asegura contenedores (reacciones / postits / comentarios)
    this.initReactions();
    this.enablePostits();
    this.initCommentsAll();
    this.injectJSONLD();
    this.wireIndexMobile();

    setTimeout(() => {
      const readingTime = BlogUtils.calculateReadingTime();
      const timeElement = document.createElement('div');
      timeElement.className = 'reading-time';
      timeElement.innerHTML = `<span>📖 Tiempo de lectura: ${readingTime} min</span>`;
      Object.assign(timeElement.style, {
        position:'fixed',bottom:'20px',left:'20px',background:'white',padding:'0.5rem 1rem',
        borderRadius:'25px',boxShadow:'0 4px 15px rgba(0,0,0,0.1)',fontSize:'.9rem',color:'var(--pencil-gray)',zIndex:1000
      });
      document.body.appendChild(timeElement);
    }, 800);
  }

  /* =============== Datos (CSV) =============== */
  async cargarEntradasDesdeCSV() {
    try {
      const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJwvzHZQN3CQarSDqjk_nShegf8F4ydARvkSK55VabxbCi9m8RuGf2Nyy9ScriFRfGdhZd0P54VS5z/pub?gid=127717360&single=true&output=csv';
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
        .sort((a,b)=>a.orden-b.orden);

      this.renderizarBlog();
    } catch (e) {
      console.error(e);
      BlogUtils.mostrarMensajeError();
    }
  }

  /* =============== Render =============== */
  renderizarBlog() {
    const contenedor = document.getElementById('blog-entries');
    const template = document.getElementById('entry-template');
    const loader = document.getElementById('blog-loading');
    if (!contenedor || !template?.content) return;

    if (loader) loader.style.display = 'none';
    contenedor.innerHTML = '';

    if (!this.entradas.length) { BlogUtils.mostrarMensajeVacio(); return; }

    this.entradas.forEach((entrada) => {
      const clone = template.content.cloneNode(true);
      const entry = clone.querySelector('.blog-entry');
      entry.setAttribute('data-entry-id', entrada.id);
      entry.id = `entry-${entrada.id}`;

      // fecha + título
      clone.querySelector('.entry-title').textContent = entrada.titulo;
      clone.querySelector('.entry-date').textContent = BlogUtils.formatearFecha(entrada.fecha);

      // contenido
      const textoContainer = clone.querySelector('.entry-text');
      entrada.contenido.split('\n').forEach(linea => {
        if (!linea.trim()) return;
        const p = document.createElement('p');
        p.className = 'notebook-line';
        p.textContent = linea.trim();
        textoContainer.appendChild(p);
      });

      // media book
      let mediaBook = clone.querySelector('.media-book');
      if (!mediaBook) {
        mediaBook = document.createElement('div');
        mediaBook.className = 'media-book';
        textoContainer.after(mediaBook);
      }

      // imágenes
      if (entrada.imagenes?.length) {
        const carousel = document.createElement('div');
        carousel.className = 'carousel';
        entrada.imagenes.forEach((url, i) => {
          const item = document.createElement('div');
          item.className = `carousel-item ${i===0?'active':''}`;
          const polaroid = document.createElement('div'); polaroid.className='photo-polaroid';
          const img = document.createElement('img');
          img.src=url; img.alt=`${entrada.titulo} — imagen ${i+1}`; img.loading='lazy'; img.classList.add('entrada-imagen');
          polaroid.appendChild(img); item.appendChild(polaroid); carousel.appendChild(item);
        });
        if (entrada.imagenes.length>1){
          const prev=document.createElement('button');prev.className='carousel-prev';prev.innerHTML='◄';
          const next=document.createElement('button');next.className='carousel-next';next.innerHTML='►';
          carousel.appendChild(prev); carousel.appendChild(next);
        }
        mediaBook.appendChild(carousel);
      }

      // videos
      if (entrada.videos?.length) {
        entrada.videos.forEach(url=>{
          const video=document.createElement('iframe');
          video.src=url; video.className='entrada-video'; video.loading='lazy';
          video.allowFullscreen = true; video.setAttribute('title', entrada.titulo);
          mediaBook.appendChild(video);
        });
      }

      // Post-its (crear contenedor si falta)
      let postitBox = clone.querySelector('.postit-container');
      if (!postitBox) {
        postitBox = document.createElement('div');
        postitBox.className = 'postit-container';
        postitBox.style.position = 'relative';
        textoContainer.after(postitBox);
      }
      if (entrada.postit) {
        const p = { id: crypto.randomUUID(), text: entrada.postit, x: 8, y: 6, color:'#ffeb3b', w: 220, h: 150 };
        postitBox.appendChild(this._renderPostit(postitBox, p, entry)); // ← usa el contenedor del clone
      }

      // Reacciones
      if (!clone.querySelector('.entry-reactions')) {
        const react = document.createElement('div');
        react.className = 'entry-reactions';
        react.innerHTML = `
          <button class="reaction-btn" data-emoji="🧶" aria-pressed="false" title="Reaccionar con lana">🧶 <span>0</span></button>
          <button class="reaction-btn" data-emoji="✨" aria-pressed="false" title="¡Me encanta!">✨ <span>0</span></button>
          <button class="entry-fav" aria-pressed="false" title="Guardar en favoritos">❤</button>
        `;
        mediaBook.after(react);
      }

      // Comentarios
      if (!clone.querySelector('.entry-comments')) {
        const comments = document.createElement('section');
        comments.className = 'entry-comments';
        comments.innerHTML = `
          <ul class="comments-list"></ul>
          <form class="comment-form">
            <input name="name" class="comment-name" placeholder="Tu nombre" autocomplete="name">
            <textarea name="text" class="comment-textarea" placeholder="Escribe tu comentario…" required></textarea>
            <button type="submit">Publicar</button>
          </form>
        `;
        mediaBook.after(comments);
      }

      contenedor.appendChild(clone);

      // activar carrusel
      if (entrada.imagenes?.length) BlogUtils.initCarousel(mediaBook, entrada.imagenes);
    });
  }

  /* =============== TOC =============== */
  buildIndex() {
    const index = document.getElementById('blog-index');
    if (!index) return;
    const entries = document.querySelectorAll('.blog-entry');
    const ul = document.createElement('ul');
    entries.forEach((art,i)=>{
      const id = art.getAttribute('data-entry-id') || `e${i}`;
      const t = art.querySelector('.entry-title')?.textContent?.trim() || `Entrada ${i+1}`;
      const li=document.createElement('li'); const a=document.createElement('a');
      a.href=`#entry-${id}`; a.textContent=t;
      a.addEventListener('click',(e)=>{e.preventDefault();document.querySelector(a.getAttribute('href'))?.scrollIntoView({behavior:'smooth'})});
      li.appendChild(a); ul.appendChild(li);
    });
    index.innerHTML=''; index.appendChild(ul);
  }
  wireIndexMobile() {
    const btn=document.querySelector('.index-toggle');
    const index=document.getElementById('blog-index');
    const overlay=document.getElementById('blog-index-overlay');
    if(!btn||!index||!overlay) return;
    const toggle=(open)=>{
      index.classList.toggle('menu-mobile-open',open);
      overlay.classList.toggle('hidden',!open);
      btn.setAttribute('aria-expanded', String(open));
    };
    btn.addEventListener('click',()=>toggle(!index.classList.contains('menu-mobile-open')));
    overlay.addEventListener('click',()=>toggle(false));
  }

  ensurePerEntryUI(){
    document.querySelectorAll('.blog-entry').forEach(entry=>{
      entry.querySelector('.postit-container')?.style.setProperty('position','relative');
    });
  }

  /* =============== Reacciones / Favoritos =============== */
  initReactions() {
    const cache = JSON.parse(localStorage.getItem(LS_KEYS.reactions) || '{}');

    document.querySelectorAll('.blog-entry').forEach(entry=>{
      const id = entry.getAttribute('data-entry-id');
      const wrap = entry.querySelector('.entry-reactions');
      if (!wrap) return;

      const emojiBtns = wrap.querySelectorAll('[data-emoji]');
      const favBtn = wrap.querySelector('.entry-fav');

      if (HAS_FIREBASE) {
        window.firebaseCompatDb.ref(PATHS.reactions(id)).on('value', snap=>{
          const counts = snap.val() || {};
          emojiBtns.forEach(btn=>{
            const emoji = btn.dataset.emoji;
            btn.querySelector('span').textContent = counts[emoji] || 0;
          });
        });

        const attachUserUI = ()=>{
          const uid = this.uid; if (!uid) return;
          window.firebaseCompatDb.ref(PATHS.reactionsByUser(id, uid)).on('value', s => {
            const flags = s.val() || {};
            emojiBtns.forEach(btn=>{
              const emoji = btn.dataset.emoji;
              btn.setAttribute('aria-pressed', String(!!flags[emoji]));
            });
          });
          window.firebaseCompatDb.ref(PATHS.favorites(id, uid)).on('value', s => {
            const isFav = !!s.val();
            favBtn?.classList.toggle('active', isFav);
            favBtn?.setAttribute('aria-pressed', String(isFav));
          });
        };
        attachUserUI();
        if (!this.uid) window.firebaseCompatAuth.onAuthStateChanged(()=> attachUserUI());

        emojiBtns.forEach(btn=>{
          btn.addEventListener('click', async ()=>{
            const emoji = btn.dataset.emoji;
            const uid = this.uid;
            if (!uid) { alert('Reintentá en 1 segundo… (conectando)'); return; }
            const byUserRef = window.firebaseCompatDb.ref(`${PATHS.reactionsByUser(id, uid)}/${emoji}`);
            const exists = (await byUserRef.get()).exists();
            if (exists) return;
            const countRef = window.firebaseCompatDb.ref(`${PATHS.reactions(id)}/${emoji}`);
            await countRef.transaction(n => (typeof n==='number' ? n : 0) + 1);
            await byUserRef.set(true);
            btn.animate([{transform:'scale(1)'},{transform:'scale(1.15)'},{transform:'scale(1)'}],{duration:180});
          });
        });

        favBtn?.addEventListener('click', async ()=>{
          const uid = this.uid;
          if (!uid) { alert('Reintentá en 1 segundo… (conectando)'); return; }
          const ref = window.firebaseCompatDb.ref(PATHS.favorites(id, uid));
          const cur = (await ref.get()).val();
          await ref.set(!cur);
        });

      } else {
        // LocalStorage fallback
        const state = cache[id] || { '🧶':0, '✨':0, fav:false };
        emojiBtns.forEach(btn=>{
          const emoji = btn.dataset.emoji;
          btn.querySelector('span').textContent = state[emoji] || 0;
          btn.addEventListener('click', ()=>{
            state[emoji]=(state[emoji]||0)+1;
            btn.querySelector('span').textContent=state[emoji];
            cache[id]=state; localStorage.setItem(LS_KEYS.reactions, JSON.stringify(cache));
            btn.animate([{transform:'scale(1)'},{transform:'scale(1.15)'},{transform:'scale(1)'}],{duration:180});
          });
        });
        if (favBtn){
          favBtn.classList.toggle('active', !!state.fav);
          favBtn.setAttribute('aria-pressed', String(!!state.fav));
          favBtn.addEventListener('click', ()=>{
            state.fav=!state.fav;
            favBtn.classList.toggle('active', state.fav);
            favBtn.setAttribute('aria-pressed', String(state.fav));
            cache[id]=state; localStorage.setItem(LS_KEYS.reactions, JSON.stringify(cache));
          });
        }
      }
    });
  }

  /* =============== Post-its =============== */
  enablePostits() {
    const store = JSON.parse(localStorage.getItem(LS_KEYS.postits) || '{}');

    document.querySelectorAll('.blog-entry').forEach(entry=>{
      const id = entry.getAttribute('data-entry-id');
      const box = entry.querySelector('.postit-container');
      if(!box) return;
      box.style.position = 'relative';

      // restaurar
      (store[id] || []).forEach(p=> box.appendChild(this._renderPostit(box, p, entry)));

      // botón crear
      if (!box.querySelector('.postit-add')){
        const add = document.createElement('button');
        add.textContent='➕ Post-it';
        add.className='postit-add';
        add.addEventListener('click', ()=>{
          const p = { id: crypto.randomUUID(), text:'Escribe aquí…', x: 6+Math.random()*40, y: 4+Math.random()*30, color:'#ffeb3b', w:220, h:150 };
          box.appendChild(this._renderPostit(box, p, entry));
          this._persistPostits(entry);
        });
        box.appendChild(add);
      }

      // persistir cambios
      ['pointerup','keyup','blur'].forEach(evt=> box.addEventListener(evt, ()=>this._persistPostits(entry)));
      window.addEventListener('beforeunload', ()=>this._persistPostits(entry), { once:true });
    });
  }

  _renderPostit(container, p, entryEl){
    const el = document.createElement('div');
    el.className = 'postit';
    el.dataset.pid = p.id;
    el.style.position = 'absolute';
    el.style.background = p.color || '#ffeb3b';
    el.style.left  = (typeof p.x === 'number' ? p.x + '%' : p.x || '6%');
    el.style.top   = (typeof p.y === 'number' ? p.y + '%' : p.y || '6%');
    if (p.w) el.style.width  = (typeof p.w === 'number' ? p.w + 'px' : p.w);
    if (p.h) el.style.height = (typeof p.h === 'number' ? p.h + 'px' : p.h);

    // barra
    const bar = document.createElement('div');
    bar.className = 'postit-bar';
    bar.style.touchAction = 'none';
    const title = document.createElement('span'); title.className = 'title'; title.textContent = 'Nota';

    const tools = document.createElement('div'); tools.className = 'tools';

    // paleta
    const palette = document.createElement('div'); palette.className = 'postit-color-options';
    ['#f5eead','#fca8c4','#b8f1bb','#42a5f5'].forEach(c=>{
      const dot = document.createElement('span'); dot.className = 'color-option'; dot.style.background = c;
      dot.addEventListener('click', (e)=>{ e.stopPropagation(); el.style.background = c; });
      palette.appendChild(dot);
    });

    // borrar
    const btnDel = document.createElement('button');
    btnDel.type = 'button';
    btnDel.title = 'Eliminar';
    btnDel.setAttribute('aria-label','Eliminar nota');
    btnDel.innerHTML = '🗑️';
    btnDel.addEventListener('click', (e)=>{
      e.stopPropagation();
      el.remove();
      this._persistPostits(entryEl);
    });

    tools.appendChild(palette);
    tools.appendChild(btnDel);
    bar.appendChild(title);
    bar.appendChild(tools);

    // contenido
    const content = document.createElement('div');
    content.className = 'postit-content';
    content.contentEditable = true;
    content.textContent = p.text || '';

    el.appendChild(bar);
    el.appendChild(content);

    // ===== DRAG relativo al contenedor =====
    let dragging = false, offsetX = 0, offsetY = 0;

    const getContainerRect = () => container.getBoundingClientRect();

    const onDown = (e)=>{
      dragging = true;
      el.classList.add('dragging');
      bar.setPointerCapture?.(e.pointerId);
      const rect = el.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
    };
    const onMove = (e)=>{
      if (!dragging) return;
      const crect = getContainerRect();
      let left = e.clientX - crect.left - offsetX;
      let top  = e.clientY - crect.top  - offsetY;
      left = Math.max(0, Math.min(left, crect.width  - el.offsetWidth));
      top  = Math.max(0, Math.min(top,  crect.height - el.offsetHeight));
      el.style.left = (left / crect.width) * 100 + '%';
      el.style.top  = (top  / crect.height) * 100 + '%';
    };
    const onUp = (e)=>{
      if (!dragging) return;
      dragging = false;
      el.classList.remove('dragging');
      bar.releasePointerCapture?.(e.pointerId);
      this._persistPostits(entryEl);
    };

    bar.addEventListener('pointerdown', onDown);
    bar.addEventListener('pointermove', onMove);
    bar.addEventListener('pointerup', onUp);
    bar.addEventListener('pointercancel', onUp);

    return el;
  }

  _persistPostits(entry){
    const id = entry.getAttribute('data-entry-id');
    const list = [...entry.querySelectorAll('.postit')].map(el=>{
      const style = getComputedStyle(el);
      return {
        id: el.dataset.pid,
        text: el.querySelector('.postit-content')?.textContent?.trim() || '',
        color: style.backgroundColor,
        x: parseFloat(style.left),   // en %
        y: parseFloat(style.top),    // en %
        w: parseInt(style.width,10),
        h: parseInt(style.height,10)
      };
    });
    const store = JSON.parse(localStorage.getItem(LS_KEYS.postits) || '{}');
    store[id] = list;
    localStorage.setItem(LS_KEYS.postits, JSON.stringify(store));
  }

  /* =============== Comentarios (con borrar para admin) =============== */
  initCommentsAll(){
    document.querySelectorAll('.blog-entry').forEach(entry=>{
      const id = entry.getAttribute('data-entry-id');
      const section = entry.querySelector('.entry-comments');
      if (!section) return;
      const list = section.querySelector('.comments-list');
      const form = section.querySelector('.comment-form');
      if (!list || !form) return;

      const render = (comments)=>{
        if (!Array.isArray(comments) || !comments.length){
          list.innerHTML = '<li class="comment-item"><div class="comment-text">Sé el primero en comentar ✨</div></li>';
          return;
        }
        list.innerHTML = comments
          .sort((a,b)=>a.ts-b.ts)
          .map(c=>`
            <li class="comment-item" data-id="${c.id}">
              <div class="comment-meta">
                <span class="comment-name">${c.name || 'Anónimo'}</span>
                <span>•</span>
                <time datetime="${new Date(c.ts).toISOString()}">${new Date(c.ts).toLocaleString()}</time>
                ${IS_ADMIN ? '<button class="comment-del" title="Eliminar">🗑️</button>' : ''}
              </div>
              <div class="comment-text">${c.text}</div>
            </li>
          `).join('');
      };

      if (HAS_FIREBASE) {
        window.firebaseCompatDb.ref(PATHS.comments(id)).on('value', snap=>{
          const val = snap.val() || {};
          render(Object.values(val));
        }, err=>{
          console.warn('FB comments error:', err);
          const ls = JSON.parse(localStorage.getItem(LS_KEYS.comments(id)) || '[]');
          render(ls);
        });
      } else {
        const ls = JSON.parse(localStorage.getItem(LS_KEYS.comments(id)) || '[]');
        render(ls);
      }

      form.addEventListener('submit', async (e)=>{
        e.preventDefault();
        const name = BlogUtils.sanitize((form.name?.value || 'Anónimo').trim());
        const text = BlogUtils.sanitize((form.text?.value || '').trim());
        if (!text) return;

        const last = Number(localStorage.getItem(LS_KEYS.lastCommentAt) || 0);
        if (Date.now() - last < 10_000) { alert('Esperá unos segundos antes de comentar otra vez 🙏'); return; }

        const comment = { id: crypto.randomUUID(), name, text, ts: Date.now(), uid: this.uid || null };

        if (HAS_FIREBASE) {
          try {
            await window.firebaseCompatDb.ref(`${PATHS.comments(id)}/${comment.id}`).set(comment);
          } catch(e) {
            console.warn('FB write fail, saving LS', e);
            const key = LS_KEYS.comments(id);
            const arr = JSON.parse(localStorage.getItem(key) || '[]'); arr.push(comment);
            localStorage.setItem(key, JSON.stringify(arr));
          }
        } else {
          const key = LS_KEYS.comments(id);
          const arr = JSON.parse(localStorage.getItem(key) || '[]'); arr.push(comment);
          localStorage.setItem(key, JSON.stringify(arr));
          const ls = JSON.parse(localStorage.getItem(key) || '[]'); render(ls);
        }

        form.reset();
        localStorage.setItem(LS_KEYS.lastCommentAt, String(Date.now()));
      });

      // eliminar (solo admin)
      list.addEventListener('click', async (e)=>{
        const btn = e.target.closest('.comment-del');
        if (!btn || !IS_ADMIN) return;
        const li = btn.closest('.comment-item');
        const cid = li?.dataset.id;
        if (!cid) return;
        if (!confirm('¿Eliminar este comentario?')) return;

        if (HAS_FIREBASE) {
          try { await window.firebaseCompatDb.ref(`${PATHS.comments(id)}/${cid}`).remove(); }
          catch (err) { alert('No se pudo eliminar en servidor.'); console.warn(err); }
        } else {
          const key = LS_KEYS.comments(id);
          const arr = JSON.parse(localStorage.getItem(key) || '[]').filter(c=>c.id !== cid);
          localStorage.setItem(key, JSON.stringify(arr));
          render(arr);
        }
      });
    });
  }

  /* =============== Lazy / Videos =============== */
  addImageLazyLoading() {
    const imgs = document.querySelectorAll('.entrada-imagen');
    if (!imgs.length) return;
    const io = new IntersectionObserver((entries, obs)=>{
      entries.forEach(e=>{
        if(!e.isIntersecting) return;
        const img=e.target; img.decode?.().catch(()=>{}).finally(()=> img.style.opacity=1);
        obs.unobserve(img);
      });
    },{rootMargin:'200px 0px 200px 0px'});
    imgs.forEach(i=>{ i.style.opacity=.001; io.observe(i); });
  }
  addVideoPlayPause() {
    const iframes = document.querySelectorAll('.entrada-video');
    if (!iframes.length) return;
    const io = new IntersectionObserver((entries)=>{
      entries.forEach(({isIntersecting,target})=>{
        if (!/youtube|vimeo/.test(target.src)) return;
        const cmd = JSON.stringify({ event:'command', func: isIntersecting ? 'playVideo' : 'pauseVideo' });
        target.contentWindow?.postMessage(cmd, '*');
      });
    },{threshold:.3});
    iframes.forEach(v=>io.observe(v));
  }

  /* =============== SEO =============== */
  injectJSONLD(){
    const slot=document.getElementById('jsonld-slot'); if(!slot) return;
    const items=[...document.querySelectorAll('.blog-entry')].map(e=>{
      const name=e.querySelector('.entry-title')?.textContent?.trim();
      const dateTxt=e.querySelector('.entry-date')?.textContent?.trim();
      const img=e.querySelector('.entrada-imagen')?.src;
      const text=e.querySelector('.entry-text')?.innerText?.trim();
      const dateISO=dateTxt?.split('/')?.reverse()?.join('-');
      return {"@type":"BlogPosting","headline":name,"image":img?[img]:undefined,"datePublished":dateISO,"articleBody":text,"author":{"@type":"Person","name":"Patofelting"}};
    });
    slot.textContent=JSON.stringify({"@context":"https://schema.org","@graph":items});
  }

  recargar(){ this.cargarEntradasDesdeCSV(); }
}

/* ============================ Ecommerce hooks (opcional) ============================ */
class BlogEcommerceIntegration{
  constructor(){ this.addProductLinks(); this.addCallToActionTracking(); }
  addProductLinks(){
    document.querySelectorAll('[data-product]').forEach(m=>{
      const id=m.dataset.product;
      m.addEventListener('click',()=>{ window.location.href=`index.html#productos?highlight=${id}`; });
      Object.assign(m.style,{cursor:'pointer',textDecoration:'underline',color:'var(--primary-green)'});
    });
  }
  addCallToActionTracking(){
    document.querySelectorAll('.cta-button-blog').forEach(cta=>{
      cta.addEventListener('click',(e)=>{
        const action=e.target.textContent.trim();
        if(typeof gtag!=='undefined'){ gtag('event','blog_cta_click',{event_category:'Blog',event_label:action}); }
      });
    });
  }
}

/* ============================ Arranque ============================ */
let blogManager;
document.addEventListener('DOMContentLoaded',()=>{
  blogManager = new BlogManager();
  new BlogEcommerceIntegration();
  const y=document.getElementById('current-year'); if(y) y.textContent=new Date().getFullYear();
});

// helpers admin
window.enableBlogAdmin = () => { localStorage.setItem('pf_admin','1'); location.reload(); };
window.disableBlogAdmin = () => { localStorage.removeItem('pf_admin'); location.reload(); };

// Reintento público
window.recargarBlog = () => window.blogManager?.recargar();
