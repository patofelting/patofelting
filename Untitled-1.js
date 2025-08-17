/* ===============================
 * E-COMMERCE JS – Patofelting
 * Archivo: Untitled-1.js (type="module")
 * =============================== */

// ---------------------------------
// CONFIGURACIÓN GLOBAL
// ---------------------------------
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const PLACEHOLDER_IMAGE =
  window.PLACEHOLDER_IMAGE ||
  'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

// Firebase (la app ya está inicializada en index.html)
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ref, runTransaction, onValue, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const db   = window.firebaseDatabase; // expuesto globalmente en index.html
const auth = getAuth();               // toma la app por defecto

// ---------------------------------
// ESTADO GLOBAL
// ---------------------------------
let productos = [];
let carrito   = [];
let paginaActual = 1;

let filtrosActuales = {
  precioMin: 0,
  precioMax: 3000,
  categoria: 'todos',
  busqueda: ''
};

// ---------------------------------
// REFERENCIAS AL DOM
// ---------------------------------
const $id = (id) => document.getElementById(id);
const $qs = (sel) => document.querySelector(sel);

const elementos = {
  // catálogo
  galeriaProductos: $id('galeria-productos'),
  paginacion: $id('paginacion'),

  // modal producto
  productoModal: $id('producto-modal'),
  modalContenido: $id('modal-contenido'),

  // carrito
  carritoBtnMain: $id('carrito-btn-main'),
  carritoPanel: $id('carrito-panel'),
  carritoOverlay: $qs('.carrito-overlay'),
  btnCerrarCarrito: $qs('.cerrar-carrito'),
  listaCarrito: $id('lista-carrito'),
  totalCarrito: $id('total'),
  contadorCarrito: $id('contador-carrito'),
  btnVaciarCarrito: $qs('.boton-vaciar-carrito'),
  btnFinalizarCompra: $qs('.boton-finalizar-compra'),

  // aviso pre-compra + datos envío
  avisoPreCompraModal: $id('aviso-pre-compra-modal'),
  btnEntendidoAviso: $id('btn-entendido-aviso'),
  btnCancelarAviso: $id('btn-cancelar-aviso'),
  modalDatosEnvio: $id('modal-datos-envio'),
  selectEnvio: $id('select-envio'),
  resumenPedido: $id('resumen-pedido'),

  // filtros
  inputBusqueda: $qs('.input-busqueda'),
  selectCategoria: $id('filtro-categoria'),
  precioMinInput: $id('min-slider'),
  precioMaxInput: $id('max-slider'),
  minPriceText: $id('min-price'),
  maxPriceText: $id('max-price'),
  thumbMin: $id('thumb-label-min'),
  thumbMax: $id('thumb-label-max'),
  rangeTrack: $qs('.range-slider .range'),
  aplicarRangoBtn: $qs('.aplicar-rango-btn'),

  // otros
  productLoader: $id('product-loader'),
  hamburguesa: $qs('.hamburguesa'),
  menu: $id('menu'),

  // contacto
  formContacto: $id('formulario-contacto'),
  successMessage: $id('successMessage'),
  errorMessage: $id('errorMessage'),
};

// ---------------------------------
// UTILIDADES
// ---------------------------------
function mostrarNotificacion(mensaje, tipo = 'exito') {
  const n = document.createElement('div');
  n.className = `notificacion ${tipo}`;
  n.textContent = mensaje;
  document.body.appendChild(n);
  
  // Asegurar que la notificación sea visible y accesible
  n.setAttribute('role', 'alert');
  n.setAttribute('aria-live', 'assertive');
  
  requestAnimationFrame(() => n.classList.add('show'));
  setTimeout(() => {
    n.classList.remove('show'); 
    setTimeout(() => {
      n.remove();
      // Mover foco si era la última notificación
      const notificaciones = document.querySelectorAll('.notificacion');
      if (notificaciones.length === 0) {
        document.querySelector('header')?.focus();
      }
    }, 220);
  }, 2500);
}

function formatearUY(num){
  return Number(num || 0).toLocaleString('es-UY');
}

// ---------------------------------
// CARRITO: persistencia y UI
// ---------------------------------
function guardarCarrito(){
  localStorage.setItem(LS_CARRITO_KEY, JSON.stringify(carrito));
  actualizarContadorCarrito();
}

function cargarCarrito(){
  try{ carrito = JSON.parse(localStorage.getItem(LS_CARRITO_KEY)) || []; }
  catch{ carrito = []; }
  actualizarContadorCarrito();
}

function actualizarContadorCarrito(){
  const total = carrito.reduce((s,i)=>s+i.cantidad,0);
  if (elementos.contadorCarrito){
    elementos.contadorCarrito.textContent = total;
    elementos.contadorCarrito.classList.toggle('visible', total>0);
  }
}

async function vaciarCarrito() {
  if (!carrito.length) {
    mostrarNotificacion('El carrito ya está vacío', 'info');
    return;
  }

  try {
    // Mostrar feedback de carga
    const originalText = elementos.btnVaciarCarrito?.textContent;
    if (elementos.btnVaciarCarrito) {
      elementos.btnVaciarCarrito.disabled = true;
      elementos.btnVaciarCarrito.innerHTML = 'Procesando <span class="spinner"></span>';
    }

    // Restaurar stock en Firebase
    const promises = carrito.map(async (it) => {
      const r = ref(db, `productos/${it.id}/stock`);
      try {
        await runTransaction(r, (cur) => {
          const currentStock = (typeof cur === 'number' && !isNaN(cur)) ? cur : 0;
          return currentStock + it.cantidad;
        });
      } catch (e) {
        console.error(`Error al restaurar stock del producto ${it.id}:`, e);
        throw e;
      }
    });

    await Promise.all(promises);
    carrito = [];
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion('Carrito vaciado y stock restaurado', 'exito');
  } catch (e) {
    console.error('Error al vaciar carrito:', e);
    mostrarNotificacion('Error al vaciar el carrito. Intente nuevamente.', 'error');
  } finally {
    if (elementos.btnVaciarCarrito) {
      elementos.btnVaciarCarrito.disabled = false;
      elementos.btnVaciarCarrito.textContent = originalText || 'Vaciar Carrito';
    }
  }
}

function renderizarCarrito(){
  if (!elementos.listaCarrito || !elementos.totalCarrito) return;

  if (!carrito.length){
    elementos.listaCarrito.innerHTML = '<p class="carrito-vacio">Tu carrito está vacío</p>';
    elementos.totalCarrito.textContent = 'Total: $U 0';
    return;
  }

  elementos.listaCarrito.innerHTML = carrito.map(item=>{
    const p = productos.find(pp=>pp.id===item.id);
    const stockReal = p ? p.stock : 0;
    const disponibles = Math.max(0, stockReal - item.cantidad);
    return `
      <li class="carrito-item" data-id="${item.id}">
        <img src="${item.imagen}" class="carrito-item-img" alt="${item.nombre}">
        <div class="carrito-item-info">
          <span class="carrito-item-nombre">${item.nombre}</span>
          <span class="carrito-item-precio">$U ${formatearUY(item.precio)} c/u</span>
          <div class="carrito-item-controls">
            <button class="disminuir-cantidad" data-id="${item.id}" ${item.cantidad<=1?'disabled':''}>-</button>
            <span class="carrito-item-cantidad">${item.cantidad}</span>
            <button class="aumentar-cantidad" data-id="${item.id}" ${disponibles<=0?'disabled':''}>+</button>
          </div>
          <span class="carrito-item-subtotal">Subtotal: $U ${formatearUY(item.precio*item.cantidad)}</span>
        </div>
      </li>`;
  }).join('');

  const total = carrito.reduce((s,i)=> s + i.precio*i.cantidad, 0);
  elementos.totalCarrito.textContent = `Total: $U ${formatearUY(total)}`;

  // Delegación
  elementos.listaCarrito.querySelectorAll('.disminuir-cantidad').forEach(btn=>{
    btn.addEventListener('click', async (e)=>{
      const id = +e.currentTarget.dataset.id;
      const item = carrito.find(i=>i.id===id);
      if (!item || item.cantidad<=1) return;
      const r = ref(db, `productos/${id}/stock`);
      try{
        await runTransaction(r, (cur)=> (typeof cur==='number' && !isNaN(cur) ? cur : 0) + 1);
        item.cantidad -= 1;
        guardarCarrito(); renderizarCarrito(); renderizarProductos();
      }catch(err){ console.error(err); mostrarNotificacion('Error al actualizar cantidad','error'); }
    });
  });
  elementos.listaCarrito.querySelectorAll('.aumentar-cantidad').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const id = +e.currentTarget.dataset.id;
      agregarAlCarrito(id, 1);
    });
  });
}

function toggleCarrito(forceState){
  if (!elementos.carritoPanel || !elementos.carritoOverlay) return;
  const isOpen = typeof forceState==='boolean' ? forceState : !elementos.carritoPanel.classList.contains('active');
  elementos.carritoPanel.classList.toggle('active', isOpen);
  elementos.carritoOverlay.classList.toggle('active', isOpen);
  document.body.classList.toggle('no-scroll', isOpen);
  if (isOpen) renderizarCarrito();
}

// ---------------------------------
// PRODUCTOS: carga y render
// ---------------------------------
async function cargarProductosDesdeFirebase() {
  const productosRef = ref(db, 'productos');
  try {
    if (elementos.productLoader) elementos.productLoader.hidden = false;
    
    // Primera carga
    const snap = await get(productosRef);
    if (snap.exists()) {
      procesarDatosProductos(snap.val());
    } else {
      mostrarNotificacion('No se encontraron productos disponibles', 'info');
    }
    
    // Escuchar cambios en tiempo real
    onValue(productosRef, (s) => {
      if (!s.exists()) {
        productos = [];
        renderizarProductos();
        actualizarCategorias();
        actualizarUI();
        mostrarNotificacion('Los productos no están disponibles temporalmente', 'info');
        return;
      }
      procesarDatosProductos(s.val());
    }, (error) => {
      console.error('Error en listener de productos:', error);
      mostrarNotificacion('Error al cargar productos en tiempo real', 'error');
    });
    
  } catch (e) {
    console.error('Error al cargar productos:', e);
    if (elementos.galeriaProductos) {
      elementos.galeriaProductos.innerHTML = `
        <div class="error-carga">
          <p>No se pudieron cargar los productos.</p>
          <button class="boton-reintentar" onclick="location.reload()">Reintentar</button>
        </div>`;
    }
    mostrarNotificacion('Error al cargar productos. Intente recargar la página.', 'error');
  } finally {
    if (elementos.productLoader) elementos.productLoader.hidden = true;
  }
}

function procesarDatosProductos(data){
  productos = [];
  Object.keys(data).forEach(key=>{
    const p = data[key] || {};
    productos.push({
      id: p.id && !isNaN(p.id) ? parseInt(p.id) : parseInt(key),
      nombre: (p.nombre || 'Sin nombre').trim(),
      descripcion: (p.descripcion || '').trim(),
      precio: !isNaN(+p.precio) ? +p.precio : 0,
      stock: !isNaN(parseInt(p.stock)) ? Math.max(0, parseInt(p.stock)) : 0,
      imagenes: Array.isArray(p.imagenes) && p.imagenes.length ? p.imagenes : [PLACEHOLDER_IMAGE],
      categoria: (p.categoria || 'otros').toLowerCase().trim(),
      estado: (p.estado || '').trim(),
      adicionales: (p.adicionales || '').trim(),
      alto: !isNaN(+p.alto) ? +p.alto : null,
      ancho: !isNaN(+p.ancho) ? +p.ancho : null,
      profundidad: !isNaN(+p.profundidad) ? +p.profundidad : null,
    });
  });
  renderizarProductos();
  actualizarCategorias();
  actualizarUI();
}

function crearCardProducto(p){
  const enCarrito = carrito.find(i => i.id === p.id);
  const disponibles = Math.max(0, p.stock - (enCarrito?.cantidad || 0));
  const agot = disponibles <= 0;
  const img = p.imagenes?.[0] || PLACEHOLDER_IMAGE;

  return `
    <div class="producto-card ${agot ? 'agotado' : ''}" data-id="${p.id}">
      <img src="${img}" alt="${p.nombre}" class="producto-img" loading="lazy">
      <h3 class="producto-nombre">${p.nombre}</h3>
      <p class="producto-precio">$U ${formatearUY(p.precio)}</p>
      <div class="card-acciones">
        <button class="boton-agregar${agot ? ' agotado' : ''}" ${agot ? 'disabled' : ''}>
          ${agot ? 'Agotado' : 'Agregar'}
        </button>
        ${agot ? `<button class="boton-aviso-stock" data-nombre="${p.nombre.replace(/"/g,'&quot;')}">📩 Avisame</button>` : ''}
      </div>
      <!-- 👇 ahora el botón también lleva data-id -->
      <button class="boton-detalles" data-id="${p.id}">🔍 Ver Detalle</button>
    </div>
  `;
}


function renderizarProductos(){
  const data = filtrarProductos();
  const start = (paginaActual-1)*PRODUCTOS_POR_PAGINA;
  const pageItems = data.slice(start, start+PRODUCTOS_POR_PAGINA);

  if (!elementos.galeriaProductos) return;
  elementos.galeriaProductos.innerHTML = pageItems.length
    ? pageItems.map(crearCardProducto).join('')
    : '<p class="sin-productos">No se encontraron productos que coincidan con los filtros.</p>';

  renderizarPaginacion(data.length);
}

function renderizarPaginacion(total){
  const totalPages = Math.ceil(total/PRODUCTOS_POR_PAGINA);
  if (!elementos.paginacion) return;
  elementos.paginacion.innerHTML = '';
  if (totalPages<=1) return;
  for (let i=1;i<=totalPages;i++){
    const b = document.createElement('button');
    b.textContent = i;
    b.className = i===paginaActual ? 'active' : '';
    b.addEventListener('click', ()=>{
      paginaActual = i;
      renderizarProductos();
      if (elementos.galeriaProductos){
        window.scrollTo({ top: elementos.galeriaProductos.offsetTop - 100, behavior: 'smooth' });
      }
    });
    elementos.paginacion.appendChild(b);
  }
}

// ---------------------------------
// FILTROS
// ---------------------------------
function filtrarProductos(){
  const {precioMin, precioMax, categoria} = filtrosActuales;
  const b = (filtrosActuales.busqueda || '').toLowerCase();
  return productos.filter(p=>{
    const okPrecio = p.precio >= precioMin && p.precio <= precioMax;
    const okCat = categoria==='todos' || p.categoria===categoria;
    const okBusq = !b || p.nombre.toLowerCase().includes(b) || p.descripcion.toLowerCase().includes(b);
    return okPrecio && okCat && okBusq;
  });
}

function aplicarFiltros(){
  paginaActual = 1;
  renderizarProductos();
}

function actualizarCategorias(){
  if (!elementos.selectCategoria) return;
  const cats = ['todos', ...new Set(productos.map(p=>p.categoria).filter(Boolean).sort())];
  elementos.selectCategoria.innerHTML = cats.map(c=>`<option value="${c}">${c.charAt(0).toUpperCase()+c.slice(1)}</option>`).join('');
  elementos.selectCategoria.value = filtrosActuales.categoria;
}

// Slider visual + valores
function updateRange(){
  if (!elementos.precioMinInput || !elementos.precioMaxInput) return;
  let min = parseInt(elementos.precioMinInput.value || 0);
  let max = parseInt(elementos.precioMaxInput.value || 0);
  if (min>max){ [min,max] = [max,min]; }
  filtrosActuales.precioMin = min;
  filtrosActuales.precioMax = max;

  if (elementos.minPriceText) elementos.minPriceText.textContent = `$U ${formatearUY(min)}`;
  if (elementos.maxPriceText) elementos.maxPriceText.textContent = `$U ${formatearUY(max)}`;

  // mover etiquetas sobre los thumbs (si existen)
  const rangeMin = parseInt(elementos.precioMinInput.min || 0);
  const rangeMax = parseInt(elementos.precioMaxInput.max || 3000);
  const pctMin = ((min - rangeMin) / (rangeMax - rangeMin)) * 100;
  const pctMax = ((max - rangeMin) / (rangeMax - rangeMin)) * 100;

  if (elementos.thumbMin){ elementos.thumbMin.style.left = `${pctMin}%`; elementos.thumbMin.textContent = formatearUY(min); }
  if (elementos.thumbMax){ elementos.thumbMax.style.left = `${pctMax}%`; elementos.thumbMax.textContent = formatearUY(max); }

  if (elementos.rangeTrack){
    elementos.rangeTrack.style.left  = `${pctMin}%`;
    elementos.rangeTrack.style.right = `${100-pctMax}%`;
  }
}

// ---------------------------------
// MODAL DE PRODUCTO
// ---------------------------------
function verDetalle(id) {
  if (!id || isNaN(id)) {
    mostrarNotificacion('ID de producto inválido', 'error');
    return;
  }

  const p = productos.find(x => x.id === id);
  if (!p) {
    mostrarNotificacion('Producto no encontrado', 'error');
    return;
  }

  mostrarModalProducto(p);
}

window.verDetalle = verDetalle;

function mostrarModalProducto(producto) {
  const { productoModal, modalContenido } = elementos;
  if (!productoModal || !modalContenido) return;

  // Cerrar modal si ya está abierto
  if (productoModal.classList.contains('active')) {
    cerrarModal();
    setTimeout(() => mostrarModalProducto(producto), 300);
    return;
  }

  const enCarrito = carrito.find(i => i.id === producto.id) || { cantidad: 0 };
  const disponibles = Math.max(0, producto.stock - enCarrito.cantidad);
  let currentImageIndex = 0;

  function renderModalContent() {
    modalContenido.innerHTML = `
      <button class="cerrar-modal" aria-label="Cerrar" id="btn-close-modal">&times;</button>
      <div class="modal-flex">
        <div class="modal-carrusel">
          <img id="modal-imagen" src="${producto.imagenes[currentImageIndex] || PLACEHOLDER_IMAGE}" 
               class="modal-img" alt="${producto.nombre}" loading="lazy">
          ${producto.imagenes.length > 1 ? `
            <div class="modal-controls">
              <button class="modal-prev" ${currentImageIndex === 0 ? 'disabled' : ''} aria-label="Imagen anterior">&lt;</button>
              <button class="modal-next" ${currentImageIndex === producto.imagenes.length - 1 ? 'disabled' : ''} aria-label="Imagen siguiente">&gt;</button>
            </div>` : ''}
          <div class="modal-thumbnails">
            ${producto.imagenes.map((img, i) => `
              <img src="${img}" class="thumbnail ${i === currentImageIndex ? 'active' : ''}" 
                   data-index="${i}" alt="Miniatura ${i + 1}" tabindex="0">
            `).join('')}
          </div>
        </div>
        <div class="modal-info">
          <h1 class="modal-nombre">${producto.nombre}</h1>
          <p class="modal-precio">$U ${formatearUY(producto.precio)}</p>
          <p class="modal-stock ${disponibles <= 0 ? 'agotado' : 'disponible'}">
            ${disponibles <= 0 ? 'AGOTADO' : `Disponible: ${disponibles}`}
          </p>
          <div class="modal-descripcion">
            ${producto.descripcion || 'No hay descripción disponible.'}
            ${producto.adicionales ? `<br><small><b>Adicionales:</b> ${producto.adicionales}</small>` : ''}
            ${(producto.alto || producto.ancho || producto.profundidad) ? `
              <br><small><b>Medidas:</b> 
              ${producto.alto ? `${producto.alto} cm (alto)` : ''}
              ${producto.ancho ? ` × ${producto.ancho} cm (ancho)` : ''}
              ${producto.profundidad ? ` × ${producto.profundidad} cm (prof.)` : ''}
              </small>` : ''}
          </div>
          <div class="modal-acciones">
            <input type="number" value="1" min="1" max="${disponibles}" 
                   class="cantidad-modal-input" ${disponibles <= 0 ? 'disabled' : ''}
                   aria-label="Cantidad a agregar al carrito">
            <button class="boton-agregar-modal ${disponibles <= 0 ? 'agotado' : ''}" 
                    data-id="${producto.id}" ${disponibles <= 0 ? 'disabled' : ''}>
              ${disponibles <= 0 ? 'Agotado' : 'Agregar al carrito'}
            </button>
            ${disponibles <= 0 ? `
              <button class="boton-aviso-stock" data-nombre="${producto.nombre.replace(/"/g, '&quot;')}" 
                      data-id="${producto.id}">
                📩 Avisame cuando esté disponible
              </button>` : ''}
          </div>
        </div>
      </div>`;

    // Event listeners
    modalContenido.querySelector('#btn-close-modal')?.addEventListener('click', cerrarModal);
    modalContenido.querySelector('.modal-prev')?.addEventListener('click', () => {
      if (currentImageIndex > 0) {
        currentImageIndex--;
        renderModalContent();
      }
    });
    modalContenido.querySelector('.modal-next')?.addEventListener('click', () => {
      if (currentImageIndex < producto.imagenes.length - 1) {
        currentImageIndex++;
        renderModalContent();
      }
    });
    modalContenido.querySelectorAll('.thumbnail').forEach(th => {
      th.addEventListener('click', () => {
        currentImageIndex = parseInt(th.dataset.index);
        renderModalContent();
      });
      th.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          currentImageIndex = parseInt(th.dataset.index);
          renderModalContent();
        }
      });
    });

    const btnAdd = modalContenido.querySelector('.boton-agregar-modal');
    const inputCant = modalContenido.querySelector('.cantidad-modal-input');
    btnAdd?.addEventListener('click', () => {
      const cant = Math.max(1, Math.min(parseInt(inputCant.value || 1), disponibles));
      agregarAlCarrito(producto.id, cant, btnAdd);
    });

    modalContenido.querySelector('.boton-aviso-stock')?.addEventListener('click', () => {
      preguntarStock(producto.nombre);
    });

    // Manejar teclado para accesibilidad
    productoModal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        cerrarModal();
      }
    });
  }

  renderModalContent();
  productoModal.classList.add('active');
  document.body.classList.add('no-scroll');
  
  // Enfocar el modal para accesibilidad
  productoModal.setAttribute('aria-hidden', 'false');
  productoModal.focus();
}

function cerrarModal() {
  const { productoModal } = elementos;
  if (!productoModal) return;

  productoModal.classList.remove('active');
  document.body.classList.remove('no-scroll');
  productoModal.setAttribute('aria-hidden', 'true');
  
  // Devolver foco al elemento que abrió el modal
  document.querySelector(`[data-id="${productoModal.dataset.lastFocus}"]`)?.focus();
}

function cerrarModal(){
  if (elementos.productoModal){
    elementos.productoModal.classList.remove('active');
  }
  document.body.classList.remove('no-scroll');
}
window.cerrarModal = cerrarModal;

// ---------------------------------
// AGREGAR AL CARRITO
// ---------------------------------
async function agregarAlCarrito(id, cantidad = 1, boton = null) {
  // Validaciones iniciales
  if (!id || isNaN(id)) {
    mostrarNotificacion('ID de producto inválido', 'error');
    return;
  }

  const p = productos.find(x => x.id === id);
  if (!p) {
    mostrarNotificacion('Producto no encontrado', 'error');
    return;
  }

  // Manejo del botón (feedback visual)
  let originalContent = null;
  if (boton) {
    originalContent = boton.innerHTML;
    boton.disabled = true;
    boton.innerHTML = 'Procesando <span class="spinner"></span>';
  }

  try {
    const enCarrito = carrito.find(i => i.id === id);
    const yaEnCarrito = enCarrito ? enCarrito.cantidad : 0;
    const disponibles = p.stock - yaEnCarrito;
    const cant = Math.max(1, Math.min(parseInt(cantidad || 1), disponibles)); // Aquí estaba el error

    if (disponibles < cant) {
      mostrarNotificacion(`Solo quedan ${disponibles} unidades disponibles`, 'error');
      return;
    }

    // Transacción con Firebase
    const r = ref(db, `productos/${id}/stock`);
    const result = await runTransaction(r, (cur) => {
      const currentStock = (typeof cur === 'number' && !isNaN(cur)) ? cur : 0;
      if (currentStock < cant) return undefined; // Aborta si no hay stock suficiente
      return currentStock - cant;
    });

    if (!result.committed) {
      mostrarNotificacion('El stock fue actualizado por otro usuario. Por favor actualice la página.', 'error');
      return;
    }

    // Actualizar carrito local
    if (enCarrito) {
      enCarrito.cantidad += cant;
    } else {
      carrito.push({
        id: p.id,
        nombre: p.nombre,
        precio: p.precio,
        cantidad: cant,
        imagen: p.imagenes?.[0] || PLACEHOLDER_IMAGE
      });
    }

    // Actualizar UI
    guardarCarrito();
    renderizarCarrito();
    renderizarProductos();
    mostrarNotificacion(`✅ ${cant} ${cant === 1 ? 'unidad' : 'unidades'} de "${p.nombre}" agregada${cant === 1 ? '' : 's'}`, 'exito');

    // Cerrar modal si está abierto
    if (elementos.productoModal?.classList.contains('active')) {
      cerrarModal();
    }

  } catch (err) {
    console.error('Error al agregar al carrito:', err);
    mostrarNotificacion('Error al agregar producto al carrito. Intente nuevamente.', 'error');
  } finally {
    // Restaurar estado del botón
    if (boton) {
      boton.disabled = false;
      boton.innerHTML = originalContent;
    }
  }
}
window.agregarAlCarrito = agregarAlCarrito;

// ---------------------------------
// AVISO DE STOCK (mail rápido)
// ---------------------------------
function preguntarStock(nombre){
  const asunto = encodeURIComponent('Aviso de stock');
  const cuerpo  = encodeURIComponent(`Hola, me gustaría saber cuándo vuelve a estar disponible: ${nombre}. Gracias.`);
  window.location.href = `mailto:${window.STOCK_EMAIL || 'contacto@patofelting.com'}?subject=${asunto}&body=${cuerpo}`;
}
window.preguntarStock = preguntarStock;

// ---------------------------------
// UI GENERAL
// ---------------------------------
function actualizarUI(){
  renderizarCarrito();
  actualizarContadorCarrito();
}

function inicializarMenuHamburguesa(){
  const {hamburguesa, menu} = elementos;
  if (!hamburguesa || !menu) return;
  hamburguesa.addEventListener('click', ()=>{
    const open = menu.classList.toggle('active');
    hamburguesa.setAttribute('aria-expanded', open);
    document.body.classList.toggle('no-scroll', open);
  });
  menu.querySelectorAll('a').forEach(a=>{
    a.addEventListener('click', ()=>{
      menu.classList.remove('active');
      hamburguesa.setAttribute('aria-expanded', false);
      document.body.classList.remove('no-scroll');
    });
  });
}

function inicializarFAQ(){
  document.querySelectorAll('.faq-toggle').forEach(t=>{
    t.addEventListener('click', ()=>{
      const exp = t.getAttribute('aria-expanded')==='true';
      t.setAttribute('aria-expanded', String(!exp));
      const content = t.nextElementSibling;
      if (content) content.hidden = exp;
    });
  });
}

// Resumen de pedido simple (envío)
function actualizarResumenPedido(){
  if (!elementos.resumenPedido) return;
  const tipo = elementos.selectEnvio?.value || 'retiro';
  const costo = tipo==='envio' ? 200 : 0;
  const subtotal = carrito.reduce((s,i)=>s+i.precio*i.cantidad,0);
  const total = subtotal + costo;
  elementos.resumenPedido.innerHTML = `
    <li>Subtotal: $U ${formatearUY(subtotal)}</li>
    <li>Envío: $U ${formatearUY(costo)}</li>
    <li><strong>Total: $U ${formatearUY(total)}</strong></li>
  `;
}

// ---------------------------------
// FORMULARIO DE CONTACTO (EmailJS)
// ---------------------------------
function setupContactForm(){
  const form = elementos.formContacto;
  if (!form) return;

  // Tu Public Key de EmailJS (visible en UI)
  const PUBLIC_KEY = 'o4IxJz0Zz-LQ8jYKG';
  const SERVICE_ID = 'service_89by24g';
  const TEMPLATE_ID = 'template_8mn7hdp';

  // Asegurar init una vez
  if (!window.__emailjsInited){
    if (window.emailjs && typeof window.emailjs.init === 'function'){
      window.emailjs.init(PUBLIC_KEY);
      window.__emailjsInited = true;
    }else{
      console.error('EmailJS no cargó.');
    }
  }

  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const {successMessage, errorMessage} = elementos;

    if (!window.emailjs || !window.__emailjsInited){
      if (errorMessage){ errorMessage.classList.remove('hidden'); errorMessage.textContent = 'Servicio de email no disponible.'; setTimeout(()=>errorMessage.classList.add('hidden'),3000); }
      return;
    }

    const nombre  = form.querySelector('[name="nombre"]')?.value || '';
    const email   = form.querySelector('[name="email"]')?.value || '';
    const mensaje = form.querySelector('[name="mensaje"]')?.value || '';

    emailjs.send(SERVICE_ID, TEMPLATE_ID, {
      from_name: nombre,
      from_email: email,
      message: mensaje
    }).then(()=>{
      if (successMessage){ successMessage.classList.remove('hidden'); setTimeout(()=>successMessage.classList.add('hidden'),3000); }
      if (errorMessage) errorMessage.classList.add('hidden');
      form.reset();
    }).catch(err=>{
      console.error(err);
      if (errorMessage){ errorMessage.classList.remove('hidden'); errorMessage.textContent = 'Error al enviar el mensaje. Intenta de nuevo.'; setTimeout(()=>errorMessage.classList.add('hidden'),3000); }
    });
  });
}

// ---------------------------------
// EVENTOS GLOBALES
// ---------------------------------
function inicializarEventos() {
  // --------------------------
  // EVENTOS DEL CARRITO
  // --------------------------
  elementos.carritoBtnMain?.addEventListener('click', () => toggleCarrito(true));
  elementos.carritoOverlay?.addEventListener('click', () => toggleCarrito(false));
  elementos.btnCerrarCarrito?.addEventListener('click', () => toggleCarrito(false));
  elementos.btnVaciarCarrito?.addEventListener('click', vaciarCarrito);

  // --------------------------
  // FINALIZAR COMPRA
  // --------------------------
  elementos.btnFinalizarCompra?.addEventListener('click', () => {
    if (!carrito.length) {
      mostrarNotificacion('El carrito está vacío', 'error');
      return;
    }
    
    if (elementos.avisoPreCompraModal) {
      elementos.avisoPreCompraModal.style.display = 'flex';
      elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'false');
      // Enfocar el primer elemento interactivo del modal
      elementos.btnEntendidoAviso?.focus();
    }
  });

  elementos.btnEntendidoAviso?.addEventListener('click', () => {
    if (elementos.avisoPreCompraModal) {
      elementos.avisoPreCompraModal.style.display = 'none';
      elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'true');
    }
    
    if (elementos.modalDatosEnvio) {
      elementos.modalDatosEnvio.style.display = 'flex';
      elementos.modalDatosEnvio.classList.add('visible');
      elementos.modalDatosEnvio.setAttribute('aria-hidden', 'false');
      actualizarResumenPedido();
      // Enfocar el primer elemento del formulario
      elementos.selectEnvio?.focus();
    }
  });

  elementos.btnCancelarAviso?.addEventListener('click', () => {
    if (elementos.avisoPreCompraModal) {
      elementos.avisoPreCompraModal.style.display = 'none';
      elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'true');
    }
  });

  elementos.selectEnvio?.addEventListener('change', actualizarResumenPedido);

  // --------------------------
  // FILTROS DE PRODUCTOS
  // --------------------------
  elementos.inputBusqueda?.addEventListener('input', (e) => {
    filtrosActuales.busqueda = (e.target.value || '').toLowerCase().trim();
    aplicarFiltros();
  });

  elementos.selectCategoria?.addEventListener('change', (e) => {
    filtrosActuales.categoria = e.target.value;
    aplicarFiltros();
  });

  elementos.precioMinInput?.addEventListener('input', () => {
    updateRange();
    aplicarFiltros();
  });

  elementos.precioMaxInput?.addEventListener('input', () => {
    updateRange();
    aplicarFiltros();
  });

  elementos.aplicarRangoBtn?.addEventListener('click', () => {
    updateRange();
    aplicarFiltros();
  });

  // --------------------------
  // CATÁLOGO DE PRODUCTOS (Delegación de eventos)
  // --------------------------
  elementos.galeriaProductos?.addEventListener('click', (e) => {
    // Detectar clic en botones dentro de las cards de producto
    const btnDetalle = e.target.closest('.boton-detalles');
    const btnAgregar = e.target.closest('.boton-agregar:not(.agotado)');
    const btnAvisoStock = e.target.closest('.boton-aviso-stock');
    
    // Obtener el ID del producto desde el botón o la card padre
    const card = e.target.closest('.producto-card');
    if (!card) return;
    
    const id = Number(card.dataset.id);
    if (isNaN(id)) return;

    if (btnDetalle) {
      // Ver detalle del producto
      e.preventDefault();
      e.stopPropagation();
      verDetalle(id);
      return;
    }

    if (btnAgregar) {
      // Agregar al carrito
      e.preventDefault();
      e.stopPropagation();
      agregarAlCarrito(id, 1, btnAgregar);
      return;
    }

    if (btnAvisoStock) {
      // Notificación de stock
      e.preventDefault();
      e.stopPropagation();
      preguntarStock(btnAvisoStock.dataset.nombre);
      return;
    }
  });

  // Soporte para teclado (accesibilidad)
  elementos.galeriaProductos?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const target = e.target;
      if (target.classList.contains('producto-card') || 
          target.classList.contains('boton-detalles') || 
          target.classList.contains('boton-agregar')) {
        e.preventDefault();
        target.click();
      }
    }
  });

  // --------------------------
  // MENÚ HAMBURGUESA (si existe)
  // --------------------------
  elementos.hamburguesa?.addEventListener('click', () => {
    const menuAbierto = elementos.menu?.classList.toggle('active');
    elementos.hamburguesa?.setAttribute('aria-expanded', menuAbierto);
    document.body.classList.toggle('no-scroll', menuAbierto);
    
    if (menuAbierto) {
      // Enfocar el primer elemento del menú cuando se abre
      elementos.menu?.querySelector('a')?.focus();
    }
  });

  // Cerrar menú al hacer clic en un enlace
  elementos.menu?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      elementos.menu?.classList.remove('active');
      elementos.hamburguesa?.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('no-scroll');
    });
  });

  // --------------------------
  // FORMULARIO DE CONTACTO
  // --------------------------
  elementos.formContacto?.addEventListener('submit', (e) => {
    e.preventDefault();
    // Aquí iría la lógica para enviar el formulario
    // ...
  });

  // --------------------------
  // EVENTOS GLOBALES
  // --------------------------
  // Cerrar modales con ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (elementos.productoModal?.classList.contains('active')) {
        cerrarModal();
      }
      if (elementos.carritoPanel?.classList.contains('active')) {
        toggleCarrito(false);
      }
      if (elementos.avisoPreCompraModal?.style.display === 'flex') {
        elementos.avisoPreCompraModal.style.display = 'none';
        elementos.avisoPreCompraModal.setAttribute('aria-hidden', 'true');
      }
      if (elementos.modalDatosEnvio?.style.display === 'flex') {
        elementos.modalDatosEnvio.style.display = 'none';
        elementos.modalDatosEnvio.setAttribute('aria-hidden', 'true');
      }
    }
  });
}
