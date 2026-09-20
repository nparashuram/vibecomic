import react from '@vitejs/plugin-react';
import { googleDefines } from './scripts/read-env.mjs';

export default () => {
  return {
    // Relative asset URLs: the site works from any path (a GitHub Pages project
    // site, a custom domain, a sub-folder) without knowing where it is hosted.
    base: './',
    // Fixed, because the Google OAuth client lists http://localhost:8080 as an authorized origin.
    server: { port: 8080, strictPort: true },
    plugins: [react()],
    // Injected as bare globals from the dotenv files; declared in src/globals.d.ts.
    define: googleDefines(),
  };
};
