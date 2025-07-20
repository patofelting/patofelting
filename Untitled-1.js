/* Estilos para FAQ */
.faq-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.faq-filters {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.faq-item {
  border: 1px solid #ddd;
  border-radius: 8px;
  margin-bottom: 10px;
  overflow: hidden;
}

.faq-toggle {
  width: 100%;
  padding: 15px 20px;
  text-align: left;
  background: #f8f8f8;
  border: none;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
}

.faq-toggle:hover {
  background: #eee;
}

.faq-content {
  padding: 0;
  max-height: 0;
  transition: max-height 0.3s ease, padding 0.3s ease;
  overflow: hidden;
}

.faq-toggle[aria-expanded="true"] + .faq-content {
  padding: 15px 20px;
  max-height: 1000px; /* Ajusta según necesidad */
}

.faq-toggle[aria-expanded="true"] .faq-icon {
  transform: rotate(45deg);
}

.faq-icon {
  transition: transform 0.3s ease;
  font-size: 1.2em;
}

.highlight {
  background-color: yellow;
  font-weight: bold;
}
