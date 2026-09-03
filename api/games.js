export default async function handler(req, res) {
  const { search, id, similar } = req.query;
  const GB_API_KEY = '399580b067d26b71f92e10695015b57f00aa2ef6'; // ou ta clé

  // En-têtes obligatoires pour que Giant Bomb accepte la requête du serveur Vercel
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WhatNextApp/1.0'
  };

  try {
    let url = '';

    if (similar === 'true' && id) {
      // Récupération des jeux similaires sur Giant Bomb
      url = `https://www.giantbomb.com/api/game/${id}/?api_key=${GB_API_KEY}&format=json`;
    } else if (search) {
      // Recherche textuelle sur Giant Bomb
      url = `https://www.giantbomb.com/api/search/?api_key=${GB_API_KEY}&format=json&query=${encodeURIComponent(search)}&resources=game&limit=6`;
    } else {
      return res.status(400).json({ error: 'Paramètres manquants' });
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Erreur API Giant Bomb: ${response.status}`);
    }

    const data = await response.json();

    // Si on cherche un jeu spécifique pour ses similaires, on extrait le tableau "similar_games"
    if (similar === 'true') {
      const similarGames = data.results && data.results.similar_games ? data.results.similar_games : [];
      return res.status(200).json({ results: similarGames });
    }

    // Sinon on renvoie les résultats de recherche standards
    res.status(200).json(data);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la récupération des données Giant Bomb' });
  }
}
