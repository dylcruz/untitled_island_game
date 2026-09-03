# Island Survival Simulation: MVP Project Plan

## 1. Product Summary

A lightweight browser game in which three procedurally generated survivors are stranded on a small, fixed 2D island. The survivors act autonomously while the player controls the passage of time, sets a camp-wide priority, and responds to strategic and narrative decisions. The group must remain alive for 14 in-game days until a known rescue effort arrives.

The intended experience is a short, replayable survival story with understandable simulation rules, meaningful tradeoffs, and a serious tone with occasional personality-driven humor.

The MVP deliberately uses one balanced island layout, one survivor count, and one rescue duration. Replay variation comes from survivors, traits, cosmetic details, event selection, choices, and outcomes rather than from procedural geography or a large setup matrix.

## 2. MVP Goals

The MVP must let a player:

1. Start or resume a seeded game with three distinct survivors.
2. Watch survivors move around a compact island and perform understandable tasks.
3. Observe time, resources, source availability, survivor conditions, shelter, and the rescue countdown.
4. Proactively influence autonomous behavior through a persistent camp-wide priority.
5. Make consequential event decisions based on the current simulation state.
6. See immediate and delayed consequences of policy and event decisions.
7. Reach rescue in approximately 15-25 minutes when playing primarily at normal speed, while allowing an early defeat to end sooner.
8. Start another run with meaningfully different survivors, events, and outcomes.

The MVP succeeds if players can describe a run as a short story about particular survivors and their decisions rather than only as a sequence of changing resource values.

## 3. Design Principles

- **Group policy and event decisions are the player's agency.** The player influences priorities but does not directly move survivors or assign individual jobs.
- **The simulation must be legible.** Important actions, policy effects, and state changes must have visible explanations.
- **Choices should involve tradeoffs.** Avoid options and camp priorities with an obviously correct answer in every situation.
- **Randomness creates variety, not arbitrary defeat.** Starting states must be survivable, and severe risks must be communicated.
- **Keep runs short.** Setup should be quick, decisions should be well paced, and time controls should limit waiting.
- **Build depth from interactions.** Prefer combining a few resources, traits, and event conditions over adding more systems.
- **Prove the story before expanding the simulation.** Procedural geography, variable group sizes, and additional conditions remain deferred until the fixed-scope game is demonstrably engaging.

## 4. Target Experience

- Platform: Modern desktop and mobile browsers
- Typical full rescue run length: 15-25 real-world minutes when played primarily at normal speed
- Game length: 14 in-game days
- Survivors: Exactly three
- Tone: Serious survival with moments of levity
- Presentation: Small top-down 2D island with an HTML interface around it
- Input: Mouse, touch, and keyboard-accessible interface controls
- Player count: Single player
- Server requirement: None for the MVP

Fast and very-fast speeds intentionally allow experienced players to shorten a run. The 15-25 minute target is a normal-speed pacing target, not a guaranteed duration at every speed setting.

## 5. Core Game Loop

1. The player reviews current pressures and may set the camp priority if it has not already been changed that day.
2. Survivors evaluate personal needs, source availability, shared supplies, shelter, and the current camp priority.
3. They autonomously travel to island locations, gather resources, repair shelter, rest, or recover.
4. Time advances through daylight and nighttime phases.
5. A context-sensitive event interrupts the simulation and pauses time.
6. The player chooses one of two or three responses.
7. The game applies immediate effects and records any delayed consequences.
8. The loop continues until rescue arrives or all survivors die.

A typical run should contain 8-10 event decisions, in addition to optional camp-priority changes. Regular events should normally be separated by at least 0.75 in-game days, and the player should not normally go more than two in-game days without an event decision. Explicit emergencies may bypass the minimum spacing, but event queues and cooldowns must prevent frustrating clusters.

Event selection and simulation outcomes depend on simulation time, not rendering rate or wall-clock time. Changing speed must not change the event sequence when the same player commands are issued at the same simulation steps.

## 6. Game Setup And Resume

The new-game screen includes:

- A randomized seed
- An optional way to enter, copy, or reuse a seed
- A clear statement that the run uses three survivors and lasts 14 in-game days
- A single action to begin

Survivor count and rescue duration are not configurable in the MVP. Formal difficulty settings are also deferred so the initial economy and event pacing can be balanced around one experience.

The game automatically stores one local resume point. When a compatible resumable state exists, including an unacknowledged victory or defeat, the opening screen offers Resume and New Game. Starting a new game replaces the previous automatic save after confirmation.

## 7. Simulation Rules

### 7.1 Time

- The simulation uses a fixed time step so behavior remains stable at every speed.
- A run lasts 14 in-game days.
- One day should initially target 60-75 seconds at normal speed, subject to playtesting.
- Supported controls are pause, normal speed, fast speed, and very fast speed.
- Initial speed values are `0x`, `1x`, `3x`, and `8x`, subject to playtesting.
- Event decisions pause the simulation automatically.
- The simulation pauses when the browser tab is hidden and does not catch up on return.
- Daylight is the normal work period.
- At night, survivors return to camp and sleep unless critical self-care or an explicit emergency overrides the schedule.

The expected normal-speed simulation time is 14-17.5 minutes before decision-reading time. Playtesting should tune day duration and event count together so a typical full rescue run remains within 15-25 minutes. An early defeat may produce a shorter run.

### 7.2 Shared Group State

The MVP tracks:

- Stored food
- Stored water
- Stored materials
- Shelter condition

Food, water, and materials are communal. The MVP does not model individual inventories.

Shelter improves nighttime recovery and reduces damage from applicable events. Shelter condition decays slowly over time and can also be damaged by events, creating an ongoing material cost rather than a one-time upgrade.

Signal condition is not part of the MVP. Rescue occurs on the promised date, so a signal resource that affected only the ending would not provide a sufficiently clear strategic benefit.

### 7.3 Resource Sources And Run Arc

Stored resources and island-source availability are separate values. Each gathering location exposes whether it is plentiful, low, depleted, or replenishing.

The fixed island uses these source rules:

- The fresh-water source replenishes at dawn up to a capped daily availability.
- The forage area replenishes at dawn up to a capped daily availability.
- The forest provides materials and replenishes slowly up to a cap.
- Wreckage contains a finite, higher-yield reserve of initial supplies and materials.
- Gathering tasks reserve expected source output so multiple survivors do not unknowingly claim the same remaining yield.

Exact capacities, yields, replenishment rates, consumption rates, and shelter decay are centralized balancing parameters. The qualitative source rules are part of the MVP design and must not be replaced by unlimited gathering nodes.

The run should have a simple progression:

- Days 1-4 emphasize stabilizing food, water, and shelter with help from finite wreckage supplies.
- Days 5-10 emphasize maintaining renewable supplies, managing fatigue, and handling interpersonal pressure.
- Days 11-14 emphasize accumulated consequences, depleted reserves, and the approach of rescue.

Event eligibility and weighting may use these derived run phases. The phases should create pacing and narrative shape without introducing a separate campaign system.

### 7.4 Survivor State

Each of the three survivors has:

- Name
- Visual appearance
- Two traits
- Health
- Hunger
- Thirst
- Energy
- Morale
- Current activity and destination
- Temporary injury state
- Alive or dead state

Needs change over time. Unmet hunger and thirst eventually damage health, exhaustion limits productivity, and low morale affects work and selected events. Group morale shown in summaries is derived from the living survivors rather than stored as a separate authoritative value.

Sickness is deferred. Injury provides enough temporary-condition behavior to validate recovery, productivity penalties, and event consequences without creating a second overlapping health system.

### 7.5 Camp Priority

The player can set one persistent camp-wide priority:

- Balanced
- Secure Water
- Find Food
- Build And Repair
- Recover

The priority biases task selection for the whole group. It does not assign jobs to specific survivors, guarantee that every survivor performs the favored task, override critical personal needs, or override nighttime sleep.

The initial priority is Balanced. At each dawn, the player receives one opportunity to change it during that numbered in-game day. A successful change consumes that day's opportunity; there is no rolling 24-hour cooldown. A change affects newly selected tasks and does not teleport survivors or cancel ordinary travel already in progress. The interface must show the active priority, its practical effect, and whether the current day's change remains available.

Each priority must have an opportunity cost. For example, Recover causes survivors to rest earlier but reduces gathering time, while Secure Water can leave food, materials, or shelter unattended.

### 7.6 Autonomous Behavior

Survivors use a deterministic priority-based state machine rather than a general-purpose artificial intelligence system.

Task selection follows these constraints and priorities:

1. Enforce the nighttime schedule unless critical self-care or an emergency applies.
2. Address immediately dangerous thirst, hunger, or health conditions.
3. Rest when critically exhausted.
4. Account for tasks and source output already reserved by other survivors.
5. Apply the camp-priority bias to viable group tasks.
6. Gather the shared resource with the greatest projected need.
7. Repair shelter when its condition warrants the material cost.
8. Perform a trait-influenced low-priority activity or rest.

Survivors are assigned tasks in a deterministic rotating order so the same survivor does not always receive first choice. Reservations are released when a task completes, becomes impossible, or is interrupted by critical self-care, an event outcome, or death.

Every activity must expose a short explanation, such as `Gathering water: supply is low and the camp is prioritizing water`. If a survivor cannot complete an intended task, the interface or activity log must explain why.

### 7.7 Movement

- Survivors move between a small number of fixed island locations.
- Movement uses a coarse navigation graph or simple waypoint routes.
- Sophisticated collision avoidance and physically realistic pathfinding are not MVP requirements.
- Travel time matters, but movement must not trap survivors or prevent urgent self-care.
- Changing camp priority does not cause survivors to reverse direction unless their current task becomes invalid or a critical need interrupts it.

## 8. Fixed Island

The MVP island uses one authored and validated gameplay layout containing:

- Camp
- Shore and wreckage
- Fresh-water source
- Food or forage area
- Forest or material source
- Dangerous interior location used by exploration events

The navigation graph, gameplay locations, and base travel distances are fixed. A seed may vary cosmetic decoration, small non-gameplay visual details, and initial wreckage quantities within narrow validated limits.

The authored layout must guarantee reachable required locations and enough baseline productive capacity for a plausible path to survival. Procedural island outlines, randomized location placement, and variable travel graphs are deferred until the core game has passed the proof-of-fun milestone.

## 9. Traits

Traits give survivors recognizable strengths and weaknesses through understandable numeric modifiers or event options.

Initial target: 6-8 traits, including examples such as:

- Forager: Collects food faster
- Resourceful: Uses fewer materials when gathering or repairing
- Optimist: Loses morale more slowly
- Hot-headed: Is more strongly affected by conflict events
- Fragile: Suffers larger penalties from injury
- Tireless: Loses energy more slowly while traveling and working
- Cautious: Receives safer options in selected events but gathers more slowly in dangerous areas
- Loner: Works effectively alone but can reduce morale in group situations

Each survivor receives two compatible traits. Trait combinations must not make a survivor useless, guarantee success, or remove all meaningful drawbacks. A detailed skill system is deferred.

## 10. Decision And Event System

### 10.1 Event Requirements

Events are data-driven and may define:

- Stable ID
- Category and run-phase weighting
- Eligibility conditions
- Weight or relative frequency
- Cooldown and whether repetition in one run is allowed
- Participants
- Display text
- Two or three choices
- Known costs and qualitative risk descriptions
- Immediate effects
- Delayed automatic effects or an interactive follow-up event ID
- Trait-specific options or modifiers

Events must be selected using current conditions. For example, an event about wasting water cannot occur when there is no stored water. Participant requirements must be checked against living, available survivors.

### 10.2 Event Categories

- Resource shortages and opportunities
- Exploration
- Interpersonal conflict
- Injury and emergencies
- Shelter tradeoffs
- Trait-specific situations
- Follow-ups to earlier choices

### 10.3 Event Pacing And Content Target

An event template is one interactive decision definition. The MVP contains 12-15 templates in total, including any interactive follow-up templates. A typical run should present 8-10 event decisions, leaving part of the pool unseen for replay variation.

An interactive follow-up uses its own template and counts toward both the 12-15-template content total and the 8-10 decisions presented during a run. A delayed automatic effect does not present a choice and counts toward neither total.

- Event templates do not repeat within one run unless explicitly marked repeatable.
- Regular events respect minimum spacing and per-template cooldowns.
- A fallback set of broadly eligible events prevents gaps longer than two in-game days under normal conditions.
- Emergencies may interrupt regular pacing but cannot silently trigger multiple unresolved decisions.
- Pending interactive follow-ups participate in event spacing and occupy a normal decision slot unless explicitly marked as an emergency.
- At least three root templates schedule a delayed automatic effect or unlock an interactive follow-up.
- The content pool includes at least two interactive follow-up templates.
- A typical completed run should reference at least one earlier player choice in a later event or ending.

### 10.4 Outcome Rules

- Outcomes may be deterministic or probabilistic.
- Probabilistic risk is described consistently as low, moderate, or high.
- The probability range associated with each label is defined centrally and remains consistent across events.
- Random setbacks can injure survivors or consume resources.
- Sudden death should follow an explicitly communicated high-risk choice or an already critical survivor state, not an unavoidable isolated roll.
- Immediate results are shown before the simulation resumes.
- Delayed consequences explicitly reference the choice that caused them.
- Delayed effects that become irrelevant after a participant's death are discarded with a history reason unless their definition explicitly supports replacement participants or a group-level consequence.
- All need changes, task completions, event effects, scheduled effects, health changes, and deaths due at or before the rescue instant resolve before the victory check.
- If those final due effects kill the last survivor, the run ends in defeat. Otherwise, at least one living survivor produces victory.
- Once victory or defeat is entered, later scheduled effects are discarded and simulation time cannot advance.

## 11. Winning, Losing, And Endings

### Victory

After all simulation transitions and scheduled effects due at the rescue instant have resolved, at least one survivor remains alive at the end of day 14.

### Defeat

All survivors die before the rescue instant or while resolving effects due at that instant.

### Ending Quality

The ending considers:

- Number of survivors rescued
- Survivor health
- Survivor morale
- Shelter condition
- Notable decisions, injuries, and deaths

Example outcomes include triumphant rescue, costly rescue, barely alive, and lost expedition. Ending quality is presented as a summary of the run, while keeping the binary victory condition clear.

The end screen shows:

- Final result
- Each survivor's fate
- Number of days survived
- A short summary of major decisions and turning points
- Island seed
- Restart with the same seed and New Game actions

## 12. Interface Requirements

### Setup And Resume View

- New randomized seed and optional seed entry
- Clear fixed rules: three survivors and 14 days
- Resume action when a compatible automatic save exists, including an unacknowledged ending
- Confirmation before replacing a resumable run

### Main Simulation View

- Visible island and all three survivors
- Current day, time of day, and derived run phase
- Days remaining until rescue
- Stored food, water, and materials
- Source availability when relevant to current tasks or shortages
- Shelter condition
- Active camp priority, its effect, and change availability
- Survivor portraits and conditions
- Current survivor activities, destinations, and reasons
- Recent event and activity log
- Pause and speed controls
- Automatic-save status presented unobtrusively

### Decision View

- Event title and description
- Survivors involved
- Two or three clearly selectable choices
- Known costs and consistently labeled qualitative risks
- A result state before simulation resumes

### Usability

- The layout must work on desktop and mobile viewport sizes down to 360 CSS pixels.
- Controls must be usable with touch and keyboard.
- Text and status indicators must not rely on color alone.
- A short first-run introduction explains the objective, shared resources, autonomous behavior, camp priority, event decisions, automatic resume, and time controls.
- Critical changes such as injury, death, depleted water, damaged shelter, and approaching rescue require prominent feedback.
- Canvas content has an adjacent textual summary so critical information is not available only visually.

## 13. Audio And Visual Scope

The visual goal is clarity and character rather than detailed animation.

Required:

- Three distinct survivor appearances
- Seeded cosmetic island variation that does not alter navigation
- Readable location and activity indicators
- Day/night lighting change
- Basic movement and task animations or poses
- Clear feedback for important events and policy changes

Optional if schedule permits:

- Ambient island audio
- Minimal interface and event sounds
- Additional decorative animation

Volume controls are required if audio is included. A full soundtrack and extensive animation set are deferred.

## 14. Technical Direction And Decision Gate

The implementation remains entirely browser-based and lightweight. The accompanying technical plan recommends:

- TypeScript in strict mode
- Vite
- React for the HTML interface
- Native Canvas 2D for island rendering
- Plain CSS with CSS Modules
- Typed TypeScript definitions for traits and events
- Vitest for deterministic simulation tests
- Playwright for high-value browser flows
- A versioned local-storage automatic save
- No backend, accounts, database, or network dependency

Before feature development, a short technical spike must confirm:

- Smooth rendering with three moving survivors on representative mobile and desktop hardware
- Reliable responsive layout, pointer input, and touch input
- Fixed-step simulation behavior at all speed settings
- A maintainable boundary between simulation state and rendering
- Node-based simulation tests without browser globals
- Reliable pause behavior across tab visibility changes

Adopt a rendering library only if the spike demonstrates a concrete native Canvas problem.

## 15. Development Milestones

### Milestone 0: Technical Foundation

Deliverables:

- Establish development, production build, formatting, linting, and test commands
- Define serializable simulation state and fixed-step update boundaries
- Implement independent deterministic random streams
- Render the fixed placeholder island and a moving survivor
- Verify desktop and mobile browser behavior

Exit criteria:

- A production build loads without a server-side application.
- One survivor moves consistently at normal and accelerated speeds.
- Simulation logic runs in Node without rendering or DOM mocks.
- Hiding and restoring the tab does not advance hidden simulation time.

### Milestone 1: Technical End-To-End Slice

Use the fixed island, one survivor, a shortened test rescue clock, and three placeholder events. This milestone validates plumbing rather than the complete product promise.

Deliverables:

- Day/night cycle and time controls
- Stored food, water, materials, hunger, thirst, energy, and health
- Source availability, gathering, consumption, and replenishment
- Basic task selection, reservation, and movement
- One complete event flow: trigger, choice, result, and resume
- One delayed consequence
- Rescue victory and survivor-death defeat
- Minimal status interface and activity log

Exit criteria:

- A complete shortened run can be played from setup to an ending.
- The player can understand what the survivor is doing and why.
- Equivalent commands at equivalent simulation steps produce the same result at every speed.
- Resource sources cannot be over-claimed by simultaneous tasks.

### Milestone 2: Three-Survivor Proof Of Fun

Build the representative game before adding final content or polish.

Deliverables:

- Exactly three generated survivors with visual variation
- Six initial traits and two traits per survivor
- Individual morale and injury
- Shelter condition and repair
- All five camp priorities and the once-per-day change rule
- Group-aware task selection with deterministic rotating assignment order
- Full 14-day rescue structure and three run phases
- Eight representative events across resource, exploration, conflict, injury, shelter, and follow-up categories
- Basic ending summary with survivor-specific turning points
- Instrumentation for event count, decision gaps, task reasons, and run duration

Exit criteria:

- A full 14-day run is playable with no developer intervention.
- No survivor becomes permanently stuck in movement or task selection.
- Policy effects and critical overrides are visible and understandable.
- At least one prior decision is referenced later in a typical run.
- In a blind-playtest round of at least five people, at least four can explain how camp priority affected the group and identify one consequential choice.
- In the same round, at least four can recall a survivor-specific turning point after finishing.

If these criteria fail, revise the core loop, agency, pacing, or presentation before proceeding to final content and cosmetic work.

### Milestone 3: Event Content And Presentation

Deliverables:

- Data-driven eligibility, weighting, cooldown, and phase logic
- Immediate and delayed outcomes
- Trait-specific choices
- A total of 12-15 event templates
- At least three root templates that schedule a delayed automatic effect or unlock a follow-up
- At least two interactive follow-up templates within the 12-15-template total
- Six to eight total traits
- Final fixed-island art and seeded cosmetic variation
- Event result presentation and meaningful history
- Complete survivor portrait and status interface

Exit criteria:

- Events do not contradict current resources, participants, or run phase.
- A typical run presents 8-10 event decisions.
- Regular event gaps do not exceed two in-game days.
- Non-repeatable templates do not repeat within a run.
- Risk labels are consistent and risky choices communicate potential severity.

### Milestone 4: Complete Browser Experience

Deliverables:

- First-run introduction
- Responsive desktop and mobile layouts
- Essential movement, task, policy, and event feedback
- Ending quality calculation and run summary
- Same-seed restart and new-game flow
- Schema-versioned and rules-versioned automatic local save and resume
- Tab visibility pausing and interruption handling
- Basic accessibility pass

Exit criteria:

- A new player can finish a run without developer guidance.
- No required control depends only on hover or color.
- The entire game can be operated by keyboard and on a touch device.
- Reloading at supported save checkpoints, including an unacknowledged terminal state, can resume the run without changing deterministic state.
- Invalid or incompatible saves fail safely and allow a new game.

### Milestone 5: Balance And Release Candidate

Deliverables:

- Automated simulation runs using documented player policies
- Manual playtests across representative seeds and camp-priority strategies
- Resource capacity, rate, event frequency, and severity tuning
- Performance profiling on representative desktop and mobile browsers
- Bug fixing and release-build verification

The release balance batch uses a checked-in deterministic manifest of 10,000 seeds. The same manifest is run under each named simulation policy and retained across tuning changes so results remain comparable.

Provisional automated balance targets for the conservative baseline policy are:

- At least one survivor is rescued in 70-90 percent of manifest runs.
- All three survivors are rescued in 30-60 percent of manifest runs.
- At least 90 percent of full-length runs contain 8-10 event decisions.
- No full-length run contains a regular event-decision gap longer than two in-game days.
- Initial-state validation and simulation invariants fail on zero manifest seeds under every policy.
- In leave-one-template-out sensitivity runs, removing any one non-fallback event changes the at-least-one-survivor rescue rate by no more than 10 percentage points.

These ranges are tuning signals rather than promises about human win rates. They may be revised once after the proof-of-fun playtests, with the reason documented before release-candidate balancing begins.

The final timing sample contains at least ten successful, non-debug rescue runs. Timing begins after Begin is selected and ends when the ending appears. Event-reading and policy-interaction time count; explicit manual pauses and time spent in a hidden tab do not. An eligible timing run spends at least 75 percent of unpaused simulation time at normal speed and does not use very-fast speed. At least 80 percent of eligible runs, and the sample median, must fall within 15-25 minutes. Early defeats are reported separately and may be shorter.

Exit criteria:

- The human timing sample meets the documented 15-25 minute protocol; fast and very-fast play intentionally shorten runs.
- Conservative-policy simulation results fall within the approved target ranges.
- Defeats have understandable causes rather than unexplained random spikes.
- No known issue blocks setup, resume, camp priority, decisions, time controls, victory, defeat, or restarting.
- The release build performs acceptably on supported desktop and mobile browsers.

## 16. Testing Strategy

### Automated Tests

- Need accumulation and health damage
- Stored-resource consumption and gathering
- Source depletion, reservation, cap, and replenishment
- Shelter decay, protection, and repair
- Nighttime sleep constraints and emergency overrides
- Task priority selection, rotating assignment order, and explanations
- Camp-priority bias, opportunity costs, daily change limit, and critical overrides
- Trait modifiers
- Event eligibility, participants, phase weighting, effects, spacing, and cooldowns
- Interactive follow-up counting, spacing, and eligibility
- Delayed automatic consequences and irrelevant-effect cleanup
- Final-step ordering among due effects, death, rescue, and terminal-state entry
- Victory, defeat, and ending quality
- Independent random streams and seed reproduction
- Fixed-step simulation consistency
- Automatic-save serialization and restoration

Runtime-controller tests cover accumulator behavior and verify that different speed settings process equivalent fixed steps. Pure simulation tests advance explicit steps and do not depend on runtime speed labels or fake wall-clock time.

### Headless Simulation Tests

Run games without rendering under named decision policies:

- Conservative: Prioritizes critical projected shortages and usually chooses lower-risk event options.
- Resource-greedy: Aggressively changes policy toward the currently scarcest stored resource and accepts moderate opportunities.
- Random/fuzz: Uses a separate deterministic policy PRNG to select valid priorities and choices and explore state combinations; its win rate is not a balance target.

Report results separately for each policy, including:

- Rescue and all-survivor-rescue rates
- Causes and timing of deaths
- Resource and source-availability minimums
- Camp-priority usage
- Root-event, interactive-follow-up, and delayed-effect frequencies
- Decision count and longest gaps
- Events that dominate damage or resource loss
- Stuck, idle, or conflicting task reservations
- Simulated run duration and ending distributions

Automated simulations provide balancing evidence but do not replace human playtesting. Their reports must always identify the policy ID and version rather than presenting one context-free victory rate. Failed runs also record the game seed, policy seed, and command trace for exact reproduction.

### Manual Test Matrix

At minimum, test:

- Multiple seeds, including same-seed replays
- Every camp-priority option and the once-per-day limit
- Runs emphasizing conservative, balanced, and risky decisions
- Desktop mouse and keyboard input
- Mobile touch input at 360 CSS pixels and larger
- Pause and every speed setting
- Tab hiding and restoration
- Automatic resume after day boundaries, event decisions, policy changes, and visibility changes
- Automatic resume from unacknowledged victory and defeat states
- Invalid or incompatible local saves
- Victory with three, two, and one survivor; defeat with none
- Restart, new game, and same-seed replay

## 17. MVP Acceptance Criteria

The MVP is complete when all of the following are true:

- A player can start a seeded 14-day game with exactly three distinct survivors.
- The game uses the validated fixed island and seeded cosmetic variation.
- Survivors visibly and autonomously perform survival activities.
- The player can change a camp-wide priority once per in-game day and understand its effects.
- Source depletion, replenishment, shelter, needs, and task reservations work consistently.
- The interface explains survivor actions, policy influences, and all critical state changes.
- Day/night progression and all time controls work reliably.
- Contextual decisions pause the game and produce visible consequences.
- Choices can create delayed automatic consequences and interactive follow-up events.
- A typical run contains 8-10 event decisions without regular gaps longer than two in-game days.
- Every run ends in rescue or defeat and produces a survivor-specific summary.
- A normal-speed full rescue run meets the documented 15-25 minute timing protocol; early defeats may be shorter.
- A compatible automatic local save can resume an unfinished run or unacknowledged ending.
- The complete experience works in supported desktop and mobile browsers.
- No backend or installation is required for play.
- The proof-of-fun playtest gate and approved release balance targets have been met.

## 18. Explicitly Deferred Features

- Configurable survivor counts, including one-, four-, or eight-survivor modes
- Alternate rescue durations and formal difficulty modes
- Procedural island outlines, location placement, and navigation graphs
- Signal construction or signal-dependent rescue
- Sickness as a separate condition from injury
- Direct survivor movement or individual job assignment
- Individual inventories
- Detailed relationships and social graphs
- Crafting recipes and technology trees
- Combat
- Multiple islands or biomes
- Complex weather or ecological simulation
- Campaigns and persistent progression
- Unlocks and achievements
- Multiplayer and online leaderboards
- Accounts and cloud saves
- Manual save slots; the MVP includes one automatic local resume point
- Mod support
- Localization beyond preparing text to be externalized later

## 19. Risks And Mitigations

### Insufficient Player Agency

Risk: Watching autonomous survivors may still feel passive between event decisions.

Mitigation: Let the player proactively change a consequential camp-wide priority once per day, show projected pressures, maintain reliable event pacing, and make choices affect later events and endings. Validate agency in blind playtests before content expansion.

### Opaque Simulation

Risk: Players may interpret autonomous choices, policy overrides, reservations, or resource losses as bugs.

Mitigation: Show current activities, reasons, travel targets, active policy influence, source availability, event results, and a concise activity log.

### Stable Or Inevitable Economy

Risk: Renewable sources may create a solved equilibrium, while overly low capacities may make defeat inevitable.

Mitigation: Combine capped replenishment, finite wreckage, shelter decay, run-phase event pressure, centralized tuning, and policy-based headless simulations. Tune for recoverable pressure rather than permanent stability or unavoidable collapse.

### Seeded Unfairness

Risk: Survivor traits, initial wreckage variation, and event order may combine into an unreasonable run even on the fixed island.

Mitigation: Cap setup modifiers, reject incompatible or nonviable trait combinations, isolate random streams, reproduce failures by game seed plus policy version and seed, and run large policy-labeled simulations.

### Content Repetition

Risk: A small event pool may feel repetitive across runs.

Mitigation: Trigger only 8-10 of 12-15 templates per run, prevent unmarked within-run repetition, vary participants and text, use eligibility and phase weighting, and include delayed follow-ups. Expand content only after the core loop passes its playtest gate.

### Policy Micromanagement

Risk: Rapidly changing camp priority could become indirect individual job assignment or an optimal repetitive chore.

Mitigation: Limit changes to once per in-game day, apply changes only to newly selected tasks, keep critical and nighttime constraints authoritative, and balance each policy around an explicit opportunity cost.

### Scope Expansion

Risk: Procedural geography, variable party sizes, signal, sickness, crafting, relationships, weather, and detailed pathfinding can delay a coherent release.

Mitigation: Keep deferred systems out of MVP milestones. A deferred system returns to scope only after the proof-of-fun gate and only when playtesting demonstrates a core requirement that cannot be met more simply.

### Browser State Loss

Risk: Mobile tab eviction, reloads, or interruptions may erase a 15-25 minute run.

Mitigation: Store one versioned automatic local resume point at meaningful checkpoints, save on visibility loss when possible, and test safe behavior for unavailable, corrupt, and incompatible storage.

## 20. Open Decisions

Resolve these during the technical foundation or proof-of-fun playtests:

- Exact day duration within the 60-75 second target
- Whether `3x` and `8x` remain the best accelerated speeds
- Exact need, source capacity, replenishment, gathering, and shelter-decay rates
- Exact strength and opportunity cost of each camp priority
- Whether the final event target should be eight, nine, or ten decisions per run
- Exact probability ranges represented by low, moderate, and high risk
- How much task intent and source availability appears on the island versus in survivor panels
- Supported browser versions and minimum tested mobile hardware
- Whether minimal audio belongs in the MVP release or the first post-MVP update

These decisions should use centralized tuning values and should not expand the fixed MVP configuration matrix.

## 21. Recommended MVP Implementation Target

The complete MVP target is:

- One authored and validated island gameplay layout
- Exactly three generated survivors
- One 14-day rescue duration
- Food, water, materials, shelter, health, hunger, thirst, energy, morale, and injury
- Capped and replenishing sources plus finite wreckage supplies
- Autonomous gathering, eating, drinking, repairing, resting, and sleeping
- One persistent camp priority that can be changed once per day
- Six to eight traits
- Twelve to fifteen interactive event templates, including at least two follow-up templates
- At least three root templates that create a delayed automatic consequence or unlock a follow-up
- Eight to ten event decisions in a typical run
- Rescue, defeat, and survivor-specific ending summaries
- One versioned automatic local resume point
- Responsive, keyboard-accessible, and touch-accessible browser presentation

Build the one-survivor technical slice first, but treat the three-survivor proof-of-fun milestone as the gate for all final content and polish. This sequence tests both the architecture and the central promise: understandable autonomous survivors whose personalities, group policy, and event choices create a memorable survival story.
