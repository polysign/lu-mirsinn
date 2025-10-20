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

export const fallbackQuestion: QuestionDocument = {
  id: 'demo',
  dateKey: '05-31-2024',
  question: {
    lb: 'Soll Lëtzebuerg méi an erneierbar Energien investéieren?',
    fr: "Le Luxembourg devrait-il investir davantage dans les énergies renouvelables ?",
    de: 'Soll Luxemburg stärker in erneuerbare Energien investieren?',
    en: 'Should Luxembourg invest more in renewable energy?',
  },
  options: sampleOptions,
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
    summary:
      'Déi meescht Leit sinn der Meenung, datt mir méi an erneierbar Energien investéiere solle fir déi nächst Generatiounen ze schützen.',
  },
};

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
      summary: "Vill Bewunner gesinn eng Verlängerung als wichteg fir d'Mobilitéit.",
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
      summary: 'Déi meescht Leit si frou mat de Parks, awer et gëtt Plaz fir Verbesserungen.',
    },
  },
];
