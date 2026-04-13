const cache = {};
const CACHE_TTL = 15000;

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
      `https://query1.finance.yahoo.com/v8/finance/quote?symbols=${key}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      }
    );

    if (!r.ok) return res.status(502).json({ error: 'Yahoo Finance unavailable' });

    const json = await r.json();
    const quote = json?.quoteResponse?.result?.[0];

    if (!quote || !quote.regularMarketPrice) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    const data = {
      price:      quote.regularMarketPrice,
      change:     quote.regularMarketChange || 0,
      change_pct: quote.regularMarketChangePercent || 0,
      high:       quote.regularMarketDayHigh || 0,
      low:        quote.regularMarketDayLow || 0,
      prev_close: quote.regularMarketPreviousClose || 0,
      volume:     quote.regularMarketVolume || 0,
      name:       quote.longName || quote.shortName || key,
      market_state: quote.marketState || 'CLOSED'
    };

    cache[key] = { data, ts: Date.now() };
    return res.json(data);

  } catch(e) {
    console.error('Yahoo fetch error:', e);
    return res.status(500).json({ error: 'Server error — try again' });
  }
}
