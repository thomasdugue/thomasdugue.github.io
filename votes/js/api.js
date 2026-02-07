/* ============================================
   API Service Layer
   Fetches data from NosDéputés.fr & NosSénateurs.fr
   ============================================ */

const API = (() => {
    const BASE_DEPUTES = 'https://www.nosdeputes.fr';
    const BASE_SENATEURS = 'https://www.nossenateurs.fr';

    // Simple in-memory cache
    const cache = new Map();
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    async function fetchJSON(url) {
        const cached = cache.get(url);
        if (cached && Date.now() - cached.time < CACHE_TTL) {
            return cached.data;
        }

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Erreur HTTP ${response.status} pour ${url}`);
        }
        const data = await response.json();
        cache.set(url, { data, time: Date.now() });
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
