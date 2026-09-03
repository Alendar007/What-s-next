export default async function handler(req, res) {
  const { search, similar, id } = req.query;
  const GB_API_KEY = '399580b067d26b71f92e10695015b57f00aa2ef6';
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WhatNextApp/1.0' };

  try {
    let url = '';

    if (search) {
      url = `https://www.giantbomb.com/api/search/?api_key=${GB_API_KEY}&format=json&query=${encodeURIComponent(search)}&resources=game&limit=6`;
    } else if (similar === 'true' && id) {
      // Si l'ID contient déjà le préfixe de Giant Bomb (ex: 3030-xxxx), on l'utilise direct, sinon on fait une recherche par nom
      const gamePath = id.toString().includes('-') ? `game/${id}/` : `search/?query=${id}&resources=game&limit=1`;
      url = `https://www.giantbomb.com/api/${gamePath}?api_key=${GB_API_KEY}&format=json`;
    } else {
      return res.status(400).json({ error: 'Paramètres manquants' });
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Erreur API Giant Bomb: ${response.status}`);
    }

    const data = await response.json();

    if (similar === 'true') {
      let similarGames = [];
      if (data.results && data.results.similar_games) {
        similarGames = data.results.similar_games;
      } else if (Array.isArray(data.results) && data.results.length > 0 && data.results[0].similar_games) {
        similarGames = data.results[0].similar_games;
      }
      return res.status(200).json({ results: similarGames });
    }

    res.status(200).json(data);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la récupération des données Giant Bomb' });
  }
}
