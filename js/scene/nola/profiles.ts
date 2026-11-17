// Made-up lives for the people on Bourbon Street (frenchquarter.js): a name, sex, age,
// height, weight and a short biography, generated from a seed so each person keeps theirs.
// Everyone here is fictional.
const FEMALE = ['Celeste', 'Yvonne', 'Deshana', 'Marguerite', 'Tiana', 'Renee', 'Imani', 'Sofia', 'Bree', 'Nia', 'Camille', 'Delphine', 'Keisha', 'Anais', 'Rosa', 'Jasmine', 'Etta', 'Lafayette', 'Simone', 'Gloria', 'Priya', 'Mei', 'Fatima', 'Yolanda', 'Carmen', 'Denise', 'Theresa', 'Aaliyah', 'Bridget', 'Lucia'];
const MALE = ['Darnell', 'Tremaine', 'Andre', 'Gus', 'Remy', 'Cedric', 'Malik', 'Joseph', 'Toussaint', 'Elias', 'Marcus', 'Dominic', 'Hector', 'Luis', 'Terrence', 'Reggie', 'Samuel', 'Giovanni', 'Patrick', 'Sean', 'Kevin', 'Omar', 'Carlos', 'Wei', 'Raj', 'Kwame', 'Min-jun', 'Tuan', 'Frank', 'Brian'];
const NEUTRAL = ['Alex', 'Jordan', 'Riley', 'Sam', 'Quinn', 'Avery', 'Rowan', 'Casey'];
const LAST = ['Boudreaux', 'Thibodeaux', 'Landry', 'Baptiste', 'Robichaux', 'Trahan', 'Hebert', 'Courville', 'Roussel', 'Fontenot', 'Dugas', 'Bélanger', 'Johnson', 'Williams', 'Nguyen', 'DiNardo', 'Washington', 'Patel', 'Santiago', 'O’Brien', 'Kowalski', 'Chen', 'Russo', 'Okafor', 'Jackson', 'Lopez', 'Tran', 'Harris', 'Morales', 'Diaz', 'Ali', 'Lee', 'Coleman', 'Petrakis', 'Walsh'];
const HOODS = ['the Bywater', 'the Marigny', 'Tremé', 'the Garden District', 'Uptown', 'Mid-City', 'the Lakefront', 'the French Quarter', 'Gentilly', 'Avondale', 'the Ninth Ward', 'Belle Chasse', 'Metairie', 'the West Bank', 'Bay St. Louis', 'Plaquemine', 'Houma', 'the North Shore'];
const FROM = ['Houston', 'Atlanta', 'Chicago', 'Baton Rouge', 'Lafayette', 'Mexico City', 'Puerto Rico', 'Lagos', 'Ho Chi Minh City', 'Guatemala', 'the Dominican Republic', 'Baltimore', 'Boston', 'Mumbai', 'Dublin', 'Jamaica', 'Seoul', 'Naples', 'Ohio', 'Cleveland', 'the Bayou'];
const STUDY = ['studying nursing at Xavier', 'in {his} second year of engineering at Tulane', 'finishing a music degree at Dillard', 'taking culinary classes at the Culinary Institute', 'studying history at LSU', 'studying illustration at the School of Art'];
const SIDE = ['at a po’boy shop on Decatur', 'busking on Royal Street', 'shelving books at the Public Library', 'at a second-line drum circle'];
const JOBS = ['a trumpet player in a second-line band', 'a bartender at a bar on Bourbon', 'a Cajun chef at a restaurant on Chartres', 'a tour guide for the ghost tours', 'a nurse at Touro', 'a line cook at a po’boy stand', 'a software developer in the CBD', 'a union electrician', 'a fourth-grade teacher in the School District', 'a beignet maker at a café on Royal', 'a saxophonist who plays the clubs on Frenchmen St', 'a real estate agent in the Marigny', 'a graphic designer', 'a firefighter at Engine 28', 'a mail carrier in the Quarter', 'a pharmacist', 'a hairdresser with a chair on Camp Street', 'a sous-chef at a hotel on Canal', 'a court clerk at the courthouse', 'a bike messenger', 'a museum docent at the Cabildo', 'a drum major for a marching band', 'a bartender who knows every song'];
const RETIRED = ['a retired schoolteacher', 'a retired brass-band tuba player', 'a retired nurse', 'a retired New Orleans police sergeant', 'a retired pharmacist', 'a retired ENEL lineman', 'a retired bookkeeper', 'a retired jazz pianist', 'a retired city planner', 'a retired second-line drummer'];
// {he} {his} {is} {has} {was} and {s} (a verb ending) are filled in for each person
const HOBBY = ['play{s} trumpet in a second-line band every Sunday', 'dance{es} in the street on Bourbon every weekend', 'collect{s} vintage jazz records from the Frenchmen St clubs', 'make{s} gumbo from {his} grandmother’s recipe', 'go{es} to the second line on Mardi Gras', 'play{s} saxophone in a club on Frenchmen Street', 'keep{s} a crawfish boil going every summer', 'walk{s} the Garden District looking for old houses', 'sing{es} in a gospel choir in Tremé', 'bake{es} beignets for the whole block', 'fish{es} the Lakefront on Saturdays', 'read{s} poetry at the library in the Marigny', 'collect{s} Mardi Gras throws and beads', 'play{s} drums in a brass band on Royal Street'];
const FAMILY = {
  young: ['live{s} in a shotgun house with two roommates', 'live{s} with a partner and a very loud cat', 'still {has} dinner at {his} parents’ every Sunday', 'just signed a lease on {his} first apartment', 'live{s} alone above a po’boy shop'],
  mid: ['{is} married with two kids in middle school', '{is} raising a daughter alone', 'live{s} with a partner of twelve years', '{is} recently divorced and enjoying the quiet', '{has} three kids and a minivan named Beignet', 'live{s} with {his} elderly mother'],
  old: ['{has} five grandchildren and photos of all of them', '{was} married for 41 years and still wear{s} the ring', 'live{s} with a sister in the house they grew up in', 'moved into a Marigny condo after the kids left', 'walk{s} a dachshund named Frank twice a day'],
};
const DRINKS = ['a café au lait', 'a double espresso', 'a sweet tea', 'a hurricane', 'a Sazerac', 'a cold Abita', 'an iced coffee'];
const BOOKS = ['The Autobiography of André the Giant', 'A Street Named Bloomdale', 'The Neon Bible', 'Invisible Man', 'The Great Gatsby', 'Middlemarch', 'Walden', 'Their Eyes Were Watching God', 'Beloved', 'The Count of Monte Cristo', 'One Hundred Years of Solitude', 'a dog-eared paperback thriller', 'a guidebook to the bayou', 'a book of blues lyrics'];
export const SHOPS = ['po’boy shop', 'beignet café', 'record store', 'bead shop', 'gumbo kitchen', 'bar', 'boutique', 'florist', 'bookshop', 'jeweler', 'gallery', 'bakery', 'tea room', 'hat shop', 'pharmacy', 'cheese shop'];

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
  const origin = r() < .55 ? `Born and raised in ${hood}.` : `Moved to New Orleans from ${pick(FROM)} in ${2026 - Math.round(between(2, Math.min(50, age - 16)))} and settled in ${hood}.`;
  const work = age < 25 ? fill(`${He} {is} ${pick(STUDY)}, and work{s} weekends ${pick(SIDE)}.`)
    : fill(`${He} {is} ${pick(age < 66 ? JOBS : RETIRED)}.`);
  const bio = `${origin} ${work} ${He} ${fill(pick(age < 30 ? FAMILY.young : age < 62 ? FAMILY.mid : FAMILY.old))}, and ${fill(pick(HOBBY))}.`;
  return {
    name, sex, age, height, kg, lb, bio,
    drink: pick(DRINKS), book: pick(BOOKS),
    grey: age > 62 && r() < .8, scale: height / 180,
  };
}

