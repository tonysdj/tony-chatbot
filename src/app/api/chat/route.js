if (manualQuote.includes(town)) {
  return {
    price: null,
    hours,
    breakdown: "Este destino requiere cotización manual. Te estaremos contactando."
  };
}

let distanceFee = townFees[town];

if (distanceFee === undefined) {
  return {
    price: null,
    hours,
    breakdown: "No se pudo calcular la distancia automáticamente. Te estaremos contactando con la cotización."
  };
}

if (distanceFee > 0) {
  price += distanceFee;
  breakdown += ` + recargo por distancia ($${distanceFee})`;
}
  // Recargo por segundo piso
if (lead.floor === "2" || (lead.floor || "").toLowerCase().includes("segundo")) {
  price += 100;
  breakdown += " + recargo por segundo piso ($100)";
}


  return { price, hours, breakdown };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: corsHeaders(),
  });
}

export async function POST(req) {
  try {

    const { lead = {}, message = "" } = await req.json();

// ===============================
// RESPUESTAS A PREGUNTAS GENERALES
// ===============================
const msg = (message || "").toLowerCase();

if (!lead.name) {
  if (msg.includes("incluye") || msg.includes("servicio")) {
    return new Response(
      JSON.stringify({
        reply:
          "Mi servicio incluye DJ con música variada o personalizada, karaoke con micrófonos, luces básicas y fotos durante la actividad. El servicio dura 5 horas."
      }),
      { status: 200, headers: corsHeaders() }
    );
  }

  if (msg.includes("pago") || msg.includes("deposito") || msg.includes("depósito")) {
    return new Response(
      JSON.stringify({
        reply:
          "No se requiere depósito. El pago se realiza el mismo día de la actividad por ATH Móvil o efectivo."
      }),
      { status: 200, headers: corsHeaders() }
    );
  }

  if (msg.includes("precio") || msg.includes("cuanto") || msg.includes("cuánto")) {
    return new Response(
      JSON.stringify({
        reply:
          "El precio puede variar según la distancia y el horario del evento. Si gustas, te preparo una cotización. ¿Cuál es tu nombre completo?"
      }),
      { status: 200, headers: corsHeaders() }
    );
  }
}


    const nextStep = STEPS.find(step => !lead[step.key]);

    if (nextStep) {
      return new Response(
        JSON.stringify({ reply: nextStep.question }),
        { status: 200, headers: corsHeaders() }
      );
    }

    const quote = calculateQuote(lead);

    const origin = req.nextUrl?.origin || new URL(req.url).origin;

    // Guardar en Supabase
    await fetch(`${origin}/api/save-lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: lead.name,
        fecha_evento: lead.date,
        horario: `${lead.startTime} - ${lead.endTime}`,
        lugar: `${lead.town} (${lead.venueType})`,
        tipo_evento: lead.eventType,
        email: lead.email,
        telefono: lead.phone,
        precio_cotizado: quote.price,
        duracion_horas: quote.hours,
        notas_cotizacion: quote.breakdown
      }),
    });

// 📩 Email interno para Tony
await resend.emails.send({
  from: "Tony’s DJ <cotizaciones@tonysdjpr.com>",
  to: ["tonysdj@gmail.com"],
  subject: "Nueva cotización recibida - Tony’s DJ",
  html: `
    <h2>Nueva cotización recibida</h2>
    <p><strong>Nombre:</strong> ${lead.name}</p>
    <p><strong>Email:</strong> ${lead.email}</p>
    <p><strong>Teléfono:</strong> ${lead.phone}</p>
    <hr>
    <p><strong>Fecha:</strong> ${lead.date}</p>
    <p><strong>Horario:</strong> ${lead.startTime} - ${lead.endTime}</p>
    <p><strong>Lugar:</strong> ${lead.town} (${lead.venueType})</p>
    <p><strong>Piso:</strong> ${lead.floor}</p>
    <p><strong>Actividad:</strong> ${lead.eventType}</p>
    <hr>
    <p>${quote.breakdown}</p>
    <h3>Total cotizado: $${quote.price}</h3>
  `
});

// 📩 Email de confirmación para el cliente
await resend.emails.send({
  from: "Tony’s DJ <cotizaciones@tonysdjpr.com>",
  to: [lead.email],
  subject: "Tu cotización - Tony’s DJ",
  html: `
    <h2>¡Gracias por tu interés en Tony’s DJ!</h2>

    <p>Hemos recibido tu solicitud de cotización.</p>

    <hr>
    <h3>Resumen de tu cotización</h3>
    <p><strong>Fecha:</strong> ${lead.date}</p>
    <p><strong>Horario:</strong> ${lead.startTime} - ${lead.endTime}</p>
    <p><strong>Lugar:</strong> ${lead.town} (${lead.venueType})</p>
    <p><strong>Piso:</strong> ${lead.floor}</p>
    <p><strong>Actividad:</strong> ${lead.eventType}</p>
    <p>${quote.breakdown}</p>
    <h3>Total estimado: $${quote.price}</h3>
    <hr>

    <p><strong>Importante:</strong> Esta cotización está sujeta a disponibilidad.</p>
    <p>Tony’s DJ se estará comunicando contigo pronto para confirmar la fecha y los detalles del evento.</p>

    <p>Si necesitas más información, puedes comunicarte conmigo directamente por WhatsApp:</p>
    <h3>📱 787-463-5655</h3>

    <p>¡Gracias por confiar en Tony’s DJ! 🎧</p>
  `
});


    return new Response(
  JSON.stringify({
    reply:
      `¡Perfecto! Aquí tienes tu cotización:\n` +
      `${quote.breakdown}\n` +
      `Total: $${quote.price}\n\n` +
      `Esta cotización está sujeta a disponibilidad. ` +
      `Tony’s DJ se estará comunicando contigo para confirmar la fecha.`
  }),

      { status: 200, headers: corsHeaders() }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({ reply: "Error en el servidor" }),
      { status: 500, headers: corsHeaders() }
    );
  }
}
