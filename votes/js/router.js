/* ============================================
   Simple Hash-based Router for SPA
   ============================================ */

const Router = (() => {
    const routes = [];
    let currentCleanup = null;

    function addRoute(pattern, handler) {
        routes.push({ pattern, handler });
    }

    function matchRoute(hash) {
        const path = hash.replace(/^#/, '') || '/';

        for (const route of routes) {
            const regex = new RegExp('^' + route.pattern.replace(/:\w+/g, '([^/]+)') + '$');
            const match = path.match(regex);
            if (match) {
                return { handler: route.handler, params: match.slice(1) };
            }
        }
        return null;
    }

    function navigate() {
        // Clean up previous page if needed
        if (typeof currentCleanup === 'function') {
            currentCleanup();
            currentCleanup = null;
        }

        const hash = window.location.hash || '#/';
        const matched = matchRoute(hash);

        // Update active nav link
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
            const href = link.getAttribute('href');
            if (href === hash || (hash.startsWith(href) && href !== '#/')) {
                link.classList.add('active');
            }
        });
        // Special case for home
        if (hash === '#/' || hash === '#' || hash === '') {
            const homeLink = document.querySelector('[data-page="home"]');
            if (homeLink) homeLink.classList.add('active');
        }

        const app = document.getElementById('app');
        if (matched) {
            const result = matched.handler(...matched.params);
            if (typeof result === 'function') {
                currentCleanup = result;
            }
        } else {
            app.innerHTML = `
                <div class="error-message">
                    <h2>Page introuvable</h2>
                    <p>La page demandee n'existe pas. <a href="#/">Retour a l'accueil</a></p>
                </div>
            `;
        }

        // Scroll to top on navigation
        window.scrollTo(0, 0);

        // Close mobile menu
        document.querySelector('.nav-links')?.classList.remove('open');
    }

    function init() {
        window.addEventListener('hashchange', navigate);
        navigate();
    }

    return { addRoute, init, navigate };
})();
