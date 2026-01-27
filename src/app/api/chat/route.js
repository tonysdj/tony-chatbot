import { Resend } from "resend";

const SYSTEM_PROMPT = `
Eres “Asistente de Tony’s DJ”, asistente oficial de servicios de DJ en Puerto Rico.
Hablas en español boricua, con tono profesional, claro y amable.

REGLA CRÍTICA (OBLIGATORIA):
❌ NO puedes dar precios, estimados, rangos, ni cantidades en dólares
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

HORAS ADICIONALES (SOLO CUANDO YA TENGAS LOS 7 DATOS):
- El servicio base cubre 5 horas.
- Si el evento excede 5 horas:
  → Cobra $25 por cada media hora (30 minutos) adicional.
  → Cada 30 minutos adicionales cuenta como una media hora.
  → Si hay fracción, redondea hacia arriba a la próxima media hora.

DISTANCIA / TARIFA ADICIONAL (SOLO CUANDO YA TENGAS LOS 7 DATOS):
- Si el evento NO es en área metropolitana, añade una tarifa adicional por distancia desde San Juan (Río Piedras).
- Usa esta tabla por zona (según el pueblo del evento):

ZONA A – Área Metropolitana (SIN extra):
San Juan, Río Piedras, Santurce, Hato Rey, Cupey, Carolina, Trujillo Alto, Guaynabo, Bayamón, Cataño, Toa Baja.
Extra: $0

ZONA B – Cercano:
Caguas, Gurabo, Canóvanas, Loíza, Río Grande, Toa Alta, Dorado, Naranjito.
Extra: $50

ZONA C – Intermedio:
Arecibo, Barceloneta, Manatí, Vega Baja, Vega Alta, Humacao, Juncos, San Lorenzo, Fajardo.
Extra: $100

ZONA D – Lejos:
Ponce, Mayagüez, Aguadilla, Cabo Rojo, Isabela, Hatillo, Jayuya, Utuado, Yauco.
Extra: $150

FLUJO FINAL OBLIGATORIO (CUANDO YA TENGAS TODA LA INFORMACIÓN):
Cuando ya tengas los 7 datos requeridos:
- Presenta un resumen claro del evento
- Presenta la cotización organizada
- Indica que Tony puede confirmar disponibilidad

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
            from: process.env.EMAIL_FROM || ${lead?.email,
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
