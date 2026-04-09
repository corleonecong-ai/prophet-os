import * as atlas from './atlas';
import * as prophet from './prophet';

type EngineMethod = (input: Record<string, unknown>) => Promise<unknown>;

interface Engine {
  [method: string]: EngineMethod;
}

const engines: Record<string, Engine> = {
  atlas: {
    lookup: (input) => atlas.lookup(input as unknown as Parameters<typeof atlas.lookup>[0]),
  },
  prophet: {
    predict: (input) => prophet.predict(input as unknown as Parameters<typeof prophet.predict>[0]),
  },
};

export function getEngine(name: string): Engine {
  const engine = engines[name];
  if (!engine) throw new Error(`Unknown engine: "${name}". Available: ${Object.keys(engines).join(', ')}`);
  return engine;
}

export { atlas, prophet };
