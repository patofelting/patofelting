/* =========================================================
   Patofelting · blog.js (edición limpia y premiable)
   - Respeta tu estética original (cuaderno)
   - Sin tocar blog.html / blog.css
   - Añade: Firestore comentarios + votos, UX suave y robustez
   - Carga CSV con reintentos y timeout
========================================================= */

/* ==== Firebase config (tu proyecto) ==== */
const cfg = {
  apiKey: "AIzaSyD261TL6XuBp12rUNCcMKyP7_nMaCVYc7Y",
  authDomain: "patofelting-b188f.firebaseapp.com",
  databaseURL: "https://patofelting-b188f-default-rtdb.firebaseio.com",
  projectId: "patofelting-b188f",
  storageBucket: "patofelting-b188f.appspot.com",
  messagingSenderId: "858377467588",
  appId: "1:858377467588:web:cade9de05ebccc17f87b91"
};

/* ==== Fuente de datos (tu Google Sheets) ==== */
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJwvzHZQN3CQarSDqjk_nShegf8F4ydARvkSK55VabxbCi9m8RuGf2Nyy9ScriFRfGdhZd0P54VS5z/pub?gid=127717360&single=true&output=csv';

/* =========================================================
   Utilidades
========================================================= */
class BlogUtils {
  static formatearFecha(fecha) {
    if (!fecha) return '';
    const [d,m,y] = fecha.split('/');
    return `${d}/${m}/${y}`;
  }

  static limpiarURLs(urls) {
    if (!urls) return [];
    return urls.split(',').map(u=>u.trim()).filter(Boolean);
  }

  static calculateReadingTime(rootSel='.blog-main') {
    const el = document.querySelector(rootSel);
    if (!el) return 1;
    const words = el.textContent.trim().split(/\s+/).length;
    return Math.max(1, Math.ceil(words/200));
  }

  static showError(message='Hubo un error al cargar las entradas. Intenta de nuevo.') {
    const c = document.getElementById('main-content');
    if (!c) return;
    c.innerHTML = `
      <div class="blog-error" role="alert">
        <span class="error-icon">❌</span>
        <div class="error-message">${message}</div>
        <button class="retry-button" onclick="window.recargarBlog()">Reintentar</button>
      </div>`;
  }

  static showEmpty() {
    const c = document.getElementById('main-content');
    if (!c) return;
    c.innerHTML = `
      <div class="blog-error">
        <span class="error-icon">📝</span>
        <div class="error-message">No hay historias para mostrar aún. ¡Vuelve pronto!</div>
      </div>`;
  }

  static preload(href, as, type){
    const l = document.createElement('link'); l.rel='preload'; l.href=href; l.as=as;
    if (type) l.type = type;
    document.head.appendChild(l);
  }
}

/* =========================================================
   Firebase (Auth anónima + Firestore)
========================================================= */
let app, db, auth;
async function ensureFirebase(){
  if (db) return db;
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js');
  const { getFirestore, collection, addDoc, onSnapshot, query, where, orderBy, serverTimestamp, doc, updateDoc, increment } =
    await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js');
  const { getAuth, signInAnonymously, onAuthStateChanged } =
    await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js');

  app = initializeApp(cfg);
  db = getFirestore(app);
  auth = getAuth(app);
  await signInAnonymously(auth);
  onAuthStateChanged(auth, u=>{ if (u) window.PATO_USER_ID = u.uid; });

  // Exponer helpers internos (solo dentro de la página)
  window._FB = { collection, addDoc, onSnapshot, query, where, orderBy, serverTimestamp, doc, updateDoc, increment };
  return db;
}

/* =========================================================
   Comentarios + votos (UI sobria, acorde al cuaderno)
========================================================= */
class CommentsModule{
  constructor(entryId, mountEl){
    this.entryId = entryId;
    this.mountEl = mountEl;   // elemento dentro de .entry-content
    this._renderShell();
    this._listen();
  }

  _renderShell(){
    const wrap = document.createElement('section');
    wrap.className = 'comments';
    wrap.setAttribute('aria-label','Sección de comentarios');
    wrap.innerHTML = `
      <h3 style="font-family:var(--font-cursive);color:var(--dark-green);margin:1.25rem 0 .5rem;">Comentarios</h3>
      <form class="comment-form" aria-label="Agregar comentario" style="display:grid;gap:.5rem;margin:.6rem 0;">
        <input name="name" required placeholder="Tu nombre" aria-label="Nombre"
               style="padding:.6rem;border-radius:10px;border:2px dashed rgba(0,0,0,.08);font-family:var(--font-system)"/>
        <textarea name="text" required placeholder="Escribe un comentario..." rows="3" aria-label="Comentario"
               style="padding:.6rem;border-radius:10px;border:2px dashed rgba(0,0,0,.08);font-family:var(--font-system)"></textarea>
        <div style="display:flex;gap:.5rem;align-items:center;justify-content:flex-start">
          <button type="submit" class="btn-pato">Publicar</button>
          <small style="color:var(--pencil-gray)">Sé amable ♥</small>
        </div>
      </form>
      <ul class="comment-list" aria-live="polite" style="list-style:none;display:grid;gap:.6rem;margin-top:.8rem"></ul>
    `;
    // Botón con estética del blog (sin tocar CSS global)
    const styleBtn = document.createElement('style');
    styleBtn.textContent = `
      .btn-pato{
        background: var(--primary-green); color:#fff; border:0; border-radius:999px;
        padding:.55rem 1rem; font:600 14px/1 var(--font-system);
        box-shadow:0 6px 18px rgba(0,0,0,.12); cursor:pointer; transition:transform .15s;
      }
      .btn-pato:hover{ transform:translateY(-1px) }
      .comment-item{
        background: var(--paper-white); border-radius:12px; padding:.75rem .85rem; position:relative;
        box-shadow: 0 2px 10px rgba(0,0,0,.05);
      }
      .comment-item p{ margin:.35rem 0 0; }
      .vote-btn{
        position:absolute; right:.55rem; top:.5rem; display:inline-flex; align-items:center; gap:.35rem;
        background:transparent; border:0; cursor:pointer; color:var(--dark-green); font-weight:600;
      }
      .vote-btn:focus-visible{ outline:2px dashed var(--red-margin); outline-offset:2px; border-radius:6px; }
    `;
    document.head.appendChild(styleBtn);
    this.mountEl.appendChild(wrap);

    // submit
    const form = wrap.querySelector('.comment-form');
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd = new FormData(form);
      const name = (fd.get('name')||'').toString().trim();
      const text = (fd.get('text')||'').toString().trim();
      if (!name || !text) return;
      await ensureFirebase();
      const { addDoc, collection, serverTimestamp } = window._FB;
      await addDoc(collection(db,'comments'),{
        entryId: this.entryId,
        name, text,
        votes: 0,
        createdAt: serverTimestamp(),
        uid: window.PATO_USER_ID || 'anon'
      });
      form.reset();
    });

    this.listEl = wrap.querySelector('.comment-list');
  }

  async _listen(){
    await ensureFirebase();
    const { onSnapshot, collection, query, where, orderBy } = window._FB;
    const q = query(collection(db,'comments'),
                    where('entryId','==',this.entryId),
                    orderBy('votes','desc'),
                    orderBy('createdAt','asc'));
    onSnapshot(q, snap=>{
      this.listEl.innerHTML='';
      snap.forEach(docSnap=>{
        const c = docSnap.data();
        const li = document.createElement('li');
        li.className='comment-item';
        li.innerHTML = `
          <strong>${escapeHtml(c.name||'Anónimo')}</strong>
          <button class="vote-btn" title="Votar comentario">
            <span aria-hidden="true">🧶</span><span class="v">${c.votes||0}</span>
          </button>
          <p>${escapeHtml(c.text||'')}</p>
        `;
        li.querySelector('.vote-btn').addEventListener('click', ()=> this._vote(docSnap.id));
        this.listEl.appendChild(li);
      });
    });
  }

  async _vote(id){
    await ensureFirebase();
    const { doc, updateDoc, increment } = window._FB;
    try{
      await updateDoc(doc(db,'comments',id),{ votes: increment(1) });
    }catch(err){
      console.warn('No se pudo votar:', err?.message||err);
    }
  }
}

/* =========================================================
   Gestor principal (usa tu estructura intacta)
========================================================= */
class BlogManager {
  constructor(){
    this.entradas = [];
    this._container = document.getElementById('blog-entries') || document.getElementById('main-content');
    this._loader = document.getElementById('blog-loading');
    this.init();
  }

  async init(){
    await this._cargarEntradasConReintentos();
    this._render();
    this._uxSuave();
  }

  async _cargarEntradasConReintentos(max=3){
    let intento=0, ultimaEx=null;
    while(intento<max){
      try{
        this.entradas = await this._cargarEntradasDesdeCSV();
        return;
      }catch(e){
        ultimaEx=e; intento++;
        await new Promise(r=>setTimeout(r, 300 * Math.pow(2,intento-1))); // backoff: 300ms, 600ms, 1200ms
      }
    }
    console.error('Error CSV:', ultimaEx);
    BlogUtils.showError('No pudimos cargar las historias. Revisa tu conexión e intenta nuevamente.');
  }

  async _cargarEntradasDesdeCSV(){
    const controller = new AbortController();
    const t = setTimeout(()=>controller.abort(), 10000); // 10s timeout
    const resp = await fetch(CSV_URL, { cache:'no-store', signal: controller.signal });
    clearTimeout(t);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const texto = await resp.text();

    const parsed = Papa.parse(texto,{ header:true, skipEmptyLines:true, transform:v=>v.trim() });
    const data = parsed.data || [];
    const entradas = data
      .filter(f=>f.titulo && f.contenido)
      .map((f,i)=>({
        id: f.id || i.toString(),
        fecha: f.fecha || '',
        titulo: f.titulo,
        contenido: f.contenido,
        imagenes: BlogUtils.limpiarURLs(f.imagenPrincipal || ''),
        videos:   BlogUtils.limpiarURLs(f.videoURL || ''),
        orden: parseInt(f.orden)||0
      }))
      .sort((a,b)=>a.orden-b.orden);

    if (!entradas.length) throw new Error('CSV vacío o sin filas válidas');
    return entradas;
  }

  _render(){
    if (this._loader) this._loader.style.display='none';
    if (!this._container){ console.error('No hay contenedor #blog-entries / #main-content'); return; }
    this._container.innerHTML='';

    const tpl = document.getElementById('entry-template');
    if (!tpl || !tpl.content){ BlogUtils.showError('Falta el template de entradas en el HTML.'); return; }

    this.entradas.forEach(ent=>{
      const dom = tpl.content.cloneNode(true);
      const entry = dom.querySelector('.blog-entry');
      const contentEl = dom.querySelector('.entry-content');
      entry.setAttribute('data-entry-id', ent.id);

      // Título y fecha
      dom.querySelector('.entry-title').textContent = ent.titulo;
      dom.querySelector('.entry-date').textContent  = BlogUtils.formatearFecha(ent.fecha);

      // Texto (líneas sobre renglones del cuaderno)
      const txt = dom.querySelector('.entry-text');
      ent.contenido.split('\n').forEach(line=>{
        if (!line.trim()) return;
        const p = document.createElement('p');
        p.className='notebook-line';
        p.textContent = line.trim();
        txt.appendChild(p);
      });

      // Media (usa tu .media-gallery)
      const gal = dom.querySelector('.media-gallery');
      ent.imagenes.forEach(url=>{
        const fig = document.createElement('figure');
        fig.className='photo-polaroid';
        const img = new Image();
        img.src = url;
        img.alt = ent.titulo;
        img.loading='lazy';
        img.className='entrada-imagen';
        img.onerror = ()=>{ fig.classList.add('image-error'); fig.innerHTML='<div style="padding:10px;color:#999">Imagen no disponible</div>'; };
        fig.appendChild(img);
        gal.appendChild(fig);
        // Preload sutil para la primera imagen
        try{ BlogUtils.preload(url,'image'); }catch{}
      });

      ent.videos.forEach(url=>{
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.className='entrada-video';
        iframe.setAttribute('allowfullscreen','true');
        iframe.loading='lazy';
        gal.appendChild(iframe);
      });

      // Comentarios (montaje al final del contenido)
      const commentsMount = document.createElement('div');
      commentsMount.style.marginTop = '1rem';
      contentEl.appendChild(commentsMount);
      this._container.appendChild(dom);

      // Instanciar comentarios
      new CommentsModule(ent.id, commentsMount);
    });
  }

  _uxSuave(){
    // Año del footer
    const y = document.getElementById('current-year');
    if (y) y.textContent = String(new Date().getFullYear());

    // Indicador de tiempo de lectura discreto
    setTimeout(()=>{
      const mins = BlogUtils.calculateReadingTime('.blog-main');
      const pill = document.createElement('div');
      pill.setAttribute('aria-label',`Tiempo de lectura aproximado: ${mins} minutos`);
      pill.style.cssText = `
        position:fixed; bottom:20px; left:20px; background:#fff; color:var(--pencil-gray);
        padding:.45rem .9rem; border-radius:999px; font:600 12px/1 var(--font-system);
        box-shadow:0 4px 12px rgba(0,0,0,.08); z-index:1000`;
      pill.textContent = `📖 ${mins} min`;
      document.body.appendChild(pill);
      setTimeout(()=> pill.remove(), 7000);
    }, 1000);

    // Barra de progreso de lectura (2px, muy sutil)
    const bar = document.createElement('div');
    bar.id='reading-progress';
    bar.style.cssText = `
      position:fixed; top:0; left:0; height:2px; width:0%;
      background: linear-gradient(90deg, var(--soft-green), var(--primary-green));
      z-index:2000; transition:width .08s ease;`;
    document.body.appendChild(bar);
    const onScroll=()=>{
      const h = document.documentElement;
      const max = (h.scrollHeight - h.clientHeight) || 1;
      bar.style.width = Math.min(100, (h.scrollTop / max)*100) + '%';
    };
    document.addEventListener('scroll', onScroll, {passive:true});
    onScroll();
  }

  recargar(){ return this.init(); }
}

/* =========================================================
   Integración e‑commerce (tal como tenías, con toques mínimos)
========================================================= */
class BlogEcommerceIntegration {
  constructor(){ this._wireProductLinks(); this._wireCtas(); }
  _wireProductLinks(){
    document.querySelectorAll('[data-product]').forEach(el=>{
      const id = el.dataset.product;
      el.style.cursor='pointer';
      el.style.textDecoration='underline';
      el.style.color='var(--primary-green)';
      el.addEventListener('click', ()=>{ window.location.href=`index.html#productos?highlight=${id}`; });
    });
  }
  _wireCtas(){
    document.querySelectorAll('.cta-button-blog').forEach(cta=>{
      cta.addEventListener('click', e=>{
        const action = e.currentTarget.textContent.trim();
        if (typeof gtag !== 'undefined'){ gtag('event','blog_cta_click',{event_category:'Blog',event_label:action}); }
      });
    });
  }
}

/* =========================================================
   Helpers
========================================================= */
function escapeHtml(s){
  return String(s)
   .replace(/&/g,'&amp;').replace(/</g,'&lt;')
   .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
   .replace(/'/g,'&#039;');
}

/* =========================================================
   Boot
========================================================= */
let blogManager;
document.addEventListener('DOMContentLoaded', ()=>{
  // Asegurar Papa.parse disponible (ya se carga en tu HTML)
  if (typeof Papa === 'undefined'){
    console.error('PapaParse no está disponible. Verifica el <script> en el HTML.');
    BlogUtils.showError('Error de inicialización. (Parser no disponible)');
    return;
  }

  blogManager = new BlogManager();
  new BlogEcommerceIntegration();

  // Recarga periódica (progresiva, no intrusiva)
  setInterval(()=>{ if (blogManager && blogManager.entradas?.length){ blogManager.recargar(); } }, 60_000);
});

// Exponer para el botón "Reintentar"
window.recargarBlog = ()=> blogManager && blogManager.recargar();
