const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

class FakeClassList {
    constructor(initial = []) { this.values = new Set(initial); }
    add(value) { this.values.add(value); }
    remove(value) { this.values.delete(value); }
    contains(value) { return this.values.has(value); }
}

class FakeElement {
    constructor(document, tagName, options = {}) {
        this.document = document;
        this.tagName = tagName.toUpperCase();
        this.id = options.id || '';
        this.alt = options.alt || '';
        this.src = options.src || '';
        this.currentSrc = options.currentSrc || '';
        this.hidden = Boolean(options.hidden);
        this.disabled = false;
        this.inert = false;
        this.isConnected = true;
        this.parentElement = null;
        this.children = [];
        this.attributes = new Map();
        this.listeners = new Map();
        this.classList = new FakeClassList(options.classes || []);
    }

    append(...children) {
        children.forEach(child => {
            child.parentElement = this;
            this.children.push(child);
        });
    }

    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    removeAttribute(name) { this.attributes.delete(name); }
    hasAttribute(name) { return this.attributes.has(name); }

    addEventListener(type, callback) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(callback);
    }

    dispatch(type, event = {}) {
        (this.listeners.get(type) || []).forEach(callback => callback(event));
    }

    focus() { this.document.activeElement = this; }

    closest(selector) {
        let current = this;
        while (current) {
            if (selector === '.graph-card' && current.classList.contains('graph-card')) return current;
            current = current.parentElement;
        }
        return null;
    }

    descendants() {
        return this.children.flatMap(child => [child, ...child.descendants()]);
    }

    querySelector(selector) {
        if (selector === '[role="dialog"]') {
            return this.descendants().find(element => element.getAttribute('role') === 'dialog') || null;
        }
        return null;
    }

    querySelectorAll(selector) {
        if (selector.includes('button:not([disabled])')) {
            return this.descendants().filter(element => {
                if (element.hidden || element.disabled) return false;
                if (element.tagName === 'BUTTON') return true;
                const tabindex = element.getAttribute('tabindex');
                return tabindex !== null && tabindex !== '-1';
            });
        }
        return [];
    }
}

function galleryHarness() {
    const listeners = new Map();
    const ids = new Map();
    const document = {
        activeElement: null,
        addEventListener(type, callback) { listeners.set(type, callback); },
        getElementById(id) { return ids.get(id) || null; },
        querySelectorAll(selector) {
            if (selector === '.graph-card img') return [image];
            if (selector === '.graph-card.is-lightbox-active') {
                return card.classList.contains('is-lightbox-active') ? [card] : [];
            }
            return [];
        }
    };
    const body = new FakeElement(document, 'body');
    const main = new FakeElement(document, 'main');
    const card = new FakeElement(document, 'figure', { classes: ['graph-card'] });
    const image = new FakeElement(document, 'img', {
        alt: 'Accuratezza per tipologia',
        src: '/chart.png',
        currentSrc: '/chart-large.png'
    });
    card.append(image);
    main.append(card);

    const lightbox = new FakeElement(document, 'div', { id: 'graphsLightbox', hidden: true });
    const panel = new FakeElement(document, 'div', { id: 'graphsLightboxPanel' });
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('tabindex', '-1');
    const title = new FakeElement(document, 'h2', { id: 'graphsLightboxTitle' });
    const close = new FakeElement(document, 'button', { id: 'graphsLightboxClose' });
    const largeImage = new FakeElement(document, 'img', { id: 'graphsLightboxImage' });
    const caption = new FakeElement(document, 'p', { id: 'graphsLightboxCaption' });
    panel.append(title, close, largeImage, caption);
    lightbox.append(panel);
    const utility = new FakeElement(document, 'button');
    body.append(main, lightbox, utility);
    document.body = body;
    document.activeElement = card;
    [lightbox, title, close, largeImage, caption].forEach(element => ids.set(element.id, element));

    vm.runInNewContext(fs.readFileSync('scripts/graphs-gallery.js', 'utf8'), { document });
    return { document, listeners, body, main, card, image, lightbox, close, largeImage, utility };
}

function normalizedSha256(name) {
    const source = fs.readFileSync(name, 'utf8').replace(/\r\n/g, '\n');
    return crypto.createHash('sha256').update(source).digest('hex');
}

test('secondary page styles retain the historical baseline and scoped study controls', () => {
    assert.equal(normalizedSha256('styles/study-tools.css'),
        '85893202ff117021cd687d177c400bcfd3f52e57694cb714f158164af6c88cef');
    assert.equal(normalizedSha256('styles/errori.css'),
        '00d22d6db6768abacb66549be41902730b84c7c945a6c4aca02e5915271ac341');
    assert.equal(normalizedSha256('styles/graphs.css'),
        '1f667a8c5c27358332f0a46aa8ae2bda54c75004339231dddea0df79c6556b7d');

    const commonErrorPages = fs.readdirSync('Errori_comuni').filter(name => name.endsWith('.html'));
    commonErrorPages.forEach(name => {
        const html = fs.readFileSync('Errori_comuni/' + name, 'utf8');
        assert.match(html, /<body class="esiste-original">/, name);
        assert.doesNotMatch(html, /errori-(?:intro|index-grid|index-link|page-nav)/, name);
    });

    const errorIndex = fs.readFileSync('Errori_comuni/index.html', 'utf8');
    assert.match(errorIndex, /class="index-boxes"/);
    assert.match(errorIndex, /class="rounded-box index-actions-box"/);
    assert.equal((errorIndex.match(/<br>/g) || []).length, 6);

    ['privacy.html', 'progressi/index.html', 'ripasso/errori.html', 'strumenti/sandbox.html']
        .forEach(name => {
            const html = fs.readFileSync(name, 'utf8');
            assert.match(html, /<main\b[^>]*class="[^"]*study-page/, name);
            assert.doesNotMatch(html, /\b(?:study-lead|study-section|study-form|study-field|study-actions|study-nav|privacy-grid)\b/, name);
        });

    const privacy = fs.readFileSync('privacy.html', 'utf8');
    assert.equal((privacy.match(/class="study-card"/g) || []).length, 1);
    assert.equal((privacy.match(/<h2\b/g) || []).length, 0);

    const graphs = fs.readFileSync('grafici/grafici.html', 'utf8');
    assert.match(graphs, /class="rounded-box index-actions-box"/);
    assert.match(graphs, /<br>/);
    assert.match(graphs, /<div class="graphs-footer">/);
    assert.doesNotMatch(graphs, /graphs-intro-card/);
});

test('logic sandbox controls are grouped, labelled and responsive without changing its API hooks', () => {
    const html = fs.readFileSync('strumenti/sandbox.html', 'utf8');
    const css = fs.readFileSync('styles/study-tools.css', 'utf8');
    const script = fs.readFileSync('scripts/logic-sandbox.js', 'utf8');

    assert.match(html, /<body class="sandbox-page">/);
    assert.match(html, /class="rounded-box sandbox-workbench"[^>]*aria-labelledby="sandboxWorkbenchTitle"/);
    assert.match(html, /id="sandboxFormula"[^>]*class="sandbox-control sandbox-formula-input"[^>]*aria-describedby="sandboxFormulaHint"/);
    assert.match(html, /id="sandboxCompareFormula"[^>]*class="sandbox-control sandbox-formula-input"/);
    assert.match(html, /id="sandboxSymbols"[^>]*class="sandbox-symbols"[^>]*aria-labelledby="sandboxSymbolsLabel"/);
    assert.equal((html.match(/class="sandbox-symbol-button"/g) || []).length, 7);
    assert.equal((html.match(/class="sandbox-action-button(?: sandbox-clear-button)?"/g) || []).length, 6);
    assert.match(html, /id="sandboxStatus"[^>]*role="status"/);
    assert.match(html, /Tabella di verità/);
    assert.match(script, /Tabella di verità della formula/);

    assert.match(css, /body\.sandbox-page\s*\{[\s\S]*?margin:\s*0;[\s\S]*?padding:\s*4vh 0;/);
    assert.match(css, /\.sandbox-control\s*\{[\s\S]*?min-height:\s*44px;[\s\S]*?border:\s*2px solid var\(--input-border\);/);
    assert.match(css, /\.sandbox-symbol-button:focus-visible,[\s\S]*?outline:\s*3px solid var\(--link\);/);
    assert.match(css, /\.sandbox-action-button:disabled\s*\{[\s\S]*?cursor:\s*not-allowed;[\s\S]*?opacity:\s*0\.55;/);
    assert.match(css, /\.sandbox-symbols\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,/);
    assert.match(css, /@media \(max-width:\s*600px\)[\s\S]*?\.sandbox-actions\s*\{[\s\S]*?grid-template-columns:\s*1fr;/);
});

test('progress dashboard uses labelled controls, readable panels and a non-overlapping responsive navigation', () => {
    const html = fs.readFileSync('progressi/index.html', 'utf8');
    const css = fs.readFileSync('styles/study-tools.css', 'utf8');

    assert.match(html, /<body class="progress-page">/);
    assert.match(html, /<header class="progress-header">[\s\S]*?class="progress-lead"/);
    assert.match(html, /class="rounded-box progress-filters no-print"[^>]*aria-labelledby="dashboardFiltersTitle"/);
    [
        ['dashboardPeriod', 'Periodo'],
        ['dashboardType', 'Argomento'],
        ['dashboardDifficulty', 'Difficoltà']
    ].forEach(([id, label]) => {
        assert.match(html, new RegExp('<label for="' + id + '">' + label + '<\\/label>'));
        assert.match(html, new RegExp('<select id="' + id + '" class="progress-select">'));
    });
    [
        'dashboardPeriod', 'dashboardType', 'dashboardDifficulty', 'dashboardSummary',
        'dashboardChart', 'dashboardTableBody', 'dashboardDifficultyChart',
        'dashboardDifficultyTableBody', 'dashboardEmpty', 'dashboardExportJson',
        'dashboardExportCsv', 'dashboardPrint', 'dashboardDownloadChart'
    ].forEach(id => assert.match(html, new RegExp('id="' + id + '"'), id));
    assert.equal((html.match(/class="progress-button"/g) || []).length, 4);
    assert.equal((html.match(/class="rounded-box progress-section/g) || []).length, 3);
    ['dashboardSummarySection', 'dashboardDifficultySection', 'dashboardTypeSection'].forEach(id => {
        assert.match(html, new RegExp('id="' + id + '"[^>]*class="rounded-box progress-section[^>]*hidden'));
    });
    ['dashboardExportJson', 'dashboardExportCsv', 'dashboardDownloadChart'].forEach(id => {
        assert.match(html, new RegExp('id="' + id + '"[^>]*disabled'));
    });
    assert.match(html, /id="dashboardEmpty"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/);
    assert.match(html, /id="dashboardDownloadChart"[^>]*>Scarica grafico per tipologia \(SVG\)<\/button>/);
    assert.equal((html.match(/class="table" role="region"/g) || []).length, 2);
    assert.equal((html.match(/<th scope="col">/g) || []).length, 9);
    assert.match(html, /class="rounded-box lesson-nav progress-nav"/);
    assert.equal((html.match(/class="lesson-nav-btn progress-nav-link"/g) || []).length, 3);

    assert.match(css, /body\.progress-page\s*\{[\s\S]*?margin:\s*0;[\s\S]*?padding:\s*4vh 0;/);
    assert.match(css, /\.progress-select\s*\{[\s\S]*?min-height:\s*44px;[\s\S]*?border:\s*2px solid var\(--input-border\);/);
    assert.match(css, /\.progress-button\s*\{[\s\S]*?min-height:\s*44px;[\s\S]*?border-radius:\s*10px;/);
    assert.match(css, /\.progress-button:focus-visible,[\s\S]*?outline:\s*3px solid var\(--link\);/);
    assert.match(css, /\.progress-button:disabled\s*\{[\s\S]*?cursor:\s*not-allowed;[\s\S]*?opacity:\s*0\.55;/);
    assert.match(css, /\.progress-chart \.chart-svg\s*\{[\s\S]*?min-width:\s*38rem;[\s\S]*?max-width:\s*none;/);
    assert.match(css, /\.progress-page \.metric-card span:last-child\s*\{[\s\S]*?color:\s*var\(--muted\);/);
    assert.match(css, /\.progress-section\[hidden\]\s*\{\s*display:\s*none;/);
    assert.match(css, /\.progress-page \.progress-nav\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/);
    assert.match(css, /\.progress-nav \.progress-nav-link\s*\{[\s\S]*?position:\s*static;[\s\S]*?min-height:\s*44px;[\s\S]*?transform:\s*none;/);
    assert.match(css, /@media \(max-width:\s*600px\)[\s\S]*?\.progress-page \.progress-nav\s*\{[\s\S]*?grid-template-columns:\s*1fr;/);
    assert.match(css, /@media print[\s\S]*?\.progress-filters,[\s\S]*?\.progress-page \.progress-nav\s*\{\s*display:\s*none !important;/);

    const dashboard = fs.readFileSync('scripts/dashboard.js', 'utf8');
    assert.equal((dashboard.match(/maximum:\s*100/g) || []).length, 2);
    assert.match(dashboard, /equivalence:\s*'Equivalenze'/);
    assert.match(dashboard, /hard:\s*'Difficile'/);
    assert.match(dashboard, /Nessun tentativo corrisponde ai filtri selezionati/);
});

test('non-visual privacy, storage, export and accessibility contracts remain available', () => {
    const secondaryPages = [
        ...fs.readdirSync('Errori_comuni').filter(name => name.endsWith('.html'))
            .map(name => 'Errori_comuni/' + name),
        'privacy.html',
        'progressi/index.html',
        'ripasso/errori.html',
        'strumenti/sandbox.html',
        'grafici/grafici.html'
    ];
    secondaryPages.forEach(name => {
        const html = fs.readFileSync(name, 'utf8');
        assert.match(html, /<main\b[^>]*id="main-content"[^>]*tabindex="-1"/, name);
    });

    const privacy = fs.readFileSync('privacy.html', 'utf8');
    assert.match(privacy, /scripts\/privacy-controls\.js/);
    assert.match(privacy, /scripts\/app-storage\.js/);
    assert.match(privacy, /disattivato per impostazione predefinita/);
    assert.match(privacy, /esportare l'archivio locale e cancellare sessioni/);

    const progress = fs.readFileSync('progressi/index.html', 'utf8');
    ['dashboardExportCsv', 'dashboardExportJson', 'dashboardPrint'].forEach(id => {
        assert.match(progress, new RegExp('id="' + id + '"'));
    });
    assert.match(progress, /scripts\/app-storage\.js/);
    assert.match(progress, /scripts\/dashboard\.js/);
    assert.equal((progress.match(/class="table" role="region"/g) || []).length, 2);

    const sandbox = fs.readFileSync('strumenti/sandbox.html', 'utf8');
    assert.match(sandbox, /id="sandboxSymbols"[^>]*role="group"/);
    assert.match(sandbox, /scripts\/logic-sandbox\.js/);

    const errorIndex = fs.readFileSync('Errori_comuni/index.html', 'utf8');
    assert.match(errorIndex, /Negazione Universale \(Per Ogni\)/);
    const universal = fs.readFileSync('Errori_comuni/Per_Ogni.html', 'utf8');
    assert.doesNotMatch(universal, /salta"<\/strong>/);

    const graphs = fs.readFileSync('grafici/grafici.html', 'utf8');
    assert.match(graphs, /aria-describedby="graphsLightboxCaption"[^>]*tabindex="-1"/);
});

test('graph lightbox traps focus, makes the page inert and restores its trigger', () => {
    const harness = galleryHarness();
    assert.equal(harness.card.getAttribute('role'), 'button');
    assert.equal(harness.card.getAttribute('tabindex'), '0');

    let prevented = false;
    harness.card.dispatch('keydown', { key: 'Enter', preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(harness.lightbox.hidden, false);
    assert.equal(harness.main.inert, true);
    assert.equal(harness.main.getAttribute('aria-hidden'), 'true');
    assert.equal(harness.utility.inert, true);
    assert.equal(harness.document.activeElement, harness.close);
    assert.equal(harness.largeImage.src, '/chart-large.png');

    prevented = false;
    harness.listeners.get('keydown')({ key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(harness.document.activeElement, harness.close);

    prevented = false;
    harness.listeners.get('keydown')({ key: 'Escape', preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
    assert.equal(harness.lightbox.hidden, true);
    assert.equal(harness.main.inert, false);
    assert.equal(harness.main.getAttribute('aria-hidden'), null);
    assert.equal(harness.utility.inert, false);
    assert.equal(harness.document.activeElement, harness.card);
});
