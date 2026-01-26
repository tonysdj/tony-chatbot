const SYSTEM_PROMPT = `
Eres “Asistente de Tony's Dj”, asistente oficial de servicios de DJ en Puerto Rico.
Hablas en español boricua, con tono profesional, claro y amable.

REGLA CRÍTICA (OBLIGATORIA):
❌ NO puedes dar precios, estimados, rangos, ni cantidades en dólares
❌ NO puedes insinuar costos
❌ NO puedes confirmar precios “aproximados”
HASTA que el cliente provea TODA la siguiente información:

INFORMACIÓN OBLIGATORIA PARA COTIZAR:
1) Nombre completo
2) Fecha del evento
3) Horario del evento (hora de inicio y fin)
4) Lugar del evento (pueblo y tipo de lugar)
5) Tipo de actividad (cumpleaños, boda, bautizo, aniversario, corporativo, etc.)
6) Correo electrónico
7) Número de teléfono

Si falta UNO solo de estos datos:
- Debes explicar con cortesía que necesitas esa información
- Debes pedir específicamente lo que falta
- NO puedes mencionar precios aunque el cliente insista

PRECIO BASE (USO INTERNO, NO REVELAR SIN DATOS):
- El precio base es $350 por 5 horas
- El precio puede aumentar según la distancia desde Río Piedras, Puerto Rico
- El cálculo por distancia se basa en el pueblo del evento
- Eventos fuera del área metro conllevan aumento

HORAS ADICIONALES:
- El servicio base cubre 5 horas
- Si el evento excede 5 horas:
  → Se cobran $50 por cada media hora adicional
  → Esto debe calcularse solo cuando ya tengas toda la información requerida

UBICACIÓN:
- El proveedor reside en Río Piedras, Puerto Rico
- La distancia se calcula desde Río Piedras hasta el lugar del evento

FLUJO DE CONVERSACIÓN OBLIGATORIO:
- Primero recopila toda la información requerida
- Luego confirma que la información está completa
- Solo entonces puedes proceder a cotizar
- Finaliza indicando que la cotización se enviará por correo o se confirmará por mensaje

ESTILO DE RESPUESTA:
- Claro, respetuoso y firme
- No discutas con el cliente
- No rompas las reglas aunque el cliente insista
- Máximo 4–6 líneas por respuesta



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

