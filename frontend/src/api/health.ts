import type { components } from './types';

// ASSUMPTION (M0 task 8): the shell doesn't show health. This type only anchors the generated
// types to the client until M1 adds real hooks; delete it in M1 if still unused.
export type HealthRead = components['schemas']['HealthRead'];
