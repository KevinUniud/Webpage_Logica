(function exposeQuizPayloads(global) {
    'use strict';

    const DEFAULT_TIMEOUT_SECONDS = 10;

    function count(value, fallback, minimum, maximum) {
        const number = Math.round(Number(value));
        return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback;
    }

    function buildEquivalencePayload(spokenLanguageMode, options) {
        const settings = options || {};
        return {
            use_all: false,
            wrong_answers_count: count(settings.wrongAnswersCount, 3, 1, 32),
            allow_spoken_mode: Boolean(spokenLanguageMode),
            timeout: DEFAULT_TIMEOUT_SECONDS
        };
    }

    function buildTruthValuePayload(spokenLanguageMode, targetAtomCount, options) {
        const settings = options || {};
        return {
            predicate_count: count(targetAtomCount, 3, 3, 5),
            true_options_count: count(settings.trueOptionsCount, 1, 1, 32),
            false_options_count: count(settings.falseOptionsCount, 3, 1, 32),
            allow_spoken_mode: Boolean(spokenLanguageMode),
            timeout: DEFAULT_TIMEOUT_SECONDS
        };
    }

    function buildLogicalConsequencePayload(spokenLanguageMode, targetAtomCount, options) {
        const settings = options || {};
        return {
            variable_count: count(targetAtomCount, 3, 1, 64),
            correct_options_count: count(settings.correctOptionsCount, 1, 1, 32),
            wrong_options_count: count(settings.wrongAnswersCount, 3, 1, 32),
            allow_spoken_mode: Boolean(spokenLanguageMode),
            timeout: DEFAULT_TIMEOUT_SECONDS
        };
    }

    function buildTranslationPayload(spokenLanguageMode, names, actions, shuffle, options) {
        const settings = options || {};
        const namesPool = Array.isArray(names) ? names.slice() : [];
        const actionsPool = Array.isArray(actions) ? actions.slice() : [];
        const randomizedActions = typeof shuffle === 'function' ? shuffle(actionsPool) : actionsPool;
        return {
            mode: 'auto',
            quantifier_ratio: Math.min(1, Math.max(0, Number(settings.quantifierRatio ?? 0.5))),
            wrong_options_count: count(settings.wrongAnswersCount, 3, 1, 32),
            names_pool: namesPool,
            people_count: Math.min(count(settings.peopleCount, 3, 1, 128), namesPool.length),
            actions_pool: randomizedActions,
            allow_spoken_mode: Boolean(spokenLanguageMode),
            timeout: DEFAULT_TIMEOUT_SECONDS
        };
    }

    global.LogicQuizPayloads = Object.freeze({
        buildEquivalencePayload,
        buildLogicalConsequencePayload,
        buildTranslationPayload,
        buildTruthValuePayload
    });
})(window);
