import RAPIER from '@dimforge/rapier3d-compat';

export interface PhysicsWorldContext {
  world: RAPIER.World;
  eventQueue: RAPIER.EventQueue;
  step: (delta: number) => void;
}

let physicsInitialized = false;

export async function initPhysics(): Promise<PhysicsWorldContext> {
  if (!physicsInitialized) {
    await RAPIER.init();
    physicsInitialized = true;
  }

  const gravity = { x: 0.0, y: -9.81, z: 0.0 };
  const world = new RAPIER.World(gravity);
  const eventQueue = new RAPIER.EventQueue(true);

  const step = (delta: number) => {
    // Fixed timestep or clamped delta for physics stability
    const dt = Math.min(delta, 0.033);
    world.timestep = dt;
    world.step(eventQueue);
  };

  return { world, eventQueue, step };
}
