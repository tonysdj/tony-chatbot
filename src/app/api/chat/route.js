import { Resend } from "resend";

export const runtime = "nodejs";

const resend = new Resend(process.env.RESEND_API_KEY);

const STEPS = [
  { key: "name", question: "¿Cuál es tu nombre completo?" },
  { key: "date", question: "¿Para qué fecha es el evento?" },
  { key: "startTime", question: "¿A qué hora comienza la actividad?" },
  { key: "endTime", question: "¿Y a qué hora termina?" },
  { key: "town", question: "¿En qué pueblo será el evento?" },
  { key: "venueType", question: "¿Donde será la actividad? (Casa, Salón de Actividades, Hotel, etc.)" },
  { key: "floor", question: "¿El montaje sería en primer o segundo piso?" },
  { key: "eventType", question: "¿Qué tipo de actividad es? (Cumpleaños, Boda, Quinceañero, etc.) " },
  { key: "email", question: "¿Cuál es tu correo electrónico?" },
  { key: "phone", question: "¿Y tu número de teléfono?" }
];

function parseTime(t) {
  if (!t) return null;
  const m = t.toLowerCase().match(/(\d{1,2})(:(\d{2}))?\s*(am|pm)?/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[3] ? parseInt(m[3], 10) : 0;
  let ap = m[4];

// Si no tiene am/pm:
if (!ap) {
  if (h === 12) {
    ap = "am"; // asumir medianoche
  } else if (h >= 1 && h <= 11) {
    ap = "pm"; // asumir noche
  }
}


  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return h + min / 60;
}

function calculateQuote(lead) {
  const start = parseTime(lead.startTime);
  const end = parseTime(lead.endTime);
  if (start == null || end == null) {
    return { price: null, hours: null, breakdown: "" };
  }

  let hours = end - start;
  if (hours <= 0) hours += 24;

  // ===============================
// PRECIO BASE SEGÚN FECHA
// ===============================
let basePrice = 350;
let baseLabel = "Servicio base DJ 5 horas";

const dateText = (lead.date || "").toLowerCase();

if (
  dateText.includes("24") && dateText.includes("dic") ||
  dateText.includes("25") && dateText.includes("dic") ||
  dateText.includes("31") && dateText.includes("dic") ||
  dateText.includes("1") && dateText.includes("ene")
) {
  basePrice = 500;
  baseLabel = "Servicio especial por fecha festiva";
}

let price = basePrice;
let breakdown = `${baseLabel}: $${basePrice}`;



  if (hours > 5) {
    const extra = hours - 5;
    const extraCost = extra * 50;
    price += extraCost;
    breakdown += ` + ${extra} hora(s) extra ($${extraCost})`;
  }

 const town = (lead.town || "").toLowerCase().trim();

const townFees = {
  // Metro ($0)
  "san juan": 0,
  "guaynabo": 0,
  "carolina": 0,
  "trujillo alto": 0,
  "bayamon": 0,
  "catano": 0,
  "canovanas": 0,
  "hato rey": 0,
  "cupey": 0,
  "rio piedras": 0,
  "isla verde": 0,
  "levittown": 0,
  "caguas": 0,

  // Distancia 1 ($25)
  "rio grande": 25,
  "toa baja": 25,
  "toa alta": 25,
  "dorado": 25,
  "vega alta": 25,
  "vega baja": 25,
  "naranjito": 25,
  "aguas buenas": 25,
  "loiza": 25,
  

  // Distancia 2 ($50)
  "arecibo": 50,
  "barceloneta": 50,
  "cayey": 50,
  "gurabo": 50,
  "juncos": 50,
  "cidra": 50,
  

  // Distancia 3 ($75)
  "san lorenzo": 75,
  "fajardo": 75,
  "luquillo": 75,
  "santa isabel": 75,
  "las piedras": 75,
  "humacao": 75,
  "naguabo": 75,
  "corozal": 75,
  "ceiba": 75,

  // Distancia 4 ($100)
  "guayanilla": 100,
  "penuelas": 100,
  "ponce": 100,
  "comerio": 100,
  "salinas": 100,
  "yabucoa": 100,
  "maunabo": 100,
  "barranquitas": 100,
  "florida": 100,
  "manati": 100,
  "ciales": 100,
  "morovis": 100,
  "orocovis": 100,
  "hatillo": 100,
  "camuy": 100,
  "quebradillas": 100,
  "juana diaz": 100,
  "villalba": 100,
  "coamo": 100,
  "guayama": 100,
  "aibonito": 100,
  "arroyo": 100,
  "patillas": 100,
  "lares": 100,
  "san sebastian": 100,
  "castaner": 100,

  // Distancia 5 ($200)
  "utuado": 200,
  "sabana grande": 200,
  "adjuntas": 200,
  "maricao": 200,
  "mayaguez": 200,
  "aguadilla": 200,
  "las marias": 200,
  "jayuya": 200,
  "rincon": 200,
  "cabo rojo": 200,
  "san german": 200,
  "hormigueros": 200,
  "lajas": 200,
  "isabela": 200,
  "aguada": 200,
  "anasco": 200,
  "moca": 200,
  "guanica": 200,
  "yauco": 200,
};

const manualQuote = ["vieques","culebra"];

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
    const { lead = {} } = await req.json();

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
