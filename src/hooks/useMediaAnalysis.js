import { useSyncExternalStore } from 'react';
import { getAnalysis, subscribeAnalysis } from '../lib/media-analysis.js';

export default function useMediaAnalysis(key) {
  return useSyncExternalStore(subscribeAnalysis, () => (key ? getAnalysis(key) : null));
}
