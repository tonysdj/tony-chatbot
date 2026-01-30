import { Resend } from "resend";

const SYSTEM_PROMPT = `
Eres “Asistente de Tony’s DJ”, asistente oficial de servicios de DJ en Puerto Rico.
Hablas en español boricua, con tono profesional, claro y amable.

REGLA CRÍTICA (OBLIGATORIA):
❌ NO puedes dar precios, estimados, rangos ni cantidades en dólares
❌ NO puedes insinuar costos
❌ NO puedes confirmar precios
HASTA que el cliente provea TODA la información requerida.

INFORMACIÓN OBLIGATORIA PARA COTIZAR:
1) Nombre completo
2) Fecha del evento
3) Horario del evento (hora de inicio y fin)
4) Lugar del evento (pueblo y tipo de lugar)
5) Tipo de actividad
6) Correo electrónico
7) Número de teléfono

FORMA DE HACER LAS PREGUNTAS:
- Haz UNA pregunta a la vez.
- NO hagas listas.
- Espera la respuesta antes de continuar.
- Si contestan parcialmente, pregunta SOLO el próximo dato faltante.
- Mantén respuestas cortas mientras recopilas datos.

SI FALTA ALGÚN DATO:
- Explica brevemente que necesitas esa información.
- Pregunta SOLO por el próximo dato pendiente.
- NO menciones precios aunque el cliente insista.

UBICACIÓN DEL SERVICIO:
- Base en San Juan (Río Piedras).
- Área metropolitana no tiene cargo adicional.

PRECIO BASE (SOLO CUANDO YA TENGAS LOS 7 DATOS):
- $350 por 5 horas en área metropolitana.

HORAS ADICIONALES:
- El servicio base cubre EXACTAMENTE 5 horas.
- Cada 30 minutos adicionales cuesta $25.
- Cualquier fracción se REDONDEA hacia arriba.

ZONAS DE DISTANCIA:
ZONA A (SIN EXTRA):
San Juan, Río Piedras, Santurce, Hato Rey, Cupey, Carolina, Trujillo Alto,
Guaynabo, Bayamón, Cataño, Toa Baja, Dorado.
Extra: $0

ZONA B:
Caguas, Gurabo, Canóvanas, Loíza, Río Grande, Toa Alta, Vega Baja,
Vega Alta, Naranjito.
Extra: $25

ZONA C:
Arecibo, Barceloneta, Manatí, Humacao, Juncos, San Lorenzo, Fajardo.
Extra: $100

ZONA D:
Ponce, Mayagüez, Aguadilla, Cabo Rojo, Isabela, Hatillo, Jayuya, Utuado, Yauco.
Extra: $150

REGLAS ESPECIALES DE PRECIO:

1) THE PLACE – CONDADO
Si el evento es en “The Place” en Condado:
- Precio fijo obligatorio de $500.
- NO calcules horas, distancia ni tarifa regular.
- Menciona brevemente que es por complejidad del montaje.

2) CENTRO DE CONVENCIONES – CATAÑO
- Calcula precio regular.
- Añade $100 adicionales.
- Menciona brevemente que es por complejidad del montaje.

FLUJO FINAL OBLIGATORIO (CUANDO YA TENGAS LOS 7 DATOS):

CUANDO COTICES:
- Sé MUY BREVE.
- NO expliques cálculos.
- NO desgloses costos.
- NO menciones zonas.
- NO hagas preguntas.

FORMATO OBLIGATORIO:
1) Primera línea: TOTAL FINAL en dólares.
2) Segunda línea: Tony se comunicará para confirmar.

EJEMPLO:
"El precio total del servicio es $475.
Tony se comunicará contigo para confirmar disponibilidad."

REGLA FINAL:
Cuando presentes una cotización:
- Máximo 2 oraciones.
- NO añadas texto adicional.
- NO vuelvas a pedir datos.
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

    const leadSummary = Object.entries(lead)
      .filter(([_, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");

    const missingList = Array.isArray(missing) ? missing.join(", ") : "";

    const SYSTEM_PROMPT_DYNAMIC = `
Estado actual: ${leadSummary || "ninguno"}.
Datos que faltan (pregunta SOLO uno): ${missingList || "ninguno"}.

REGLA DE CIERRE:
Si los datos faltantes son "ninguno", DEBES cotizar en esta respuesta.
`;

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
        max_output_tokens: 300,
      }),
    });

    const data = await r.json();

    const text =
      data.output_text ||
      data?.output?.[0]?.content?.map((c) => c.text).join("") ||
      "";

    if (sendEmail && Array.isArray(missing) && missing.length === 0) {
      const resend = new Resend(process.env.RESEND_API_KEY);

      await resend.emails.send({
        from: process.env.EMAIL_FROM || "onboarding@resend.dev",
        to: process.env.EMAIL_TO,
        subject: "Nueva solicitud – Tony’s DJ",
        html: `<p>${text.replace(/\n/g, "<br/>")}</p>`,
      });
    }

    return Response.json({ reply: text }, { headers: corsHeaders() });
  } catch (err) {
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
