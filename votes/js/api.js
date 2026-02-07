/* ============================================
   API Service Layer
   Fetches data from NosDéputés.fr & NosSénateurs.fr
   Uses CORS proxy for cross-origin requests
   ============================================ */

const API = (() => {
    const BASE_DEPUTES = 'https://www.nosdeputes.fr';
    const BASE_SENATEURS = 'https://www.nossenateurs.fr';

    // CORS proxy to bypass cross-origin restrictions
    const CORS_PROXY = 'https://corsproxy.io/?';

    // Simple in-memory cache
    const cache = new Map();
    const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

    function proxyUrl(url) {
        return CORS_PROXY + encodeURIComponent(url);
    }

    async function fetchJSON(url) {
        const cacheKey = url;
        const cached = cache.get(cacheKey);
        if (cached && Date.now() - cached.time < CACHE_TTL) {
            return cached.data;
        }

        // Try direct first, fallback to proxy
        let response;
        try {
            response = await fetch(url);
            if (!response.ok) throw new Error('direct failed');
        } catch (e) {
            response = await fetch(proxyUrl(url));
        }

        if (!response.ok) {
            throw new Error(`Erreur HTTP ${response.status}`);
        }
        const data = await response.json();
        cache.set(cacheKey, { data, time: Date.now() });
        return data;
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }

    // --- Deputies ---

    async function getDeputes() {
        const data = await fetchJSON(`${BASE_DEPUTES}/deputes/enmandat/json`);
        return (data.deputes || []).map(d => d.depute).sort((a, b) =>
            (a.nom || '').localeCompare(b.nom || '', 'fr')
        );
    }

    async function getDepute(slug) {
        const data = await fetchJSON(`${BASE_DEPUTES}/${slug}/json`);
        return data.depute || data;
    }

    async function getDeputeVotes(slug) {
        const data = await fetchJSON(`${BASE_DEPUTES}/${slug}/votes/json`);
        return data.votes || [];
    }

    function getDeputePhotoUrl(slug) {
        return `${BASE_DEPUTES}/depute/photo/${slug}/100`;
    }

    // --- Senators ---

    async function getSenateurs() {
        const data = await fetchJSON(`${BASE_SENATEURS}/senateurs/enmandat/json`);
        return (data.senateurs || []).map(s => s.senateur).sort((a, b) =>
            (a.nom || '').localeCompare(b.nom || '', 'fr')
        );
    }

    async function getSenateur(slug) {
        const data = await fetchJSON(`${BASE_SENATEURS}/${slug}/json`);
        return data.senateur || data;
    }

    async function getSenateurVotes(slug) {
        const data = await fetchJSON(`${BASE_SENATEURS}/${slug}/votes/json`);
        return data.votes || [];
    }

    function getSenateurPhotoUrl(slug) {
        return `${BASE_SENATEURS}/senateur/photo/${slug}/100`;
    }

    // --- Scrutins (Assemblée Nationale) ---

    async function getScrutins() {
        const data = await fetchJSON(`${BASE_DEPUTES}/17/scrutins/json`);
        return (data.scrutins || []).map(s => s.scrutin);
    }

    async function getScrutin(id) {
        const data = await fetchJSON(`${BASE_DEPUTES}/17/scrutin/${id}/json`);
        return data.scrutin || data;
    }

    // --- Scrutins (Sénat) ---

    async function getScrutinsSenat() {
        const data = await fetchJSON(`${BASE_SENATEURS}/scrutins/json`);
        return (data.scrutins || []).map(s => s.scrutin);
    }

    // --- Groups ---

    async function getGroupes() {
        const data = await fetchJSON(`${BASE_DEPUTES}/organismes/groupe/json`);
        return (data.organismes || []).map(o => o.organisme);
    }

    return {
        getDeputes,
        getDepute,
        getDeputeVotes,
        getDeputePhotoUrl,
        getSenateurs,
        getSenateur,
        getSenateurVotes,
        getSenateurPhotoUrl,
        getScrutins,
        getScrutin,
        getScrutinsSenat,
        getGroupes,
        formatDate
    };
})();
