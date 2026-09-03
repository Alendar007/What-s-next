export default async function handler(req, res) {
  const { search, similar, id } = req.query;
  const GB_API_KEY = '399580b067d26b71f92e10695015b57f00aa2ef6';
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WhatNextApp/1.0' };

  try {
    let url = '';

    if (search) {
      url = `https://www.giantbomb.com/api/search/?api_key=${GB_API_KEY}&format=json&query=${encodeURIComponent(search)}&resources=game&limit=6`;
    } else if (similar === 'true' && id) {
      const cleanId = id.toString().trim();
      if (cleanId.includes('-')) {
        url = `https://www.giantbomb.com/api/game/${cleanId}/?api_key=${GB_API_KEY}&format=json`;
      } else {
        url = `https://www.giantbomb.com/api/search/?api_key=${GB_API_KEY}&format=json&query=${encodeURIComponent(cleanId)}&resources=game&limit=1`;
      }
    } else {
      return res.status(400).json({ error: 'Paramètres manquants' });
    }

    const response = await fetch(url, { headers });
    const textData = await response.text();
    
    let data;
    try {
      data = JSON.parse(textData);
    } catch (e) {
      return res.status(500).json({ error: "Format de réponse non-JSON reçu de Giant Bomb" });
    }

    if (data.error && data.error !== 'OK') {
      return res.status(500).json({ error: `Giant Bomb: ${data.error}` });
    }

    if (similar === 'true') {
      let similarGames = [];
      if (!id.toString().includes('-') && data.results && data.results.length > 0) {
        const realGuid = data.results[0].guid;
        const subUrl = `https://www.giantbomb.com/api/game/${realGuid}/?api_key=${GB_API_KEY}&format=json`;
        const subRes = await fetch(subUrl, { headers });
        const subData = await subRes.json();
        if (subData.results && subData.results.similar_games) {
          similarGames = subData.results.similar_games;
        }
      } else if (data.results && data.results.similar_games) {
        similarGames = data.results.similar_games;
      }
      return res.status(200).json({ results: similarGames });
    }

    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
