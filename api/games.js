let cachedToken = null;
let tokenExpiry = 0;

async function getTwitchToken(clientId, clientSecret) {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`, {
    method: 'POST'
  });
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
  return cachedToken;
}

export default async function handler(req, res) {
  const { search, similar, id } = req.query;
  
  // Remplis ici tes identifiants Twitch Developer (gratuits sur dev.twitch.tv)
  const CLIENT_ID = process.env.TWITCH_CLIENT_ID || 'TON_CLIENT_ID';
  const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || 'TON_CLIENT_SECRET';

  try {
    const token = await getTwitchToken(CLIENT_ID, CLIENT_SECRET);
    const headers = {
      'Client-ID': CLIENT_ID,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'text/plain'
    };

    let query = '';
    if (search) {
      query = `search "${search}"; fields name, cover.url, first_release_date, genres.name, summary, storyline, url; limit 10;`;
    } else if (similar === 'true' && id) {
      query = `fields similar_games; where id = ${id};`;
    } else {
      return res.status(400).json({ error: 'Paramètres manquants' });
    }

    const response = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers,
      body: query
    });

    const data = await response.json();

    // Si on cherche des jeux similaires, on récupère les détails de chaque ID renvoyé
    if (similar === 'true' && data.length > 0 && data[0].similar_games) {
      const simIds = data[0].similar_games.slice(0, 20).join(',');
      const simQuery = `fields name, cover.url, first_release_date, genres.name, summary, url; where id = (${simIds}); limit 20;`;
      const simRes = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers,
        body: simQuery
      });
      const simData = await simRes.json();
      return res.status(200).json({ results: simData.map(formatGame) });
    }

    const results = (Array.isArray(data) ? data : []).map(formatGame);
    return res.status(200).json({ results });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

function formatGame(g) {
  let imageUrl = '';
  if (g.cover && g.cover.url) {
    imageUrl = 'https:' + g.cover.url.replace('t_thumb', 't_cover_big');
  }
  return {
    id: g.id,
    name: g.name,
    released: g.first_release_date ? new Date(g.first_release_date * 1000).toISOString().split('T')[0] : null,
    background_image: imageUrl,
    description: g.summary || g.storyline || 'Aucune description disponible.',
    genres: g.genres || [],
    site_detail_url: g.url
  };
}
