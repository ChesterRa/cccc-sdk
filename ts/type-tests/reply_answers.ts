import type {
  ChatMessageEventData,
  ReplyAnswer,
  ReplyAnswerV1,
  ReplyAnswerV2,
  ReplyQuestionV1,
} from '../src/index.js';

const question: ReplyQuestionV1 = {
  v: 1,
  prompt: 'Which route?',
  options: [{ id: 'A', label: 'First' }, { id: 'B', label: 'Second' }],
};
const option: ReplyAnswerV1 = { v: 1, option_id: 'A' };
const text: ReplyAnswerV1 = { v: 1, text: 'Another route' };
const note: ReplyAnswerV2 = { v: 2, option_id: 'B', note: '  Keep this spacing.\n' };
const data: ChatMessageEventData = { text: 'receipt', question, answer: note };
const answers: ReplyAnswer[] = [option, text, note];
void [data, answers];

// @ts-expect-error V1 does not accept a note, even for a selected option.
const invalidV1: ReplyAnswer = { v: 1, option_id: 'A', note: 'condition' };
// @ts-expect-error V1 option and free text are mutually exclusive.
const mixedV1: ReplyAnswer = { v: 1, option_id: 'A', text: 'other' };
// @ts-expect-error Null still counts as a forbidden V1 note field.
const nullNote: ReplyAnswer = { v: 1, option_id: 'A', note: null };
// @ts-expect-error V2 requires an accompanying note.
const missingNote: ReplyAnswer = { v: 2, option_id: 'A' };
// @ts-expect-error V2 cannot contain the V1 free-text field, even when null.
const mixedV2: ReplyAnswer = { v: 2, option_id: 'A', note: 'condition', text: null };
void [invalidV1, mixedV1, nullNote, missingNote, mixedV2];
