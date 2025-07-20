// ===============================
// CONFIGURACIÓN INICIAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJwvzHZQN3CQarSDqjk_nShegf8F4ydARvkSK55VabxbCi9m8RuGf2Nyy9ScriFRfGdhZd0P54VS5z/pub?output=csv';

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
let lazyObserver = null;

// ===============================
// REFERENCIAS AL DOM
// ===============================
const getElement = (id) => document.getElementById(id);
const elementos = {
  galeriaProductos: getElement('galeria-productos'),
  paginacion: getElement('paginacion'),
  productoModal: getElement('producto-modal'),
  modalContenido: getElement('modal-contenido'),
  listaCarrito: getElement('lista-carrito'),
  totalCarrito: getElement('total'),
  contadorCarrito: getElement('contador-carrito'),
  inputBusqueda: getElement('input-busqueda'),
  selectCategoria: getElement('filtro-categoria'),
  precioMinInput: getElement('precio-min'),
  precioMaxInput: getElement('precio-max'),
  tamañoMinInput: getElement('tamaño-min'),
  tamañoMaxInput: getElement('tamaño-max'),
  botonResetearFiltros: getElement('boton-resetear-filtros'),
  carritoBtnMain: getElement('carrito-btn-main'),
  carritoPanel: getElement('carrito-panel'),
  carritoOverlay: document.querySelector('.carrito-overlay'),
  btnVaciarCarrito: document.querySelector('.boton-vaciar-carrito'),
  btnFinalizarCompra: document.querySelector('.boton-finalizar-compra'),
  btnCerrarCarrito: document.querySelector('.cerrar-carrito'),
  hamburguesaBtn: document.querySelector('.hamburguesa'),
  menu: getElement('menu'),
  faqToggles: document.querySelectorAll('.faq-toggle'),
  formContacto: getElement('form-contacto'),
  successMessage: getElement('success-message'),
  btnFlotante: document.querySelector('.boton-flotante'),
  avisoPreCompraModal: getElement('aviso-pre-compra-modal'),
  btnEntendidoAviso: getElement('btn-entendido-aviso'),
  btnCancelarAviso: getElement('btn-cancelar-aviso')
};

// ===============================
// NOTIFICACIONES
// ===============================
function mostrarNotificacion(mensaje, tipo = 'exito') {
  const notificacion = document.createElement('div');
  notificacion.className = `notificacion ${tipo}`;
  notificacion.textContent = mensaje;
  document.body.appendChild(notificacion);
  requestAnimationFrame(() => notificacion.classList.add('show'));
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
    mostrarNotificacion('Error al guardar el carrito', 'error');
  }
}
function cargarCarrito() {
  try {
    const data = localStorage.getItem(LS_CARRITO_KEY);
    carrito = data ? JSON.parse(data) : [];
    actualizarContadorCarrito();
  } catch {
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
// CATEGORÍAS
// ===============================
function actualizarCategorias() {
  if (!elementos.selectCategoria) return;
  const categorias = ['todos', ...new Set(productos.map(p => p.categoria))];
  elementos.selectCategoria.innerHTML = categorias
    .map(cat => `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`)
    .join('');
}

// ===============================
// CARGA DE PRODUCTOS DESDE SHEETS
// ===============================
async function cargarProductosDesdeSheets() {
  try {
    if (elementos.galeriaProductos) {
      elementos.galeriaProductos.innerHTML = '<p>Cargando productos...</p>';
    }
    const resp = await fetch(SHEET_CSV_URL, { headers: { 'Cache-Control': 'no-store' } });
    if (!resp.ok) throw new Error('Error al cargar productos.');
    const csvText = await resp.text();
    if (typeof Papa === 'undefined') throw new Error('Papa Parse no disponible');
    const { data, errors } = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: h => h
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, ' ')
        .toLowerCase()
        .replace(/\s+/g, ' ')
    });
    if (errors.length) throw new Error('Error al procesar los datos del CSV');
    if (!data || data.length === 0) throw new Error('No se encontraron productos en el CSV');
    productos = data
      .filter(r => r.id && r.nombre && r.precio)
      .map(r => ({
        id: parseInt(r.id, 10),
        nombre: r.nombre ? r.nombre.trim() : 'Sin Nombre',
        descripcion: r.descripcion ? r.descripcion.trim() : '',
        precio: parseFloat(r.precio) || 0,
        stock: parseInt(r.cantidad, 10) || 0,
        // Si no hay imágenes, es array vacío
        imagenes: (r.foto && r.foto.trim() !== "") ? r.foto.split(',').map(x => x.trim()).filter(x => !!x) : [],
        adicionales: r.adicionales ? r.adicionales.trim() : '',
        alto: parseFloat(r.alto) || null,
        ancho: parseFloat(r.ancho) || null,
        profundidad: parseFloat(r.profundidad) || null,
        categoria: r.categoria ? r.categoria.trim().toLowerCase() : 'otros',
        tamaño: parseFloat(r.tamaño) || null,
        vendido: r.vendido ? r.vendido.trim().toLowerCase() === 'true' : false,
        estado: r.estado ? r.estado.trim() : ''
      }));
    actualizarCategorias();
    actualizarUI();
  } catch (e) {
    if (elementos.galeriaProductos) {
      elementos.galeriaProductos.innerHTML = '<p>No se pudieron cargar los productos. Intente recargar la página.</p>';
    }
    mostrarNotificacion('Error al cargar productos: ' + e.message, 'error');
  }
}

// ===============================
// FILTRADO DE PRODUCTOS
// ===============================
function filtrarProductos(lista) {
  return lista.filter(p => {
    const { precioMin, precioMax, tamañoMin, tamañoMax, categoria, busqueda } = filtrosActuales;
    const busquedaLower = busqueda.toLowerCase();
    return (
      (precioMin === null || p.precio >= precioMin) &&
      (precioMax === null || p.precio <= precioMax) &&
      (tamañoMin === null || (p.tamaño !== null && p.tamaño >= tamañoMin)) &&
      (tamañoMax === null || (p.tamaño !== null && p.tamaño <= tamañoMax)) &&
      (categoria === 'todos' || p.categoria === categoria) &&
      (!busqueda ||
        p.nombre.toLowerCase().includes(busquedaLower) ||
        p.descripcion.toLowerCase().includes(busquedaLower))
    );
  });
}

// ===============================
// RENDERIZADO PRODUCTOS (SIN PLACEHOLDER)
// ===============================
function crearCardProducto(p) {
  const enCarrito = carrito.find(i => i.id === p.id);
  const disp = p.stock - (enCarrito?.cantidad || 0);
  const agot = disp <= 0;
  // Si no hay imágenes no renderizamos ninguna img ni espacio
  const imgHtml = p.imagenes[0] ? `<img src="${p.imagenes[0]}" alt="${p.nombre}" class="producto-img" loading="lazy">` : '';

  return `
    <div class="producto-card" data-id="${p.id}">
      ${imgHtml}
      <h3 class="producto-nombre">${p.nombre}</h3>
      <p class="producto-precio">$U ${p.precio.toLocaleString('es-UY')}</p>
      <p class="producto-stock">
        ${agot ? '<span class="texto-agotado">Agotado</span>' : `Stock: ${disp}`}
      </p>
      <div class="card-acciones">
        <input
          type="number"
          value="1"
          min="1"
          max="${disp}"
          class="cantidad-input"
          id="cantidad-${p.id}"
          ${agot ? 'disabled' : ''}
        >
        <button
          class="boton-agregar ${agot ? 'agotado' : ''}"
          data-id="${p.id}"
          ${agot ? 'disabled' : ''}
        >
          ${agot
            ? '<i class="fas fa-times-circle"></i> Agotado'
            : '<i class="fas fa-cart-plus"></i> Agregar'}
        </button>
      </div>
      <button class="boton-detalles" data-id="${p.id}">Ver Detalles</button>
    </div>
  `;
}

function renderizarPaginacion(total) {
  const pages = Math.ceil(total / PRODUCTOS_POR_PAGINA);
  const cont = elementos.paginacion;
  if (!cont) return;
  cont.innerHTML = '';
  if (pages <= 1) return;
  for (let i = 1; i <= pages; i++) {
    const b = document.createElement('button');
    b.textContent = i;
    b.className = i === paginaActual ? 'pagina-activa' : '';
    b.addEventListener('click', () => {
      paginaActual = i;
      renderizarProductos();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    cont.appendChild(b);
  }
}

function renderizarProductos() {
  if (!elementos.galeriaProductos) return;
  const list = filtrarProductos(productos);
  const inicio = (paginaActual - 1) * PRODUCTOS_POR_PAGINA;
  const slice = list.slice(inicio, inicio + PRODUCTOS_POR_PAGINA);
  if (slice.length === 0) {
    elementos.galeriaProductos.innerHTML = '<p>No se encontraron productos con los filtros aplicados.</p>';
  } else {
    elementos.galeriaProductos.innerHTML = slice.map(crearCardProducto).join('');
  }
  elementos.galeriaProductos.onclick = (e) => {
    const target = e.target.closest('.boton-agregar');
    if (target) {
      const id = +target.dataset.id;
      const cant = +document.getElementById(`cantidad-${id}`).value || 1;
      agregarAlCarrito(id, cant);
      return;
    }
    const detalleBtn = e.target.closest('.boton-detalles');
    if (detalleBtn) {
      const id = +detalleBtn.dataset.id;
      const prod = productos.find(p => p.id === id);
      if (prod) mostrarModalProducto(prod);
    }
  };
  renderizarPaginacion(list.length);
}

// ===============================
// MODAL MEJORADO (sin placeholder, sin thumbnails si no hay imagen)
// ===============================
function mostrarModalProducto(p) {
  if (!elementos.productoModal || !elementos.modalContenido) return;
  const enCarrito = carrito.find(i => i.id === p.id);
  const disp = p.stock - (enCarrito?.cantidad || 0);

  let carruselHtml = '';
  if (p.imagenes.length > 0) {
    carruselHtml += `<img src="${p.imagenes[0]}" class="modal-img" id="modal-img-principal" alt="${p.nombre}" loading="lazy">`;
    if (p.imagenes.length > 1) {
      carruselHtml += `<div class="modal-thumbnails">
        ${p.imagenes.map((img, i) => `
          <img src="${img}" class="modal-thumbnail${i === 0 ? ' active' : ''}" alt="Miniatura ${i + 1}" data-index="${i}">
        `).join('')}
      </div>`;
    }
  }

  elementos.modalContenido.innerHTML = `
    <button class="cerrar-modal" aria-label="Cerrar modal"></button>
    <div class="modal-flex">
      <div class="modal-carrusel">
        ${carruselHtml}
      </div>
      <div class="modal-info">
        <h2 class="modal-nombre">${p.nombre}</h2>
        <div class="modal-precio">$U ${p.precio.toLocaleString('es-UY')}</div>
        <div class="modal-stock ${disp > 0 ? 'disponible' : 'agotado'}">${disp > 0 ? `Disponible: ${disp}` : 'AGOTADO'}</div>
        <div class="modal-descripcion">${p.descripcion || ''}</div>
        ${p.adicionales ? `<div class="modal-detalles"><span>Material:</span> ${p.adicionales}</div>` : ''}
        ${p.alto && p.ancho ? `<div class="modal-detalles"><span>Medidas:</span> ${p.alto}x${p.ancho}${p.profundidad ? 'x' + p.profundidad : ''} cm</div>` : ''}
        ${p.estado ? `<div class="modal-detalles"><span>Estado:</span> ${p.estado}</div>` : ''}
        <div class="modal-acciones">
          <input type="number" value="1" min="1" max="${disp}" class="cantidad-modal-input" ${disp <= 0 ? 'disabled' : ''}>
          <button class="boton-agregar-modal${disp <= 0 ? ' agotado' : ''}" ${disp <= 0 ? 'disabled' : ''} data-id="${p.id}">
            ${disp <= 0 ? 'Agotado' : 'Agregar al carrito'}
          </button>
        </div>
      </div>
    </div>
  `;
  // Carrusel
  if (p.imagenes.length > 1) {
    const mainImg = elementos.modalContenido.querySelector('#modal-img-principal');
    const thumbnails = elementos.modalContenido.querySelectorAll('.modal-thumbnail');
    thumbnails.forEach((thumb, i) => {
      thumb.addEventListener('click', () => {
        thumbnails.forEach(t => t.classList.remove('active'));
        thumb.classList.add('active');
        mainImg.src = p.imagenes[i];
      });
    });
  }
  // Botón cerrar
  elementos.modalContenido.querySelector('.cerrar-modal').addEventListener('click', cerrarModal);
  // Botón agregar al carrito
  const agregarBtn = elementos.modalContenido.querySelector('.boton-agregar-modal');
  if (agregarBtn) {
    agregarBtn.addEventListener('click', () => {
      const cantidad = +elementos.modalContenido.querySelector('.cantidad-modal-input').value || 1;
      agregarAlCarrito(p.id, cantidad);
      cerrarModal();
    });
  }
  // Cierra modal al tocar fuera
  elementos.productoModal.style.display = 'flex';
  document.body.classList.add('no-scroll');
  elementos.productoModal.addEventListener('click', (e) => {
    if (e.target === elementos.productoModal) cerrarModal();
  });
  function cerrarModal() {
    elementos.productoModal.style.display = 'none';
    document.body.classList.remove('no-scroll');
  }
}

// ===============================
// CARRITO (sin placeholder)
// ===============================
function agregarAlCarrito(id, cantidad = 1) {
  const prod = productos.find(p => p.id === id);
  if (!prod) return mostrarNotificacion('Producto no encontrado', 'error');
  cantidad = parseInt(cantidad, 10);
  if (isNaN(cantidad) || cantidad < 1) return mostrarNotificacion('Cantidad inválida', 'error');
  const enCarrito = carrito.find(item => item.id === id);
  const disponibles = prod.stock - (enCarrito?.cantidad || 0);
  if (cantidad > disponibles) {
    mostrarNotificacion(`Solo hay ${disponibles} unidades disponibles`, 'error');
    return;
  }
  if (enCarrito) {
    enCarrito.cantidad += cantidad;
  } else {
    carrito.push({
      id,
      nombre: prod.nombre,
      precio: prod.precio,
      cantidad,
      // No placeholder, si no hay imagen queda vacío
      imagen: prod.imagenes[0] || ''
    });
  }
  guardarCarrito();
  actualizarUI();
  mostrarNotificacion(`"${prod.nombre}" x${cantidad} añadido al carrito`, 'exito');
}

function renderizarCarrito() {
  if (!elementos.listaCarrito || !elementos.totalCarrito) return;
  if (carrito.length === 0) {
    elementos.listaCarrito.innerHTML = '<p class="carrito-vacio">Tu carrito está vacío</p>';
    elementos.totalCarrito.textContent = 'Total: $U 0';
    return;
  }
  elementos.listaCarrito.innerHTML = carrito.map(i => `
    <li class="carrito-item">
      ${i.imagen ? `<img src="${i.imagen}" class="carrito-item-img" alt="${i.nombre}" loading="lazy">` : ''}
      <div class="carrito-item-info">
        <span class="carrito-item-nombre">${i.nombre}</span>
        <span class="carrito-item-subtotal">$U ${(i.precio * i.cantidad).toLocaleString('es-UY')}</span>
        <div class="carrito-item-controls">
          <button data-id="${i.id}" data-action="decrementar" aria-label="Reducir cantidad">-</button>
          <span class="carrito-item-cantidad">${i.cantidad}</span>
          <button data-id="${i.id}" data-action="incrementar" aria-label="Aumentar cantidad">+</button>
          <button data-id="${i.id}" class="eliminar-item" aria-label="Eliminar del carrito">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    </li>`).join('');
  const total = carrito.reduce((sum, i) => sum + i.precio * i.cantidad, 0);
  elementos.totalCarrito.textContent = `Total: $U ${total.toLocaleString('es-UY')}`;
  elementos.listaCarrito.onclick = (e) => {
    const target = e.target.closest('[data-id]');
    if (!target) return;
    const id = +target.dataset.id;
    const action = target.dataset.action;
    const item = carrito.find(i => i.id === id);
    const prod = productos.find(p => p.id === id);
    if (!item || !prod) return;
    if (action === 'incrementar') {
      const disp = prod.stock - item.cantidad;
      if (disp > 0) {
        item.cantidad++;
        guardarCarrito();
        actualizarUI();
      } else {
        mostrarNotificacion('No hay más stock disponible', 'error');
      }
    } else if (action === 'decrementar') {
      item.cantidad--;
      if (item.cantidad <= 0) {
        carrito = carrito.filter(i => i.id !== id);
      }
      guardarCarrito();
      actualizarUI();
    } else if (target.classList.contains('eliminar-item')) {
      carrito = carrito.filter(i => i.id !== id);
      guardarCarrito();
      actualizarUI();
      mostrarNotificacion('Producto eliminado del carrito', 'info');
    }
  };
}




// ===============================
// ACTUALIZACIÓN DE UI
// ===============================
function actualizarUI() {
  renderizarProductos();
  renderizarCarrito();
  actualizarContadorCarrito();
}

// ===============================
// MANEJO DE FILTROS
// ===============================
function aplicarFiltros() {
  paginaActual = 1; // Reiniciar a la primera página al aplicar filtros
  const currentScrollPosition = window.scrollY; // Guardar posición actual
  actualizarUI();
  window.scrollTo({ top: currentScrollPosition, behavior: 'auto' }); // Restaurar posición
}

// ===============================
// TOGGLE CARRITO
// ===============================
function toggleCarrito() {
  if (!elementos.carritoPanel || !elementos.carritoOverlay) return;
  
  const isOpen = elementos.carritoPanel.classList.toggle('open');
  elementos.carritoOverlay.classList.toggle('active', isOpen);
  document.body.classList.toggle('no-scroll', isOpen);
  
  if (isOpen) {
    setTimeout(() => {
      elementos.carritoPanel.focus();
    }, 100);
  }
}

// ===============================
// INICIALIZACIÓN DE EVENTOS
// ===============================
function inicializarEventos() {
  elementos.carritoBtnMain?.addEventListener('click', toggleCarrito);
  elementos.carritoOverlay?.addEventListener('click', toggleCarrito);
  elementos.btnCerrarCarrito?.addEventListener('click', toggleCarrito);
  
  elementos.btnVaciarCarrito?.addEventListener('click', () => {
    carrito = [];
    guardarCarrito();
    actualizarUI();
    toggleCarrito();
    mostrarNotificacion('Carrito vaciado', 'info');
  });
  
  elementos.btnFinalizarCompra?.addEventListener('click', () => {
    if (carrito.length === 0) {
      mostrarNotificacion('El carrito está vacío', 'error');
      return;
    }
    elementos.avisoPreCompraModal.style.display = 'flex';
  });
  
  elementos.btnEntendidoAviso?.addEventListener('click', () => {
    mostrarNotificacion('Compra finalizada con éxito', 'exito');
    carrito = [];
    guardarCarrito();
    actualizarUI();
    toggleCarrito();
    elementos.avisoPreCompraModal.style.display = 'none';
  });
  
  elementos.btnCancelarAviso?.addEventListener('click', () => {
    elementos.avisoPreCompraModal.style.display = 'none';
  });
  
  elementos.inputBusqueda?.addEventListener('input', (e) => {
    filtrosActuales.busqueda = e.target.value.toLowerCase();
    aplicarFiltros();
  });
  
  elementos.selectCategoria?.addEventListener('change', (e) => {
    filtrosActuales.categoria = e.target.value;
    aplicarFiltros();
  });
  
  document.querySelectorAll('.aplicar-rango-btn').forEach(b => {
    b.addEventListener('click', () => {
      const t = b.dataset.rangeType;
      if (t === 'precio') {
        filtrosActuales.precioMin = elementos.precioMinInput?.value ? +elementos.precioMinInput.value : null;
        filtrosActuales.precioMax = elementos.precioMaxInput?.value ? +elementos.precioMaxInput.value : null;
      } else if (t === 'tamaño') {
        filtrosActuales.tamañoMin = elementos.tamañoMinInput?.value ? +elementos.tamañoMinInput.value : null;
        filtrosActuales.tamañoMax = elementos.tamañoMaxInput?.value ? +elementos.tamañoMaxInput.value : null;
      }
      aplicarFiltros();
    });
  });
  
  elementos.botonResetearFiltros?.addEventListener('click', () => {
    filtrosActuales = {
      precioMin: null,
      precioMax: null,
      tamañoMin: null,
      tamañoMax: null,
      categoria: 'todos',
      busqueda: ''
    };
    
    if (elementos.inputBusqueda) elementos.inputBusqueda.value = '';
    if (elementos.selectCategoria) elementos.selectCategoria.value = 'todos';
    if (elementos.precioMinInput) elementos.precioMinInput.value = '';
    if (elementos.precioMaxInput) elementos.precioMaxInput.value = '';
    if (elementos.tamañoMinInput) elementos.tamañoMinInput.value = '';
    if (elementos.tamañoMaxInput) elementos.tamañoMaxInput.value = '';
    
    aplicarFiltros();
  });
  
  elementos.hamburguesaBtn?.addEventListener('click', () => {
    elementos.menu?.classList.toggle('open');
  });
  
  elementos.btnFlotante?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cerrarModal();
    }
  });
  
  elementos.faqToggles?.forEach(toggle => {
    toggle.addEventListener('click', () => {
      toggle.parentElement?.classList.toggle('active');
    });
  });
  
  elementos.formContacto?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(elementos.formContacto);
    const data = Object.fromEntries(formData.entries());
    
    try {
      const response = await fetch('/api/contacto', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        throw new Error('Error al enviar el mensaje');
      }
      
      elementos.formContacto.reset();
      elementos.successMessage.style.display = 'block';
      
      setTimeout(() => {
        elementos.successMessage.style.display = 'none';
      }, 5000);
    } catch (error) {
      console.error('Error:', error);
      mostrarNotificacion('Error al enviar el mensaje. Por favor, intente nuevamente.', 'error');
    }
  });
}

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
// EmailJS init seguro
  if (window.emailjs) {
    emailjs.init("o4IxJz0Zz-LQ8jYKG"); 
    const formContacto = document.getElementById('form-contacto');
    if (formContacto) {
      formContacto.addEventListener('submit', function(event) {
        event.preventDefault();
        const btnEnviar = document.getElementById('btn-enviar');
        const successMessage = document.getElementById('success-message');
        btnEnviar.disabled = true;
        btnEnviar.textContent = 'Enviando...';
        emailjs.sendForm('service_89by24g', 'template_8mn7hdp', this) 
          .then(function() {
            btnEnviar.disabled = false;
            btnEnviar.textContent = 'Enviar mensaje';
            formContacto.reset();
            if (successMessage) {
              successMessage.classList.remove('hidden');
              setTimeout(() => successMessage.classList.add('hidden'), 5000);
            }
            mostrarNotificacion("¡Mensaje enviado con éxito!", "exito");
          }, function() {
            btnEnviar.disabled = false;
            btnEnviar.textContent = 'Enviar mensaje';
            mostrarNotificacion("Error al enviar mensaje. Intenta de nuevo.", "error");
          });
      });
    }
	
  }
  
