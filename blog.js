/* =========================================================
   Patofelting · blog.js (experiencia premiada)
   - Mantiene tu estructura HTML (no se toca blog.html)
   - Solo requiere configurar FIREBASE_CONFIG
========================================================= */

/* ========= CONFIG FIREBASE (rellena con tus credenciales) ========= */
const FIREBASE_CONFIG = {
  apiKey: "TU_APIKEY",
  authDomain: "TU_AUTH_DOMAIN",
  projectId: "TU_PROJECT_ID",
  storageBucket: "TU_BUCKET",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID"
};
/* ================================================================ */

/* ========= URL del CSV (tu Google Sheets) ========= */
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJwvzHZQN3CQarSDqjk_nShegf8F4ydARvkSK55VabxbCi9m8RuGf2Nyy9ScriFRfGdhZd0P54VS5z/pub?gid=127717360&single=true&output=csv';

/* ========= Utilidades ========= */
class BlogUtils {
  static formatearFecha(fecha) {
    if (!fecha) return '';
    const [d,m,y] = fecha.split('/');
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
  static limpiarURLs(urls) {
    if (!urls) return [];
    return urls.split(',').map(s=>s.trim()).filter(Boolean);
  }
  static calculateReadingTime() {
    const el = document.querySelector('.blog-main');
    if (!el) return 1;
    const words = el.textContent.trim().split(/\s+/).length;
    return Math.max(1, Math.ceil(words/200));
  }
  static preload(href, as, type){
    const l = document.createElement('link');
    l.rel = 'preload'; l.href = href; l.as = as;
    if (type) l.type = type;
    document.head.appendChild(l);
  }
}

/* ========= MICRO: Luz del día (sombras por hora) ========= */
function applySunlightShadows(){
  const now = new Date();
  const h = now.getHours(); // 0..23
  const x = (h-12)*1.2;                            // px (izq/der)
  const y = Math.max(4, 14 - Math.abs(12-h)*.6);   // px (altura)
  const blur = 18 + Math.abs(12-h)*.8;             // px
  const alpha = (h>=7 && h<=19)? .16 : .28;
  const r = document.documentElement.style;
  r.setProperty('--shadow-x', `${x}px`);
  r.setProperty('--shadow-y', `${y}px`);
  r.setProperty('--shadow-blur', `${blur}px`);
  r.setProperty('--shadow-alpha', alpha.toString());
}

/* ========= MICRO: Lana al scrollear ========= */
function attachYarnScroll(){
  const onScroll=()=>{
    const y = window.scrollY || 0;
    document.documentElement.style.setProperty('--yarn-offset', `${y}px`);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, {passive:true});
}

/* ========= Skins / Alto contraste (solo CSS variables) ========= */
const Skin = {
  init(){
    const root = document.documentElement;
    const saved = localStorage.getItem('skin') || 'cuaderno';
    const contrast = localStorage.getItem('contrast') || 'normal';
    root.dataset.skin = (saved==='cuaderno') ? '' : saved;
    if (contrast==='high') root.dataset.contrast='high'; else root.removeAttribute('data-contrast');
    this.mountQuickBar();
  },
  set(name){
    const root = document.documentElement;
    if (name==='cuaderno') root.removeAttribute('data-skin'); else root.dataset.skin=name;
    localStorage.setItem('skin', name);
  },
  toggleContrast(){
    const root = document.documentElement;
    const active = root.dataset.contrast === 'high';
    if (active){ root.removeAttribute('data-contrast'); localStorage.setItem('contrast','normal'); }
    else { root.dataset.contrast='high'; localStorage.setItem('contrast','high'); }
  },
  mountQuickBar(){
    if (document.getElementById('blog-quickbar')) return;
    const bar = document.createElement('div');
    bar.id = 'blog-quickbar';
    bar.innerHTML = `
      <button class="quick-btn" id="btn-skin-cuaderno" title="Skin cuaderno">📓</button>
      <button class="quick-btn" id="btn-skin-acuarela" title="Skin acuarela">🎨</button>
      <button class="quick-btn" id="btn-skin-tejido"   title="Skin tejido">🧵</button>
      <button class="quick-btn secondary" id="btn-contrast" title="Alto contraste (Alt+H)">🔆</button>
      <button class="quick-btn" id="btn-voice" title='Voz: "Patofelting, lee los últimos posts"'>🗣️</button>
    `;
    document.body.appendChild(bar);
    document.getElementById('btn-skin-cuaderno').onclick=()=>Skin.set('cuaderno');
    document.getElementById('btn-skin-acuarela').onclick=()=>Skin.set('acuarela');
    document.getElementById('btn-skin-tejido').onclick=()=>Skin.set('tejido');
    document.getElementById('btn-contrast').onclick=()=>Skin.toggleContrast();
    document.getElementById('btn-voice').onclick=Voice.toggle();
    // Acceso rápido: Alt+H alto contraste
    window.addEventListener('keydown',e=>{ if(e.altKey && e.key.toLowerCase()==='h'){Skin.toggleContrast();} });
  }
};

/* ========= Firebase (Firestore) ========= */
let app, db, auth;
async function ensureFirebase(){
  if (db) return db;
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js');
  const { getFirestore, collection, addDoc, onSnapshot, query, where, orderBy, serverTimestamp, doc, updateDoc, increment } =
    await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js');
  const { getAuth, signInAnonymously, onAuthStateChanged } =
    await import('https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js');

  app = initializeApp(FIREBASE_CONFIG);
  db = getFirestore(app);
  auth = getAuth(app);
  await signInAnonymously(auth);
  onAuthStateChanged(auth, user=>{ if (user) { window.PATO_USER_ID=user.uid; } });

  // Exponemos helpers para reuso
  window.PATO_FB = { collection, addDoc, onSnapshot, query, where, orderBy, serverTimestamp, doc, updateDoc, increment };
  return db;
}

/* ========= Gamificación ========= */
const Gamification = {
  async addPoints(uid, delta=1){
    await ensureFirebase();
    const { doc, updateDoc, increment } = window.PATO_FB;
    const ref = doc(db, 'users', uid);
    try { await updateDoc(ref, { points: increment(delta) }); } catch(e){ /* usuario inexistente: ignorar (puede crearse en otro flujo) */ }
  },
  badgeFor(points){
    if (points>=100) return 'Maestro del Telar 🧶👑';
    if (points>=50)  return 'Hilador Experto 🧵✨';
    if (points>=5)   return 'Tejedor Ávido 🧶';
    return null;
  }
};

/* ========= Comentarios, votos y Post‑its ========= */
class CommentsModule{
  constructor(entryId, mountEl){
    this.entryId = entryId;
    this.mountEl = mountEl;
    this.renderShell();
    this.listen();
  }
  ui(){
    const wrap=document.createElement('section');
    wrap.className='comments';
    wrap.innerHTML = `
      <h3 style="font-family:var(--font-cursive);color:var(--dark-green);margin:1rem 0;">Comentarios</h3>
      <form class="comment-form" aria-label="Agregar comentario">
        <input name="name" required placeholder="Tu nombre" aria-label="Nombre" />
        <textarea name="text" required placeholder="Escribe un comentario..." rows="3" aria-label="Comentario"></textarea>
        <button type="submit" class="quick-btn">Publicar</button>
      </form>
      <ul class="comment-list" aria-live="polite"></ul>
    `;
    // estilos mínimos inyectados
    const s = document.createElement('style');
    s.textContent = `
      .comment-form{display:grid;gap:.5rem;margin:.6rem 0;}
      .comment-form input,.comment-form textarea{padding:.6rem;border-radius:10px;border:2px dashed rgba(0,0,0,.08);font-family:var(--font-system)}
      .comment-list{list-style:none;display:grid;gap:.6rem;margin-top:.8rem}
      .comment{background:var(--paper);border-radius:12px;padding:.7rem .8rem;position:relative}
      .vote{position:absolute;right:.6rem;top:.5rem;cursor:pointer}
      .yarn{filter:drop-shadow(0 2px 4px rgba(0,0,0,.2))}
    `;
    document.head.appendChild(s);
    return wrap;
  }
  renderShell(){
    const ui = this.ui();
    this.mountEl.appendChild(ui);
    const form = ui.querySelector('.comment-form');
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd = new FormData(form);
      const name = (fd.get('name')||'').toString().trim();
      const text = (fd.get('text')||'').toString().trim();
      if(!name || !text) return;
      const uid = window.PATO_USER_ID || 'anon';
      await ensureFirebase();
      const { addDoc, collection, serverTimestamp } = window.PATO_FB;
      await addDoc(collection(db,'comments'),{
        entryId:this.entryId, name, text, votes:0, createdAt:serverTimestamp(), uid
      });
      form.reset();
      Gamification.addPoints(uid, 2); // +2 por comentar
    });
    this.listEl = ui.querySelector('.comment-list');
  }
  async listen(){
    await ensureFirebase();
    const { onSnapshot, collection, query, where, orderBy } = window.PATO_FB;
    const q = query(collection(db,'comments'),
                    where('entryId','==',this.entryId),
                    orderBy('votes','desc'), orderBy('createdAt','asc'));
    onSnapshot(q, snap=>{
      this.listEl.innerHTML='';
      snap.forEach(docSnap=>{
        const c = docSnap.data();
        const li = document.createElement('li');
        li.className='comment';
        li.innerHTML = `
          <strong>${c.name}</strong>
          <p>${c.text}</p>
          <button class="vote" title="Votar comentario destacado">
            <span class="yarn" aria-hidden="true">🧶</span> <span class="v">${c.votes||0}</span>
          </button>
          <button class="quick-btn secondary" data-postit>Post‑it</button>
        `;
        // votar
        li.querySelector('.vote').onclick = async ()=>{
          await ensureFirebase();
          const { doc, updateDoc, increment } = window.PATO_FB;
          await updateDoc(doc(db,'comments',docSnap.id),{ votes: increment(1) });
          Gamification.addPoints(window.PATO_USER_ID, 1); // +1 por votar
        };
        // convertir a post-it colocable
        li.querySelector('[data-postit]').onclick = ()=> this.spawnPostit(c, docSnap.id);
        this.listEl.appendChild(li);
      });
    });
  }
  async spawnPostit(comment, id){
    // crear nota arrastrable sobre la entrada
    const note = document.createElement('div');
    note.className='postit';
    note.tabIndex=0;
    note.textContent = comment.text;
    note.style.position='absolute';
    note.style.left='20px'; note.style.top='20px';
    // contenedor seguro:
    const container = this.mountEl.closest('.notebook-page') || this.mountEl;
    container.style.position='relative';
    container.appendChild(note);
    note.focus();
    // arrastre básico
    let drag=false, offX=0, offY=0;
    note.addEventListener('mousedown',e=>{drag=true;offX=e.offsetX;offY=e.offsetY; note.classList.add('wiggle');});
    window.addEventListener('mouseup',()=>{drag=false; note.classList.remove('wiggle');});
    window.addEventListener('mousemove',async e=>{
      if(!drag) return;
      const rect = container.getBoundingClientRect();
      note.style.left = (e.pageX - rect.left - offX) + 'px';
      note.style.top  = (e.pageY - rect.top  - offY + window.scrollY) + 'px';
    }, {passive:true});
    // persistir posición/color en Firestore
    await ensureFirebase();
    const { doc, updateDoc } = window.PATO_FB;
    note.addEventListener('mouseup', async ()=>{
      const color = getComputedStyle(note).backgroundColor;
      await updateDoc(doc(db,'comments',id),{ postit: { left:note.style.left, top:note.style.top, color }});
    });
  }
}

/* ========= Voz: lectura + comando ========= */
const Voice = (()=>{
  let listening = false, recog=null;
  const canRead = 'speechSynthesis' in window;
  const canRec  = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;

  function readLatest(){
    if(!canRead) return alert('Tu navegador no soporta lectura en voz.');
    const titles = [...document.querySelectorAll('.entry-title')].slice(0,3).map(e=>e.textContent.trim());
    const text = titles.length ? `Últimos posts: ${titles.join('. ')}.` : 'No hay posts para leer por ahora.';
    const u = new SpeechSynthesisUtterance(text);
    u.lang='es-ES'; u.rate=1; u.pitch=1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }
  function startCmd(){
    if(!canRec) return alert('Comandos de voz no soportados.');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recog = new SR(); recog.lang='es-ES'; recog.continuous=false; recog.interimResults=false;
    recog.onresult = e=>{
      const phrase = (e.results[0][0].transcript||'').toLowerCase();
      if (phrase.includes('patofelting') && phrase.includes('lee los últimos posts')) readLatest();
    };
    recog.onend = ()=> listening=false;
    recog.start(); listening=true;
  }
  return {
    toggle(){ listening ? window.speechSynthesis.cancel() : startCmd(); },
    readLatest
  };
})();

/* ========= Transcripción automática (best-effort) ========= */
async function attachTranscriptionButtons(){
  const videos = document.querySelectorAll('iframe.entrada-video, video.entrada-video');
  videos.forEach(v=>{
    const btn = document.createElement('button');
    btn.className='quick-btn secondary';
    btn.textContent='Transcribir video';
    btn.style.margin='8px 0';
    btn.onclick=()=>transcribeVideo(v);
    v.insertAdjacentElement('afterend', btn);
  });
}
async function transcribeVideo(videoEl){
  const canRec = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  if(!canRec) return alert('Transcripción no soportada en este navegador.');
  try{
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recog = new SR(); recog.lang='es-ES'; recog.continuous=true;
    let text = '';
    recog.onresult = e=>{
      for(let i=e.resultIndex;i<e.results.length;i++){
        if(e.results[i].isFinal) text += e.results[i][0].transcript + ' ';
      }
    };
    recog.onend = ()=>{
      const pre = document.createElement('pre');
      pre.style.whiteSpace='pre-wrap'; pre.style.background='var(--paper)'; pre.style.padding='8px'; pre.style.borderRadius='10px';
      pre.textContent = text.trim() || 'No se capturó audio. (Consejo: acerca el micrófono al altavoz).';
      videoEl.insertAdjacentElement('afterend', pre);
    };
    recog.start();
    alert('Transcripción en curso. Habla cerca del audio si es necesario.');
  }catch(e){ alert('No fue posible transcribir automáticamente en este entorno.'); }
}

/* ========= E‑commerce (tu integración existente) ========= */
class BlogEcommerceIntegration {
  constructor(){ this.addProductLinks(); this.addCallToActionTracking(); }
  addProductLinks(){
    document.querySelectorAll('[data-product]').forEach(mention=>{
      const productId = mention.dataset.product;
      mention.addEventListener('click',()=>{ window.location.href=`index.html#productos?highlight=${productId}`;});
      mention.style.cssText='cursor:pointer;text-decoration:underline;color:var(--primary-green)';
    });
  }
  addCallToActionTracking(){
    document.querySelectorAll('.cta-button-blog').forEach(cta=>{
      cta.addEventListener('click', e=>{
        const action = e.target.textContent.trim();
        if (typeof gtag !== 'undefined'){ gtag('event','blog_cta_click',{event_category:'Blog',event_label:action});}
      });
    });
  }
}

/* ========= Gestor principal del blog ========= */
class BlogManager {
  constructor(){ this.entradas=[]; this.init(); }
  async init(){
    await this.cargarEntradasDesdeCSV();
    this.renderEnhancements();
  }
  async cargarEntradasDesdeCSV(){
    try{
      const resp = await fetch(CSV_URL,{cache:'reload'});
      if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const texto = await resp.text();
      const resultado = Papa.parse(texto,{ header:true, skipEmptyLines:true, transform:v=>v.trim() });
      this.entradas = resultado.data
        .filter(f=>f.titulo && f.contenido)
        .map((f,i)=>({
          id: f.id || i.toString(),
          fecha: f.fecha || '',
          titulo: f.titulo,
          contenido: f.contenido,
          imagenes: BlogUtils.limpiarURLs(f.imagenPrincipal || ''),
          videos:   BlogUtils.limpiarURLs(f.videoURL || ''),
          orden: parseInt(f.orden)||0,
          postit: f.postit || '',
          ordenpostit: parseInt(f.ordenpostit)||0,
        }))
        .sort((a,b)=>a.orden-b.orden);
      this.renderizarBlog();
    }catch(e){
      console.error('CSV error', e);
      BlogUtils.mostrarMensajeError();
    }
  }
  renderizarBlog(){
    const cont = document.getElementById('main-content');
    const tpl  = document.getElementById('entry-template');
    const loader = document.getElementById('blog-loading');
    if(loader) loader.style.display='none';
    cont.innerHTML='';
    if(!this.entradas.length){ BlogUtils.mostrarMensajeVacio(); return; }

    this.entradas.forEach(ent=>{
      const clone = tpl.content.cloneNode(true);
      const entry = clone.querySelector('.blog-entry');
      entry.setAttribute('data-entry-id', ent.id);
      const titleEl = clone.querySelector('.entry-title');
      titleEl.innerHTML = `${ent.titulo}<span class="stitch" aria-hidden="true"></span>`;
      clone.querySelector('.entry-date').textContent = BlogUtils.formatearFecha(ent.fecha);

      // Texto
      const txt = clone.querySelector('.entry-text');
      ent.contenido.split('\n').forEach(line=>{
        if(!line.trim()) return;
        const p = document.createElement('p');
        p.className='notebook-line';
        p.textContent=line.trim();
        txt.appendChild(p);
      });

      // Media
      let gallery = clone.querySelector('.media-gallery');
      if(!gallery){
        gallery = document.createElement('div'); gallery.className='media-gallery';
        clone.querySelector('.entry-content').appendChild(gallery);
      }
      ent.imagenes.forEach(url=>{
        const fig=document.createElement('figure'); fig.className='photo-polaroid';
        const img=new Image(); img.src=url; img.alt=ent.titulo; img.loading='lazy'; img.className='entrada-imagen';
        img.onerror=()=>{ fig.classList.add('image-error'); fig.innerHTML='<div style="padding:10px;color:#999">Imagen no disponible</div>'; };
        fig.appendChild(img); gallery.appendChild(fig);
      });
      ent.videos.forEach(url=>{
        const iframe=document.createElement('iframe');
        iframe.src=url; iframe.className='entrada-video'; iframe.allowFullscreen=true; iframe.loading='lazy';
        gallery.appendChild(iframe);
      });

      // Comentarios + post-its
      const commentsMount = document.createElement('div');
      commentsMount.className='comments-mount';
      clone.querySelector('.entry-content').appendChild(commentsMount);

      cont.appendChild(clone);
      new CommentsModule(ent.id, commentsMount);
    });

    // Colores de post-its ya se manejan en CommentsModule al crear
  }
  renderEnhancements(){
    // Tiempo de lectura
    setTimeout(()=>{
      const rt = BlogUtils.calculateReadingTime();
      const el = document.createElement('div');
      el.className='reading-time';
      el.innerHTML = `<span>📖 Tiempo de lectura: ${rt} min</span>`;
      Object.assign(el.style,{
        position:'fixed',bottom:'20px',left:'20px',background:'white',
        padding:'0.5rem 1rem',borderRadius:'25px',boxShadow:'0 4px 15px rgba(0,0,0,.1)',
        fontSize:'0.9rem',color:'var(--ink)',zIndex:'1000'
      });
      document.body.appendChild(el);
    }, 1200);

    // Micro‑interacciones
    attachYarnScroll();
    applySunlightShadows();
    setInterval(applySunlightShadows, 60*1000);

    // Botones de transcribir (best‑effort)
    attachTranscriptionButtons();

    // Preloads básicos
    BlogUtils.preload('https://fonts.googleapis.com/css2?family=Kalam:wght@300;400;700&family=Dancing+Script:wght@400;500;600;700&display=swap','style');
    document.querySelectorAll('img[loading="lazy"]').forEach(img=>{ if (img.src) BlogUtils.preload(img.src,'image'); });
  }
  recargar(){ return this.cargarEntradasDesdeCSV(); }
}

/* ========= Service Worker ========= */
async function registerSW(){
  if ('serviceWorker' in navigator){
    try{ await navigator.serviceWorker.register('/sw.js'); }
    catch(e){ console.warn('SW fail', e); }
  }
}

/* ========= Boot ========= */
let blogManager;
document.addEventListener('DOMContentLoaded', async ()=>{
  // Skins y accesibilidad
  Skin.init();

  // Carga blog + ecomm
  blogManager = new BlogManager();
  new BlogEcommerceIntegration();

  // Voz: comando rápido desde quickbar
  registerSW();

  // Recarga cada 60s (progresivo)
  setInterval(()=>{ if (blogManager && blogManager.entradas.length>0){ blogManager.recargar(); } }, 60000);
});

// Exponer helpers
window.BlogUtils = BlogUtils;
window.recargarBlog = ()=> blogManager && blogManager.recargar();
