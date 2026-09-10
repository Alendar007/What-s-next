const TMDB_API_KEY = process.env.TMDB_API_KEY || '1327d2f347345770737cd7154486aff0';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';

function parseTmdbProviders(providers = []) {
  const platforms = new Set();
  providers.forEach(p => {
    const name = (p.provider_name || '').toLowerCase();
    if (name.includes('netflix')) platforms.add('netflix');
    if (name.includes('amazon') || name.includes('prime')) platforms.add('prime');
    if (name.includes('disney')) platforms.add('disney');
    if (name.includes('apple')) platforms.add('apple');
    if (name.includes('canal')) platforms.add('canal');
    if (name.includes('paramount')) platforms.add('paramount');
  });
  return Array.from(platforms);
}

export default async function handler(req, res) {
  const { search, similar, id } = req.query;

  try {
    // 1. Recherche / Autocomplete d'un film
    if (search) {
      const url = `${TMDB_BASE}/search/movie?api_key=${TMDB_API_KEY}&language=fr-FR&query=${encodeURIComponent(search)}&page=1`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`TMDB HTTP ${response.status}`);
      const data = await response.json();

      const results = await Promise.all((data.results || []).slice(0, 6).map(async item => {
        const detailsRes = await fetch(`${TMDB_BASE}/movie/${item.id}?api_key=${TMDB_API_KEY}&language=fr-FR&append_to_response=watch/providers`);
        if (!detailsRes.ok) return item;
        const details = await detailsRes.json();
        const frProviders = details['watch/providers']?.results?.FR?.flatrate || [];

        return {
          id: details.id,
          title: details.title,
          release_date: details.release_date,
          poster_path: details.poster_path ? `${TMDB_IMG}${details.poster_path}` : '',
          overview: details.overview,
          vote_average: details.vote_average,
          genres: details.genres || [],
          platforms: parseTmdbProviders(frProviders)
        };
      }));

      return res.status(200).json({ results });
    }

    // 2. Films similaires / recommandés avec leurs plateformes en France
    if (similar === 'true' && id) {
      let recUrl = `${TMDB_BASE}/movie/${id}/recommendations?api_key=${TMDB_API_KEY}&language=fr-FR&page=1`;
      let response = await fetch(recUrl);
      let data = await response.json();
      let rawResults = data.results || [];

      if (rawResults.length === 0) {
        recUrl = `${TMDB_BASE}/movie/${id}/similar?api_key=${TMDB_API_KEY}&language=fr-FR&page=1`;
        response = await fetch(recUrl);
        data = await response.json();
        rawResults = data.results || [];
      }

      const results = await Promise.all(rawResults.filter(item => item.poster_path).slice(0, 40).map(async item => {
        const detailsRes = await fetch(`${TMDB_BASE}/movie/${item.id}?api_key=${TMDB_API_KEY}&language=fr-FR&append_to_response=watch/providers`);
        if (!detailsRes.ok) return item;
        const details = await detailsRes.json();
        const frProviders = details['watch/providers']?.results?.FR?.flatrate || [];

        return {
          id: details.id,
          title: details.title,
          release_date: details.release_date,
          poster_path: details.poster_path ? `${TMDB_IMG}${details.poster_path}` : '',
          overview: details.overview,
          vote_average: details.vote_average,
          genre_ids: details.genres ? details.genres.map(g => g.id) : (item.genre_ids || []),
          genres: details.genres || [],
          platforms: parseTmdbProviders(frProviders)
        };
      }));

      return res.status(200).json({ results });
    }

    return res.status(400).json({ error: 'Paramètres manquants' });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
