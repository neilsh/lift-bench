import type {
  BuildingWorld,
  DispatchAlgorithm,
  Passenger,
  SimConfig,
  SimState,
} from '../../types/simulation';
import { assignPassengerDestinationDispatch, stepDestinationWorld } from './destination';
import { stepFcfsWorld } from './fcfs';
import { assignPassengerNearestCar, stepNearestWorld } from './nearest';
import { stepStandardWorld } from './scan';
import { assignPassengerSector, stepSectorWorld } from './sector';

export interface DispatchStrategy {
  readonly id: DispatchAlgorithm;
  assignPassenger: (sim: SimState, cfg: SimConfig, world: BuildingWorld, pax: Passenger) => void;
  stepWorld: (sim: SimState, cfg: SimConfig, world: BuildingWorld, dt: number) => void;
}

function noOpAssign(_sim: SimState, _cfg: SimConfig, _world: BuildingWorld, pax: Passenger): void {
  pax.assignedCarId = null;
}

export const DISPATCH_STRATEGIES: Record<DispatchAlgorithm, DispatchStrategy> = {
  standard: {
    id: 'standard',
    assignPassenger: noOpAssign,
    stepWorld: stepStandardWorld,
  },
  destination: {
    id: 'destination',
    assignPassenger: (sim, cfg, world, pax) =>
      assignPassengerDestinationDispatch(sim, cfg, world, pax, false),
    stepWorld: (sim, cfg, world, dt) => stepDestinationWorld(sim, cfg, world, dt, false),
  },
  eco: {
    id: 'eco',
    assignPassenger: (sim, cfg, world, pax) =>
      assignPassengerDestinationDispatch(sim, cfg, world, pax, true),
    stepWorld: (sim, cfg, world, dt) => stepDestinationWorld(sim, cfg, world, dt, true),
  },
  nearest: {
    id: 'nearest',
    assignPassenger: (_sim, cfg, world, pax) => assignPassengerNearestCar(cfg, world, pax),
    stepWorld: stepNearestWorld,
  },
  sector: {
    id: 'sector',
    assignPassenger: (_sim, _cfg, world, pax) => assignPassengerSector(world, pax),
    stepWorld: stepSectorWorld,
  },
  fcfs: {
    id: 'fcfs',
    assignPassenger: noOpAssign,
    stepWorld: stepFcfsWorld,
  },
};
