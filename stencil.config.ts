import { Config } from '@stencil/core';

// https://stenciljs.com/docs/config

export const config: Config = {
  globalStyle: 'src/global/app.css',
  globalScript: 'src/global/app.ts',
  taskQueue: 'async',
  outputTargets: [
    {
      type: 'www',
      serviceWorker: {
        swSrc: 'src/sw.js',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
      },
      baseUrl: 'https://mir-sinn.lu/',
      copy: [
        { src: 'firebase-messaging-sw.js', dest: 'firebase-messaging-sw.js' },
      ],
    },
  ],
};
