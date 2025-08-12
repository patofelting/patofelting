/* =========================================================
   Blog Patofelting - Theme Manager & Gamification System
   Gestión de temas, gamificación social, badges y logros
========================================================= */

class PatofeltingThemeManager {
  constructor() {
    this.currentSkin = localStorage.getItem('pf_current_skin') || 'cuaderno';
    this.userPoints = parseInt(localStorage.getItem('pf_user_points') || '0');
    this.userBadges = JSON.parse(localStorage.getItem('pf_user_badges') || '[]');
    this.userStats = JSON.parse(localStorage.getItem('pf_user_stats') || '{}');
    this.achievements = this.initializeAchievements();
    this.leaderboard = JSON.parse(localStorage.getItem('pf_leaderboard') || '[]');
    
    this.init();
  }

  init() {
    this.applySkin(this.currentSkin);
    this.createSkinSelector();
    this.initTimeBasedShadows();
    this.initScrollYarnEffect();
    this.initGamificationUI();
    this.initMicrointeractions();
    this.setupEventListeners();
    this.updateUserStats('pageViews', 1);
  }

  /* ===== SISTEMA DE SKINS ===== */
  applySkin(skinName) {
    document.documentElement.setAttribute('data-skin', skinName);
    document.documentElement.setAttribute('data-skin-transitioning', 'true');
    
    setTimeout(() => {
      document.documentElement.removeAttribute('data-skin-transitioning');
    }, 400);
    
    this.currentSkin = skinName;
    localStorage.setItem('pf_current_skin', skinName);
    this.awardPoints(5, 'Cambio de tema');
    this.checkAchievements();
  }

  createSkinSelector() {
    const selector = document.createElement('div');
    selector.className = 'skin-selector';
    selector.innerHTML = `
      <div class="skin-selector-label">🎨 Temas</div>
      <div class="skin-option" data-skin="cuaderno">
        <div class="skin-preview cuaderno"></div>
        <span>Cuaderno</span>
      </div>
      <div class="skin-option" data-skin="acuarela">
        <div class="skin-preview acuarela"></div>
        <span>Acuarela</span>
      </div>
      <div class="skin-option" data-skin="tejido">
        <div class="skin-preview tejido"></div>
        <span>Tejido</span>
      </div>
    `;

    // Marcar el tema actual como activo
    selector.querySelector(`[data-skin="${this.currentSkin}"]`).classList.add('active');

    // Event listeners para cambio de tema
    selector.querySelectorAll('.skin-option').forEach(option => {
      option.addEventListener('click', () => {
        const skin = option.dataset.skin;
        this.applySkin(skin);
        
        // Actualizar UI
        selector.querySelectorAll('.skin-option').forEach(opt => opt.classList.remove('active'));
        option.classList.add('active');
      });
    });

    document.body.appendChild(selector);
  }

  /* ===== SOMBRAS DINÁMICAS SEGÚN HORA ===== */
  initTimeBasedShadows() {
    const updateShadows = () => {
      const hour = new Date().getHours();
      const body = document.body;
      
      // Remover clases anteriores
      body.classList.remove('time-morning', 'time-noon', 'time-evening', 'time-night');
      
      if (hour >= 6 && hour < 10) {
        body.classList.add('time-morning');
      } else if (hour >= 10 && hour < 16) {
        body.classList.add('time-noon');
      } else if (hour >= 16 && hour < 20) {
        body.classList.add('time-evening');
      } else {
        body.classList.add('time-night');
      }
    };

    updateShadows();
    // Actualizar cada 30 minutos
    setInterval(updateShadows, 30 * 60 * 1000);
  }

  /* ===== EFECTO DE LANA AL SCROLL ===== */
  initScrollYarnEffect() {
    const indicator = document.createElement('div');
    indicator.className = 'yarn-scroll-indicator';
    
    const yarnBall = document.createElement('div');
    yarnBall.className = 'yarn-ball-unwinding';
    
    document.body.appendChild(indicator);
    document.body.appendChild(yarnBall);

    let isScrolling = false;
    let scrollTimeout;

    window.addEventListener('scroll', () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercent = scrollTop / documentHeight;

      // Actualizar indicador de progreso
      indicator.style.scale = `${scrollPercent} 1`;
      
      // Actualizar longitud del hilo
      const trailLength = Math.min(scrollPercent * 200, 150);
      yarnBall.style.setProperty('--yarn-trail-length', `${trailLength}px`);

      // Mostrar indicadores durante scroll
      if (!isScrolling) {
        isScrolling = true;
        indicator.style.opacity = '1';
        yarnBall.style.opacity = '1';
      }

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        isScrolling = false;
        indicator.style.opacity = '0.7';
        yarnBall.style.opacity = '0.7';
      }, 1000);

      // Gamificación: puntos por scroll
      if (scrollPercent > 0.8 && !this.userStats.pageFullyRead) {
        this.updateUserStats('pageFullyRead', true);
        this.awardPoints(10, 'Lectura completa');
      }
    });
  }

  /* ===== MICROINTERACCIONES ===== */
  initMicrointeractions() {
    // Efecto de reacción en botones
    document.addEventListener('click', (e) => {
      if (e.target.matches('.reaction-btn')) {
        e.target.classList.add('clicked');
        setTimeout(() => e.target.classList.remove('clicked'), 1000);
        this.awardPoints(2, 'Reacción');
      }
    });

    // Efecto de aguja en títulos
    document.querySelectorAll('.entry-title').forEach(title => {
      title.addEventListener('mouseenter', () => {
        this.updateUserStats('titleHovers', 1);
      });
    });

    // Comentarios como post-its mejorados
    this.enhanceComments();
  }

  enhanceComments() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1 && node.matches('.comment-item')) {
              this.enhanceCommentItem(node);
            }
          });
        }
      });
    });

    document.querySelectorAll('.comments-list').forEach(list => {
      observer.observe(list, { childList: true });
      
      // Mejorar comentarios existentes
      list.querySelectorAll('.comment-item').forEach(item => {
        this.enhanceCommentItem(item);
      });
    });
  }

  enhanceCommentItem(commentItem) {
    if (commentItem.dataset.enhanced) return;
    
    commentItem.dataset.enhanced = 'true';
    
    // Agregar efecto de post-it movible
    let isDragging = false;
    let currentX = 0;
    let currentY = 0;
    let initialX = 0;
    let initialY = 0;

    commentItem.addEventListener('mousedown', (e) => {
      if (e.target.closest('.comment-del')) return;
      
      isDragging = true;
      initialX = e.clientX - currentX;
      initialY = e.clientY - currentY;
      commentItem.style.cursor = 'grabbing';
      commentItem.style.zIndex = '1000';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;
      
      commentItem.style.transform = `translate(${currentX}px, ${currentY}px) rotate(${Math.sin(currentX * 0.01) * 2}deg)`;
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      
      isDragging = false;
      commentItem.style.cursor = 'pointer';
      commentItem.style.zIndex = '';
      
      // Animación de regreso suave
      setTimeout(() => {
        commentItem.style.transition = 'transform 0.3s ease-out';
        commentItem.style.transform = 'translate(0, 0) rotate(0deg)';
        setTimeout(() => {
          commentItem.style.transition = '';
          currentX = 0;
          currentY = 0;
        }, 300);
      }, 100);
    });
  }

  /* ===== SISTEMA DE GAMIFICACIÓN ===== */
  initializeAchievements() {
    return {
      'first_visit': { name: 'Primera Visita', description: 'Bienvenido al blog de Patofelting', points: 10, icon: '👋' },
      'theme_explorer': { name: 'Explorador de Temas', description: 'Probaste todos los temas disponibles', points: 50, icon: '🎨' },
      'active_reader': { name: 'Lector Activo', description: 'Leíste 5 artículos completos', points: 100, icon: '📚' },
      'comment_contributor': { name: 'Contribuidor', description: 'Dejaste tu primer comentario', points: 25, icon: '💬' },
      'reaction_enthusiast': { name: 'Entusiasta', description: 'Diste 20 reacciones', points: 40, icon: '🧶' },
      'theme_master': { name: 'Maestro del Tema', description: 'Cambiaste de tema 10 veces', points: 75, icon: '🏆' },
      'night_owl': { name: 'Búho Nocturno', description: 'Visitaste el blog después de medianoche', points: 30, icon: '🦉' },
      'early_bird': { name: 'Madrugador', description: 'Visitaste el blog antes de las 6 AM', points: 30, icon: '🌅' },
      'scroll_master': { name: 'Maestro del Scroll', description: 'Llegaste al final de 10 artículos', points: 60, icon: '📜' }
    };
  }

  checkAchievements() {
    const hour = new Date().getHours();
    
    // Achievement: Primera visita
    if (!this.userBadges.includes('first_visit')) {
      this.unlockAchievement('first_visit');
    }

    // Achievement: Búho nocturno
    if (hour >= 0 && hour < 6 && !this.userBadges.includes('night_owl')) {
      this.unlockAchievement('night_owl');
    }

    // Achievement: Madrugador
    if (hour >= 5 && hour < 7 && !this.userBadges.includes('early_bird')) {
      this.unlockAchievement('early_bird');
    }

    // Achievement: Explorador de temas
    const themesUsed = JSON.parse(localStorage.getItem('pf_themes_used') || '[]');
    if (!themesUsed.includes(this.currentSkin)) {
      themesUsed.push(this.currentSkin);
      localStorage.setItem('pf_themes_used', JSON.stringify(themesUsed));
    }
    if (themesUsed.length >= 3 && !this.userBadges.includes('theme_explorer')) {
      this.unlockAchievement('theme_explorer');
    }

    // Achievement: Maestro del tema
    const themeChanges = parseInt(localStorage.getItem('pf_theme_changes') || '0') + 1;
    localStorage.setItem('pf_theme_changes', themeChanges.toString());
    if (themeChanges >= 10 && !this.userBadges.includes('theme_master')) {
      this.unlockAchievement('theme_master');
    }

    // Otros achievements basados en stats
    if ((this.userStats.pageFullyReadCount || 0) >= 5 && !this.userBadges.includes('active_reader')) {
      this.unlockAchievement('active_reader');
    }

    if ((this.userStats.reactionsGiven || 0) >= 20 && !this.userBadges.includes('reaction_enthusiast')) {
      this.unlockAchievement('reaction_enthusiast');
    }

    if ((this.userStats.pageFullyReadCount || 0) >= 10 && !this.userBadges.includes('scroll_master')) {
      this.unlockAchievement('scroll_master');
    }
  }

  unlockAchievement(achievementId) {
    if (this.userBadges.includes(achievementId)) return;

    const achievement = this.achievements[achievementId];
    this.userBadges.push(achievementId);
    localStorage.setItem('pf_user_badges', JSON.stringify(this.userBadges));
    
    this.awardPoints(achievement.points, `Logro: ${achievement.name}`);
    this.showAchievementNotification(achievement);
  }

  showAchievementNotification(achievement) {
    const notification = document.createElement('div');
    notification.className = 'achievement-notification';
    notification.innerHTML = `
      <div class="achievement-icon">${achievement.icon}</div>
      <div class="achievement-content">
        <div class="achievement-title">¡Logro desbloqueado!</div>
        <div class="achievement-name">${achievement.name}</div>
        <div class="achievement-points">+${achievement.points} puntos</div>
      </div>
    `;

    // Estilos inline para la notificación
    Object.assign(notification.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      background: 'linear-gradient(135deg, #43c160, #b4f1d9)',
      color: 'white',
      padding: '1rem 1.5rem',
      borderRadius: '15px',
      boxShadow: '0 8px 25px rgba(67, 193, 96, 0.3)',
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      zIndex: '10000',
      animation: 'slideInRight 0.5s ease-out, slideOutRight 0.5s ease-out 3s forwards',
      fontSize: '0.9rem',
      maxWidth: '300px'
    });

    // Inyectar animaciones CSS si no existen
    if (!document.querySelector('#achievement-animations')) {
      const style = document.createElement('style');
      style.id = 'achievement-animations';
      style.textContent = `
        @keyframes slideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 4000);
  }

  awardPoints(points, reason) {
    this.userPoints += points;
    localStorage.setItem('pf_user_points', this.userPoints.toString());
    
    this.updateLeaderboard();
    this.showPointsNotification(points, reason);
  }

  showPointsNotification(points, reason) {
    // Mostrar brevemente los puntos ganados
    const pointsEl = document.querySelector('.user-points');
    if (pointsEl) {
      pointsEl.style.animation = 'pointsGain 0.5s ease-out';
      setTimeout(() => {
        pointsEl.style.animation = '';
        pointsEl.textContent = `${this.userPoints} puntos`;
      }, 500);
    }
  }

  updateUserStats(stat, value) {
    if (typeof value === 'number') {
      this.userStats[stat] = (this.userStats[stat] || 0) + value;
    } else {
      this.userStats[stat] = value;
    }
    
    // Actualizar contadores especiales
    if (stat === 'pageFullyRead' && value === true) {
      this.userStats.pageFullyReadCount = (this.userStats.pageFullyReadCount || 0) + 1;
    }
    
    localStorage.setItem('pf_user_stats', JSON.stringify(this.userStats));
    this.checkAchievements();
  }

  updateLeaderboard() {
    const userName = localStorage.getItem('pf_user_name') || 'Visitante Anónimo';
    let userEntry = this.leaderboard.find(entry => entry.name === userName);
    
    if (userEntry) {
      userEntry.points = this.userPoints;
      userEntry.badges = this.userBadges.length;
    } else {
      this.leaderboard.push({
        name: userName,
        points: this.userPoints,
        badges: this.userBadges.length,
        joinDate: new Date().toISOString()
      });
    }
    
    this.leaderboard.sort((a, b) => b.points - a.points);
    this.leaderboard = this.leaderboard.slice(0, 10); // Top 10
    
    localStorage.setItem('pf_leaderboard', JSON.stringify(this.leaderboard));
  }

  initGamificationUI() {
    this.createUserPanel();
    this.createBadgesPanel();
  }

  createUserPanel() {
    const panel = document.createElement('div');
    panel.className = 'user-gamification-panel';
    panel.innerHTML = `
      <div class="user-points">${this.userPoints} puntos</div>
      <div class="user-badges-count">${this.userBadges.length} logros</div>
      <button class="show-achievements-btn">🏆 Ver logros</button>
    `;

    Object.assign(panel.style, {
      position: 'fixed',
      bottom: '20px',
      left: '20px',
      background: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(10px)',
      borderRadius: '15px',
      padding: '1rem',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
      zIndex: '1000',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      minWidth: '150px',
      fontSize: '0.9rem'
    });

    panel.querySelector('.show-achievements-btn').addEventListener('click', () => {
      this.showAchievementsModal();
    });

    document.body.appendChild(panel);
  }

  createBadgesPanel() {
    if (this.userBadges.length === 0) return;

    const panel = document.createElement('div');
    panel.className = 'badges-quick-view';
    panel.innerHTML = `
      <div class="badges-title">Logros recientes:</div>
      <div class="badges-list">
        ${this.userBadges.slice(-3).map(badgeId => {
          const achievement = this.achievements[badgeId];
          return `<span class="badge-icon" title="${achievement.name}">${achievement.icon}</span>`;
        }).join('')}
      </div>
    `;

    Object.assign(panel.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      background: 'rgba(255, 255, 255, 0.95)',
      backdropFilter: 'blur(10px)',
      borderRadius: '15px',
      padding: '1rem',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
      zIndex: '1000',
      fontSize: '0.8rem',
      maxWidth: '200px'
    });

    document.body.appendChild(panel);
  }

  showAchievementsModal() {
    const modal = document.createElement('div');
    modal.className = 'achievements-modal';
    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <div class="modal-header">
          <h2>🏆 Tus Logros</h2>
          <button class="modal-close">×</button>
        </div>
        <div class="achievements-grid">
          ${Object.keys(this.achievements).map(id => {
            const achievement = this.achievements[id];
            const unlocked = this.userBadges.includes(id);
            return `
              <div class="achievement-card ${unlocked ? 'unlocked' : 'locked'}">
                <div class="achievement-icon">${unlocked ? achievement.icon : '🔒'}</div>
                <div class="achievement-name">${achievement.name}</div>
                <div class="achievement-description">${achievement.description}</div>
                <div class="achievement-points">${achievement.points} puntos</div>
              </div>
            `;
          }).join('')}
        </div>
        <div class="modal-footer">
          <div class="user-summary">
            <strong>Total: ${this.userPoints} puntos • ${this.userBadges.length}/${Object.keys(this.achievements).length} logros</strong>
          </div>
        </div>
      </div>
    `;

    // Estilos para el modal
    const style = document.createElement('style');
    style.textContent = `
      .achievements-modal {
        position: fixed;
        inset: 0;
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
      }
      .modal-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(5px);
      }
      .modal-content {
        background: white;
        border-radius: 20px;
        padding: 2rem;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        position: relative;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
      }
      .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.5rem;
      }
      .modal-close {
        background: none;
        border: none;
        font-size: 2rem;
        cursor: pointer;
        padding: 0;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .achievements-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1rem;
        margin-bottom: 1.5rem;
      }
      .achievement-card {
        padding: 1rem;
        border-radius: 10px;
        text-align: center;
        border: 2px solid #e0e0e0;
        transition: all 0.3s ease;
      }
      .achievement-card.unlocked {
        border-color: var(--primary-green);
        background: linear-gradient(135deg, #f0fff0, #e8f5e8);
      }
      .achievement-card.locked {
        opacity: 0.5;
        background: #f5f5f5;
      }
      .achievement-icon {
        font-size: 2rem;
        margin-bottom: 0.5rem;
      }
      .achievement-name {
        font-weight: bold;
        margin-bottom: 0.5rem;
        color: var(--dark-green);
      }
      .achievement-description {
        font-size: 0.9rem;
        color: var(--pencil-gray);
        margin-bottom: 0.5rem;
      }
      .achievement-points {
        font-weight: bold;
        color: var(--primary-green);
      }
      .modal-footer {
        text-align: center;
        padding-top: 1rem;
        border-top: 1px solid #e0e0e0;
      }
    `;
    document.head.appendChild(style);

    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());
    modal.querySelector('.modal-close').addEventListener('click', () => modal.remove());

    document.body.appendChild(modal);
  }

  setupEventListeners() {
    // Eventos para comentarios
    document.addEventListener('submit', (e) => {
      if (e.target.matches('.comment-form')) {
        this.updateUserStats('commentsPosted', 1);
        this.awardPoints(15, 'Nuevo comentario');
        
        if (!this.userBadges.includes('comment_contributor')) {
          this.unlockAchievement('comment_contributor');
        }
      }
    });

    // Eventos para reacciones
    document.addEventListener('click', (e) => {
      if (e.target.matches('.reaction-btn') || e.target.closest('.reaction-btn')) {
        this.updateUserStats('reactionsGiven', 1);
      }
    });
  }

  /* ===== API PÚBLICA ===== */
  getCurrentSkin() {
    return this.currentSkin;
  }

  getUserPoints() {
    return this.userPoints;
  }

  getUserBadges() {
    return this.userBadges;
  }

  getUserStats() {
    return this.userStats;
  }

  // Método para exportar datos de gamificación (útil para admin)
  exportGamificationData() {
    return {
      points: this.userPoints,
      badges: this.userBadges,
      stats: this.userStats,
      achievements: this.achievements,
      leaderboard: this.leaderboard,
      currentSkin: this.currentSkin
    };
  }
}

// Inicialización cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.patofeltingTheme = new PatofeltingThemeManager();
  });
} else {
  window.patofeltingTheme = new PatofeltingThemeManager();
}