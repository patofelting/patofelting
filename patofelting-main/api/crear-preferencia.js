// api/crear-preferencia.js
// Vercel Serverless Function — crea una preferencia de pago en Mercado Pago
// Colocá este archivo en: /api/crear-preferencia.js

export default async function handler(req, res) {
  // Solo aceptar POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  // CORS: permitir requests desde tu dominio
  res.setHeader('Access-Control-Allow-Origin', process.env.FRONTEND_URL || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { carrito, datosCliente } = req.body;

    // Validaciones básicas
    if (!carrito || !Array.isArray(carrito) || carrito.length === 0) {
      return res.status(400).json({ error: 'Carrito vacío o inválido' });
    }
    if (!datosCliente?.nombre || !datosCliente?.apellido || !datosCliente?.telefono) {
      return res.status(400).json({ error: 'Datos del cliente incompletos' });
    }

    const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
    if (!ACCESS_TOKEN) {
      console.error('MP_ACCESS_TOKEN no configurado');
      return res.status(500).json({ error: 'Configuración del servidor incompleta' });
    }

    // Calcular costo de envío
    const costoEnvio =
      datosCliente.envio === 'montevideo' ? 200 :
      datosCliente.envio === 'interior'   ? 250 : 0;

    // Armar items para Mercado Pago
    const items = carrito.map(item => ({
      id:          String(item.id),
      title:       item.nombre,
      quantity:    item.cantidad,
      unit_price:  item.precio,
      currency_id: 'UYU',
    }));

    // Agregar envío como item si corresponde
    if (costoEnvio > 0) {
      items.push({
        id:          'envio',
        title:       `Envío (${datosCliente.envio === 'montevideo' ? 'Montevideo' : 'Interior'})`,
        quantity:    1,
        unit_price:  costoEnvio,
        currency_id: 'UYU',
      });
    }

    // ID único del pedido
    const externalReference = `pedido_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Payload para MP
    const preferencia = {
      items,
      payer: {
        name:    datosCliente.nombre,
        surname: datosCliente.apellido,
        phone: { number: datosCliente.telefono },
      },
      back_urls: {
        success: `${process.env.FRONTEND_URL}/pago-exitoso.html`,
        failure: `${process.env.FRONTEND_URL}/pago-fallido.html`,
        pending: `${process.env.FRONTEND_URL}/pago-pendiente.html`,
      },
      auto_return:        'approved',
      external_reference: externalReference,
      notification_url:   `${process.env.VERCEL_URL || process.env.FRONTEND_URL}/api/webhook-mp`,
      // Métodos de pago disponibles en Uruguay
      payment_methods: {
        excluded_payment_types: [],
        installments: 1, // sin cuotas (ajustá si querés)
      },
      // Metadata extra (para el webhook)
      metadata: {
        datosCliente: JSON.stringify(datosCliente),
        notas: datosCliente.notas || '',
      },
    };

    // Llamar a la API de Mercado Pago
    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify(preferencia),
    });

    if (!mpResponse.ok) {
      const errorData = await mpResponse.json();
      console.error('Error de MP:', errorData);
      return res.status(502).json({ error: 'Error al crear preferencia en Mercado Pago', detalle: errorData });
    }

    const data = await mpResponse.json();

    // Devolver la URL de pago al frontend
    return res.status(200).json({
      url:               data.init_point,         // URL de producción
      url_sandbox:       data.sandbox_init_point,  // URL de prueba
      preferenceId:      data.id,
      externalReference,
    });

  } catch (error) {
    console.error('Error en crear-preferencia:', error);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}