const express = require('express');
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

// ── Quote cache ──────────────────────────────────────
const quoteCache = {};
const QUOTE_TTL  = 15000;

app.get('/api/quote', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Symbol required' });

  const key = symbol.toUpperCase();
  const TWELVE_KEY = process.env.TWELVE_KEY;

  const cached = quoteCache[key];
  if (cached && Date.now() - cached.ts < QUOTE_TTL) {
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

    quoteCache[key] = { data, ts: Date.now() };
    return res.json(data);

  } catch(e) {
    console.error('Quote error:', e);
    return res.status(500).json({ error: 'Server error — try again' });
  }
});

// ── News cache ───────────────────────────────────────
const newsCache = {};
const NEWS_TTL  = 300000;

app.get('/api/news', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Symbol required' });

  const key = symbol.toUpperCase();
  const FINNHUB_KEY = process.env.FINNHUB_KEY;
  if (!FINNHUB_KEY) return res.status(500).json({ error: 'News service not configured' });

  const cached = newsCache[key];
  if (cached && Date.now() - cached.ts < NEWS_TTL) {
    return res.json(cached.data);
  }

  const today = new Date();
  const from  = new Date(today - 7 * 24 * 60 * 60 * 1000);
  const fmt   = d => d.toISOString().split('T')[0];

  try {
    const r = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${key}&from=${fmt(from)}&to=${fmt(today)}&token=${FINNHUB_KEY}`
    );
    if (!r.ok) return res.status(502).json({ error: 'News unavailable' });

    const articles = await r.json();
    const top3 = articles.filter(a => a.headline && a.url).slice(0, 3);

    const data = { articles: top3 };
    newsCache[key] = { data, ts: Date.now() };
    return res.json(data);

  } catch(e) {
    console.error('News error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ── Risk analysis ────────────────────────────────────
app.post('/api/risk', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'Risk analysis not configured' });

  const {
    ticker, price, mode, cp, strike,
    premium, width, dte, iv, pop, ev, maxGain, maxLoss
  } = req.body;

  const tradeContext = `
Ticker: ${ticker} at $${price}
Trade type: ${mode} ${cp}
Strike: $${strike}
Premium: $${premium} per share ($${(premium * 100).toFixed(0)} per contract)
Spread width: $${width || 'N/A'}
Days to expiration: ${dte}
Implied volatility: ${iv}%
Probability of profit: ${(pop * 100).toFixed(1)}%
Expected value: $${(ev * 100).toFixed(2)} per contract
Max gain: $${maxGain !== null ? (maxGain * 100).toFixed(0) : 'Unlimited'}
Max loss: $${(maxLoss * 100).toFixed(0)}
  `.trim();

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: `You are a risk analyst for a retail options trading app. Your audience is beginner to intermediate traders who are risk-averse.

Identify exactly 3 specific risks for this trade in plain English. Rules:
- One sentence per risk detail. Maximum 20 words per detail.
- No generic disclaimers. Only risks specific to THIS trade's parameters.
- Flag IV crush if DTE is under 14 or IV is above 80%.
- Flag time decay if DTE is under 7.
- Flag unfavorable probability if POP is under 40%.
- Flag poor risk:reward if max loss exceeds 2x max gain.
- Flag earnings proximity if DTE is 1-5 and IV is above 60%.
- Explain any term you use in plain language.

Return ONLY valid JSON, no other text:
{"risks":[{"title":"Risk Name","detail":"One sentence."},{"title":"Risk Name","detail":"One sentence."},{"title":"Risk Name","detail":"One sentence."}]}`,
        messages: [{ role: 'user', content: tradeContext }]
      })
    });

    const data = await r.json();
    const text = data.content?.[0]?.text || '{}';

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch(e) {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { risks: [] };
    }

    return res.json(parsed);

  } catch(e) {
    console.error('Risk analysis error:', e);
    return res.status(500).json({ error: 'Analysis failed' });
  }
});

// ── Start ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`OPTS// running on port ${PORT}`));
