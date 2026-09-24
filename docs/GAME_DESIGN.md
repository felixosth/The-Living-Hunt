# The Living Hunt — Game Design

*Version 0.1 — the initial plan. Everything here is a starting hypothesis to be proven or killed by play.*

> **Learn the wilderness. Read its consequences. Hunt intelligently.**

---

## 1. The game in one paragraph

You inherit a dead hunter's cabin, his half-finished journal and his unpaid taxes in **Ulvdalen**, a small northern valley where two settlements live off the forest. The valley is simulated from end to end. Animal populations eat, breed, hunt and move between regions. Weather builds up snow, floods fords and wipes out tracks. Settlements use up and produce real stockpiles of goods. Traders haul those goods along roads that can close, and rival hunters chase the same bounties you do. You earn a living by *reading* this system: tracks in the mud, prices on a merchant's slate, a rumour in the tavern, ravens circling a ridge. Then you act on what you read before anyone else does.

---

## 2. Design pillars

1. **Knowledge is the progression.** The *player* gets better, and the character mostly gets better informed. A novice sees "a large print". A veteran sees "a 42 kg male wolf, trotting north-east 14 hours ago, favouring its right foreleg".
2. **Everything has a cause.** There are no random price modifiers and no quest monsters spawned for you. Every contract, price swing and animal exists because of something in the simulation, and the game lets you trace it. *"Why is iron so expensive?"* is a real question you can ask a merchant.
3. **Preparation beats reflexes.** You mostly win or lose a hunt before the shot: where you stand relative to the wind, what you brought, and when you went.
4. **The world doesn't wait.** An evening in the tavern is an evening the wolves spend among the sheep. Opportunities expire, and other hunters take them.
5. **Small but deep.** One valley, a handful of species and two settlements, with every system connected to every other. Depth comes from connections, not from content volume.

### What we are deliberately *not* making

- **No quest markers pointing at the target.** The journal shows what *you* know, nothing more.
- **No XP-to-damage treadmill.** An arrow through the lungs kills whatever your level is.
- **No huge or infinite open world.** The valley is five regions you will come to know intimately.
- **No crafting sprawl.** About 20 recipes, each of which matters.
- **No multiplayer and no 3D.**

---

## 3. Setting: Ulvdalen

A fictional valley on a northern frontier with a Nordic flavour, at roughly 63° N, in a pre-industrial age of bows, crossbows, iron traps and very rare, very loud flintlocks. The tone is grounded, quiet and a little melancholic. Folklore creatures exist, but they are *animals*: rare, misunderstood, part of the food web and half-disbelieved by the villagers.

The latitude matters to play. At midwinter you get about 5 hours of daylight, so most winter hunting happens in blue twilight, by moonlight on snow or by lantern (which animals see). Midsummer is near-endless light.

**Currency:** *daler* and *öre* (100 öre = 1 daler).

### Places

| Place | Type | Character |
|---|---|---|
| **Ravnholm** | Settlement (farming village, ~60 people) | The starting point. Farms, a tavern, a general merchant, a tanner, a butcher, the village council and the notice board. |
| **Järnbro** | Settlement (mining and trade post, ~40 people) | Upriver. Iron mine, smelter, smithy, fur trader and apothecary. Linked to the outside world by the road to the coast. |
| **Hagmarken** | Region: pasture and forest edge | Around Ravnholm's farms. Hares, roe deer and foxes. Wolves and lynx come in when the forest fails them. |
| **Granåsen** | Region: spruce ridge | Old forest. Roe deer, moose, lynx, bear dens. Dark, quiet and good for stalking. |
| **Svartmyren** | Region: the black mire | Wetland. Moose, beaver, cloudberries, bog myrtle and medicinal plants. Something large basks on the rocks in summer. |
| **Älvstråket** | Region: river corridor | The trade road and **the ford** between the settlements. Floods in the spring thaw and after heavy rain. |
| **Kallfjället** | Region: the bare fell | Above the treeline. A wolf den, mountain hares and wolverine. Brutal winter storms. |
| **Saltvik (off-map)** | The coast | The "outside world" market that caravans trade with. It anchors prices and is never visited. |

---

## 4. Who you are and why you're here

You arrive in late autumn (Autumn, day 8) to take over the cabin of your uncle **Einar**, a hunter who went out on the fell last winter and didn't come back. You inherit:

- a worn bow, 12 arrows, a knife, 3 snares and 11 daler;
- **Einar's journal**, a partly filled field notebook that is also the tutorial. His notes teach the basics ("hares keep to their runs, set snares a fist above the snow"). Some notes are wrong, and some hint at things the villagers don't talk about;
- **60 daler of back taxes**, due to the council at **Midwinter** (Winter, day 11, about 24 days away).

The debt is the soft opening goal: it forces you to engage with the economy right away, and there are several ways to pay it (trapping, bounties, trading, a lucky lynx). After Midwinter the game is open-ended, with long-term goals that emerge from play:

- become the hunter the valley calls first (reputation);
- bring down the valley's **legends**, the named animals (see §8.3);
- complete your knowledge of every species, sign and region;
- find out what happened to Einar. This is an optional thread built from *simulated* evidence, not a cutscene (see §12).

---

## 5. Time and scale

| Aspect | Value (tunable) |
|---|---|
| Year | 4 seasons × 21 days = **84 days** |
| Field time scale | 1 real second = 1 game minute at 1× speed (a full day is about 24 real minutes) |
| Waiting and fast-forward | ×10 and ×60, which stop automatically when something is seen or heard |
| Travel | On the valley map; costs game time (30–120 min between neighbouring regions, more in deep snow or flood) |
| Region size | About 1 × 1 km; tiles are 2 m |
| Carry capacity | 30 kg base, 45 kg with a pack frame, about 120 kg with a sled on snow |

Crossing a region on foot takes a few game hours, so a dawn hunt has to be *planned*: you leave the cabin in the dark.

---

## 6. How the game is played

### 6.1 The four screens

1. **Settlement (hub).** An illustrated village scene with clickable places: notice board, tavern, merchant, tanner, butcher, council and your cabin (storage, workbench, bed). Conversations are topic-based: *News*, *Prices*, *Ask why…*, *Sell information*, *Ask about [animal/place]*. Settlements are not walkable. That is a deliberate scope choice.
2. **Valley map.** Einar's hand-drawn map of the five regions, filled in by you over time. It shows routes and travel times, *known* conditions ("ford flooded, as of 2 days ago"), your pins and the forecast.
3. **The field (real time, pausable).** A top-down view of a region, limited to what you can see. This is where you track, stalk, trap, shoot, butcher, camp and haul.
4. **The journal (overlay, pauses the game).** The heart of the UI. It holds your cases, bestiary, maps, price ledger, almanac, rumours and legends. See §10.

### 6.2 Core loops

```
 Moment (seconds)  : move → listen → scan for sign → check wind → adjust → shoot / set trap
 Hunt   (hours)    : investigate → identify → predict → prepare → execute → recover → process → haul
 Living (days)     : read board/tavern/prices → pick opportunities → hunt & trade → sell → gear up
 Season (weeks)    : prepare for winter → watch populations shift → legends emerge → the world reacts to you
 Mastery (always)  : every hunt refines your knowledge → better readings → better predictions
```

### 6.3 A hunt, step by step (the target experience)

> **Autumn 23, Ravnholm.** The notice board reads: *"Two ewes taken at the Nilsson farm in four nights. 25 daler for the wolf. — K. Nilsson."* In the tavern, Old Mattias mutters that he hasn't heard any howling this week. The merchant pays 9 daler for a wolf pelt. Last week it was 6, after the Brandt brothers sold three.

1. **Investigate.** You walk out to Hagmarken (40 min). At the Nilsson fence line you *scan* the kill site. The ewe's remains are dragged under a spruce and covered with needles and grass. The prints in the mud are round, four toes, **no claw marks**. With little lynx knowledge, your journal reads: *"Covered kill — a cat's habit? Round print, no claws. Large cat? 15–30 kg (low confidence)."* This is not a wolf.
2. **Decide.** Nilsson is offering money for "the wolf". Lynx pelts sell for about three times as much as wolf pelts, *but* they're not prime yet, and killing the wrong animal first would cost you the bounty *and* your credibility. You can tell Nilsson it's a lynx (he may raise the bounty or refuse to believe you), or you can just solve his problem.
3. **Predict.** A lynx returns to its cached kill. Einar's almanac and the sky both say *westerly wind tonight*. The evening **thermals** will pull your scent uphill, and the cache sits below the ridge.
4. **Prepare.** You set up east of the cache in the juniper, downwind and below the thermal, at dusk. You leave the lantern unlit.
5. **Execute.** A jay starts its alarm call to the north: *something is moving*. The lynx arrives quartering towards you, so its shoulder covers the vitals. You wait. It turns broadside to feed, head down. You hold your breath, the reticle tightens on the shot inset, and you release. A lung hit leaves **bright, frothy** blood.
6. **Recover.** Your journal remembers: *"Lung-shot animals go down within 250 m. Don't push."* You wait 20 minutes, then follow the blood trail by lantern for 120 m.
7. **Process and sell.** Skinning takes 15 minutes. The pelt is *autumn grade*; six weeks later it would have been prime and worth about 40 % more. Nilsson's losses stop, he pays, and word spreads that the new hunter *reads sign*.
8. **Consequence.** With the lynx gone, the Hagmarken roe deer recover next spring. They eat the council's rye, and in summer the council posts a *cull* contract.

No part of this is scripted. The losses, the tracks, the misattribution, the prices and the spring consequence all come out of the simulation.

### 6.4 The field screen (layout sketch)

```
+----------------------------------------------------------------------------+
| Dusk 17:40 | Autumn 23 | 2 °C | light rain                 WIND  NE 3 m/s  |
|                                                                            |
|                (top-down view, limited to what you can see)                |
|       .  .  :   <- prints, fading in the rain                              |
|                         [deer]  (eye icon half full = "alert")             |
|                                                                            |
|  ( ) "twig snap" -- somewhere NW   (sound arc: direction, uncertain)       |
|                                                                            |
| NOISE [##---]  GAIT: sneak  WARMTH [###-]  LOAD 18/30 kg                   |
| 1 Bow  2 Knife  3 Snare x3  4 Grunt call  5 Lantern     +-- shot inset --+ |
|                                                         |    side view   | |
+---------------------------------------------------------+----------------+-+
```

---

## 7. Field systems

### 7.1 Movement and stealth

- **Gaits:** *run* (fast, loud, tiring), *walk*, *sneak* (slow and quiet) and *still*. Crouching improves cover.
- **Noise** depends on gait × ground: dry leaves, crusted snow, twigs and shallow water are loud; moss, wet leaves and soft new snow are quiet. Strong wind and rain mask noise.
- **Visibility** depends on movement, cover (tall grass, shrubs, young spruce), light (dawn, dusk, moonlight, lantern) and contrast with the background. A white winter smock in the snow is near invisible, and the same smock in a spruce forest is not.
- **Your own trail.** You leave prints and a ground scent trail as you walk. Deer that cross your trail later get nervous. Rain washes it away.

### 7.2 Wind, scent and thermals

- Wind has a direction and strength, shown on the HUD and visible in the world (grass sway, drifting snow and seed fluff).
- Any animal inside your **downwind scent cone** may smell you. The range depends on the species' nose, wind strength and your scent control (spruce-needle cover scent, washed clothes, time since you last stood by a fire).
- **Thermals:** in light wind, air slides downhill in the morning and uphill in the evening. Veterans use this; beginners wonder why the deer always wind them from "upwind". Thermals are a knowledge entry you can learn.
- **Smoke** from your campfire carries far downwind and marks you for hours.

### 7.3 Animal awareness

Every animal moves through clear, readable states: **Unaware → Suspicious** (head up, ears turned, staring) **→ Alarmed** (snort or bark, stamps, alerts the herd) **→ Fleeing** (or **Aggressive** for bears, cornered wolves, moose cows with calves).

- An eye icon over any animal you can see fills as it perceives you.
- Detection comes from sight (field of view × your visibility), hearing (noise events) and smell (scent cone and your ground trail).
- **Alarm spreads.** Deer snort, jays and squirrels scold. You can hear these alarms too: a jay scolding 200 m away tells you *something* is moving there.
- **Pressure.** Heavily hunted regions grow warier, and animals shift toward night activity. Rotating your hunting grounds is optimal play.

### 7.4 Signs

Signs are **records of what actually happened** in the simulation. When a real animal passes, it lays down real prints with its real weight, speed, heading and injuries. Signs decay according to weather and ground.

| Sign | Made by | Can tell you (with knowledge) | Lasts | Weather |
|---|---|---|---|---|
| **Prints** | Every walking creature, including you and NPC hunters | Species, weight, gait/speed, heading, age, injuries, *which individual* | Hours (hard ground) to days (mud, snow) | Rain erodes, snowfall buries, **fresh snow is perfect** |
| **Scat / pellets** | All animals | Species, diet (so where it feeds), age, health | Days to weeks | Rain ages it fast |
| **Beds** | Deer, moose, hares, wolves | Resting spots, group size, when they left | 1–2 days | Snow makes them obvious |
| **Feeding sign** | Browse, bark stripping, dug roots, torn anthills | Species, size (from the height of the browse), current diet | Days to weeks | — |
| **Kills and carcasses** | Predators | The predator (wound pattern, caching, scattering), time of kill, pack size | Days (scavengers eat it) | Cold preserves |
| **Blood** | Wounded animals | Hit location (colour and froth), severity, direction | Hours | Rain washes it, snow shows it vividly |
| **Hair and feathers** | Caught on branches and fences | Species, coat season | Weeks | — |
| **Rubs, scrapes, scent posts** | Deer, bears, wolves, lynx | Territory, rut timing, size (height of the rub) | Weeks | — |
| **Sounds** | Howls, calls, alarm calls, snapping twigs | Presence and rough direction, sometimes a count | Instant | Wind masks, fog carries |
| **Ravens circling** | Ravens over a carcass | *Something dead is under there.* Visible from far away | While the carcass lasts | — |
| **Dens, lodges, dams** | Wolves, bears, beavers, foxes | Home sites | Seasons | — |
| **Human sign** | NPC hunters, traders | Boot prints, fires, gut piles, *their traps* | Days | — |

**Finding signs is an action, not pixel-hunting.** Obvious signs (a carcass, prints in fresh snow, circling ravens) are simply visible. Subtle signs need a **Scan**: you crouch and search a radius of about 10 m, which costs 10–30 game seconds. Your eyes, the light and your knowledge decide what the scan turns up.

### 7.5 Reading signs: fuzzy, honest knowledge

Inspecting a sign produces a **reading**: a journal card where each field (species, age, weight, speed, heading, injuries, individual) is either unknown, a range or a value, each with a confidence. **Readings are never random nonsense.** They are the *truth*, blurred according to your knowledge. With low knowledge you can confuse similar species (dog, fox or wolf; roe calf or moose calf), and the card says you're unsure.

Example: the same wolf print read at five familiarity levels.

| Familiarity | Reading |
|---|---|
| 0 | "A large print. Something heavy passed here." |
| 1 | "Canine, large. Wolf? Recent-ish." |
| 2 | "Wolf, adult. Trotting. Made yesterday, before the rain." |
| 3 | "Wolf, 35–45 kg, trotting NE, about 14 h old. Right fore print lighter, so a limp?" |
| 4 | "Male wolf, about 42 kg, trotting NE, 13–15 h old, favouring right foreleg. **Same animal as the Nilsson-fence print: Three-Toes.**" |

**Knowledge grows by confirmation.** Reading a print teaches a little. *Confirming* the reading teaches a lot, for example when you follow the trail and see the animal, or when you butcher an animal and learn its true weight. This works like real learning: you calibrate your guesses against reality.

### 7.6 Following a trail

Select a print and choose **Follow**. The next prints along the trail are highlighted as far as your knowledge and the conditions allow. On a good trail (mud, snow) you can follow at a walk. On a poor one (dry ground, rain) you lose it and have to scan in circles for the next sign. Wounded deer and hares double back on their own trail, which catches novices out.

### 7.7 The shot

Combat is simple on purpose. The skill lies in *patience* and *anatomy*.

- **Draw** (hold RMB). A reticle circle appears on the target. Its size grows with distance, your movement, fatigue, cold and adrenaline, and shrinks while you stay still.
- **Hold breath** (Space). You get about 3 seconds of steadiness, then the shaking gets worse.
- **The shot inset** is a small side-view silhouette of the target at its *current angle to you*: **broadside** (the vitals are large and exposed), **quartering away** (good), **quartering towards** (the shoulder blocks), **head-on** or **going away** (poor). If you know the species' anatomy, faint organ outlines appear on the silhouette, and more knowledge makes them more accurate.
- **Release.** The hit point is sampled from the reticle and lands on the silhouette: heart, lungs, liver, gut, shoulder bone, leg, neck/head, or a miss.

| Hit | Outcome | Blood sign | Animal behaviour |
|---|---|---|---|
| Heart | Dies in 30–80 m | Bright spray | Bolts, then drops |
| Lungs | Dies within 100–250 m | Bright, **frothy** | Runs, slows, beds down |
| Liver | Dies in 1–4 h | Dark red | Beds nearby *if not pushed* |
| Gut | Dies in 6–16 h, or survives | Dark, with stomach contents | Beds down; if pushed, runs very far |
| Leg / muscle | Usually survives | Sparse, drying up | Limps and becomes wary. **Candidate for a legend** |
| Bone / shoulder | Deflected, superficial | Little | Flees, probably survives |

**Weapons:** bow (quiet, arrows mostly recoverable), crossbow (powerful, slow reload, costs iron), boar spear (close defence, bear hunting) and, late and rare, **the flintlock**. It is powerful, expensive and *loud*: one shot empties the region of relaxed game for hours. It is a real trade-off, not an upgrade.

### 7.8 Wounded animals

A wounded animal keeps being simulated. Follow too early and it runs further. Wait too long in warm weather and the meat spoils, or the foxes, ravens or a wolverine get there first (feeding the ecosystem). If it survives, it heals, remembers and changes. It becomes warier, may shift to night activity and may avoid the place it was shot. This is the most common way legends are born.

### 7.9 Traps and bait

Trapping is a complete alternative playstyle: routes and patience instead of stalking.

| Trap | Targets | Strengths | Weaknesses |
|---|---|---|---|
| **Snare** (wire) | Hares, foxes | Cheap, light, carry many | Not selective. Predators steal the catch |
| **Foothold trap** (iron) | Fox, wolf, lynx, wolverine | Strong, reusable | Costs iron (so its price follows the iron supply), can damage paws and pelts, dangerous to dogs and livestock. Must be checked every day |
| **Deadfall** | Small to medium animals | Built from wood, free | Takes time to set; skill-dependent |
| **Pit** | Boar, bear, lindworm | Big game | Hours of digging, obvious to wary animals |
| **Bait station + blind** | Predators, scavengers | Brings animals to a spot you chose to shoot from | Also brings the ones you didn't want, such as bears |

A set works when it is **on the route** (a game trail, a crossing, a gap in a fence), the **scent is controlled** (traps boiled in spruce water, gloves; rain helps), the **bait fits the diet and season** (starving winter predators take bait readily, fat autumn ones don't) and it is **checked often** (catches spoil, get eaten or are stolen). An unlucky set can catch a farmer's dog, and the village will hear about it.

### 7.10 Calls, blinds and waiting

- **Calls:** a grunt call (deer during the rut), a predator call (hare-in-distress; brings foxes, lynx and sometimes wolves) and a howl (wolves answer, which tells you roughly where the pack is and how many there are, *and* puts them on alert).
- **Blinds and stands:** build one at a known crossing. Waiting in a blind uses fast-forward, which stops automatically on any sighting or sound.

### 7.11 Processing and hauling

- **Field dressing** (minutes) lowers carcass weight and slows spoilage. **Skinning** takes longer, and doing it well is a light skill.
- **Pelt grade** depends on season (winter *prime* > autumn > spring shed > summer), damage (holes, trap marks, scavenging) and handling (time before skinning, then salting and stretching).
- **Meat** spoils with temperature and time. Winter is a freezer, summer is a race. Gut shots taint meat.
- **Hauling** is a decision. A hare weighs 3 kg, a roe deer 25 kg, a wolf 40 kg and a moose about 400 kg. You can quarter the moose and make several trips (while wolves visit the rest), hire the butcher's cart (who takes a cut) or sell the *location* of the kill to the butcher.

### 7.12 Danger, injury and death

- Bears (especially sows with cubs and bears woken from hibernation), cornered or starving wolves, moose cows in spring and the lindworm can all hurt you.
- **Injuries** such as bleeding, sprains and cold exposure slow you down and ruin your aim. Medicine and rest treat them, which ties injury to the apothecary economy.
- **Warmth** drains in the cold and wet. Fire, clothing (fur-lined gear made from pelts) and shelter restore it. Survival stays *light*: food is abstracted into rations, and there is no hunger meter micromanagement.
- **Death (default):** you wake up in Ravnholm days later, rescued by an NPC hunter. You have lost what you carried and owe the healer money. *Permadeath* is optional.

### 7.13 Camping

Multi-day hunts need a camp. A fire gives warmth and lets you process and smoke meat, but its light and smoke scare game and carry your scent. Sleeping skips time. Camps are also where you write up the day's findings.

---

## 8. The living world

### 8.1 Ecology

Each region holds **populations** of every species, split into juveniles and adults with an average body condition. Once a game day they:

- **eat** from real food supplies (grass, browse, bark, berries, carrion) that regrow with season and weather and are *hidden under deep snow*;
- **get eaten.** Predators take prey in proportion to how common and how vulnerable it is. Weak deer in deep snow are easy prey. When wild prey runs short, **livestock** at the farm edge starts to look attractive;
- **breed** in a seasonal birth pulse, sized by the mothers' condition;
- **die** of starvation, cold, disease, age, predators and hunters;
- **migrate** to neighbouring regions when food is short, predation is high or hunting pressure is heavy. Predators follow prey. Small numbers trickle in from the wider wilderness beyond the valley, so a species you wipe out in Ulvdalen can slowly return.

When you enter a region, those numbers turn into **individual animals** with home ranges, bed sites, feeding spots, water and game trails. Their past day or two is simulated quickly, so the tracks you find on arrival are real. See the [Technical Plan](TECHNICAL_PLAN.md) for how this works.

**Connections the player can discover, among others:**

- Deep snow weakens deer, feeds wolves and pushes wolves towards the farms when the deer are gone.
- Kill a wolf pack's leader and the pack may split into smaller, desperate groups, which means *more* livestock raids.
- Beaver dams raise water in Svartmyren, which brings more wetland, more medicinal plants and more moose, but also floods the path.
- Carcasses feed foxes, wolverines, ravens and bears. Leaving gut piles changes where scavengers go.
- Overhunt the hares and the foxes and lynx turn to the farms' chickens and lambs.

### 8.2 Weather and seasons

Weather is generated per valley with regional variation (the fell is colder and windier, the mire foggier). It is generated *several days ahead*, so forecasts are genuine predictions whose accuracy depends on your source: the sky, Einar's almanac, the old farmer, or a barometer bought in Järnbro.

| Condition | Effects |
|---|---|
| **Fresh light snow** | Perfect tracking: every print readable and precisely dated. You leave obvious tracks too |
| **Deep snow** | Deer exhausted and easy prey, so wolves grow fat. You need snowshoes. Sleds make hauling easy |
| **Snow crust** | Loud walking. Wolves run on top of it; deer break through |
| **Rain** | Erases prints over hours, washes away scent (yours too), makes leaves quiet, sends animals to their beds, raises the river |
| **Thaw / spring melt** | Floods, fords close, roads turn to mud (caravans slow down). Mud holds prints superbly |
| **Fog** | Short sight for everyone; sound carries |
| **Strong wind** | Masks noise (you can move faster) but carries scent far; deer are restless |
| **Calm** | Scent pools around you and thermals take over |
| **Heat / drought** | Dry, loud leaves. Meat spoils fast. Animals gather at water, which makes good ambush sites |
| **Cold snap** | Predators get desperate; demand for fur and fuel rises |
| **Full moon + snow** | Bright nights. Wolves and hunters are both active |

**Seasons shape everything.** Autumn has the rut, fattening animals and furs coming into prime. Winter brings snow and hunger, prime pelts and the Midwinter tax. Spring is the hunger gap, the thaw floods, births and hunting restrictions on mothers. Summer has fast spoilage, the lindworm, berries and herbs.

### 8.3 Legends: persistent individuals

Most animals are anonymous. Some become **legends** when something notable happens:

- **Triggers:** surviving a wound; escaping you at close range more than once; killing livestock three or more times; unusual size, age or colour; killing a dog or hunting companion; taking over a pack.
- **Marks** (visible and *readable in sign*): a limp (uneven stride), a missing toe (a distinctive print), a notched ear, a scar, white or black coat.
- **Learned traits:** *wary* (detects from further away), *trap-shy* (avoids trap scent, may learn to spring snares), *nocturnal*, *bold* (comes close to settlements), *cunning* (doubles back, uses water to break its trail).
- **Names** come from the villagers, based on marks and deeds: *Three-Toes*, *the Grey Widow*, *the Nilsson Butcher*.
- **Reputation** grows with every sighting and deed. Rumours get exaggerated ("big as a horse"), bounties rise, and rival hunters come for it.

Each legend gets a journal page with your encounters, known sightings on your map, its distinctive print once you've read it, and the rumours about it. A legend you wounded in autumn may be the one taking sheep in February.

---

## 9. Settlements, economy and people

### 9.1 Goods and production chains

Settlements hold **actual stockpiles**. Craftspeople turn inputs into outputs only when they have the inputs.

```
Hunter/trapper ──raw hides──▶ Tanner (+bark, salt) ──leather──▶ households, harness for caravans
Hunter/trapper ──raw pelts──▶ Furrier / Fur trader ──▶ winter clothing │ export to Saltvik
Hunter/farmer  ──meat───────▶ Butcher (+salt) ──salted & smoked meat──▶ household winter stores
Mine ──ore──▶ Smelter (+charcoal) ──iron──▶ Smith ──▶ traps, arrowheads, tools, nails
Forager/hunter ──herbs, castoreum, venom──▶ Apothecary ──medicine──▶ households (sickness peaks late winter)
Farms ──grain, wool, mutton, livestock losses──▶ households
Caravans ◀──▶ Saltvik: import salt, luxuries, iron when the mine falters; export fur, leather, iron
```

About 20 goods in the first version: venison, hare meat, moose meat, salted meat, raw deer hide, leather, hare/fox/wolf/lynx/beaver/wolverine pelts, castoreum, tallow, antler, herbs, medicine, salt, grain, iron, arrows, traps, charcoal/timber.

### 9.2 Prices

Each merchant sets prices from **how many days of supply they hold** compared with how many they want, and buys from you below that price and sells above it. What follows:

- **You move the market.** Sell ten wolf pelts at once and you'll watch the price fall with every pelt.
- **Seasonal patterns are real and learnable.** Meat is cheap after the autumn slaughter and dear in the late-winter hunger gap. Fur prices climb before winter.
- **Merchants have limited cash.** A merchant who has bought a lot has less money left for you.
- **The coast anchors everything.** If a price drifts too far from Saltvik's, caravans start hauling the difference, so prices spike and crash but never spin out of control.

### 9.3 Trade routes

Caravans move goods between Ravnholm, Järnbro and Saltvik, taking days. Road conditions (mud, snow, **the ford**) slow them down or stop them. *Heavy rain, then the ford floods, then the iron caravan is late, then Ravnholm's iron stock drops, then traps and arrowheads get dearer.* Meanwhile the wet weather makes bog myrtle flourish in Svartmyren and medicine gets cheaper. A player who reads the sky can buy iron goods *before* the flood.

### 9.4 Storage and speculation

Rent a shed or use your cabin to store goods. Salted meat and cured pelts keep; fresh meat does not. Buying low and selling high, including hauling goods between the settlements yourself, is a legitimate way to play. It is bounded by your carrying capacity, the merchants' cash and the coast.

### 9.5 Contracts and cases

Contracts come from **real needs** of real people:

| Type | Source in the simulation | Example |
|---|---|---|
| **Predator problem** | A farmer's livestock losses | "25 daler for the wolf taking my ewes" |
| **Supply order** | A craftsperson's stock running low | Tanner: "10 raw deer hides within 7 days" |
| **Cull** | Crop damage from overabundant deer | Council: "Remove 6 roe deer from Hagmarken" |
| **Specimen** | The apothecary's or a collector's needs | "Castoreum", "lindworm venom", "a white winter hare pelt" |
| **Scouting** | A trader's or the council's uncertainty | "Is the ford passable? Report within 2 days" |
| **Search** | An NPC hunter who hasn't come back | Follow their trail and find out what happened |

**Cases.** When you take a contract, the journal opens a *case* page. It collects the signs you read in the area and time window, lets you mark suspects and keeps the facts separate from the rumours.

**People can be wrong.** NPCs form *beliefs* from what they saw, and they read sign badly. The farmer who posts "the wolf" may be losing sheep to a lynx, a stray dog or something from the mire. Contracts pay on **proof** (the pelt of the named culprit) or on **outcome** (no more losses for 14 days). Kill the wrong animal and you may get paid, but when the losses continue, your reputation pays for it.

**Payment is economically coherent.** A bounty is worth what the problem is costing the person paying: roughly the expected losses, limited by their savings.

### 9.6 NPC hunters

Three rivals in the first version, each with skills, preferences, risk tolerance and their own (imperfect) knowledge:

- **Sigrid Halvorsdotter.** A careful, skilled trapper who specialises in lynx and fox. Honest, and a potential ally who might split a bounty with you.
- **The Brandt brothers.** Greedy, loud and prone to overhunting. They flood the market with pelts, and they may lay illegal poison bait that kills ravens, foxes and someone's dog, which becomes a village scandal.
- **Old Mattias.** Retired, and always in the tavern. The valley's best source of lore. He teaches knowledge for a fee or a bottle.

They pick contracts by expected value, travel, hunt (usually abstractly, and physically when you're in the same region, where you can meet them and find their boot prints and traps), sell (moving prices) and get hurt. When a bounty is big, *everyone* goes after it, and the wolf-pelt price crashes.

### 9.7 Rumours and information

Information is a resource, and it has an **age**, a **source** and a **reliability**.

- **The tavern** is where news spreads. Notable events in the simulation (a kill, a flood, a sighting) spread from person to person. Each retelling can blur the details: numbers grow, the species gets confused, the place gets vague. A drink loosens tongues.
- **"Ask why…"** Any NPC can explain a price, a shortage or a contract *as far as they know* by following the simulation's real chain of causes up to the limit of their knowledge. The merchant knows the iron caravan is late. The caravan master knows *why*.
- **Selling information.** A dated scouting report on the ford is worth money to the caravan master. Your population estimate is worth something to the council.
- **Price knowledge is personal.** Your ledger records only prices you've *seen or heard*, with gaps where you weren't there.

### 9.8 Reputation

Clean kills, wasting little, delivering on time and solving cases correctly all raise your standing, which brings better contracts, better prices and people who tell you more. Sloppy, wasteful or wrong work lowers it. *Hunting laws* (seasons and quotas set by the council from reported populations, and a game warden) are on the post-v0.1 list.

---

## 10. Progression and the journal

### 10.1 What gets better

| Track | How you gain it | What it changes |
|---|---|---|
| **Species knowledge** (per species) | Observing behaviour, reading its signs, confirming readings, butchering | Identification, weight and age estimates, anatomy outlines on the shot inset, diet and habitat notes, activity patterns |
| **Sign literacy** (per sign type) | Reading and confirming prints, scat, blood, beds… | How much a reading reveals, and how precisely |
| **Regional knowledge** | Exploring, discovering game trails, dens, crossings and water | Your hand-drawn map fills in. Named places become travel targets. Trails show in the field once found |
| **Weather lore** | Comparing forecasts with the weather that actually came, learning thermals | Better forecasts from reading the sky |
| **Market knowledge** | Seeing prices, asking why | Ledger charts; understanding seasonal patterns |
| **Hands** (light skills) | Practice | Skinning quality, trap-setting speed, bow steadiness (small effects only) |
| **Gear** | Crafting and buying | New *options* (a sled, snowshoes, a white smock, a spyglass, iron traps, calls), not bigger numbers |
| **Reputation** | Deeds | Access to contracts and information, and prices |

Knowledge can also be **bought or taught**: Old Mattias, books at Järnbro, and Einar's journal (which is sometimes wrong).

### 10.2 The journal

The journal is the UI centrepiece and looks like a real field notebook:

- **Cases:** open contracts with evidence, suspects and deadlines.
- **Bestiary:** a page per species that fills with what you've *learned*, including sketches of prints you've read.
- **Map:** your own cartography, with pins, trails, dens, kill sites, legend sightings and free-text notes.
- **Ledger:** prices you've witnessed, as hand-drawn charts.
- **Almanac:** weather notes, forecasts compared with actual weather, and moon phases.
- **Rumours and chronicle:** what you've heard (with source and date) and what you've seen.
- **Legends:** a page per named animal.

Auto-notes are written in a "handwritten" voice with honest uncertainty ("tracks by the ford, wolf? 2–3 animals?"). The player can add their own notes anywhere.

---

## 11. Creatures (first version and beyond)

| Species | Niche | Behaviour to learn | Products | Version |
|---|---|---|---|---|
| **Mountain hare** | Small herbivore | Keeps to runs, white in winter, runs in loops | Meat, pelt (white winter pelts prized) | M1 |
| **Roe deer** | Browser | Active at dawn and dusk, beds in thickets, alarm bark | Venison, hide | M1 |
| **Red fox** | Small predator and scavenger | Mousing leaps in snow, marks prominent spots, raids hen houses | Pelt | M2 |
| **Wolf** | Pack predator | Territorial packs, dusk howls, travel far; livestock when desperate | Pelt, bounties | M2 |
| **Lynx** | Stalker | Solitary and shy, caches kills under snow or needles, returns to them | Very valuable pelt | M5 |
| **Moose** | Large browser | Wetlands, bark stripping, autumn rut, dangerous cows in spring | About 200 kg of meat, hide, antler | M5 |
| **Brown bear** | Omnivore | Hibernates from late autumn to spring, eats berries and carrion, takes moose calves | Fat/tallow, meat, pelt | M5 |
| **Wolverine** | Scavenger | Tireless, raids trap lines and caches | Premium pelt | M5 |
| **Beaver** | Wetland engineer | Dams raise the water table and reshape the mire | Premium pelt, castoreum (medicine) | M6 |
| **Lindworm** *(lindorm)* | Monster: wetland ambush predator | Cold-blooded, so torpid in the cold. Basks on warm rocks and hibernates in winter. Eats beaver, moose and livestock. Leaves drag marks, shed skins and a sulphur smell | Scales, venom (medicine *and* poison), a trophy nobody believes | M6 |
| **Raven** | Ecological signal | Gathers at carcasses | *Information* | M2 |
| **Sheep, cattle** | Livestock | Owned by farmers; guarded in winter | Farmers' income, predator targets | M3 |
| **Skvader** | Legendary oddity | A hare with a grouse's wings. Does it even exist? A collector in Järnbro pays a fortune. Beware of stitched-together fakes | ??? | Stretch |

---

## 12. Story targets

These are stories the systems **must be able to produce without scripts**. They double as design tests (see the roadmap).

1. **The wrong wolf.** You collect the wolf bounty, but the losses continue, because it was a lynx all along.
2. **The pelt crash.** A big bounty draws everyone out. You hold your pelts until the Brandts have sold theirs, then sell after the price recovers.
3. **Three-Toes.** A wolf you wounded in autumn returns in February: warier, nocturnal, recognisable by its print, and with a bounty on its head.
4. **The flooded ford.** You read a coming storm, buy iron traps before the ford floods, and sell them at double the price a week later.
5. **The empty forest.** You overhunt Granåsen's roe deer, the lynx move to the farms, and a new case appears.
6. **The trap-line thief.** A wolverine starts raiding your traps. You now have to hunt the thing that's robbing you.
7. **Einar's last trail.** On the fell, under old snow, lie a rusted foothold trap, a broken bow and very large tracks leading to the mire. The mystery is assembled from placed *initial conditions* plus the simulation. It is not a cutscene.

---

## 13. Onboarding: the first hour

- **Einar's journal** is the tutorial voice. Early entries walk you through scanning, reading a print, setting a snare on a hare run, the wind, and where the tanner is.
- **The start is seeded, not scripted.** The world begins in a chosen state: late autumn, a healthy hare population in Hagmarken, a lynx near the Nilsson farm, a wolf pack in Kallfjället, fur prices rising. The simulation takes it from there.
- **Gentle first stakes.** A hare snare line gives you small, safe income. The first case comes within the first game day or two.
- Context tips are written as journal marginalia, never as floating arrows.

---

## 14. Presentation

- **Art direction (default):** a top-down, painterly-flat vector style with ink linework and a muted Nordic palette (spruce green, peat brown, birch white, snow blue, rust). **Readability comes first.** Wind, signs, animal awareness and sound direction must always be legible. The prototype uses simple shapes, and art arrives in M7.
- **Vision:** you see only what's in your line of sight. Everything else shows as remembered terrain. Sounds appear as direction arcs with uncertainty.
- **UI:** notebook paper, handwritten-style headings, ink sketches of prints.
- **Audio is gameplay:** alarm calls, the silence when a predator is near, howls (count them), twig snaps, rain masking your steps, the crunch of snow crust.

---

## 15. Difficulty and accessibility

- **Presets** such as *Forgiving*, *Standard* and *Harsh* adjust the death penalty, spoilage speed, how forgiving animals are, and "assisted reading" (extra hints on sign cards).
- Pause anytime (the journal pauses). Remappable keys. Colour-blind-safe highlights. Adjustable time scale.
- Every critical cue is shown both visually and aurally.

---

## 16. Default decisions (change any of these)

You left the gameplay up to me, so these are the calls I've made. Each can be reversed cheaply now and expensively later.

| Decision | Default | Alternative |
|---|---|---|
| Setting | Fictional Nordic frontier with grounded folklore creatures | Generic fantasy, or purely realistic with no monsters |
| Monsters | Ecological animals (the lindworm has a niche, not magic) | Overtly magical creatures |
| Weapons | Bow, crossbow, spear; rare, loud flintlock | No firearms, or firearms common |
| Death | Rescued, with a loss of goods and time; permadeath optional | Permadeath by default |
| Art | Painterly-flat vector | Pixel art |
| Survival depth | Light (warmth, stamina, injury; food abstracted) | Full survival needs |
| Settlements | Illustrated hubs, not walkable | Walkable towns |
