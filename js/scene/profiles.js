// Made-up lives for the people on the Walnut St promenade (pedestrians.js): a name, sex, age,
// height, weight and a short biography, generated from a seed so each person keeps theirs.
// Everyone here is fictional.

const FEMALE = ['Maria', 'Aaliyah', 'Grace', 'Keisha', 'Mei', 'Sofia', 'Erin', 'Fatima', 'Rosa', 'Danielle', 'Priya', 'Colleen', 'Tamika', 'Anh', 'Joanna', 'Bridget', 'Imani', 'Lucia', 'Hannah', 'Yolanda', 'Nadia', 'Shannon', 'Gloria', 'Sun-hee', 'Theresa', 'Jasmine', 'Ruth', 'Carmen', 'Emily', 'Denise'];
const MALE = ['James', 'Malik', 'Anthony', 'Wei', 'Carlos', 'Patrick', 'Darnell', 'Omar', 'Joseph', 'Tuan', 'Kevin', 'Andre', 'Sean', 'Raj', 'Vincent', 'Marcus', 'Luis', 'Michael', 'Kwame', 'Dominic', 'Hector', 'Brian', 'Jamal', 'Frank', 'Min-jun', 'Terrence', 'Samuel', 'Giovanni', 'Eli', 'Reggie'];
const NEUTRAL = ['Alex', 'Jordan', 'Riley', 'Sam', 'Quinn', 'Avery', 'Rowan', 'Casey'];
const LAST = ['Rivera', 'Johnson', 'Nguyen', 'DiNardo', 'Williams', 'Kowalski', 'Chen', 'O’Brien', 'Washington', 'Patel', 'Santiago', 'McGinley', 'Brown', 'Kim', 'Russo', 'Okafor', 'Jackson', 'Murphy', 'Lopez', 'Tran', 'Greenberg', 'Harris', 'Morales', 'Sullivan', 'Mitchell', 'Ortiz', 'Castellano', 'Robinson', 'Ali', 'Fitzpatrick', 'Lee', 'Coleman', 'Petrakis', 'Diaz', 'Walsh'];
const HOODS = ['Fishtown', 'South Philly', 'Germantown', 'Manayunk', 'Fairmount', 'Graduate Hospital', 'Kensington', 'Point Breeze', 'West Philly', 'Mt. Airy', 'Northern Liberties', 'Queen Village', 'Chestnut Hill', 'Roxborough', 'Port Richmond', 'Overbrook', 'Passyunk Square', 'Brewerytown', 'East Falls', 'Olney', 'Mayfair', 'Society Hill', 'Spring Garden', 'Bella Vista', 'Cobbs Creek'];
const FROM = ['Pittsburgh', 'Puerto Rico', 'Lagos', 'Ho Chi Minh City', 'Baltimore', 'Boston', 'Mumbai', 'Atlanta', 'Dublin', 'the Dominican Republic', 'Scranton', 'Seoul', 'Naples', 'Ohio', 'Jamaica', 'Guangzhou', 'New Jersey', 'Kyiv', 'Mexico City', 'Cleveland'];
const STUDY = ['studying nursing at Temple', 'in {his} second year of engineering at Drexel', 'finishing a history degree at Penn', 'taking accounting classes at the Community College of Philadelphia', 'studying physical therapy at Jefferson', 'studying illustration at Moore College of Art & Design'];
const SIDE = ['at a bubble-tea shop', 'shelving books at the Free Library', 'delivering for a food app', 'at a climbing gym'];
const JOBS = ['a nurse at Pennsylvania Hospital', 'a SEPTA bus operator on the 42', 'a line cook at a BYOB in East Passyunk', 'a software developer at a Center City startup', 'a union electrician (IBEW Local 98)', 'a fourth-grade teacher in the School District', 'a paralegal on Market Street', 'a barista two blocks from here', 'an architect restoring old rowhouses', 'an accountant who dreads April', 'a physical therapist', 'a Wawa shift manager', 'a session bassist', 'a social worker', 'a real estate agent', 'a graphic designer', 'a firefighter at Engine 43', 'a mail carrier in Rittenhouse', 'a pharmacist at CHOP', 'a hairdresser with a chair on Sansom Street', 'a tour guide at Independence Hall', 'a sous-chef at a hotel on Broad', 'a court stenographer at City Hall', 'a bike courier', 'a museum educator at the Art Museum'];
const RETIRED = ['a retired schoolteacher', 'a retired Navy Yard machinist', 'a retired nurse', 'a retired Philadelphia police sergeant', 'a retired pharmacist', 'a retired PECO lineman', 'a retired bookkeeper', 'a retired jazz pianist', 'a retired city planner'];
// {he} {his} {is} {has} {was} and {s} (a verb ending) are filled in for each person
const HOBBY = ['{has} had Eagles season tickets since 2004', 'row{s} at dawn on the Schuylkill with a Boathouse Row club', 'march{es} with a Mummers string band every New Year’s Day', 'keep{s} a plot in a community garden', 'go{es} salsa dancing on Thursdays', 'play{s} speed chess in Rittenhouse Square', 'collect{s} soul records from the Philly International era', 'run{s} the Broad Street Run every May', 'bake{s} sourdough and give{s} most of it away', 'volunteer{s} at the Free Library on Saturdays', 'paint{s} watercolors of the Wissahickon', 'coach{es} a Little League team', '{is} learning Italian before a trip to Abruzzo', 'never miss{es} a First Friday in Old City', 'do{es} the Sunday crossword in pen', '{is} restoring a 1972 Schwinn', 'sing{s} in a church choir in Germantown', 'birdwatch{es} at the John Heinz refuge', 'know{s} every food truck at Love Park by name'];
const FAMILY = {
  young: ['share{s} a rowhouse with two roommates and a very loud cat', 'live{s} with a partner and a rescue greyhound', 'still {has} dinner at {his} parents’ every Sunday', 'just signed a lease on {his} first apartment', 'live{s} alone above a corner store'],
  mid: ['{is} married with two kids in middle school', '{is} raising a daughter alone', 'live{s} with a partner of twelve years', '{is} recently divorced and enjoying the quiet', '{has} three kids and a minivan named Gus', 'live{s} with {his} elderly mother'],
  old: ['{has} five grandchildren and photos of all of them', '{was} married for 41 years and still wear{s} the ring', 'live{s} with a sister in the house they grew up in', 'moved into a Center City condo after the kids left', 'walk{s} a dachshund named Frank twice a day'],
};
const DRINKS = ['an oat-milk latte', 'a double espresso', 'a cappuccino', 'black drip coffee', 'an iced coffee', 'a cortado', 'a chai latte'];
const BOOKS = ['Moby-Dick', 'Pride and Prejudice', 'The Autobiography of Benjamin Franklin', 'Little Women', 'The Great Gatsby', 'Middlemarch', 'Invisible Man', 'The Age of Innocence', 'Leaves of Grass', 'Frankenstein', 'Walden', 'Their Eyes Were Watching God', 'Beloved', 'The Count of Monte Cristo', 'One Hundred Years of Solitude', 'a dog-eared paperback thriller', 'a guidebook to Italy', 'a book of New Yorker cartoons'];
export const SHOPS = ['bakery', 'bookshop', 'florist', 'boutique', 'record store', 'cheese shop', 'gelateria', 'shoe store', 'pharmacy', 'wine bar', 'stationery shop', 'chocolatier', 'barber', 'gallery', 'bike shop', 'tea room', 'hat shop', 'jeweler'];

/** small seeded random (mulberry32) so a person's life is the same every time */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function makeProfile(i) {
  const r = rng(i * 7919 + 17), pick = a => a[Math.floor(r() * a.length)], between = (a, b) => a + r() * (b - a);
  const x = r(), sex = x < .485 ? 'Female' : x < .97 ? 'Male' : 'Non-binary';
  const one = sex !== 'Non-binary';   // they: plural verbs
  const fill = t => t.replace(/\{he\}/g, one ? (sex === 'Female' ? 'she' : 'he') : 'they').replace(/\{his\}/g, one ? (sex === 'Female' ? 'her' : 'his') : 'their')
    .replace(/\{is\}/g, one ? 'is' : 'are').replace(/\{has\}/g, one ? 'has' : 'have').replace(/\{was\}/g, one ? 'was' : 'were')
    .replace(/\{es\}/g, one ? 'es' : '').replace(/\{s\}/g, one ? 's' : '');
  const first = pick(sex === 'Female' ? FEMALE : sex === 'Male' ? MALE : NEUTRAL), name = first + ' ' + pick(LAST);
  // ages: mostly working age, some students and retirees
  const u = r(), age = Math.round(u < .18 ? between(18, 25) : u < .82 ? between(26, 64) : between(65, 86));
  const height = Math.round((sex === 'Female' ? 163 : sex === 'Male' ? 176 : 170) + (r() + r() + r() - 1.5) * 9 - (age > 70 ? 2 : 0));
  const bmi = between(19, 32), kg = Math.round(bmi * (height / 100) ** 2), lb = Math.round(kg * 2.2046);
  const hood = pick(HOODS), He = fill('{he}').replace(/^./, c => c.toUpperCase());
  const origin = r() < .55 ? `Born and raised in ${hood}.` : `Moved to Philly from ${pick(FROM)} in ${2026 - Math.round(between(2, Math.min(50, age - 16)))} and settled in ${hood}.`;
  const work = age < 25 ? fill(`${He} {is} ${pick(STUDY)}, and work{s} weekends ${pick(SIDE)}.`)
    : fill(`${He} {is} ${pick(age < 66 ? JOBS : RETIRED)}.`);
  const bio = `${origin} ${work} ${He} ${fill(pick(age < 30 ? FAMILY.young : age < 62 ? FAMILY.mid : FAMILY.old))}, and ${fill(pick(HOBBY))}.`;
  return {
    name, sex, age, height, kg, lb, bio,
    drink: pick(DRINKS), book: pick(BOOKS),
    grey: age > 62 && r() < .8, scale: height / 180,
  };
}
