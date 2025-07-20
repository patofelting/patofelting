const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJwvzHZQN3CQarSDqjk_nShegf8F4ydARvkSK55VabxbCi9m8RuGf2Nyy9ScriFRfGdhZd0P54VS5z/pub?output=csv';
const PLACEHOLDER_IMAGE = 'img/placeholder.png';

function mostrarError(mensaje) {
  const contenedor = document.getElementById('galeria-productos');
  if (contenedor) contenedor.innerHTML = `<p class="error">${mensaje}</p>`;
}

function crearProductoHTML(p) {
  const agotado = p.stock <= 0;
  const imagen = p.imagenes.length > 0 ? p.imagenes[0] : PLACEHOLDER_IMAGE;
  return `
    <div class="producto-card">
      <div class="producto-img-container">
        <img src="${imagen}" alt="${p.nombre}" onerror="this.src='${PLACEHOLDER_IMAGE}'" class="producto-img" loading="lazy">
      </div>
      <div class="producto-info">
        <h3 class="producto-nombre">${p.nombre}</h3>
        <p class="producto-precio">$U ${p.precio.toLocaleString('es-UY')}</p>
        <p class="producto-stock">${agotado ? '<span class="texto-agotado">Agotado</span>' : `Stock: ${p.stock}`}</p>
      </div>
    </div>`;
}

function mostrarProductos(productos) {
  const contenedor = document.getElementById('galeria-productos');
  if (!contenedor) return;
  if (!productos || productos.length === 0) {
    contenedor.innerHTML = '<p>No hay productos para mostrar.</p>';
    return;
  }
  contenedor.innerHTML = productos.map(crearProductoHTML).join('');
}

async function loadProductsFromSheets() {
  const contenedor = document.getElementById('galeria-productos');
  if (contenedor) contenedor.innerHTML = '<p>Cargando productos...</p>';

  try {

    const r = await fetch(SHEET_CSV_URL, { cache: 'no-cache' });
    if (!r.ok) throw new Error('No se pudo obtener el CSV');
    const csv = await r.text();

    const r = await fetch(SHEET_CSV_URL);
    if (!r.ok) throw new Error('No se pudo obtener el CSV');
    const csv = await r.text();


    if (typeof Papa === 'undefined') throw new Error('PapaParse no disponible');

    const { data, errors } = Papa.parse(csv, {
      header: true,
      skipEmptyLines: true
    });



    if (errors.length) {
      console.error('Errores al parsear CSV', errors);
      throw new Error('Error al procesar los datos');
    }

    const productos = data.map(row => ({
      id: parseInt(row.id, 10) || 0,
      nombre: row.nombre ? row.nombre.trim() : 'Sin nombre',
      descripcion: row.descripcion ? row.descripcion.trim() : '',
      precio: parseFloat(row.precio) || 0,
      stock: parseInt(row.cantidad, 10) || 0,
      imagenes: row.foto ? row.foto.split(',').map(u => u.trim()).filter(Boolean) : []
    }));

    mostrarProductos(productos);
  } catch (err) {
    console.error(err);
    mostrarError('No se pudieron cargar los productos.');
  }
}

document.addEventListener('DOMContentLoaded', loadProductsFromSheets);
