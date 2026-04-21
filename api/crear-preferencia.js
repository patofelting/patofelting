// api/crear-preferencia.js
const SITE_URL = process.env.FRONTEND_URL || 'https://www.patofelting.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  res.setHeader('Access-Control-Allow-Origin', SITE_URL);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { carrito, datosCliente } = req.body;

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

    console.log('Token usado:', ACCESS_TOKEN.slice(0, 10) + '...');

    const costoEnvio =
      datosCliente.envio === 'montevideo' ? 200 :
      datosCliente.envio === 'interior'   ? 250 : 0;

    const items = carrito.map(item => ({
      id:          String(item.id),
      title:       item.nombre,
      quantity:    item.cantidad,
      unit_price:  item.precio,
      currency_id: 'UYU',
    }));

    if (costoEnvio > 0) {
      items.push({
        id:          'envio',
        title:       `Envío (${datosCliente.envio === 'montevideo' ? 'Montevideo' : 'Interior'})`,
        quantity:    1,
        unit_price:  costoEnvio,
        currency_id: 'UYU',
      });
    }

    const externalReference = `pedido_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const preferencia = {
      items,
      payer: {
        name:    datosCliente.nombre,
        surname: datosCliente.apellido,
        phone: { number: datosCliente.telefono },
      },
      back_urls: {
        success: 'https://www.patofelting.com/pago-exitoso.html',
        failure: 'https://www.patofelting.com/pago-fallido.html',
        pending: 'https://www.patofelting.com/pago-pendiente.html',
      },
      auto_return:        'approved',
      external_reference: externalReference,
      payment_methods: {
        excluded_payment_types: [],
        installments: 1,
      },
      metadata: {
        datosCliente: JSON.stringify(datosCliente),
        notas: datosCliente.notas || '',
      },
    };

    console.log('Preferencia a enviar:', JSON.stringify(preferencia));

    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify(preferencia),
    });

    const data = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error('Error de MP completo:', JSON.stringify(data));
      return res.status(502).json({ 
        error: 'Error al crear preferencia en Mercado Pago', 
        detalle: data 
      });
    }

    return res.status(200).json({
      url:               data.init_point,
      url_sandbox:       data.sandbox_init_point,
      preferenceId:      data.id,
      externalReference,
    });

  } catch (error) {
    console.error('Error en crear-preferencia:', error);
    return res.status(500).json({ error: 'Error interno del servidor', detalle: error.message });
  }
}
