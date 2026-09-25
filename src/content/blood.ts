/**
 * Blood sign by hit. The code is stored in a blood sign's `detail` field; what
 * a hunter can tell from it depends on their blood literacy.
 */
export const BloodType = {
  None: 0,
  /** Heart: bright red spray. */
  Bright: 1,
  /** Lungs: bright pink, with bubbles. */
  Frothy: 2,
  /** Liver: dark red. */
  Dark: 3,
  /** Gut: dark, with green-brown stomach contents. */
  Gut: 4,
  /** Leg or muscle: a few drops that soon dry up. */
  Sparse: 5,
  /** Glancing hit on bone: a smear, a little hair. */
  Graze: 6,
} as const;
export type BloodType = (typeof BloodType)[keyof typeof BloodType];

interface BloodLore {
  /** What anyone can see. */
  looks: string;
  /** What it means, once you know blood. */
  means: string;
  /** Advice at the highest literacy. */
  advice: string;
}

export const BLOOD_LORE: Record<Exclude<BloodType, 0>, BloodLore> = {
  [BloodType.Bright]: {
    looks: 'Bright red blood, sprayed wide',
    means: 'a heart hit',
    advice: 'It will not go far. Follow now.',
  },
  [BloodType.Frothy]: {
    looks: 'Bright pink blood, full of tiny bubbles',
    means: 'a lung hit',
    advice: 'It will lie down within a few hundred metres. A short wait, then follow.',
  },
  [BloodType.Dark]: {
    looks: 'Dark red blood, no bubbles',
    means: 'a liver hit',
    advice: 'Deadly, but slow. Wait an hour or more; pushed now, it will run.',
  },
  [BloodType.Gut]: {
    looks: 'Dark blood with green-brown matter in it',
    means: 'a gut hit',
    advice: 'Wait for hours. If you push it, you will lose it.',
  },
  [BloodType.Sparse]: {
    looks: 'A few drops, far apart',
    means: 'a leg or muscle wound',
    advice: 'It will likely live. The trail will dry up.',
  },
  [BloodType.Graze]: {
    looks: 'A smear of blood and some cut hair',
    means: 'a glancing hit',
    advice: 'Barely a wound. It will live.',
  },
};
