# Island Survival Simulation: MVP Project Plan

## 1. Product Summary

A lightweight browser game in which 1-8 procedurally generated survivors are stranded on a small 2D island. The survivors act autonomously while the player watches, controls the passage of time, and responds to strategic and narrative decisions. The group must remain alive until rescue arrives.

The intended experience is a short, replayable survival story with understandable simulation rules, meaningful tradeoffs, and a serious tone with occasional personality-driven humor.

## 2. MVP Goals

The MVP must let a player:

1. Configure and start a randomized game.
2. Watch distinct survivors move around a small island and perform understandable tasks.
3. Observe time, resources, survivor conditions, and the rescue countdown.
4. Make consequential decisions based on the current simulation state.
5. See immediate and delayed consequences of those decisions.
6. Reach a clear rescue or defeat ending within approximately 15-25 minutes.
7. Start another run with meaningfully different survivors, geography, and events.

The MVP succeeds if the player can describe a run as a short story rather than only as a sequence of changing resource values.

## 3. Design Principles

- **Decisions are the player's primary agency.** The player does not directly move survivors or assign jobs.
- **The simulation must be legible.** Important actions and state changes must have visible explanations.
- **Choices should involve tradeoffs.** Avoid options with an obviously correct answer.
- **Randomness creates variety, not arbitrary defeat.** Starting states must be survivable, and severe risks must be communicated.
- **Keep runs short.** Setup should be quick, interruptions should be well paced, and time controls should limit waiting.
- **Build depth from interactions.** Prefer combining a few resources, traits, and event conditions over adding more systems.

## 4. Target Experience

- Platform: Modern desktop and mobile browsers
- Typical run length: 15-25 real-world minutes
- Tone: Serious survival with moments of levity
- Presentation: Small top-down 2D island with an HTML interface around it
- Input: Mouse, touch, and keyboard-accessible interface controls
- Player count: Single player
- Server requirement: None for the MVP

## 5. Core Game Loop

1. Survivors evaluate their needs and the state of shared supplies.
2. They autonomously travel to island locations, gather resources, rest, or recover.
3. Time advances through daylight and nighttime phases.
4. A context-sensitive event interrupts the simulation and pauses time.
5. The player chooses one of 2-3 responses.
6. The game applies immediate effects and records any delayed consequences.
7. The loop continues until rescue arrives or all survivors die.

Target event cadence is approximately one meaningful decision per in-game day, with occasional emergencies. Cooldowns must prevent events from appearing in rapid, frustrating clusters.

## 6. Game Setup

The new-game screen includes:

- Survivor count from 1 to 8
- Rescue duration presets of 7, 14, or 21 in-game days
- Randomized seed, with an optional way to enter or copy a seed
- A single action to generate the island and begin

The selected survivor count and rescue duration affect difficulty. Initial supplies, sustainable gathering rates, and event parameters must scale sufficiently to make every supported combination viable.

Arbitrary rescue durations and formal difficulty modes are deferred until the presets are balanced.

## 7. Simulation Rules

### 7.1 Time

- The simulation uses a fixed time step so game behavior remains stable at every speed.
- One day should initially target 45-75 seconds at normal speed, subject to playtesting.
- Supported controls are pause, normal speed, fast speed, and very fast speed.
- Decisions pause the simulation automatically.
- The simulation pauses when the browser tab is hidden.
- Survivors generally work during daylight and sleep at night.

### 7.2 Shared Group State

The MVP tracks:

- Food
- Water
- Materials
- Shelter condition
- Signal condition

Food, water, and materials are communal. The MVP does not model individual inventories.

Shelter provides protection during rest and adverse events. Signal condition influences the quality of the ending but does not make the promised rescue date unreliable.

### 7.3 Survivor State

Each survivor has:

- Name
- Visual appearance
- Two traits
- Health
- Hunger
- Thirst
- Energy
- Morale
- Current activity
- Temporary conditions such as injured or sick
- Alive or dead state

Needs change over time. Unmet hunger and thirst eventually damage health, exhaustion limits productivity, and low morale affects work or selected events. Exact rates are balancing parameters rather than hard-coded assumptions.

### 7.4 Autonomous Behavior

Survivors use a simple priority-based state machine rather than a general-purpose artificial intelligence system.

Default priorities are:

1. Address immediately dangerous thirst, hunger, or health conditions.
2. Rest when critically exhausted.
3. Gather the shared resource in greatest need.
4. Maintain shelter or improve the signal when supplies are stable.
5. Perform a trait-influenced low-priority activity.
6. Sleep during the nighttime period.

Every activity must expose a short explanation, such as `Gathering water: group supply is low`. If a survivor cannot complete an intended task, the interface or event log must explain why.

### 7.5 Movement

- Survivors move between a small number of island locations.
- Movement can use a coarse navigation graph, grid, or simple waypoint routes.
- Sophisticated collision avoidance and physically realistic pathfinding are not MVP requirements.
- Travel time matters, but movement must not routinely trap survivors or prevent urgent self-care.

## 8. Island

Each island contains a camp and several recognizable locations:

- Shore and wreckage
- Fresh-water source
- Food or forage area
- Forest or material source
- Dangerous interior location
- Signal location or viewpoint

Generation varies:

- Island outline and visual decoration
- Location placement
- Travel distances
- Resource abundance within safe balance limits
- Initial wreckage supplies

Generation must run through validation rules. Every starting island must have reachable food, reachable fresh water, enough initial materials to stabilize the camp, and no disconnected required locations.

The island is intentionally compact. Multiple biomes, realistic ecosystems, and large procedural maps are outside the MVP.

## 9. Traits

Traits give survivors recognizable strengths and weaknesses. MVP traits should apply understandable numeric modifiers or affect event options.

Initial target: 8-12 traits, including examples such as:

- Forager: Collects food faster
- Resourceful: Uses fewer materials
- Optimist: Loses morale more slowly
- Hot-headed: More likely to trigger conflict events
- Fragile: Suffers larger penalties from injury
- Loner: Works effectively alone but can reduce group morale

Trait combinations must not make a survivor useless or guarantee success. A detailed skill system is deferred.

## 10. Decision And Event System

### 10.1 Event Requirements

Events are data-driven and may define:

- Eligibility conditions
- Weight or relative frequency
- Cooldown
- Participants
- Display text
- Two or three choices
- Known risk descriptions
- Immediate effects
- Delayed follow-up effects
- Trait-specific options or modifiers

Events should be selected using current conditions. For example, an event about wasting water should not occur when there is no stored water.

### 10.2 Event Categories

- Resource shortages and opportunities
- Exploration
- Interpersonal conflict
- Injury, illness, and emergencies
- Shelter and signal tradeoffs
- Trait-specific situations
- Follow-ups to earlier choices

### 10.3 Outcome Rules

- Outcomes may be deterministic or probabilistic.
- Probabilistic risk is described qualitatively, such as low, moderate, or high.
- Random setbacks can injure survivors or consume resources.
- Sudden death should generally follow an explicitly communicated high-risk choice, not an unavoidable random event.
- Immediate results are shown after a choice.
- Delayed consequences must reference the choice that caused them.

Initial content target is 25-35 reusable event templates. At least several events must include follow-ups so the player's choices feel persistent.

## 11. Winning, Losing, And Endings

### Victory

At least one survivor is alive when the rescue countdown reaches zero.

### Defeat

All survivors die before rescue arrives.

### Ending Quality

The ending considers:

- Number of survivors rescued
- Survivor health
- Group morale
- Signal condition
- Notable decisions and deaths

Example outcomes include triumphant rescue, costly rescue, barely alive, and lost expedition.

The end screen shows:

- Final result
- Each survivor's fate
- Number of days survived
- A short summary of major decisions and turning points
- Island seed
- Restart and new-game actions

## 12. Interface Requirements

### Main Simulation View

- Visible island and survivors
- Current day and time of day
- Days remaining until rescue
- Food, water, and materials
- Shelter and signal condition
- Survivor portraits and conditions
- Current survivor activities
- Recent event and activity log
- Pause and speed controls

### Decision View

- Event title and description
- Survivors involved
- Two or three clearly selectable choices
- Known costs and qualitative risks
- A result state before simulation resumes

### Usability

- The layout must work on desktop and mobile viewport sizes.
- Controls must be usable with touch and keyboard.
- Text and status indicators must not rely on color alone.
- A short first-run introduction explains the objective, shared resources, autonomous behavior, decisions, and time controls.
- Critical changes such as injury, death, depleted water, and approaching rescue require prominent feedback.

## 13. Audio And Visual Scope

The visual goal is clarity and character rather than detailed animation.

Required:

- Distinct survivor appearances
- Readable location and activity indicators
- Day/night lighting change
- Basic movement and task animations or poses
- Clear feedback for important events

Optional if schedule permits:

- Ambient island audio
- Minimal interface and event sounds
- Additional decorative animation

Volume controls are required if audio is included. A full soundtrack and extensive animation set are deferred.

## 14. Technical Direction And Decision Gate

The implementation must remain entirely browser-based and lightweight. Before feature development, complete a short technical spike and choose between native Canvas rendering and a small 2D rendering library.

Recommended baseline:

- TypeScript
- Vite or an equivalently lightweight build tool
- Canvas-based island rendering
- HTML/CSS interface for status, setup, decisions, and endings
- Data files or typed objects for traits and events
- Unit tests for deterministic simulation rules
- No backend, accounts, database, or network dependency

The technical spike must confirm:

- Smooth rendering with eight moving survivors on representative mobile and desktop hardware
- Reliable pointer and touch input
- Fixed-step simulation behavior at all speed settings
- A maintainable boundary between simulation state and rendering
- Whether a framework adds enough value to justify its bundle and complexity

## 15. Development Milestones

### Milestone 0: Technical Foundation

Deliverables:

- Select rendering and interface technologies
- Establish development, production build, formatting, and test commands
- Define simulation state and fixed-step update boundary
- Render a placeholder island and moving survivor
- Verify desktop and mobile browser behavior

Exit criteria:

- A production build loads without a server-side application.
- One survivor moves consistently at normal and accelerated speeds.
- Simulation logic can be tested without rendering the game.

### Milestone 1: End-To-End Vertical Slice

Use a fixed island, one survivor, one rescue duration, and a small set of placeholder events.

Deliverables:

- Day/night cycle and time controls
- Food, water, materials, hunger, thirst, energy, and health
- Basic survivor task selection and movement
- One instance of each event flow: trigger, choice, outcome, and resume
- Rescue victory and all-survivors-dead defeat
- Minimal status interface and activity log

Exit criteria:

- A complete run can be played from setup to an ending.
- The player can understand what the survivor is doing and why.
- Fast-forwarding does not change simulation outcomes unexpectedly.

### Milestone 2: Full Survivor Simulation

Deliverables:

- Support for 1-8 survivors
- Survivor generation and visual variation
- Traits and trait modifiers
- Morale, injury, sickness, shelter, and signal systems
- Group-aware task selection
- Survivor portrait and status interface
- Scaling rules for different group sizes

Exit criteria:

- Every supported survivor count can complete a stable test run.
- No survivor can become permanently stuck in movement or task selection.
- State changes have readable causes in the interface or log.

### Milestone 3: Procedural Island And Setup

Deliverables:

- Random island shape and location placement
- Reachability and survivability validation
- Seeded generation
- Survivor-count and rescue-duration setup controls
- Initial supply and abundance scaling

Exit criteria:

- Automated generation tests produce no unreachable required locations.
- Reusing a seed and setup reproduces the same initial game.
- All setup combinations have a plausible path to survival.

### Milestone 4: Event Content

Deliverables:

- Data-driven event definitions
- Eligibility, weighting, and cooldown logic
- Immediate and delayed outcomes
- Trait-specific choices
- 25-35 event templates across the required categories
- Event result presentation and history

Exit criteria:

- Events do not contradict current game state.
- Event pacing stays within the intended range.
- At least one prior decision is referenced later in a typical run.
- Risky choices communicate their potential severity.

### Milestone 5: Complete Run Experience

Deliverables:

- First-run introduction
- Responsive desktop and mobile layouts
- Final visual treatment and essential animations
- Ending quality calculation and run summary
- Restart and new-game flow
- Tab visibility pausing and interruption handling
- Basic accessibility pass

Exit criteria:

- A new player can finish a run without developer guidance.
- No required control depends only on hover or color.
- The entire game can be operated on a touch device.

### Milestone 6: Balance And Release Candidate

Deliverables:

- Automated simulation runs for broad balance signals
- Manual playtests for each rescue duration and representative group sizes
- Resource rate, event frequency, and severity tuning
- Performance profiling
- Bug fixing and release build verification

Exit criteria:

- Typical runs last 15-25 minutes.
- Victory is achievable for every supported setup without requiring one specific event.
- Defeats have understandable causes rather than unexplained random spikes.
- No known issue blocks setup, decisions, time controls, victory, defeat, or restarting.
- The release build performs acceptably on supported desktop and mobile browsers.

## 16. Testing Strategy

### Automated Tests

- Need accumulation and health damage
- Resource consumption and gathering
- Task priority selection
- Trait modifiers
- Event eligibility, effects, and cooldowns
- Delayed event consequences
- Victory, defeat, and ending quality
- Seed reproducibility
- Island reachability validation
- Fixed-step consistency across speed settings

### Simulation Tests

Run games without rendering to identify:

- Impossible starting states
- Resource spirals with no recovery path
- Survivor counts that are consistently advantaged or disadvantaged
- Events that dominate outcomes
- Long periods without decisions
- Runs that exceed the target duration

Automated simulations provide balancing evidence but do not replace human playtesting because the player makes context-dependent choices.

### Manual Test Matrix

At minimum, test:

- 1, 4, and 8 survivors
- 7, 14, and 21-day rescue durations
- Desktop mouse and keyboard input
- Mobile touch input
- Pause and every speed setting
- Tab hiding and restoration
- Victory, partial-survival victory, and defeat
- Restart and same-seed replay

## 17. MVP Acceptance Criteria

The MVP is complete when all of the following are true:

- A player can configure 1-8 survivors and a 7, 14, or 21-day rescue target.
- The game creates a valid randomized island and distinct survivors.
- Survivors visibly and autonomously perform survival activities.
- The interface explains their actions and all critical state changes.
- Day/night progression and all time controls work reliably.
- Contextual decisions pause the game and produce visible consequences.
- Choices can create delayed follow-up events.
- Every run ends in rescue or defeat and produces a meaningful summary.
- A normal run takes approximately 15-25 minutes.
- The complete experience works in supported desktop and mobile browsers.
- No backend or installation is required for play.

## 18. Explicitly Deferred Features

- Direct survivor movement or job assignment
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
- Manual save/resume, unless playtesting shows it is necessary
- Mod support
- Localization beyond preparing text to be externalized later

## 19. Risks And Mitigations

### Insufficient Player Agency

Risk: Watching autonomous survivors may feel passive between decisions.

Mitigation: Maintain reliable event pacing, show upcoming pressures, make choices affect later events, and keep normal-speed waiting short.

### Opaque Simulation

Risk: Players may interpret autonomous choices or resource losses as bugs.

Mitigation: Show current activities, reasons, travel targets, event results, and a concise activity log.

### Procedural Unfairness

Risk: Some islands or survivor combinations may be unwinnable.

Mitigation: Validate generation, cap random modifiers, use seeded reproduction, and run headless balance simulations.

### Content Repetition

Risk: Short runs may expose the same events repeatedly.

Mitigation: Use eligibility conditions, cooldowns, participant variation, follow-ups, and a sufficiently broad initial event pool.

### Scope Expansion

Risk: Crafting, relationships, weather, and detailed pathfinding can delay a playable build.

Mitigation: Keep deferred systems out of milestones unless playtesting proves a core requirement cannot be met without one.

### Balancing Across 1-8 Survivors

Risk: A system tuned for one group size may break at another.

Mitigation: Scale both consumption and productive capacity, test representative extremes early, and avoid event costs that assume a fixed group size.

## 20. Open Decisions

Resolve these during the technical foundation or first vertical-slice playtests:

- Native Canvas versus a lightweight 2D rendering library
- Framework or framework-free HTML interface
- Exact day duration and speed multipliers
- Exact need and resource rates
- Whether morale acts individually, as a group aggregate, or both
- Whether sickness is distinct enough from injury to justify a separate condition
- How much task intent is shown directly on the island versus in the survivor panel
- Supported browser versions and minimum mobile viewport
- Whether minimal audio belongs in the MVP release or the first post-MVP update

These decisions should not block building the vertical slice unless they affect its architecture.

## 21. Recommended First Implementation Target

Build the smallest complete run before procedural generation or full content:

- One fixed island
- One survivor
- Seven in-game days
- Food, water, materials, health, hunger, thirst, and energy
- Gathering, eating, drinking, resting, and sleeping
- Three events with two choices each
- One delayed consequence
- Rescue and defeat screens

This target tests the central promise: watching an understandable autonomous survivor, making meaningful decisions, and seeing those decisions shape a complete survival story.
