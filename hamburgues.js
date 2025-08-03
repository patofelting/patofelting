// Función principal para inicializar el menú hamburguesa
function initMobileMenu() {
  const hamburguesa = document.getElementById('hamburguesa-btn');
  const menu = document.getElementById('menu');

  // Si no existen los elementos, salimos
  if (!hamburguesa || !menu) return;

  // Función para alternar el estado del menú
  const toggleMenu = () => {
    hamburguesa.classList.toggle('activo');
    menu.classList.toggle('menu-activo');
    document.body.classList.toggle('no-scroll');
  };

  // Evento click en el botón hamburguesa
  hamburguesa.addEventListener('click', (e) => {
    e.stopPropagation(); // Evita que el evento se propague
    toggleMenu();
  });

  // Cierra el menú al hacer clic en un enlace
  menu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      if (menu.classList.contains('menu-activo')) {
        toggleMenu();
      }
    });
  });

  // Cierra el menú al hacer clic fuera
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target) && !hamburguesa.contains(e.target) && menu.classList.contains('menu-activo')) {
      toggleMenu();
    }
  });

  // Cierra el menú al cambiar el tamaño de la pantalla
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768 && menu.classList.contains('menu-activo')) {
      toggleMenu();
    }
  });
}

// Inicialización cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', initMobileMenu);