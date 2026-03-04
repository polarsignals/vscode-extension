import {ProfilingAnnotations} from './profiling-annotations';

let instance: ProfilingAnnotations | undefined;

export function getAnnotations(): ProfilingAnnotations {
  if (!instance) {
    instance = new ProfilingAnnotations();
  }
  return instance;
}

export function disposeAnnotations(): void {
  if (instance) {
    instance.dispose();
    instance = undefined;
  }
}
