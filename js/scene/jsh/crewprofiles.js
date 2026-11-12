// Made-up lives for the detasseling crew in Jersey Shore's seed-corn field (detassel.js): four
// teenagers on their summer job and the crew boss who walks behind them. Built like the Walnut St
// profiles (phl/profiles.js: a name, sex, age, height, weight and a short biography from a seed,
// with {he} {his} {is} ... filled in), but with their own lives. Everyone here is fictional.

const FEMALE = ['Kaylee', 'Madison', 'Hailey', 'Brooke', 'Emma', 'Olivia', 'Abby', 'Kylie', 'Morgan', 'Paige', 'Lexi', 'Savannah', 'Chloe', 'Ella', 'Brianna', 'Jenna'];
const MALE = ['Hunter', 'Brayden', 'Cody', 'Logan', 'Mason', 'Wyatt', 'Tyler', 'Dalton', 'Gavin', 'Caleb', 'Austin', 'Colton', 'Ethan', 'Landon', 'Kyle', 'Garrett'];
const NEUTRAL = ['Jordan', 'Riley', 'Taylor', 'Peyton', 'Skyler', 'Dakota'];
// the boss was born around 1970-80
const OLDER = { Female: ['Brenda', 'Tammy', 'Darlene', 'Sherry', 'Lori', 'Kim', 'Trish'], Male: ['Randy', 'Dale', 'Gary', 'Darrell', 'Rick', 'Duane', 'Scott'], 'Non-binary': ['Terry', 'Lee', 'Chris'] };
const LAST = ['Bower', 'Confer', 'Eck', 'Shaffer', 'Stryker', 'Nuss', 'Reeder', 'Brungard', 'Fry', 'Weaver', 'Moyer', 'Kepner', 'Heller', 'Bierly', 'Rupert', 'Lorson', 'Dincher', 'Hackenberg', 'Fenstermacher', 'Snook', 'Yoder', 'Probst', 'Kunes', 'Rider', 'Bartlow', 'Myers'];
const TOWNS = ['Jersey Shore', 'Avis', 'Antes Fort', 'Nippenose', 'Salladasburg', 'Waterville', 'Linden', 'Larrys Creek', 'Woolrich', 'Pine Creek Township', 'Collomsville', 'Torbert'];
const GRADE = { 14: 'going into ninth grade', 15: 'going into tenth grade', 16: 'going into eleventh grade', 17: 'about to be a senior' };
// {he} {his} {is} {has} {was} and {s} (a verb ending) are filled in for each person
const WHY = ['{is} saving for a used pickup, any pickup, as long as it runs', 'cracked {his} phone in June and {is} paying for the new one', 'wants to put the whole summer’s pay toward Penn College in Williamsport', '{is} saving for a compound bow before archery season', '{is} buying a market steer to show at the Lycoming County Fair next year', '{is} saving for the FFA trip to the national convention', 'promised {his} mom half of every paycheck for the electric bill', '{is} saving for a dirt bike {he} has already picked out', 'wants enough for a laptop for school without asking anyone'];
const YEARS = ['This is {his} first summer detasseling, and {his} hands show it', 'This is {his} second summer in the corn; {he} tape{s} {his} fingers now', 'This is {his} third summer on a crew, and {he} can spot a tassel two rows over', 'This is {his} first summer, and {he} didn’t believe anyone about the dew'];
const FAMILY = ['live{s} with {his} grandparents on a dairy farm off Route 44', '{has} three younger brothers and share{s} a room with two of them', 'live{s} with {his} dad, who drives truck for a gas company in the Marcellus', 'live{s} with {his} mom, who works nights at the hospital in Williamsport', 'live{s} above a shop on Allegheny Street with {his} mom and a three-legged cat', '{has} an older sister who detasseled this same island ten summers ago and still talks about it', '{is} the youngest of six and the first one to get a summer job before fifteen', 'live{s} in a farmhouse in Nippenose Valley with no cell signal past the barn'];
const HOBBY = ['fish{es} Pine Creek for trout before school', 'ride{s} the Pine Creek Rail Trail to Waterville and back', 'run{s} cross-country for the Bulldogs', 'wrestle{s} at 132 pounds and is cutting weight in the corn', 'play{s} trumpet in the marching band', 'volunteer{s} at the Little League World Series every August', 'go{es} tubing on Pine Creek every Sunday the water is up', 'show{s} rabbits at the county fair', 'hunt{s} deer with {his} grandfather on the first day of buck season', 'draw{s} comics in the margins of every notebook', 'play{s} travel softball all over the state', 'rebuild{s} small engines in the garage'];
const LUNCH = ['a cooler of bologna sandwiches', 'two cans of Mountain Dew and a Tastykake', 'a gallon jug of frozen water, slowly melting', 'cold pizza wrapped in foil', 'a peanut-butter-and-jelly sandwich, squashed'];

/** small seeded random (mulberry32) so a person's life is the same every time */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function person(r, ageLo, ageHi, names = null) {
  const pick = a => a[Math.floor(r() * a.length)], between = (a, b) => a + r() * (b - a);
  const x = r(), sex = x < .49 ? 'Female' : x < .97 ? 'Male' : 'Non-binary', one = sex !== 'Non-binary';
  const fill = t => t.replace(/\{he\}/g, one ? (sex === 'Female' ? 'she' : 'he') : 'they').replace(/\{his\}/g, one ? (sex === 'Female' ? 'her' : 'his') : 'their')
    .replace(/\{is\}/g, one ? 'is' : 'are').replace(/\{has\}/g, one ? 'has' : 'have').replace(/\{was\}/g, one ? 'was' : 'were')
    .replace(/\{es\}/g, one ? 'es' : '').replace(/\{s\}/g, one ? 's' : '');
  const name = pick(names ? names[sex] : sex === 'Female' ? FEMALE : sex === 'Male' ? MALE : NEUTRAL) + ' ' + pick(LAST);
  const age = Math.floor(between(ageLo, ageHi + 1));
  const grow = age < 17 ? (17 - age) * (sex === 'Female' ? 1.2 : 3) : 0;
  const height = Math.round((sex === 'Female' ? 163 : sex === 'Male' ? 176 : 170) - grow + (r() + r() + r() - 1.5) * 8);
  const bmi = between(18.5, 27), kg = Math.round(bmi * (height / 100) ** 2), lb = Math.round(kg * 2.2046);
  const He = fill('{he}').replace(/^./, c => c.toUpperCase());
  return { r, pick, between, fill, sex, name, age, height, kg, lb, He, scale: height / 180 };
}

/** one of the four detasselers (i 0..3) */
export function detasselerProfile(i) {
  const r = rng(i * 4243 + 911), p = person(r, 14, 17);
  const { pick, fill, He } = p, town = pick(TOWNS), pay = (11 + Math.floor(r() * 5) * .5).toFixed(2);
  const school = town === 'Woolrich' || town === 'Linden' ? (r() < .5 ? 'at Jersey Shore Area High School' : 'and homeschooled') : 'at Jersey Shore Area High School';
  const bio = `From ${town}, ${fill(GRADE[p.age] || 'going into tenth grade')} ${school}. ${He} ${fill(pick(WHY))}, at $${pay} an hour. `
    + `${fill(pick(YEARS))}. ${He} ${fill(pick(FAMILY))}, and ${fill(pick(HOBBY))}. Packed for lunch: ${pick(LUNCH)}.`;
  return { name: p.name, sex: p.sex, age: p.age, height: p.height, kg: p.kg, lb: p.lb, bio, scale: p.scale, grey: false, boss: false };
}

/** the crew boss: walks behind the crew, carries a pistol on the belt, never smiles */
export function bossProfile() {
  const r = rng(31337), p = person(r, 44, 58, OLDER);
  const { pick, fill, He } = p;
  const him = p.sex === 'Female' ? 'her' : p.sex === 'Male' ? 'him' : 'them';
  const last = pick(['{He} live{s} alone outside Antes Fort with a beagle that doesn’t like {him} either.',
    '{He} drive{s} a pickup that used to have a bumper sticker for every crew {he} ran, all scraped off.',
    '{He} eat{s} lunch in the truck with the air conditioning on while the crew sits in the dirt.']);
  const bio = fill(`{He} {has} run detasseling crews for the seed company for ${Math.round(p.between(14, 23))} summers and {has} never once said thank you. `
    + '{He} dock{s} a dollar from the pay of anyone who leaves a tassel behind, and call{s} every crew “the worst one yet.” '
    + '{He} wear{s} a pistol on {his} belt “for the rattlesnakes”; nobody has seen a rattlesnake on the island. ' + last).replace(/\{He\}/g, He).replace(/\{him\}/g, him);
  return { name: p.name, sex: p.sex, age: p.age, height: p.height + 4, kg: p.kg + 14, lb: Math.round((p.kg + 14) * 2.2046), bio, scale: (p.height + 4) / 180, grey: r() < .6, boss: true };
}
