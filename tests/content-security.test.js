const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function collectHtml(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const item = path.join(directory, entry.name);
        if (entry.isDirectory()) return collectHtml(item);
        return entry.name.endsWith('.html') ? [item] : [];
    });
}

test('HTML contains no inline CSS, scripts, or event handlers', () => {
    collectHtml('.').forEach(file => {
        const source = fs.readFileSync(file, 'utf8');
        assert.doesNotMatch(source, /\sstyle\s*=/i, file + ' contains style=');
        assert.doesNotMatch(source, /<style\b/i, file + ' contains a style block');
        assert.doesNotMatch(source, /\son[a-z]+\s*=/i, file + ' contains an inline event handler');
        const scripts = source.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
        scripts.forEach(script => {
            assert.match(script, /\ssrc\s*=/i, file + ' contains an inline script');
        });
    });
});

test('nginx CSP does not allow inline styles or scripts', () => {
    const config = fs.readFileSync('nginx/default.conf.template', 'utf8');
    const csp = config.split('\n').find(line => line.includes('Content-Security-Policy')) || '';
    assert.doesNotMatch(csp, /unsafe-inline/);
    assert.match(csp, /style-src 'self'/);
    assert.match(csp, /script-src 'self'/);
});
