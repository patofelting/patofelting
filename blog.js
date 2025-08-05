// blog.js - Blog Patofelting desde Google Sheets (CSV)
// URL CSV de tu Google Sheets
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRJwvzHZQN3CQarSDqjk_nShegf8F4ydARvkSK55VabxbCi9m8RuGf2Nyy9ScriFRfGdhZd0P54VS5z/pub?gid=127717360&single=true&output=csv";

document.addEventListener("DOMContentLoaded", () => {
  cargarEntradasBlog();
});

// Función principal
function cargarEntradasBlog() {
  fetch(CSV_URL)
    .then(res => res.text())
    .then(csv => {
      const entradas = parseCSV(csv);
      renderBlogEntries(entradas);
    })
    .catch(err => {
      mostrarError("No se pudo cargar el blog. Intenta más tarde.");
      console.error(err);
    });
}

// Parseo simple de CSV (requiere que el contenido y los campos no tengan comas internas, para contenido HTML usa comillas dobles)
function parseCSV(csv) {
  const lines = csv.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.trim());
  return lines.slice(1)
    .map(line => {
      // Soporte para texto entre comillas dobles
      const cols = [];
      let i = 0, inQuotes = false, cell = "";
      for (let c of line) {
        if (c === '"') inQuotes = !inQuotes;
        else if (c === "," && !inQuotes) {
          cols.push(cell);
          cell = "";
        } else {
          cell += c;
        }
      }
      cols.push(cell);
      const obj = {};
      headers.forEach((h, idx) => obj[h] = cols[idx] ? cols[idx].trim() : "");
      return obj;
    })
    .sort((a, b) => Number(a.orden || 0) - Number(b.orden || 0));
}

// Renderizado de entradas del blog en el <main id="main-content">
function renderBlogEntries(entries) {
  const main = document.getElementById("main-content");
  main.innerHTML = "";
  if (!entries || !entries.length) {
    mostrarError("No hay entradas en el blog todavía.");
    return;
  }
  entries.forEach(entry => {
    const article = document.createElement("article");
    article.className = "blog-entry";
    article.setAttribute("role", "article");
    article.setAttribute("tabindex", "0");
    article.setAttribute("aria-label", entry.titulo);

    // Fecha
    if (entry.fecha) {
      const fechaDiv = document.createElement("div");
      fechaDiv.className = "entry-date";
      fechaDiv.textContent = formatoFecha(entry.fecha);
      article.appendChild(fechaDiv);
    }

    // Título
    if (entry.titulo) {
      const titulo = document.createElement("h2");
      titulo.className = "entry-title";
      titulo.textContent = entry.titulo;
      article.appendChild(titulo);
    }

    // Contenido
    if (entry.contenido) {
      const texto = document.createElement("div");
      texto.className = "entry-text";
      texto.innerHTML = entry.contenido;
      article.appendChild(texto);
    }

    // Galería de Imágenes
    if (entry.imagenPrincipal) {
      const imgs = entry.imagenPrincipal.split(",").map(u => u.trim()).filter(Boolean);
      if (imgs.length) {
        const gal = document.createElement("div");
        gal.className = "media-gallery";
        imgs.forEach((url, idx) => {
          const img = document.createElement("img");
          img.src = url;
          img.alt = `Imagen ${idx+1} de la entrada: ${entry.titulo || ""}`;
          img.loading = "lazy";
          img.width = 400;
          gal.appendChild(img);
        });
        article.appendChild(gal);
      }
    }

    // Galería de Videos (solo Imgur/mp4)
    if (entry.videoURL) {
      const vids = entry.videoURL.split(",").map(u => u.trim()).filter(Boolean);
      if (vids.length) {
        const gal = document.createElement("div");
        gal.className = "media-gallery";
        vids.forEach((url, idx) => {
          const video = document.createElement("video");
          video.src = url;
          video.controls = true;
          video.width = 400;
          video.setAttribute("aria-label", `Video ${idx+1} de la entrada: ${entry.titulo || ""}`);
          gal.appendChild(video);
        });
        article.appendChild(gal);
      }
    }

    main.appendChild(article);
  });
}

// Utilidad para mostrar errores amigables en el blog
function mostrarError(msg) {
  const main = document.getElementById("main-content");
  main.innerHTML = `<div class="blog-error" role="alert" aria-live="polite">${msg}</div>`;
}

// Fecha con formato legible
function formatoFecha(fechaStr) {
  // Detecta formato YYYY-MM-DD o DD/MM/YYYY
  let d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) {
    d = new Date(fechaStr);
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(fechaStr)) {
    const [dia, mes, año] = fechaStr.split("/");
    d = new Date(`${año}-${mes}-${dia}`);
  } else {
    return fechaStr;
  }
  return d.toLocaleDateString("es-ES", { year: 'numeric', month: 'long', day: 'numeric' });
}
