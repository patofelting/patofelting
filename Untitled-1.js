// ===============================
// CONFIGURACIÓN GLOBAL
// ===============================
const PRODUCTOS_POR_PAGINA = 6;
const LS_CARRITO_KEY = 'carrito';
const FIREBASE_URL = 'https://patofelting-b188f-default-rtdb.firebaseio.com';
const PLACEHOLDER_IMAGE = window.PLACEHOLDER_IMAGE || 'https://via.placeholder.com/400x400/7ed957/fff?text=Sin+Imagen';

// ======== Inicializar Firebase ========
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getDatabase,
  ref,
  runTransaction,
  onValue,
  get,
  off,
  child
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD261TL6XuBp12rUNCcMKyP7_nMaCVYc7Y",
  authDomain: "patofelting-b188f.firebaseapp.com",
  databaseURL: `${FIREBASE_URL}`,
  projectId: "patofelting-b188f",
  storageBucket: "patofelting-b188f.appspot.com",
  messagingSenderId: "858377467588",
  appId: "1:858377467588:web:cade9de05ebccc17f87b91"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// Anonymous authentication
signInAnonymously(auth)
  .then(() => console.log("✅ Signed in anonymously"))
  .catch(error => console.error("❌ Error signing in:", error));

// ===============================
// ESTADO GLOBAL Y GESTIÓN EN TIEMPO REAL
// ===============================
let productos = [];
let carrito = [];
let paginaActual = 1;
let stockListeners = new Map(); // Gestión de listeners por producto
let globalStockListener = null; // Listener global de productos

let filtrosActuales = {
  precioMin: null,
  precioMax: null,
  categoria: 'todos',
  busqueda: ''
};

// Estado del modal actual
let modalProductoActual = null;
let modalImagenActual = 0;

// ===============================
// INICIALIZACIÓN DE LA APLICACIÓN
// ===============================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log("🚀 Iniciando aplicación con gestión de stock en tiempo real...");
    
    // Cargar carrito desde localStorage
    cargarCarrito();
    
    // Configurar listeners globales de stock
    inicializarListenersStock();
    
    // Configurar eventos de UI
    configurarEventosUI();
    
    // Cargar productos iniciales
    await cargarProductosDesdeFirebase();
    
    console.log("✅ Aplicación inicializada correctamente");
  } catch (error) {
    console.error("❌ Error al inicializar aplicación:", error);
    mostrarNotificacion('Error al cargar la aplicación', 'error');
  }
});

// ===============================
// GESTIÓN DE LISTENERS EN TIEMPO REAL
// ===============================
function inicializarListenersStock() {
  console.log("🔊 Configurando listeners de stock en tiempo real...");
  
  // Listener global para todos los productos
  const productosRef = ref(db, 'productos');
  
  globalStockListener = onValue(productosRef, (snapshot) => {
    if (!snapshot.exists()) {
      console.warn("⚠️ No se encontraron productos en Firebase");
      return;
    }

    const productosData = snapshot.val();
    const productosActualizados = Object.values(productosData).map(producto => ({
      ...producto,
      stock: parseInt(producto.stock, 10) || 0
    }));

    // Comparar con productos actuales para detectar cambios de stock
    const cambiosDetectados = detectarCambiosStock(productos, productosActualizados);
    
    productos = productosActualizados;
    
    // Solo actualizar UI si hay cambios reales
    if (cambiosDetectados.length > 0) {
      console.log(`📊 Stock actualizado para ${cambiosDetectados.length} productos:`, cambiosDetectados);
      
      // Actualizar vistas de forma optimizada
      actualizarTodasLasVistasOptimizado(cambiosDetectados);
      
      // Notificar cambios críticos (productos agotados/disponibles)
      notificarCambiosCriticos(cambiosDetectados);
    }
  }, (error) => {
    console.error("❌ Error en listener global de stock:", error);
    mostrarNotificacion('Error al sincronizar stock', 'error');
  });
}

function detectarCambiosStock(productosAnteriores, productosNuevos) {
  const cambios = [];
  
  productosNuevos.forEach(productoNuevo => {
    const productoAnterior = productosAnteriores.find(p => p.id === productoNuevo.id);
    
    if (productoAnterior && productoAnterior.stock !== productoNuevo.stock) {
      cambios.push({
        id: productoNuevo.id,
        nombre: productoNuevo.nombre,
        stockAnterior: productoAnterior.stock,
        stockNuevo: productoNuevo.stock
      });
    }
  });
  
  return cambios;
}

function actualizarTodasLasVistas() {
  // Actualizar galería de productos
  renderizarProductos();
  
  // Actualizar carrito
  renderizarCarrito();
  actualizarContadorCarrito();
  
  // Actualizar modal si está abierto
  if (modalProductoActual) {
    actualizarModalStock(modalProductoActual);
  }
}

// ===============================
// ACTUALIZACIONES OPTIMIZADAS DE UI
// ===============================
function actualizarTodasLasVistasOptimizado(cambios) {
  // Actualización optimizada: solo re-renderizar elementos afectados
  cambios.forEach(cambio => {
    // Actualizar tarjeta de producto específica
    actualizarTarjetaProducto(cambio.id);
    
    // Actualizar item en carrito si existe
    actualizarItemCarrito(cambio.id);
    
    // Actualizar modal si es el producto actual
    if (modalProductoActual === cambio.id) {
      actualizarModalStock(cambio.id, cambio.stockNuevo);
    }
  });
  
  // Actualizar contador de carrito
  actualizarContadorCarrito();
}

function actualizarTarjetaProducto(productoId) {
  const producto = productos.find(p => p.id === productoId);
  if (!producto) return;
  
  const tarjeta = document.querySelector(`.producto-card[data-id="${productoId}"]`);
  if (!tarjeta) return;
  
  const enCarrito = carrito.find(item => item.id === productoId);
  const stockDisponible = producto.stock;
  const agotado = stockDisponible <= 0;
  const cantidadEnCarrito = enCarrito?.cantidad || 0;
  
  // Actualizar clase de agotado
  tarjeta.classList.toggle('agotado', agotado);
  
  // Actualizar información de stock
  const stockInfo = tarjeta.querySelector('.producto-stock-info');
  if (stockInfo) {
    stockInfo.innerHTML = `
      <span class="stock-disponible ${agotado ? 'sin-stock' : ''}">
        ${agotado ? 'Sin stock' : `Stock: ${stockDisponible}`}
      </span>
      ${cantidadEnCarrito > 0 ? `<span class="en-carrito">En carrito: ${cantidadEnCarrito}</span>` : ''}
    `;
  }
  
  // Actualizar botón
  const boton = tarjeta.querySelector('.boton-agregar');
  if (boton) {
    boton.disabled = agotado;
    boton.textContent = agotado ? 'Agotado' : 'Agregar al carrito';
  }
  
  // Actualizar overlay de agotado
  const overlay = tarjeta.querySelector('.overlay-agotado');
  if (agotado && !overlay) {
    const imagenContainer = tarjeta.querySelector('.producto-imagen-container');
    if (imagenContainer) {
      const nuevoOverlay = document.createElement('div');
      nuevoOverlay.className = 'overlay-agotado';
      nuevoOverlay.textContent = 'AGOTADO';
      imagenContainer.appendChild(nuevoOverlay);
    }
  } else if (!agotado && overlay) {
    overlay.remove();
  }
}

function actualizarItemCarrito(productoId) {
  const itemCarrito = carrito.find(item => item.id === productoId);
  if (!itemCarrito) return;
  
  const elemento = document.querySelector(`.carrito-item[data-id="${productoId}"]`);
  if (!elemento) return;
  
  const producto = productos.find(p => p.id === productoId);
  if (!producto) return;
  
  const stockDisponible = producto.stock;
  const puedeAumentar = stockDisponible > 0;
  
  // Actualizar información de stock disponible
  const stockInfo = elemento.querySelector('.carrito-item-stock-info');
  if (stockInfo) {
    stockInfo.innerHTML = `<small>Stock disponible: ${stockDisponible}</small>`;
  }
  
  // Actualizar botón de aumentar
  const botonAumentar = elemento.querySelector('.aumentar-cantidad');
  if (botonAumentar) {
    botonAumentar.disabled = !puedeAumentar;
    botonAumentar.title = puedeAumentar ? 'Aumentar cantidad' : 'Sin stock disponible';
  }
}

function notificarCambiosCriticos(cambios) {
  cambios.forEach(cambio => {
    if (cambio.stockAnterior > 0 && cambio.stockNuevo === 0) {
      mostrarNotificacion(`⚠️ ${cambio.nombre} se ha agotado`, 'warning');
    } else if (cambio.stockAnterior === 0 && cambio.stockNuevo > 0) {
      mostrarNotificacion(`✅ ${cambio.nombre} ya está disponible`, 'exito');
    }
  });
}

// ===============================
// CARGAR PRODUCTOS DESDE FIREBASE
// ===============================
async function cargarProductosDesdeFirebase() {
  console.log("📦 Cargando productos desde Firebase...");
  
  try {
    const productosRef = ref(db, 'productos');
    const snapshot = await get(productosRef);
    
    if (!snapshot.exists()) {
      console.warn("⚠️ No se encontraron productos en Firebase");
      productos = [];
      renderizarProductos();
      return;
    }

    productos = Object.values(snapshot.val()).map(producto => ({
      ...producto,
      stock: parseInt(producto.stock, 10) || 0
    }));

    console.log(`✅ ${productos.length} productos cargados correctamente`);
    renderizarProductos();
    
  } catch (error) {
    console.error("❌ Error al cargar productos:", error);
    mostrarNotificacion('Error al cargar productos', 'error');
  }
}

// ===============================
// OBTENER STOCK ACTUAL EN TIEMPO REAL
// ===============================
async function obtenerStockActual(productoId) {
  try {
    const stockRef = ref(db, `productos/${productoId}/stock`);
    const snapshot = await get(stockRef);
    return snapshot.exists() ? parseInt(snapshot.val(), 10) || 0 : 0;
  } catch (error) {
    console.error(`❌ Error al obtener stock del producto ${productoId}:`, error);
    return 0;
  }
}

async function validarStockAntesDeOperacion(productoId, cantidadRequerida = 1) {
  const stockActual = await obtenerStockActual(productoId);
  return {
    valido: stockActual >= cantidadRequerida,
    stockDisponible: stockActual,
    cantidadRequerida
  };
}

// ===============================
// GESTIÓN MEJORADA DEL CARRITO
// ===============================
async function agregarAlCarrito(id, cantidadAgregar = 1, boton = null) {
  console.log(`🛒 Intentando agregar ${cantidadAgregar} unidad(es) del producto ${id}`);
  
  // Deshabilitar botón temporalmente para evitar clics duplicados
  if (boton) {
    boton.disabled = true;
    boton.textContent = 'Procesando...';
  }

  try {
    // Validar stock actual antes de proceder
    const validacion = await validarStockAntesDeOperacion(id, cantidadAgregar);
    
    if (!validacion.valido) {
      mostrarNotificacion(`❌ Stock insuficiente. Disponible: ${validacion.stockDisponible}`, "error");
      return;
    }

    const producto = productos.find(p => p.id === id);
    if (!producto) {
      mostrarNotificacion("❌ Producto no encontrado", "error");
      return;
    }

    // Usar transacción para garantizar consistencia
    const stockRef = ref(db, `productos/${id}/stock`);
    const resultado = await runTransaction(stockRef, (stockActual) => {
      const stockNumerico = parseInt(stockActual, 10) || 0;
      
      if (stockNumerico < cantidadAgregar) {
        console.log(`⚠️ Transacción cancelada: stock insuficiente (${stockNumerico} < ${cantidadAgregar})`);
        return; // Abortar transacción
      }
      
      return stockNumerico - cantidadAgregar;
    });

    if (!resultado.committed) {
      mostrarNotificacion("❌ Stock insuficiente", "error");
      return;
    }

    // Actualizar carrito local
    const enCarrito = carrito.find(item => item.id === id);
    if (enCarrito) {
      enCarrito.cantidad += cantidadAgregar;
    } else {
      carrito.push({ 
        ...producto, 
        cantidad: cantidadAgregar,
        precioOriginal: producto.precio // Mantener precio original
      });
    }

    guardarCarrito();
    actualizarContadorCarrito();
    mostrarNotificacion(`✅ ${producto.nombre} agregado al carrito`, "exito");
    
    console.log(`✅ Producto ${id} agregado exitosamente. Nuevo stock: ${resultado.snapshot.val()}`);

  } catch (error) {
    console.error("❌ Error al agregar producto al carrito:", error);
    mostrarNotificacion("⚠️ Error al agregar producto", "error");
  } finally {
    // Restaurar botón
    if (boton) {
      setTimeout(() => {
        actualizarEstadoBoton(boton, id);
      }, 500);
    }
  }
}

async function modificarCantidadCarrito(id, nuevaCantidad) {
  console.log(`🔄 Modificando cantidad del producto ${id} a ${nuevaCantidad}`);
  
  try {
    const itemCarrito = carrito.find(item => item.id === id);
    if (!itemCarrito) {
      console.error("Producto no encontrado en carrito");
      return;
    }

    const diferenciaStock = itemCarrito.cantidad - nuevaCantidad;
    
    if (diferenciaStock !== 0) {
      // Actualizar stock en Firebase
      const stockRef = ref(db, `productos/${id}/stock`);
      
      await runTransaction(stockRef, (stockActual) => {
        const stockNumerico = parseInt(stockActual, 10) || 0;
        return stockNumerico + diferenciaStock; // Devolver diferencia al stock
      });
    }

    if (nuevaCantidad <= 0) {
      // Eliminar del carrito
      carrito = carrito.filter(item => item.id !== id);
      mostrarNotificacion("🗑️ Producto eliminado del carrito", "info");
    } else {
      // Actualizar cantidad
      itemCarrito.cantidad = nuevaCantidad;
    }

    guardarCarrito();
    actualizarContadorCarrito();
    
  } catch (error) {
    console.error("❌ Error al modificar cantidad en carrito:", error);
    mostrarNotificacion("⚠️ Error al actualizar carrito", "error");
  }
}

async function vaciarCarrito() {
  console.log("🗑️ Vaciando carrito y devolviendo stock...");
  
  try {
    // Devolver todo el stock de productos en el carrito
    const promesasStock = carrito.map(async (item) => {
      const stockRef = ref(db, `productos/${item.id}/stock`);
      
      return runTransaction(stockRef, (stockActual) => {
        const stockNumerico = parseInt(stockActual, 10) || 0;
        return stockNumerico + item.cantidad;
      });
    });

    await Promise.all(promesasStock);
    
    carrito = [];
    guardarCarrito();
    actualizarContadorCarrito();
    
    mostrarNotificacion("🗑️ Carrito vaciado", "info");
    console.log("✅ Carrito vaciado y stock devuelto");
    
  } catch (error) {
    console.error("❌ Error al vaciar carrito:", error);
    mostrarNotificacion("⚠️ Error al vaciar carrito", "error");
  }
}

function guardarCarrito() {
  try {
    localStorage.setItem(LS_CARRITO_KEY, JSON.stringify(carrito));
  } catch (error) {
    console.error("❌ Error al guardar carrito:", error);
  }
}

function cargarCarrito() {
  try {
    const carritoGuardado = localStorage.getItem(LS_CARRITO_KEY);
    carrito = carritoGuardado ? JSON.parse(carritoGuardado) : [];
    console.log(`📦 Carrito cargado: ${carrito.length} productos`);
  } catch (error) {
    console.error("❌ Error al cargar carrito:", error);
    carrito = [];
  }
}

function actualizarContadorCarrito() {
  const contador = document.getElementById('contador-carrito');
  if (contador) {
    const totalItems = carrito.reduce((sum, item) => sum + item.cantidad, 0);
    contador.textContent = totalItems;
  }
}

// ===============================
// RENDERIZADO DE CARRITO EN TIEMPO REAL
// ===============================
function renderizarCarrito() {
  const listaCarrito = document.getElementById('lista-carrito');
  const totalCarrito = document.getElementById('total');
  
  if (!listaCarrito || !totalCarrito) return;

  if (carrito.length === 0) {
    listaCarrito.innerHTML = '<p class="carrito-vacio">Tu carrito está vacío</p>';
    totalCarrito.textContent = 'Total: $U 0';
    return;
  }

  listaCarrito.innerHTML = carrito.map(item => {
    const producto = productos.find(p => p.id === item.id);
    
    if (!producto) {
      console.warn(`⚠️ Producto ${item.id} no encontrado en la lista actual`);
      return '';
    }

    const stockDisponible = producto.stock;
    const stockTotal = stockDisponible + item.cantidad; // Stock total (incluyendo el que está en carrito)
    const puedeAumentar = stockDisponible > 0;
    const puedeDisminuir = item.cantidad > 1;

    return `
      <li class="carrito-item" data-id="${item.id}">
        <img src="${producto.imagenes ? producto.imagenes[0] : PLACEHOLDER_IMAGE}" 
             class="carrito-item-img" alt="${producto.nombre}" />
        <div class="carrito-item-info">
          <span class="carrito-item-nombre">${producto.nombre}</span>
          <span class="carrito-item-precio">$U ${producto.precio.toLocaleString('es-UY')}</span>
          <div class="carrito-item-stock-info">
            <small>Stock disponible: ${stockDisponible}</small>
          </div>
          <div class="carrito-item-controls">
            <button class="disminuir-cantidad" data-id="${item.id}" 
                    ${!puedeDisminuir ? 'disabled' : ''} 
                    title="${puedeDisminuir ? 'Disminuir cantidad' : 'Cantidad mínima: 1'}">-</button>
            <span class="carrito-item-cantidad">${item.cantidad}</span>
            <button class="aumentar-cantidad" data-id="${item.id}" 
                    ${!puedeAumentar ? 'disabled' : ''} 
                    title="${puedeAumentar ? 'Aumentar cantidad' : 'Sin stock disponible'}">+</button>
          </div>
          <span class="carrito-item-subtotal">Subtotal: $U ${(item.cantidad * producto.precio).toLocaleString('es-UY')}</span>
          <button class="eliminar-item" data-id="${item.id}" title="Eliminar del carrito">🗑️</button>
        </div>
      </li>`;
  }).join('');

  // Calcular total
  const total = carrito.reduce((sum, item) => {
    const producto = productos.find(p => p.id === item.id);
    return sum + (item.cantidad * (producto?.precio || 0));
  }, 0);

  totalCarrito.textContent = `Total: $U ${total.toLocaleString('es-UY')}`;

  // Configurar eventos de botones del carrito
  configurarEventosCarrito();
}

function configurarEventosCarrito() {
  // Botones de aumentar cantidad
  document.querySelectorAll('.aumentar-cantidad').forEach(boton => {
    boton.addEventListener('click', async (e) => {
      const id = parseInt(e.target.dataset.id, 10);
      const itemCarrito = carrito.find(item => item.id === id);
      
      if (itemCarrito) {
        // Validar stock antes de aumentar
        const validacion = await validarStockAntesDeOperacion(id, 1);
        
        if (validacion.valido) {
          await modificarCantidadCarrito(id, itemCarrito.cantidad + 1);
        } else {
          mostrarNotificacion("❌ No hay más stock disponible", "error");
        }
      }
    });
  });

  // Botones de disminuir cantidad
  document.querySelectorAll('.disminuir-cantidad').forEach(boton => {
    boton.addEventListener('click', async (e) => {
      const id = parseInt(e.target.dataset.id, 10);
      const itemCarrito = carrito.find(item => item.id === id);
      
      if (itemCarrito && itemCarrito.cantidad > 1) {
        await modificarCantidadCarrito(id, itemCarrito.cantidad - 1);
      }
    });
  });

  // Botones de eliminar item
  document.querySelectorAll('.eliminar-item').forEach(boton => {
    boton.addEventListener('click', async (e) => {
      const id = parseInt(e.target.dataset.id, 10);
      await modificarCantidadCarrito(id, 0); // Cantidad 0 = eliminar
    });
  });
}

// ===============================
// RENDERIZADO DE PRODUCTOS EN TIEMPO REAL
// ===============================
function renderizarProductos() {
  const galeriaProductos = document.getElementById('galeria-productos');
  if (!galeriaProductos) return;

  console.log(`🎨 Renderizando ${productos.length} productos...`);

  galeriaProductos.innerHTML = productos.map(producto => {
    const enCarrito = carrito.find(item => item.id === producto.id);
    const stockDisponible = producto.stock;
    const agotado = stockDisponible <= 0;
    const cantidadEnCarrito = enCarrito?.cantidad || 0;

    return `
      <div class="producto-card ${agotado ? 'agotado' : ''}" data-id="${producto.id}">
        <div class="producto-imagen-container" onclick="abrirModal(${producto.id})">
          <img src="${producto.imagenes ? producto.imagenes[0] : PLACEHOLDER_IMAGE}" 
               class="producto-img" alt="${producto.nombre}" />
          ${agotado ? '<div class="overlay-agotado">AGOTADO</div>' : ''}
        </div>
        
        <div class="producto-info">
          <h3 class="producto-nombre">${producto.nombre}</h3>
          <p class="producto-precio">$U ${producto.precio.toLocaleString('es-UY')}</p>
          
          <div class="producto-stock-info">
            <span class="stock-disponible ${agotado ? 'sin-stock' : ''}">
              ${agotado ? 'Sin stock' : `Stock: ${stockDisponible}`}
            </span>
            ${cantidadEnCarrito > 0 ? `<span class="en-carrito">En carrito: ${cantidadEnCarrito}</span>` : ''}
          </div>
          
          <button class="boton-agregar" 
                  data-id="${producto.id}" 
                  ${agotado ? 'disabled' : ''}>
            ${agotado ? 'Agotado' : 'Agregar al carrito'}
          </button>
        </div>
      </div>`;
  }).join('');

  // Configurar eventos de botones de productos
  configurarEventosProductos();
}

function configurarEventosProductos() {
  // Eventos para botones de agregar al carrito
  document.querySelectorAll('.boton-agregar').forEach(boton => {
    boton.addEventListener('click', async (e) => {
      e.stopPropagation(); // Evitar abrir modal
      const id = parseInt(e.target.dataset.id, 10);
      await agregarAlCarrito(id, 1, boton);
    });
  });
}

function actualizarEstadoBoton(boton, productoId) {
  const producto = productos.find(p => p.id === productoId);
  
  if (!producto) {
    boton.disabled = true;
    boton.textContent = 'No disponible';
    return;
  }

  const agotado = producto.stock <= 0;
  boton.disabled = agotado;
  boton.textContent = agotado ? 'Agotado' : 'Agregar al carrito';
  
  // Actualizar clase de la tarjeta
  const card = boton.closest('.producto-card');
  if (card) {
    card.classList.toggle('agotado', agotado);
  }
}

// ===============================
// GESTIÓN DE MODAL DE PRODUCTO EN TIEMPO REAL
// ===============================
async function abrirModal(productoId) {
  console.log(`🔍 Abriendo modal para producto ${productoId}`);
  
  // Obtener datos actuales del producto
  const producto = productos.find(p => p.id === productoId);
  if (!producto) {
    mostrarNotificacion('❌ Producto no encontrado', 'error');
    return;
  }

  // Validar stock actual antes de mostrar modal
  const stockActual = await obtenerStockActual(productoId);
  
  modalProductoActual = productoId;
  modalImagenActual = 0;

  // Actualizar contenido del modal
  document.getElementById('modal-nombre').textContent = producto.nombre;
  document.getElementById('modal-descripcion').textContent = producto.descripcion || 'Sin descripción disponible';
  document.getElementById('modal-precio').textContent = `$U ${producto.precio.toLocaleString('es-UY')}`;
  
  // Configurar imágenes
  const modalImg = document.getElementById('modal-imagen');
  if (producto.imagenes && producto.imagenes.length > 0) {
    modalImg.src = producto.imagenes[0];
    configurarCarruselModal(producto.imagenes);
  } else {
    modalImg.src = PLACEHOLDER_IMAGE;
  }

  // Actualizar información de stock en modal
  actualizarModalStock(productoId, stockActual);
  
  // Mostrar modal
  document.getElementById('producto-modal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function actualizarModalStock(productoId, stockActual = null) {
  if (modalProductoActual !== productoId) return;
  
  const producto = productos.find(p => p.id === productoId);
  if (!producto) return;

  const stock = stockActual !== null ? stockActual : producto.stock;
  const agotado = stock <= 0;
  const enCarrito = carrito.find(item => item.id === productoId);
  const cantidadEnCarrito = enCarrito?.cantidad || 0;

  // Buscar o crear elemento de stock en modal
  let stockInfo = document.getElementById('modal-stock-info');
  if (!stockInfo) {
    stockInfo = document.createElement('div');
    stockInfo.id = 'modal-stock-info';
    stockInfo.className = 'modal-stock-info';
    
    const modalInfo = document.querySelector('.modal-info');
    const precioElement = document.getElementById('modal-precio');
    modalInfo.insertBefore(stockInfo, precioElement.nextSibling);
  }

  stockInfo.innerHTML = `
    <div class="stock-status ${agotado ? 'sin-stock' : 'con-stock'}">
      <span class="stock-label">Stock disponible:</span>
      <span class="stock-cantidad">${agotado ? 'Agotado' : stock}</span>
    </div>
    ${cantidadEnCarrito > 0 ? `<div class="en-carrito-info">Ya tienes ${cantidadEnCarrito} en tu carrito</div>` : ''}
  `;

  // Buscar o crear botón de agregar en modal
  let botonAgregar = document.getElementById('modal-agregar-btn');
  if (!botonAgregar) {
    botonAgregar = document.createElement('button');
    botonAgregar.id = 'modal-agregar-btn';
    botonAgregar.className = 'boton-modal-agregar';
    
    const modalInfo = document.querySelector('.modal-info');
    modalInfo.appendChild(botonAgregar);
    
    botonAgregar.addEventListener('click', async () => {
      await agregarAlCarrito(productoId, 1, botonAgregar);
    });
  }

  botonAgregar.disabled = agotado;
  botonAgregar.textContent = agotado ? 'Agotado' : 'Agregar al carrito';
}

function configurarCarruselModal(imagenes) {
  const modalPrev = document.querySelector('.modal-prev');
  const modalNext = document.querySelector('.modal-next');
  const modalImg = document.getElementById('modal-imagen');

  if (imagenes.length <= 1) {
    modalPrev.style.display = 'none';
    modalNext.style.display = 'none';
    return;
  }

  modalPrev.style.display = 'block';
  modalNext.style.display = 'block';

  modalPrev.onclick = () => {
    modalImagenActual = modalImagenActual > 0 ? modalImagenActual - 1 : imagenes.length - 1;
    modalImg.src = imagenes[modalImagenActual];
  };

  modalNext.onclick = () => {
    modalImagenActual = modalImagenActual < imagenes.length - 1 ? modalImagenActual + 1 : 0;
    modalImg.src = imagenes[modalImagenActual];
  };
}

function cerrarModal() {
  document.getElementById('producto-modal').style.display = 'none';
  document.body.style.overflow = 'auto';
  modalProductoActual = null;
  modalImagenActual = 0;
}

// Hacer la función global para el HTML
window.cerrarModal = cerrarModal;
window.abrirModal = abrirModal;

// ===============================
// CONFIGURACIÓN DE EVENTOS DE UI
// ===============================
function configurarEventosUI() {
  console.log("🎮 Configurando eventos de UI...");

  // Botón principal del carrito
  const carritoBtn = document.getElementById('carrito-btn-main');
  if (carritoBtn) {
    carritoBtn.addEventListener('click', () => {
      const carritoPanel = document.getElementById('carrito-panel');
      const overlay = document.querySelector('.carrito-overlay');
      
      if (carritoPanel && overlay) {
        carritoPanel.classList.add('activo');
        overlay.classList.add('activo');
        document.body.style.overflow = 'hidden';
      }
    });
  }

  // Botón cerrar carrito
  const cerrarCarrito = document.querySelector('.cerrar-carrito');
  if (cerrarCarrito) {
    cerrarCarrito.addEventListener('click', cerrarPanelCarrito);
  }

  // Overlay del carrito
  const overlay = document.querySelector('.carrito-overlay');
  if (overlay) {
    overlay.addEventListener('click', cerrarPanelCarrito);
  }

  // Botón vaciar carrito
  const vaciarBtn = document.querySelector('.boton-vaciar-carrito');
  if (vaciarBtn) {
    vaciarBtn.addEventListener('click', async () => {
      if (carrito.length === 0) {
        mostrarNotificacion('El carrito ya está vacío', 'info');
        return;
      }
      
      if (confirm('¿Estás seguro de que quieres vaciar el carrito?')) {
        await vaciarCarrito();
      }
    });
  }

  // Botón finalizar compra
  const finalizarBtn = document.querySelector('.boton-finalizar-compra');
  if (finalizarBtn) {
    finalizarBtn.addEventListener('click', () => {
      if (carrito.length === 0) {
        mostrarNotificacion('Tu carrito está vacío', 'warning');
        return;
      }
      
      // Aquí iría la lógica de finalizar compra
      mostrarNotificacion('Función de compra en desarrollo', 'info');
    });
  }

  // Cerrar modal con tecla Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (modalProductoActual) {
        cerrarModal();
      }
      if (document.getElementById('carrito-panel').classList.contains('activo')) {
        cerrarPanelCarrito();
      }
    }
  });
}

function cerrarPanelCarrito() {
  const carritoPanel = document.getElementById('carrito-panel');
  const overlay = document.querySelector('.carrito-overlay');
  
  if (carritoPanel && overlay) {
    carritoPanel.classList.remove('activo');
    overlay.classList.remove('activo');
    document.body.style.overflow = 'auto';
  }
}

// ===============================
// FUNCIONES AUXILIARES
// ===============================
function mostrarNotificacion(mensaje, tipo = 'exito') {
  const noti = document.createElement('div');
  noti.className = `notificacion ${tipo}`;
  noti.textContent = mensaje;
  
  // Agregar icono según el tipo
  const iconos = {
    'exito': '✅',
    'error': '❌',
    'warning': '⚠️',
    'info': 'ℹ️'
  };
  
  if (iconos[tipo]) {
    noti.textContent = `${iconos[tipo]} ${mensaje}`;
  }
  
  document.body.appendChild(noti);
  
  // Mostrar con animación
  setTimeout(() => noti.classList.add('show'), 10);
  
  // Ocultar después de un tiempo
  setTimeout(() => {
    noti.classList.remove('show');
    setTimeout(() => noti.remove(), 300);
  }, 3000);
}

// ===============================
// GESTIÓN DE LIMPIEZA DE RECURSOS
// ===============================
function limpiarListeners() {
  console.log("🧹 Limpiando listeners...");
  
  if (globalStockListener) {
    off(ref(db, 'productos'), 'value', globalStockListener);
  }
  
  stockListeners.forEach((listener, productoId) => {
    off(ref(db, `productos/${productoId}/stock`), 'value', listener);
  });
  
  stockListeners.clear();
}

// Limpiar listeners cuando se cierra la ventana
window.addEventListener('beforeunload', limpiarListeners);

// ===============================
// INICIALIZACIÓN FINAL Y CARGA DE CARRITO
// ===============================
// Inicializar contador de carrito al cargar
document.addEventListener('DOMContentLoaded', () => {
  actualizarContadorCarrito();
});
