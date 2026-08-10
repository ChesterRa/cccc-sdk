import type { GroupSpaceArtifactOptions } from '../src/index.js';

type OutputFormat = NonNullable<GroupSpaceArtifactOptions['outputFormat']>;

const currentContractFormats: OutputFormat[] = [
  'json',
  'markdown',
  'html',
  'pdf',
  'pptx',
  'csv',
];

// @ts-expect-error The daemon contract does not define a DOCX artifact format.
const unsupportedFormat: OutputFormat = 'docx';

void currentContractFormats;
void unsupportedFormat;
