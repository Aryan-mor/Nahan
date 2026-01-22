import { StegoFactory } from '../factory';
import { NH01Provider } from './nh01';
import { NH02Provider } from './nh02';
import { NH07Provider } from './nh07';

export { NH01Provider } from './nh01';
export { NH02Provider } from './nh02';
export { NH03Provider } from './nh03';
export { NH04Provider } from './nh04';
export { NH05Provider } from './nh05';
export { NH06Provider } from './nh06';
export { NH07Provider } from './nh07';

export function registerAllProviders(): void {
  const factory = StegoFactory.getInstance();

  factory.registerProvider(new NH01Provider());
  factory.registerProvider(new NH02Provider());
  factory.registerProvider(new NH07Provider());

  // Register placeholders for NH03-NH06
  // Placeholder providers disabled until implemented
  // factory.registerProvider(new NH03Provider());
  // factory.registerProvider(new NH04Provider());
  // factory.registerProvider(new NH05Provider());
  // factory.registerProvider(new NH06Provider());
}
