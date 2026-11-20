export type GlossaryKey =
  | 'advantageDelta'
  | 'trafficPresets'
  | 'cibseGrade'
  | 'cibseCompliance'
  | 'attd'
  | 'awt'
  | 'att'
  | 'awtAttTriad'
  | 'ttdSplit'
  | 'rtt'
  | 'hc5Pct'
  | 'hc5Pax'
  | 'interval'
  | 'saturation'
  | 'p95Wait'
  | 'p95TTD'
  | 'longWaitSla'
  | 'barney'
  | 'reversalFloor'
  | 'probableStops'
  | 'stopsAndLoad'
  | 'throughput'
  | 'queue'
  | 'shaftMileage'
  | 'energy'
  | 'histogram'
  | 'cdf'
  | 'percentiles'
  | 'waitHeatmap'
  | 'fireAlarm'
  | 'arrivalRate'
  | 'floors'
  | 'cars'
  | 'stopPenalty'
  | 'carCapacity';

export interface GlossaryEntry {
  title: string;
  symbol?: string;
  summary: string;
  significance: string;
  benchmark?: string;
}

export const METRIC_GLOSSARY: Record<GlossaryKey, GlossaryEntry> = {
  advantageDelta: {
    title: 'Head-to-Head ATTD Delta',
    symbol: 'Δ ATTD',
    summary:
      'Percentage difference in Average Time to Destination (ATTD) between the Right Tower and Left Tower under identical passenger arrivals.',
    significance:
      'Negative percentages mean the Right algorithm delivers riders faster door-to-door. Both towers share the exact same seeded passenger stream for a fair controlled benchmark.',
    benchmark: 'Negative = Right leads · Positive = Left leads',
  },
  trafficPresets: {
    title: 'Traffic Scenario Profiles',
    summary:
      'Standardized building demand templates modeling how passenger origin-destination flows shift across a commercial workday.',
    significance:
      'Algorithms behave differently under each flow: Destination Control dominates Morning Up-Peak by batching common floors, while Lunch Two-Way and VIP Interfloor stress bidirectional routing.',
    benchmark: 'Up-Peak · Lunch 2-Way · Down-Peak · VIP Interfloor · Uniform',
  },
  cibseGrade: {
    title: 'CIBSE Guide D Service Grade',
    symbol: 'A–F',
    summary:
      'Composite passenger service band (A Excellent through F Overloaded) derived from Average Waiting Time (AWT), Average Time to Destination (ATTD), and queue saturation.',
    significance:
      'CIBSE Guide D is the international vertical-transportation standard used by building consultants to verify whether an elevator bank meets Class-A office tenant expectations.',
    benchmark: 'A: Wait ≤20s, TTD ≤45s · B: ≤25s / ≤60s · C: ≤30s / ≤75s',
  },
  cibseCompliance: {
    title: 'CIBSE 4-Point Compliance',
    summary:
      'Live pass/watch/fail check across four core CIBSE Guide D criteria: Wait Time (AWT), Transit Time (ATT), Lobby Dispatch Interval (INT), and 5-Minute Handling Capacity (%HC5).',
    significance:
      'A bank can have short average waits yet still fail peak handling capacity or suffer slow in-car rides; checking all four flags structural bottlenecks early.',
    benchmark: 'Pass: AWT ≤25s · ATT ≤60s · INT ≤30s · %HC5 meets target',
  },
  attd: {
    title: 'Average Time to Destination',
    symbol: 'ATTD',
    summary:
      'Total mean end-to-end journey time from pressing the hall call button to stepping off at the destination floor (ATTD = AWT + ATT).',
    significance:
      'ATTD is the single truest measure of passenger experience. Destination Control often trades a few seconds of extra lobby wait for far fewer intermediate stops, slashing total ATTD.',
    benchmark: 'CIBSE Office Target: ≤ 60s (Excellent ≤ 45s)',
  },
  awt: {
    title: 'Average Waiting Time',
    symbol: 'AWT',
    summary:
      'Mean time a passenger waits in the hall between registering a call and boarding an elevator car.',
    significance:
      'Human wait perception is nonlinear—hall waits feel roughly twice as long as in-car ride time. Once AWT exceeds 30 seconds, perceived building quality drops sharply.',
    benchmark: 'CIBSE Office Target: ≤ 25s (Grade A ≤ 20s · Poor > 30s)',
  },
  att: {
    title: 'Average Transit Time',
    symbol: 'ATT',
    summary:
      'Mean time spent inside the elevator cabin from boarding to arrival at the destination floor, combining travel time and intermediate stop dwell.',
    significance:
      'High ATT signals "milk-run" stops where a car halts at almost every floor. Grouping riders with similar destinations dramatically reduces ATT.',
    benchmark: 'CIBSE Office Target: ≤ 60s (Comfortable ≤ 45s)',
  },
  awtAttTriad: {
    title: 'AWT / ATT Service Triad',
    symbol: 'AWT / ATT',
    summary:
      'Side-by-side view of Mean Hall Wait (AWT) and Mean In-Car Transit (ATT), whose sum equals Average Time to Destination (ATTD).',
    significance:
      'Reveals how a scheduler budgets time: conventional SCAN minimizes initial wait at the expense of many stops, while Destination Dispatch holds riders briefly to run express trips.',
    benchmark: 'CIBSE Office Target: AWT ≤ 25s · ATT ≤ 60s',
  },
  ttdSplit: {
    title: 'TTD Time-Budget Breakdown',
    symbol: 'W · R · S',
    summary:
      'Visualizes how each rider’s total journey splits across Queue Wait (amber), Active Shaft Ride (sky), and Intermediate Stop Penalty overhead (rose).',
    significance:
      'Stop overhead (door cycles plus braking and acceleration) is the hidden throughput killer in tall buildings. Shrinking the rose segment directly boosts bank capacity.',
    benchmark: 'Amber = Wait · Sky = Ride · Rose = Stop Overhead',
  },
  rtt: {
    title: 'Round-Trip Time',
    symbol: 'RTT',
    summary:
      'Average elapsed time for a single elevator car to leave the main lobby, serve its upper-floor stops, reverse at its highest call, and return to the lobby ready to board again.',
    significance:
      'RTT is the fundamental governing variable of elevator physics: both Dispatch Interval (RTT ÷ cars) and 5-Minute Handling Capacity are inversely proportional to RTT.',
    benchmark: 'Barney Eq: RTT = 2·H·tv + (S+1)·ts + 2·P·tp',
  },
  hc5Pct: {
    title: '5-Minute Handling Capacity',
    symbol: '%HC5',
    summary:
      'Percentage of the building’s nominal upper-floor population delivered during a rolling 5-minute (300-second) window.',
    significance:
      'The primary sizing metric in commercial real estate. If %HC5 falls below incoming arrival demand during morning rush, lobby queues grow without bound.',
    benchmark: 'CIBSE Commercial Office Target: 12%–15% of population / 5 min',
  },
  hc5Pax: {
    title: '5-Minute Delivered Volume',
    symbol: 'HC5',
    summary:
      'Absolute number of passengers delivered per 5-minute window, extrapolated from the live rolling 300-second completion log.',
    significance:
      'Compare directly against incoming 5-minute demand (Arrival Rate × 5). When HC5 trails demand, the building enters queue saturation.',
    benchmark: 'Target: HC5 ≥ 5-min Arrival Demand',
  },
  interval: {
    title: 'Lobby Dispatch Interval',
    symbol: 'INT',
    summary:
      'Average headway in seconds between consecutive loaded elevator departures from the main lobby (theoretically RTT divided by number of cars).',
    significance:
      'Governs lobby cadence and passenger frustration. Under balanced up-peak traffic, typical hall wait time is roughly 55%–85% of the dispatch interval.',
    benchmark: 'CIBSE Office Target: ≤ 30s (Prestige ≤ 25s)',
  },
  saturation: {
    title: 'Demand Saturation Ratio',
    symbol: 'ρ',
    summary:
      'Ratio of incoming passenger demand to observed 5-minute handling capacity (ρ = Demand ÷ HC5). When ρ exceeds 1.0 or queues grow unchecked, the SAT warning activates.',
    significance:
      'In queuing theory, ρ ≥ 1.0 is an unstable regime where wait times diverge linearly over time until traffic subsides or higher-capacity batching (like Destination Dispatch) is engaged.',
    benchmark: 'Stable: ρ < 0.85 · Critical: ρ ≥ 1.00 (Saturated)',
  },
  p95Wait: {
    title: 'Tail Queue Wait (P95 / Max)',
    symbol: 'P95 Wait',
    summary:
      'The 95th-percentile hall wait time (only 5% of passengers wait longer) alongside the live wait time of the single oldest rider currently in queue.',
    significance:
      'Averages can hide unfair starvation—such as a lone rider on a low-traffic floor ignored repeatedly by greedy schedulers. P95 and Max expose fairness failures.',
    benchmark: 'Recommended Tail Wait: P95 ≤ 45s',
  },
  p95TTD: {
    title: 'Median & P95 Journey Time',
    symbol: 'P50 / P95',
    summary:
      'The 50th-percentile (typical rider) and 95th-percentile (worst-case tail) total Time to Destination.',
    significance:
      'A tight gap between P50 and P95 means predictable, reliable elevator service; a wide spread indicates severe variability and erratic trip durations.',
    benchmark: 'Target: P95 TTD ≤ 90s',
  },
  longWaitSla: {
    title: 'Long-Wait SLA Breaches',
    symbol: '>30s / >60s',
    summary:
      'Share of delivered passengers who waited longer than 30 seconds (elevated discomfort) or 60 seconds (severe SLA breach) before boarding.',
    significance:
      'Tenants remember their worst waits, not the daily average. Modern building SLAs cap >60s waits near zero to prevent lobby crowding and complaints.',
    benchmark: 'CIBSE Practice: >30s under 15% · >60s under 2%',
  },
  barney: {
    title: 'Barney Analytical Up-Peak Benchmark',
    summary:
      'Closed-form probabilistic reference model (Dr. Gina Barney / CIBSE Guide D) estimating ideal up-peak RTT, Interval, %HC5, reversal floor H, and stops S from building geometry.',
    significance:
      'Provides a physics-based yardstick independent of dispatch heuristics. Algorithms like Destination Control can beat classical Barney RTT by partitioning floors to cut probable stops S.',
    benchmark: 'Assumes 80% rated car fill · 100 nominal occupants per upper floor',
  },
  reversalFloor: {
    title: 'Highest Reversal Floor',
    symbol: 'H',
    summary:
      'Mean highest floor a car reaches during a round-trip cycle before reversing direction back toward the lobby.',
    significance:
      'Lower average H shortens round-trip travel distance (2·H·tv). Sectoring and Destination Dispatch deliberately assign lower floors to some cars so they turn around early.',
    benchmark: 'Lower H shortens RTT and frees cars faster',
  },
  probableStops: {
    title: 'Probable Stops per Cycle',
    symbol: 'S',
    summary: 'Mean number of distinct upper-floor stops made by a car during a single round trip.',
    significance:
      'Every extra stop adds door open/close and braking overhead (ts). Reducing S is the primary mechanism by which Destination Control increases up-peak capacity by 20%–35%.',
    benchmark: 'Barney S = N·(1 − ((N−1)/N)^P) for N upper floors',
  },
  stopsAndLoad: {
    title: 'Stops / Trip & Car Load Factor',
    symbol: 'Stp · %CF',
    summary:
      'Average stops per car trip paired with Car Load Factor (%CF)—the mean percentage of rated cabin capacity occupied on departure.',
    significance:
      'CIBSE designs target ≤ 80% load factor because real passengers hesitate to squeeze into physically full cabins, and over-packed cars cause slower door-transfer times.',
    benchmark: 'CIBSE Comfort Target: ≤ 80% rated car load',
  },
  throughput: {
    title: 'Rolling Delivery Throughput',
    symbol: 'Thru',
    summary:
      'Passengers successfully delivered to their destination floors per minute, averaged across the most recent 120 seconds.',
    significance:
      'Tracks real-time clearing speed. In steady state, throughput matches arrival rate; when capped below arrival rate, the bank has hit its physical capacity ceiling.',
    benchmark: 'Higher is better · Should match or exceed Arrival Rate',
  },
  queue: {
    title: 'Active Waiting Queue',
    symbol: 'Q',
    summary:
      'Total number of passengers currently waiting across all floors, plus the session high-water peak.',
    significance:
      'Acts as the immediate early-warning gauge for congestion. Persistent upward slope in the queue curve confirms the bank is saturated.',
    benchmark: 'Healthy bank clears bursts back toward single digits',
  },
  shaftMileage: {
    title: 'Shaft Mileage per Rider',
    symbol: 'fl/p',
    summary:
      'Total vertical floors traveled by all elevator cars divided by total passengers delivered.',
    significance:
      'Measures routing efficiency and mechanical wear on hoist ropes, sheaves, and guide rails. Empty deadhead trips inflate shaft mileage.',
    benchmark: 'Lower is better · Reflects mechanical wear & efficiency',
  },
  energy: {
    title: 'Estimated Energy per Rider',
    symbol: 'Wh/p',
    summary:
      'Estimated traction energy consumed per delivered passenger, combining per-floor hoist travel (1.8 Wh/fl) and high-draw motor starts (4.5 Wh/start).',
    significance:
      'Frequent start-stop cycles draw far more peak current than smooth express runs. Eco-Batch and Destination Dispatch cut energy per rider by consolidating stops.',
    benchmark: 'Lower is better · Model: 1.8 Wh/floor + 4.5 Wh/start',
  },
  histogram: {
    title: 'Wait & TTD Frequency Histogram',
    summary:
      'Distribution of the most recent 500 delivered passengers grouped into calibrated time buckets (5s for Wait, 10s for TTD) with CIBSE vertical cutoffs.',
    significance:
      'Reveals distribution shape that averages hide—such as bimodal queues or long right-hand tails where unlucky riders wait well past the 60s SLA line.',
    benchmark: 'Left-shifted, narrow clusters indicate fast, consistent service',
  },
  cdf: {
    title: 'Cumulative Distribution Function (CDF)',
    summary:
      'Shows the percentage of passengers served within X seconds or less. Read horizontally from P50 or P95 to find exact percentile performance.',
    significance:
      'The gold standard for comparing two dispatchers: a curve sitting higher and further left strictly dominates the other across every percentile.',
    benchmark: 'Higher & further left = faster across all percentiles',
  },
  percentiles: {
    title: 'Percentile Ladder (P25–P95)',
    summary:
      'Quantile checkpoints showing the time threshold under which 25%, 50% (median), 75%, 90%, and 95% of riders complete their wait or journey.',
    significance:
      'Engineers design for P90/P95 tail reliability as well as P50 median speed so edge-case floors are not neglected.',
    benchmark: 'P50 = typical rider · P95 = worst 1-in-20 experience',
  },
  waitHeatmap: {
    title: 'Floor Wait-Time Heatmap',
    summary:
      'Colors each floor’s queue zone from emerald (0s) through amber (20s) to crimson (45s+) based on the single longest-waiting passenger on that floor.',
    significance:
      'Instantly highlights floor starvation hotspots—showing where specific schedulers leave isolated upper or mid-zone riders waiting too long.',
    benchmark: 'Emerald 0s · Amber 20s (CIBSE Grade A edge) · Crimson 45s+',
  },
  fireAlarm: {
    title: 'Phase I Emergency Recall',
    summary:
      'Simulates ASME A17.1 / EN 81-73 Phase I Fire Service Recall: cancels all hall and car calls, sends every shaft nonstop to Floor 1, evacuates riders, and locks doors open.',
    significance:
      'In real high-rises, fire recall prevents elevators from opening onto smoke-filled floors and stages cars at the lobby for firefighter Phase II manual operation.',
    benchmark: 'Click Clear Alarm to return both banks to normal dispatch',
  },
  arrivalRate: {
    title: 'Passenger Arrival Rate',
    symbol: 'pax/m',
    summary:
      'Mean Poisson arrival rate of new passengers entering the building per minute across both twin towers simultaneously.',
    significance:
      'Directly scales 5-minute demand (%POP). Push arrival rate above a bank’s handling capacity to observe the exact tipping point where queues saturate.',
    benchmark: '5-min demand = Arrival Rate × 5 passengers',
  },
  floors: {
    title: 'Building Floors & Population',
    summary:
      'Total number of served floors (Lobby + upper floors). Changing floors recalculates nominal building population (100 occupants per upper floor) and Barney benchmarks.',
    significance:
      'Taller shafts increase travel time (2·H·tv) and potential stop count (S), amplifying the performance gap between naive and destination-aware algorithms.',
    benchmark: 'Nominal population U = (Floors − 1) × 100',
  },
  cars: {
    title: 'Elevator Group Size (Cars)',
    summary: 'Number of independent elevator shafts serving each twin tower bank.',
    significance:
      'Adding cars scales handling capacity linearly and shrinks Lobby Dispatch Interval (INT = RTT ÷ cars), making group size the primary hardware lever in lift design.',
    benchmark: 'Dispatch Interval = RTT ÷ Number of Cars',
  },
  stopPenalty: {
    title: 'Stop Penalty Time',
    symbol: 'ts',
    summary:
      'Fixed time overhead incurred each time a car decelerates, opens doors, dwells, closes doors, and re-accelerates (excluding per-passenger boarding transfer).',
    significance:
      'Slower doors or heavier braking dramatically raise RTT when a car makes many stops—making stop-minimizing dispatchers like Destination Control even more valuable.',
    benchmark: 'Modern high-speed doors ≈ 6–9s · Older hydraulic/slow ≈ 10–14s',
  },
  carCapacity: {
    title: 'Rated Car Capacity',
    symbol: 'pax',
    summary: 'Maximum number of passengers permitted inside a single elevator cabin at one time.',
    significance:
      'Larger cabins carry more riders per round trip, boosting peak HC5, though higher boarding counts slightly increase door transfer time and probable stops.',
    benchmark: 'Typical office cars: 12–21 pax (design fill ≈ 80%)',
  },
};
