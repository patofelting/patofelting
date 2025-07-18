const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJwvzHZQN3CQarSDqjk_nShegf8F4ydARvkSK55VabxbCi9m8RuGf2Nyy9ScriFRfGdhZd0P54VS5z/pub?output=csv';

async function fetchProductsCSV(url) {
  const resp = await fetch(url, { headers: { 'Cache-Control': 'no-store' } });
  if (!resp.ok) {
    throw new Error('HTTP ' + resp.status);
  }
  const csvText = await resp.text();
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) {
    console.error('PapaParse errors:', parsed.errors);
  }
  return parsed.data;
}

function createCard(p) {
  const card = document.createElement('div');
  card.className = 'producto-card';

  const img = document.createElement('img');
  img.dataset.src = p.foto || '';
  img.alt = p.nombre || 'Producto';
  img.loading = 'lazy';
  img.onerror = () => { img.src = '/img/placeholder.jpg'; };

  const nombre = document.createElement('h3');
  nombre.className = 'producto-nombre';
  nombre.textContent = p.nombre || 'Sin nombre';

  const precio = document.createElement('p');
  precio.className = 'producto-precio';
  if (p.precio) {
    precio.textContent = `$U ${parseFloat(p.precio).toLocaleString('es-UY')}`;
  } else {
    precio.textContent = 'Precio no disponible';
  }

  card.append(img, nombre, precio);
  return card;
}

async function loadProducts() {
  const gallery = document.getElementById('galeria-productos');
  const loader = document.getElementById('product-loader');
  loader.hidden = false;
  try {
    const rows = await fetchProductsCSV(SHEET_CSV_URL);
    gallery.innerHTML = '';
    rows.forEach(row => gallery.appendChild(createCard(row)));
  } catch (err) {
    gallery.innerHTML = '<p>Error al cargar los productos.</p>';
    console.error(err);
  } finally {
    loader.hidden = true;
  }
}

document.addEventListener('DOMContentLoaded', loadProducts);
