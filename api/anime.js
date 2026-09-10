// Fonction utilitaire pour traduire le synopsis en français
async function translateToFrench(text) {
  if (!text || text === 'Aucun synopsis disponible.') return text;
  try {
    // Découpage si le texte est très long pour éviter les limites de l'API gratuite
    const truncatedText = text.length > 500 ? text.substring(0, 500) + '...' : text;
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(truncatedText)}&langpair=en|fr`);
    if (!res.ok) return text;
    const data = await res.json();
    return data.responseData?.translatedText || text;
  } catch (e) {
    return text; // Retourne le texte original en anglais si la traduction échoue
  }
}

export default async function handler(req, res) {
  const { search, type = 'anime', news, similar, id, title } = req.query;
  const mediaType = type === 'manga' ? 'MANGA' : 'ANIME';

  const aniListHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Origin': 'https://anilist.co',
    'Referer': 'https://anilist.co/'
  };

  try {
    // 1. Actualités via Google News RSS (< 6 mois)
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

    // 2. Titres similaires
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
        headers: aniListHeaders,
        body: JSON.stringify({ query: graphqlQuery, variables: { id: parseInt(id) } })
      });

      if (!aniListRes.ok) throw new Error(`Erreur AniList : ${aniListRes.status}`);

      const aniListData = await aniListRes.json();
      const recNodes = aniListData.data?.Media?.recommendations?.nodes || [];
      
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

    // 3. Recherche standard AniList + Traduction du synopsis
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
        headers: aniListHeaders,
        body: JSON.stringify({
          query: graphqlQuery,
          variables: { search, type: mediaType }
        })
      });

      if (!aniListRes.ok) throw new Error(`Erreur AniList : ${aniListRes.status}`);

      const aniListData = await aniListRes.json();
      const mediaList = aniListData.data?.Page?.media || [];

      // Transformation des données et traduction asynchrone des synopsis
      const results = await Promise.all(mediaList.map(async item => {
        const rawSynopsis = item.description ? item.description.replace(/<[^>]*>?/gm, '') : 'Aucun synopsis disponible.';
        const translatedSynopsis = await translateToFrench(rawSynopsis);

        return {
          id: item.id,
          title: item.title.userPreferred || item.title.romaji || item.title.english,
          year: item.startDate?.year || 'N/A',
          image: item.coverImage?.large,
          synopsis: translatedSynopsis,
          score: item.averageScore ? (item.averageScore / 10).toFixed(1) : null,
          genres: item.genres || []
        };
      }));

      return res.status(200).json({ results });
    }

    return res.status(400).json({ error: 'Paramètres manquants' });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
