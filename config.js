// api/config.js — Vercel Serverless Function
// GET /api/config
// Safely exposes the Discord Client ID to the frontend
// Set DISCORD_CLIENT_ID in Vercel Dashboard → Project → Settings → Environment Variables

export default function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!clientId) {
    console.warn('[config] DISCORD_CLIENT_ID env var is not set');
    return res.status(200).json({ clientId: null, demo: true });
  }

  return res.status(200).json({ clientId });
}
