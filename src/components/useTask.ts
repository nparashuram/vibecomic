import { useState } from 'react';
import { errorMessage } from '../utils/errors';

/** Runs async work while tracking whether it is in progress and what went wrong. */
export function useTask() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return { busy, error, run };
}
