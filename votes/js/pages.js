/* ============================================
   Page Renderers
   ============================================ */

const Pages = (() => {
    const app = () => document.getElementById('app');

    function showLoading(message = 'Chargement des donnees...') {
        app().innerHTML = `
            <div class="loading">
                <div class="loading-spinner"></div>
                <p>${message}</p>
            </div>
        `;
    }

    function showError(msg) {
        app().innerHTML = `<div class="error-message"><p>${msg}</p><p><a href="#/">Retour a l'accueil</a></p></div>`;
    }

    function truncate(str, len = 120) {
        if (!str) return '';
        return str.length > len ? str.substring(0, len) + '...' : str;
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // =============================================
    // HOME PAGE
    // =============================================
    function renderHome() {
        app().innerHTML = `
            <div class="hero">
                <h2>Suivez les votes de vos representants</h2>
                <p>Decouvrez comment chaque depute et senateur vote les propositions de loi a l'Assemblee nationale et au Senat.</p>
                <div class="hero-search">
                    <input type="search" id="global-search" placeholder="Rechercher un depute, senateur ou scrutin..." autocomplete="off">
                </div>
            </div>

            <div class="stats-grid" id="home-stats">
                <div class="stat-card">
                    <div class="stat-number" id="stat-deputes">--</div>
                    <div class="stat-label">Deputes en exercice</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number" id="stat-senateurs">--</div>
                    <div class="stat-label">Senateurs en exercice</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number" id="stat-scrutins">--</div>
                    <div class="stat-label">Scrutins publics</div>
                </div>
            </div>

            <div class="quick-links">
                <a href="#/deputes" class="quick-link-card">
                    <h3>Assemblee nationale</h3>
                    <p>577 deputes &mdash; Consultez leur profil et leurs votes sur chaque scrutin.</p>
                </a>
                <a href="#/senateurs" class="quick-link-card">
                    <h3>Senat</h3>
                    <p>348 senateurs &mdash; Suivez les votes nominatifs des scrutins publics au Senat.</p>
                </a>
                <a href="#/scrutins" class="quick-link-card">
                    <h3>Derniers scrutins</h3>
                    <p>Consultez les resultats de chaque vote et le detail par groupe parlementaire.</p>
                </a>
            </div>

            <div class="recent-section">
                <h3 class="section-title">Derniers scrutins a l'Assemblee nationale</h3>
                <div id="recent-scrutins">
                    <div class="loading"><div class="loading-spinner"></div></div>
                </div>
            </div>
        `;

        // Load stats
        loadHomeStats();

        // Search handler
        const searchInput = document.getElementById('global-search');
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && searchInput.value.trim()) {
                window.location.hash = `#/deputes?q=${encodeURIComponent(searchInput.value.trim())}`;
            }
        });
    }

    async function loadHomeStats() {
        try {
            const [deputes, senateurs] = await Promise.all([
                API.getDeputes(),
                API.getSenateurs()
            ]);
            document.getElementById('stat-deputes').textContent = deputes.length;
            document.getElementById('stat-senateurs').textContent = senateurs.length;
        } catch (e) {
            console.error('Stats load error:', e);
        }

        try {
            const scrutins = await API.getScrutins();
            const el = document.getElementById('stat-scrutins');
            if (el) el.textContent = scrutins.length;

            // Render recent scrutins
            const recent = scrutins.slice(0, 5);
            const container = document.getElementById('recent-scrutins');
            if (container) {
                container.innerHTML = recent.map(s => renderScrutinCard(s)).join('');
            }
        } catch (e) {
            console.error('Scrutins load error:', e);
            const container = document.getElementById('recent-scrutins');
            if (container) container.innerHTML = '<p class="empty-state">Impossible de charger les scrutins recents.</p>';
        }
    }

    function renderScrutinCard(s) {
        const sort = s.sort || '';
        const isAdopte = sort === 'adopte' || sort === 'adoptée' || sort === 'adopté';
        const resultClass = isAdopte ? 'result-adopte' : 'result-rejete';
        const resultLabel = isAdopte ? 'Adopte' : 'Rejete';

        const pour = parseInt(s.nombre_pours) || 0;
        const contre = parseInt(s.nombre_contres) || 0;
        const abst = parseInt(s.nombre_abstentions) || 0;
        const total = pour + contre + abst || 1;

        return `
            <div class="scrutin-card" onclick="window.location.hash='#/scrutin/${s.numero}'">
                <div class="scrutin-header">
                    <div class="scrutin-title">${escapeHtml(truncate(s.titre || s.demandeur || 'Scrutin n\u00b0' + s.numero, 200))}</div>
                    <div class="scrutin-date">${escapeHtml(API.formatDate(s.date))}</div>
                </div>
                <span class="scrutin-result ${resultClass}">${resultLabel}</span>
                <div class="scrutin-votes-bar">
                    <div class="votes-pour" style="width: ${(pour/total*100).toFixed(1)}%"></div>
                    <div class="votes-contre" style="width: ${(contre/total*100).toFixed(1)}%"></div>
                    <div class="votes-abstention" style="width: ${(abst/total*100).toFixed(1)}%"></div>
                </div>
                <div class="scrutin-counts">
                    <span class="count-pour">Pour : ${pour}</span>
                    <span class="count-contre">Contre : ${contre}</span>
                    <span class="count-abstention">Abstentions : ${abst}</span>
                </div>
            </div>
        `;
    }

    // =============================================
    // DEPUTES LIST
    // =============================================
    function renderDeputes() {
        showLoading('Chargement des deputes...');

        let allDeputes = [];
        let filteredDeputes = [];
        let currentPage = 1;
        const perPage = 30;

        API.getDeputes().then(deputes => {
            allDeputes = deputes;

            // Extract URL query
            const hashParts = window.location.hash.split('?');
            const params = new URLSearchParams(hashParts[1] || '');
            const initialQuery = params.get('q') || '';

            // Extract unique groups
            const groups = [...new Set(deputes.map(d => d.groupe_sigle).filter(Boolean))].sort();

            app().innerHTML = `
                <h2 class="section-title">Deputes en exercice</h2>
                <div class="search-bar">
                    <input type="search" id="depute-search" placeholder="Rechercher un depute..." value="${escapeHtml(initialQuery)}">
                    <select id="depute-group-filter">
                        <option value="">Tous les groupes</option>
                        ${groups.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('')}
                    </select>
                </div>
                <div id="deputes-count" style="margin-bottom:1rem; color: var(--gris-moyen); font-size: 0.9rem;"></div>
                <div class="cards-grid" id="deputes-list"></div>
                <div class="pagination" id="deputes-pagination"></div>
            `;

            function filterAndRender() {
                const query = document.getElementById('depute-search').value.toLowerCase().trim();
                const group = document.getElementById('depute-group-filter').value;

                filteredDeputes = allDeputes.filter(d => {
                    const nameMatch = !query ||
                        (d.nom || '').toLowerCase().includes(query) ||
                        (d.nom_de_famille || '').toLowerCase().includes(query) ||
                        (d.prenom || '').toLowerCase().includes(query);
                    const groupMatch = !group || d.groupe_sigle === group;
                    return nameMatch && groupMatch;
                });

                currentPage = 1;
                renderDeputesList();
            }

            function renderDeputesList() {
                const start = (currentPage - 1) * perPage;
                const pageData = filteredDeputes.slice(start, start + perPage);
                const totalPages = Math.ceil(filteredDeputes.length / perPage);

                document.getElementById('deputes-count').textContent =
                    `${filteredDeputes.length} depute${filteredDeputes.length > 1 ? 's' : ''} trouve${filteredDeputes.length > 1 ? 's' : ''}`;

                document.getElementById('deputes-list').innerHTML = pageData.length
                    ? pageData.map(d => `
                        <div class="card" onclick="window.location.hash='#/depute/${d.slug}'">
                            <div class="card-header">
                                <img class="card-avatar" src="${API.getDeputePhotoUrl(d.slug)}" alt="${escapeHtml(d.nom)}" loading="lazy"
                                     onerror="this.style.display='none'">
                                <div>
                                    <div class="card-name">${escapeHtml(d.nom)}</div>
                                    <div class="card-subtitle">${escapeHtml(d.nom_circo || '')}</div>
                                </div>
                            </div>
                            <div class="card-meta">
                                ${d.groupe_sigle ? `<span class="badge badge-group">${escapeHtml(d.groupe_sigle)}</span>` : ''}
                                ${d.parti_ratt_financier ? `<span class="badge badge-region">${escapeHtml(truncate(d.parti_ratt_financier, 40))}</span>` : ''}
                            </div>
                        </div>
                    `).join('')
                    : '<div class="empty-state">Aucun depute trouve.</div>';

                // Pagination
                renderPagination('deputes-pagination', currentPage, totalPages, (page) => {
                    currentPage = page;
                    renderDeputesList();
                    window.scrollTo(0, 0);
                });
            }

            document.getElementById('depute-search').addEventListener('input', filterAndRender);
            document.getElementById('depute-group-filter').addEventListener('change', filterAndRender);

            filterAndRender();
        }).catch(err => {
            showError('Impossible de charger la liste des deputes. ' + err.message);
        });
    }

    // =============================================
    // SENATEURS LIST
    // =============================================
    function renderSenateurs() {
        showLoading('Chargement des senateurs...');

        let allSenateurs = [];
        let filteredSenateurs = [];
        let currentPage = 1;
        const perPage = 30;

        API.getSenateurs().then(senateurs => {
            allSenateurs = senateurs;

            const groups = [...new Set(senateurs.map(s => s.groupe_sigle).filter(Boolean))].sort();

            app().innerHTML = `
                <h2 class="section-title">Senateurs en exercice</h2>
                <div class="search-bar">
                    <input type="search" id="senateur-search" placeholder="Rechercher un senateur...">
                    <select id="senateur-group-filter">
                        <option value="">Tous les groupes</option>
                        ${groups.map(g => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join('')}
                    </select>
                </div>
                <div id="senateurs-count" style="margin-bottom:1rem; color: var(--gris-moyen); font-size: 0.9rem;"></div>
                <div class="cards-grid" id="senateurs-list"></div>
                <div class="pagination" id="senateurs-pagination"></div>
            `;

            function filterAndRender() {
                const query = document.getElementById('senateur-search').value.toLowerCase().trim();
                const group = document.getElementById('senateur-group-filter').value;

                filteredSenateurs = allSenateurs.filter(s => {
                    const nameMatch = !query ||
                        (s.nom || '').toLowerCase().includes(query) ||
                        (s.nom_de_famille || '').toLowerCase().includes(query) ||
                        (s.prenom || '').toLowerCase().includes(query);
                    const groupMatch = !group || s.groupe_sigle === group;
                    return nameMatch && groupMatch;
                });

                currentPage = 1;
                renderSenateursList();
            }

            function renderSenateursList() {
                const start = (currentPage - 1) * perPage;
                const pageData = filteredSenateurs.slice(start, start + perPage);
                const totalPages = Math.ceil(filteredSenateurs.length / perPage);

                document.getElementById('senateurs-count').textContent =
                    `${filteredSenateurs.length} senateur${filteredSenateurs.length > 1 ? 's' : ''} trouve${filteredSenateurs.length > 1 ? 's' : ''}`;

                document.getElementById('senateurs-list').innerHTML = pageData.length
                    ? pageData.map(s => `
                        <div class="card" onclick="window.location.hash='#/senateur/${s.slug}'">
                            <div class="card-header">
                                <img class="card-avatar" src="${API.getSenateurPhotoUrl(s.slug)}" alt="${escapeHtml(s.nom)}" loading="lazy"
                                     onerror="this.style.display='none'">
                                <div>
                                    <div class="card-name">${escapeHtml(s.nom)}</div>
                                    <div class="card-subtitle">${escapeHtml(s.nom_circo || '')}</div>
                                </div>
                            </div>
                            <div class="card-meta">
                                ${s.groupe_sigle ? `<span class="badge badge-group">${escapeHtml(s.groupe_sigle)}</span>` : ''}
                            </div>
                        </div>
                    `).join('')
                    : '<div class="empty-state">Aucun senateur trouve.</div>';

                renderPagination('senateurs-pagination', currentPage, totalPages, (page) => {
                    currentPage = page;
                    renderSenateursList();
                    window.scrollTo(0, 0);
                });
            }

            document.getElementById('senateur-search').addEventListener('input', filterAndRender);
            document.getElementById('senateur-group-filter').addEventListener('change', filterAndRender);

            filterAndRender();
        }).catch(err => {
            showError('Impossible de charger la liste des senateurs. ' + err.message);
        });
    }

    // =============================================
    // SCRUTINS LIST
    // =============================================
    function renderScrutins() {
        showLoading('Chargement des scrutins...');

        let allScrutins = [];
        let filteredScrutins = [];
        let currentPage = 1;
        let activeTab = 'assemblee';
        const perPage = 20;

        loadScrutins();

        async function loadScrutins() {
            try {
                if (activeTab === 'assemblee') {
                    allScrutins = await API.getScrutins();
                } else {
                    allScrutins = await API.getScrutinsSenat();
                }
                renderPage();
            } catch (err) {
                showError('Impossible de charger les scrutins. ' + err.message);
            }
        }

        function renderPage() {
            app().innerHTML = `
                <h2 class="section-title">Scrutins publics</h2>
                <div class="tabs">
                    <button class="tab-btn ${activeTab === 'assemblee' ? 'active' : ''}" data-tab="assemblee">Assemblee nationale</button>
                    <button class="tab-btn ${activeTab === 'senat' ? 'active' : ''}" data-tab="senat">Senat</button>
                </div>
                <div class="search-bar">
                    <input type="search" id="scrutin-search" placeholder="Rechercher un scrutin...">
                    <select id="scrutin-sort-filter">
                        <option value="">Tous les resultats</option>
                        <option value="adopte">Adoptes</option>
                        <option value="rejete">Rejetes</option>
                    </select>
                </div>
                <div id="scrutins-count" style="margin-bottom:1rem; color: var(--gris-moyen); font-size: 0.9rem;"></div>
                <div id="scrutins-list"></div>
                <div class="pagination" id="scrutins-pagination"></div>
            `;

            // Tab listeners
            document.querySelectorAll('.tab-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    activeTab = btn.dataset.tab;
                    showLoading('Chargement des scrutins...');
                    loadScrutins();
                });
            });

            document.getElementById('scrutin-search').addEventListener('input', filterAndRender);
            document.getElementById('scrutin-sort-filter').addEventListener('change', filterAndRender);

            filterAndRender();
        }

        function filterAndRender() {
            const searchEl = document.getElementById('scrutin-search');
            const sortEl = document.getElementById('scrutin-sort-filter');
            if (!searchEl || !sortEl) return;

            const query = searchEl.value.toLowerCase().trim();
            const sortFilter = sortEl.value;

            filteredScrutins = allScrutins.filter(s => {
                const title = (s.titre || s.demandeur || '').toLowerCase();
                const textMatch = !query || title.includes(query);
                const sortMatch = !sortFilter || (s.sort || '').includes(sortFilter);
                return textMatch && sortMatch;
            });

            currentPage = 1;
            renderScrutinsList();
        }

        function renderScrutinsList() {
            const start = (currentPage - 1) * perPage;
            const pageData = filteredScrutins.slice(start, start + perPage);
            const totalPages = Math.ceil(filteredScrutins.length / perPage);

            const countEl = document.getElementById('scrutins-count');
            if (countEl) countEl.textContent = `${filteredScrutins.length} scrutin${filteredScrutins.length > 1 ? 's' : ''}`;

            const listEl = document.getElementById('scrutins-list');
            if (!listEl) return;

            listEl.innerHTML = pageData.length
                ? pageData.map(s => {
                    const hashTarget = activeTab === 'assemblee'
                        ? `#/scrutin/${s.numero}`
                        : `#/scrutin-senat/${s.numero}`;
                    return renderScrutinCardWithHash(s, hashTarget);
                }).join('')
                : '<div class="empty-state">Aucun scrutin trouve.</div>';

            renderPagination('scrutins-pagination', currentPage, totalPages, (page) => {
                currentPage = page;
                renderScrutinsList();
                window.scrollTo(0, 0);
            });
        }
    }

    function renderScrutinCardWithHash(s, hashTarget) {
        const sort = s.sort || '';
        const isAdopte = sort === 'adopte' || sort === 'adoptée' || sort === 'adopté';
        const resultClass = isAdopte ? 'result-adopte' : 'result-rejete';
        const resultLabel = isAdopte ? 'Adopte' : 'Rejete';

        const pour = parseInt(s.nombre_pours) || 0;
        const contre = parseInt(s.nombre_contres) || 0;
        const abst = parseInt(s.nombre_abstentions) || 0;
        const total = pour + contre + abst || 1;

        return `
            <div class="scrutin-card" onclick="window.location.hash='${hashTarget}'">
                <div class="scrutin-header">
                    <div class="scrutin-title">${escapeHtml(truncate(s.titre || s.demandeur || 'Scrutin n\u00b0' + s.numero, 200))}</div>
                    <div class="scrutin-date">${escapeHtml(API.formatDate(s.date))}</div>
                </div>
                <span class="scrutin-result ${resultClass}">${resultLabel}</span>
                <div class="scrutin-votes-bar">
                    <div class="votes-pour" style="width: ${(pour/total*100).toFixed(1)}%"></div>
                    <div class="votes-contre" style="width: ${(contre/total*100).toFixed(1)}%"></div>
                    <div class="votes-abstention" style="width: ${(abst/total*100).toFixed(1)}%"></div>
                </div>
                <div class="scrutin-counts">
                    <span class="count-pour">Pour : ${pour}</span>
                    <span class="count-contre">Contre : ${contre}</span>
                    <span class="count-abstention">Abstentions : ${abst}</span>
                </div>
            </div>
        `;
    }

    // =============================================
    // DEPUTE PROFILE
    // =============================================
    function renderDeputeProfile(slug) {
        showLoading('Chargement du profil...');

        Promise.all([
            API.getDepute(slug),
            API.getDeputeVotes(slug)
        ]).then(([depute, votes]) => {
            const votesList = (votes || []).map(v => v.vote || v);

            // Count vote positions
            const stats = { pour: 0, contre: 0, abstention: 0, absent: 0 };
            votesList.forEach(v => {
                const pos = (v.position || '').toLowerCase();
                if (pos.includes('pour')) stats.pour++;
                else if (pos.includes('contre')) stats.contre++;
                else if (pos.includes('abstention')) stats.abstention++;
                else stats.absent++;
            });

            app().innerHTML = `
                <a href="#/deputes" class="back-link">&larr; Retour aux deputes</a>
                <div class="profile-header">
                    <img class="profile-avatar" src="${API.getDeputePhotoUrl(slug)}" alt="${escapeHtml(depute.nom)}"
                         onerror="this.style.display='none'">
                    <div class="profile-info">
                        <h2>${escapeHtml(depute.nom)}</h2>
                        <div class="profile-group">${escapeHtml(depute.groupe_sigle || depute.groupe?.organisme || 'Groupe non renseigne')}</div>
                        <div class="profile-circo">${escapeHtml(depute.nom_circo || '')} ${depute.num_circo ? '(' + depute.num_circo + 'e circ.)' : ''}</div>
                        ${depute.profession ? `<div class="profile-circo">${escapeHtml(depute.profession)}</div>` : ''}
                    </div>
                </div>

                <div class="profile-stats">
                    <div class="profile-stat">
                        <div class="profile-stat-number">${votesList.length}</div>
                        <div class="profile-stat-label">Votes enregistres</div>
                    </div>
                    <div class="profile-stat">
                        <div class="profile-stat-number" style="color: var(--vert)">${stats.pour}</div>
                        <div class="profile-stat-label">Pour</div>
                    </div>
                    <div class="profile-stat">
                        <div class="profile-stat-number" style="color: var(--rouge)">${stats.contre}</div>
                        <div class="profile-stat-label">Contre</div>
                    </div>
                    <div class="profile-stat">
                        <div class="profile-stat-number" style="color: var(--orange)">${stats.abstention}</div>
                        <div class="profile-stat-label">Abstentions</div>
                    </div>
                </div>

                <h3 class="section-title">Historique des votes</h3>
                <div class="search-bar">
                    <input type="search" id="profile-vote-search" placeholder="Filtrer les votes...">
                    <select id="profile-vote-filter">
                        <option value="">Toutes les positions</option>
                        <option value="pour">Pour</option>
                        <option value="contre">Contre</option>
                        <option value="abstention">Abstention</option>
                    </select>
                </div>
                <div class="votes-list" id="profile-votes"></div>
                <div class="pagination" id="profile-pagination"></div>
            `;

            let currentPage = 1;
            const perPage = 20;

            function filterAndRenderVotes() {
                const query = document.getElementById('profile-vote-search').value.toLowerCase().trim();
                const posFilter = document.getElementById('profile-vote-filter').value;

                const filtered = votesList.filter(v => {
                    const title = (v.scrutin_titre || v.titre || '').toLowerCase();
                    const position = (v.position || '').toLowerCase();
                    const textMatch = !query || title.includes(query);
                    const posMatch = !posFilter || position.includes(posFilter);
                    return textMatch && posMatch;
                });

                currentPage = 1;
                renderVotes(filtered);
            }

            function renderVotes(list) {
                const start = (currentPage - 1) * perPage;
                const pageData = list.slice(start, start + perPage);
                const totalPages = Math.ceil(list.length / perPage);

                document.getElementById('profile-votes').innerHTML = pageData.length
                    ? pageData.map(v => {
                        const pos = (v.position || 'absent').toLowerCase();
                        let posClass = 'position-absent';
                        let posLabel = 'Absent';
                        if (pos.includes('pour')) { posClass = 'position-pour'; posLabel = 'Pour'; }
                        else if (pos.includes('contre')) { posClass = 'position-contre'; posLabel = 'Contre'; }
                        else if (pos.includes('abstention')) { posClass = 'position-abstention'; posLabel = 'Abstention'; }

                        return `
                            <div class="vote-item" onclick="window.location.hash='#/scrutin/${v.scrutin_numero || v.numero}'">
                                <div class="vote-item-title">${escapeHtml(truncate(v.scrutin_titre || v.titre || 'Scrutin n\u00b0' + (v.scrutin_numero || v.numero), 150))}</div>
                                <div class="vote-item-date">${escapeHtml(API.formatDate(v.date))}</div>
                                <span class="vote-position ${posClass}">${posLabel}</span>
                            </div>
                        `;
                    }).join('')
                    : '<div class="empty-state">Aucun vote trouve.</div>';

                renderPagination('profile-pagination', currentPage, totalPages, (page) => {
                    currentPage = page;
                    renderVotes(list);
                });
            }

            document.getElementById('profile-vote-search').addEventListener('input', filterAndRenderVotes);
            document.getElementById('profile-vote-filter').addEventListener('change', filterAndRenderVotes);

            filterAndRenderVotes();
        }).catch(err => {
            showError('Impossible de charger le profil. ' + err.message);
        });
    }

    // =============================================
    // SENATEUR PROFILE
    // =============================================
    function renderSenateurProfile(slug) {
        showLoading('Chargement du profil...');

        Promise.all([
            API.getSenateur(slug),
            API.getSenateurVotes(slug)
        ]).then(([senateur, votes]) => {
            const votesList = (votes || []).map(v => v.vote || v);

            const stats = { pour: 0, contre: 0, abstention: 0, absent: 0 };
            votesList.forEach(v => {
                const pos = (v.position || '').toLowerCase();
                if (pos.includes('pour')) stats.pour++;
                else if (pos.includes('contre')) stats.contre++;
                else if (pos.includes('abstention')) stats.abstention++;
                else stats.absent++;
            });

            app().innerHTML = `
                <a href="#/senateurs" class="back-link">&larr; Retour aux senateurs</a>
                <div class="profile-header">
                    <img class="profile-avatar" src="${API.getSenateurPhotoUrl(slug)}" alt="${escapeHtml(senateur.nom)}"
                         onerror="this.style.display='none'">
                    <div class="profile-info">
                        <h2>${escapeHtml(senateur.nom)}</h2>
                        <div class="profile-group">${escapeHtml(senateur.groupe_sigle || 'Groupe non renseigne')}</div>
                        <div class="profile-circo">${escapeHtml(senateur.nom_circo || '')}</div>
                    </div>
                </div>

                <div class="profile-stats">
                    <div class="profile-stat">
                        <div class="profile-stat-number">${votesList.length}</div>
                        <div class="profile-stat-label">Votes enregistres</div>
                    </div>
                    <div class="profile-stat">
                        <div class="profile-stat-number" style="color: var(--vert)">${stats.pour}</div>
                        <div class="profile-stat-label">Pour</div>
                    </div>
                    <div class="profile-stat">
                        <div class="profile-stat-number" style="color: var(--rouge)">${stats.contre}</div>
                        <div class="profile-stat-label">Contre</div>
                    </div>
                    <div class="profile-stat">
                        <div class="profile-stat-number" style="color: var(--orange)">${stats.abstention}</div>
                        <div class="profile-stat-label">Abstentions</div>
                    </div>
                </div>

                <h3 class="section-title">Historique des votes</h3>
                <div class="search-bar">
                    <input type="search" id="profile-vote-search" placeholder="Filtrer les votes...">
                    <select id="profile-vote-filter">
                        <option value="">Toutes les positions</option>
                        <option value="pour">Pour</option>
                        <option value="contre">Contre</option>
                        <option value="abstention">Abstention</option>
                    </select>
                </div>
                <div class="votes-list" id="profile-votes"></div>
                <div class="pagination" id="profile-pagination"></div>
            `;

            let currentPage = 1;
            const perPage = 20;

            function filterAndRenderVotes() {
                const query = document.getElementById('profile-vote-search').value.toLowerCase().trim();
                const posFilter = document.getElementById('profile-vote-filter').value;

                const filtered = votesList.filter(v => {
                    const title = (v.scrutin_titre || v.titre || '').toLowerCase();
                    const position = (v.position || '').toLowerCase();
                    const textMatch = !query || title.includes(query);
                    const posMatch = !posFilter || position.includes(posFilter);
                    return textMatch && posMatch;
                });

                currentPage = 1;
                renderVotes(filtered);
            }

            function renderVotes(list) {
                const start = (currentPage - 1) * perPage;
                const pageData = list.slice(start, start + perPage);
                const totalPages = Math.ceil(list.length / perPage);

                document.getElementById('profile-votes').innerHTML = pageData.length
                    ? pageData.map(v => {
                        const pos = (v.position || 'absent').toLowerCase();
                        let posClass = 'position-absent';
                        let posLabel = 'Absent';
                        if (pos.includes('pour')) { posClass = 'position-pour'; posLabel = 'Pour'; }
                        else if (pos.includes('contre')) { posClass = 'position-contre'; posLabel = 'Contre'; }
                        else if (pos.includes('abstention')) { posClass = 'position-abstention'; posLabel = 'Abstention'; }

                        return `
                            <div class="vote-item" onclick="window.location.hash='#/scrutin-senat/${v.scrutin_numero || v.numero}'">
                                <div class="vote-item-title">${escapeHtml(truncate(v.scrutin_titre || v.titre || 'Scrutin n\u00b0' + (v.scrutin_numero || v.numero), 150))}</div>
                                <div class="vote-item-date">${escapeHtml(API.formatDate(v.date))}</div>
                                <span class="vote-position ${posClass}">${posLabel}</span>
                            </div>
                        `;
                    }).join('')
                    : '<div class="empty-state">Aucun vote trouve.</div>';

                renderPagination('profile-pagination', currentPage, totalPages, (page) => {
                    currentPage = page;
                    renderVotes(list);
                });
            }

            document.getElementById('profile-vote-search').addEventListener('input', filterAndRenderVotes);
            document.getElementById('profile-vote-filter').addEventListener('change', filterAndRenderVotes);

            filterAndRenderVotes();
        }).catch(err => {
            showError('Impossible de charger le profil. ' + err.message);
        });
    }

    // =============================================
    // SCRUTIN DETAIL (Assemblée)
    // =============================================
    function renderScrutinDetail(numero) {
        showLoading('Chargement du scrutin...');

        API.getScrutin(numero).then(scrutin => {
            const sort = scrutin.sort || '';
            const isAdopte = sort === 'adopte' || sort === 'adoptée' || sort === 'adopté';
            const resultClass = isAdopte ? 'result-adopte' : 'result-rejete';
            const resultLabel = isAdopte ? 'Adopte' : 'Rejete';

            const pour = parseInt(scrutin.nombre_pours) || 0;
            const contre = parseInt(scrutin.nombre_contres) || 0;
            const abst = parseInt(scrutin.nombre_abstentions) || 0;
            const total = pour + contre + abst || 1;

            // Group breakdown
            const groupes = scrutin.groupes || [];

            app().innerHTML = `
                <a href="#/scrutins" class="back-link">&larr; Retour aux scrutins</a>
                <div class="vote-detail-header">
                    <h2>${escapeHtml(scrutin.titre || scrutin.demandeur || 'Scrutin n\u00b0' + numero)}</h2>
                    <div class="vote-detail-meta">
                        <span>Date : ${escapeHtml(API.formatDate(scrutin.date))}</span>
                        <span>Scrutin n\u00b0${numero}</span>
                        <span class="scrutin-result ${resultClass}">${resultLabel}</span>
                    </div>
                    <div class="vote-summary-bar">
                        <div class="votes-pour" style="width: ${(pour/total*100).toFixed(1)}%"></div>
                        <div class="votes-contre" style="width: ${(contre/total*100).toFixed(1)}%"></div>
                        <div class="votes-abstention" style="width: ${(abst/total*100).toFixed(1)}%"></div>
                    </div>
                    <div class="vote-summary-counts">
                        <span class="count-pour">Pour : ${pour}</span>
                        <span class="count-contre">Contre : ${contre}</span>
                        <span class="count-abstention">Abstentions : ${abst}</span>
                    </div>
                </div>

                <h3 class="section-title">Detail par groupe parlementaire</h3>
                <div class="group-votes-section" id="group-votes">
                    ${groupes.length ? groupes.map((g, i) => renderGroupVoteCard(g, i)).join('') :
                        '<div class="empty-state">Detail par groupe non disponible pour ce scrutin.</div>'}
                </div>
            `;

            // Toggle group member lists
            document.querySelectorAll('.group-vote-header').forEach(header => {
                header.addEventListener('click', () => {
                    const list = header.nextElementSibling;
                    if (list) list.classList.toggle('expanded');
                });
            });

        }).catch(err => {
            showError('Impossible de charger le scrutin. ' + err.message);
        });
    }

    function renderGroupVoteCard(groupe, index) {
        const g = groupe.groupe || groupe;
        const nom = g.nom || g.groupe_sigle || 'Groupe inconnu';
        const pourList = extractVotants(g, 'pours');
        const contreList = extractVotants(g, 'contres');
        const abstList = extractVotants(g, 'abstentions');

        const pour = pourList.length;
        const contre = contreList.length;
        const abst = abstList.length;
        const total = pour + contre + abst || 1;

        return `
            <div class="group-vote-card">
                <div class="group-vote-header">
                    <span class="group-name">${escapeHtml(nom)}</span>
                    <div class="scrutin-counts">
                        <span class="count-pour">${pour}</span>
                        <span class="count-contre">${contre}</span>
                        <span class="count-abstention">${abst}</span>
                    </div>
                </div>
                <div class="group-vote-bar">
                    <div class="votes-pour" style="width: ${(pour/total*100).toFixed(1)}%"></div>
                    <div class="votes-contre" style="width: ${(contre/total*100).toFixed(1)}%"></div>
                    <div class="votes-abstention" style="width: ${(abst/total*100).toFixed(1)}%"></div>
                </div>
                <div class="group-members-list" id="group-members-${index}">
                    ${pourList.map(v => `<div class="member-vote"><a href="#/depute/${v.slug || ''}">${escapeHtml(v.nom || v.parlementaire || 'Inconnu')}</a><span class="vote-position position-pour">Pour</span></div>`).join('')}
                    ${contreList.map(v => `<div class="member-vote"><a href="#/depute/${v.slug || ''}">${escapeHtml(v.nom || v.parlementaire || 'Inconnu')}</a><span class="vote-position position-contre">Contre</span></div>`).join('')}
                    ${abstList.map(v => `<div class="member-vote"><a href="#/depute/${v.slug || ''}">${escapeHtml(v.nom || v.parlementaire || 'Inconnu')}</a><span class="vote-position position-abstention">Abstention</span></div>`).join('')}
                </div>
            </div>
        `;
    }

    function extractVotants(groupe, position) {
        if (!groupe || !groupe[position]) return [];
        const data = groupe[position];
        if (Array.isArray(data)) {
            return data.map(v => v.votant || v.parlementaire_vote || v);
        }
        if (data.votant) {
            return Array.isArray(data.votant) ? data.votant : [data.votant];
        }
        return [];
    }

    // =============================================
    // SCRUTIN DETAIL (Sénat) - simplified
    // =============================================
    function renderScrutinSenatDetail(numero) {
        app().innerHTML = `
            <a href="#/scrutins" class="back-link">&larr; Retour aux scrutins</a>
            <div class="vote-detail-header">
                <h2>Scrutin n&deg;${escapeHtml(String(numero))} au Senat</h2>
                <p style="margin-top:1rem; color: var(--gris-moyen);">
                    Le detail de ce scrutin est disponible sur
                    <a href="https://www.nossenateurs.fr/scrutin/${numero}" target="_blank" rel="noopener">NosSenateurs.fr</a>.
                </p>
            </div>
        `;
    }

    // =============================================
    // PAGINATION HELPER
    // =============================================
    function renderPagination(containerId, current, total, onPageChange) {
        const container = document.getElementById(containerId);
        if (!container || total <= 1) {
            if (container) container.innerHTML = '';
            return;
        }

        let buttons = [];
        buttons.push(`<button ${current <= 1 ? 'disabled' : ''} data-page="${current - 1}">&laquo; Prec.</button>`);

        const range = 2;
        let start = Math.max(1, current - range);
        let end = Math.min(total, current + range);

        if (start > 1) {
            buttons.push(`<button data-page="1">1</button>`);
            if (start > 2) buttons.push(`<button disabled>...</button>`);
        }

        for (let i = start; i <= end; i++) {
            buttons.push(`<button class="${i === current ? 'active' : ''}" data-page="${i}">${i}</button>`);
        }

        if (end < total) {
            if (end < total - 1) buttons.push(`<button disabled>...</button>`);
            buttons.push(`<button data-page="${total}">${total}</button>`);
        }

        buttons.push(`<button ${current >= total ? 'disabled' : ''} data-page="${current + 1}">Suiv. &raquo;</button>`);

        container.innerHTML = buttons.join('');

        container.querySelectorAll('button[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = parseInt(btn.dataset.page);
                if (page >= 1 && page <= total) {
                    onPageChange(page);
                }
            });
        });
    }

    return {
        renderHome,
        renderDeputes,
        renderSenateurs,
        renderScrutins,
        renderDeputeProfile,
        renderSenateurProfile,
        renderScrutinDetail,
        renderScrutinSenatDetail
    };
})();
