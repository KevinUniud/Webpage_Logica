const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function loadScript(file) {
    const context = {};
    context.window = context;
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), context);
    return context;
}

class FakeQuizOption {
    constructor() {
        this.attributes = {};
        this.className = '';
        this.classList = {
            toggle: (name, enabled) => {
                const classes = new Set(this.className.split(/\s+/).filter(Boolean));
                if (enabled) classes.add(name);
                else classes.delete(name);
                this.className = Array.from(classes).join(' ');
            },
            remove: (...names) => {
                const classes = new Set(this.className.split(/\s+/).filter(Boolean));
                names.forEach(name => classes.delete(name));
                this.className = Array.from(classes).join(' ');
            }
        };
        this.dataset = {};
        this.tabIndex = 0;
        this.focused = false;
    }

    setAttribute(name, value) {
        this.attributes[name] = String(value);
    }

    getAttribute(name) {
        return this.attributes[name] ?? null;
    }

    focus() {
        this.focused = true;
    }
}

class FakeQuizOptionsContainer {
    constructor() {
        this.children = [];
        this._innerHTML = '';
    }

    set innerHTML(value) {
        this._innerHTML = String(value);
        if (value === '') this.children = [];
    }

    appendChild(child) {
        this.children.push(child);
    }

    querySelectorAll(selector) {
        return selector === '.quiz-option' ? this.children : [];
    }
}

test('quiz state creates independent defaults and reads exercise preferences', () => {
    const context = loadScript('scripts/quiz-state.js');
    const first = context.LogicQuizState.create({
        isExercisesPage: true,
        highlightKey: 'highlight',
        parensKey: 'parens',
        readSetting: key => key === 'highlight'
    });
    const second = context.LogicQuizState.create({});

    assert.equal(first.highlightAtoms, true);
    assert.equal(first.differentiateParens, false);
    first.options.push({ text: 'p' });
    assert.equal(second.options.length, 0);
});

test('quiz renderer implements one roving tab stop without selecting an answer by default', () => {
    const context = {
        document: { createElement: () => new FakeQuizOption() }
    };
    context.window = context;
    vm.runInNewContext(fs.readFileSync('scripts/quiz-renderer.js', 'utf8'), context);
    const state = {
        options: ['p', 'q', 'r'],
        selectedIndex: null,
        spokenlanguage: false,
        exerciseKind: 'equivalence'
    };
    const optionsEl = new FakeQuizOptionsContainer();
    const renderer = context.LogicQuizRenderer.create({
        state,
        infoEl: { hidden: true, innerHTML: '' },
        optionsEl,
        statusEl: { textContent: '' },
        colorizeAtomsInText: value => value,
        transformFormula: value => value,
        getOptionFormula: value => value
    });

    renderer.renderOptions();
    assert.deepEqual(optionsEl.children.map(option => option.tabIndex), [0, -1, -1]);
    assert.deepEqual(optionsEl.children.map(option => option.getAttribute('aria-checked')), ['false', 'false', 'false']);

    state.selectedIndex = 2;
    renderer.updateSelectionVisual({ focusIndex: 2, focus: true });
    assert.deepEqual(optionsEl.children.map(option => option.tabIndex), [-1, -1, 0]);
    assert.equal(optionsEl.children[2].getAttribute('aria-checked'), 'true');
    assert.equal(optionsEl.children[2].focused, true);
});

test('spoken atom mapping is stable across reloads and atom order', () => {
    const context = loadScript('scripts/quiz-shared.js');
    const names = ['Luca', 'Giulia', 'Sofia'];
    const actions = ['corre', 'salta', 'nuota'];
    const first = context.quizShared.buildStableSpokenMap(['q', 'P', 'r'], names, actions);
    const resumed = context.quizShared.buildStableSpokenMap(['r', 'p', 'Q'], names, actions);

    assert.deepEqual(JSON.parse(JSON.stringify(resumed)), JSON.parse(JSON.stringify(first)));
    assert.deepEqual(Object.keys(first), ['p', 'q', 'r']);
    assert.ok(Object.values(first).every(entry => entry.nome && entry.azione));
});

test('spoken translation mapping follows the API legend and falls back only when absent', () => {
    const context = loadScript('scripts/quiz-shared.js');
    const names = ['Nome fallback'];
    const actions = ['corre', 'apre la porta', 'salta'];
    const propositional = context.quizShared.resolveSpokenMap(
        ['P = Luca corre', 'Q = Giulia apre la porta'],
        ['p', 'q', 'r'],
        names,
        actions
    );
    const quantified = context.quizShared.resolveSpokenMap(
        ['A(x) = x salta'],
        ['a'],
        names,
        actions
    );

    assert.deepEqual(JSON.parse(JSON.stringify(propositional)), {
        p: { nome: 'Luca', azione: 'corre' },
        q: { nome: 'Giulia', azione: 'apre la porta' }
    });
    assert.equal(Object.hasOwn(propositional, 'r'), false);
    assert.deepEqual(JSON.parse(JSON.stringify(quantified)), {
        a: { nome: 'persona', azione: 'salta' }
    });

    const fallback = context.quizShared.resolveSpokenMap([], ['p'], names, actions);
    assert.equal(fallback.p.nome, 'Nome fallback');
});

test('quiz normalizers validate and standardize truth-value payloads', () => {
    const context = loadScript('scripts/quiz-normalizers.js');
    const normalizers = context.LogicQuizNormalizers.create({
        shuffle: values => values.slice(),
        prologToLogical: value => value,
        normalizeGenerationSteps: value => Array.isArray(value) ? value : [],
        extractWrongStepsMap: () => ({})
    });
    const result = normalizers.normalizeTruthValueResult({
        result: {
            question_id: 'question-stable',
            information: ['p-true', 'q-false', 'r-true'],
            options: [
                { formula_prolog: 'p', is_true: true },
                { formula_prolog: 'q', is_true: false },
                { formula_prolog: 'r', is_true: false },
                { formula_prolog: 'and(p,q)', is_true: false }
            ]
        }
    });

    assert.equal(result.kind, 'truth-value');
    assert.equal(result.questionId, 'question-stable');
    assert.equal(result.options.filter(option => option.correct).length, 1);
    assert.equal(result.info[0], 'p è vero');
});

test('quiz normalizers preserve construction traces on every option', () => {
    const constructionContext = loadScript('scripts/formula-construction.js');
    const context = loadScript('scripts/quiz-normalizers.js');
    const normalizers = context.LogicQuizNormalizers.create({
        shuffle: values => values.slice(),
        prologToLogical: value => value,
        normalizeGenerationSteps: () => [],
        extractWrongStepsMap: () => ({}),
        normalizeConstruction: constructionContext.LogicFormulaConstruction.normalize,
        buildConstructionFromFormula: constructionContext.LogicFormulaConstruction.buildFromFormula,
        buildQuantifiedConstruction: constructionContext.LogicFormulaConstruction.buildQuantifiedTrace
    });
    const result = normalizers.normalizeTranslationResult({
        result: {
            question_text: 'Traduci la frase',
            info: [],
            options: [
                { formula: 'and(P,Q)', is_correct: true },
                { formula: 'or(P,Q)', is_correct: false }
            ]
        }
    });

    assert.equal(result.options.length, 2);
    assert.ok(result.options.every(option => option.construction));
    assert.equal(result.options.find(option => option.correct).construction.final_formula_prolog, 'and(P,Q)');
});

test('quiz normalizers preserve only valid explicit transformation paths', () => {
    const constructionContext = loadScript('scripts/formula-construction.js');
    const transformationContext = loadScript('scripts/formula-transformation.js');
    const context = loadScript('scripts/quiz-normalizers.js');
    const normalizers = context.LogicQuizNormalizers.create({
        shuffle: values => values.slice(),
        prologToLogical: value => value,
        normalizeGenerationSteps: () => [],
        extractWrongStepsMap: () => ({}),
        normalizeConstruction: constructionContext.LogicFormulaConstruction.normalize,
        buildConstructionFromFormula: constructionContext.LogicFormulaConstruction.buildFromFormula,
        buildQuantifiedConstruction: constructionContext.LogicFormulaConstruction.buildQuantifiedTrace,
        normalizeTransformation: transformationContext.LogicFormulaTransformation.normalize
    });
    const transformation = {
        version: 1,
        strategy: 'equivalence_rewrite',
        source_formula_prolog: 'imp(p,q)',
        final_formula_prolog: 'or(not(p),q)',
        preserves_meaning: true,
        steps: [{
            index: 1,
            kind: 'rewrite',
            rule: 'implication_elimination',
            before_prolog: 'imp(p,q)',
            after_prolog: 'or(not(p),q)',
            location: 'root'
        }]
    };
    const result = normalizers.normalizeEquivalenceResult({
        result: {
            question_prolog: 'imp(p,q)',
            options: [
                { formula_prolog: 'or(not(p),q)', is_correct: true, transformation: transformation },
                { formula_prolog: 'and(p,q)', is_correct: false, transformation: transformation }
            ]
        }
    });

    assert.equal(result.options.find(option => option.correct).transformation.final_formula_prolog, 'or(not(p),q)');
    assert.equal(result.options.find(option => !option.correct).transformation, null);
    assert.ok(result.options.every(option => option.construction));
});

test('quiz normalizers reject incomplete logical-consequence payloads', () => {
    const context = loadScript('scripts/quiz-normalizers.js');
    const normalizers = context.LogicQuizNormalizers.create({
        shuffle: values => values.slice(),
        prologToLogical: value => value,
        normalizeGenerationSteps: () => [],
        extractWrongStepsMap: () => ({})
    });

    assert.equal(normalizers.normalizeLogicalConsequenceResult({ result: { options: [] } }), null);
});
