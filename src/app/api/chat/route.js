import { Resend } from "resend";

/**
 * ================================
 *  PROMPT BASE (NEGOCIO)
 * ================================
 */
const SYSTEM_PROMPT = `
Eres “Asistente de Tony’s DJ”, asistente oficial de servicios de DJ en Puerto Rico.
Hablas en español boricua, con tono profesional, claro y amable.

REGLA CRÍTICA:
❌ NO puedes dar precios, rangos ni cantidades
❌ NO puedes insinuar costos
HASTA que el cliente provea TODA la información obligatoria.

INFORMACIÓN OBLIGATORIA PARA COTIZAR (TODOS REQUERIDOS):
1) Nombre completo
2) Fecha del evento
3) Horario del evento (hora inicio y fin)
4) Lugar del evento (pueblo y tipo de lugar)
5) Tipo de actividad
6) Correo electrónico (OBLIGATORIO, sin excepción)
7) Número de teléfono

REGLA CRÍTICA SOBRE EL HORARIO:
- DEBES obtener hora de inicio Y hora de fin.
- Sin ambas horas NO se puede cotizar.
- Se usan para calcular horas adicionales.
- Si falta una, pide SOLO la que falte.

FORMA DE HACER LAS PREGUNTAS:
- UNA pregunta a la vez.
- Nunca hagas listas.
- Espera respuesta antes de continuar.
- PROHIBIDO repetir preguntas ya contestadas.
- Usa ejemplos cuando ayuden al cliente.

PREGUNTA SOBRE LUGAR:
“¿En qué pueblo será el evento y qué tipo de lugar es?
Por ejemplo: casa, salón de actividades, negocio, restaurante, hotel, centro comunal, terraza, etc.”

PREGUNTA SOBRE ACTIVIDAD:
“¿Qué tipo de actividad será?
Por ejemplo: cumpleaños, boda, quinceañero, evento corporativo, bautizo, aniversario, actividad familiar, etc.”

UBICACIÓN:
- Base: San Juan (Río Piedras).

PRECIO BASE:
- $350 por 5 horas en área metropolitana.

HORAS ADICIONALES:
- $25 cada 30 minutos adicionales.
- Fracciones se redondean hacia arriba.

ZONAS:
ZONA A: San Juan, Río Piedras, Santurce, Hato Rey, Cupey, Carolina,
Trujillo Alto, Guaynabo, Bayamón, Cataño, Toa Baja, Dorado.

ZONA B (+$25): Caguas, Gurabo, Canóvanas, Loíza, Río Grande, Toa Alta,
Vega Baja, Vega Alta, Naranjito.

ZONA C (+$100): Arecibo, Barceloneta, Manatí, Humacao, Juncos,
San Lorenzo, Fajardo.

ZONA D (+$150): Ponce, Mayagüez, Aguadilla, Cabo Rojo,
Isabela, Hatillo, Jayuya, Utuado, Yauco.

REGLAS ESPECIALES:
- THE PLACE – CONDADO → Tarifa fija $500 (incluye 5 horas)
- CENTRO DE CONVENCIONES – CATAÑO → +$100 por complejidad

SALIDA FINAL OBLIGATORIA (FORMATO FIJO):

Precio base (incluye 5 horas de servicio): $XXX
Tiempo adicional: $XXX
Cargo por distancia: $XXX
Cargo por complejidad: $XXX
Total: $XXX

Tony se comunicará contigo para confirmar disponibilidad.
`;

/**
 * ================================
 *  PARSER BACKEND (ANTI-LOOP)
 * ================================
 */
function extractFieldsFromMessage(message, lead) {
  const text = message.toLowerCase();

  // Email
  if (!lead.email) {
    const m = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (m) lead.email = m[0];
  }

  // Teléfono PR
  if (!lead.phone) {
    const m = message.match(/(\+?1?\s?)?(787[\s.-]?\d{3}[\s.-]?\d{4})/);
    if (m) lead.phone = m[0];
  }

  // Horario (6pm a 1am)
  if (!lead.startTime || !lead.endTime) {
    const m = message.match(
      /(\d{1,2}\s?(?:am|pm))\s*(?:-|a|hasta)\s*(\d{1,2}\s?(?:am|pm))/i
    );
    if (m) {
      lead.startTime = lead.startTime || m[1];
      lead.endTime = lead.endTime || m[2];
    }
  }

  // Tipo de actividad
  if (!lead.eventType) {
    const activities = [
      "cumple",
      "boda",
      "quince",
      "corporativo",
      "bautizo",
      "aniversario",
    ];
    if (activities.some((a) => text.includes(a))) {
      lead.eventType = message;
    }
  }

  return lead;
}

/**
 * ================================
 *  CORS
 * ================================
 */
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

/**
 * ================================
 *  POST /api/chat
 * ================================
 */
export async function POST(req) {
  try {
    let { message, lead = {}, sendEmail = false } = await req.json();

    if (!message) {
      return Response.json(
        { error: "Missing message" },
        { status: 400, headers: corsHeaders() }
      );
    }

    // 🔥 ACTUALIZAR LEAD CON LO QUE DIJO EL USUARIO
    lead = extractFieldsFromMessage(message, lead);

    const REQUIRED_FIELDS = [
      "name",
      "date",
      "startTime",
      "endTime",
      "town",
      "venueType",
      "eventType",
      "email",
      "phone",
    ];

    const missing = REQUIRED_FIELDS.filter((f) => !lead?.[f]);

    const SYSTEM_PROMPT_DYNAMIC = `
ESTADO ACTUAL DEL LEAD:
${REQUIRED_FIELDS.map(
  (f) => `${f}: ${lead?.[f] || "❌"}`
).join("\n")}

DATOS FALTANTES:
${missing.length ? missing.join(", ") : "NINGUNO"}

REGLAS:
- NO repitas preguntas ya contestadas.
- Si hay datos faltantes, pregunta SOLO el PRIMERO.
- Si NO falta ninguno:
  - CIERRA
  - COTIZA
  - USA EXACTAMENTE el formato final
`;

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        input: [
          { role: "system", content: SYSTEM_PROMPT + SYSTEM_PROMPT_DYNAMIC },
          { role: "user", content: message },
        ],
        max_output_tokens: 220,
      }),
    });

    const data = await r.json();
    const text =
      data.output_text ||
      data?.output?.[0]?.content?.map((c) => c.text).join("") ||
      "";

    // 📧 Email solo cuando está completo
    if (sendEmail && missing.length === 0) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.EMAIL_FROM,
        to: process.env.EMAIL_TO,
        subject: `Nuevo lead – Tony’s DJ – ${lead?.name || ""}`,
        html: `<pre>${text}</pre>`,
      });
    }

    return Response.json({ reply: text }, { headers: corsHeaders() });
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: "Server error" },
      { status: 500, headers: corsHeaders() }
    );
  }
}

/**
 * ================================
 *  HEADERS
 * ================================
 */
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": process.env.WP_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
