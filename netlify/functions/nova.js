const crypto = require('crypto');

const AI_KEY = process.env.ANTHROPIC_API_KEY;
const SHEET_ID = '1nbvLJgeDuTrDddEHO2vOgap6heJ-cDsVqY6yhdniLwI';

function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin)).digest('hex');
}

function makeToken(userId) {
  const day = new Date().toISOString().split('T')[0];
  return crypto.createHmac('sha256', String(AI_KEY || 'nova')).update(`${userId}:${day}`).digest('hex');
}

function isValidToken(userId, token) {
  try {
    const a = Buffer.from(makeToken(userId));
    const b = Buffer.from(String(token));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch { return false; }
}

const USERS = [
  { id: 'user-1', name: 'ANi', role: 'owner' },
  { id: 'user-2', name: 'Manager 1', role: 'manager' },
  { id: 'user-3', name: 'Manager 2', role: 'manager' }
];

const PIN_HASH = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';

const SYSTEM = (ctx) => `You are NOVA - AI for JCM Enterprise, bearings trading company in Gujarat India since 2003. Products: SKF & FAG bearings, V-belts, chains, grease. Areas: GIDC Kim, Sachin, Udhna. Tagline: Save Production Loss.

Bearing knowledge:
- Ball bearings 6000/6200/6300: motors, pumps, fans, textile spindles
- Taper roller 30000: gearboxes, conveyors, rolling mills  
- Needle NA/NK: textile machines, packaging
- Pedestal SY/SNL: fans, blowers
- SKF 6205 = FAG 6205 (cross reference)

GIDC: Sachin=textile/chemical, Kim=auto/engineering, Udhna=textile/small mfg

${ctx ? 'Live data:\n' + ctx : ''}

Speak English + Hindi naturally. Be specific, cite real names and numbers. Sharp like a co-founder.`;

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
  catch { return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'Bad request' }) }; }

  const ok = (data) => ({ statusCode: 200, headers: H, body: JSON.stringify(data) });
  const fail = (msg, code = 400) => ({ statusCode: code, headers: H, body: JSON.stringify({ error: msg }) });

  // LOGIN
  if (body.action === 'login') {
    const pinHash = hashPin(String(body.pin || ''));
    if (pinHash !== PIN_HASH) return fail('Wrong PIN. Try again.', 401);
    const user = USERS[0];
    return ok({ success: true, token: makeToken(user.id), userId: user.id, name: user.name, role: user.role });
  }

  // AUTH
  if (!isValidToken(body.userId, body.token)) return fail('Session expired.', 401);

  // FETCH SHEET
  if (body.action === 'fetchSheet') {
    try {
      const url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq?tqx=out:csv&sheet=Inquiries';
      const res = await fetch(url);
      if (!res.ok) return ok({ success: false, csv: null });
      const csv = await res.text();
      return ok({ success: true, csv });
    } catch (e) {
      return ok({ success: false, csv: null });
    }
  }

  // CHAT
  if (body.action === 'chat') {
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
          system: SYSTEM(body.context || ''),
          messages: body.messages || []
        })
      });
      const d = await res.json();
      if (!res.ok) return fail('AI error', 500);
      return ok({ text: d.content[0].text });
    } catch (e) {
      return fail('NOVA offline', 500);
    }
  }

  // SAVE INVOICE
  if (body.action === 'saveInvoice') {
    try {
      const SB_URL = process.env.SUPABASE_URL;
      const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
      const table = body.type === 'purchase' ? 'purchase_invoices' : 'sales_invoices';
      const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SB_KEY,
          'Authorization': `Bearer ${SB_KEY}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(body.invoiceData)
      });
      const d = await res.json();
      return ok({ success: res.ok, data: d });
    } catch (e) {
      return fail('Save failed', 500);
    }
  }

  // GET INVOICES
  if (body.action === 'getInvoices') {
    try {
      const SB_URL = process.env.SUPABASE_URL;
      const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
      const table = body.type === 'purchase' ? 'purchase_invoices' : 'sales_invoices';
      const res = await fetch(`${SB_URL}/rest/v1/${table}?order=invoice_date.desc&limit=50`, {
        headers: {
          'apikey': SB_KEY,
          'Authorization': `Bearer ${SB_KEY}`
        }
      });
      const d = await res.json();
      return ok({ success: true, data: d });
    } catch (e) {
      return ok({ success: true, data: [] });
    }
  }

  return fail('Unknown action');
};
