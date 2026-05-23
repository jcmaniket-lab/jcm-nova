exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) }; }

  const { action } = body;

  if (action === 'fetchSheet') {
    try {
      const url = 'https://docs.google.com/spreadsheets/d/1nbvLJgeDuTrDddEHO2vOgap6heJ-cDsVqY6yhdniLwI/gviz/tq?tqx=out:csv&sheet=Inquiries';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Not accessible');
      const csv = await res.text();
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, csv }) };
    } catch {
      return { statusCode: 200, headers, body: JSON.stringify({ success: false, csv: null }) };
    }
  }

  if (action === 'chat') {
    const { messages, context } = body;
    if (!messages || !Array.isArray(messages)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid messages' }) };
    }

    const system = `You are NOVA (Network for Operations & Venture Analytics) — the AI intelligence system for JCM Enterprise.

JCM Enterprise Profile:
- Business: Bearings & industrial components trading, Gujarat, India (since 2003)
- Products: SKF & FAG bearings (ball, roller, thrust, taper, pedestal, needle), V-belts, timing belts, chains, grease
- Locations: GIDC Kim, GIDC Udhna, GIDC Sachin, Gujarat
- Tagline: "Save Production Loss"
- Core value: Emergency/same-day supply, preventing factory downtime
- Customers: Factory purchase managers & maintenance heads
- Team: Owner (ANi), field sales, office staff (billing, store, delivery)
- Software: Busy (stock/invoicing), custom inquiry manager at jcm-inquiry.netlify.app

Bearing Knowledge:
- Ball bearings (6000/6200/6300 series): electric motors, pumps, fans, compressors
- Taper roller bearings: gearboxes, conveyors, rolling mills, axles
- Cylindrical roller bearings: heavy machinery, machine tools
- Needle bearings: textile machines, packaging machines
- Pedestal/plummer block: fans, blowers, heavy rotating equipment
- Thrust bearings: vertical shafts, cranes, press machines

GIDC Intelligence:
- GIDC Sachin: Textile, dyeing, chemical → ball bearings, needle bearings, belts
- GIDC Kim: Auto components, engineering, plastic → taper, roller bearings
- GIDC Udhna: Textile, chemical, small mfg → mixed bearings, belts, chains

${context ? 'Live business data:\n' + context : ''}

Rules:
- Speak English, use Hindi/Hinglish naturally (e.g. "Kal Kottex ka follow-up karo")
- Always cite actual numbers, names, dates from data
- Give sharp, concrete next actions
- Sound like a smart co-founder who knows every corner of JCM
- Never be vague or generic`;

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system,
          messages
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error?.message || 'API error');

      return { statusCode: 200, headers, body: JSON.stringify({ text: data.content[0].text }) };

    } catch (err) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'NOVA is temporarily offline. Try again in a moment.' }) };
    }
  }

  return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };
};
