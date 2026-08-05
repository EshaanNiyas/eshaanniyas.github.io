// Everything in the world is driven from here: places to discover, their real
// content, and the palette. No invented achievements.

export const PALETTE = {
  indigo: 0x6366f1,
  cyan: 0x22d3ee,
  amber: 0xf97316,
  green: 0x34d399,
  violet: 0xa855f7,
  gold: 0xfacc15
};

// position is [x, z]; the terrain flattens a pad under each of these.
export const PLACES = [
  {
    id: 'hub',
    kind: 'hub',
    name: 'Eshaan Niyas',
    meta: 'Academic scholar & young innovator',
    position: [0, 0],
    radius: 26,
    color: PALETTE.cyan,
    blurb: 'Student engineer, AI builder, entrepreneur and problem solver. Follow a road — every one leads somewhere I have been.',
    items: []
  },
  {
    id: 'awards',
    kind: 'monument',
    name: 'The Monument',
    meta: 'Writing & major awards',
    position: [-96, -104],
    radius: 24,
    color: PALETTE.gold,
    blurb: 'Essays and stories that travelled further than expected.',
    items: [
      { title: 'Harvard Crimson Global Essay Competition', meta: 'Winner — MENA & Africa' },
      { title: 'Lumiere Scholars Essay Award 2025', meta: 'Essay award recipient' },
      { title: 'HUSKO Asia Student Essay Competition 2026', meta: 'Top winner' },
      { title: 'Emarat Beats', meta: 'Published short story' }
    ]
  },
  {
    id: 'lab',
    kind: 'lab',
    name: 'The Lab',
    meta: 'AI, software & engineering',
    position: [116, -74],
    radius: 24,
    color: PALETTE.indigo,
    blurb: 'Where the building happens: AI and software projects, engineering builds, and the websites and tools in between.',
    items: [
      { title: 'AI & software development', meta: 'Models, tools and applications' },
      { title: 'Engineering projects', meta: 'Hardware, structures and mechanisms' },
      { title: 'Web development & coding', meta: 'Sites, interfaces and experiments' }
    ]
  },
  {
    id: 'pavilion',
    kind: 'pavilion',
    name: 'The Pavilion',
    meta: 'Innovation & entrepreneurship',
    position: [128, 36],
    radius: 22,
    color: PALETTE.violet,
    blurb: 'Competitions, pitches and programmes — ideas built under pressure.',
    items: [
      { title: 'Tortoise Tank Innovation Competition', meta: 'Winning idea' },
      { title: 'Pepsi Youth Hackathon', meta: 'Participant' },
      { title: 'The Knowledge Society (TKS) Dubai', meta: 'Selected participant, 2026–2027' },
      { title: 'IITM Pravartak Entrepreneurship Program', meta: 'Programme completed' }
    ]
  },
  {
    id: 'stage',
    kind: 'stage',
    name: 'The Amphitheatre',
    meta: 'Voice & leadership',
    position: [56, 118],
    radius: 24,
    color: PALETTE.amber,
    blurb: 'Committees, councils and the work of speaking for other people.',
    items: [
      { title: 'Model United Nations', meta: 'UNHCR committee — delegate for Mexico' },
      { title: 'Student Council', meta: 'Elected representative' },
      { title: 'HundrED Youth Ambassador', meta: 'Selected youth ambassador' }
    ]
  },
  {
    id: 'green',
    kind: 'field',
    name: 'The Green Field',
    meta: 'Sustainability',
    position: [-64, 122],
    radius: 22,
    color: PALETTE.green,
    blurb: 'Engineering pointed at the planet — turbines, panels and circular systems.',
    items: [
      { title: 'Yalla Returns Ambassador', meta: 'Sustainability initiative' },
      { title: 'Sustainability engineering projects', meta: 'Energy and waste-focused builds' }
    ]
  },
  {
    id: 'observatory',
    kind: 'observatory',
    name: 'The Observatory',
    meta: 'Science & curiosity',
    position: [-130, 34],
    radius: 20,
    color: PALETTE.cyan,
    blurb: 'The part of the map that just wants to know how things work.',
    items: [
      { title: 'NYU Abu Dhabi Astronomy Camp', meta: 'Selected participant' },
      { title: 'Math Olympiad', meta: 'Olympiad participation' }
    ]
  },
  {
    id: 'grounds',
    kind: 'athletics',
    name: 'The Grounds',
    meta: 'Sport & school competition',
    position: [-40, -118],
    radius: 20,
    color: PALETTE.amber,
    blurb: 'Seasons of it: rugby, football, basketball, and the inter-school circuit.',
    items: [
      { title: 'Rugby · Football · Basketball', meta: 'School team achievements' },
      { title: 'ADISSA · BSME · DASSA', meta: 'Inter-school competitions' }
    ]
  }
];

// Roadside holograms: short lines you read while driving past.
export const SIGNS = [
  { position: [-52, -62], rotation: 0.9, text: 'The Monument →' },
  { position: [62, -78], rotation: -0.9, text: 'The Lab →' },
  { position: [96, 26], rotation: -1.6, text: 'The Pavilion →' },
  { position: [40, 82], rotation: 2.6, text: 'The Amphitheatre →' },
  { position: [-46, 86], rotation: -2.6, text: 'The Green Field →' },
  { position: [-88, 6], rotation: 1.6, text: 'The Observatory →' }
];

export const CONTACT = {
  email: 'niyaseshaan@gmail.com',
  linkedin: 'https://www.linkedin.com/in/eshaanniyas',
  medium: 'https://medium.com/@niyaseshaan'
};
