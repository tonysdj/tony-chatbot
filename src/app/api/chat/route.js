import { Resend } from "resend";

const SYSTEM_PROMPT = `
Eres “Asistente de Tony’s DJ”, asistente oficial de servicios de DJ en Puerto Rico.
Hablas en español boricua, con tono profesional, claro y amable.

REGLA CRÍTICA (OBLIGATORIA):
❌ NO puedes dar precios, estimados, rangos ni cantidades en dólares
❌ NO puedes insinuar costos
❌ NO puedes confirmar precios “aproximados”
HASTA que el cliente provea TODA la información requerida.

INFORMACIÓN OBLIGATORIA PARA COTIZAR:
1) Nombre completo
2) Fecha del evento
3) Horario del evento (hora de inicio y fin)
4) Lugar del evento (pueblo y tipo de lugar)
5) Tipo de actividad (cumpleaños, boda, bautizo, corporativo, etc.)
6) Correo electrónico
7) Número de teléfono

FORMA DE HACER LAS PREGUNTAS (MUY IMPORTANTE):
- Debes hacer las preguntas UNA A LA VEZ.
- NUNCA hagas una lista completa en un solo mensaje.
- Espera la respuesta del cliente antes de pasar a la próxima pregunta.
- Si el cliente contesta parcialmente, pregunta SOLO por el próximo dato faltante.
- Mantén el ritmo conversacional, claro y pausado.

SI FALTA CUALQUIER DATO:
- Explica con cortesía que necesitas esa información.
- Pregunta SOLO por el próximo dato pendiente.
- NO menciones precios aunque el cliente insista.

UBICACIÓN DEL SERVICIO (PARA CÁLCULO):
- El proveedor está ubicado en San Juan, Puerto Rico (Río Piedras).
- El precio base se mantiene si el evento es en el área metropolitana.

PRECIO BASE (SOLO CUANDO YA TENGAS LOS 7 DATOS):
- Precio base: $350 por 5 horas en área metropolitana.

HORAS ADICIONALES (OBLIGATORIO – CÁLCULO CORRECTO):
- El servicio base cubre EXACTAMENTE 5 horas.
- Si el evento dura MÁS de 5 horas:
  - Calcula cuántas horas adicionales hay.
  - Cada 30 minutos adicionales cuesta $25.
  - Cualquier fracción de 30 minutos se REDONDEA hacia arriba.
- NUNCA digas que no hay horas adicionales si el evento dura más de 5 horas.

DISTANCIA / TARIFA ADICIONAL (SOLO CUANDO YA TENGAS LOS 7 DATOS):
- Si el evento NO es en área metropolitana, añade una tarifa adicional por distancia desde San Juan (Río Piedras).
- Usa esta tabla por zona (según el pueblo del evento):

ZONA A – Área Metropolitana (SIN extra):
San Juan, Río Piedras, Santurce, Hato Rey, Cupey, Carolina, Trujillo Alto, Guaynabo, Bayamón, Cataño, Toa Baja, Dorado.
Extra: $0

ZONA B – Cercano:
Caguas, Gurabo, Canóvanas, Loíza, Río Grande, Toa Alta, Dorado, Vega Baja, Vega Alta, Naranjito.
Extra: $25

ZONA C – Intermedio:
Arecibo, Barceloneta, Manatí,Humacao, Juncos, San Lorenzo, Fajardo.
Extra: $100

ZONA D – Lejos:
Ponce, Mayagüez, Aguadilla, Cabo Rojo, Isabela, Hatillo, Jayuya, Utuado, Yauco.
Extra: $150

REGLAS ESPECIALES DE PRECIO – ESTABLECIMIENTOS ESPECÍFICOS

1. THE PLACE – CONDADO
Si el cliente indica que el evento será en el establecimiento llamado “The Place” en Condado, 
el chatbot DEBE establecer un precio fijo de $500.

Este precio es obligatorio y no negociable, independientemente de:
- horas del evento
- cantidad de invitados
- tipo de música
- servicios adicionales estándar

La razón del precio fijo es la complejidad del montaje en ese lugar.

Cuando aplique esta regla, el chatbot debe:
- Informar el precio de $500 de forma clara y segura
- Mencionar brevemente que el costo se debe a la complejidad del montaje
- NO calcular precios basados en tarifa regular ni distancia
- NO ofrecer precios alternos para ese lugar


2. CENTRO DE CONVENCIONES – CATAÑO
Si el cliente indica que el evento será en el Centro de Convenciones en Cataño,
el chatbot DEBE añadir un cargo adicional de $100 al precio básico del servicio.

Este cargo adicional se aplica por:
- complejidad del montaje
- logística del lugar

Cuando aplique esta regla, el chatbot debe:
- Calcular primero el precio base regular
- Añadir automáticamente $100 al total
- Informar el total final ya con el cargo incluido
- Explicar brevemente que el cargo adicional es por complejidad del montaje

FLUJO FINAL OBLIGATORIO (CUANDO YA TENGAS LOS 7 DATOS):
- Presenta un resumen CLARO y CORTO del evento.
- Muestra el servicio base (5 horas).
- Muestra las horas adicionales calculadas.
- Añade la tarifa por distancia según la zona.
- Presenta el TOTAL FINAL claramente.
- Indica que Tony se estará comunicando para confirmar disponibilidad.

ESTILO:
- Profesional
- Claro
- Sin discutir
- Respuestas cortas mientras recopilas datos
`;

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req) {
  try {
    const { message, lead = {}, missing = [], sendEmail = false } = await req.json();

    if (!message || typeof message !== "string") {
      return Response.json(
        { error: "Missing message" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "OPENAI_API_KEY missing" },
        { status: 500, headers: corsHeaders() }
      );
    }

    // Prompt dinámico para evitar repetir preguntas
    const leadSummary = Object.entries(lead)
      .filter(([_, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");

    const missingList = Array.isArray(missing) ? missing.join(", ") : "";

    const SYSTEM_PROMPT_DYNAMIC = `
Estado actual (ya recopilado): ${leadSummary || "nada aún"}.
Datos que faltan (pregunta SOLO el próximo, uno a la vez): ${missingList || "ninguno"}.

Reglas:
- NO repitas un dato que ya esté en el estado actual.
- Si faltan datos, pregunta SOLO 1 dato a la vez.
- Si no falta ninguno, procede a resumir y cotizar.
`;

    // Llamada a OpenAI
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        input: [
          { role: "system", content: SYSTEM_PROMPT + "\n" + SYSTEM_PROMPT_DYNAMIC },
          { role: "user", content: message },
        ],
        truncation: "auto",
        max_output_tokens: 350,
      }),
    });

    const data = await r.json();

    if (!r.ok) {
      console.error("OpenAI error:", data);
      return Response.json(
        { error: "OpenAI error", details: data },
        { status: r.status, headers: corsHeaders() }
      );
    }

    const text =
      data.output_text ||
      data?.output?.[0]?.content?.map((c) => c.text).join("") ||
      "";

    // ✅ Email (CON la cotización/respuesta del bot) SOLO cuando el lead esté completo
    if (sendEmail && Array.isArray(missing) && missing.length === 0) {
      if (!process.env.RESEND_API_KEY) {
        console.error("❌ RESEND_API_KEY no está disponible en runtime (revisa Vercel env vars en Production).");
      } else if (!process.env.EMAIL_TO) {
        console.error("❌ EMAIL_TO no está configurado en Vercel env vars.");
      } else {
        try {
          const resend = new Resend(process.env.RESEND_API_KEY);

          const botHtml = (text || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, "<br/>");

          await resend.emails.send({
            from: process.env.EMAIL_FROM || "onboarding@resend.dev",
            to: process.env.EMAIL_TO,
            subject: `Nuevo Evento Tony’s DJ – ${lead?.name || "Cliente"} – ${lead?.date || ""} – ${lead?.town || ""}`,
            html: `
              <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto; line-height:1.4">
                <h2>Cotización / Respuesta enviada al cliente</h2>

                <div style="padding:12px;border:1px solid #eee;border-radius:10px;background:#fafafa">
                  ${botHtml || "Sin texto"}
                </div>

                <hr />

                <h3>Datos del lead</h3>
                <p><b>Nombre:</b> ${lead?.name || ""}</p>
                <p><b>Fecha:</b> ${lead?.date || ""}</p>
                <p><b>Horario:</b> ${lead?.startTime || ""} - ${lead?.endTime || ""}</p>
                <p><b>Lugar:</b> ${lead?.town || ""} (${lead?.venueType || ""})</p>
                <p><b>Actividad:</b> ${lead?.eventType || ""}</p>
                <p><b>Email:</b> ${lead?.email || ""}</p>
                <p><b>Teléfono:</b> ${lead?.phone || ""}</p>

                <p style="margin-top:16px;color:#666;font-size:12px">
                  Enviado automáticamente desde el chatbot.
                </p>
              </div>
            `,
          });

          // 📧 Email de confirmación al cliente
const customerEmail = (lead?.email || "").trim();

if (customerEmail) {
  await resend.emails.send({
    from: process.env.EMAIL_FROM || "onboarding@resend.dev",
    to: customerEmail,
    subject: "Recibimos tu solicitud – Tony’s DJ",
    html: `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto; line-height:1.5">
        <h2>¡Gracias por escribirnos! 🎧</h2>

        <p>Hola ${lead?.name || ""},</p>

        <p>
          Recibimos tu solicitud para el evento
          <b>${lead?.eventType || ""}</b>
          en <b>${lead?.town || ""}</b>
          el <b>${lead?.date || ""}</b>.
        </p>

        <p>
          En breve Tony se estará comunicando contigo para confirmar
          disponibilidad y detalles finales.
        </p>

        <p style="margin-top:16px;">
          Gracias,<br/>
          <b>Tony’s DJ</b>
        </p>

        <hr/>
        <p style="font-size:12px;color:#666">
          Este es un correo automático de confirmación.
        </p>
      </div>
    `,
  });

  console.log("✅ Email de confirmación enviado al cliente:", customerEmail);
}

          console.log("✅ Email (con cotización del bot) enviado a", process.env.EMAIL_TO);
        } catch (err) {
          console.error("❌ Error enviando email:", err);
        }
      }
    }

    console.log("✅ TERMINÓ PROCESO POST /api/chat");

    return Response.json({ reply: text }, { headers: corsHeaders() });
  } catch (err) {
    console.error("Server error:", err);
    return Response.json(
      { error: "Server error", details: String(err) },
      { status: 500, headers: corsHeaders() }
    );
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": process.env.WP_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
