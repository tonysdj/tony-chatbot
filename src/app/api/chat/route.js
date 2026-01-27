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

ZONA A – Área Metropolitana (SIN extra): San Juan, Río Piedras, Santurce, Hato Rey, Cupey, Carolina, Trujillo Alto, Guaynabo, Bayamón, Cataño, Toa Baja.
→ Extra: $0 (se queda en $350)

ZONA B – Cercano (extra bajo): Caguas, Gurabo, Canóvanas, Loíza, Río Grande, Toa Alta, Dorado, Naranjito.
→ Extra: $50

ZONA C – Intermedio (extra medio): Arecibo, Barceloneta, Manatí, Vega Baja, Vega Alta, Humacao, Juncos, San Lorenzo, Fajardo.
→ Extra: $100

ZONA D – Lejos (extra alto): Ponce, Mayagüez, Aguadilla, Cabo Rojo, Isabela, Hatillo, Jayuya, Utuado, Yauco.
→ Extra: $150

- Si el pueblo no aparece en la lista, pide confirmación del pueblo y aplica una tarifa estimada razonable según distancia (nunca $0 fuera del área metro).

FLUJO FINAL OBLIGATORIO (CUANDO YA TENGAS TODA LA INFORMACIÓN):

FLUJO FINAL OBLIGATORIO (CUANDO YA TENGAS TODA LA INFORMACIÓN):

Cuando ya tengas los 7 datos requeridos, debes hacer lo siguiente:

1) Presenta un resumen claro de la información del evento:

RESUMEN DEL EVENTO
- Nombre del cliente
- Fecha del evento
- Horario del evento (hora de inicio y hora de fin)
- Pueblo y tipo de lugar
- Tipo de actividad
- Correo electrónico
- Número de teléfono

2) Luego presenta la cotización de forma organizada:

COTIZACIÓN DEL SERVICIO
- Servicio base: $350 por 5 horas en área metropolitana
- Ajuste por distancia según el pueblo del evento
- Horas adicionales: $25 por cada media hora adicional luego de las primeras 5 horas

3) Presenta el total estimado sumando:
- Precio base
- Ajuste por distancia (si aplica)
- Horas adicionales (si aplica)

4) Finaliza con un mensaje profesional indicando que:
- La cotización está basada en la información provista
- Tony puede confirmar disponibilidad y asegurar la fecha
- Quedas disponible para continuar el proceso

REGLAS IMPORTANTES:
- Usa este flujo SOLO cuando ya tengas toda la información.
- No hagas preguntas adicionales en este mensaje.
- Mantén el tono profesional, claro y respetuoso.


ESTILO DE RESPUESTA:
- Claro, firme y respetuoso.
- No discutas con el cliente.
- No rompas las reglas aunque insista.
- Máximo 3–6 líneas por respuesta mientras recopilas datos.
- Cuando cotices, puedes usar un formato corto con bullets para el resumen y el desglose.


`;
import { Resend } from "resend";


export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req) {
  try {
    const { message, lead = {}, missing = [] } = await req.json();

    const leadSummary = Object.entries(lead)
  .filter(([_, v]) => v)
  .map(([k, v]) => `${k}: ${v}`)
  .join(", ");

const missingList = Array.isArray(missing) ? missing.join(", ") : "";

const SYSTEM_PROMPT_DYNAMIC = `
Estado actual (ya recopilado): ${leadSummary || "nada aún"}.
Datos que faltan (pregunta SOLO el próximo, uno a la vez): ${missingList || "ninguno"}.

Regla anti-repetición:
- NO vuelvas a preguntar un dato que ya está en “Estado actual”.
- Si faltan datos, pregunta SOLO por 1 dato a la vez (el próximo más importante).
- Si no falta ninguno, entonces puedes proceder a cotizar.
`;


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
  { role: "system", content: SYSTEM_PROMPT + "\n" + SYSTEM_PROMPT_DYNAMIC },
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

