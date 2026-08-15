const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function loadPayloads() {
    const context = {};
    context.window = context;
    vm.runInNewContext(fs.readFileSync('scripts/quiz-payloads.js', 'utf8'), context);
    return context.LogicQuizPayloads;
}

test('payload builders keep API contracts in one module', () => {
    const payloads = loadPayloads();

    assert.deepEqual(
        { ...payloads.buildTruthValuePayload(true, 4) },
        {
            predicate_count: 4,
            true_options_count: 1,
            false_options_count: 3,
            allow_spoken_mode: true,
            timeout: 10
        }
    );
    assert.equal(payloads.buildLogicalConsequencePayload(false, 3).variable_count, 3);
    assert.equal(payloads.buildEquivalencePayload(false).wrong_answers_count, 3);
});

test('translation payload copies inputs and uses the canonical timeout field', () => {
    const payloads = loadPayloads();
    const names = ['Luca', 'Giulia', 'Sofia'];
    const actions = ['corre', 'salta', 'nuota'];
    const result = payloads.buildTranslationPayload(false, names, actions, values => values.reverse());

    assert.equal(result.timeout, 10);
    assert.equal(Object.hasOwn(result, 'timeout_seconds'), false);
    assert.deepEqual(Array.from(result.actions_pool), ['nuota', 'salta', 'corre']);
    assert.deepEqual(names, ['Luca', 'Giulia', 'Sofia']);
    assert.deepEqual(actions, ['corre', 'salta', 'nuota']);
});
