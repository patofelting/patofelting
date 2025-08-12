/* =========================================================
   Blog Patofelting - Admin Panel JavaScript
   Panel de administración para gestión del blog
========================================================= */

class PatofeltingAdminPanel {
  constructor() {
    this.hasFirebase = !!(window.firebaseCompatDb && window.firebaseCompatAuth);
    this.currentSection = 'dashboard';
    this.isAdmin = localStorage.getItem('pf_admin') === '1';
    this.allComments = {};
    this.allUsers = {};
    this.stats = {};
    
    this.init();
  }

  init() {
    // Verificar permisos de administrador
    if (!this.isAdmin) {
      this.showAdminLoginPrompt();
      return;
    }

    this.setupNavigation();
    this.loadAllData();
    this.setupEventListeners();
    this.updateLastUpdateTime();
    
    // Actualizar datos cada 30 segundos
    setInterval(() => this.loadAllData(), 30000);
  }

  showAdminLoginPrompt() {
    const password = prompt('Ingresá la contraseña de administrador:');
    
    // Contraseña simple para demo (en producción usar Firebase Auth)
    if (password === 'patofelting2024') {
      localStorage.setItem('pf_admin', '1');
      this.isAdmin = true;
      this.init();
    } else {
      alert('Contraseña incorrecta. Redirigiendo al blog...');
      window.location.href = 'blog.html';
    }
  }

  setupNavigation() {
    const navButtons = document.querySelectorAll('.admin-nav-btn[data-section]');
    const sections = document.querySelectorAll('.admin-section');

    navButtons.forEach(button => {
      button.addEventListener('click', () => {
        const sectionId = button.dataset.section;
        
        // Actualizar botones
        navButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        
        // Mostrar sección correspondiente
        sections.forEach(section => section.classList.remove('active'));
        document.getElementById(sectionId).classList.add('active');
        
        this.currentSection = sectionId;
        this.loadSectionData(sectionId);
      });
    });
  }

  async loadAllData() {
    try {
      await Promise.all([
        this.loadComments(),
        this.loadUsers(),
        this.loadStats()
      ]);
      
      this.updateDashboard();
      this.loadSectionData(this.currentSection);
      
    } catch (error) {
      console.error('Error cargando datos:', error);
      this.showAlert('Error al cargar los datos', 'error');
    }
  }

  async loadComments() {
    this.allComments = {};
    
    if (this.hasFirebase) {
      // Cargar desde Firebase
      try {
        const snapshot = await window.firebaseCompatDb.ref('/blog/comments').get();
        this.allComments = snapshot.val() || {};
      } catch (error) {
        console.warn('Error cargando desde Firebase, usando localStorage:', error);
        this.loadCommentsFromLocalStorage();
      }
    } else {
      this.loadCommentsFromLocalStorage();
    }
  }

  loadCommentsFromLocalStorage() {
    // Buscar todas las entradas de comentarios en localStorage
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('pf_comments_') && key.endsWith('_v2')) {
        const entryId = key.replace('pf_comments_', '').replace('_v2', '');
        const comments = JSON.parse(localStorage.getItem(key) || '[]');
        
        if (comments.length > 0) {
          this.allComments[entryId] = {};
          comments.forEach(comment => {
            this.allComments[entryId][comment.id] = comment;
          });
        }
      }
    });
  }

  async loadUsers() {
    // Cargar datos de usuarios desde localStorage y gamificación
    this.allUsers = {};
    
    const leaderboard = JSON.parse(localStorage.getItem('pf_leaderboard') || '[]');
    const userStats = JSON.parse(localStorage.getItem('pf_user_stats') || '{}');
    const userBadges = JSON.parse(localStorage.getItem('pf_user_badges') || '[]');
    const userPoints = parseInt(localStorage.getItem('pf_user_points') || '0');
    
    // Combinar datos de usuarios
    leaderboard.forEach(user => {
      this.allUsers[user.name] = {
        ...user,
        stats: userStats,
        badges: userBadges,
        totalPoints: userPoints
      };
    });
    
    // Si no hay datos en leaderboard, crear entrada para usuario actual
    if (leaderboard.length === 0 && userPoints > 0) {
      const userName = localStorage.getItem('pf_user_name') || 'Usuario Anónimo';
      this.allUsers[userName] = {
        name: userName,
        points: userPoints,
        badges: userBadges.length,
        stats: userStats,
        totalPoints: userPoints,
        joinDate: new Date().toISOString()
      };
    }
  }

  async loadStats() {
    // Calcular estadísticas generales
    let totalComments = 0;
    let totalReactions = 0;
    let totalUsers = Object.keys(this.allUsers).length;
    let totalPoints = 0;

    // Contar comentarios
    Object.values(this.allComments).forEach(entryComments => {
      totalComments += Object.keys(entryComments).length;
    });

    // Contar reacciones desde localStorage
    const reactions = JSON.parse(localStorage.getItem('pf_reactions_v2') || '{}');
    Object.values(reactions).forEach(entryReactions => {
      Object.values(entryReactions).forEach(count => {
        if (typeof count === 'number') {
          totalReactions += count;
        }
      });
    });

    // Contar puntos totales
    Object.values(this.allUsers).forEach(user => {
      totalPoints += user.totalPoints || user.points || 0;
    });

    this.stats = {
      totalComments,
      totalReactions,
      totalUsers,
      totalPoints,
      lastUpdate: new Date().toISOString()
    };
  }

  updateDashboard() {
    // Actualizar tarjetas de estadísticas
    document.getElementById('total-comments').textContent = this.stats.totalComments;
    document.getElementById('total-reactions').textContent = this.stats.totalReactions;
    document.getElementById('total-users').textContent = this.stats.totalUsers;
    document.getElementById('total-points').textContent = this.stats.totalPoints;

    // Actualizar actividad reciente
    this.updateRecentActivity();
  }

  updateRecentActivity() {
    const recentActivityEl = document.getElementById('recent-activity');
    const recentComments = [];

    // Obtener comentarios recientes (últimos 5)
    Object.entries(this.allComments).forEach(([entryId, comments]) => {
      Object.values(comments).forEach(comment => {
        recentComments.push({
          ...comment,
          entryId,
          type: 'comment'
        });
      });
    });

    recentComments.sort((a, b) => b.timestamp - a.timestamp);
    const recent5 = recentComments.slice(0, 5);

    if (recent5.length === 0) {
      recentActivityEl.innerHTML = '<p>No hay actividad reciente.</p>';
      return;
    }

    const activityHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Usuario</th>
            <th>Contenido</th>
            <th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          ${recent5.map(activity => `
            <tr>
              <td>💬 Comentario</td>
              <td>${activity.name}</td>
              <td>${this.truncateText(activity.text, 50)}</td>
              <td>${this.formatDate(activity.timestamp)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    recentActivityEl.innerHTML = activityHTML;
  }

  loadSectionData(sectionId) {
    switch (sectionId) {
      case 'dashboard':
        this.updateDashboard();
        break;
      case 'comments':
        this.loadCommentsSection();
        break;
      case 'users':
        this.loadUsersSection();
        break;
      case 'settings':
        this.loadSettingsSection();
        break;
      case 'export':
        this.loadExportSection();
        break;
    }
  }

  loadCommentsSection() {
    const commentsListEl = document.getElementById('comments-list');
    const filterEl = document.getElementById('comment-filter');
    
    // Actualizar filtro de entradas
    this.updateCommentFilter();
    
    // Mostrar todos los comentarios
    this.displayComments();
  }

  updateCommentFilter() {
    const filterEl = document.getElementById('comment-filter');
    const currentValue = filterEl.value;
    
    filterEl.innerHTML = '<option value="">Todas las entradas</option>';
    
    Object.keys(this.allComments).forEach(entryId => {
      const option = document.createElement('option');
      option.value = entryId;
      option.textContent = `Entrada ${entryId}`;
      filterEl.appendChild(option);
    });
    
    filterEl.value = currentValue;
    filterEl.addEventListener('change', () => this.displayComments());
  }

  displayComments() {
    const commentsListEl = document.getElementById('comments-list');
    const filterValue = document.getElementById('comment-filter').value;
    const allComments = [];

    // Recopilar comentarios según filtro
    Object.entries(this.allComments).forEach(([entryId, comments]) => {
      if (!filterValue || entryId === filterValue) {
        Object.values(comments).forEach(comment => {
          allComments.push({
            ...comment,
            entryId
          });
        });
      }
    });

    if (allComments.length === 0) {
      commentsListEl.innerHTML = '<p>No hay comentarios para mostrar.</p>';
      return;
    }

    // Ordenar por fecha descendente
    allComments.sort((a, b) => b.timestamp - a.timestamp);

    const commentsHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Entrada</th>
            <th>Usuario</th>
            <th>Comentario</th>
            <th>Votos</th>
            <th>Fecha</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${allComments.map(comment => `
            <tr>
              <td>Entrada ${comment.entryId}</td>
              <td>
                ${comment.isAdminReply ? '👑 ' : ''}${comment.name}
                ${comment.isHighlighted ? ' ⭐' : ''}
              </td>
              <td>${this.truncateText(comment.text, 80)}</td>
              <td>🧶 ${comment.votes || 0}</td>
              <td>${this.formatDate(comment.timestamp)}</td>
              <td>
                <button class="btn btn-warning btn-sm" onclick="adminPanel.toggleHighlight('${comment.entryId}', '${comment.id}')">
                  ${comment.isHighlighted ? 'Quitar ⭐' : 'Destacar ⭐'}
                </button>
                <button class="btn btn-danger btn-sm" onclick="adminPanel.deleteComment('${comment.entryId}', '${comment.id}')">
                  Eliminar 🗑️
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    commentsListEl.innerHTML = commentsHTML;
  }

  async toggleHighlight(entryId, commentId) {
    try {
      if (this.hasFirebase) {
        const commentRef = window.firebaseCompatDb.ref(`/blog/comments/${entryId}/${commentId}`);
        const snapshot = await commentRef.get();
        const comment = snapshot.val();
        
        if (comment) {
          await commentRef.update({
            isHighlighted: !comment.isHighlighted
          });
        }
      } else {
        // Actualizar en localStorage
        const storageKey = `pf_comments_${entryId}_v2`;
        const comments = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const comment = comments.find(c => c.id === commentId);
        
        if (comment) {
          comment.isHighlighted = !comment.isHighlighted;
          localStorage.setItem(storageKey, JSON.stringify(comments));
        }
      }
      
      await this.loadComments();
      this.displayComments();
      this.showAlert('Comentario actualizado correctamente', 'success');
      
    } catch (error) {
      console.error('Error al destacar comentario:', error);
      this.showAlert('Error al actualizar comentario', 'error');
    }
  }

  async deleteComment(entryId, commentId) {
    if (!confirm('¿Estás seguro de que querés eliminar este comentario?')) {
      return;
    }

    try {
      if (this.hasFirebase) {
        await window.firebaseCompatDb.ref(`/blog/comments/${entryId}/${commentId}`).remove();
      } else {
        // Eliminar de localStorage
        const storageKey = `pf_comments_${entryId}_v2`;
        const comments = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const filteredComments = comments.filter(c => c.id !== commentId);
        localStorage.setItem(storageKey, JSON.stringify(filteredComments));
      }
      
      await this.loadComments();
      this.displayComments();
      this.showAlert('Comentario eliminado correctamente', 'success');
      
    } catch (error) {
      console.error('Error al eliminar comentario:', error);
      this.showAlert('Error al eliminar comentario', 'error');
    }
  }

  loadUsersSection() {
    const leaderboardEl = document.getElementById('leaderboard');
    const achievementsEl = document.getElementById('achievements-overview');
    
    // Mostrar tabla de líderes
    this.displayLeaderboard();
    
    // Mostrar resumen de logros
    this.displayAchievementsOverview();
  }

  displayLeaderboard() {
    const leaderboardEl = document.getElementById('leaderboard');
    const users = Object.values(this.allUsers);
    
    if (users.length === 0) {
      leaderboardEl.innerHTML = '<p>No hay usuarios registrados aún.</p>';
      return;
    }

    users.sort((a, b) => (b.totalPoints || b.points || 0) - (a.totalPoints || a.points || 0));

    const leaderboardHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Posición</th>
            <th>Usuario</th>
            <th>Puntos</th>
            <th>Logros</th>
            <th>Fecha de Registro</th>
          </tr>
        </thead>
        <tbody>
          ${users.map((user, index) => `
            <tr>
              <td>${index + 1}${index === 0 ? ' 🥇' : index === 1 ? ' 🥈' : index === 2 ? ' 🥉' : ''}</td>
              <td>${user.name}</td>
              <td>${user.totalPoints || user.points || 0}</td>
              <td>${user.badges || 0}</td>
              <td>${this.formatDate(user.joinDate)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    leaderboardEl.innerHTML = leaderboardHTML;
  }

  displayAchievementsOverview() {
    const achievementsEl = document.getElementById('achievements-overview');
    
    // Datos de ejemplo de logros del sistema
    const achievements = {
      'first_visit': { name: 'Primera Visita', unlocked: 0 },
      'theme_explorer': { name: 'Explorador de Temas', unlocked: 0 },
      'active_reader': { name: 'Lector Activo', unlocked: 0 },
      'comment_contributor': { name: 'Contribuidor', unlocked: 0 },
      'reaction_enthusiast': { name: 'Entusiasta', unlocked: 0 }
    };

    // Contar logros desbloqueados
    Object.values(this.allUsers).forEach(user => {
      if (user.badges && Array.isArray(user.badges)) {
        user.badges.forEach(badge => {
          if (achievements[badge]) {
            achievements[badge].unlocked++;
          }
        });
      }
    });

    const achievementsHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Logro</th>
            <th>Usuarios que lo Tienen</th>
            <th>Porcentaje</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(achievements).map(([id, achievement]) => {
            const percentage = this.stats.totalUsers > 0 
              ? Math.round((achievement.unlocked / this.stats.totalUsers) * 100)
              : 0;
            
            return `
              <tr>
                <td>${achievement.name}</td>
                <td>${achievement.unlocked}</td>
                <td>
                  ${percentage}%
                  <div class="progress-bar">
                    <div class="progress-fill" style="width: ${percentage}%"></div>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    achievementsEl.innerHTML = achievementsHTML;
  }

  loadSettingsSection() {
    // Cargar configuración actual
    const adminToggle = document.getElementById('admin-mode-toggle');
    const defaultTheme = document.getElementById('default-theme');
    const csvUrl = document.getElementById('csv-url');

    // Configurar toggle de admin
    adminToggle.classList.toggle('active', this.isAdmin);
    adminToggle.addEventListener('click', () => {
      const newState = !adminToggle.classList.contains('active');
      adminToggle.classList.toggle('active', newState);
      localStorage.setItem('pf_admin', newState ? '1' : '0');
      this.isAdmin = newState;
    });

    // Configurar tema por defecto
    const currentTheme = localStorage.getItem('pf_current_skin') || 'cuaderno';
    defaultTheme.value = currentTheme;

    // Configurar URL del CSV
    csvUrl.value = window.BLOG_CSV_URL || '';
  }

  loadExportSection() {
    // Los botones de exportación ya tienen event listeners
  }

  setupEventListeners() {
    // Configuración
    document.getElementById('save-settings').addEventListener('click', () => {
      this.saveSettings();
    });

    document.getElementById('reset-data').addEventListener('click', () => {
      this.resetLocalData();
    });

    // Exportación
    document.getElementById('export-comments').addEventListener('click', () => {
      this.exportData('comments');
    });

    document.getElementById('export-users').addEventListener('click', () => {
      this.exportData('users');
    });

    document.getElementById('export-all').addEventListener('click', () => {
      this.exportData('all');
    });

    document.getElementById('download-backup').addEventListener('click', () => {
      this.downloadBackup();
    });
  }

  saveSettings() {
    const defaultTheme = document.getElementById('default-theme').value;
    const csvUrl = document.getElementById('csv-url').value;

    // Guardar configuración
    localStorage.setItem('pf_current_skin', defaultTheme);
    if (csvUrl) {
      localStorage.setItem('pf_csv_url', csvUrl);
    }

    this.showAlert('Configuración guardada correctamente', 'success');
  }

  resetLocalData() {
    if (!confirm('¿Estás seguro de que querés eliminar todos los datos locales? Esta acción no se puede deshacer.')) {
      return;
    }

    // Eliminar datos específicos de Patofelting
    const keysToRemove = Object.keys(localStorage).filter(key => 
      key.startsWith('pf_') || key.startsWith('patofelting_')
    );

    keysToRemove.forEach(key => localStorage.removeItem(key));

    this.showAlert('Datos locales eliminados correctamente', 'success');
    
    // Recargar datos
    setTimeout(() => {
      this.loadAllData();
    }, 1000);
  }

  exportData(type) {
    const exportOutput = document.getElementById('export-output');
    let data = {};

    switch (type) {
      case 'comments':
        data = {
          comments: this.allComments,
          exportDate: new Date().toISOString(),
          type: 'comments'
        };
        break;
      case 'users':
        data = {
          users: this.allUsers,
          leaderboard: JSON.parse(localStorage.getItem('pf_leaderboard') || '[]'),
          exportDate: new Date().toISOString(),
          type: 'users'
        };
        break;
      case 'all':
        data = {
          comments: this.allComments,
          users: this.allUsers,
          stats: this.stats,
          leaderboard: JSON.parse(localStorage.getItem('pf_leaderboard') || '[]'),
          reactions: JSON.parse(localStorage.getItem('pf_reactions_v2') || '{}'),
          settings: {
            currentSkin: localStorage.getItem('pf_current_skin'),
            admin: localStorage.getItem('pf_admin'),
            csvUrl: localStorage.getItem('pf_csv_url')
          },
          exportDate: new Date().toISOString(),
          type: 'full_backup'
        };
        break;
    }

    exportOutput.textContent = JSON.stringify(data, null, 2);
    this.showAlert(`Datos de ${type} exportados correctamente`, 'success');
  }

  downloadBackup() {
    this.exportData('all');
    
    const exportOutput = document.getElementById('export-output');
    const data = exportOutput.textContent;
    
    // Crear archivo para descarga
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `patofelting_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    URL.revokeObjectURL(url);
    this.showAlert('Backup descargado correctamente', 'success');
  }

  /* ===== UTILIDADES ===== */
  formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    
    const date = new Date(typeof timestamp === 'string' ? timestamp : timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  }

  truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  updateLastUpdateTime() {
    document.getElementById('last-update').textContent = this.formatDate(new Date());
  }

  showAlert(message, type = 'info') {
    // Eliminar alertas anteriores
    const existingAlert = document.querySelector('.alert');
    if (existingAlert) {
      existingAlert.remove();
    }

    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;

    // Insertar al inicio del container
    const container = document.querySelector('.admin-container');
    container.insertBefore(alert, container.firstChild);

    // Auto-remover después de 5 segundos
    setTimeout(() => {
      alert.remove();
    }, 5000);
  }
}

// Inicialización
let adminPanel;
document.addEventListener('DOMContentLoaded', () => {
  adminPanel = new PatofeltingAdminPanel();
});

// Exponer globalmente para uso en HTML
window.adminPanel = adminPanel;