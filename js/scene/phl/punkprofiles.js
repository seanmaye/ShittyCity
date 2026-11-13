// Made-up lives for the punks at the Railyard Bowl's Alvin and the Chipmunks show (concert.js).
// Built like the detasseling crew's profiles (jsh/crewprofiles.js): a seeded name, sex, age, height,
// weight and a short biography with {he} {his} {is} ... filled in, plus a punk name, what they have
// on tonight and what they're on tonight. Everyone here is fictional, and so are their bands.

const FEMALE = ['Dana', 'Nicole', 'Megan', 'Tara', 'Krista', 'Jess', 'Colleen', 'Amber', 'Lauren', 'Brianna', 'Kayla', 'Gina', 'Deirdre', 'Shannon', 'Alexis', 'Maria', 'Rosa', 'Tiana'];
const MALE = ['Kevin', 'Sean', 'Mike', 'Danny', 'Joey', 'Ryan', 'Brendan', 'Anthony', 'Patrick', 'Marcus', 'Tyler', 'Eddie', 'Vinny', 'Chris', 'Luis', 'Dante', 'Kyle', 'Tommy'];
const NEUTRAL = ['Sam', 'Alex', 'Jordan', 'Casey', 'Quinn', 'Rowan', 'Avery', 'Jules'];
const LAST = ['Dougherty', 'McBride', 'Kowalski', 'DiNardo', 'Sullivan', 'Rivera', 'Brennan', 'Nguyen', 'Kozlowski', 'Fitzpatrick', 'Mancuso', 'Haggerty', 'Walsh', 'Pizzaro', 'Lukens', 'Gallagher', 'Santiago', 'Szymanski', 'Costello', 'McGonigal', 'Boyle', 'Yoon', 'Washington', 'Palumbo'];
const PUNK = ['Rat', 'Sid', 'Gutter', 'Spike', 'Scab', 'Trash', 'Bones', 'Riot', 'Vomit', 'Dirtbag', 'Crusty', 'Wooder', 'Jawn', 'Chaos', 'Stitches', 'Mange', 'Grime', 'Septic', 'Lockjaw', 'Static', 'Tetanus', 'Roach', 'Pigeon', 'Squeegee'];
const HOODS = ['Fishtown', 'Kensington', 'West Philly', 'South Philly', 'Port Richmond', 'Frankford', 'Northern Liberties', 'Point Breeze', 'Manayunk', 'Bella Vista', 'Mayfair', 'Germantown', 'Grays Ferry', 'Spring Garden', 'Olney', 'Pennsport'];
const HOUSE = ['a punk house on Frankford Ave with nine roommates and one working outlet', 'a basement in West Philly that floods every time it rains', 'a rowhome in {hood} {he} inherited from {his} grandmother, with the plastic still on the couch', 'a warehouse loft in {hood} that is not legally an apartment', '{his} mom’s place in {hood}, in the room {he} has had since third grade', 'a squat under the El in Kensington that {he} call{s} “the compound”', 'a two-bedroom over a laundromat in {hood} with a pit bull named Pierogi', 'a co-op in West Philly where the chore wheel is a source of ongoing conflict'];
const JOB = ['work{s} the grill at a bar on Frankford Ave', '{is} a bike messenger and {has} been doored on Chestnut St four times', '{is} a tattoo apprentice who {has} mostly tattooed {his} own legs', 'work{s} the overnight shift at a Wawa on Delaware Ave', 'sell{s} records on South St and judge{s} everyone who buys one', 'work{s} the door at a basement venue and {has} turned away a city councilman', '{is} a line cook at a cheesesteak place and won’t say which one', 'drive{s} a SEPTA bus and {does} not want to talk about it', '{was} a painting major at UArts until the school shut down, and now paint{s} murals for cash', 'restore{s} old motorcycles in a garage in Port Richmond', '{is} a pharmacy tech, which nobody here finds reassuring', 'dumpster-dive{s} for a living and call{s} it “sourcing”'];
const BANDS = ['Septic Septa', 'The Wooder Ice Riot', 'Gritty Kitty', 'Jawn Doe and the Nobodies', 'Schuylkill Punch', 'Abolish the Parking Authority', 'The Soft Pretzels', 'Pothole Christ', 'Kensington Kollapse', 'The Water Ice Cold War', 'Dead Rowhomes', 'The Scrapple Cartel', 'Broad Street Brawlers', 'Spit Valve', 'The Shore Traffic'];
const BANDJOB = ['play{s} bass in {band}, which has had nine drummers', 'scream{s} for {band}, who have played every basement in West Philly', 'play{s} drums in {band} and {has} broken eleven snare heads this year', 'play{s} guitar in {band}, whose one recording is on a cassette', '{is} in {band}, a band that has never finished a song in rehearsal', 'used to be in {band} until a fistfight over the band name'];
const WHY = ['came ironically and has now seen the Chipmunks fourteen times', 'got into the Chipmunks from a punk cover of their Christmas song and never came back', 'lost a bet and {has} been at every show since', 'say{s} Alvin is the most punk rock figure of the twentieth century and will fight you about it', '{has} a Theodore tattoo on {his} calf, done at a party', 'came for the Chipettes and is crushed whenever they don’t come out', 'hitched from Allentown for this show, which {he} {has} called “the big one” for a month', 'think{s} Simon is the real genius of the band and won’t shut up about his guitar tone', 'got thrown out of the last show for climbing a light tower and snuck back in tonight', 'waited outside the gate since noon to get to the front'];
const HABIT = { puff: '{has} been passing a joint around since the opener', ket: 'keep{s} a vial of ketamine in {his} boot, “for the encore”', huff: 'brought a tube of model glue and a paper bag, a habit from middle school {he} never shook', pill: 'took a pill in the parking lot and {is} waiting for it to kick in', bump: '{has} a baggie of speed and {has} not stopped talking since the doors opened', beer: 'got a twelve-pack of tallboys past security, nobody knows how', cig: 'smoke{s} menthols and will tell you about it', khole: '{is} in a K-hole on the steps and has been since the second song' };
const PET = ['a pet rat named Sid Vicious that rides on {his} shoulder at home', 'three cats named after Philadelphia Flyers enforcers', 'a ferret that has bitten every one of {his} roommates', 'a snake named Gritty', 'no pets, because the landlord found the last one'];
const QUIRK = ['{He} {has} been banned from two Wawas.', '{He} won a hot-dog eating contest on the boardwalk at Wildwood.', '{He} call{s} {his} mom every Sunday without fail.', '{He} still {has} a Phillies 2008 parade ticket stub in {his} wallet.', '{He} once got into an argument with the Rocky statue.', '{He} {is} saving up to go see the Chipettes on tour in Japan.', '{He} {has} never once paid the SEPTA fare.', '{He} brought a tray of {his} aunt’s pizzelles to share.', '{He} cr{ies} at the slow songs and dare{s} anyone to say something.', '{He} knit{s} all of {his} own band patches.'];

// what they have on tonight: these are the outfits concert.js draws
const HAIR = {
  mohawk: c => `a ${c} mohawk`, spikes: c => `${c} liberty spikes`, shaved: () => 'a shaved head', crop: c => `${c} hair cut short with kitchen scissors`,
  long: c => `long ${c} hair`, bunches: c => `${c} hair in two bunches`, beanie: () => 'a black beanie in July',
};
const TOP = { leather: 'a leather jacket', denim: 'a denim jacket covered in patches', army: 'an army surplus jacket', vest: 'a sleeveless denim vest', tee: 'a band tee with the sleeves cut off' };
const PANTS = { black: 'black jeans', plaid: 'red plaid bondage pants', camo: 'camo pants', ripped: 'ripped jeans held together with safety pins', leopard: 'leopard-print leggings' };

/** small seeded random (mulberry32) so a person's life is the same every time */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * The punk number i, who has `look` on (concert.js: hair, hairName, top, pants, studs, collar, shades)
 * and whose thing tonight is `habit` (a key of HABIT). Returns the card's fields.
 */
export function punkProfile(i, look, habit) {
  const r = rng(i * 7919 + 4242), pick = a => a[Math.floor(r() * a.length)], between = (a, b) => a + r() * (b - a);
  const x = r(), sex = x < .45 ? 'Female' : x < .9 ? 'Male' : 'Non-binary', one = sex !== 'Non-binary';
  const hood = pick(HOODS), band = pick(BANDS);
  const fill = t => t.replace(/\{hood\}/g, hood).replace(/\{band\}/g, band)
    .replace(/\{He\}/g, one ? (sex === 'Female' ? 'She' : 'He') : 'They').replace(/\{he\}/g, one ? (sex === 'Female' ? 'she' : 'he') : 'they')
    .replace(/\{his\}/g, one ? (sex === 'Female' ? 'her' : 'his') : 'their').replace(/\{is\}/g, one ? 'is' : 'are').replace(/\{has\}/g, one ? 'has' : 'have').replace(/\{was\}/g, one ? 'was' : 'were').replace(/\{does\}/g, one ? 'does' : 'do')
    .replace(/\{ies\}/g, one ? 'ies' : 'y').replace(/\{es\}/g, one ? 'es' : '').replace(/\{s\}/g, one ? 's' : '');
  const first = pick(sex === 'Female' ? FEMALE : sex === 'Male' ? MALE : NEUTRAL), nick = PUNK[(i * 7 + Math.floor(r() * PUNK.length)) % PUNK.length];
  const name = `${first} “${nick}” ${pick(LAST)}`;
  const age = Math.floor(between(19, 41));
  const height = Math.round((sex === 'Female' ? 163 : sex === 'Male' ? 177 : 170) + (r() + r() + r() - 1.5) * 9);
  const kg = Math.round(between(17.5, 27) * (height / 100) ** 2), lb = Math.round(kg * 2.2046);
  const wear = [HAIR[look.hair](look.hairName), TOP[look.top], PANTS[look.pants]];
  if (look.studs) wear.push('a hundred studs');
  if (look.collar) wear.push('a spiked dog collar');
  if (look.shades) wear.push('sunglasses after dark');
  const outfit = wear.slice(0, -1).join(', ') + ' and ' + wear[wear.length - 1];
  const music = r() < .6 ? fill(pick(BANDJOB)) + '. ' : '';
  const bio = fill(`From ${hood}. {He} live{s} in ${pick(HOUSE)}, and ${pick(JOB)}. `) + (music ? music.replace(/^./, c => c.toUpperCase()) : '')
    + fill(`{He} ${pick(WHY)}. Tonight: ${outfit}. {He} ${HABIT[habit] || HABIT.beer}. {He} {has} ${pick(PET)}. ${pick(QUIRK)}`);
  return { name, nick, sex, age, height, kg, lb, bio, scale: height / 180 };
}
