const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const WEB_ROOT = path.resolve(__dirname, '..');
const WORKER_SOURCE = fs.readFileSync(path.join(WEB_ROOT, 'service-worker.js'), 'utf8');

function walkFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(function(entry) {
        const target = path.join(directory, entry.name);
        return entry.isDirectory() ? walkFiles(target) : [target];
    });
}

function assertExactCase(relativePath, label) {
    let current = WEB_ROOT;
    relativePath.split('/').filter(Boolean).forEach(function(segment) {
        const names = fs.readdirSync(current);
        assert.ok(names.includes(segment), `${label}: case errato per ${segment}`);
        current = path.join(current, segment);
    });
    assert.ok(fs.existsSync(current), `${label}: risorsa assente`);
}

function dispatchExtendable(listener) {
    let pending;
    listener({
        waitUntil(promise) { pending = promise; }
    });
    assert.ok(pending, 'waitUntil non invocato');
    return pending;
}

function createRetirementHarness(cacheNames) {
    const listeners = {};
    const calls = { claimed: 0, deleted: [], skipWaiting: 0, unregistered: 0 };
    const context = {
        caches: {
            async keys() { return cacheNames; },
            async delete(name) { calls.deleted.push(name); return true; }
        },
        self: {
            addEventListener(type, listener) { listeners[type] = listener; },
            skipWaiting() { calls.skipWaiting += 1; return Promise.resolve(); },
            clients: {
                claim() { calls.claimed += 1; return Promise.resolve(); }
            },
            registration: {
                unregister() { calls.unregistered += 1; return Promise.resolve(true); }
            }
        }
    };
    vm.runInNewContext(WORKER_SOURCE, context, { filename: 'service-worker.js' });
    return { calls, listeners };
}

test('search and installable/offline assets are absent from the public frontend', () => {
    [
        'manifest.webmanifest',
        'offline.html',
        'search-index.json',
        'scripts/global-search.js',
        'tools/build-search-index.mjs',
        'tools/check-search-index.mjs',
        'icons/app-icon.svg',
        'icons'
    ].forEach(function(relativePath) {
        assert.equal(fs.existsSync(path.join(WEB_ROOT, relativePath)), false, relativePath);
    });

    const html = walkFiles(WEB_ROOT)
        .filter(function(file) { return file.endsWith('.html'); })
        .map(function(file) { return fs.readFileSync(file, 'utf8'); })
        .join('\n');
    assert.doesNotMatch(html, /rel\s*=\s*["']manifest["']/i);
    assert.doesNotMatch(html, /manifest\.webmanifest|offline\.html|search-index\.json|global-search\.js/i);
});

test('all remaining local HTML, CSS and dynamic image references use exact Linux case', () => {
    const origin = new URL('https://testlogica.invalid/');
    const htmlFiles = walkFiles(WEB_ROOT).filter(function(file) { return file.endsWith('.html'); });
    htmlFiles.forEach(function(file) {
        const source = fs.readFileSync(file, 'utf8');
        const pageUrl = new URL(path.relative(WEB_ROOT, file).split(path.sep).join('/'), origin);
        for (const match of source.matchAll(/\b(?:src|href)\s*=\s*(["'])(.*?)\1/gi)) {
            const reference = match[2];
            if (!reference || reference.startsWith('#')) continue;
            const url = new URL(reference, pageUrl);
            if (url.origin !== origin.origin) continue;
            assertExactCase(decodeURIComponent(url.pathname.slice(1)), `${path.relative(WEB_ROOT, file)} -> ${reference}`);
        }
    });

    const quizCss = fs.readFileSync(path.join(WEB_ROOT, 'styles/quiz.css'), 'utf8');
    for (const match of quizCss.matchAll(/@import\s+(?:url\()?\s*(["']?)([^"')\s;]+)\1/gi)) {
        const url = new URL(match[2], new URL('styles/quiz.css', origin));
        assertExactCase(url.pathname.slice(1), `styles/quiz.css -> ${match[2]}`);
    }

    const quiz = fs.readFileSync(path.join(WEB_ROOT, 'scripts/quiz.js'), 'utf8');
    for (const match of quiz.matchAll(/\b(?:day|night):\s*'([^']+\.png)'/g)) {
        assertExactCase(`Immagini/${match[1]}`, `scripts/quiz.js -> ${match[1]}`);
    }
});

test('the current bootstrap removes only legacy TestLogica registrations and caches', () => {
    const app = fs.readFileSync(path.join(WEB_ROOT, 'scripts/app.js'), 'utf8');
    assert.match(app, /getRegistrations\(\)/);
    assert.match(app, /registration\.scope === legacyScope/);
    assert.match(app, /registration\.unregister\(\)/);
    assert.match(app, /name\.startsWith\('testlogica-'\)/);
    assert.doesNotMatch(app, /serviceWorker\.register\s*\(/);
    assert.doesNotMatch(app, /navigator\.onLine|global-search|connectionStatus|pwaUpdateButton/);
    assert.doesNotMatch(app, /localStorage\.(?:clear|removeItem)|indexedDB\.deleteDatabase/);
});

test('the retirement worker claims clients, removes owned caches and unregisters without fetch handling', async () => {
    const harness = createRetirementHarness([
        'testlogica-static-v9',
        'testlogica-runtime-v9',
        'unrelated-cache',
        'testlogica-static-v3'
    ]);

    assert.deepEqual(Object.keys(harness.listeners).sort(), ['activate', 'install']);
    await dispatchExtendable(harness.listeners.install);
    await dispatchExtendable(harness.listeners.activate);

    assert.equal(harness.calls.skipWaiting, 1);
    assert.equal(harness.calls.claimed, 1);
    assert.equal(harness.calls.unregistered, 1);
    assert.deepEqual(harness.calls.deleted.sort(), [
        'testlogica-runtime-v9',
        'testlogica-static-v3',
        'testlogica-static-v9'
    ]);
    assert.doesNotMatch(WORKER_SOURCE, /respondWith|addEventListener\(['"]fetch|caches\.open|cache\.put/);
});

test('build and Nginx expose only the no-store retirement endpoint', () => {
    const dockerfile = fs.readFileSync(path.join(WEB_ROOT, 'Dockerfile'), 'utf8');
    assert.match(dockerfile, /COPY index\.html privacy\.html service-worker\.js favicon\.ico/);
    assert.match(dockerfile, /API_UPSTREAM=http:\/\/host\.docker\.internal:5000/);
    assert.doesNotMatch(dockerfile, /manifest\.webmanifest|offline\.html|search-index\.json|COPY icons/);

    const nginx = fs.readFileSync(path.join(WEB_ROOT, 'nginx/default.conf.template'), 'utf8');
    const retirement = nginx.match(/location = \/service-worker\.js \{([\s\S]*?)\n\s*\}/);
    assert.ok(retirement, 'endpoint di dismissione service worker assente');
    assert.match(retirement[1], /default_type application\/javascript/);
    assert.match(retirement[1], /Cache-Control "no-store"/);
    assert.doesNotMatch(nginx, /location = \/manifest\.webmanifest/);

    const webHealth = nginx.match(/location = \/web-health \{([\s\S]*?)\n\s*\}/);
    assert.ok(webHealth, 'healthcheck locale del repository Web assente');
    assert.match(webHealth[1], /return 200 "ok\\n"/);

    const compose = fs.readFileSync(path.join(WEB_ROOT, 'docker-compose.yml'), 'utf8');
    assert.match(compose, /\$\{WEB_PORT:-12345\}:80/);
    assert.match(compose, /http:\/\/127\.0\.0\.1\/web-health/);
    assert.doesNotMatch(compose, /\bcontainer_name\s*:/);

    const pkg = JSON.parse(fs.readFileSync(path.join(WEB_ROOT, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts.verify, 'npm run check && npm test');
    assert.equal(Object.hasOwn(pkg.scripts, 'search:index'), false);
    assert.equal(Object.hasOwn(pkg.scripts, 'search:check'), false);
});
