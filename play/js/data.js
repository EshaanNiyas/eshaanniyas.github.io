// Everything the world is built from: districts, milestones, colours.

export const PALETTE = {
  indigo: 0x6366f1,
  cyan: 0x22d3ee,
  amber: 0xf97316,
  green: 0x34d399,
  violet: 0xa855f7,
  ground: 0x0e1220,
  road: 0x1e2745
};

export const DISTRICTS = [
  {
    id: 'engineering',
    name: 'Engineering',
    kind: 'rig',
    position: [-62, 0, -46],
    color: PALETTE.amber,
    blurb: 'Structures, mechanisms and hardware — built, broken, measured and rebuilt.'
  },
  {
    id: 'ai',
    name: 'AI & Software',
    kind: 'core',
    position: [64, 0, -44],
    color: PALETTE.indigo,
    blurb: 'Models, code and tools — the part of the world that thinks.'
  },
  {
    id: 'sustainability',
    name: 'Sustainability',
    kind: 'grove',
    position: [-60, 0, 52],
    color: PALETTE.green,
    blurb: 'Turbines, panels and green systems: engineering pointed at the planet.'
  },
  {
    id: 'innovation',
    name: 'Innovation',
    kind: 'arch',
    position: [62, 0, 54],
    color: PALETTE.violet,
    blurb: 'Competitions, pitches and prototypes made under pressure.'
  }
];

// Milestones ring the central plaza — drive into one (or click it) to read it.
export const MILESTONES = [
  { id: 'harvard', title: 'Harvard Crimson Global Essay Competition', meta: 'Winner — MENA & Africa', color: PALETTE.amber },
  { id: 'lumiere', title: 'Lumiere Scholars Essay Award 2025', meta: 'Essay Award recipient', color: PALETTE.amber },
  { id: 'husko', title: 'HUSKO Asia Student Essay Competition 2026', meta: 'Top winner', color: PALETTE.amber },
  { id: 'hundred', title: 'HundrED Youth Ambassador', meta: 'Selected youth ambassador', color: PALETTE.cyan },
  { id: 'tks', title: 'The Knowledge Society — Dubai', meta: 'Selected participant, 2026–2027', color: PALETTE.indigo },
  { id: 'pravartak', title: 'IITM Pravartak Entrepreneurship Program', meta: 'Program completed', color: PALETTE.indigo },
  { id: 'tortoise', title: 'Tortoise Tank Innovation Competition', meta: 'Winning idea', color: PALETTE.violet },
  { id: 'pepsi', title: 'Pepsi Youth Hackathon', meta: 'Participant', color: PALETTE.violet },
  { id: 'nyuad', title: 'NYU Abu Dhabi Astronomy Camp', meta: 'Selected participant', color: PALETTE.cyan },
  { id: 'yalla', title: 'Yalla Returns Ambassador', meta: 'Sustainability initiative', color: PALETTE.green },
  { id: 'emarat', title: 'Emarat Beats', meta: 'Published short story', color: PALETTE.amber },
  { id: 'matholympiad', title: 'Math Olympiad', meta: 'Olympiad participation', color: PALETTE.cyan }
];

export const LEADERSHIP = [
  'Model United Nations — UNHCR, delegate for Mexico',
  'Student Council',
  'ADISSA · BSME · DASSA competitions',
  'Rugby · Football · Basketball'
];
