import { Config } from '@stencil/core';

// https://stenciljs.com/docs/config

export const config: Config = {
  globalStyle: 'src/global/app.css',
  globalScript: 'src/global/app.ts',
  taskQueue: 'async',
  outputTargets: [
    {
      type: 'www',
      empty: true,
      serviceWorker: {
        swSrc: 'src/sw.js',
        globPatterns: [
          'build/**/*.{js,css,json}',
          'index.html',
          'manifest.json',
          'assets/icon/**/*.{png,svg,ico}',
        ],
        globIgnores: ['assets/icons/**'],
      },
      baseUrl: 'https://mir-sinn.lu/',
      copy: [
        { src: 'firebase-messaging-sw.js', dest: 'messaging-sw.js' },
      ],
    },
  ],
};
