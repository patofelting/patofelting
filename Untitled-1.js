/* Notificaciones */
.notificacion {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 15px 20px;
  border-radius: 5px;
  color: white;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  opacity: 0;
  transform: translateY(-20px);
  transition: opacity 0.3s, transform 0.3s;
  z-index: 1000;
}

.notificacion.exito {
  background: #4CAF50;
}

.notificacion.error {
  background: #F44336;
}

.notificacion.info {
  background: #2196F3;
}

.notificacion-icono {
  font-weight: bold;
}

/* Animaciones */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-20px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fadeOut {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(-20px); }
}
