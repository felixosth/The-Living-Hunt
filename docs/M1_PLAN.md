# M1 — "Tracks in the mud": build plan

*The working plan for milestone M1 in the [Roadmap](ROADMAP.md). It turns the design's field systems ([Game Design §7](GAME_DESIGN.md)) into concrete mechanics, numbers and code. Every number here is a first guess to tune by playing.*

**Goal:** one forest, roe deer and hares, one bow. Finding a sign, working out the animal, stalking it against the wind, taking a fair shot, following the blood and carrying the animal home should take 10–20 minutes and make you want to go again.

## The hunt this milestone has to deliver

1. You leave **Einar's cabin** at dawn. The wind is from the south-west.
2. At the ford the mud is full of prints. You **scan** and find a line of heart-shaped slots and a pile of pellets. **Inspecting** the print gives a reading: *"Roe deer, walking north-east, 2–4 hours old."*
3. You **follow** it. On the soft game trail the next prints light up as you walk; on dry moss you lose the trail and scan in circles until it picks up again.
4. The trail heads into a thicket where the deer bed by day. Your wind is wrong, so you circle round to come in from downwind, **sneaking** over moss, not snapping through the thicket.
5. A doe gets up to feed at the thicket edge. Her head comes up: she heard something. You freeze until her **awareness** eye empties.
6. You **draw**. The **shot inset** shows her quartering towards you, shoulder over the lungs. You wait until she turns broadside, hold your breath and release.
7. Bright, **frothy blood** on the arrow. Your knowledge says a lung-shot deer goes down within 250 m, so you wait a few minutes, then **follow the blood trail** to her.
8. You **field-dress** her, **carry** 17 kg back to the cabin and get a **hunt summary**.

The ways to fail, all of which should feel fair: winded (the wind carried your scent), heard (too fast over loud ground), seen (moving in the open or drawing while she was watching), a poor shot (gut or leg, so a long trail or a lost animal), pushing a wounded animal too early, and losing the trail.

## Build steps

Each step ends playable, is pushed to `main` and deploys.

### Step 1 — The forest and the hunter

- **Region generator v2** (`src/sim/mapgen/`): the stream gets **fords** (shallow crossings with mud banks) so the whole map is connected. It also gets **Einar's cabin** at a meadow edge (the spawn and delivery point) and **points of interest**: bedding sites in thickets, feeding sites on meadows and at forest edges, and drinking spots at the fords and the pond.
- **Navigation grid** at 4 m cells (a cell is walkable only if all four of its tiles are). **Game trails** are grown by repeatedly pathfinding between points of interest with a wear bonus, so routes merge into a trail network. Animals pay less to walk on trails, and the player gets a small speed bonus and makes less noise on them.
- **Distance fields**: one Dijkstra field per point of interest over the navigation grid, precomputed once per region. An animal walks to a point of interest by stepping downhill in its field, so no paths are stored in the saved state.
- **Ground properties** per terrain: noise, cover and softness (how well it takes a print).
- **Stealth model** (`src/sim/stealth.ts`): noise from gait × ground (trails are quieter), visibility from gait × cover × light, and a scent cone downwind of the player.
- **Rendering:** trails baked into the ground texture, trees as individual sprites drawn *above* the player and animals, with the canopy fading when the player walks under it. The cabin.
- **HUD:** noise and visibility meters.

### Step 2 — The animals

- **Species data** (`src/content/species.ts`): roe deer and mountain hare, with weights, speeds, senses, activity patterns and body models.
- **Roe deer**: 3–4 groups (a doe with a fawn or two, a solitary buck). Their day is **feed** at dawn and dusk and through the night, **drink** at a ford or the pond, and **bed** in a thicket from mid-morning to late afternoon, getting up now and then to browse nearby. Herd members follow the leader.
- **Mountain hares**: about ten. They rest in a **form** under cover by day, feed at meadow edges from dusk to dawn, and **sit tight** until you come within 8–15 m, then burst away.
- **Perception** for animals within 150 m of the player:
  - *Sight:* a wide field of view, a line of sight marched through vegetation, and the player's visibility. Motion is what they notice.
  - *Hearing:* the player's noise against distance, masked by wind.
  - *Smell:* the player's scent cone, whose range grows with wind strength, plus a ground **scent grid** (8 m cells, fading over about 6 h) of where the player has walked.
- **Awareness** from 0 to 1 with hysteresis: *unaware → suspicious* (head up, staring at where the stimulus was) *→ alarmed* (a roe deer **barks** and stamps, and the herd goes on alert) *→ fleeing* (the white rump flares, and the deer bounds away from the threat, preferring cover). Scent jumps straight to alarmed. Spooked animals stay warier for the rest of the day.
- **Player vision:** you only see animals within your sight range (150 m by day, 25 m at night, better under a bright moon) that have a clear line of sight to you. Bedded deer are hard to spot. Awareness eyes are drawn over animals you can see.
- **Sounds as events:** barks, a hare bursting from its form and running hooves appear as HUD notices with a direction ("A roe deer barks to the north-west"). Fast-forward drops back to 1× when you see or hear an animal.
- **Warm-up:** a new world simulates 36 hours before you arrive, so the forest already holds a day and a half of signs.
- **God view** in the debug panel: every animal with its activity and awareness, your scent cone and noise radius, every sign, and the trails and points of interest.

### Step 3 — Signs

- **Sign store** in `WorldState`: columnar typed arrays (id, kind, species, animal, x, y, time, heading, gait, weight, detail, integrity, flags) with pruning.
- **Emission:**
  - *Prints* from strides, with the chance set by ground softness; mud takes almost every print.
  - *Pellets* while feeding and on leaving a bed.
  - *Beds* when a deer or hare gets up after resting for 30 minutes or more.
  - *Browse* when a deer feeds at a forest edge.
  - *Blood* in step 4.
- **Decay:** hourly, by kind and ground. For example, a print lasts about 2 days in mud and 8 hours on grass, while pellets last about a week.
- **Noticing:**
  - Obvious signs appear by themselves when you walk close: fresh prints in mud, blood, and arrows.
  - **Scan** (`Q`): you crouch for 20 game seconds and search a radius of 12 m. Each sign is found with a chance set by its integrity, its kind, the light and your literacy.
- **Inspect** (click a found sign): a **reading** card from the pure `readSign(sign, knowledge, now)`. Each field (species, age, weight, gait, heading, group size, blood type) is blurred by your knowledge level (0–4). Ranges always contain the truth (a property test checks this), and the same sign gives the same reading until your knowledge changes.
- **Knowledge:** per species and per sign kind, as experience points. Inspecting teaches a little. **Confirming** teaches a lot: seeing the animal whose trail you're following, or butchering an animal and learning its true weight. Level-ups appear as toasts.
- **Follow** (`F`, or the button on the card): as you walk, the next prints of that animal within about 25 m light up, with a chance set by their integrity and your literacy. Gaps on poor ground lose the trail until you scan.

### Step 4 — The bow and the recovery

- **Draw:** hold the right mouse button with the cursor on a visible animal within 50 m. Your gait drops to a sneak while you're drawn. Drawing is a movement an animal can see.
- **The shot inset:** a side-view silhouette of the target at its current angle to you. While drawn, the mouse moves the aim point on the silhouette.
  - Organ outlines appear with anatomy knowledge and sharpen as it grows.
  - The **reticle** shrinks as you settle, grows with distance, movement and a long hold, and grows a lot on a moving target.
  - **Space** holds your breath for about 3 seconds of steadiness; after that the shaking gets worse.
  - **Left click** releases. Releasing the right button lets the bow down.
- **Hit model:** the body is an ellipsoid with organ spheres (heart, lungs, liver, gut, shoulder, spine, neck, legs). The impact point is sampled from the reticle, and a ray cast at the animal's true angle finds what the arrow passes through. The shoulder blade can stop an arrow on a quartering-towards shot.
- **Wounds**, following the design's hit table:

  | Hit | What happens |
  |---|---|
  | Heart | Dies 30–80 m away |
  | Lungs | Dies 100–250 m away |
  | Liver | Beds down and dies in 1–4 h, but runs on if pushed |
  | Gut | Dies in 6–16 h, or survives. If pushed, it runs very far |
  | Leg | Survives, limping |
  | Bone or neck | Survives with a superficial wound |

  Wounded animals bleed blood signs whose type (bright spray, frothy, dark, stomach contents, sparse) tells you the hit. The arrow lands beyond the animal with blood or hair on it, so it is a sign too.
- **Carcasses:** field dressing (`E`, 15 game minutes, removes about 25 % of the weight and teaches anatomy), carrying (30 kg capacity; the load slows you and makes you louder), dropping, and arrows recovered from misses and carcasses (12 arrows).
- **Hunt summary** when you bring an animal to the cabin: the animal, weight, first sign found, time spent tracking, shot distance and angle, hit, blood trail length, meat condition and what you learned.

### Step 5 — Finish

- **Controls and help overlay** (`H`), and `T` to wait at 10×.
- **Headless runner stats:** animals, activity budgets, signs over time, and a scripted hunter test.
- **Browser smoke test:** scan, inspect and draw.
- **Docs:** README controls and roadmap status.

## Technical decisions

| Decision | Choice | Why |
|---|---|---|
| Animal pathing | Precomputed per-point-of-interest distance fields on a 4 m grid | No per-trip A*, no paths in saves, and deterministic |
| Fleeing | Local steering sampled over 16 directions: away from the threat, towards cover, avoiding water | No flow field needed in a 512 m region |
| Sign storage | Columnar typed arrays in `WorldState`, linear scans | Compact in saves. Scans are rare actions, so no spatial hash yet |
| Player vision | Computed in `makeSnapshot`: only visible animals reach render and UI | Hidden animals can't be revealed by zooming out |
| Shot | Sim-side reticle and ray cast, driven by `draw`, `aim`, `breath`, `release` commands | Deterministic and testable |
| Save compatibility | `STATE_VERSION` 2; v1 (M0) saves are upgraded by populating a fresh forest around the saved time, position and weather | M0 saves hold only a position |
| Canopy | Trees as sprites in 32 m chunk containers, faded individually near the player | Fading needs per-tree alpha, and chunk culling keeps it cheap |
