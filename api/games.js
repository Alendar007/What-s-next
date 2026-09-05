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

    // Actualités via Google News RSS
    if (news === 'true' && name) {
      const rssRes = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(name + ' jeu video')}&hl=fr&gl=FR&ceid=FR:fr`);
      const rssText = await rssRes.text();
      
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match;
      const newsList = [];

      while ((match = itemRegex.exec(rssText)) !== null) {
        const itemXml = match[1];
        const titleMatch = itemXml.match(/<title>([\s\S]*?)<\/title>/);
        const linkMatch = itemXml.match(/<link>([\s\S]*?)<\/link>/);
        const dateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
        const sourceMatch = itemXml.match(/<source[^>]*>([\s\S]*?)<\/source>/);

        if (titleMatch && linkMatch && dateMatch) {
          const cleanTitle = titleMatch[1].replace('<![CDATA[', '').replace(']]>', '').trim();
          newsList.push({
            title: cleanTitle,
            link: linkMatch[1].replace('<![CDATA[', '').replace(']]>', '').trim(),
            pubDate: dateMatch[1],
            source: sourceMatch ? sourceMatch[1] : 'Actualité'
          });
        }
      }
      return res.status(200).json({ results: newsList.slice(0, 10) });
    }

    // Jeux similaires optimisés (récupération large + tri par récence)
    if (similar === 'true' && id) {
      const targetQuery = `fields similar_games, genres, keywords; where id = ${id};`;
      const targetRes = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers,
        body: targetQuery
      });
      const targetData = await targetRes.json();

      let simGamesList = [];

      if (targetData.length > 0) {
        const gameInfo = targetData[0];
        const simIds = gameInfo.similar_games || [];
        const genreIds = (gameInfo.genres || []).join(',');

        if (simIds.length > 0) {
          // On récupère jusqu'à 100 jeux recommandés au lieu de 20
          const simQuery = `fields name, cover.url, first_release_date, genres.name, platforms.name, summary, url; where id = (${simIds.join(',')}); limit 100;`;
          const simRes = await fetch('https://api.igdb.com/v4/games', {
            method: 'POST',
            headers,
            body: simQuery
          });
          simGamesList = await simRes.json();
        }

        // Si la liste est petite ou ancienne, on complète avec les dernières sorties du même genre
        if (simGamesList.length < 20 && genreIds) {
          const nowSec = Math.floor(Date.now() / 1000);
          const fallbackQuery = `fields name, cover.url, first_release_date, genres.name, platforms.name, summary, url; where genres = (${genreIds}) & id != ${id} & first_release_date != null & first_release_date <= ${nowSec}; sort first_release_date desc; limit 50;`;
          const fallbackRes = await fetch('https://api.igdb.com/v4/games', {
            method: 'POST',
            headers,
            body: fallbackQuery
          });
          const fallbackData = await fallbackRes.json();
          
          // Fusion des deux listes en éliminant les doublons
          const existingIds = new Set(simGamesList.map(g => g.id));
          fallbackData.forEach(g => {
            if (!existingIds.has(g.id)) {
              simGamesList.push(g);
            }
          });
        }
      }

      // Tri final par date de sortie décroissante (du plus récent au plus ancien)
      simGamesList.sort((a, b) => (b.first_release_date || 0) - (a.first_release_date || 0));

      return res.status(200).json({ results: simGamesList.map(formatGame) });
    }

    // Recherche classique
    if (search) {
      const query = `search "${search}"; fields name, cover.url, first_release_date, genres.name, platforms.name, summary, storyline, url; limit 10;`;
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
    first_release_date: g.first_release_date || null,
    background_image: imageUrl,
    description: g.summary || g.storyline || 'Aucune description disponible.',
    genres: g.genres || [],
    platforms: g.platforms || [],
    site_detail_url: g.url
  };
}
