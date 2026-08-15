const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const context = {};
context.window = context;
vm.runInNewContext(fs.readFileSync('scripts/quiz-report.js', 'utf8'), context);
const report = context.LogicQuizReport;

test('STEM is required only for university choices', () => {
    assert.equal(report.isStemRequired('triennale'), true);
    assert.equal(report.isStemRequired('liceo-scientifico'), false);
});

test('demographics are read from current form controls only', () => {
    const demographics = report.readDemographics({
        age: { value: ' 22 ' },
        institution: { value: 'triennale' },
        stem: { value: 'STEM' }
    });

    assert.deepEqual({ ...demographics }, {
        age: '22',
        institution: 'triennale',
        stem: 'STEM'
    });
});

test('buildReport computes totals without DOM dependencies', () => {
    const output = report.buildReport({
        startedAt: 1000,
        now: 6000,
        results: [
            { isCorrect: true, question: 'Q1', selectedAnswer: 'A', correctAnswer: 'A' },
            { isCorrect: false, question: 'Q2', selectedAnswer: 'B', correctAnswer: 'C' }
        ],
        demographics: { age: '20', institution: 'triennale', stem: 'STEM' },
        feedback: { expectation: '5' },
        feedbackFields: [{ id: 'expectation', payloadKey: 'Aspettative test' }]
    });

    assert.equal(output['Initial Data']['Tempo totale'], '5.00s');
    assert.equal(output['Initial Data']['Totale domande corrette'], 1);
    assert.equal(output.Feedback['Aspettative test'], '5');
});
