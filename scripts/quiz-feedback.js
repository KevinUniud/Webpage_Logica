/*
 * Modello del questionario di feedback finale.
 */
(function exposeQuizFeedback(global) {
    'use strict';

    const FIELDS = Object.freeze([
        Object.freeze({ id: 'expectation', payloadKey: 'Aspettative test', label: 'Il test è andato bene:' }),
        Object.freeze({ id: 'aidsUtility', payloadKey: 'Utilità ausili', label: 'Gli ausili mi hanno aiutato a svolgere il test:' }),
        Object.freeze({ id: 'lessonsUtility', payloadKey: 'Utilità lezioni', label: 'Le lezioni di introduzione sono state utili per affrontare il test:' }),
        Object.freeze({ id: 'testDifficulty', payloadKey: 'Difficoltà test', label: 'I test sono stati difficili:' }),
        Object.freeze({ id: 'control', payloadKey: 'Controllo', label: 'Gli ausili non sono stati utili durante il test:' })
    ]);

    function isComplete(values) {
        return FIELDS.every(function(field) {
            return /^[1-5]$/.test(String(values[field.id] || ''));
        });
    }

    global.LogicQuizFeedback = Object.freeze({ FIELDS: FIELDS, isComplete: isComplete });
})(window);

