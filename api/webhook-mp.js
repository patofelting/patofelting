import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

function getFirebaseAdmin() {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

export default async function handler(req, res) {
  if (req.method === 'GET') return res.status(200).send('OK');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const { type, data } = req.body;

    if (type !== 'payment') {
      return res.status(200).json({ message: 'Evento ignorado' });
    }

    const paymentId = data?.id;
    if (!paymentId) return res.status(400).json({ error: 'Payment ID faltante' });

    const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    });

    if (!mpResponse.ok) {
      console.error('Error al consultar pago en MP:', paymentId);
      return res.status(200).json({ error: 'No se pudo verificar el pago' }); // 200 para que MP no reintente
    }

    const pago = await mpResponse.json();

    if (pago.status !== 'approved') {
      console.log(`Pago ${paymentId} con estado: ${pago.status} — ignorado`);
      return res.status(200).json({ message: `Estado ${pago.status}, ignorado` });
    }

    const externalReference = pago.external_reference;
    if (!externalReference) return res.status(200).json({ error: 'Sin external_reference' });

    // ✅ Leer metadata correctamente
    const datosCliente = pago.metadata?.cliente || {};
    const carrito = pago.metadata?.carrito || [];

    // ✅ Firebase
    const app = getFirebaseAdmin();
    const db = getDatabase(app);

    const pedidoExistente = await db.ref(`pedidos/${externalReference}`).get();
    if (pedidoExistente.exists()) {
      console.log(`Pedido ${externalReference} ya procesado`);
      return res.status(200).json({ message: 'Pedido ya procesado' });
    }

    await db.ref(`pedidos/${externalReference}`).set({
      paymentId,
      estado:        'aprobado',
      monto:         pago.transaction_amount,
      moneda:        pago.currency_id,
      fechaPago:     pago.date_approved,
      fechaRegistro: new Date().toISOString(),
      metodoPago:    pago.payment_type_id,
      datosCliente,
      carrito,        // ✅ productos del pedido
      externalReference,
    });

    console.log(`✅ Pedido ${externalReference} registrado`);
    return res.status(200).json({ message: 'Pago procesado y registrado' });

  } catch (error) {
    console.error('Error en webhook-mp:', error);
    return res.status(200).json({ message: 'Error interno procesado' });
  }
}
