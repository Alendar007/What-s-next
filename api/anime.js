async function translateToFrench(text) {
  if (!text || text === 'Aucun synopsis disponible.') return text;
  try {
    const truncatedText = text.length > 500 ? text.substring(0, 500) + '...' : text;
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(truncatedText)}&langpair=en|fr`);
    if (!res.ok) return text;
    const data = await res.json();
    return data.responseData?.translatedText || text;
  } catch (e) {
    return text;
  }
}

// Transforme les liens externes AniList en clés de plateformes lisibles par le frontend
function parsePlatforms(externalLinks = []) {
  if (!Array.isArray(externalLinks)) return [];
  const platforms = new Set();

  externalLinks.forEach(link => {
    const site = (link.site || '').toLowerCase();
    const url = (link.url || '').toLowerCase();

    if (site.includes('crunchyroll') || url.includes('crunchyroll')) platforms.add('crunchyroll');
    if (site.includes('netflix') || url.includes('netflix')) platforms.add('netflix');
    if (site.includes('disney') || url.includes('disneyplus')) platforms.add('disney');
    if (site.includes('prime video') || site.includes('amazon') || url.includes('primevideo')) platforms.add('prime');
    if (site.includes('adn') || site.includes('animation digital network') || url.includes('animationdigitalnetwork')) platforms.add('adn');
  });

  return Array.from(platforms);
}

export default async function handler(req, res) {
  const { search, type = 'anime', news, similar, id, title } = req.query;
  const isManga = type === 'manga';

  const aniListHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Origin': 'https://anilist.co',
    'Referer': 'https://anilist.co/'
  };

  try {
    // 1. Actualités (Google News RSS - Filtre France gl=FR)
    if (news === 'true' && title) {
      const cleanTitle = (title || '').substring(0, 80);
      const queryTerm = `${cleanTitle} ${isManga ? 'manga webtoon' : 'anime'}`;
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
            const cleanNewsTitle = titleMatch[1].replace('<![CDATA[', '').replace(']]>', '').trim();
            newsList.push({
              title: cleanNewsTitle,
              link: linkMatch[1].replace('<![CDATA[', '').replace(']]>', '').trim(),
              pubDate: dateMatch[1],
              source: sourceMatch ? sourceMatch[1] : 'Actualité'
            });
          }
        }
      }
      return res.status(200).json({ results: newsList.slice(0, 10) });
    }

    // 2. Similaires (avec récupération des plateformes et studios)
    if (similar === 'true' && id) {
      const graphqlQuery = `
        query ($id: Int) {
          Media(id: $id) {
            recommendations(page: 1, perPage: 50) {
              nodes {
                mediaRecommendation {
                  id
                  type
                  format
                  title { userPreferred romaji english }
                  startDate { year }
                  coverImage { large }
                  description(asHtml: false)
                  averageScore
                  genres
                  externalLinks { site url }
                  studios(isMain: true) { nodes { name } }
                  staff(perPage: 3) { nodes { name { full } } }
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
      const targetType = isManga ? 'MANGA' : 'ANIME';
      
      const results = recNodes
        .filter(n => n.mediaRecommendation && n.mediaRecommendation.type === targetType)
        .map(n => {
          const item = n.mediaRecommendation;
          const studioName = item.studios?.nodes?.[0]?.name;
          const authorName = item.staff?.nodes?.[0]?.name?.full;

          return {
            id: item.id,
            title: item.title.userPreferred || item.title.romaji || item.title.english,
            year: item.startDate?.year || 'N/A',
            image: item.coverImage?.large,
            synopsis: item.description ? item.description.replace(/<[^>]*>?/gm, '') : 'Aucun synopsis disponible.',
            score: item.averageScore ? (item.averageScore / 10).toFixed(1) : null,
            genres: item.genres || [],
            format: item.format || (isManga ? 'Manga' : 'Série TV'),
            studio: studioName || authorName || 'Non communiqué',
            platforms: parsePlatforms(item.externalLinks)
          };
        });

      return res.status(200).json({ results });
    }

    // 3. Recherche standard
    if (search) {
      const graphqlQuery = `
        query ($search: String, $type: MediaType) {
          Page(perPage: 10) {
            media(search: $search, type: $type) {
              id
              type
              format
              title { userPreferred romaji english }
              startDate { year }
              coverImage { large }
              description(asHtml: false)
              averageScore
              genres
              externalLinks { site url }
              studios(isMain: true) { nodes { name } }
              staff(perPage: 3) { nodes { name { full } } }
            }
          }
        }
      `;

      const aniListRes = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: aniListHeaders,
        body: JSON.stringify({
          query: graphqlQuery,
          variables: { search, type: isManga ? 'MANGA' : 'ANIME' }
        })
      });

      if (!aniListRes.ok) throw new Error(`Erreur AniList : ${aniListRes.status}`);

      const aniListData = await aniListRes.json();
      const mediaList = aniListData.data?.Page?.media || [];

      const results = await Promise.all(mediaList.map(async item => {
        const rawSynopsis = item.description ? item.description.replace(/<[^>]*>?/gm, '') : 'Aucun synopsis disponible.';
        const translatedSynopsis = await translateToFrench(rawSynopsis);

        const studioName = item.studios?.nodes?.[0]?.name;
        const authorName = item.staff?.nodes?.[0]?.name?.full;

        return {
          id: item.id,
          title: item.title.userPreferred || item.title.romaji || item.title.english,
          year: item.startDate?.year || 'N/A',
          image: item.coverImage?.large,
          synopsis: translatedSynopsis,
          score: item.averageScore ? (item.averageScore / 10).toFixed(1) : null,
          genres: item.genres || [],
          format: item.format || (isManga ? 'Manga' : 'Série TV'),
          studio: studioName || authorName || 'Non communiqué',
          platforms: parsePlatforms(item.externalLinks)
        };
      }));

      return res.status(200).json({ results });
    }

    return res.status(400).json({ error: 'Paramètres manquants' });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
