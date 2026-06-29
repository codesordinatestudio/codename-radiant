import { blankTemplate } from './blank';

export const templates: Record<string, { label: string, hint: string, content: string }> = {
  blank: {
    label: 'Blank Project',
    hint: 'A clean slate with a basic schema',
    content: blankTemplate
  }
};
