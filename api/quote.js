const cache = {};
const CACHE_TTL = 15000;
const TWELVE_KEY = process.env.TWELVE_KEY || '700cce7e4a3c42678f223474057380b6';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Symbol required' });

  const key = symbol.toUpperCase();

  const cached = cache[key];
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return res.json(cached.data);
  }

  try {
    const r = await fetch(
      `https://api.twelvedata.com/quote?symbol=${key}&apikey=${TWELVE_KEY}`
    );

    if (!r.ok) return res.status(502).json({ error: 'Data unavailable' });

    const q = await r.json();

    if (q.status === 'error' || !q.close) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    const data = {
      price:        parseFloat(q.close),
      change_pct:   parseFloat(q.percent_change) || 0,
      name:         q.name || key,
      market_state: q.is_market_open ? 'REGULAR' : 'CLOSED'
    };

    cache[key] = { data, ts: Date.now() };
    return res.json(data);

  } catch(e) {
    console.error('TwelveData error:', e);
    return res.status(500).json({ error: 'Server error — try again' });
  }
}
