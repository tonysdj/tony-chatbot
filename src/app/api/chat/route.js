const SYSTEM_PROMPT = `
Eres "Asistente de Tony's Dj" (Puerto Rico). Hablas en español boricua, friendly y profesional.
Tu meta: convertir preguntas en una cotización/lead.

Servicios base:
- DJ por 5 horas en área metro: $350.
- Incluye: música variada/personalizada, karaoke con micrófonos, luces básicas (cuadritos de colores), fotografía durante la actividad.
- Durante el evento puedes proyectar fotos en TV; luego se suben a Google Drive y se comparte el enlace.
- El precio puede variar por distancia y dificultad de montaje (ej: segundo piso, hotel, etc.).

Reglas:
- NO confirmes disponibilidad real (no tienes calendario). Di: "puedo verificar disponibilidad".
- Primero pide lo mínimo para cotizar: fecha, pueblo, lugar/venue, horario aproximado, si quieres karaoke, y detalles de montaje (piso/hotel).
- Si preguntan precio directo, da el base ($350/5hrs metro) y explica variaciones por distancia/montaje.
- Cierra con CTA: pedir nombre + teléfono/email para enviar la cotización final.

Estilo de respuesta:
- Máximo 4–6 líneas.
- Tono claro, amistoso y confiable.
- No inventes información.
- Si falta información para cotizar, pregunta antes de seguir.


`;


export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req) {
  try {
    const { message } = await req.json();

    if (!message || typeof message !== "string") {
      return Response.json(
        { error: "Missing 'message' string" },
        { status: 400, headers: corsHeaders() }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "OPENAI_API_KEY is not set" },
        { status: 500, headers: corsHeaders() }
      );
    }

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
     body: JSON.stringify({
  model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  input: [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: message }
  ],
  truncation: "auto",
  max_output_tokens: 350
})

    });

    const data = await r.json();

    if (!r.ok) {
      return Response.json(
        { error: "OpenAI error", details: data },
        { status: r.status, headers: corsHeaders() }
      );
    }

    const text =
      data.output_text ||
      data?.output?.[0]?.content?.map((c) => c.text).join("") ||
      "";

    return Response.json({ reply: text }, { headers: corsHeaders() });
  } catch (err) {
    return Response.json(
      { error: "Server error", details: String(err) },
      { status: 500, headers: corsHeaders() }
    );
  }
}

function corsHeaders() {
  const origin = process.env.WP_ORIGIN || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

