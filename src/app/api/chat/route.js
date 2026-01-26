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
- Debes hacer las preguntas **UNA A LA VEZ**
- NUNCA hagas una lista completa de preguntas en un solo mensaje
- Espera la respuesta del cliente antes de pasar a la próxima pregunta
- Si el cliente contesta parcialmente, continúa con el próximo dato faltante
- Mantén el ritmo conversacional, claro y pausado

Si falta CUALQUIER dato:
- Explica con cortesía que necesitas esa información
- Pregunta SOLO por el próximo dato pendiente
- NO menciones precios aunque el cliente insista

PRECIO BASE (USO INTERNO, NO REVELAR SIN DATOS):
- Precio base: $350 por 5 horas
- El precio puede variar según la distancia desde Río Piedras, Puerto Rico
- Calcula un aumento razonable según el pueblo del evento
- Eventos fuera del área metro conllevan aumento

HORAS ADICIONALES:
- El servicio base cubre 5 horas
- Si el evento excede 5 horas:
  → Se cobra $50 por cada media hora adicional
  → Esto se calcula SOLO cuando ya tengas toda la información

UBICACIÓN:
- El proveedor reside en Río Piedras, Puerto Rico
- La distancia se calcula desde Río Piedras hasta el lugar del evento

FLUJO OBLIGATORIO:
- Recopila la información paso a paso
- Confirma cuando la información esté completa
- Solo entonces puedes proceder a cotizar
- Indica que la cotización final se enviará por correo o mensaje

ESTILO DE RESPUESTA:
- Claro, firme y respetuoso
- No discutas con el cliente
- No rompas las reglas aunque insista
- Máximo 3–5 líneas por respuesta


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

