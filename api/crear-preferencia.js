import { guardarPedido } from './pedidos';

const SITE_URL = process.env.FRONTEND_URL;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { carrito, datosCliente } = req.body;

    const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

    const externalReference = `pedido_${Date.now()}`;

    // 🧠 GUARDAMOS PEDIDO ANTES DE PAGAR
    guardarPedido({
      id: externalReference,
      carrito,
      cliente: datosCliente,
      estado: 'pendiente',
      fecha: new Date(),
    });

    const items = carrito.map(item => ({
      title: item.nombre,
      quantity: Number(item.cantidad),
      unit_price: Number(item.precio),
      currency_id: 'UYU',
    }));

    const preferencia = {
      items,
      external_reference: externalReference,
      notification_url: `${SITE_URL}/api/webhook-mp`,
      back_urls: {
        success: `${SITE_URL}/pago-exitoso.html`,
        failure: `${SITE_URL}/pago-fallido.html`,
        pending: `${SITE_URL}/pago-pendiente.html`,
      },
      auto_return: 'approved',
      metadata: {
        carrito,
        cliente: datosCliente,
      },
    };

    const mpResponse = await fetch(
      'https://api.mercadopago.com/checkout/preferences',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(preferencia),
      }
    );

    const data = await mpResponse.json();

    return res.status(200).json({
      url: data.init_point,
      reference: externalReference,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error' });
  }
}
