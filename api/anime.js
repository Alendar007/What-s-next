export default async function handler(req, res) {
  const { search, type = 'anime', news, title } = req.query;

  try {
    // Actualités de moins de 6 mois via Google News RSS
    if (news === 'true' && title) {
      const queryTerm = `${title} ${type === 'manga' ? 'manga' : 'anime'}`;
      const rssRes = await fetch(`https://news.google.com/rss/search?q=${encodeURIComponent(queryTerm)}&hl=fr&gl=FR&ceid=FR:fr`);
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

    // Recherche d'Animé ou Manga via Jikan API (MyAnimeList)
    if (search) {
      const endpoint = type === 'manga' ? 'manga' : 'anime';
      const jikanRes = await fetch(`https://api.jikan.moe/v4/${endpoint}?q=${encodeURIComponent(search)}&limit=6`);
      
      if (!jikanRes.ok) {
        throw new Error(`Erreur API Jikan: ${jikanRes.status}`);
      }

      const jikanData = await jikanRes.json();
      const results = (jikanData.data || []).map(item => ({
        id: item.mal_id,
        title: item.title,
        year: item.year || (item.published?.from ? item.published.from.split('-')[0] : (item.aired?.from ? item.aired.from.split('-')[0] : 'N/A')),
        image: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url,
        synopsis: item.synopsis || 'Aucun synopsis disponible.',
        score: item.score || null,
        genres: (item.genres || []).map(g => g.name)
      }));

      return res.status(200).json({ results });
    }

    return res.status(400).json({ error: 'Paramètres manquants' });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
