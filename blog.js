/* =========================================================
   Patofelting · blog.js (TODO en un solo archivo)
   - Estética cuaderno intacta
   - Galería fluida (.media-gallery) sin recortes
   - Comentarios Firestore + votos (ovillos)
   - Realtime robusto: long-polling + fallback por polling
   - UI de comentarios inyectada por JS (no rompe tu CSS)
   - Barra de progreso + preloads
   - Service Worker inline (sin sw.js separado)
========================================================= */

/* ==== Firebase (tu proyecto) ==== */
const cfg = {
  apiKey: "AIzaSyD261TL6XuBp12rUNCcMKyP7_nMaCVYc7Y",
  authDomain: "patofelting-b188f.firebaseapp.com",
  databaseURL: "https://patofelting-b188f-default-rtdb.firebaseio.com",
  projectId: "patofelting-b188f",
  storageBucket: "patofelting-b188f.appspot.com",
  messagingSenderId: "858377467588",
  appId: "1:858377467588:web:cade9de05ebccc17f87b91"
};

/* ==== Google Sheets (CSV) ==== */
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJwvzHZQN3CQarSDqjk_nShegf8F4ydARvkSK55VabxbCi9m8RuGf2Nyy9ScriFRfGdhZd0P54VS5z/pub?gid=127717360&single=true&output=csv';

/* =========================================================
   CSS INYECTADO (parches puntuales) — sin romper tu hoja
========================================================= */
function addGlobalStyles(){
  if (document.getElementById('pato-inline-styles')) return;
  const s = document.createElement('style'); s.id='pato-inline-styles';
  s.textContent = `
  /* Galería sin recortes */
  .media-gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.6rem}
  .photo-polaroid{width:100%;margin:0;transform:none;overflow:visible}
  .photo-polaroid img{display:block;width:100%;height:auto!important;max-height:none!important;object-fit:contain!important;border-radius:var(--border-radius)}
  @media (max-width:640px){.media-gallery{grid-template-columns:1fr}}

  /* Comentarios minimalistas acordes al cuaderno */
  .comments{margin-top:1.2rem}
  .comment-form{display:grid;gap:.5rem;margin:.6rem 0}
  .comment-form input,.comment-form textarea{padding:.6rem;border-radius:10px;border:2px dashed rgba(0,0,0,.08);font-family:var(--font-system);background:#fffefc}
  .comment-actions{display:flex;gap:.6rem;align-items:center}
  .btn-pato{background:var(--primary-green);color:#fff;border:0;border-radius:999px;padding:.55rem 1rem;font:600 14px/1 var(--font-system);box-shadow:0 6px 18px rgba(0,0,0,.12);cursor:pointer;transition:transform .15s}
  .btn-pato:hover{transform:translateY(-1px)}
  .comment-list{list-style:none;display:grid;gap:.6rem;margin-top:.8rem}
  .comment-item{background:var(--paper-white);border-radius:12px;padding:.75rem .85rem;position:relative;box-shadow:0 2px 10px rgba(0,0,0,.05)}
  .comment-item p{margin:.35rem 0 0}
  .vote-btn{position:absolute;right:.55rem;top:.5rem;display:inline-flex;align-items:center;gap:.35rem;background:transparent;border:0;cursor:pointer;color:var(--dark-green);font-weight:600}
  .vote-btn:focus-visible{outline:2px dashed var(--red-margin);outline-offset:2px;border-radius:6px}

  /* Barra de progreso de lectura */
  #reading-progress{position:fixed;top:0;left:0;height:2px;width:0%;background:linear-gradient(90deg,var(--soft-green),var(--primary-green));z-index:2000;transition:width .08s ease}
  `;
  document.head.appendChild(s);
}

/* =========================================================
   Utilidades
========================================================= */
class BlogUtils {
  static formatearFecha(fecha){ if(!fecha) return ''; const [d,m,y]=(fecha||'').split('/'); return `${d}/${m}/${y}`; }
  static limpiarURLs(urls){ return (urls||'').split(',').map(s=>s.trim()).filter(Boolean); }
  static preload(href, as, type){ try{ const l=document.createElement('link'); l.rel='preload'; l.href=href; l.as=as; if(type) l.type=type; document.head.appendChild(l);}catch{} }
  static showError(msg='Hubo un error al cargar las entradas. Intenta de nuevo.'){
    const c=document.getElementById('main-content'); if(!c) return;
    c.innerHTML=`<div class="blog-error" role="alert"><span class="error-icon">❌</span><div class="error-message">${msg}</div><button class="retry-button" onclick="window.recargarBlog()">Reintentar</button></div>`;
  }
  static showEmpty(){
    const c=document.getElementById('main-content'); if(!c) return;
    c.innerHTML=`<div class="blog-error"><span class="error-icon">📝</span><div class="error-message">No hay historias para mostrar aún. ¡Vuelve pronto!</div></div>`;
  }
  static readingBar(){
    if (document.getElementById('reading-progress')) return;
    const bar = document.createElement('div'); bar.id='reading-progress'; document.body.appendChild(bar);
    const onScroll=()=>{ const h=document.documentElement; const max=(h.scrollHeight - h.clientHeight)||1; bar.style.width = Math.min(100,(h.scrollTop/max)*100)+'%'; };
    document.addEventListener('scroll', onScroll, {passive:true}); onScroll();
  }
}

/* =========================================================
   Firebase (Auth anónima + Firestore) con long‑polling
========================================================= */
let app, db, auth;
async function ensureFirebase(){
  if (db) return db;

  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js');

  // initializeFirestore para setear flags de transporte
  const {
    initializeFirestore,
    collection, addDoc, onSnapshot, query, where, orderBy, serverTimestamp, doc,
    updateDoc, increment, getDocs
  } = await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js');

  const { getAuth, signInAnonymously, onAuthStateChanged } =
    await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js');

  app = initializeApp(cfg);

  // 🔧 Flags que evitan 400 en Listen/channel (proxys/ad-blocks)
  db = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true, // detecta y usa long‑polling cuando hace falta
    useFetchStreams: false                   // evita fetch streams problemáticos
  });

  auth = getAuth(app);
  await signInAnonymously(auth);
  onAuthStateChanged(auth, u=>{ if (u) window.PATO_USER_ID=u.uid; });

  // helpers a mano
  window._FB = {
    collection, addDoc, onSnapshot, query, where, orderBy, serverTimestamp, doc,
    updateDoc, increment, getDocs
  };
  return db;
}

/* =========================================================
   Comentarios + votos (con fallback por polling)
========================================================= */
class CommentsModule{
  constructor(entryId, mountEl){
    this.entryId = entryId;
    this.mountEl = mountEl;
    this._unsubscribe = null;
    this._pollTimer = null;
    this.render();
    this.listen();
  }

  render(){
    this.mountEl.innerHTML='';
    const section=document.createElement('section');
    section.className='comments';
    section.innerHTML=`
      <h3 style="font-family:var(--font-cursive);color:var(--dark-green);margin:1rem 0 .4rem;">Comentarios</h3>
      <form class="comment-form" aria-label="Agregar comentario">
        <input name="name" required placeholder="Tu nombre" aria-label="Nombre" />
        <textarea name="text" required placeholder="Escribe un comentario..." rows="3" aria-label="Comentario"></textarea>
        <div class="comment-actions">
          <button type="submit" class="btn-pato">Publicar</button>
          <small style="color:var(--pencil-gray)">Sé amable ♥</small>
        </div>
      </form>
      <ul class="comment-list" aria-live="polite"></ul>
    `;
    this.mountEl.appendChild(section);

    section.querySelector('form').addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd=new FormData(e.currentTarget);
      const name=(fd.get('name')||'').toString().trim();
      const text=(fd.get('text')||'').toString().trim();
      if(!name || !text) return;
      await ensureFirebase();
      const { addDoc, collection, serverTimestamp } = window._FB;
      await addDoc(collection(db,'comments'),{
        entryId:this.entryId, name, text, votes:0, createdAt:serverTimestamp(), uid: window.PATO_USER_ID||'anon'
      });
      e.currentTarget.reset();
    });

    this.listEl = section.querySelector('.comment-list');
  }

  async listen(){
    await ensureFirebase();
    const { onSnapshot, collection, query, where, orderBy, getDocs } = window._FB;

    // Consulta simple (menos exigente con índices). Orden final por votos en cliente.
    const q = query(
      collection(db,'comments'),
      where('entryId','==',this.entryId),
      orderBy('createdAt','asc')
    );

    const renderSnap = (snap) => {
      const items = [];
      snap.forEach(d => items.push({ id:d.id, ...d.data() }));
      // Primero más votados; desempate por fecha
      items.sort((a,b)=>{
        if ((b.votes||0) !== (a.votes||0)) return (b.votes||0)-(a.votes||0);
        const ta = a.createdAt?.seconds||0, tb=b.createdAt?.seconds||0;
        return ta - tb;
      });

      this.listEl.innerHTML = '';
      for (const c of items) {
        const li = document.createElement('li');
        li.className = 'comment-item';
        li.innerHTML = `
          <strong>${escapeHtml(c.name||'Anónimo')}</strong>
          <button class="vote-btn" title="Votar comentario">
            <span aria-hidden="true">🧶</span><span class="v">${c.votes||0}</span>
          </button>
          <p>${escapeHtml(c.text||'')}</p>
        `;
        li.querySelector('.vote-btn').addEventListener('click', ()=> this.vote(c.id));
        this.listEl.appendChild(li);
      }
    };

    // 🔴 Fallback por polling si el stream falla
    const startPolling = async () => {
      try { const s = await getDocs(q); renderSnap(s); } catch(e){ console.warn('Polling inicial falló:', e); }
      this._pollTimer && clearInterval(this._pollTimer);
      this._pollTimer = setInterval(async ()=>{
        try { const s = await getDocs(q); renderSnap(s); } catch(e){ /* silent */ }
      }, 5000);
    };

    // Intento realtime
    try{
      this._unsubscribe && this._unsubscribe();
      this._unsubscribe = onSnapshot(
        q,
        { includeMetadataChanges: true },
        (snap)=> {
          if (this._pollTimer) { clearInterval(this._pollTimer); this._pollTimer = null; }
          renderSnap(snap);
        },
        (err)=> {
          console.warn('onSnapshot falló, uso polling:', err?.code || err?.message || err);
          startPolling();
        }
      );
    }catch(err){
      console.warn('Listen lanzó excepción, uso polling:', err);
      startPolling();
    }
  }

  async vote(id){
    await ensureFirebase();
    const { doc, updateDoc, increment } = window._FB;
    try{ await updateDoc(doc(db,'comments',id), { votes: increment(1) }); }
    catch(err){ console.warn('No se pudo votar:', err?.message||err); }
  }
}

/* =========================================================
   Blog Manager (render, galería, recarga sin duplicados)
========================================================= */
class BlogManager{
  constructor(){
    this.entradas=[];
    this.container = document.getElementById('blog-entries');
    this.loader = document.getElementById('blog-loading');
    this.template = document.getElementById('entry-template');
  }

  async init(){
    await this.loadWithRetry();
    this.render();
    BlogUtils.readingBar();
    const y=document.getElementById('current-year'); if(y) y.textContent=String(new Date().getFullYear());
  }

  async loadWithRetry(max=3){
    let tryNo=0,lastErr=null;
    while(tryNo<max){
      try{ await this.loadCSV(); return; }
      catch(e){ lastErr=e; tryNo++; await new Promise(r=>setTimeout(r, 350*Math.pow(2,tryNo-1))); }
    }
    console.error('CSV error:', lastErr); BlogUtils.showError('No pudimos cargar las historias. Reintenta en unos segundos.');
  }

  async loadCSV(){
    if (typeof Papa === 'undefined') throw new Error('PapaParse no encontrado');
    const controller=new AbortController(); const t=setTimeout(()=>controller.abort(), 10000);
    const res=await fetch(CSV_URL,{cache:'no-store', signal:controller.signal}); clearTimeout(t);
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const text=await res.text();
    const parsed=Papa.parse(text,{header:true, skipEmptyLines:true, transform:v=>v.trim()});
    const rows=parsed.data||[];
    this.entradas = rows
      .filter(r=>r.titulo && r.contenido)
      .map((r,i)=>({
        id:r.id||String(i),
        fecha:r.fecha||'',
        titulo:r.titulo,
        contenido:r.contenido,
        imagenes:BlogUtils.limpiarURLs(r.imagenPrincipal||''),
        videos:BlogUtils.limpiarURLs(r.videoURL||''),
        orden: parseInt(r.orden)||0
      }))
      .sort((a,b)=>a.orden-b.orden);
    if(!this.entradas.length) throw new Error('CSV vacío');
  }

  render(){
    if(this.loader) this.loader.style.display='none';
    if(!this.container || !this.template?.content) return;
    this.container.innerHTML='';

    this.entradas.forEach(ent=>{
      const dom = this.template.content.cloneNode(true);
      dom.querySelector('.blog-entry').setAttribute('data-entry-id', ent.id);
      dom.querySelector('.entry-title').textContent = ent.titulo;
      dom.querySelector('.entry-date').textContent  = BlogUtils.formatearFecha(ent.fecha);

      // Texto
      const txt=dom.querySelector('.entry-text');
      ent.contenido.split('\n').forEach(line=>{ if(!line.trim()) return; const p=document.createElement('p'); p.className='notebook-line'; p.textContent=line.trim(); txt.appendChild(p); });

      // Galería
      const gallery=dom.querySelector('.media-gallery');
      ent.imagenes.forEach(url=>{
        const fig=document.createElement('figure'); fig.className='photo-polaroid';
        const img=new Image(); img.src=url; img.alt=ent.titulo; img.loading='lazy'; img.className='entrada-imagen';
        img.removeAttribute('height'); // por si vienen alturas inline
        img.onerror = ()=>{ fig.classList.add('image-error'); fig.innerHTML='<div style="padding:10px;color:#999">Imagen no disponible</div>'; };
        fig.appendChild(img); gallery.appendChild(fig);
        BlogUtils.preload(url,'image');
      });
      ent.videos.forEach(url=>{
        const iframe=document.createElement('iframe');
        iframe.src=url; iframe.className='entrada-video'; iframe.setAttribute('allowfullscreen','true'); iframe.loading='lazy';
        gallery.appendChild(iframe);
      });

      // Comentarios
      const mount=document.createElement('div'); mount.className='comments-mount';
      dom.querySelector('.entry-content').appendChild(mount);
      new CommentsModule(ent.id, mount);

      this.container.appendChild(dom);
    });
  }

  async recargar(){ await this.init(); }
}

/* =========================================================
   Ecommerce (tu integración ligera)
========================================================= */
class BlogEcommerceIntegration{
  constructor(){ this.wireProductLinks(); this.wireCTAs(); }
  wireProductLinks(){
    document.querySelectorAll('[data-product]').forEach(el=>{
      const id=el.dataset.product;
      el.style.cursor='pointer'; el.style.textDecoration='underline'; el.style.color='var(--primary-green)';
      el.addEventListener('click',()=>{ window.location.href=`index.html#productos?highlight=${id}`; });
    });
  }
  wireCTAs(){
    document.querySelectorAll('.cta-button-blog').forEach(cta=>{
      cta.addEventListener('click', e=>{
        const action=e.currentTarget.textContent.trim();
        if(typeof gtag!=='undefined'){ gtag('event','blog_cta_click',{event_category:'Blog',event_label:action}); }
      });
    });
  }
}

/* =========================================================
   Service Worker inline (Blob) — sin archivo extra
========================================================= */
function registerInlineSW(){
  if (!('serviceWorker' in navigator)) return;
  const code = `
    const VERSION='pato-v1.0.3';
    const CORE=['/','/blog.html','/blog.css','/blog.js','https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js'];
    self.addEventListener('install',e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
    self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
    // Stale-While-Revalidate
    self.addEventListener('fetch',e=>{
      const req=e.request;
      e.respondWith((async()=>{const cache=await caches.open(VERSION);const cached=await cache.match(req);
        const fresh=fetch(req).then(res=>{if(res&&res.ok) cache.put(req,res.clone()); return res;}).catch(()=>cached);
        return cached||fresh; })());
    });
  `;
  const blob = new Blob([code], {type:'text/javascript'});
  const url = URL.createObjectURL(blob);
  navigator.serviceWorker.register(url).catch(()=>{});
}

/* =========================================================
   Helpers
========================================================= */
function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }

/* =========================================================
   Boot
========================================================= */
let blogManager;
document.addEventListener('DOMContentLoaded', async ()=>{
  addGlobalStyles();

  if (typeof Papa === 'undefined'){
    console.error('PapaParse no está disponible.');
    BlogUtils.showError('Error de inicialización.');
    return;
  }

  try{
    blogManager = new BlogManager();
    await blogManager.init();
    new BlogEcommerceIntegration();
    registerInlineSW();
    // Recarga suave cada 60s (sin duplicar módulos)
    setInterval(()=>{ if(blogManager?.entradas?.length){ blogManager.recargar(); } }, 60000);
  }catch(e){
    console.error(e); BlogUtils.showError('Error de inicialización del blog.');
  }
});

// Expuesto para el botón "Reintentar"
window.recargarBlog = ()=> blogManager?.recargar();
