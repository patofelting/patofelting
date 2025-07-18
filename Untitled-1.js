// ===============================
// CONFIGURACIÓN
// ===============================
const CONFIG = {
  SHEET_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJwvzHZQN3CQarSDqjk_nShegf8F4ydARvkSK55VabxbCi9m8RuGf2Nyy9ScriFRfGdhZd0P54VS5z/pub?output=csv',
  TIMEOUT: 10000, // 10 segundos
  REQUIRED_FIELDS: ['nombre', 'precio', 'foto'],
  PRODUCTS_PER_PAGE: 12,
  PLACEHOLDER_IMG: '/img/placeholder.jpg'
};

// ===============================
// ESTADO GLOBAL
// ===============================
let allProducts = [];
let currentPage = 1;

// ===============================
// ELEMENTOS DEL DOM
// ===============================
const elements = {
  gallery: document.getElementById('galeria-productos'),
  loader: document.getElementById('product-loader'),
  errorContainer: document.getElementById('error-container'),
  pagination: document.getElementById('pagination'),
  searchInput: document.getElementById('search-input')
};

// ===============================
// FUNCIÓN PARA CARGAR PRODUCTOS
// ===============================
async function fetchProducts() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONFIG.TIMEOUT);
  
  try {
    showLoadingState();
    
    const response = await fetch(CONFIG.SHEET_URL, {
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }
    
    const csvText = await response.text();
    const { data, errors } = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transform: (value, header) => {
        if (header === 'precio') return parseFloat(value) || 0;
        if (header === 'cantidad') return parseInt(value) || 0;
        return value;
      }
    });
    
    if (errors.length) {
      console.warn('Errores de parseo CSV:', errors);
    }
    
    // Validar campos requeridos
    const validProducts = data.filter(row => 
      CONFIG.REQUIRED_FIELDS.every(field => row[field] !== undefined && row[field] !== '')
      .map(product => ({
        ...product,
        id: product.id || generateId(),
        precio: parseFloat(product.precio) || 0,
        cantidad: parseInt(product.cantidad) || 0
      }));
    
    return validProducts;
    
  } catch (error) {
    console.error('Error al cargar productos:', error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

// ===============================
// MANEJO DE ESTADOS DE UI
// ===============================
function showLoadingState() {
  if (elements.loader) elements.loader.hidden = false;
  if (elements.errorContainer) elements.errorContainer.hidden = true;
  if (elements.gallery) elements.gallery.innerHTML = '';
}

function showErrorState(error) {
  if (elements.loader) elements.loader.hidden = true;
  
  const errorMessage = getFriendlyErrorMessage(error);
  
  if (elements.errorContainer) {
    elements.errorContainer.hidden = false;
    elements.errorContainer.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-triangle"></i>
        <p>${errorMessage}</p>
        <button id="retry-button">Reintentar</button>
      </div>
    `;
    
    document.getElementById('retry-button').addEventListener('click', loadProducts);
  }
}

function getFriendlyErrorMessage(error) {
  if (error.name === 'AbortError') return 'La carga tardó demasiado. Por favor, verifica tu conexión.';
  if (error.message.includes('HTTP')) return 'No se pudo conectar con el servidor.';
  if (error.message.includes('parse')) return 'Los datos recibidos no son válidos.';
  return 'Ocurrió un error al cargar los productos.';
}

// ===============================
// RENDERIZADO DE PRODUCTOS
// ===============================
function renderProducts(products) {
  if (!elements.gallery) return;
  
  elements.gallery.innerHTML = '';
  
  if (products.length === 0) {
    elements.gallery.innerHTML = '<p class="no-products">No se encontraron productos</p>';
    return;
  }
  
  const fragment = document.createDocumentFragment();
  
  products.forEach(product => {
    const card = createProductCard(product);
    fragment.appendChild(card);
  });
  
  elements.gallery.appendChild(fragment);
  setupProductCardInteractions();
}

function createProductCard(product) {
  const card = document.createElement('div');
  card.className = 'product-card';
  card.dataset.id = product.id;
  
  const imgContainer = document.createElement('div');
  imgContainer.className = 'product-image-container';
  
  const img = document.createElement('img');
  img.className = 'product-image';
  img.alt = product.nombre || 'Producto sin nombre';
  img.loading = 'lazy';
  
  // Manejo de imagen
  if (product.foto && isValidUrl(product.foto)) {
    img.src = product.foto;
    img.onerror = () => { img.src = CONFIG.PLACEHOLDER_IMG; };
  } else {
    img.src = CONFIG.PLACEHOLDER_IMG;
  }
  
  imgContainer.appendChild(img);
  
  const infoContainer = document.createElement('div');
  infoContainer.className = 'product-info';
  
  const name = document.createElement('h3');
  name.className = 'product-name';
  name.textContent = product.nombre || 'Producto sin nombre';
  
  const price = document.createElement('p');
  price.className = 'product-price';
  price.textContent = product.precio ? `$${product.precio.toLocaleString()}` : 'Consultar precio';
  
  const stock = document.createElement('p');
  stock.className = 'product-stock';
  stock.textContent = product.cantidad ? `${product.cantidad} disponibles` : 'Sin stock';
  stock.classList.add(product.cantidad > 0 ? 'in-stock' : 'out-of-stock');
  
  infoContainer.append(name, price, stock);
  card.append(imgContainer, infoContainer);
  
  return card;
}

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// ===============================
// PAGINACIÓN
// ===============================
function renderPagination(totalProducts) {
  if (!elements.pagination) return;
  
  const totalPages = Math.ceil(totalProducts / CONFIG.PRODUCTS_PER_PAGE);
  elements.pagination.innerHTML = '';
  
  if (totalPages <= 1) return;
  
  for (let i = 1; i <= totalPages; i++) {
    const button = document.createElement('button');
    button.textContent = i;
    button.className = i === currentPage ? 'active' : '';
    button.addEventListener('click', () => {
      currentPage = i;
      updateDisplayedProducts();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    elements.pagination.appendChild(button);
  }
}

function updateDisplayedProducts() {
  const startIdx = (currentPage - 1) * CONFIG.PRODUCTS_PER_PAGE;
  const endIdx = startIdx + CONFIG.PRODUCTS_PER_PAGE;
  const productsToDisplay = allProducts.slice(startIdx, endIdx);
  renderProducts(productsToDisplay);
}

// ===============================
// FILTRADO Y BÚSQUEDA
// ===============================
function setupSearch() {
  if (elements.searchInput) {
    elements.searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      filterProducts(searchTerm);
    });
  }
}

function filterProducts(searchTerm = '') {
  const filtered = allProducts.filter(product => {
    return (
      product.nombre.toLowerCase().includes(searchTerm) ||
      (product.descripcion && product.descripcion.toLowerCase().includes(searchTerm))
    );
  });
  
  currentPage = 1;
  renderProducts(filtered.slice(0, CONFIG.PRODUCTS_PER_PAGE));
  renderPagination(filtered.length);
}

// ===============================
// INTERACCIONES
// ===============================
function setupProductCardInteractions() {
  document.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => {
      const productId = card.dataset.id;
      const product = allProducts.find(p => p.id === productId);
      if (product) {
        showProductDetail(product);
      }
    });
  });
}

function showProductDetail(product) {
  // Implementar modal de detalle de producto
  console.log('Mostrar detalle:', product);
}

// ===============================
// INICIALIZACIÓN
// ===============================
async function loadProducts() {
  try {
    showLoadingState();
    allProducts = await fetchProducts();
    
    if (allProducts.length === 0) {
      showErrorState(new Error('No hay productos disponibles'));
      return;
    }
    
    updateDisplayedProducts();
    renderPagination(allProducts.length);
    setupSearch();
    
  } catch (error) {
    showErrorState(error);
  } finally {
    if (elements.loader) elements.loader.hidden = true;
  }
}

// Iniciar cuando el DOM esté listo
if (document.readyState !== 'loading') {
  loadProducts();
} else {
  document.addEventListener('DOMContentLoaded', loadProducts);
}
