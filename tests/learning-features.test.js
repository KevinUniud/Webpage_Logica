const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function loadFiles(files) {
    const context = { window: null };
    context.window = context;
    files.forEach(file => vm.runInNewContext(fs.readFileSync(file, 'utf8'), context));
    return context;
}

test('operation plan follows selected question types and exact count', () => {
    const context = loadFiles(['scripts/data-contracts.js', 'scripts/quiz-config.js']);
    const plan = context.LogicQuizConfig.buildOperationPlan({
        questionCount: 5,
        questionTypes: ['equivalence', 'quantifier-negation']
    }, { equivalence: () => ({ value: 1 }) });

    assert.equal(plan.length, 5);
    assert.deepEqual(Array.from(plan, item => item.operation), [
        'build_ex_depth',
        'build_quantifier_negation',
        'build_ex_depth',
        'build_quantifier_negation',
        'build_ex_depth'
    ]);
});

test('operation plan honours exact per-type quotas', () => {
    const context = loadFiles(['scripts/data-contracts.js', 'scripts/quiz-config.js']);
    const plan = context.LogicQuizConfig.buildOperationPlan({
        questionTypes: ['equivalence', 'translation'],
        typeCounts: { equivalence: 1, translation: 3 }
    }, { equivalence: () => ({}), translation: () => ({}) });
    assert.deepEqual(Array.from(plan, item => item.questionType), [
        'equivalence', 'translation', 'translation', 'translation'
    ]);
});

test('single-question fallback stays inside configured types and honours a valid plan slot', () => {
    const context = loadFiles(['scripts/data-contracts.js', 'scripts/quiz-config.js']);
    const translationOnly = { spokenLanguage: true, questionTypes: ['translation'] };

    assert.deepEqual(
        Array.from(context.LogicQuizConfig.allowedOperations(translationOnly)),
        ['build_translation_question']
    );
    assert.equal(
        context.LogicQuizConfig.resolveFallbackOperation(translationOnly, 'build_tvq'),
        'build_translation_question'
    );
    assert.equal(
        context.LogicQuizConfig.resolveFallbackOperation(
            { questionTypes: ['truth-value', 'translation'] },
            'build_translation_question'
        ),
        'build_translation_question'
    );
});

test('adaptive engine changes at most one transparent level', () => {
    const context = loadFiles(['scripts/learning-metrics.js', 'scripts/adaptive-engine.js']);
    const attempts = Array.from({ length: 6 }, () => ({ type: 'equivalence', correct: true, elapsedMs: 1000 }));
    const result = context.LogicAdaptiveEngine.recommend(attempts, 'easy');

    assert.equal(result.difficulty, 'medium');
    assert.equal(result.changed, true);
    assert.match(result.reason, /80%/);
});

test('CSV export prevents spreadsheet formula injection', () => {
    const context = loadFiles(['scripts/results-export.js']);
    const csv = context.LogicResultsExport.toCsv([{ question: '=CMD()', correct: false }]);

    assert.match(csv, /'=CMD\(\)/);
});

test('metrics include accessible groupings by type and difficulty', () => {
    const context = loadFiles(['scripts/learning-metrics.js']);
    const metrics = context.LogicLearningMetrics.aggregate([
        { type: 'equivalence', difficulty: 'easy', correct: true, elapsedMs: 1000 },
        { type: 'equivalence', difficulty: 'hard', correct: false, elapsedMs: 3000 }
    ]);
    assert.equal(metrics.byType[0].total, 2);
    assert.equal(metrics.byDifficulty.length, 2);
});

test('error notebook preserves authentic transformation paths for later review', async () => {
    const writes = [];
    const storage = {
        get: async function() { return null; },
        put: async function(store, key, value) { writes.push({ store, key, value }); },
        list: async function() { return []; },
        remove: async function() {}
    };
    const contracts = {
        errorKey: function() { return 'equivalence|question-1|answer'; }
    };
    const context = { window: null };
    context.window = context;
    vm.runInNewContext(fs.readFileSync('scripts/error-notebook.js', 'utf8'), context);
    const notebook = context.LogicErrorNotebook.create({ storage: storage, contracts: contracts });
    const correctTransformation = { version: 1, strategy: 'equivalence_rewrite' };
    const selectedTransformation = { version: 1, strategy: 'distractor_mutation' };

    await notebook.record({
        correct: false,
        questionId: 'question-1',
        type: 'equivalence',
        difficulty: 'easy',
        question: 'Domanda',
        selectedAnswer: 'and(p,q)',
        correctAnswer: 'or(not(p),q)',
        answeredAt: 1
    }, {
        transformationCorrect: correctTransformation,
        transformationSelected: selectedTransformation
    });

    assert.equal(writes.length, 1);
    assert.equal(writes[0].value.transformationCorrect, correctTransformation);
    assert.equal(writes[0].value.transformationSelected, selectedTransformation);
});
