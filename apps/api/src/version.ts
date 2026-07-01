// App-Version wird beim Build/Deploy via APP_VERSION gesetzt (Semantic-Release / Docker-ARG).
export const APP_VERSION = process.env.APP_VERSION ?? '1.16.1';
export const RELEASE_REPO = 'Toupsy/turmstatus-app';
