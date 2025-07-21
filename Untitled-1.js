// ===============================
// CONFIGURACIÓN INICIAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const CSV_URL = window.SHEET_CSV_URL;
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE;

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
  btnEnviar: getElement('btn-enviar'),
  btnFlotante: document.querySelector('.boton-flotante'),
  avisoPreCompraModal: getElement('aviso-pre-compra-modal'),
  btnEntendidoAviso: getElement('btn-entendido-aviso'),
  btnCancelarAviso: getElement('btn-cancelar-aviso'),
  productLoader: getElement('product-loader')
};

// ===============================
// FUNCIONES AUXILIARES
// ===============================

function evitarScrollPorDefecto() {
  document.querySelectorAll('button:not([type])').forEach(btn => {
    btn.setAttribute('type', 'button');
  });
}

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

function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

// ===============================
// MANEJO DEL CARRITO
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

function agregarAlCarrito(id, cantidad = 1) {
  const prod = productos.find(p => p.id === id);
  if (!prod) return mostrarNotificacion('Producto no encontrado', 'error');
  
  cantidad = parseInt(cantidad, 10);
  if (isNaN(cantidad)) {  // <-- Corregido aquí
    mostrarNotificacion('Por favor ingrese una cantidad válida', 'error');
    return;
  }
  
  if (cantidad < 1) {
    mostrarNotificacion('La cantidad debe ser al menos 1', 'error');
    return;
  }
  
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
      imagen: prod.imagenes[0] || PLACEHOLDER_IMAGE
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
      <img src="${i.imagen}" class="carrito-item-img" alt="${i.nombre}" loading="lazy" onerror="this.src='${PLACEHOLDER_IMAGE}'">
      <div class="carrito-item-info">
        <span class="carrito-item-nombre">${i.nombre}</span>
        <span class="carrito-item-precio">$U ${i.precio.toLocaleString('es-UY')}</span>
        <div class="carrito-item-controls">
          <button data-id="${i.id}" data-action="decrementar" aria-label="Reducir cantidad">-</button>
          <span class="carrito-item-cantidad">${i.cantidad}</span>
          <button data-id="${i.id}" data-action="incrementar" aria-label="Aumentar cantidad">+</button>
          <button data-id="${i.id}" class="eliminar-item" aria-label="Eliminar del carrito">
            Eliminar
          </button>
        </div>
        <span class="carrito-item-subtotal">Subtotal: $U ${(i.precio * i.cantidad).toLocaleString('es-UY')}</span>
      </div>
    </li>`).join('');
  
  const total = carrito.reduce((sum, i) => sum + i.precio * i.cantidad, 0);
  elementos.totalCarrito.textContent = `Total: $U ${total.toLocaleString('es-UY')}`;
  
  // Manejar eventos de los controles del carrito
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

function toggleCarrito() {
  if (!elementos.carritoPanel || !elementos.carritoOverlay) return;
  
  const isOpen = elementos.carritoPanel.classList.toggle('active');
  elementos.carritoOverlay.classList.toggle('active', isOpen);
  document.body.classList.toggle('no-scroll', isOpen);
  
  if (isOpen) {
    setTimeout(() => {
      elementos.carritoPanel.focus();
    }, 100);
  }
}

// ===============================
// MANEJO DE PRODUCTOS
// ===============================

async function cargarProductosDesdeSheets() {
  try {
    if (elementos.productLoader) {
      elementos.productLoader.hidden = false;
    }
    
    if (elementos.galeriaProductos) {
      elementos.galeriaProductos.innerHTML = '';
    }
    
    const resp = await fetch(CSV_URL, { headers: { 'Cache-Control': 'no-store' } });
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
    if (!data || data.length === 0) {
      if (elementos.galeriaProductos) {
        elementos.galeriaProductos.innerHTML = '<p class="sin-productos">No hay productos disponibles en este momento.</p>';
      }
      return;
    }
    
    productos = data
      .filter(r => r.id && r.nombre && r.precio)
      .map(r => ({
        id: parseInt(r.id, 10),
        nombre: r.nombre ? r.nombre.trim() : 'Sin Nombre',
        descripcion: r.descripcion ? r.descripcion.trim() : '',
        precio: parseFloat(r.precio) || 0,
        stock: parseInt(r.cantidad, 10) || 0,
        imagenes: (r.foto && r.foto.trim() !== "") ? r.foto.split(',').map(x => x.trim()).filter(x => !!x) : [PLACEHOLDER_IMAGE],
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
    console.error('Error al cargar productos:', e);
    if (elementos.galeriaProductos) {
      elementos.galeriaProductos.innerHTML = '<p class="error-carga">No se pudieron cargar los productos. Intente recargar la página.</p>';
    }
    mostrarNotificacion('Error al cargar productos: ' + e.message, 'error');
  } finally {
    if (elementos.productLoader) {
      elementos.productLoader.hidden = true;
    }
  }
}

function actualizarCategorias() {
  if (!elementos.selectCategoria) return;
  const categoriasUnicas = [...new Set(productos.map(p => p.categoria))];
  const categorias = ['todos', ...categoriasUnicas];
  
  elementos.selectCategoria.innerHTML = categorias
    .map(cat => `<option value="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`)
    .join('');
}

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

function crearCardProducto(p) {
  const enCarrito = carrito.find(i => i.id === p.id);
  const disp = p.stock - (enCarrito?.cantidad || 0);
  const agot = disp <= 0;
  const primeraImagen = p.imagenes[0] || PLACEHOLDER_IMAGE;

  return `
    <div class="producto-card" data-id="${p.id}">
      <img src="${primeraImagen}" 
           alt="${p.nombre}" 
           class="producto-imagen" 
           loading="lazy"
           onerror="this.src='${PLACEHOLDER_IMAGE}'">
      <div class="producto-info">
        <h3 class="producto-nombre">${p.nombre}</h3>
        <p class="producto-precio">$U ${p.precio.toLocaleString('es-UY')}</p>
        <p class="producto-stock ${agot ? 'agotado' : 'disponible'}">
          ${agot ? 'Agotado' : `Stock: ${disp}`}
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
            ${agot ? 'Agotado' : 'Agregar'}
          </button>
        </div>
        <button class="boton-detalles" data-id="${p.id}">Ver Detalles</button>
      </div>
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
    elementos.galeriaProductos.innerHTML = '<p class="sin-resultados">No se encontraron productos con los filtros aplicados.</p>';
  } else {
    elementos.galeriaProductos.innerHTML = slice.map(crearCardProducto).join('');
  }
  
  // Manejar eventos de los botones
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
// MODAL DE PRODUCTO
// ===============================

function mostrarModalProducto(producto) {
  if (!elementos.productoModal || !elementos.modalContenido) {
    console.error('Elementos del modal no encontrados');
    return;
  }

  const enCarrito = carrito.find(item => item.id === producto.id) || { cantidad: 0 };
  const disponible = Math.max(0, producto.stock - enCarrito.cantidad);
  const estaAgotado = disponible <= 0;

  const generarCarrusel = () => {
    const imagenesValidas = producto.imagenes.filter(img => img) || [PLACEHOLDER_IMAGE];
    const tieneImagenes = imagenesValidas.length > 0;
    const primeraImagen = tieneImagenes ? imagenesValidas[0] : PLACEHOLDER_IMAGE;

    let html = `
      <img src="${primeraImagen}" 
           class="modal-img" 
           id="modal-img-principal" 
           alt="${producto.nombre}" 
           loading="lazy"
           onerror="this.onerror=null;this.src='${PLACEHOLDER_IMAGE}'">`;

    if (imagenesValidas.length > 1) {
      html += `
        <div class="modal-thumbnails">
          ${imagenesValidas.map((img, index) => `
            <img src="${img}" 
                 class="modal-thumbnail ${index === 0 ? 'active' : ''}" 
                 alt="Miniatura ${index + 1} de ${producto.nombre}"
                 data-index="${index}"
                 onerror="this.onerror=null;this.src='${PLACEHOLDER_IMAGE}'">
          `).join('')}
        </div>`;
    }

    return html;
  };

  elementos.modalContenido.innerHTML = `
    <button class="cerrar-modal" aria-label="Cerrar modal de producto">×</button>
    <div class="modal-flex">
      <div class="modal-carrusel">
        ${generarCarrusel()}
      </div>
      <div class="modal-info">
        <h1 class="modal-nombre">${producto.nombre}</h1>
        <div class="modal-precio" aria-label="Precio">$U ${producto.precio.toLocaleString('es-UY')}</div>
        <div class="modal-stock ${estaAgotado ? 'agotado' : 'disponible'}" 
             aria-live="polite">
          ${estaAgotado ? 'AGOTADO' : `Disponible: ${disponible}`}
        </div>
        
        ${producto.descripcion ? `
          <div class="modal-descripcion">
            <h2 class="sr-only">Descripción</h2>
            <p>${producto.descripcion}</p>
          </div>
        ` : ''}
        
        <div class="modal-detalles-container">
          ${producto.adicionales ? `
            <div class="modal-detalle">
              <span class="detalle-etiqueta">Material:</span>
              <span class="detalle-valor">${producto.adicionales}</span>
            </div>
          ` : ''}
          
          ${producto.alto && producto.ancho ? `
            <div class="modal-detalle">
              <span class="detalle-etiqueta">Medidas:</span>
              <span class="detalle-valor">
                ${producto.alto} × ${producto.ancho}
                ${producto.profundidad ? ' × ' + producto.profundidad : ''} cm
              </span>
            </div>
          ` : ''}
        </div>
        
        <div class="modal-acciones">
          <label for="cantidad-modal-${producto.id}" class="sr-only">Cantidad</label>
          <input type="number" 
                 id="cantidad-modal-${producto.id}"
                 value="1" 
                 min="1" 
                 max="${disponible}" 
                 class="cantidad-modal-input" 
                 ${estaAgotado ? 'disabled aria-disabled="true"' : ''}>
          
          <button class="boton-agregar-modal ${estaAgotado ? 'agotado' : ''}" 
                  data-id="${producto.id}"
                  ${estaAgotado ? 'disabled aria-disabled="true"' : ''}
                  aria-label="${estaAgotado ? 'Producto agotado' : 'Agregar al carrito'}">
            ${estaAgotado ? 'Agotado' : 'Agregar al carrito'}
          </button>
        </div>
      </div>
    </div>
  `;

  const configurarEventos = () => {
    if (producto.imagenes?.length > 1) {
      const mainImg = elementos.modalContenido.querySelector('#modal-img-principal');
      const thumbnails = elementos.modalContenido.querySelectorAll('.modal-thumbnail');
      
      thumbnails.forEach(thumb => {
        thumb.addEventListener('click', () => {
          const index = thumb.dataset.index;
          thumbnails.forEach(t => t.classList.remove('active'));
          thumb.classList.add('active');
          mainImg.src = producto.imagenes[index];
        });
      });
    }

    const cerrarBtn = elementos.modalContenido.querySelector('.cerrar-modal');
    cerrarBtn?.addEventListener('click', cerrarModal);

    const agregarBtn = elementos.modalContenido.querySelector('.boton-agregar-modal');
    agregarBtn?.addEventListener('click', () => {
      const cantidadInput = elementos.modalContenido.querySelector('.cantidad-modal-input');
      const cantidad = Math.min(
        parseInt(cantidadInput.value) || 1,
        disponible
      );
      
      agregarAlCarrito(producto.id, cantidad);
      mostrarNotificacion(`${producto.nombre} agregado al carrito`, 'exito');
      cerrarModal();
    });

    elementos.productoModal.addEventListener('click', (e) => {
      if (e.target === elementos.productoModal) {
        cerrarModal();
      }
    });
  };

  const mostrarModal = () => {
    elementos.productoModal.style.display = 'flex';
    document.body.classList.add('no-scroll');
    
    setTimeout(() => {
      elementos.productoModal.style.opacity = '1';
      elementos.productoModal.style.visibility = 'visible';
      elementos.modalContenido.querySelector('.cerrar-modal')?.focus();
    }, 10);
  };

  const cerrarModal = () => {
    elementos.productoModal.style.opacity = '0';
    elementos.productoModal.style.visibility = 'hidden';
    
    setTimeout(() => {
      elementos.productoModal.style.display = 'none';
      document.body.classList.remove('no-scroll');
    }, 300);
  };

  configurarEventos();
  mostrarModal();
}

// ===============================
// MANEJO DE FILTROS
// ===============================

function aplicarFiltros() {
  paginaActual = 1;
  actualizarUI();
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
// PREGUNTAS FRECUENTES
// ===============================

function inicializarFAQs() {
  elementos.faqToggles?.forEach(toggle => {
    toggle.addEventListener('click', () => {
      const faqItem = toggle.closest('.faq-item');
      const content = faqItem.querySelector('.faq-content');
      const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
      
      // Alternar el FAQ actual
      toggle.setAttribute('aria-expanded', !isExpanded);
      
      if (!isExpanded) {
        content.style.maxHeight = content.scrollHeight + 'px';
        faqItem.classList.add('active');
      } else {
        content.style.maxHeight = '0';
        faqItem.classList.remove('active');
      }
    });
  });
}

// ===============================
// FORMULARIO DE CONTACTO
// ===============================

async function enviarFormularioContacto(event) {
  event.preventDefault();
  
  const form = event.target;
  const btnEnviar = elementos.btnEnviar;
  const successMessage = elementos.successMessage;
  
  // Validación
  const nombre = form.from_name.value.trim();
  const email = form.from_email.value.trim();
  const mensaje = form.message.value.trim();
  
  if (!nombre || !email || !mensaje) {
    mostrarNotificacion("Por favor complete todos los campos", "error");
    return;
  }
  
  if (!isValidEmail(email)) {
    mostrarNotificacion("Por favor ingrese un email válido", "error");
    return;
  }
  
  btnEnviar.disabled = true;
  btnEnviar.textContent = 'Enviando...';
  
  try {
    // Inicializar EmailJS solo una vez si está disponible
    if (window.emailjs && !window.emailjsInitialized) {
      await emailjs.init("o4IxJz0Zz-LQ8jYKG");
      window.emailjsInitialized = true;
    }
    
    let resultado;
    
    // Intentar enviar con EmailJS primero
    if (window.emailjs) {
      resultado = await emailjs.sendForm('service_89by24g', 'template_8mn7hdp', form);
    } else {
      // Fallback a fetch si EmailJS no está disponible
      const response = await fetch('/api/contacto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_name: nombre,
          from_email: email,
          message: mensaje
        })
      });
      
      if (!response.ok) {
        throw new Error('Error en el servidor');
      }
      resultado = await response.json();
    }
    
    // Éxito
    form.reset();
    mostrarNotificacion("¡Mensaje enviado con éxito!", "exito");
    
    if (successMessage) {
      successMessage.textContent = '¡Mensaje enviado con éxito!';
      successMessage.className = 'success-message success';
      successMessage.style.display = 'block';
      setTimeout(() => {
        successMessage.style.display = 'none';
      }, 5000);
    }
  } catch (error) {
    console.error("Error al enviar el mensaje:", error);
    mostrarNotificacion("Error al enviar mensaje. Intenta de nuevo.", "error");
    
    if (successMessage) {
      successMessage.textContent = 'Error al enviar el mensaje. Por favor intente nuevamente.';
      successMessage.className = 'success-message error';
      successMessage.style.display = 'block';
      setTimeout(() => {
        successMessage.style.display = 'none';
      }, 5000);
    }
  } finally {
    btnEnviar.disabled = false;
    btnEnviar.textContent = 'Enviar mensaje';
  }
}

function inicializarFormularioContacto() {
  if (!elementos.formContacto) return;
  
  // Validación en tiempo real
  elementos.formContacto.addEventListener('input', function() {
    const nombre = this.from_name.value.trim();
    const email = this.from_email.value.trim();
    const mensaje = this.message.value.trim();
    
    elementos.btnEnviar.disabled = !(nombre && email && mensaje && isValidEmail(email));
  });
  
  // Envío del formulario
  elementos.formContacto.addEventListener('submit', enviarFormularioContacto);
}

// ===============================
// INICIALIZACIÓN DE EVENTOS
// ===============================

function inicializarEventos() {
  // Carrito
  elementos.carritoBtnMain?.addEventListener('click', toggleCarrito);
  elementos.carritoOverlay?.addEventListener('click', toggleCarrito);
  elementos.btnCerrarCarrito?.addEventListener('click', toggleCarrito);
  
  elementos.btnVaciarCarrito?.addEventListener('click', () => {
    if (carrito.length === 0) {
      mostrarNotificacion('El carrito ya está vacío', 'info');
      return;
    }
    
    if (confirm('¿Estás seguro de que deseas vaciar el carrito?')) {
      carrito = [];
      guardarCarrito();
      actualizarUI();
      mostrarNotificacion('Carrito vaciado', 'info');
    }
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
  
  // Filtros
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
  
  // Menú hamburguesa
  elementos.hamburguesaBtn?.addEventListener('click', () => {
    elementos.menu?.classList.toggle('active');
    elementos.hamburguesaBtn.setAttribute('aria-expanded', 
      elementos.menu.classList.contains('active'));
  });
  
  // Cerrar menú al hacer clic en un enlace
  document.querySelectorAll('.menu a').forEach(link => {
    link.addEventListener('click', () => {
      if (elementos.menu.classList.contains('active')) {
        elementos.menu.classList.remove('active');
        elementos.hamburguesaBtn.setAttribute('aria-expanded', 'false');
      }
    });
  });
  
  // Botón flotante
  window.addEventListener('scroll', () => {
    if (window.scrollY > 300) {
      elementos.btnFlotante?.classList.add('visible');
    } else {
      elementos.btnFlotante?.classList.remove('visible');
    }
  });
  
  elementos.btnFlotante?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  
  // Tecla Escape para cerrar modal y carrito
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (elementos.productoModal.style.display === 'flex') {
        cerrarModal();
      }
      if (elementos.carritoPanel.classList.contains('active')) {
        toggleCarrito();
      }
    }
  });
  
  // Inicializar FAQs
  inicializarFAQs();
  
  // Inicializar formulario de contacto
  inicializarFormularioContacto();
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
  evitarScrollPorDefecto();
  cargarCarrito();
  cargarProductosDesdeSheets();
  inicializarEventos();
}

// Iniciar la aplicación
if (document.readyState !== 'loading') {
  init();
} else {
  document.addEventListener('DOMContentLoaded', init);
}
