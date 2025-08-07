// ========== CONFIGURACIÓN (modifica la URL a tu Google Sheet CSV) ==========
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJwvzHZQN3CQarSDqjk_nShegf8F4ydARvkSK55VabxbCi9m8RuGf2Nyy9ScriFRfGdhZd0P54VS5z/pub?gid=127717360&single=true&output=csv';

// ========== UTILIDADES ==========
function parseDate(str) {
  if (!str) return new Date(0);
  const [d, m, y] = str.split('/');
  if (!d || !m || !y) return new Date(0);
  return new Date(`${y}-${m}-${d}T00:00:00`);
}
function slugify(str) {
  return (str || "")
    .toLowerCase()
    .replace(/á/g,"a").replace(/é/g,"e").replace(/í/g,"i").replace(/ó/g,"o").replace(/ú/g,"u")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/--+/g, "-")
    .substring(0, 40);
}

// ========== ÍNDICE DINÁMICO ==========
function renderIndex(entries) {
  const indexNav = document.getElementById("blog-index");
  if (!entries.length) {
    indexNav.innerHTML = "";
    indexNav.classList.add("hidden");
    return;
  }
  indexNav.classList.remove("hidden");

  const ul = document.createElement("ul");
  entries.forEach(entry => {
    const entryId = slugify(entry.titulo + "-" + entry.fecha);
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `#${entryId}`;
    a.textContent = entry.titulo || "Sin título";
    a.setAttribute('aria-label', `Ir a: ${entry.titulo}`);
    a.setAttribute('tabindex', '0');
    a.onclick = (e) => {
      e.preventDefault();
      const el = document.getElementById(entryId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.focus({ preventScroll: true });
        // Cierra índice en mobile (<=600px)
        if (window.innerWidth <= 600) {
          indexNav.classList.add("hidden");
          document.getElementById("toggle-index").setAttribute("aria-expanded", "false");
        }
      }
    };
    li.appendChild(a);
    ul.appendChild(li);
  });
  indexNav.innerHTML = "";
  indexNav.appendChild(ul);
}

// ========== RENDERIZADO DE ENTRADAS ==========
function renderBlog(entries) {
  const contenedor = document.getElementById('blog-entries');
  const template = document.getElementById('entry-template');
  const loader = document.getElementById('blog-loading');
  const emptyState = document.getElementById('blog-empty');
  const errorState = document.getElementById('blog-error');

  // Oculta todos los mensajes de error/vacío
  [loader, emptyState, errorState].forEach(e => e && (e.classList.add('hidden')));

  contenedor.innerHTML = '';

  if (!entries.length) {
    emptyState.classList.remove('hidden');
    return;
  }

  entries.forEach(entry => {
    const entryId = slugify(entry.titulo + "-" + entry.fecha);
    const clone = template.content.cloneNode(true);
    const article = clone.querySelector('.blog-entry');
    article.id = entryId;
    article.setAttribute('role', 'article');
    article.setAttribute('aria-label', entry.titulo);

    // Título y fecha
    clone.querySelector('.entry-title').textContent = entry.titulo;
    clone.querySelector('.entry-date').textContent = entry.fecha;

    // Polaroid imágenes
    const polaroidGallery = clone.querySelector('.polaroid-gallery');
    if (entry.imagenes && entry.imagenes.length > 0 && entry.imagenes[0]) {
      entry.imagenes.forEach((url, i) => {
        const polaroid = document.createElement('div');
        polaroid.className = 'polaroid-img';
        const img = document.createElement('img');
        img.src = url;
        img.alt = entry.titulo;
        img.loading = 'lazy';
        img.onerror = () => { polaroid.style.display = "none"; };
        polaroid.appendChild(img);
        // Caption opcional (puedes combinar con entry.imagenes_caption si existe)
        if (entry.imagenes_caption && entry.imagenes_caption[i]) {
          const caption = document.createElement('div');
          caption.className = 'polaroid-caption';
          caption.innerText = entry.imagenes_caption[i];
          polaroid.appendChild(caption);
        }
        polaroidGallery.appendChild(polaroid);
      });
    }

    // Texto principal
    const textoContainer = clone.querySelector('.entry-text');
    if (entry.contenido) {
      entry.contenido.split('\n').forEach(linea => {
        if (linea.trim()) {
          const p = document.createElement('p');
          p.className = 'notebook-line';
          p.textContent = linea.trim();
          textoContainer.appendChild(p);
        }
      });
    }

    // Post-it
    if (entry.postit) {
      const postitContainer = clone.querySelector('.postit-container');
      const postit = document.createElement('div');
      postit.className = 'postit';
      postit.textContent = entry.postit;
      postit.setAttribute('tabindex', '0');
      postitContainer.appendChild(postit);

      // Efecto tap/mouse
      postit.addEventListener('pointerdown', () => {
        postit.classList.add('wiggle');
        setTimeout(() => postit.classList.remove('wiggle'), 350);
      });
      postit.addEventListener('touchstart', () => {
        postit.classList.add('wiggle');
        setTimeout(() => postit.classList.remove('wiggle'), 350);
      });

      // Accesibilidad: aria-label para post-it
      postit.setAttribute('aria-label', 'Nota destacada: ' + entry.postit);
    }

    contenedor.appendChild(clone);
  });
}

// ========== RESPONSIVE ÍNDICE ==========
function setupIndexMenu(entries) {
  const indexNav = document.getElementById('blog-index');
  const toggleBtn = document.getElementById('toggle-index');
  function updateIndexVisibility() {
    if (window.innerWidth <= 600) {
      indexNav.classList.add('hidden');
      toggleBtn.style.display = "block";
      toggleBtn.setAttribute('aria-expanded', 'false');
    } else {
      indexNav.classList.remove('hidden');
      toggleBtn.style.display = "none";
      toggleBtn.setAttribute('aria-expanded', 'true');
    }
  }
  toggleBtn.addEventListener('click', () => {
    const isOpen = !indexNav.classList.contains('hidden');
    indexNav.classList.toggle('hidden', isOpen);
    toggleBtn.setAttribute('aria-expanded', String(!isOpen));
  });
  window.addEventListener('resize', updateIndexVisibility);
  updateIndexVisibility();
}

// ========== CARGA Y PROCESAMIENTO DE DATOS ==========
async function fetchBlogEntries() {
  const loader = document.getElementById('blog-loading');
  const errorState = document.getElementById('blog-error');
  loader.classList.remove('hidden');
  errorState.classList.add('hidden');
  try {
    const resp = await fetch(CSV_URL);
    if (!resp.ok) throw new Error("No se pudieron cargar las historias");
    const text = await resp.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, transform: v => v.trim() });
    let entries = (parsed.data || [])
      .filter(row => row.titulo && row.fecha)
      .map((row, idx) => ({
        id: row.id || idx.toString(),
        fecha: row.fecha,
        titulo: row.titulo,
        contenido: row.contenido,
        imagenes: (row.imagenPrincipal || '').split(',').map(x=>x.trim()).filter(Boolean),
        imagenes_caption: (row.imagenCaption || '').split('|').map(x=>x.trim()),
        orden: parseInt(row.orden) || 0,
        postit: row.postit || '',
      }));

    // Ordenar por fecha descendente, y si igual por orden descendente
    entries = entries.sort((a, b) => {
      const dateA = parseDate(a.fecha);
      const dateB = parseDate(b.fecha);
      if (dateA > dateB) return -1;
      if (dateA < dateB) return 1;
      return (parseInt(b.orden) || 0) - (parseInt(a.orden) || 0);
    });

    renderBlog(entries);
    renderIndex(entries);
    setupIndexMenu(entries);
  } catch (e) {
    document.getElementById('blog-loading').classList.add('hidden');
    document.getElementById('blog-empty').classList.add('hidden');
    document.getElementById('blog-error').classList.remove('hidden');
  }
}

// ========== FOOTER AÑO ACTUAL ==========
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('current-year').textContent = (new Date()).getFullYear();
  fetchBlogEntries();
  window.recargarBlog = fetchBlogEntries;
});
