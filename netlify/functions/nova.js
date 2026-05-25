const crypto = require('crypto');

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const AI_KEY = process.env.ANTHROPIC_API_KEY;
const SHEET_ID = '1nbvLJgeDuTrDddEHO2vOgap6heJ-cDsVqY6yhdniLwI';

async function sbQuery(path, method = 'GET', body = null, extra = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SB_KEY,
      'Authorization': `Bearer ${SB_KEY}`,
      ...extra
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await res.text();
  try { return { data: JSON.parse(text), ok: res.ok }; }
  catch { return { data: text, ok: res.ok }; }
}

function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin)).digest('hex');
}

function makeToken(userId) {
  const day = new Date().toISOString().split('T')[0];
  return crypto.createHmac('sha256', AI_KEY).update(`${userId}:${day}`).digest('hex');
}

function isValidToken(userId, token) {
  try {
    const a = Buffer.from(makeToken(userId));
    const b = Buffer.from(String(token));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

const NOVA_SYSTEM = (ctx) => `You are NOVA (Network for Operations & Venture Analytics) — the AI intelligence system for JCM Enterprise, a bearings and industrial components trading company in Gujarat, India (since 2003).

JCM ENTERPRISE
- Products: SKF & FAG bearings (ball, roller, thrust, taper, pedestal, needle), V-belts, timing belts, chains, grease
- Areas: GIDC Kim, GIDC Udhna, GIDC Sachin and surrounding Gujarat industrial zones
- Tagline: "Save Production Loss" — same-day emergency supply is the core strength
- Customers: Factory purchase managers & maintenance heads

BEARING KNOWLEDGE
- Ball bearings 6000/6200/6300 → electric motors, pumps, fans, compressors, textile spindles
- Taper roller 30000 series → gearboxes, conveyors, rolling mills, heavy machinery
- Cylindrical roller NU/NJ → machine tools, heavy industrial equipment
- Needle NA/NK → textile machines, packaging, two-wheelers
- Pedestal/Plummer SY/SNL → fans, blowers, agriculture
- Thrust 51000 → vertical shafts, cranes, presses
- Cross-ref: SKF 6205 = FAG 6205 | SKF 6205-2RS = FAG 6205-2RSR

GIDC INTELLIGENCE
- Sachin: Textile, dyeing, chemicals → ball bearings, needle bearings, V-belts
- Kim: Auto components, engineering → taper bearings, roller bearings
- Udhna: Textile, chemical, small mfg → mixed bearings, belts, chains

${ctx ? `LIVE JCM DATA\n${ctx}` : 'No live data loaded yet.'}

STYLE
- English + Hindi/Hinglish naturally mixed
- Always cite real names, numbers from data
- Sharp, specific, actionable — like a co-founder
- Never vague when data exists`;

exports.handler = async (event) => {
  const H = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: H, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: H, body: JSON.stringify({ error: 'Method not allowed' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'Invalid request' }) }; }

  const respond = (data, code = 200) => ({
    statusCode: code,
    headers: H,
    body: JSON.stringify(data)
  });

  // ── LOGIN ──────────────────────────────────────────────────────
  if (body.action === 'login') {
    const { pin } = body;
    if (!pin) return respond({ error: 'PIN required' }, 400);

    const USERS = [
      { id: 'user-1', name: 'ANi', role: 'owner', hash: process.env.NOVA_PIN_HASH },
      { id: 'user-2', name: 'Manager 1', role: 'manager', hash: process.env.NOVA_PIN_HASH_M1 || process.env.NOVA_PIN_HASH },
      { id: 'user-3', name: 'Manager 2', role: 'manager', hash: process.env.NOVA_PIN_HASH_M2 || process.env.NOVA_PIN_HASH }
    ];

    const pinHash = hashPin(pin);
    const user = USERS.find(u => u.hash && u.hash === pinHash);
    if (!user) return respond({ error: 'Wrong PIN. Try again.' }, 401);
    return respond({
      success: true,
      token: makeToken(user.id),
      userId: user.id,
      name: user.name,
      role: user.role
    });
  }

  // ── AUTH CHECK ─────────────────────────────────────────────────
  const { token, userId } = body;
  if (!token || !userId || !isValidToken(userId, token))
    return respond({ error: 'Session expired. Please log in again.' }, 401);

  // ── FETCH SHEET ────────────────────────────────────────────────
  if (body.action === 'fetchSheet') {
    try {
      const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Inquiries`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Sheet not accessible');
      const csv = await res.text();
      return respond({ success: true, csv });
    } catch (e) {
      return respond({ success: false, csv: null, error: e.message });
    }
  }

  // ── GET INVOICES ───────────────────────────────────────────────
  if (body.action === 'getInvoices') {
    const table = body.type === 'purchase' ? 'purchase_invoices' : 'sales_invoices';
    const { data, ok } = await sbQuery(`${table}?order=invoice_date.desc&limit=${body.limit || 50}`);
    if (!ok) return respond({ error: 'Failed to fetch invoices' }, 500);
    return respond({ success: true, data: data || [] });
  }

  // ── SAVE INVOICE ───────────────────────────────────────────────
  if (body.action === 'saveInvoice') {
    const { type, invoiceData } = body;
    if (!type || !invoiceData) return respond({ error: 'Missing data' }, 400);
    const table = type === 'purchase' ? 'purchase_invoices' : 'sales_invoices';
    if (type === 'sales' && invoiceData.customer_name) {
      invoiceData.customer_name_normalized = invoiceData.customer_name
        .toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    }
    const { data, ok } = await sbQuery(table, 'POST', invoiceData, { 'Prefer': 'return=representation' });
    if (!ok) return respond({ error: 'Failed to save invoice' }, 500);
    return respond({ success: true, data });
  }

  // ── CHAT ───────────────────────────────────────────────────────
  if (body.action === 'chat') {
    const { messages, context } = body;
    if (!messages?.length) return respond({ error: 'No messages' }, 400);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': AI_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          system: NOVA_SYSTEM(context),
          messages
        })
      });
      const d = await res.json();
      if (!res.ok || d.error) throw new Error(d.error?.message || 'AI error');
      return respond({ text: d.content[0].text });
    } catch (err) {
      return respond({ error: 'NOVA temporarily offline. Try again.' }, 500);
    }
  }

  return respond({ error: 'Unknown action' }, 400);
};
