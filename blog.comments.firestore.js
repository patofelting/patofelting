/* =========================================================
   Blog Patofelting - Enhanced Comments with Firestore
   Sistema mejorado de comentarios con votación y persistencia
========================================================= */

class PatofeltingCommentsSystem {
  constructor() {
    this.hasFirebase = !!(window.firebaseCompatDb && window.firebaseCompatAuth);
    this.uid = null;
    this.userName = localStorage.getItem('pf_user_name') || '';
    this.isAdmin = localStorage.getItem('pf_admin') === '1';
    
    this.init();
  }

  init() {
    if (this.hasFirebase) {
      window.firebaseCompatAuth.onAuthStateChanged(user => {
        this.uid = user ? user.uid : null;
        this.handleAuthStateChange();
      });
    }
    
    this.enhanceCommentSections();
    this.initVotingSystem();
    this.initHighlightedComments();
    this.setupEventListeners();
  }

  handleAuthStateChange() {
    // Actualizar UI según estado de autenticación
    document.querySelectorAll('.comment-auth-status').forEach(el => {
      el.textContent = this.uid ? '👤 Conectado' : '👤 Invitado';
    });
  }

  enhanceCommentSections() {
    document.querySelectorAll('.entry-comments').forEach(section => {
      this.enhanceCommentSection(section);
    });
  }

  enhanceCommentSection(section) {
    const entryId = section.closest('.blog-entry').getAttribute('data-entry-id');
    const commentsList = section.querySelector('.comments-list');
    const commentForm = section.querySelector('.comment-form');
    
    // Mejorar el formulario de comentarios
    this.enhanceCommentForm(commentForm, entryId);
    
    // Agregar sistema de votación
    this.addVotingToComments(commentsList, entryId);
    
    // Agregar filtros de comentarios
    this.addCommentFilters(section, entryId);
    
    // Cargar comentarios con votación
    this.loadCommentsWithVoting(commentsList, entryId);
  }

  enhanceCommentForm(form, entryId) {
    if (!form || form.dataset.enhanced) return;
    
    form.dataset.enhanced = 'true';
    
    // Agregar campo de nombre si no existe persistido
    const nameInput = form.querySelector('.comment-name');
    if (nameInput && this.userName) {
      nameInput.value = this.userName;
    }

    // Agregar indicador de estado de autenticación
    const authStatus = document.createElement('div');
    authStatus.className = 'comment-auth-status';
    authStatus.textContent = this.uid ? '👤 Conectado' : '👤 Invitado';
    authStatus.style.fontSize = '0.8rem';
    authStatus.style.color = 'var(--pencil-gray)';
    authStatus.style.marginTop = '0.5rem';
    
    form.appendChild(authStatus);

    // Mejorar el textarea con contador de caracteres
    const textarea = form.querySelector('.comment-text');
    if (textarea) {
      this.addCharacterCounter(textarea);
    }

    // Mejorar el envío del formulario
    form.addEventListener('submit', (e) => this.handleCommentSubmit(e, entryId));
  }

  addCharacterCounter(textarea) {
    const maxLength = 600;
    const counter = document.createElement('div');
    counter.className = 'char-counter';
    counter.style.fontSize = '0.8rem';
    counter.style.color = 'var(--pencil-gray)';
    counter.style.textAlign = 'right';
    counter.style.marginTop = '0.25rem';
    
    const updateCounter = () => {
      const remaining = maxLength - textarea.value.length;
      counter.textContent = `${remaining} caracteres restantes`;
      counter.style.color = remaining < 50 ? 'var(--red-margin)' : 'var(--pencil-gray)';
    };
    
    textarea.addEventListener('input', updateCounter);
    textarea.parentNode.appendChild(counter);
    updateCounter();
  }

  async handleCommentSubmit(e, entryId) {
    e.preventDefault();
    
    const form = e.target;
    const nameInput = form.querySelector('.comment-name');
    const textArea = form.querySelector('.comment-text');
    
    const name = nameInput.value.trim() || 'Anónimo';
    const text = textArea.value.trim();
    
    if (!text) {
      this.showMessage('Por favor escribe un comentario', 'warning');
      return;
    }

    // Guardar nombre para futuros comentarios
    if (name !== 'Anónimo') {
      this.userName = name;
      localStorage.setItem('pf_user_name', name);
    }

    // Anti-spam: verificar último comentario
    const lastCommentTime = parseInt(localStorage.getItem('pf_last_comment_ts') || '0');
    const now = Date.now();
    
    if (now - lastCommentTime < 10000) {
      this.showMessage('Esperá unos segundos antes de comentar de nuevo 🙏', 'warning');
      return;
    }

    const comment = {
      id: this.generateCommentId(),
      name: this.sanitizeInput(name),
      text: this.sanitizeInput(text),
      timestamp: now,
      uid: this.uid || null,
      votes: 0,
      votedBy: [],
      isHighlighted: false,
      isAdminReply: this.isAdmin
    };

    try {
      await this.saveComment(entryId, comment);
      form.reset();
      localStorage.setItem('pf_last_comment_ts', now.toString());
      this.showMessage('¡Comentario publicado! 🎉', 'success');
      
      // Gamificación
      if (window.patofeltingTheme) {
        window.patofeltingTheme.updateUserStats('commentsPosted', 1);
        window.patofeltingTheme.awardPoints(15, 'Nuevo comentario');
      }
      
    } catch (error) {
      console.error('Error al guardar comentario:', error);
      this.showMessage('Error al publicar el comentario. Intentá de nuevo.', 'error');
    }
  }

  async saveComment(entryId, comment) {
    if (this.hasFirebase && this.uid) {
      // Guardar en Firebase
      await window.firebaseCompatDb.ref(`/blog/comments/${entryId}/${comment.id}`).set(comment);
    } else {
      // Fallback a localStorage
      const storageKey = `pf_comments_${entryId}_v2`;
      const existingComments = JSON.parse(localStorage.getItem(storageKey) || '[]');
      existingComments.push(comment);
      localStorage.setItem(storageKey, JSON.stringify(existingComments));
      
      // Actualizar UI manualmente para localStorage
      this.updateCommentsUI(entryId);
    }
  }

  loadCommentsWithVoting(commentsList, entryId) {
    if (this.hasFirebase) {
      // Cargar desde Firebase con listener en tiempo real
      window.firebaseCompatDb.ref(`/blog/comments/${entryId}`).on('value', (snapshot) => {
        const commentsData = snapshot.val() || {};
        const comments = Object.values(commentsData).sort((a, b) => a.timestamp - b.timestamp);
        this.renderComments(commentsList, comments, entryId);
      });
    } else {
      // Cargar desde localStorage
      this.updateCommentsUI(entryId);
    }
  }

  updateCommentsUI(entryId) {
    const storageKey = `pf_comments_${entryId}_v2`;
    const comments = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const commentsList = document.querySelector(`[data-entry-id="${entryId}"] .comments-list`);
    
    if (commentsList) {
      this.renderComments(commentsList, comments, entryId);
    }
  }

  renderComments(commentsList, comments, entryId) {
    if (!comments.length) {
      commentsList.innerHTML = `
        <li class="comment-item comment-empty">
          <div class="comment-text">Sé el primero en comentar ✨</div>
        </li>
      `;
      return;
    }

    // Ordenar comentarios: destacados primero, luego por votos, luego por fecha
    const sortedComments = [...comments].sort((a, b) => {
      if (a.isHighlighted && !b.isHighlighted) return -1;
      if (!a.isHighlighted && b.isHighlighted) return 1;
      if (a.votes !== b.votes) return b.votes - a.votes;
      return a.timestamp - b.timestamp;
    });

    commentsList.innerHTML = sortedComments.map(comment => this.renderComment(comment, entryId)).join('');
    
    // Agregar event listeners para votación
    this.attachVotingListeners(commentsList, entryId);
  }

  renderComment(comment, entryId) {
    const date = new Date(comment.timestamp);
    const isOwn = this.uid && comment.uid === this.uid;
    const canVote = !isOwn && this.uid;
    const hasVoted = comment.votedBy && comment.votedBy.includes(this.uid);
    
    return `
      <li class="comment-item ${comment.isHighlighted ? 'comment-highlighted' : ''} ${comment.isAdminReply ? 'comment-admin' : ''}" 
          data-comment-id="${comment.id}">
        <div class="comment-header">
          <div class="comment-meta">
            <span class="comment-name">
              ${comment.isAdminReply ? '👑 ' : ''}${comment.name}
              ${comment.isHighlighted ? ' ⭐' : ''}
            </span>
            <span>•</span>
            <time datetime="${date.toISOString()}" title="${date.toLocaleString()}">
              ${this.formatRelativeTime(comment.timestamp)}
            </time>
          </div>
          <div class="comment-actions">
            <div class="comment-votes">
              <button class="vote-btn ${hasVoted ? 'voted' : ''}" 
                      data-comment-id="${comment.id}" 
                      ${canVote ? '' : 'disabled'}
                      title="${canVote ? 'Votar comentario' : (isOwn ? 'No podés votar tu propio comentario' : 'Inicia sesión para votar')}">
                🧶 <span class="vote-count">${comment.votes || 0}</span>
              </button>
            </div>
            ${this.isAdmin ? `
              <button class="highlight-btn ${comment.isHighlighted ? 'active' : ''}" 
                      data-comment-id="${comment.id}"
                      title="${comment.isHighlighted ? 'Quitar destacado' : 'Destacar comentario'}">
                ⭐
              </button>
              <button class="delete-btn" data-comment-id="${comment.id}" title="Eliminar comentario">
                🗑️
              </button>
            ` : ''}
          </div>
        </div>
        <div class="comment-text">${this.formatCommentText(comment.text)}</div>
      </li>
    `;
  }

  addVotingToComments(commentsList, entryId) {
    // Los event listeners se agregan en attachVotingListeners
  }

  attachVotingListeners(commentsList, entryId) {
    // Votación
    commentsList.querySelectorAll('.vote-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleVote(e, entryId));
    });

    // Destacar comentarios (solo admin)
    if (this.isAdmin) {
      commentsList.querySelectorAll('.highlight-btn').forEach(btn => {
        btn.addEventListener('click', (e) => this.handleHighlight(e, entryId));
      });

      commentsList.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => this.handleDelete(e, entryId));
      });
    }
  }

  async handleVote(e, entryId) {
    e.preventDefault();
    
    const btn = e.currentTarget;
    const commentId = btn.dataset.commentId;
    
    if (!this.uid) {
      this.showMessage('Necesitás iniciar sesión para votar', 'warning');
      return;
    }

    if (btn.disabled || btn.classList.contains('voted')) {
      return;
    }

    try {
      if (this.hasFirebase) {
        await this.voteCommentFirebase(entryId, commentId);
      } else {
        await this.voteCommentLocal(entryId, commentId);
      }
      
      // Animación de voto
      btn.classList.add('vote-animation');
      setTimeout(() => btn.classList.remove('vote-animation'), 600);
      
      // Gamificación
      if (window.patofeltingTheme) {
        window.patofeltingTheme.awardPoints(2, 'Voto en comentario');
      }
      
    } catch (error) {
      console.error('Error al votar:', error);
      this.showMessage('Error al votar. Intentá de nuevo.', 'error');
    }
  }

  async voteCommentFirebase(entryId, commentId) {
    const commentRef = window.firebaseCompatDb.ref(`/blog/comments/${entryId}/${commentId}`);
    
    await commentRef.transaction((comment) => {
      if (comment) {
        if (!comment.votedBy) comment.votedBy = [];
        if (!comment.votedBy.includes(this.uid)) {
          comment.votedBy.push(this.uid);
          comment.votes = (comment.votes || 0) + 1;
        }
      }
      return comment;
    });
  }

  async voteCommentLocal(entryId, commentId) {
    const storageKey = `pf_comments_${entryId}_v2`;
    const comments = JSON.parse(localStorage.getItem(storageKey) || '[]');
    
    const comment = comments.find(c => c.id === commentId);
    if (comment && comment.uid !== this.uid) {
      if (!comment.votedBy) comment.votedBy = [];
      if (!comment.votedBy.includes(this.uid)) {
        comment.votedBy.push(this.uid);
        comment.votes = (comment.votes || 0) + 1;
        
        localStorage.setItem(storageKey, JSON.stringify(comments));
        this.updateCommentsUI(entryId);
      }
    }
  }

  async handleHighlight(e, entryId) {
    e.preventDefault();
    
    const btn = e.currentTarget;
    const commentId = btn.dataset.commentId;
    
    try {
      if (this.hasFirebase) {
        await window.firebaseCompatDb.ref(`/blog/comments/${entryId}/${commentId}/isHighlighted`)
          .set(!btn.classList.contains('active'));
      } else {
        const storageKey = `pf_comments_${entryId}_v2`;
        const comments = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const comment = comments.find(c => c.id === commentId);
        
        if (comment) {
          comment.isHighlighted = !comment.isHighlighted;
          localStorage.setItem(storageKey, JSON.stringify(comments));
          this.updateCommentsUI(entryId);
        }
      }
      
      this.showMessage(
        btn.classList.contains('active') ? 'Comentario no destacado' : 'Comentario destacado', 
        'success'
      );
      
    } catch (error) {
      console.error('Error al destacar:', error);
      this.showMessage('Error al destacar comentario', 'error');
    }
  }

  async handleDelete(e, entryId) {
    e.preventDefault();
    
    const btn = e.currentTarget;
    const commentId = btn.dataset.commentId;
    
    if (!confirm('¿Estás seguro de que querés eliminar este comentario?')) {
      return;
    }

    try {
      if (this.hasFirebase) {
        await window.firebaseCompatDb.ref(`/blog/comments/${entryId}/${commentId}`).remove();
      } else {
        const storageKey = `pf_comments_${entryId}_v2`;
        const comments = JSON.parse(localStorage.getItem(storageKey) || '[]');
        const filteredComments = comments.filter(c => c.id !== commentId);
        localStorage.setItem(storageKey, JSON.stringify(filteredComments));
        this.updateCommentsUI(entryId);
      }
      
      this.showMessage('Comentario eliminado', 'success');
      
    } catch (error) {
      console.error('Error al eliminar:', error);
      this.showMessage('Error al eliminar comentario', 'error');
    }
  }

  addCommentFilters(section, entryId) {
    const filtersContainer = document.createElement('div');
    filtersContainer.className = 'comment-filters';
    filtersContainer.innerHTML = `
      <div class="filter-label">Ordenar por:</div>
      <button class="filter-btn active" data-filter="best">🏆 Mejores</button>
      <button class="filter-btn" data-filter="newest">🕐 Más nuevos</button>
      <button class="filter-btn" data-filter="oldest">📅 Más antiguos</button>
    `;

    // Estilos inline para los filtros
    Object.assign(filtersContainer.style, {
      display: 'flex',
      gap: '0.5rem',
      alignItems: 'center',
      marginBottom: '1rem',
      fontSize: '0.9rem',
      flexWrap: 'wrap'
    });

    filtersContainer.querySelectorAll('.filter-btn').forEach(btn => {
      Object.assign(btn.style, {
        padding: '0.25rem 0.5rem',
        border: '1px solid var(--line-blue)',
        borderRadius: '15px',
        background: 'white',
        cursor: 'pointer',
        fontSize: '0.8rem',
        transition: 'all 0.2s ease'
      });

      btn.addEventListener('click', () => {
        filtersContainer.querySelectorAll('.filter-btn').forEach(b => {
          b.classList.remove('active');
          b.style.background = 'white';
          b.style.color = 'var(--ink-black)';
        });
        
        btn.classList.add('active');
        btn.style.background = 'var(--primary-green)';
        btn.style.color = 'white';
        
        this.applyCommentFilter(entryId, btn.dataset.filter);
      });
    });

    const commentsHeader = section.querySelector('h3');
    commentsHeader.parentNode.insertBefore(filtersContainer, commentsHeader.nextSibling);
  }

  applyCommentFilter(entryId, filter) {
    const commentsList = document.querySelector(`[data-entry-id="${entryId}"] .comments-list`);
    const comments = [...commentsList.querySelectorAll('.comment-item:not(.comment-empty)')];
    
    comments.sort((a, b) => {
      const aId = a.dataset.commentId;
      const bId = b.dataset.commentId;
      
      // Obtener datos del comentario desde localStorage o DOM
      const aVotes = parseInt(a.querySelector('.vote-count')?.textContent || '0');
      const bVotes = parseInt(b.querySelector('.vote-count')?.textContent || '0');
      const aTime = new Date(a.querySelector('time')?.getAttribute('datetime') || 0).getTime();
      const bTime = new Date(b.querySelector('time')?.getAttribute('datetime') || 0).getTime();
      
      switch (filter) {
        case 'best':
          if (aVotes !== bVotes) return bVotes - aVotes;
          return aTime - bTime;
        case 'newest':
          return bTime - aTime;
        case 'oldest':
          return aTime - bTime;
        default:
          return 0;
      }
    });

    // Reordenar DOM
    comments.forEach(comment => commentsList.appendChild(comment));
  }

  initVotingSystem() {
    // Sistema ya inicializado en enhanceCommentSection
  }

  initHighlightedComments() {
    // Agregar estilos para comentarios destacados
    if (!document.querySelector('#highlighted-comments-style')) {
      const style = document.createElement('style');
      style.id = 'highlighted-comments-style';
      style.textContent = `
        .comment-highlighted {
          background: linear-gradient(135deg, #fff9e6, #fffacd) !important;
          border-left: 4px solid #ffd700 !important;
          position: relative;
        }
        
        .comment-highlighted::before {
          content: '⭐';
          position: absolute;
          top: -5px;
          right: -5px;
          background: #ffd700;
          color: white;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
        }
        
        .comment-admin {
          background: linear-gradient(135deg, #f0f8ff, #e6f3ff) !important;
          border-left: 4px solid #4169e1 !important;
        }
        
        .vote-btn {
          transition: all 0.3s ease;
        }
        
        .vote-btn.voted {
          background: var(--primary-green);
          color: white;
        }
        
        .vote-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }
        
        .vote-animation {
          animation: voteSuccess 0.6s ease-out;
        }
        
        @keyframes voteSuccess {
          0% { transform: scale(1); }
          50% { transform: scale(1.2); background: var(--primary-green); }
          100% { transform: scale(1); }
        }
        
        .comment-filters .filter-label {
          font-weight: 600;
          color: var(--dark-green);
        }
      `;
      document.head.appendChild(style);
    }
  }

  setupEventListeners() {
    // Los event listeners se configuran en las funciones específicas
  }

  /* ===== UTILIDADES ===== */
  generateCommentId() {
    return `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  sanitizeInput(input) {
    return input.replace(/[<>]/g, '').trim();
  }

  formatRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'ahora';
    if (minutes < 60) return `hace ${minutes}m`;
    if (hours < 24) return `hace ${hours}h`;
    if (days < 7) return `hace ${days}d`;
    
    return new Date(timestamp).toLocaleDateString();
  }

  formatCommentText(text) {
    // Convertir URLs en links
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  showMessage(message, type = 'info') {
    const messageEl = document.createElement('div');
    messageEl.className = `comment-message comment-message-${type}`;
    messageEl.textContent = message;
    
    Object.assign(messageEl.style, {
      position: 'fixed',
      top: '20px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '0.75rem 1.5rem',
      borderRadius: '25px',
      zIndex: '10000',
      fontSize: '0.9rem',
      fontWeight: '600',
      boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      animation: 'messageSlideIn 0.3s ease-out, messageSlideOut 0.3s ease-out 2.7s forwards'
    });

    switch (type) {
      case 'success':
        messageEl.style.background = 'var(--primary-green)';
        messageEl.style.color = 'white';
        break;
      case 'warning':
        messageEl.style.background = '#ff9800';
        messageEl.style.color = 'white';
        break;
      case 'error':
        messageEl.style.background = '#f44336';
        messageEl.style.color = 'white';
        break;
      default:
        messageEl.style.background = 'var(--ink-blue)';
        messageEl.style.color = 'white';
    }

    // Agregar animaciones CSS si no existen
    if (!document.querySelector('#message-animations')) {
      const style = document.createElement('style');
      style.id = 'message-animations';
      style.textContent = `
        @keyframes messageSlideIn {
          from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
        @keyframes messageSlideOut {
          from { transform: translateX(-50%) translateY(0); opacity: 1; }
          to { transform: translateX(-50%) translateY(-100%); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(messageEl);
    
    setTimeout(() => {
      messageEl.remove();
    }, 3000);
  }

  /* ===== API PÚBLICA ===== */
  getAllComments() {
    const allComments = {};
    
    document.querySelectorAll('.blog-entry').forEach(entry => {
      const entryId = entry.getAttribute('data-entry-id');
      const storageKey = `pf_comments_${entryId}_v2`;
      const comments = JSON.parse(localStorage.getItem(storageKey) || '[]');
      
      if (comments.length > 0) {
        allComments[entryId] = comments;
      }
    });
    
    return allComments;
  }

  exportComments() {
    return this.getAllComments();
  }
}

// Inicialización
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.patofeltingComments = new PatofeltingCommentsSystem();
  });
} else {
  window.patofeltingComments = new PatofeltingCommentsSystem();
}