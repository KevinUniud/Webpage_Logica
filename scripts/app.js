/*
 * Bootstrap globale della pagina.
 * - Inizializza impostazioni globali
 * - Garantisce un contenitore main accessibile
 * - Collega i controlli veloci delle espressioni logiche
 */
document.addEventListener('DOMContentLoaded', function() {
    /**
     * Assicura una struttura base accessibile della pagina.
     * @pre Il DOM principale della pagina e document.body sono disponibili.
     * @post Esiste sempre un elemento <main id="main-content" tabindex="-1">.
     */
    function ensureAccessibilityScaffold() {
        let main = document.querySelector('main');

        if (!main) {
            main = document.createElement('main');
            const children = Array.from(document.body.children);
            children.forEach(function(node) {
                if (node.tagName === 'SCRIPT') return;
                if (node.classList.contains('settings-trigger')) return;
                if (node.classList.contains('settings-overlay')) return;
                main.appendChild(node);
            });
            document.body.appendChild(main);
        }

        if (!main.id) {
            main.id = 'main-content';
        }
        if (!main.hasAttribute('tabindex')) {
            main.setAttribute('tabindex', '-1');
        }

    }

    if (typeof initGlobalSettings === 'function') {
        initGlobalSettings();
    }

    ensureAccessibilityScaffold();

    if (typeof initLessonRadioNavigation === 'function') {
        initLessonRadioNavigation();
    }

    // Gestione delegata dei pulsanti tastierino formula e reset riga.
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('.btn-wide');
        if (btn) {
            const controls = btn.closest('.controls');
            if (!controls) return;
            e.preventDefault();
            const label = controls.closest('label');
            if (!label) return;
            if (label.dataset.expressionLocked === 'true') return;
            const input = label.querySelector('.expressionInput');
            if (!input) return;
            input.value = (input.value || '') + (btn.dataset.val || '');
            if (typeof window.clearExpressionFeedback === 'function') {
                window.clearExpressionFeedback(input);
            }
            return;
        }

        const del = e.target.closest('.deleteBtn');
        if (del) {
            e.preventDefault();
            const controls = del.closest('.controls');
            if (!controls) return;
            const label = controls.closest('label');
            if (!label) return;
            const input = label.querySelector('.expressionInput');
            if (input) {
                input.value = '';
                if (typeof window.clearExpressionFeedback === 'function') {
                    window.clearExpressionFeedback(input);
                }
                if (typeof window.unlockExpressionBuilder === 'function') {
                    window.unlockExpressionBuilder(input);
                }
            }

            const box = del.closest('.rounded-box');
            const checkBtn = box && box.querySelector('button[onclick^="checkArray"]');
            if (checkBtn) {
                checkBtn.disabled = false;
                checkBtn.removeAttribute('aria-disabled');
            }
        }
    });
});