/** Entry point of the bundled CLI (public/vibecomics.mjs): wires the real process into runCli. */
import { getGoogleDeviceClientId, getGoogleDeviceClientSecret } from '../config';
import { runCli } from './main';

const major = Number(process.versions.node.split('.')[0]);
if (major < 20) {
  process.stderr.write(
    `error: vibecomics needs Node.js 20 or newer (this is ${process.version}).\n`
  );
  process.exit(1);
}

const clientId = getGoogleDeviceClientId();
const clientSecret = getGoogleDeviceClientSecret();

process.exitCode = await runCli(process.argv.slice(2), {
  env: process.env,
  cwd: process.cwd(),
  stdout: (text) => void process.stdout.write(text),
  stderr: (text) => void process.stderr.write(text),
  deviceClient: clientId && clientSecret ? { clientId, clientSecret } : null,
});
