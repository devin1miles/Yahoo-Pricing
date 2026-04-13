const cache = {};
const CACHE_TTL = 15000;
const SCRAPER_KEY = process.env.SCRAPER_KEY || 'e101cc35c811bad78f6c86055dd9b5ea';

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

  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/quote?symbols=${key}&fields=regularMarketPrice,regularMarketChangePercent,longName,shortName,marketState`;
  const scraperUrl = `http://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(yahooUrl)}`;

  try {
    const r = await fetch(scraperUrl);
    if (!r.ok) return res.status(502).json({ error: 'Data unavailable' });

    const json = await r.json();
    const quote = json?.quoteResponse?.result?.[0];

    if (!quote || !quote.regularMarketPrice) {
      return res.status(404).json({ error: 'Symbol not found' });
    }

    const data = {
      price:        quote.regularMarketPrice,
      change_pct:   quote.regularMarketChangePercent || 0,
      name:         quote.longName || quote.shortName || key,
      market_state: quote.marketState || 'CLOSED'
    };

    cache[key] = { data, ts: Date.now() };
    return res.json(data);

  } catch(e) {
    console.error('ScraperAPI error:', e);
    return res.status(500).json({ error: 'Server error — try again' });
  }
}
