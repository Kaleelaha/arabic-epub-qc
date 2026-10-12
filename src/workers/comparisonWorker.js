import { compareBook } from '../services/textComparator.js';
// Runs the heavy diff off the main thread so the UI stays responsive.
self.onmessage = (e) => {
  try {
    const result = compareBook(e.data, (value, label) => self.postMessage({ type: 'progress', value, label }));
    self.postMessage({ type: 'done', result });
  } catch (err) { self.postMessage({ type: 'error', message: err.message }); }
};
