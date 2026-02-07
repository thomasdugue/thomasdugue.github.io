/* ============================================
   API Service Layer
   - Deputies/Senators: Opendatasoft (CORS OK)
   - Scrutins/Votes: NosDéputés.fr via allorigins proxy
   ============================================ */

const API = (() => {
    // Opendatasoft - CORS enabled, direct fetch
    const ODS_BASE = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets';
    const ODS_DATASET = 'repertoire-national-des-elus-deputes-et-senateurs';

    // NosDéputés / NosSénateurs - needs CORS proxy
    const BASE_DEPUTES = 'https://www.nosdeputes.fr';
    const BASE_SENATEURS = 'https://www.nossenateurs.fr';

    // CORS proxies (try in order)
    const PROXIES = [
        url => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
        url => 'https://corsproxy.io/?' + encodeURIComponent(url),
    ];

    const cache = new Map();
    const CACHE_TTL = 10 * 60 * 1000;

    async function fetchJSON(url) {
        const cached = cache.get(url);
        if (cached && Date.now() - cached.time < CACHE_TTL) {
            return cached.data;
        }
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        cache.set(url, { data, time: Date.now() });
        return data;
    }

    async function fetchWithProxy(url) {
        const cached = cache.get(url);
        if (cached && Date.now() - cached.time < CACHE_TTL) {
            return cached.data;
        }

        // Try direct first
        try {
            const r = await fetch(url);
            if (r.ok) {
                const d = await r.json();
                cache.set(url, { data: d, time: Date.now() });
                return d;
            }
        } catch (e) { /* expected CORS error */ }

        // Try proxies
        for (const makeProxy of PROXIES) {
            try {
                const r = await fetch(makeProxy(url));
                if (r.ok) {
                    const d = await r.json();
                    cache.set(url, { data: d, time: Date.now() });
                    return d;
                }
            } catch (e) { continue; }
        }
        throw new Error('Toutes les sources ont echoue pour ' + url);
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    // ==========================================
    // DEPUTIES via Opendatasoft
    // ==========================================
    async function getDeputes() {
        const url = `${ODS_BASE}/${ODS_DATASET}/records?limit=100&where=code_type_elu%3D%22D%22&order_by=nom`;
        const allRecords = [];
        let offset = 0;

        // Paginate (100 per page)
        while (true) {
            const pageUrl = `${ODS_BASE}/${ODS_DATASET}/records?limit=100&offset=${offset}&where=code_type_elu%3D%22D%22&order_by=nom`;
            const data = await fetchJSON(pageUrl);
            const results = data.results || [];
            allRecords.push(...results);
            if (results.length < 100) break;
            offset += 100;
        }

        return allRecords.map(r => ({
            nom: `${r.prenom_elu || ''} ${r.nom_elu || ''}`.trim(),
            nom_de_famille: r.nom_elu || '',
            prenom: r.prenom_elu || '',
            slug: slugify(`${r.prenom_elu || ''} ${r.nom_elu || ''}`),
            groupe_sigle: r.nom_parti || '',
            nom_circo: r.nom_departement || r.nom_region || '',
            num_circo: '',
            sexe: r.code_sexe || '',
            date_naissance: r.date_naissance || '',
            _source: 'ods'
        })).sort((a, b) => a.nom_de_famille.localeCompare(b.nom_de_famille, 'fr'));
    }

    // ==========================================
    // SENATORS via Opendatasoft
    // ==========================================
    async function getSenateurs() {
        const allRecords = [];
        let offset = 0;

        while (true) {
            const pageUrl = `${ODS_BASE}/${ODS_DATASET}/records?limit=100&offset=${offset}&where=code_type_elu%3D%22S%22&order_by=nom`;
            const data = await fetchJSON(pageUrl);
            const results = data.results || [];
            allRecords.push(...results);
            if (results.length < 100) break;
            offset += 100;
        }

        return allRecords.map(r => ({
            nom: `${r.prenom_elu || ''} ${r.nom_elu || ''}`.trim(),
            nom_de_famille: r.nom_elu || '',
            prenom: r.prenom_elu || '',
            slug: slugify(`${r.prenom_elu || ''} ${r.nom_elu || ''}`),
            groupe_sigle: r.nom_parti || '',
            nom_circo: r.nom_departement || r.nom_region || '',
            sexe: r.code_sexe || '',
            _source: 'ods'
        })).sort((a, b) => a.nom_de_famille.localeCompare(b.nom_de_famille, 'fr'));
    }

    function slugify(str) {
        return (str || '').toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }

    // ==========================================
    // INDIVIDUAL DEPUTY (via NosDéputés + proxy)
    // ==========================================
    async function getDepute(slug) {
        const data = await fetchWithProxy(`${BASE_DEPUTES}/${slug}/json`);
        return data.depute || data;
    }

    async function getDeputeVotes(slug) {
        const data = await fetchWithProxy(`${BASE_DEPUTES}/${slug}/votes/json`);
        return data.votes || [];
    }

    function getDeputePhotoUrl(slug) {
        return `${BASE_DEPUTES}/depute/photo/${slug}/100`;
    }

    // ==========================================
    // INDIVIDUAL SENATOR (via NosSénateurs + proxy)
    // ==========================================
    async function getSenateur(slug) {
        const data = await fetchWithProxy(`${BASE_SENATEURS}/${slug}/json`);
        return data.senateur || data;
    }

    async function getSenateurVotes(slug) {
        const data = await fetchWithProxy(`${BASE_SENATEURS}/${slug}/votes/json`);
        return data.votes || [];
    }

    function getSenateurPhotoUrl(slug) {
        return `${BASE_SENATEURS}/senateur/photo/${slug}/100`;
    }

    // ==========================================
    // SCRUTINS (via NosDéputés + proxy)
    // ==========================================
    async function getScrutins() {
        const data = await fetchWithProxy(`${BASE_DEPUTES}/17/scrutins/json`);
        return (data.scrutins || []).map(s => s.scrutin);
    }

    async function getScrutin(id) {
        const data = await fetchWithProxy(`${BASE_DEPUTES}/17/scrutin/${id}/json`);
        return data.scrutin || data;
    }

    async function getScrutinsSenat() {
        const data = await fetchWithProxy(`${BASE_SENATEURS}/scrutins/json`);
        return (data.scrutins || []).map(s => s.scrutin);
    }

    async function getGroupes() {
        const data = await fetchWithProxy(`${BASE_DEPUTES}/organismes/groupe/json`);
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
