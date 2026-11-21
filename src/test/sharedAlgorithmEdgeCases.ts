import { describe, expect, it } from 'vitest';
import { toggleFireAlarmState } from '../engine/elevatorSim';
import type { DispatchAlgorithm } from '../types/simulation';
import {
  accountedPassengers,
  addWaitingPassenger,
  advanceSeconds,
  advanceUntil,
  countOnboard,
  countWaiting,
  createQuietSimulation,
  expectPhysicalInvariants,
  makeAlgoConfig,
} from './simHarness';

/**
 * Edge cases every dispatch algorithm must survive. Each per-algorithm test file calls this
 * once, so a failure points at the algorithm that broke instead of a shared mega-suite.
 */
export function describeSharedEdgeCases(algo: DispatchAlgorithm) {
  describe(`shared edge cases (${algo})`, () => {
    describe('single-shaft building', () => {
      it('serves mixed up and down calls from every floor with one car', () => {
        const cfg = makeAlgoConfig(algo, { floors: 10, cars: 1, carCapacity: 6 });
        const sim = createQuietSimulation(cfg, 11);
        const world = sim.left;

        const trips: Array<[number, number]> = [
          [1, 7],
          [1, 10],
          [4, 9],
          [9, 2],
          [6, 1],
          [10, 1],
          [3, 8],
          [8, 5],
          [1, 4],
          [2, 1],
        ];
        trips.forEach(([o, d], i) =>
          addWaitingPassenger(sim, cfg, world, o, d, { spawnTime: i * 0.1 })
        );

        for (const p of world.waitingQueues.flat()) {
          if (p.assignedCarId !== null) expect(p.assignedCarId).toBe(0);
        }

        const drainedAt = advanceUntil(
          sim,
          cfg,
          () => countWaiting(world) === 0 && countOnboard(world) === 0,
          400,
          () => expectPhysicalInvariants(world, cfg)
        );

        expect(drainedAt).not.toBeNull();
        expect(world.completed.count).toBe(trips.length);
      });

      it('works in the smallest allowed building (4 floors, 1 car, capacity 4)', () => {
        const cfg = makeAlgoConfig(algo, {
          floors: 4,
          cars: 1,
          carCapacity: 4,
          arrivalRate: 30,
        });
        const sim = createQuietSimulation(cfg, 4);
        sim.nextSpawnTime = 0.2;

        advanceSeconds(sim, cfg, 180, () => expectPhysicalInvariants(sim.left, cfg));
        expect(sim.left.completed.count).toBeGreaterThan(20);
      });
    });

    describe('full cars', () => {
      it('never boards past capacity and makes repeat lobby trips for an oversized crowd', () => {
        const cfg = makeAlgoConfig(algo, { floors: 10, cars: 1, carCapacity: 4 });
        const sim = createQuietSimulation(cfg, 21);
        const world = sim.left;

        const crowd = 13;
        for (let i = 0; i < crowd; i++) {
          addWaitingPassenger(sim, cfg, world, 1, 2 + (i % 9), { spawnTime: i * 0.05 });
        }

        let peakLoad = 0;
        const drainedAt = advanceUntil(
          sim,
          cfg,
          () => countWaiting(world) === 0 && countOnboard(world) === 0,
          600,
          () => {
            expectPhysicalInvariants(world, cfg);
            peakLoad = Math.max(peakLoad, world.cars[0].passengers.length);
          }
        );

        expect(drainedAt).not.toBeNull();
        expect(world.completed.count).toBe(crowd);
        expect(peakLoad).toBe(cfg.carCapacity);
        expect(world.lobbyDepartTimes.length).toBeGreaterThanOrEqual(Math.ceil(crowd / 4));
      });

      it('does not stop to pick up a same-direction hall call while full', () => {
        const cfg = makeAlgoConfig(algo, { floors: 12, cars: 1, carCapacity: 4 });
        const sim = createQuietSimulation(cfg, 31);
        const world = sim.left;
        const car = world.cars[0];

        for (let i = 0; i < 4; i++) {
          addWaitingPassenger(sim, cfg, world, 1, 10, { spawnTime: i * 0.05 });
        }

        const departed = advanceUntil(
          sim,
          cfg,
          () => car.state === 'MOVING' && car.floor > 1.2 && car.passengers.length === 4,
          30
        );
        expect(departed).not.toBeNull();

        const hallCall = addWaitingPassenger(sim, cfg, world, 5, 11);

        let stoppedAtFiveWhileFull = false;
        const firstDropAt = advanceUntil(
          sim,
          cfg,
          () => world.completed.count >= 4,
          60,
          () => {
            if (
              car.state === 'DWELLING' &&
              Math.round(car.floor) === 5 &&
              car.passengers.length >= 4
            ) {
              stoppedAtFiveWhileFull = true;
            }
          }
        );

        expect(firstDropAt).not.toBeNull();
        expect(stoppedAtFiveWhileFull).toBe(false);
        expect(world.waitingQueues[5]).toContain(hallCall);

        advanceUntil(sim, cfg, () => world.completed.count === 5, 120);
        expect(world.completed.count).toBe(5);
      });
    });

    describe('fire recall', () => {
      it.each([1, 3])(
        'recalls a loaded car mid-trip straight to the lobby and recovers afterwards (%i car(s))',
        (cars) => {
          const cfg = makeAlgoConfig(algo, { floors: 12, cars, carCapacity: 6 });
          const sim = createQuietSimulation(cfg, 41 + cars);
          const world = sim.left;

          for (let i = 0; i < 6; i++) {
            addWaitingPassenger(sim, cfg, world, 1, 9 + (i % 4), { spawnTime: i * 0.05 });
          }
          addWaitingPassenger(sim, cfg, world, 11, 2, { spawnTime: 0.5 });
          addWaitingPassenger(sim, cfg, world, 7, 3, { spawnTime: 0.6 });
          const total = accountedPassengers(world);
          expect(total).toBe(8);

          const midTrip = advanceUntil(
            sim,
            cfg,
            () =>
              world.cars.some(
                (c) =>
                  c.state === 'MOVING' &&
                  c.direction === 1 &&
                  c.floor > 4 &&
                  c.passengers.length > 0
              ),
            60
          );
          expect(midTrip).not.toBeNull();

          const loadedCar = world.cars.find(
            (c) => c.state === 'MOVING' && c.direction === 1 && c.passengers.length > 0
          )!;
          const ridersAtAlarm = loadedCar.passengers.length;
          const completedAtAlarm = world.completed.count;

          toggleFireAlarmState(sim, cfg);
          expect(loadedCar.state).toBe('FIRE_RECALL');
          expect(loadedCar.direction).toBe(-1);
          expect(loadedCar.targetFloors).toEqual([1]);

          let lastFloor = loadedCar.floor;
          const lockedAt = advanceUntil(
            sim,
            cfg,
            () => world.cars.every((c) => c.state === 'FIRE_LOCKED'),
            30,
            () => {
              expect(loadedCar.floor).toBeLessThanOrEqual(lastFloor + 1e-9);
              lastFloor = loadedCar.floor;
              expect(accountedPassengers(world)).toBe(total);
            }
          );

          expect(lockedAt).not.toBeNull();
          for (const c of world.cars) {
            expect(c.floor).toBe(1);
            expect(c.passengers).toHaveLength(0);
          }
          expect(world.evacuatedCount).toBeGreaterThanOrEqual(ridersAtAlarm);
          expect(world.completed.count).toBe(completedAtAlarm);

          advanceSeconds(sim, cfg, 5);
          expect(world.cars.every((c) => c.state === 'FIRE_LOCKED')).toBe(true);
          expect(world.completed.count).toBe(completedAtAlarm);

          // A rider who arrives after the stair evacuation must still be served once the alarm clears.
          const lateRider = addWaitingPassenger(sim, cfg, world, 6, 1);
          toggleFireAlarmState(sim, cfg);
          sim.nextSpawnTime = Number.POSITIVE_INFINITY; // clearing the alarm restarts random arrivals
          for (const c of world.cars) expect(c.state).toBe('IDLE');

          const drained = advanceUntil(
            sim,
            cfg,
            () => countWaiting(world) === 0 && countOnboard(world) === 0,
            200,
            () => expectPhysicalInvariants(world, cfg)
          );
          expect(drained).not.toBeNull();
          expect(accountedPassengers(world)).toBe(total + 1);
          expect(world.waitingQueues[6]).not.toContain(lateRider);
        }
      );

      it('cancels an open-door dwell at an upper floor and heads down', () => {
        const cfg = makeAlgoConfig(algo, { floors: 12, cars: 2, carCapacity: 6 });
        const sim = createQuietSimulation(cfg, 51);
        const world = sim.left;
        addWaitingPassenger(sim, cfg, world, 1, 8);
        addWaitingPassenger(sim, cfg, world, 1, 11);

        const dwelling = advanceUntil(
          sim,
          cfg,
          () => world.cars.some((c) => c.state === 'DWELLING' && c.floor > 2),
          60
        );
        expect(dwelling).not.toBeNull();
        const car = world.cars.find((c) => c.state === 'DWELLING' && c.floor > 2)!;

        toggleFireAlarmState(sim, cfg);
        expect(car.state).toBe('FIRE_RECALL');
        expect(car.dwellTimer).toBe(0);
        expect(car.departing).toBe(false);

        advanceUntil(sim, cfg, () => car.state === 'FIRE_LOCKED', 30);
        expect(car.state).toBe('FIRE_LOCKED');
        expect(car.floor).toBe(1);
      });

      it('locks a car already at the lobby immediately and evacuates its riders', () => {
        const cfg = makeAlgoConfig(algo, { floors: 10, cars: 1, carCapacity: 6 });
        const sim = createQuietSimulation(cfg, 61);
        const world = sim.left;
        addWaitingPassenger(sim, cfg, world, 1, 6);
        addWaitingPassenger(sim, cfg, world, 1, 7);

        const boarded = advanceUntil(
          sim,
          cfg,
          () => world.cars[0].passengers.length === 2 && world.cars[0].floor <= 1.05,
          10
        );
        expect(boarded).not.toBeNull();

        toggleFireAlarmState(sim, cfg);
        const car = world.cars[0];
        expect(car.state).toBe('FIRE_LOCKED');
        expect(car.passengers).toHaveLength(0);
        expect(world.evacuatedCount).toBe(2);
      });
    });
  });
}
