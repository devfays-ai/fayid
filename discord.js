// api/auth/discord.js — Vercel Serverless Function
// POST /api/auth/discord
// Exchanges Discord OAuth2 authorization code for user info
//
// Required Vercel Environment Variables:
//   DISCORD_CLIENT_ID      — Your Discord App Client ID
//   DISCORD_CLIENT_SECRET  — Your Discord App Client Secret
//   DISCORD_REDIRECT_URI   — e.g. https://yourproject.vercel.app/callback.html

export default async function handler(req, res) {
  // CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI } = process.env;

  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
    console.error('[discord auth] Missing env vars');
    return res.status(500).json({ error: 'Server misconfigured — missing Discord credentials' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { code, redirect_uri } = body || {};

  if (!code) {
    return res.status(400).json({ error: 'Missing code parameter' });
  }

  const redirectUri = redirect_uri || DISCORD_REDIRECT_URI;

  // ── Step 1: Exchange code for access token ──────────────────────────────────
  let tokenData;
  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[discord auth] Token exchange failed:', errText);
      return res.status(401).json({ error: 'Token exchange failed', detail: errText });
    }

    tokenData = await tokenRes.json();
  } catch (err) {
    console.error('[discord auth] Token fetch error:', err);
    return res.status(500).json({ error: 'Failed to contact Discord API' });
  }

  // ── Step 2: Fetch Discord user profile ─────────────────────────────────────
  let discordUser;
  try {
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      console.error('[discord auth] Failed to fetch user, status:', userRes.status);
      return res.status(401).json({ error: 'Failed to fetch Discord user' });
    }

    discordUser = await userRes.json();
  } catch (err) {
    console.error('[discord auth] User fetch error:', err);
    return res.status(500).json({ error: 'Failed to fetch Discord user' });
  }

  // ── Step 3: Build safe user object ─────────────────────────────────────────
  const discriminator = discordUser.discriminator && discordUser.discriminator !== '0'
    ? `#${discordUser.discriminator}`
    : '';

  const avatarUrl = discordUser.avatar
    ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=128`
    : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(discordUser.id) % 5n)}.png`;

  const user = {
    id: discordUser.id,
    username: `${discordUser.username}${discriminator}`,
    global_name: discordUser.global_name || discordUser.username,
    avatar_url: avatarUrl,
  };

  return res.status(200).json(user);
}
