import { Resend } from "resend";

export const runtime = "nodejs";

const resend = new Resend(process.env.RESEND_API_KEY);

const STEPS = [
  { key: "name", question: "¿Cuál es tu nombre completo?" },
  { key: "date", question: "¿Para qué fecha es el evento?" },
  { key: "startTime", question: "¿A qué hora comienza la actividad?" },
  { key: "endTime", question: "¿Y a qué hora termina?" },
  { key: "town", question: "¿En qué pueblo será el evento?" },
  { key: "venueType", question: "¿Donde será la actividad? (Casa, Salón, Hotel, etc.)" },
  { key: "floor", question: "¿El montaje sería en primer o segundo piso?" },
  { key: "eventType", question: "¿Qué tipo de actividad es?" },
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

  if (!ap) {
    if (h === 12) ap = "am";
    else if (h >= 1 && h <= 11) ap = "pm";
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

  let price = 350;
  let breakdown = `Servicio base DJ 5 horas: $350`;

  if (hours > 5) {
    const extra = hours - 5;
    const extraCost = extra * 50;
    price += extraCost;
    breakdown += ` + ${extra} hora(s) extra ($${extraCost})`;
  }

  const town = (lead.town || "").toLowerCase().trim();
  const townFees = {
    "san juan": 0,
    "guaynabo": 0,
    "carolina": 0,
    "bayamon": 0,
    "catano": 0,
    "caguas": 25,
    "dorado": 25,
    "fajardo": 75,
    "ponce": 75
  };

  const manualQuote = ["vieques", "culebra"];
  if (manualQuote.includes(town)) {
    return {
      price: null,
      hours,
      breakdown: "Este destino requiere cotización manual."
    };
  }

  let distanceFee = townFees[town] || 0;
  if (distanceFee > 0) {
    price += distanceFee;
    breakdown += ` + recargo por distancia ($${distanceFee})`;
  }

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
    const { lead = {}, message = "" } = await req.json();

    // RESPUESTAS GENERALES
    const msg = (message || "").toLowerCase();

    if (!lead.name) {
      if (msg.includes("incluye") || msg.includes("servicio")) {
        return new Response(
          JSON.stringify({
            reply:
              "Mi servicio incluye DJ con música variada o personalizada, karaoke con micrófonos, luces básicas y fotos durante la actividad. El servicio dura 5 horas."
          }),
          { status: 200, headers: corsHeaders() }
        );
      }

      if (msg.includes("pago") || msg.includes("deposito")) {
        return new Response(
          JSON.stringify({
            reply:
              "No se requiere depósito. El pago se realiza el mismo día de la actividad por ATH Móvil o efectivo."
          }),
          { status: 200, headers: corsHeaders() }
        );
      }

      if (msg.includes("precio") || msg.includes("cuanto")) {
        return new Response(
          JSON.stringify({
            reply:
              "El precio depende de la distancia y el horario. Si gustas, te preparo una cotización. ¿Cuál es tu nombre completo?"
          }),
          { status: 200, headers: corsHeaders() }
        );
      }
    }

    const nextStep = STEPS.find(step => !lead[step.key]);
    if (nextStep) {
      return new Response(
        JSON.stringify({ reply: nextStep.question }),
        { status: 200, headers: corsHeaders() }
      );
    }

    const quote = calculateQuote(lead);

    return new Response(
      JSON.stringify({
        reply:
          `¡Perfecto! Aquí tienes tu cotización:\n` +
          `${quote.breakdown}\n` +
          `Total: $${quote.price}`
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
