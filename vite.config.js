import react from '@vitejs/plugin-react';
import dotenv from 'dotenv';
import { existsSync, readFileSync } from 'node:fs';

// Values come only from the dotenv files (.env, then .env.local which wins).
// Shell / process environment variables are deliberately ignored.
function readDotenv() {
  const values = {};
  for (const file of ['.env', '.env.local']) {
    if (existsSync(file)) Object.assign(values, dotenv.parse(readFileSync(file)));
  }
  return values;
}

export default () => {
  const env = readDotenv();

  return {
    // Relative asset URLs: the site works from any path (a GitHub Pages project
    // site, a custom domain, a sub-folder) without knowing where it is hosted.
    base: './',
    plugins: [react()],
    define: {
      // Injected as bare globals; declared in src/globals.d.ts.
      GOOGLE_CLIENT_ID: JSON.stringify(env.GOOGLE_CLIENT_ID || ''),
      GOOGLE_DEVICE_CLIENT_ID: JSON.stringify(env.GOOGLE_DEVICE_CLIENT_ID || ''),
      GOOGLE_DEVICE_CLIENT_SECRET: JSON.stringify(env.GOOGLE_DEVICE_CLIENT_SECRET || ''),
    },
  };
};
