function initMobileMenu() {
  const hamburguesa = document.getElementById('hamburguesa-btn');
  const menu = document.getElementById('menu');
  if (!hamburguesa || !menu) return;

  // Alterna el menú y el scroll
  const toggleMenu = () => {
    hamburguesa.classList.toggle('activo');
    menu.classList.toggle('menu-activo');
    document.body.classList.toggle('menu-abierto', menu.classList.contains('menu-activo'));
  };

  // Abre/cierra el menú con el botón
  hamburguesa.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMenu();
  });

  // Cierra el menú al hacer click en un enlace
  menu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      if (menu.classList.contains('menu-activo')) {
        toggleMenu();
      }
    });
  });

  // SOLO cierra el menú si el click fue realmente afuera
  document.addEventListener('pointerdown', (e) => {
    // Si el menú NO está abierto, no hace nada
    if (!menu.classList.contains('menu-activo')) return;
    // Si el click fue dentro del menú o el botón, no cierra
    if (menu.contains(e.target) || hamburguesa.contains(e.target)) return;
    toggleMenu();
  });

  // Cierra el menú al cambiar el tamaño de la pantalla (>768px)
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768 && menu.classList.contains('menu-activo')) {
      toggleMenu();
    }
  });
}
document.addEventListener('DOMContentLoaded', initMobileMenu);
