import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type ApproveGateMeta, type DraftItem, draftPreview, fromDraftItem } from './pa-actions.js';

const META: ApproveGateMeta = {
	actionId: 'com.ikenga.skill-mail/reply',
	actionName: 'Reply',
	agent: 'PA',
	model: 'Opus 4.7',
};

function item(over: Partial<DraftItem> = {}): DraftItem {
	return {
		id: 'd1',
		recipient: 'Valentim de Carvalho',
		recipientEmail: 'valentim@valentimdc.pt',
		subject: 'Re: Catalog import',
		body: 'Olá Valentim,\n\nRecebido.   Vou processar agora.',
		channel: 'smtp',
		senderAddress: 'chinedum@royalti.io',
		fromProvider: 'SMTP · Fastmail',
		scheduledIso: null,
		scheduledLabel: 'today',
		...over,
	};
}

// Anchor everything to LOCAL time so the day-bucketing assertions are
// timezone-independent (new Date(y, m, d, h) is local-time construction).
const NOW = new Date(2026, 5, 7, 11, 0, 0).getTime(); // 11:00 local, 2026-06-07
const TODAY_ISO = new Date(2026, 5, 7, 17, 0, 0).toISOString(); // same local day, future
const OVERDUE_ISO = new Date(2026, 5, 5, 9, 0, 0).toISOString(); // two days earlier

test('fromDraftItem maps producer fields + meta', () => {
	const d = fromDraftItem(item(), META, NOW);
	assert.equal(d.id, 'd1');
	assert.equal(d.agent, 'PA');
	assert.equal(d.model, 'Opus 4.7');
	assert.equal(d.channel, 'smtp');
	assert.equal(d.consequence.channel, 'SMTP');
	assert.equal(d.consequence.target, 'Valentim de Carvalho');
	assert.equal(d.consequence.recipients, 1);
	assert.equal(d.consequence.undoMs, 10_000);
	assert.equal(d.everEdited, false);
	assert.equal(d.cold, false);
});

test('fromDraftItem buckets an overdue draft', () => {
	const d = fromDraftItem(item({ scheduledIso: OVERDUE_ISO }), META, NOW);
	assert.equal(d.overdue, true);
	assert.equal(d.timeVariant, 'is-overdue');
	assert.equal(d.section, 'Overdue');
	assert.equal(d.status, 'overdue');
});

test('fromDraftItem buckets a same-day draft as today', () => {
	const d = fromDraftItem(item({ scheduledIso: TODAY_ISO }), META, NOW);
	assert.equal(d.overdue, false);
	assert.equal(d.timeVariant, 'is-today');
	assert.equal(d.section, 'Today');
	assert.equal(d.status, 'awaiting');
});

test('an explicit section overrides time bucketing', () => {
	const d = fromDraftItem(item({ scheduledIso: OVERDUE_ISO, section: 'This week' }), META, NOW);
	assert.equal(d.section, 'This week');
	assert.equal(d.overdue, true); // overdue flag still reflects the clock
});

test('sequence recipient count flows into the consequence', () => {
	const d = fromDraftItem(
		item({
			recipients: 388,
			sequence: { name: 'L5 Winback', step: 3, total: 5, recipients: 388 },
		}),
		META,
		NOW
	);
	assert.equal(d.consequence.recipients, 388);
	assert.equal(d.sequence?.step, 3);
});

test('undoMs falls back to 10s when meta omits it', () => {
	const d = fromDraftItem(item(), { ...META, undoMs: undefined }, NOW);
	assert.equal(d.consequence.undoMs, 10_000);
});

test('draftPreview collapses whitespace and truncates', () => {
	assert.equal(draftPreview('a   b\n\nc'), 'a b c');
	assert.ok(draftPreview('x'.repeat(300)).length <= 160);
	assert.ok(draftPreview('x'.repeat(300)).endsWith('…'));
});
