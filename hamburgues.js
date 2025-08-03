function initMobileMenu() {
  const hamburguesa = document.getElementById('hamburguesa-btn');
  const menu = document.getElementById('menu');
  if (!hamburguesa || !menu) return;

  const toggleMenu = () => {
    hamburguesa.classList.toggle('activo');
    menu.classList.toggle('menu-activo');
    document.body.classList.toggle('menu-abierto', menu.classList.contains('menu-activo'));
  };

  hamburguesa.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMenu();
  });

  menu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      if (menu.classList.contains('menu-activo')) {
        toggleMenu();
      }
    });
  });

  // SOLO cierra si el click es fuera del nav, menú y hamburguesa
  document.addEventListener('click', (e) => {
    if (
      !menu.contains(e.target) &&
      !hamburguesa.contains(e.target) &&
      !e.target.closest('.nav') &&
      menu.classList.contains('menu-activo')
    ) {
      toggleMenu();
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768 && menu.classList.contains('menu-activo')) {
      toggleMenu();
    }
  });
}
document.addEventListener('DOMContentLoaded', initMobileMenu);
