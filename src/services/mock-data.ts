import type { QuestionDocument } from './firebase';

const sampleOptions = [
  {
    id: 'yes',
    label: {
      lb: 'Jo',
      fr: 'Oui',
      de: 'Ja',
      en: 'Yes',
    },
  },
  {
    id: 'no',
    label: {
      lb: 'Nee',
      fr: 'Non',
      de: 'Nein',
      en: 'No',
    },
  },
  {
    id: 'unsure',
    label: {
      lb: 'Net sécher',
      fr: 'Pas sûr',
      de: 'Nicht sicher',
      en: 'Not sure',
    },
  },
];

export const fallbackQuestions: QuestionDocument[] = [
  {
    id: 'demo-1',
    dateKey: '05-31-2024',
    order: 1,
    question: {
      lb: 'Soll Lëtzebuerg méi an erneierbar Energien investéieren?',
      fr: "Le Luxembourg devrait-il investir davantage dans les énergies renouvelables ?",
      de: 'Soll Luxemburg stärker in erneuerbare Energien investieren?',
      en: 'Should Luxembourg invest more in renewable energy?',
    },
    options: sampleOptions,
    article: {
      summary: {
        lb: 'Den Artikel beschreift nei Investitiounen an d’Gréngen Energie zu Lëtzebuerg.',
        fr: "L'article explique les nouveaux investissements dans les énergies vertes au Luxembourg.",
        de: 'Der Artikel beschreibt neue Investitionen in grüne Energie in Luxemburg.',
        en: 'The article outlines new investments in green energy in Luxembourg.',
      },
    },
    tags: [
      { lb: 'Energie', fr: 'Energie', de: 'Energie', en: 'Energy' },
      { lb: 'Nohaltegkeet', fr: 'Durabilite', de: 'Nachhaltigkeit', en: 'Sustainability' },
      { lb: 'Klima', fr: 'Climat', de: 'Klima', en: 'Climate' },
    ],
    results: {
      totalResponses: 1280,
      perOption: {
        yes: 840,
        no: 270,
        unsure: 170,
      },
      breakdown: [
        {
          optionId: 'yes',
          percentage: 65.6,
          count: 840,
        },
        {
          optionId: 'no',
          percentage: 21.1,
          count: 270,
        },
        {
          optionId: 'unsure',
          percentage: 13.3,
          count: 170,
        },
      ],
      summary: {
        lb: '1280 Stemmen: "Jo" feiert mat 840 fir erneierbar Energien.',
        fr: '1280 votes : "Oui" est en tete avec 840 pour les energies renouvelables.',
        de: '1280 Stimmen: "Ja" fuehrt mit 840 fuer erneuerbare Energien.',
        en: '1280 votes: "Yes" leads with 840 for renewable energy.',
      },
    },
  },
  {
    id: 'demo-2',
    dateKey: '05-31-2024',
    order: 2,
    question: {
      lb: 'Soll déi nei Tram bis op Esch verlängert ginn?',
      fr: "Le nouveau tram doit-il être prolongé jusqu'à Esch ?",
      de: 'Soll die neue Tram bis nach Esch verlängert werden?',
      en: 'Should the new tram be extended to Esch?',
    },
    options: sampleOptions,
    article: {
      summary: {
        lb: 'Nei Pläng gesinn eng méiglech Verlängerung vum Tram Richtung Süden vir.',
        fr: 'De nouveaux plans évoquent un possible prolongement du tram vers le sud.',
        de: 'Neue Pläne sehen eine mögliche Verlängerung der Tram in den Süden vor.',
        en: 'New plans consider extending the tram line toward the south.',
      },
    },
    tags: [
      { lb: 'Mobiliteit', fr: 'Mobilite', de: 'Mobilitat', en: 'Mobility' },
      { lb: 'Tram', fr: 'Tram', de: 'Tram', en: 'Tram' },
      { lb: 'Infrastruktur', fr: 'Infrastructure', de: 'Infrastruktur', en: 'Infrastructure' },
    ],
    results: {
      totalResponses: 980,
      perOption: {
        yes: 610,
        no: 260,
        unsure: 110,
      },
      breakdown: [
        { optionId: 'yes', percentage: 62.2, count: 610 },
        { optionId: 'no', percentage: 26.5, count: 260 },
        { optionId: 'unsure', percentage: 11.2, count: 110 },
      ],
      summary: {
        lb: '980 Stemmen: "Jo" bleift vir mat 610 fir d Tram bis Esch.',
        fr: '980 votes : "Oui" mene avec 610 pour prolonger le tram jusqu a Esch.',
        de: '980 Stimmen: "Ja" fuehrt mit 610 fuer die Tram nach Esch.',
        en: '980 votes: "Yes" leads with 610 to extend the tram to Esch.',
      },
    },
  },
  {
    id: 'demo-3',
    dateKey: '05-31-2024',
    order: 3,
    question: {
      lb: 'Soll d’Staat méi an d’Psychologesch Gesondheet investéieren?',
      fr: 'L’État devrait-il investir davantage dans la santé mentale ?',
      de: 'Soll der Staat mehr in psychische Gesundheit investieren?',
      en: 'Should the state invest more in mental health services?',
    },
    options: sampleOptions,
    article: {
      summary: {
        lb: 'Expert*innen fuerderen méi Ënnerstëtzung fir mental Gesondheet zu Lëtzebuerg.',
        fr: 'Des experts demandent un meilleur soutien à la santé mentale au Luxembourg.',
        de: 'Expertinnen fordern mehr Unterstützung für psychische Gesundheit in Luxemburg.',
        en: 'Experts call for expanded mental health support in Luxembourg.',
      },
    },
    tags: [
      { lb: 'Gesondheet', fr: 'Sante', de: 'Gesundheit', en: 'Health' },
      { lb: 'Mental Gesondheet', fr: 'Sante mentale', de: 'Psychische Gesundheit', en: 'Mental health' },
      { lb: 'Soziales', fr: 'Social', de: 'Soziales', en: 'Social' },
    ],
    results: {
      totalResponses: 1120,
      perOption: {
        yes: 820,
        no: 150,
        unsure: 150,
      },
      breakdown: [
        { optionId: 'yes', percentage: 73.2, count: 820 },
        { optionId: 'no', percentage: 13.4, count: 150 },
        { optionId: 'unsure', percentage: 13.4, count: 150 },
      ],
      summary: {
        lb: '1120 Participanten: meeschtens dofir, méi a mental Gesondheet ze investéieren.',
        fr: '1120 participants: la majorité souhaite plus d’investissements dans la santé mentale.',
        de: '1120 Teilnehmende: Mehrheit befürwortet mehr Mittel für psychische Gesundheit.',
        en: '1120 participants: most support more investment in mental health.',
      },
    },
  },
  {
    id: 'demo-4',
    dateKey: '05-31-2024',
    order: 4,
    question: {
      lb: 'Soll Lëtzebuerg méi Feierdeeg kréien?',
      fr: 'Le Luxembourg devrait-il ajouter de nouveaux jours fériés ?',
      de: 'Soll Luxemburg zusätzliche Feiertage einführen?',
      en: 'Should Luxembourg add new public holidays?',
    },
    options: sampleOptions,
    article: {
      summary: {
        lb: 'Eng Debatt iwwer weider Feierdeeg huet nei Dynamik kritt.',
        fr: 'Un débat sur de nouveaux jours fériés est relancé.',
        de: 'Eine Debatte über zusätzliche Feiertage gewinnt an Fahrt.',
        en: 'A renewed debate considers adding more public holidays.',
      },
    },
    tags: [
      { lb: 'Aarbecht', fr: 'Travail', de: 'Arbeit', en: 'Work' },
      { lb: 'Feierdeeg', fr: 'Jours feries', de: 'Feiertage', en: 'Holidays' },
      { lb: 'Balance', fr: 'Equilibre', de: 'Balance', en: 'Balance' },
    ],
    results: {
      totalResponses: 760,
      perOption: {
        yes: 420,
        no: 230,
        unsure: 110,
      },
      breakdown: [
        { optionId: 'yes', percentage: 55.3, count: 420 },
        { optionId: 'no', percentage: 30.3, count: 230 },
        { optionId: 'unsure', percentage: 14.5, count: 110 },
      ],
      summary: {
        lb: '760 Stëmmen: méi wéi d’Hallschent fënnt zousätzlech Feierdeeg gutt.',
        fr: '760 votes : plus de la moitié est pour de nouveaux jours fériés.',
        de: '760 Stimmen: Mehr als die Hälfte befürwortet zusätzliche Feiertage.',
        en: '760 votes: more than half are in favor of extra public holidays.',
      },
    },
  },
  {
    id: 'demo-5',
    dateKey: '05-31-2024',
    order: 5,
    question: {
      lb: 'Soll den ëffentlechen Transport och nuets méi dacks fueren?',
      fr: 'Les transports publics devraient-ils circuler plus fréquemment la nuit ?',
      de: 'Soll der öffentliche Verkehr nachts häufiger fahren?',
      en: 'Should public transport run more frequently at night?',
    },
    options: sampleOptions,
    article: {
      summary: {
        lb: 'D’Stad studéiert méi Nuetslinnen fir Bus an Tram.',
        fr: 'La ville étudie davantage de lignes nocturnes pour bus et tram.',
        de: 'Die Stadt prüft zusätzliche Nachtlinien für Bus und Tram.',
        en: 'City officials study expanding night bus and tram services.',
      },
    },
    tags: [
      { lb: 'Transport', fr: 'Transport', de: 'Verkehr', en: 'Transport' },
      { lb: 'Nuetsliewen', fr: 'Vie nocturne', de: 'Nachtleben', en: 'Nightlife' },
      { lb: 'Service public', fr: 'Service public', de: 'Offentlicher Dienst', en: 'Public service' },
    ],
    results: {
      totalResponses: 890,
      perOption: {
        yes: 610,
        no: 160,
        unsure: 120,
      },
      breakdown: [
        { optionId: 'yes', percentage: 68.5, count: 610 },
        { optionId: 'no', percentage: 18.0, count: 160 },
        { optionId: 'unsure', percentage: 13.5, count: 120 },
      ],
      summary: {
        lb: '890 Participanten: déi meescht wëllen méi nuetlechen Transport.',
        fr: '890 participants : la plupart souhaitent plus de transports nocturnes.',
        de: '890 Teilnehmende: Mehrheit möchte häufigeren Nachtverkehr.',
        en: '890 participants: most would like more frequent night transport.',
      },
    },
  },
];

export const fallbackQuestion: QuestionDocument = fallbackQuestions[0];

export const fallbackHistory: QuestionDocument[] = [
  fallbackQuestion,
  {
    id: '05-30-2024',
    dateKey: '05-30-2024',
    question: {
      lb: 'Soll déi nei Tram bis op Esch verlängert ginn?',
      fr: "Le nouveau tram doit-il être prolongé jusqu'à Esch ?",
      de: 'Soll die neue Tram bis nach Esch verlängert werden?',
      en: 'Should the new tram be extended to Esch?',
    },
    options: sampleOptions,
    results: {
      totalResponses: 980,
      perOption: {
        yes: 610,
        no: 260,
        unsure: 110,
      },
      breakdown: [
        { optionId: 'yes', percentage: 62.2, count: 610 },
        { optionId: 'no', percentage: 26.5, count: 260 },
        { optionId: 'unsure', percentage: 11.2, count: 110 },
      ],
      summary: {
        lb: '980 Stemmen: "Jo" bleift vir mat 610 fir d Tram bis Esch.',
        fr: '980 votes : "Oui" mene avec 610 pour prolonger le tram jusqu a Esch.',
        de: '980 Stimmen: "Ja" fuehrt mit 610 fuer die Tram nach Esch.',
        en: '980 votes: "Yes" leads with 610 to extend the tram to Esch.',
      },
    },
  },
  {
    id: '05-29-2024',
    dateKey: '05-29-2024',
    question: {
      lb: 'Ass Dir zefridden mat de publique Parks zu Lëtzebuerg?',
      fr: 'Êtes-vous satisfaits des parcs publics au Luxembourg ?',
      de: 'Sind Sie zufrieden mit den öffentlichen Parks in Luxemburg?',
      en: 'Are you satisfied with the public parks in Luxembourg?',
    },
    options: sampleOptions,
    results: {
      totalResponses: 820,
      perOption: {
        yes: 540,
        no: 120,
        unsure: 160,
      },
      breakdown: [
        { optionId: 'yes', percentage: 65.8, count: 540 },
        { optionId: 'no', percentage: 14.6, count: 120 },
        { optionId: 'unsure', percentage: 19.5, count: 160 },
      ],
      summary: {
        lb: '820 Stemmen: "Jo" feiert mat 540 fir d Parken am Land.',
        fr: '820 votes : "Oui" est en tete avec 540 pour les parcs publics.',
        de: '820 Stimmen: "Ja" fuehrt mit 540 fuer die oeffentlichen Parks.',
        en: '820 votes: "Yes" leads with 540 on public parks.',
      },
    },
  },
];
