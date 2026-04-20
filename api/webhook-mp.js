// api/webhook-mp.js
// Vercel Serverless Function — recibe notificaciones de pago de Mercado Pago
// Colocá este archivo en: /api/webhook-mp.js

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getDatabase }                   from 'firebase-admin/database';

// Inicializar Firebase Admin (solo una vez)
function getFirebaseAdmin() {
  if (getApps().length > 0) return getApps()[0];

  return initializeApp({
    credential: cert({
      projectId:    process.env.FIREBASE_PROJECT_ID,
      clientEmail:  process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:   process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });
}

export default async function handler(req, res) {
  // MP manda GET para validar el endpoint y POST para notificar
  if (req.method === 'GET') return res.status(200).send('OK');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { type, data } = req.body;

    // Solo nos interesan los eventos de pago
    if (type !== 'payment') {
      return res.status(200).json({ message: 'Evento ignorado' });
    }

    const paymentId = data?.id;
    if (!paymentId) return res.status(400).json({ error: 'Payment ID faltante' });

    // Consultar el pago a MP para verificarlo (NUNCA confiar solo en el webhook)
    const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` },
    });

    if (!mpResponse.ok) {
      console.error('Error al consultar pago en MP:', paymentId);
      return res.status(502).json({ error: 'No se pudo verificar el pago' });
    }

    const pago = await mpResponse.json();

    // Solo procesar pagos aprobados
    if (pago.status !== 'approved') {
      console.log(`Pago ${paymentId} con estado: ${pago.status} — ignorado`);
      return res.status(200).json({ message: `Pago con estado ${pago.status}, ignorado` });
    }

    // Evitar procesar el mismo pago dos veces
    const externalReference = pago.external_reference;
    if (!externalReference) return res.status(400).json({ error: 'Sin external_reference' });

    // Guardar el pedido en Firebase
    getFirebaseAdmin();
    const db = getDatabase();

    // Verificar si ya procesamos este pedido
    const pedidoExistente = await db.ref(`pedidos/${externalReference}`).get();
    if (pedidoExistente.exists()) {
      console.log(`Pedido ${externalReference} ya procesado — ignorando duplicado`);
      return res.status(200).json({ message: 'Pedido ya procesado' });
    }

    // Parsear datos del cliente desde metadata
    let datosCliente = {};
    try {
      datosCliente = JSON.parse(pago.metadata?.datos_cliente || '{}');
    } catch {}

    // Registrar el pedido confirmado
    await db.ref(`pedidos/${externalReference}`).set({
      paymentId,
      estado:          'aprobado',
      monto:           pago.transaction_amount,
      moneda:          pago.currency_id,
      fechaPago:       pago.date_approved,
      fechaRegistro:   new Date().toISOString(),
      metodoPago:      pago.payment_type_id,
      datosCliente,
      externalReference,
    });

    console.log(`✅ Pedido ${externalReference} registrado correctamente`);
    return res.status(200).json({ message: 'Pago procesado y registrado' });

  } catch (error) {
    console.error('Error en webhook-mp:', error);
    // Siempre responder 200 a MP para que no reintente indefinidamente
    return res.status(200).json({ message: 'Error interno procesado' });
  }
}