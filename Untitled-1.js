// ===============================
// CONFIGURACIÓN INICIAL MEJORADA
// ===============================
const CONFIG = {
  PRODUCTOS_POR_PAGINA: 6,
  LS_CARRITO_KEY: 'carrito',
  CSV_URL: window.SHEET_CSV_URL || 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ.../pub?output=csv',
  PLACEHOLDER_IMAGE: window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen',
  CACHE_BUSTER: '?v=' + new Date().getTime() // Evitar caché
};

// ===============================
// ESTADO GLOBAL OPTIMIZADO
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
// SELECTORES DE DOM OPTIMIZADOS
// ===============================
const DOM = {
  get: (selector) => document.querySelector(selector),
  getAll: (selector) => document.querySelectorAll(selector),
  elements: {
    galeria: '#galeria-productos',
    paginacion: '#paginacion',
    modal: '#producto-modal',
    // ... otros selectores
  }
};

// Cache de elementos
const $ = {
  galeria: DOM.get(DOM.elements.galeria),
  paginacion: DOM.get(DOM.elements.paginacion),
  // ... otros elementos
};

// ===============================
// FUNCIONES UTILITARIAS MEJORADAS
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

  parsearPrecio: (valor) => {
    if (typeof valor === 'number') return valor;
    return parseFloat(valor.replace(',', '.')) || 0;
  },

  formatearPrecio: (valor) => {
    return new Intl.NumberFormat('es-UY', {
      style: 'currency',
      currency: 'UYU'
    }).format(valor).replace('UYU', '$U');
  }
};

// ===============================
// MANEJO DE CARRITO MEJORADO
// ===============================
const Carrito = {
  cargar: () => {
    try {
      state.carrito = JSON.parse(localStorage.getItem(CONFIG.LS_CARRITO_KEY)) || [];
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
if (isNaN(cantidad)) {  // Se agregó el paréntesis de cierre
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
        imagen: producto.imagenes[0] || CONFIG.PLACEHOLDER_IMAGE,
        adicionales: producto.adicionales // Incluir datos adicionales
      });
    }

    Carrito.guardar();
    Utils.mostrarNotificacion(`"${producto.nombre}" añadido al carrito (x${cantidad})`, 'exito');
    return true;
  },

  actualizarContador: () => {
    const total = state.carrito.reduce((sum, item) => sum + item.cantidad, 0);
    const $contador = DOM.get('#contador-carrito');
    if ($contador) {
      $contador.textContent = total;
      $contador.classList.toggle('visible', total > 0);
    }
  },

  renderizar: () => {
    const $lista = DOM.get('#lista-carrito');
    if (!$lista) return;

    if (state.carrito.length === 0) {
      $lista.innerHTML = '<p class="carrito-vacio">Tu carrito está vacío</p>';
      DOM.get('#total').textContent = 'Total: $U 0';
      return;
    }

    $lista.innerHTML = state.carrito.map(item => {
      const producto = state.productos.find(p => p.id === item.id) || {};
      const disponible = Math.max(0, producto.stock - item.cantidad);
      
      return `
        <li class="carrito-item" data-id="${item.id}">
          <img src="${item.imagen}" class="carrito-item-img" alt="${item.nombre}" loading="lazy">
          <div class="carrito-item-info">
            <h4 class="carrito-item-nombre">${item.nombre}</h4>
            ${item.adicionales ? `<p class="carrito-item-adicionales">${item.adicionales}</p>` : ''}
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
    DOM.get('#total').textContent = `Total: ${Utils.formatearPrecio(total)}`;
  }
};

// ===============================
// MANEJO DE PRODUCTOS MEJORADO
// ===============================
const Productos = {
  cargar: async () => {
    try {
      DOM.get('#product-loader')?.classList.add('visible');
      
      const response = await fetch(`${CONFIG.CSV_URL}${CONFIG.CACHE_BUSTER}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const csvData = await response.text();
      const { data } = Papa.parse(csvData, {
        header: true,
        skipEmptyLines: true,
        transform: (value, header) => {
          // Limpieza y transformación de datos
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
        imagenes: item.foto ? item.foto.split(',').map(img => img.trim()).filter(Boolean) : [CONFIG.PLACEHOLDER_IMAGE],
        adicionales: item.adicionales || '',
        categoria: (item.categoria || item.categoría || 'otros').toLowerCase().trim(),
        medidas: {
          alto: parseFloat(item.alto) || 0,
          ancho: parseFloat(item.ancho) || 0,
          profundidad: parseFloat(item.profundidad) || 0
        },
        estado: item.estado || 'disponible',
        // Extraemos todos los campos adicionales
        ...Object.entries(item).reduce((acc, [key, value]) => {
          if (!['id', 'nombre', 'descripcion', 'precio', 'cantidad', 'foto', 'categoria', 'alto', 'ancho', 'profundidad', 'estado'].includes(key)) {
            acc[key] = value;
          }
          return acc;
        }, {})
      })).filter(p => p.id && p.nombre);

      Productos.actualizarFiltros();
      Productos.renderizar();
    } catch (error) {
      console.error('Error al cargar productos:', error);
      Utils.mostrarNotificacion('Error al cargar productos. Intente recargar la página.', 'error');
      $galeria.innerHTML = '<p class="error-carga">No se pudieron cargar los productos.</p>';
    } finally {
      DOM.get('#product-loader')?.classList.remove('visible');
    }
  },

  actualizarFiltros: () => {
    const categorias = ['todos', ...new Set(state.productos.map(p => p.categoria))];
    const $select = DOM.get('#filtro-categoria');
    if ($select) {
      $select.innerHTML = categorias.map(cat => 
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
                            p.descripcion.toLowerCase().includes(state.filtros.busqueda) ||
                            (p.adicionales && p.adicionales.toLowerCase().includes(state.filtros.busqueda));
      
      return cumplePrecio && cumpleCategoria && cumpleBusqueda;
    });
  },

  renderizar: () => {
    const productosFiltrados = Productos.filtrar();
    const inicio = (state.paginaActual - 1) * CONFIG.PRODUCTOS_POR_PAGINA;
    const productosPagina = productosFiltrados.slice(inicio, inicio + CONFIG.PRODUCTOS_POR_PAGINA);

    if (productosPagina.length === 0) {
      $galeria.innerHTML = `
        <div class="sin-resultados">
          <p>No se encontraron productos con los filtros aplicados.</p>
          <button onclick="Filtros.resetear()" class="boton-primario">Mostrar todos</button>
        </div>
      `;
    } else {
      $galeria.innerHTML = productosPagina.map(producto => `
        <div class="producto-card" data-id="${producto.id}">
          <img src="${producto.imagenes[0]}" alt="${producto.nombre}" class="producto-img" loading="lazy">
          <div class="producto-info">
            <h3 class="producto-nombre">${producto.nombre}</h3>
            ${producto.adicionales ? `<p class="producto-adicionales">${producto.adicionales}</p>` : ''}
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
    if (!$paginacion) return;
    
    const totalPaginas = Math.ceil(totalProductos / CONFIG.PRODUCTOS_POR_PAGINA);
    $paginacion.innerHTML = '';

    if (totalPaginas <= 1) return;

    for (let i = 1; i <= totalPaginas; i++) {
      const boton = document.createElement('button');
      boton.textContent = i;
      boton.className = i === state.paginaActual ? 'active' : '';
      boton.addEventListener('click', () => {
        state.paginaActual = i;
        Productos.renderizar();
      });
      $paginacion.appendChild(boton);
    }
  }
};

// ===============================
// MANEJO DE MODALES MEJORADO
// ===============================
const Modal = {
  producto: {
    mostrar: (producto) => {
      const $modal = DOM.get('#producto-modal');
      const $contenido = DOM.get('#modal-contenido');
      
      if (!$modal || !$contenido) return;

      // Configurar el contenido del modal
      $contenido.innerHTML = `
        <button class="cerrar-modal">&times;</button>
        <div class="modal-flex">
          <div class="modal-carrusel">
            <img src="${producto.imagenes[0]}" class="modal-img" alt="${producto.nombre}">
            ${producto.imagenes.length > 1 ? `
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
              ${producto.adicionales ? `<p class="modal-adicionales">${producto.adicionales}</p>` : ''}
              <p class="modal-medidas">
                <strong>Medidas:</strong> ${producto.medidas.alto} × ${producto.medidas.ancho} × ${producto.medidas.profundidad} cm
              </p>
              <!-- Mostrar todos los campos adicionales -->
              ${Object.entries(producto)
                .filter(([key]) => !['id', 'nombre', 'descripcion', 'precio', 'stock', 'imagenes', 'categoria', 'medidas', 'estado'].includes(key))
                .map(([key, value]) => value ? `
                  <p class="modal-adicional"><strong>${key}:</strong> ${value}</p>
                ` : '')
                .join('')}
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

      // Configurar eventos
      $modal.querySelector('.cerrar-modal').addEventListener('click', () => Modal.cerrar());
      $modal.addEventListener('click', (e) => {
        if (e.target === $modal) Modal.cerrar();
      });

      // Configurar carrusel de imágenes si hay más de una
      if (producto.imagenes.length > 1) {
        const $thumbnails = $contenido.querySelectorAll('.modal-thumbnail');
        const $mainImg = $contenido.querySelector('.modal-img');
        
        $thumbnails.forEach(thumb => {
          thumb.addEventListener('click', function() {
            const index = this.dataset.index;
            $mainImg.src = producto.imagenes[index];
            $thumbnails.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
          });
        });
      }

      // Configurar botón agregar al carrito
      $contenido.querySelector('.boton-agregar-modal').addEventListener('click', () => {
        const cantidad = parseInt($contenido.querySelector('.cantidad-modal-input').value) || 1;
        if (Carrito.agregarItem(producto.id, cantidad)) {
          Modal.cerrar();
        }
      });

      // Mostrar modal
      $modal.style.display = 'flex';
      setTimeout(() => $modal.classList.add('visible'), 10);
      document.body.classList.add('no-scroll');
    },

    cerrar: () => {
      const $modal = DOM.get('#producto-modal');
      $modal.classList.remove('visible');
      setTimeout(() => {
        $modal.style.display = 'none';
        document.body.classList.remove('no-scroll');
      }, 300);
    }
  }
};

// ===============================
// MANEJO DE EVENTOS MEJORADO
// ===============================
const Eventos = {
  init: () => {
    // Eventos de productos
    $galeria?.addEventListener('click', (e) => {
      const $card = e.target.closest('.producto-card');
      const $detallesBtn = e.target.closest('.boton-detalles');
      const $agregarBtn = e.target.closest('.boton-agregar');
      
      if ($card && $detallesBtn) {
        const productoId = parseInt($card.dataset.id);
        const producto = state.productos.find(p => p.id === productoId);
        if (producto) Modal.producto.mostrar(producto);
      }
      
      if ($card && $agregarBtn) {
        const productoId = parseInt($card.dataset.id);
        Carrito.agregarItem(productoId, 1);
      }
    });

    // Eventos de carrito
    DOM.get('#carrito-btn-main')?.addEventListener('click', () => {
      DOM.get('#carrito-panel').classList.toggle('active');
      DOM.get('.carrito-overlay').classList.toggle('active');
      document.body.classList.toggle('no-scroll');
      Carrito.renderizar();
    });

    // Eventos de filtros
    DOM.get('#input-busqueda')?.addEventListener('input', (e) => {
      state.filtros.busqueda = e.target.value.toLowerCase();
      state.paginaActual = 1;
      Productos.renderizar();
    });

    DOM.get('#filtro-categoria')?.addEventListener('change', (e) => {
      state.filtros.categoria = e.target.value;
      state.paginaActual = 1;
      Productos.renderizar();
    });

    DOM.get('#boton-resetear-filtros')?.addEventListener('click', () => {
      state.filtros = {
        precioMin: null,
        precioMax: null,
        categoria: 'todos',
        busqueda: ''
      };
      DOM.get('#input-busqueda').value = '';
      DOM.get('#filtro-categoria').value = 'todos';
      DOM.get('#precio-min').value = '';
      DOM.get('#precio-max').value = '';
      state.paginaActual = 1;
      Productos.renderizar();
    });
  }
};

// ===============================
// INICIALIZACIÓN MEJORADA
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
      
      // Ocultar loader
      DOM.get('#product-loader')?.classList.remove('visible');
    } catch (error) {
      console.error('Error inicializando la aplicación:', error);
      Utils.mostrarNotificacion('Error al iniciar la aplicación', 'error');
    }
  }
};

// Iniciar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', App.init);


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

// Inicializar EmailJS con tu clave pública
emailjs.init('o4IxJz0Zz-LQ8jYKG'); // Reemplaza con tu clave pública de EmailJS

// Llamar a la función para configurar el formulario de contacto
setupContactForm();
