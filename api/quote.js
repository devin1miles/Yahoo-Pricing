const cache = {};
const CACHE_TTL = 15000;
const FMP_KEY = process.env.FMP_KEY || 'xh5ngFkgupcqQ4d7ZPAZh9imAz8M8mHX';

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

  // Try FMP first
  try {
    const r = await fetch(
      `https://financialmodelingprep.com/stable/quote?symbol=${key}&apikey=${FMP_KEY}`
    );
    if (r.ok) {
      const json = await r.json();
      const quote = Array.isArray(json) ? json[0] : json;
      if (quote && quote.price) {
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
      }
    }
  } catch(e) {
    console.error('FMP error:', e);
  }

  // Fallback to Yahoo Finance
  try {
    const r = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/quote?symbols=${key}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Origin': 'https://finance.yahoo.com',
          'Referer': 'https://finance.yahoo.com',
        }
      }
    );
    if (r.ok) {
      const json = await r.json();
      const quote = json?.quoteResponse?.result?.[0];
      if (quote && quote.regularMarketPrice) {
        const data = {
          price:        quote.regularMarketPrice,
          change:       quote.regularMarketChange || 0,
          change_pct:   quote.regularMarketChangePercent || 0,
          high:         quote.regularMarketDayHigh || 0,
          low:          quote.regularMarketDayLow || 0,
          prev_close:   quote.regularMarketPreviousClose || 0,
          volume:       quote.regularMarketVolume || 0,
          name:         quote.longName || quote.shortName || key,
          market_state: quote.marketState || 'CLOSED'
        };
        cache[key] = { data, ts: Date.now() };
        return res.json(data);
      }
    }
  } catch(e) {
    console.error('Yahoo fallback error:', e);
  }

  // Both failed
  return res.status(502).json({ error: 'Data unavailable — try again shortly' });
}
