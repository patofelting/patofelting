// ===============================
// CONFIGURACIÓN INICIAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';

// URL pública de tu Google Sheets en formato CSV
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJwvzHZQN3CQarSDqjk_nShegf8F4ydARvkSK55VabxbCi9m8RuGf2Nyy9ScriFRfGdhZd0P54VS5z/pub?output=csv';

// Validar que SHEET_CSV_URL esté definida
if (!SHEET_CSV_URL) {
  console.error('SHEET_CSV_URL no está definida');
  mostrarNotificacion('Error de configuración. Contacte al soporte.', 'error');
}

// Validar que Papa Parse esté disponible
if (typeof Papa === 'undefined') {
  console.error('Papa Parse no está cargado. Asegúrate de incluir la librería.');
  mostrarNotificacion('Error: Librería Papa Parse no encontrada.', 'error');
}

// ===============================
// ESTADO GLOBAL
// ===============================
let productos = [];
let carrito = [];
let paginaActual = 1;
let filtrosActuales = {
  precioMin: null,
  precioMax: null,
  tamañoMin: null,
  tamañoMax: null,
  categoria: 'todos',
  busqueda: ''
};

// ===============================
// REFERENCIAS AL DOM
// ===============================
const getElement = (id) => {
  const element = document.getElementById(id);
  if (!element) console.warn(`Elemento no encontrado: ${id}`);
  return element;
};

const elementos = {
  // ... (rest of the DOM references remain the same)
};

// ===============================
// NOTIFICACIONES
// ===============================
function mostrarNotificacion(mensaje, tipo = 'exito') {
  const notificacion = document.createElement('div');
  notificacion.className = `notificacion ${tipo}`;
  notificacion.textContent = mensaje;
  document.body.appendChild(notificacion);
  
  requestAnimationFrame(() => {
    notificacion.classList.add('show');
  });
  
  setTimeout(() => {
    notificacion.classList.remove('show');
    setTimeout(() => notificacion.remove(), 300);
  }, 3000);
}

// ===============================
// LOCALSTORAGE: CARRITO
// ===============================
function guardarCarrito() {
  try {
    localStorage.setItem(LS_CARRITO_KEY, JSON.stringify(carrito));
    actualizarContadorCarrito();
  } catch (e) {
    console.error('Error al guardar en localStorage:', e);
    mostrarNotificacion('Error al guardar el carrito', 'error');
  }
}

function cargarCarrito() {
  try {
    const data = localStorage.getItem(LS_CARRITO_KEY);
    carrito = data ? JSON.parse(data) : [];
    actualizarContadorCarrito();
  } catch (e) {
    console.error('Error al cargar el carrito:', e);
    carrito = [];
  }
}

function actualizarContadorCarrito() {
  const total = carrito.reduce((sum, item) => sum + item.cantidad, 0);
  if (elementos.contadorCarrito) {
    elementos.contadorCarrito.textContent = total;
    elementos.contadorCarrito.classList.toggle('visible', total > 0);
  }
}

// ===============================
// CARGA DE PRODUCTOS DESDE SHEETS
// ===============================
async function cargarProductosDesdeSheets() {
  try {
    console.log('Iniciando carga de productos desde:', SHEET_CSV_URL);
    if (elementos.galeriaProductos) {
      elementos.galeriaProductos.innerHTML = '<p>Cargando productos...</p>';
    }
    
    const resp = await fetch(SHEET_CSV_URL, {
      headers: { 'Cache-Control': 'no-store' }
    });
    
    console.log('Respuesta HTTP:', resp.status, resp.statusText);
    if (!resp.ok) {
      throw new Error(`Error HTTP: ${resp.status} - ${resp.statusText}`);
    }
    
    const csvText = await resp.text();
    console.log('Contenido del CSV (primeros 500 caracteres):', csvText.substring(0, 500));
    
    if (typeof Papa === 'undefined') {
      throw new Error('Papa Parse no está disponible');
    }

    const { data, errors } = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, ' ')
        .toLowerCase()
        .replace(/\s+/g, '')
    });
    
    console.log('Datos parseados:', data);
    console.log('Errores de parseo:', errors);
    
    if (errors.length) {
      console.error('Errores al parsear CSV:', errors);
      throw new Error('Error al procesar los datos del CSV');
    }
    
    if (!data || data.length === 0) {
      throw new Error('No se encontraron productos en el CSV');
    }
    
    productos = data
      .filter(r => r.id && r.nombre && r.precio) 
      .map(r => {
        return {
          id: parseInt(r.id, 10),
          nombre: r.nombre ? r.nombre.trim() : 'Sin Nombre',
          descripcion: r.descripcion ? r.descripcion.trim() : '',
          precio: parseFloat(r.precio) || 0,
          stock: parseInt(r.cantidad, 10) || 0,
          imagenes: [r.foto || '/img/placeholder.jpg'],
          adicionales: r.adicionales ? r.adicionales.trim() : 'Material no especificado',
          alto: parseFloat(r.alto) || null,
          ancho: parseFloat(r.ancho) || null,
          profundidad: parseFloat(r.profundidad) || null,
          categoria: r.categoria ? r.categoria.trim().toLowerCase() : 'otros',
          tamaño: parseFloat(r.tamaño) || null,
          vendido: r.vendido ? r.vendido.trim().toLowerCase() === 'true' : false,
          estado: r.estado ? r.estado.trim() : ''
        };
      });
    
    console.log('Productos procesados:', productos);
    
    if (productos.length === 0) {
      throw new Error('No se encontraron productos válidos después del filtrado');
    }
    
    // Actualizar opciones de categoría en el filtro
    actualizarCategorias();
    actualizarUI();
  } catch (e) {
    console.error('Error detallado al cargar productos:', e);
    if (elementos.galeriaProductos) {
      elementos.galeriaProductos.innerHTML = '<p>No se pudieron cargar los productos. Intente recargar la página.</p>';
    }
    mostrarNotificacion(`Error al cargar productos: ${e.message}. Intente recargar la página.`, 'error');
  }
}

// ... (rest of the code remains the same, removing any references to Vercel Blob)

// ===============================
// INICIALIZACIÓN PRINCIPAL
// ===============================
function init() {
  if (typeof document === 'undefined') {
    console.warn('Este script debe ejecutarse en el navegador');
    return;
  }
  
  console.log('Inicializando la aplicación...');
  cargarCarrito();
  cargarProductosDesdeSheets();
  inicializarEventos();
  
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src || img.src;
          observer.unobserve(img);
        }
      });
    }, { rootMargin: '100px' });
    
    document.querySelectorAll('img[data-src]').forEach(img => {
      observer.observe(img);
    });
  }
}

if (document.readyState !== 'loading') {
  init();
} else {
  document.addEventListener('DOMContentLoaded', init);
}
