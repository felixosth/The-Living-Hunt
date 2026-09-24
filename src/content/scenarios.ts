import type { CalendarInput } from '../core/time';

export interface Scenario {
  id: string;
  name: string;
  /** Calendar date and time the game starts at. */
  start: CalendarInput;
  /** Region the player starts in. */
  regionId: string;
}

/** M0 test scenario: one generated forest region, arriving in autumn (Autumn 8). */
export const DEFAULT_SCENARIO: Scenario = {
  id: 'default',
  name: 'Test forest',
  start: { year: 1, season: 'Autumn', day: 8, hour: 7, minute: 0 },
  regionId: 'test-forest',
};
