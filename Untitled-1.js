// ===============================
// CONFIGURACIÓN INICIAL
// ===============================
const CONFIG = {
  PRODUCTOS_POR_PAGINA: 6,
  LS_CARRITO_KEY: 'carrito_patofelting',
  
  PLACEHOLDER_IMAGE: 'img/placeholder.png',
  CACHE_BUSTER: '?v=' + new Date().getTime()
};

// ===============================
// ESTADO GLOBAL
// ===============================
const state = {
  productos: [],
  carrito: [],
  paginaActual: 1,
  filtros: {
    precioMin: null,
    precioMax: null,
    categoria: 'todos',
    busqueda: ''
  }
};

// ===============================
// SELECTORES DEL DOM
// ===============================
const DOM = {
  galeria: document.getElementById('galeria-productos'),
  paginacion: document.getElementById('paginacion'),
  modal: document.getElementById('producto-modal'),
  modalContenido: document.getElementById('modal-contenido'),
  listaCarrito: document.getElementById('lista-carrito'),
  totalCarrito: document.getElementById('total'),
  contadorCarrito: document.getElementById('contador-carrito'),
  inputBusqueda: document.getElementById('input-busqueda'),
  selectCategoria: document.getElementById('filtro-categoria'),
  precioMin: document.getElementById('precio-min'),
  precioMax: document.getElementById('precio-max'),
  botonReset: document.getElementById('boton-resetear-filtros'),
  carritoPanel: document.getElementById('carrito-panel'),
  carritoOverlay: document.querySelector('.carrito-overlay'),
  botonVaciar: document.querySelector('.boton-vaciar-carrito')
};

// ===============================
// FUNCIONES UTILITARIAS
// ===============================
const Utils = {
  mostrarNotificacion: (mensaje, tipo = 'exito', duracion = 3000) => {
    const noti = document.createElement('div');
    noti.className = `notificacion ${tipo}`;
    noti.innerHTML = `
      <span class="notificacion-icono">${tipo === 'exito' ? '✓' : '⚠'}</span>
      <span class="notificacion-texto">${mensaje}</span>
    `;
    document.body.appendChild(noti);
    
    setTimeout(() => noti.classList.add('show'), 10);
    setTimeout(() => {
      noti.classList.remove('show');
      setTimeout(() => noti.remove(), 300);
    }, duracion);
  },

  formatearPrecio: (valor) => {
    return new Intl.NumberFormat('es-UY', {
      style: 'currency',
      currency: 'UYU'
    }).format(valor).replace('UYU', '$U');
  },

  parsearPrecio: (valor) => {
    if (typeof valor === 'number') return valor;
    return parseFloat(valor.replace(',', '.')) || 0;
  }
};

// ===============================
// MANEJO DE CARRITO
// ===============================
const Carrito = {
  cargar: () => {
    try {
      const carritoGuardado = localStorage.getItem(CONFIG.LS_CARRITO_KEY);
      state.carrito = carritoGuardado ? JSON.parse(carritoGuardado) : [];
      Carrito.actualizarContador();
    } catch (error) {
      console.error('Error al cargar carrito:', error);
      state.carrito = [];
    }
  },

  guardar: () => {
    localStorage.setItem(CONFIG.LS_CARRITO_KEY, JSON.stringify(state.carrito));
    Carrito.actualizarContador();
  },

  agregarItem: (id, cantidad = 1) => {
    const producto = state.productos.find(p => p.id === id);
    if (!producto) {
      Utils.mostrarNotificacion('Producto no encontrado', 'error');
      return false;
    }

    cantidad = parseInt(cantidad, 10);
    if (isNaN(cantidad) || cantidad < 1) {
      Utils.mostrarNotificacion('Cantidad inválida', 'error');
      return false;
    }

    const itemExistente = state.carrito.find(item => item.id === id);
    const stockDisponible = producto.stock - (itemExistente?.cantidad || 0);

    if (cantidad > stockDisponible) {
      Utils.mostrarNotificacion(`Solo quedan ${stockDisponible} unidades disponibles`, 'error');
      return false;
    }

    if (itemExistente) {
      itemExistente.cantidad += cantidad;
    } else {
      state.carrito.push({
        id,
        nombre: producto.nombre,
        precio: producto.precio,
        cantidad,
        imagen: producto.imagenes[0] || CONFIG.PLACEHOLDER_IMAGE
      });
    }

    Carrito.guardar();
    Utils.mostrarNotificacion(`"${producto.nombre}" añadido al carrito (x${cantidad})`, 'exito');
    return true;
  },

  actualizarContador: () => {
    const total = state.carrito.reduce((sum, item) => sum + item.cantidad, 0);
    if (DOM.contadorCarrito) {
      DOM.contadorCarrito.textContent = total;
      DOM.contadorCarrito.classList.toggle('visible', total > 0);
    }
  },

  renderizar: () => {
    if (!DOM.listaCarrito) return;

    if (state.carrito.length === 0) {
      DOM.listaCarrito.innerHTML = '<p class="carrito-vacio">Tu carrito está vacío</p>';
      DOM.totalCarrito.textContent = 'Total: $U 0';
      return;
    }

    DOM.listaCarrito.innerHTML = state.carrito.map(item => {
      const producto = state.productos.find(p => p.id === item.id) || {};
      const disponible = Math.max(0, producto.stock - item.cantidad);
      
      return `
        <li class="carrito-item" data-id="${item.id}">
          <img src="${item.imagen}" class="carrito-item-img" alt="${item.nombre}" loading="lazy">
          <div class="carrito-item-info">
            <h4 class="carrito-item-nombre">${item.nombre}</h4>
            <p class="carrito-item-precio">${Utils.formatearPrecio(item.precio)} c/u</p>
            <p class="carrito-item-subtotal">Subtotal: ${Utils.formatearPrecio(item.precio * item.cantidad)}</p>
            <div class="carrito-item-controls">
              <button data-action="decrementar" ${item.cantidad <= 1 ? 'disabled' : ''}>−</button>
              <span class="carrito-item-cantidad">${item.cantidad}</span>
              <button data-action="incrementar" ${disponible <= 0 ? 'disabled' : ''}>+</button>
              <button class="eliminar-item" data-action="eliminar">🗑</button>
            </div>
          </div>
        </li>
      `;
    }).join('');

    const total = state.carrito.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);
    DOM.totalCarrito.textContent = `Total: ${Utils.formatearPrecio(total)}`;
  },

  vaciar: () => {
    if (state.carrito.length === 0) {
      Utils.mostrarNotificacion('El carrito ya está vacío', 'info');
      return;
    }

    if (confirm('¿Estás seguro de que deseas vaciar el carrito?')) {
      state.carrito = [];
      Carrito.guardar();
      Carrito.renderizar();
      Utils.mostrarNotificacion('Carrito vaciado', 'info');
    }
  },

  togglePanel: () => {
    if (!DOM.carritoPanel || !DOM.carritoOverlay) return;
    
    const abierto = DOM.carritoPanel.classList.toggle('active');
    DOM.carritoOverlay.classList.toggle('active', abierto);
    document.body.classList.toggle('no-scroll', abierto);
    
    if (abierto) Carrito.renderizar();
  }
};

// ===============================
// MANEJO DE PRODUCTOS
// ===============================
const Productos = {
  cargar: async () => {
    try {
      const loader = document.getElementById('product-loader');
      if (loader) loader.hidden = false;
      
      const response = await fetch(`${CONFIG.CSV_URL}${CONFIG.CACHE_BUSTER}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const csvData = await response.text();
      const { data } = Papa.parse(csvData, {
        header: true,
        skipEmptyLines: true,
        transform: (value, header) => {
          if (header === 'precio') return Utils.parsearPrecio(value);
          if (header === 'cantidad' || header === 'stock') return parseInt(value) || 0;
          if (header === 'imagenes') return value.split(',').map(img => img.trim()).filter(Boolean);
          return value.trim();
        }
      });

      state.productos = data.map(item => ({
        id: parseInt(item.id) || 0,
        nombre: item.nombre || 'Sin nombre',
        descripcion: item.descripcion || '',
        precio: Utils.parsearPrecio(item.precio),
        stock: parseInt(item.cantidad) || 0,
        imagenes: item.imagenes ? item.imagenes.split(',').map(img => img.trim()).filter(Boolean) : [CONFIG.PLACEHOLDER_IMAGE],
        categoria: (item.categoria || 'otros').toLowerCase().trim(),
        medidas: {
          alto: parseFloat(item.alto) || 0,
          ancho: parseFloat(item.ancho) || 0,
          profundidad: parseFloat(item.profundidad) || 0
        }
      })).filter(p => p.id && p.nombre);

      Productos.actualizarFiltros();
      Productos.renderizar();
    } catch (error) {
      console.error('Error al cargar productos:', error);
      Utils.mostrarNotificacion('Error al cargar productos. Intente recargar la página.', 'error');
      if (DOM.galeria) DOM.galeria.innerHTML = '<p class="error-carga">No se pudieron cargar los productos.</p>';
    } finally {
      const loader = document.getElementById('product-loader');
      if (loader) loader.hidden = true;
    }
  },

  actualizarFiltros: () => {
    const categorias = ['todos', ...new Set(state.productos.map(p => p.categoria))];
    if (DOM.selectCategoria) {
      DOM.selectCategoria.innerHTML = categorias.map(cat => 
        `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`
      ).join('');
    }
  },

  filtrar: () => {
    return state.productos.filter(p => {
      const cumplePrecio = (!state.filtros.precioMin || p.precio >= state.filtros.precioMin) &&
                          (!state.filtros.precioMax || p.precio <= state.filtros.precioMax);
      const cumpleCategoria = state.filtros.categoria === 'todos' || p.categoria === state.filtros.categoria;
      const cumpleBusqueda = !state.filtros.busqueda || 
                            p.nombre.toLowerCase().includes(state.filtros.busqueda) || 
                            p.descripcion.toLowerCase().includes(state.filtros.busqueda);
      
      return cumplePrecio && cumpleCategoria && cumpleBusqueda;
    });
  },

  renderizar: () => {
    if (!DOM.galeria) return;
    
    const productosFiltrados = Productos.filtrar();
    const inicio = (state.paginaActual - 1) * CONFIG.PRODUCTOS_POR_PAGINA;
    const productosPagina = productosFiltrados.slice(inicio, inicio + CONFIG.PRODUCTOS_POR_PAGINA);

    if (productosPagina.length === 0) {
      DOM.galeria.innerHTML = `
        <div class="sin-resultados">
          <p>No se encontraron productos con los filtros aplicados.</p>
          <button class="boton-primario" id="resetear-filtros-btn">Mostrar todos</button>
        </div>
      `;
      document.getElementById('resetear-filtros-btn')?.addEventListener('click', Filtros.resetear);
    } else {
      DOM.galeria.innerHTML = productosPagina.map(producto => `
        <div class="producto-card" data-id="${producto.id}">
          <img src="${producto.imagenes[0]}" alt="${producto.nombre}" class="producto-img" loading="lazy">
          <div class="producto-info">
            <h3 class="producto-nombre">${producto.nombre}</h3>
            <p class="producto-precio">${Utils.formatearPrecio(producto.precio)}</p>
            <p class="producto-stock ${producto.stock <= 0 ? 'agotado' : ''}">
              ${producto.stock <= 0 ? 'Agotado' : `Disponible: ${producto.stock}`}
            </p>
          </div>
          <div class="producto-acciones">
            <button class="boton-detalles" data-id="${producto.id}">Ver detalles</button>
          </div>
        </div>
      `).join('');
    }

    Productos.renderizarPaginacion(productosFiltrados.length);
  },

  renderizarPaginacion: (totalProductos) => {
    if (!DOM.paginacion) return;
    
    const totalPaginas = Math.ceil(totalProductos / CONFIG.PRODUCTOS_POR_PAGINA);
    DOM.paginacion.innerHTML = '';

    if (totalPaginas <= 1) return;

    for (let i = 1; i <= totalPaginas; i++) {
      const boton = document.createElement('button');
      boton.textContent = i;
      boton.className = i === state.paginaActual ? 'active' : '';
      boton.addEventListener('click', () => {
        state.paginaActual = i;
        Productos.renderizar();
      });
      DOM.paginacion.appendChild(boton);
    }
  }
};

// ===============================
// MANEJO DE MODALES
// ===============================
const Modal = {
  producto: {
    mostrar: (producto) => {
      if (!DOM.modal || !DOM.modalContenido) return;

      DOM.modalContenido.innerHTML = `
        <button class="cerrar-modal" aria-label="Cerrar modal">&times;</button>
        <div class="modal-flex">
          <div class="modal-carrusel">
            <img src="${producto.imagenes[0]}" class="modal-img" alt="${producto.nombre}">
            ${producto.imagenes.length > 1 ? `
              <div class="modal-controls">
                <button class="modal-prev" aria-label="Anterior">‹</button>
                <button class="modal-next" aria-label="Siguiente">›</button>
              </div>
              <div class="modal-thumbnails">
                ${producto.imagenes.map((img, i) => `
                  <img src="${img}" class="modal-thumbnail ${i === 0 ? 'active' : ''}" data-index="${i}">
                `).join('')}
              </div>
            ` : ''}
          </div>
          <div class="modal-info">
            <h2 class="modal-nombre">${producto.nombre}</h2>
            <p class="modal-precio">${Utils.formatearPrecio(producto.precio)}</p>
            <p class="modal-stock ${producto.stock <= 0 ? 'agotado' : 'disponible'}">
              ${producto.stock <= 0 ? 'Agotado' : `Disponible: ${producto.stock}`}
            </p>
            <div class="modal-descripcion">
              <p>${producto.descripcion || 'Sin descripción disponible.'}</p>
              ${producto.medidas.alto || producto.medidas.ancho || producto.medidas.profundidad ? `
                <p class="modal-medidas">
                  <strong>Medidas:</strong> 
                  ${producto.medidas.alto ? `${producto.medidas.alto} cm alto` : ''}
                  ${producto.medidas.ancho ? ` × ${producto.medidas.ancho} cm ancho` : ''}
                  ${producto.medidas.profundidad ? ` × ${producto.medidas.profundidad} cm profundo` : ''}
                </p>
              ` : ''}
            </div>
            <div class="modal-acciones">
              <input type="number" class="cantidad-modal-input" value="1" min="1" max="${producto.stock}" ${producto.stock <= 0 ? 'disabled' : ''}>
              <button class="boton-agregar-modal ${producto.stock <= 0 ? 'disabled' : ''}" ${producto.stock <= 0 ? 'disabled' : ''}>
                ${producto.stock <= 0 ? 'Agotado' : 'Agregar al carrito'}
              </button>
            </div>
          </div>
        </div>
      `;

      // Configurar eventos del modal
      DOM.modalContenido.querySelector('.cerrar-modal').addEventListener('click', Modal.producto.cerrar);
      DOM.modal.addEventListener('click', (e) => {
        if (e.target === DOM.modal) Modal.producto.cerrar();
      });

      // Configurar carrusel si hay múltiples imágenes
      if (producto.imagenes.length > 1) {
        let currentIndex = 0;
        const $mainImg = DOM.modalContenido.querySelector('.modal-img');
        const $thumbnails = DOM.modalContenido.querySelectorAll('.modal-thumbnail');
        
        function updateImage(index) {
          currentIndex = index;
          $mainImg.src = producto.imagenes[index];
          $thumbnails.forEach(t => t.classList.remove('active'));
          $thumbnails[index].classList.add('active');
        }

        DOM.modalContenido.querySelector('.modal-prev').addEventListener('click', () => {
          const newIndex = (currentIndex - 1 + producto.imagenes.length) % producto.imagenes.length;
          updateImage(newIndex);
        });

        DOM.modalContenido.querySelector('.modal-next').addEventListener('click', () => {
          const newIndex = (currentIndex + 1) % producto.imagenes.length;
          updateImage(newIndex);
        });

        $thumbnails.forEach((thumb, i) => {
          thumb.addEventListener('click', () => updateImage(i));
        });
      }

      // Configurar botón agregar al carrito
      DOM.modalContenido.querySelector('.boton-agregar-modal').addEventListener('click', () => {
        const cantidad = parseInt(DOM.modalContenido.querySelector('.cantidad-modal-input').value) || 1;
        if (Carrito.agregarItem(producto.id, cantidad)) {
          Modal.producto.cerrar();
        }
      });

      // Mostrar modal
      DOM.modal.style.display = 'flex';
      setTimeout(() => DOM.modal.classList.add('visible'), 10);
      document.body.classList.add('no-scroll');
    },

    cerrar: () => {
      if (!DOM.modal) return;
      DOM.modal.classList.remove('visible');
      setTimeout(() => {
        DOM.modal.style.display = 'none';
        document.body.classList.remove('no-scroll');
      }, 300);
    }
  }
};

// ===============================
// MANEJO DE FILTROS
// ===============================
const Filtros = {
  aplicar: () => {
    state.paginaActual = 1;
    Productos.renderizar();
  },

  resetear: () => {
    state.filtros = {
      precioMin: null,
      precioMax: null,
      categoria: 'todos',
      busqueda: ''
    };
    
    if (DOM.inputBusqueda) DOM.inputBusqueda.value = '';
    if (DOM.selectCategoria) DOM.selectCategoria.value = 'todos';
    if (DOM.precioMin) DOM.precioMin.value = '';
    if (DOM.precioMax) DOM.precioMax.value = '';
    
    Filtros.aplicar();
  }
};

// ===============================
// MANEJO DE EVENTOS
// ===============================
const Eventos = {
  init: () => {
    // Eventos de productos
    DOM.galeria?.addEventListener('click', (e) => {
      const $card = e.target.closest('.producto-card');
      const $detallesBtn = e.target.closest('.boton-detalles');
      
      if ($card && $detallesBtn) {
        const productoId = parseInt($card.dataset.id);
        const producto = state.productos.find(p => p.id === productoId);
        if (producto) Modal.producto.mostrar(producto);
      }
    });

    // Eventos de carrito
    document.getElementById('carrito-btn-main')?.addEventListener('click', Carrito.togglePanel);
    DOM.carritoOverlay?.addEventListener('click', Carrito.togglePanel);
    document.querySelector('.cerrar-carrito')?.addEventListener('click', Carrito.togglePanel);
    DOM.botonVaciar?.addEventListener('click', Carrito.vaciar);

    // Eventos de filtros
    DOM.inputBusqueda?.addEventListener('input', (e) => {
      state.filtros.busqueda = e.target.value.toLowerCase();
      Filtros.aplicar();
    });

    DOM.selectCategoria?.addEventListener('change', (e) => {
      state.filtros.categoria = e.target.value;
      Filtros.aplicar();
    });

    DOM.precioMin?.addEventListener('change', (e) => {
      state.filtros.precioMin = e.target.value ? parseFloat(e.target.value) : null;
      Filtros.aplicar();
    });

    DOM.precioMax?.addEventListener('change', (e) => {
      state.filtros.precioMax = e.target.value ? parseFloat(e.target.value) : null;
      Filtros.aplicar();
    });

    DOM.botonReset?.addEventListener('click', Filtros.resetear);

    // Eventos de la lista del carrito (delegación)
    DOM.listaCarrito?.addEventListener('click', (e) => {
      const $btn = e.target.closest('button');
      if (!$btn) return;
      
      const $item = e.target.closest('.carrito-item');
      if (!$item) return;
      
      const itemId = parseInt($item.dataset.id);
      const item = state.carrito.find(i => i.id === itemId);
      if (!item) return;

      if ($btn.dataset.action === 'incrementar') {
        const producto = state.productos.find(p => p.id === itemId);
        if (producto && item.cantidad < producto.stock) {
          item.cantidad++;
          Carrito.guardar();
          Carrito.renderizar();
        } else {
          Utils.mostrarNotificacion('No hay más stock disponible', 'error');
        }
      } else if ($btn.dataset.action === 'decrementar') {
        item.cantidad--;
        if (item.cantidad <= 0) {
          state.carrito = state.carrito.filter(i => i.id !== itemId);
        }
        Carrito.guardar();
        Carrito.renderizar();
      } else if ($btn.classList.contains('eliminar-item')) {
        state.carrito = state.carrito.filter(i => i.id !== itemId);
        Carrito.guardar();
        Carrito.renderizar();
        Utils.mostrarNotificacion('Producto eliminado del carrito', 'info');
      }
    });
  }
};

// ===============================
// INICIALIZACIÓN DE LA APLICACIÓN
// ===============================
const App = {
  init: async () => {
    try {
      // Cargar dependencias necesarias
      if (typeof Papa === 'undefined') {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.3.0/papaparse.min.js';
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      // Inicializar componentes
      Carrito.cargar();
      await Productos.cargar();
      Eventos.init();
      
      // Configurar formulario de contacto
      setupContactForm();
    } catch (error) {
      console.error('Error inicializando la aplicación:', error);
      Utils.mostrarNotificacion('Error al iniciar la aplicación', 'error');
    }
  }
};

// ===============================
// FORMULARIO DE CONTACTO
// ===============================
function setupContactForm() {
  const formContacto = document.getElementById('formContacto');
  const successMessage = document.getElementById('successMessage');
  const errorMessage = document.getElementById('errorMessage');

  if (formContacto) {
    formContacto.addEventListener('submit', (e) => {
      e.preventDefault();
      const nombre = document.getElementById('nombre').value;
      const email = document.getElementById('email').value;
      const mensaje = document.getElementById('mensaje').value;

      emailjs.send('service_89by24g', 'template_8mn7hdp', {
        from_name: nombre,
        from_email: email,
        message: mensaje
      })
      .then(() => {
        successMessage.classList.remove('hidden');
        errorMessage.classList.add('hidden');
        formContacto.reset();
        setTimeout(() => successMessage.classList.add('hidden'), 3000);
      }, (error) => {
        console.error('Error al enviar el mensaje:', error);
        errorMessage.classList.remove('hidden');
        successMessage.classList.add('hidden');
        setTimeout(() => errorMessage.classList.add('hidden'), 3000);
      });
    });
  }
}

// Inicializar EmailJS
emailjs.init('o4IxJz0Zz-LQ8jYKG');

// Iniciar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', App.init);
