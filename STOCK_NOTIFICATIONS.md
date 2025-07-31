# Función "Avisame cuando haya stock"

## Descripción
Esta funcionalidad permite a los usuarios solicitar notificaciones por email cuando un producto agotado vuelva a tener stock disponible.

## Características implementadas

### 1. Botón de notificación
- Se muestra **únicamente** cuando el producto está agotado (stock = 0)
- Reemplaza al botón "Agregar" cuando no hay stock disponible
- Estilo distintivo con color naranja (#FFA500) y icono de campana 🔔

### 2. Modal de captura de datos
- **Email**: Campo obligatorio
- **Nombre**: Campo opcional
- **Información del producto**: Se muestra automáticamente (imagen, nombre, precio)

### 3. Envío de notificación
- Los datos se envían vía POST a un endpoint configurable (Formspree)
- Incluye toda la información relevante del producto y usuario
- Feedback visual con estados de carga, éxito y error

## Configuración de Formspree

### Paso 1: Crear cuenta en Formspree
1. Ir a [https://formspree.io](https://formspree.io)
2. Crear una cuenta gratuita
3. Verificar el email

### Paso 2: Crear formulario
1. En el dashboard, hacer clic en "New Form"
2. Configurar el email de destino: `patofelting@gmail.com`
3. Nombrar el formulario: "Stock Notifications"
4. Copiar el endpoint URL (formato: `https://formspree.io/f/YOUR_FORM_ID`)

### Paso 3: Configurar en el código
1. Abrir el archivo `Untitled-1.js`
2. Localizar la línea con `STOCK_NOTIFICATION_ENDPOINT`
3. Reemplazar `YOUR_FORM_ID` con el ID proporcionado por Formspree

```javascript
// Antes
const STOCK_NOTIFICATION_ENDPOINT = 'https://formspree.io/f/YOUR_FORM_ID';

// Después (ejemplo)
const STOCK_NOTIFICATION_ENDPOINT = 'https://formspree.io/f/abc123xyz';
```

## Datos enviados en el email

Cada solicitud de notificación incluye:

- **email**: Email del usuario interesado
- **nombre**: Nombre del usuario (opcional)
- **producto**: Nombre del producto
- **productoId**: ID único del producto
- **precio**: Precio del producto
- **mensaje**: "Avisame cuando haya stock"
- **fecha**: Fecha y hora de la solicitud
- **_subject**: Asunto del email (formato: "[Patofelting] Notificación de stock - [Nombre del producto]")

## Ejemplo de email recibido

```
Asunto: [Patofelting] Notificación de stock - Perrito de Fieltro

Email: usuario@example.com
Nombre: María González
Producto: Perrito de Fieltro
Producto ID: 123
Precio: 1500
Mensaje: Avisame cuando haya stock
Fecha: 31/7/2025, 20:30:45
```

## Archivos modificados

1. **index.html**: Agregado modal de notificación de stock
2. **Untitled-1.js**: 
   - Configuración de endpoint
   - Funciones de modal y envío
   - Modificación del botón en productos agotados
   - Event listeners para el formulario
3. **Untitled-1.css**: Estilos para el modal y botones

## Uso para los usuarios

1. El usuario navega por los productos
2. Ve un producto agotado con el botón "🔔 Avisame cuando haya stock"
3. Hace clic en el botón
4. Se abre un modal con:
   - Información del producto
   - Formulario para email y nombre
5. Completa sus datos y envía
6. Recibe confirmación de éxito o error
7. Su solicitud llega por email a patofelting@gmail.com

## Ventajas de esta implementación

- **Sin backend propio**: Usa Formspree como servicio externo
- **Fácil configuración**: Solo cambiar una línea de código
- **Responsive**: Funciona en móviles y desktop
- **Integración perfecta**: Usa los estilos y patrones existentes
- **Feedback visual**: Estados de carga y confirmación
- **Validación**: Campos requeridos y manejo de errores