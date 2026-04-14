const cache = {};
const CACHE_TTL = 300000; // 5 minutes

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

  const FINNHUB_KEY = process.env.FINNHUB_KEY;
  if (!FINNHUB_KEY) return res.status(500).json({ error: 'News service not configured' });

  const today = new Date();
  const from = new Date(today - 7 * 24 * 60 * 60 * 1000);
  const fmt = d => d.toISOString().split('T')[0];

  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${key}&from=${fmt(from)}&to=${fmt(today)}&token=${FINNHUB_KEY}`
    );

    if (!r.ok) return res.status(502).json({ error: 'News unavailable' });

    const articles = await r.json();
    const top3 = articles.filter(a => a.headline && a.url).slice(0, 3);

    const data = { articles: top3 };
    cache[key] = { data, ts: Date.now() };
    return res.json(data);

  } catch(e) {
    console.error('News fetch error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
