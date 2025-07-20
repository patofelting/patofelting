(function () {
  const CSV_URL = window.SHEET_CSV_URL;
  const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE;

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
    const loader = document.getElementById('product-loader');
    if (loader) loader.hidden = false;
    if (contenedor) contenedor.innerHTML = '';

    try {
      const resp = await fetch(CSV_URL, { cache: 'no-cache' });
      if (!resp.ok) throw new Error('No se pudo obtener el CSV');
      const csv = await resp.text();

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
    } finally {
      if (loader) loader.hidden = true;
    }
  }

  document.addEventListener('DOMContentLoaded', loadProductsFromSheets);
})();
