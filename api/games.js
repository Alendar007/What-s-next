export default async function handler(req, res) {
  const { search, id, similar } = req.query;
  // Ta clé API RAWG est désormais cachée et sécurisée côté serveur
  const API_KEY = '6b19812dfd8d47bfa2b35649980d4679';

  try {
    let url = '';
    
    // Si on cherche des jeux similaires
    if (similar === 'true' && id) {
      url = `https://api.rawg.io/api/games/${id}/suggested?key=${API_KEY}&page_size=40`;
    } 
    // Si on fait une recherche textuelle
    else if (search) {
      url = `https://api.rawg.io/api/games?key=${API_KEY}&search=${encodeURIComponent(search)}&page_size=6`;
    } 
    else {
      return res.status(400).json({ error: 'Paramètres manquants' });
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Erreur API RAWG: ${response.status}`);
    }
    
    const data = await response.json();
    res.status(200).json(data);
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la récupération des données' });
  }
}
