// Configuración centralizada
const CONFIG = {
  SHEET_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJwvzHZQN3CQarSDqjk_nShegf8F4ydARvkSK55VabxbCi9m8RuGf2Nyy9ScriFRfGdhZd0P54VS5z/pub?output=csv',
  PLACEHOLDER_IMG: '',
  TIMEOUT: 10000 // 10 segundos
};

// Función mejorada para cargar CSV
async function fetchProductsCSV(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-store' }
    });
    
    clearTimeout(timeoutId);
    
    if (!resp.ok) throw new Error(`Error HTTP: ${resp.status} - ${resp.statusText}`);
    
    const csvText = await resp.text();
    const { data, errors } = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transform: (value, header) => {
        if (header === 'precio') return parseFloat(value) || 0;
        return value;
      }
    });

    if (errors.length) {
      console.warn('Errores al parsear CSV:', errors);
    }

    // Validar datos mínimos
    return data.filter(row => row.nombre && row.precio);
    
  } catch (error) {
    clearTimeout(timeoutId);
    console.error('Error en fetchProductsCSV:', error);
    throw error;
  }
}

// Función mejorada para crear tarjetas
function createProductCard(product) {
  const card = document.createElement('div');
  card.className = 'producto-card';
  card.dataset.id = product.id || Math.random().toString(36).substr(2, 9);

  const img = document.createElement('img');
  img.src = product.foto || CONFIG.PLACEHOLDER_IMG;
  img.alt = product.nombre || 'Producto sin nombre';
  img.loading = 'lazy';
  img.onerror = () => { img.src = CONFIG.PLACEHOLDER_IMG; };

  const name = document.createElement('h3');
  name.className = 'producto-nombre';
  name.textContent = product.nombre || 'Producto sin nombre';

  const price = document.createElement('p');
  price.className = 'producto-precio';
  price.textContent = product.precio ? `$U ${product.precio.toLocaleString('es-UY')}` : 'Consultar precio';

  const stock = document.createElement('p');
  stock.className = 'producto-stock';
  stock.textContent = product.cantidad ? `${product.cantidad} disponibles` : 'Stock no especificado';

  card.append(img, name, price, stock);
  return card;
}

// Función mejorada para cargar productos
async function loadProducts() {
  const gallery = document.getElementById('galeria-productos');
  const loader = document.getElementById('product-loader');
  const errorContainer = document.createElement('div');
  errorContainer.className = 'error-container';

  if (!gallery) {
    console.error('Elemento galeria-productos no encontrado');
    return;
  }

  gallery.innerHTML = '';
  loader.hidden = false;
  errorContainer.hidden = true;

  try {
    const products = await fetchProductsCSV(CONFIG.SHEET_URL);
    
    if (!products || products.length === 0) {
      throw new Error('No se encontraron productos');
    }

    gallery.innerHTML = '';
    products.forEach(product => {
      gallery.appendChild(createProductCard(product));
    });

  } catch (error) {
    errorContainer.innerHTML = `
      <p class="error-message">Error al cargar productos: ${error.message}</p>
      <button class="retry-button">Reintentar</button>
    `;
    errorContainer.hidden = false;
    gallery.appendChild(errorContainer);
    
    // Agregar evento al botón de reintento
    errorContainer.querySelector('.retry-button').addEventListener('click', loadProducts);
    
    console.error('Error en loadProducts:', error);
  } finally {
    loader.hidden = true;
  }
}

// Inicialización con verificación de DOM
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(loadProducts, 0);
} else {
  document.addEventListener('DOMContentLoaded', loadProducts);
}
