/* ============================================
   Main App - Route Registration & Init
   ============================================ */

(function () {
    // Register routes
    Router.addRoute('/', () => Pages.renderHome());
    Router.addRoute('/deputes', () => Pages.renderDeputes());
    Router.addRoute('/senateurs', () => Pages.renderSenateurs());
    Router.addRoute('/scrutins', () => Pages.renderScrutins());
    Router.addRoute('/depute/:slug', (slug) => Pages.renderDeputeProfile(slug));
    Router.addRoute('/senateur/:slug', (slug) => Pages.renderSenateurProfile(slug));
    Router.addRoute('/scrutin/:numero', (numero) => Pages.renderScrutinDetail(numero));
    Router.addRoute('/scrutin-senat/:numero', (numero) => Pages.renderScrutinSenatDetail(numero));

    // Mobile menu toggle
    document.querySelector('.mobile-menu-btn')?.addEventListener('click', () => {
        document.querySelector('.nav-links')?.classList.toggle('open');
    });

    // Init router
    Router.init();
})();
