export default async function handler(req, res) {
  const { search, type = 'anime', news, similar, id, title } = req.query;
  const mediaType = type === 'manga' ? 'MANGA' : 'ANIME';

  try {
    // Actualités via Google News RSS (< 6 mois)
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

    // Titres similaires filtrés par type (ANIME ou MANGA)
    if (similar === 'true' && id) {
      const graphqlQuery = `
        query ($id: Int) {
          Media(id: $id) {
            recommendations(page: 1, perPage: 25) {
              nodes {
                mediaRecommendation {
                  id
                  type
                  title {
                    userPreferred
                    romaji
                    english
                  }
                  startDate {
                    year
                  }
                  coverImage {
                    large
                  }
                  description(asHtml: false)
                  averageScore
                  genres
                }
              }
            }
          }
        }
      `;

      const aniListRes = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ query: graphqlQuery, variables: { id: parseInt(id) } })
      });

      if (!aniListRes.ok) throw new Error(`Erreur AniList : ${aniListRes.status}`);

      const aniListData = await aniListRes.json();
      const recNodes = aniListData.data?.Media?.recommendations?.nodes || [];
      
      // Filtrage strict : on ne garde que les recommandations du type sélectionné
      const results = recNodes
        .filter(n => n.mediaRecommendation && n.mediaRecommendation.type === mediaType)
        .map(n => {
          const item = n.mediaRecommendation;
          return {
            id: item.id,
            title: item.title.userPreferred || item.title.romaji || item.title.english,
            year: item.startDate?.year || 'N/A',
            image: item.coverImage?.large,
            synopsis: item.description ? item.description.replace(/<[^>]*>?/gm, '') : 'Aucun synopsis disponible.',
            score: item.averageScore ? (item.averageScore / 10).toFixed(1) : null,
            genres: item.genres || []
          };
        });

      return res.status(200).json({ results });
    }

    // Recherche standard AniList
    if (search) {
      const graphqlQuery = `
        query ($search: String, $type: MediaType) {
          Page(perPage: 6) {
            media(search: $search, type: $type) {
              id
              type
              title {
                userPreferred
                romaji
                english
              }
              startDate {
                year
              }
              coverImage {
                large
              }
              description(asHtml: false)
              averageScore
              genres
            }
          }
        }
      `;

      const aniListRes = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          query: graphqlQuery,
          variables: { search, type: mediaType }
        })
      });

      if (!aniListRes.ok) throw new Error(`Erreur AniList : ${aniListRes.status}`);

      const aniListData = await aniListRes.json();
      const mediaList = aniListData.data?.Page?.media || [];

      const results = mediaList.map(item => ({
        id: item.id,
        title: item.title.userPreferred || item.title.romaji || item.title.english,
        year: item.startDate?.year || 'N/A',
        image: item.coverImage?.large,
        synopsis: item.description ? item.description.replace(/<[^>]*>?/gm, '') : 'Aucun synopsis disponible.',
        score: item.averageScore ? (item.averageScore / 10).toFixed(1) : null,
        genres: item.genres || []
      }));

      return res.status(200).json({ results });
    }

    return res.status(400).json({ error: 'Paramètres manquants' });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
