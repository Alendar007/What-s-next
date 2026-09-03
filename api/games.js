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
  const { search, similar, id, news, name } = req.query;
  
  const CLIENT_ID = process.env.TWITCH_CLIENT_ID;
  const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

  try {
    const token = await getTwitchToken(CLIENT_ID, CLIENT_SECRET);
    const headers = {
      'Client-ID': CLIENT_ID,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'text/plain'
    };

    // Récupération des actualités de moins de 6 mois
    if (news === 'true' && name) {
      const rssRes = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(name + ' jeu video')}&hl=fr&gl=FR&ceid=FR:fr`);
      const rssText = await rssRes.text();
      
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      const newsList = [];
      const sixMonthsAgo = Date.now() - (6 * 30 * 24 * 3600 * 1000);

      while ((match = itemRegex.exec(rssText)) !== null) {
        const itemXml = match[1];
        const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/);
        const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/);
        const dateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
        const sourceMatch = itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/);

        if (titleMatch && linkMatch && dateMatch) {
          const pubDate = new Date(dateMatch[1]).getTime();
          if (!isNaN(pubDate) && pubDate >= sixMonthsAgo) {
            const cleanTitle = titleMatch[1].replace('<![CDATA[', '').replace(']]>', '').trim();
            newsList.push({
              title: cleanTitle,
              link: linkMatch[1].replace('<![CDATA[', '').replace(']]>', '').trim(),
              pubDate: dateMatch[1],
              source: sourceMatch ? sourceMatch[1] : 'Actualité'
            });
          }
        }
      }
      return res.status(200).json({ results: newsList.slice(0, 10) });
    }

    // Jeux similaires
    if (similar === 'true' && id) {
      const query = `fields similar_games; where id = ${id};`;
      const response = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers,
        body: query
      });
      const data = await response.json();
      if (data.length > 0 && data[0].similar_games) {
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
      return res.status(200).json({ results: [] });
    }

    // Recherche classique
    if (search) {
      const query = `search "${search}"; fields name, cover.url, first_release_date, genres.name, summary, storyline, url; limit 6;`;
      const response = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers,
        body: query
      });
      const data = await response.json();
      const results = (Array.isArray(data) ? data : []).map(formatGame);
      return res.status(200).json({ results });
    }

    return res.status(400).json({ error: 'Paramètres manquants' });

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
