const cache = {};
const CACHE_TTL = 15000;

const FMP_KEY = process.env.FMP_KEY;

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
      `https://financialmodelingprep.com/api/v3/quote/${key}?apikey=${FMP_KEY}`
    );

    if (!r.ok) return res.status(502).json({ error: 'Data unavailable' });

    const json = await r.json();
    const quote = json?.[0];

    if (!quote || !quote.price) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    const data = {
      price:        quote.price,
      change:       quote.change || 0,
      change_pct:   quote.changesPercentage || 0,
      high:         quote.dayHigh || 0,
      low:          quote.dayLow || 0,
      prev_close:   quote.previousClose || 0,
      volume:       quote.volume || 0,
      name:         quote.name || key,
      market_state: quote.isActivelyTrading ? 'REGULAR' : 'CLOSED'
    };

    cache[key] = { data, ts: Date.now() };
    return res.json(data);

  } catch(e) {
    console.error('FMP fetch error:', e);
    return res.status(500).json({ error: 'Server error — try again' });
  }
}
