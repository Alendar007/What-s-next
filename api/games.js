function renderResults() {
    let filtered = rawDataList.filter(item => {
      if (selectedGenres.size > 0 && item.genres) {
        const itemGenres = item.genres.map(g => g.name);
        const matches = [...selectedGenres].every(g => itemGenres.includes(g));
        if (!matches) return false;
      }
      if (selectedPlatforms.size > 0) {
        const matchesPlatform = [...selectedPlatforms].some(platKey => matchPlatform(item.platforms, platKey));
        if (!matchesPlatform) return false;
      }
      return true;
    });

    const sortVal = sortMode.value;
    if (sortVal === 'RATING_DESC') {
      filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else if (sortVal === 'YEAR_DESC') {
      filtered.sort((a, b) => getReleaseTimestamp(b) - getReleaseTimestamp(a));
    }

    resultsContainer.innerHTML = '';

    if (filtered.length === 0) {
      loadMoreContainer.style.display = 'none';
      resultsContainer.innerHTML = '<div style="text-align:center; color:var(--muted); padding: 20px;">Aucun élément ne correspond aux filtres sélectionnés.</div>';
      return;
    }

    const limitedFiltered = filtered.slice(0, visibleCount);
    const section = document.createElement('div');
    section.className = 'year-section open';

    const header = document.createElement('div');
    header.className = 'year-header';
    header.innerHTML = `<span>Jeux similaires <span class="count">(${filtered.length})</span></span><span class="arrow">▼</span>`;
    
    const content = document.createElement('div');
    content.className = 'year-content grid-layout';

    header.addEventListener('click', () => section.classList.toggle('open'));

    limitedFiltered.forEach(item => content.appendChild(createCard(item)));
    section.appendChild(header);
    section.appendChild(content);
    resultsContainer.appendChild(section);

    if (visibleCount < filtered.length) {
      loadMoreContainer.style.display = 'block';
    } else {
      loadMoreContainer.style.display = 'none';
    }
  }

  function createCard(item) {
    const card = document.createElement('div');
    card.className = 'card';
    
    const title = item.name;
    const year = getReleaseYear(item);
    const imgUrl = item.background_image || '';
    const genres = item.genres ? item.genres.slice(0, 2).map(g => g.name).join(' • ') : '';
    const ratingStr = item.rating ? `⭐ ${item.rating}/100` : '⭐ N/A';

    card.innerHTML = `
      <div class="card-img-wrapper">
        <img src="${imgUrl}" alt="${title}" loading="lazy">
      </div>
      <div class="card-body">
        <div class="card-title">${title}</div>
        <div class="card-genres">${genres}</div>
        <div class="card-meta" style="display:flex; justify-content:space-between;">
          <span>📅 ${year}</span>
          <span>${ratingStr}</span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => openModal(item));
    return card;
  }
