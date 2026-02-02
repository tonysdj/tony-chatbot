import { Resend } from "resend";

/**
 * ✅ PROMPT FINAL (cotiza con desglose y preguntas guiadas)
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

FORMA DE HACER LAS PREGUNTAS:
- UNA pregunta a la vez.
- Nunca hagas listas.
- Espera respuesta antes de continuar.
- PROHIBIDO repetir preguntas ya contestadas.
- Si falta información, pregunta SOLO por el próximo dato pendiente.
- Usa ejemplos cuando ayuden al cliente a contestar mejor.

PREGUNTA OBLIGATORIA SOBRE EL LUGAR:
Cuando preguntes por el lugar del evento, DEBES hacerlo así:
“¿En qué pueblo será el evento y qué tipo de lugar es?
Por ejemplo: casa, salón de actividades, negocio, restaurante, hotel, centro comunal, terraza, etc.”

PREGUNTA OBLIGATORIA SOBRE EL TIPO DE ACTIVIDAD:
Cuando preguntes por el tipo de actividad, DEBES hacerlo así:
“¿Qué tipo de actividad será?
Por ejemplo: cumpleaños, boda, quinceañero, evento corporativo, bautizo, aniversario, actividad familiar, etc.”

SI FALTA ALGÚN DATO:
- Explica con cortesía que necesitas esa información.
- No menciones precios aunque el cliente insista.

UBICACIÓN DEL SERVICIO:
- Base: San Juan (Río Piedras).

PRECIO BASE:
- $350 por 5 horas en área metropolitana.

HORAS ADICIONALES:
- Más de 5 horas → $25 cada 30 minutos.
- Fracciones se redondean hacia arriba.
- Mostrar como “Tiempo adicional”.

ZONAS DE DISTANCIA:
ZONA A (SIN cargo):
San Juan, Río Piedras, Santurce, Hato Rey, Cupey, Carolina,
Trujillo Alto, Guaynabo, Bayamón, Cataño, Toa Baja, Dorado.

ZONA B → $25:
Caguas, Gurabo, Canóvanas, Loíza, Río Grande, Toa Alta,
Vega Baja, Vega Alta, Naranjito.

ZONA C → $100:
Arecibo, Barceloneta, Manatí, Humacao, Juncos,
San Lorenzo, Fajardo.

ZONA D → $150:
Ponce, Mayagüez, Aguadilla, Cabo Rojo,
Isabela, Hatillo, Jayuya, Utuado, Yauco.

REGLAS ESPECIALES:

THE PLACE – CONDADO
- Solo aplica cuando ya estén los 7 datos.
- Tarifa fija: $500.
- No se calculan horas ni distancia.
- Mostrar como “Tarifa fija”.

CENTRO DE CONVENCIONES – CATAÑO
- Calcular tarifa regular.
- Añadir SIEMPRE $100.
- Mostrar como “Cargo por complejidad del montaje”.

REGLA FINAL DE CÁLCULO:
TOTAL = precio base
+ tiempo adicional (si aplica)
+ cargo por distancia (si aplica)
+ cargo por complejidad (si aplica).

SALIDA FINAL (FORMATO OBLIGATORIO):
Mostrar SOLO los cargos que apliquen:

Precio base: $XXX
Tiempo adicional: $XXX
Cargo por distancia: $XXX
Cargo por complejidad: $XXX
Total: $XXX

Tony se comunicará contigo para confirmar disponibilidad.

ESTILO:
- Profesional
- Claro
- Directo
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
- Si no falta ninguno, procede a resumir mentalmente y cotizar usando el formato OBLIGATORIO (TOTAL + 2da oración de extras, sin desglose).

REGLA DE CIERRE (OBLIGATORIA):
Si "Datos que faltan" es "ninguno":
- Estás OBLIGADO a devolver el TOTAL FINAL ya calculado.
- NO puedes responder solo con el precio base si hay horas adicionales o si el pueblo no es Zona A.
`;

    // Llamada a OpenAI
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`, // ✅ FIX: template literal correcto (sin escapes)
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        input: [
          { role: "system", content: SYSTEM_PROMPT + "\n" + SYSTEM_PROMPT_DYNAMIC },
          { role: "user", content: message },
        ],
        truncation: "auto",
        max_output_tokens: 200, // ✅ más corto para forzar brevedad
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
        console.error(
          "❌ RESEND_API_KEY no está disponible en runtime (revisa Vercel env vars en Production)."
        );
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
            subject: `Nuevo Evento Tony’s DJ – ${lead?.name || "Cliente"} – ${
              lead?.date || ""
            } – ${lead?.town || ""}`,
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
