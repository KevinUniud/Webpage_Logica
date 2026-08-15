const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function load(file, extras = {}) {
    const context = { ...extras };
    context.window = context;
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), context);
    return context;
}

test('quiz timer formats and expires through injected scheduler', () => {
    let tick = null;
    let expired = false;
    const display = { textContent: '', hidden: true };
    const context = load('scripts/quiz-timer.js', {
        setInterval: callback => { tick = callback; return 7; },
        clearInterval: () => {}
    });
    const timer = context.LogicQuizTimer.create({
        display,
        defaultMinutes: 1,
        parseMinutes: value => Number(value),
        onExpire: () => { expired = true; },
        setInterval: context.setInterval,
        clearInterval: context.clearInterval
    });
    timer.start(1);
    for (let index = 0; index < 60; index += 1) tick();
    assert.equal(display.textContent, '00:00');
    assert.equal(expired, true);
});

test('quiz timer resumes from exact remaining seconds', () => {
    let tick = null;
    const context = load('scripts/quiz-timer.js', {
        setInterval: callback => { tick = callback; return 8; },
        clearInterval: () => {}
    });
    const timer = context.LogicQuizTimer.create({
        defaultMinutes: 20,
        parseMinutes: Number,
        setInterval: context.setInterval,
        clearInterval: context.clearInterval
    });
    timer.startSeconds(17);
    tick();
    assert.equal(timer.getRemainingSeconds(), 16);
});

test('batch module preserves local-only slots and response indexes', async () => {
    const context = load('scripts/quiz-batch.js');
    const result = await context.LogicQuizBatch.fetchQuestions([
        { operation: 'first', payload: {} },
        { operation: 'local', payload: {}, localOnly: true },
        { operation: 'third', payload: {} }
    ], {
        buildApiUrl: path => '/' + path,
        postJson: async () => ({
            result: { questions: [
                { index: 1, status: 'ok', result: { id: 'third' } },
                { index: 0, status: 'ok', result: { id: 'first' } }
            ] }
        })
    });
    assert.equal(result[0].id, 'first');
    assert.equal(result[1], null);
    assert.equal(result[2].id, 'third');
});

test('feedback requires every score in the 1-5 range', () => {
    const context = load('scripts/quiz-feedback.js');
    const values = {};
    context.LogicQuizFeedback.FIELDS.forEach(field => { values[field.id] = '5'; });
    assert.equal(context.LogicQuizFeedback.isComplete(values), true);
    values.control = '0';
    assert.equal(context.LogicQuizFeedback.isComplete(values), false);
});
