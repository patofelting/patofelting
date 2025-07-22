/**
 * Carga de productos desde Google Sheets usando PapaParse
 * y renderiza una galeria simple.
 */

const CSV_URL = window.SHEET_CSV_URL;
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE || 'img/placeholder.png';

async function fetchCSV(url) {
  const resp = await fetch(url, { cache: 'no-cache' });
  if (!resp.ok) throw new Error('No se pudo obtener el CSV');
  return resp.text();
}

function parseProducts(csvText) {
  if (typeof Papa === 'undefined') throw new Error('PapaParse no disponible');
  const { data, errors } = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  if (errors.length) throw new Error('Error al procesar los datos');
  return data.map(row => ({
    id: Number(row.id) || 0,
    nombre: row.nombre || 'Sin nombre',
    descripcion: row.descripcion || '',
    precio: Number(row.precio) || 0,
    stock: Number(row.cantidad) || 0,
    imagen: row.foto ? row.foto.split(',')[0].trim() : PLACEHOLDER_IMAGE
  }));
}

function renderProducts(lista) {
  const cont = document.getElementById('galeria-productos');
  if (!cont) return;
  if (!lista || lista.length === 0) {
    cont.innerHTML = '<p>No hay productos para mostrar.</p>';
    return;
  }
  cont.innerHTML = lista.map(p => `
    <div class="producto-card">
      <img src="${p.imagen}" alt="${p.nombre}" class="producto-img" onerror="this.src='${PLACEHOLDER_IMAGE}'">
      <h3 class="producto-nombre">${p.nombre}</h3>
      <p class="producto-precio">$U ${p.precio.toLocaleString('es-UY')}</p>
      <p class="producto-stock">${p.stock > 0 ? 'Stock: ' + p.stock : '<span class="texto-agotado">Agotado</span>'}</p>
      <button class="boton-agregar" ${p.stock <= 0 ? 'disabled' : ''}>Agregar al carrito</button>
    </div>
  `).join('');
}

async function cargarProductos() {
  try {
    const csv = await fetchCSV(CSV_URL);
    const productos = parseProducts(csv);
    renderProducts(productos);
  } catch (err) {
    console.error(err);
    const cont = document.getElementById('galeria-productos');
    if (cont) cont.innerHTML = '<p class="error">No se pudieron cargar los productos.</p>';
  }
}

document.addEventListener('DOMContentLoaded', cargarProductos);
