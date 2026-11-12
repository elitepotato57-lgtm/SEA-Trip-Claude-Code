/* ============================================================
   15-estimate: what kind of food a place serves, and a typical price when nobody has published one.
   OpenStreetMap has no prices, so these are ESTIMATES from rules: the kind of place, its cuisine tag,
   its brand, and words in its English or Thai name. They are always shown labelled "est." and never
   replace a researched price. Typical spend: food per person, activities per person (entry or a session),
   stays per night. Change the numbers here; tests/unit.js checks the rules.
   ============================================================ */

/* ---------- food type ---------- */
// [label, OSM cuisine values, words in the name (English or Thai)]
const FOOD_TYPES = [
  ["BBQ & hotpot",      /^(barbecue|bbq|grill|hot ?pot|shabu|suki|sukiyaki|korean barbecue|yakiniku|thai bbq)$/,  /mookata|moo kata|moo krata|หมูกระทะ|ชาบู|shabu|สุกี้|suki|hot ?pot|ปิ้งย่าง|bbq|barbecue|yakiniku|บาร์บีคิว|เนื้อย่าง/],
  ["Noodles",           /^(noodles?|ramen|pho|udon|soba|khao soi)$/,                                               /noodle|ก๋วยเตี๋ยว|ก๋วยจั๊บ|บะหมี่|ราเมน|ramen|\bpho\b|เฝอ|ข้าวซอย|khao ?soi|เย็นตาโฟ|udon|เส้น/],
  ["Rice dishes",       /^(rice|khao man gai|chicken rice)$/,                                                      /ข้าวมันไก่|ข้าวขาหมู|ข้าวหมูแดง|ข้าวหมูกรอบ|ข้าวแกง|ข้าวผัด|ข้าวต้ม|khao man|chicken rice|ข้าวราด|โจ๊ก|jok/],
  ["Isaan & som tam",   /^(isaan|isan|lao|laotian|som tam|papaya salad)$/,                                         /ส้มตำ|somtam|som ?tam|อีสาน|isaan|isan|ลาบ|ไก่ย่าง|น้ำตก|แจ่วฮ้อน/],
  ["Seafood",           /^(seafood|fish|fish and chips|oyster|crab)$/,                                             /seafood|ซีฟู้ด|อาหารทะเล|กุ้ง|ปูนึ่ง|หอย|ปลาเผา|fish|crab|prawn|oyster/],
  ["Japanese",          /^(japanese|sushi|ramen;japanese|izakaya|tonkatsu|donburi)$/,                              /sushi|ซูชิ|japanese|ญี่ปุ่น|izakaya|อิซากายะ|tonkatsu|ทงคัตสึ|donburi|yakitori|teppanyaki/],
  ["Korean",            /^(korean)$/,                                                                              /korean|เกาหลี|kimchi|กิมจิ|bibimbap/],
  ["Chinese",           /^(chinese|dim sum|cantonese|szechuan|sichuan|dumpling|peking duck)$/,                     /dim ?sum|ติ่มซำ|chinese|อาหารจีน|เป็ดย่าง|peking|dumpling|เกี๊ยว|xiao long/],
  ["Indian",            /^(indian|curry|pakistani|nepalese|bangladeshi|sri lankan)$/,                              /indian|อินเดีย|tandoor|masala|biryani|curry house|naan/],
  ["Vietnamese",        /^(vietnamese)$/,                                                                          /vietnam|เวียดนาม|banh mi|บั๋นหมี่/],
  ["Middle Eastern",    /^(middle eastern|lebanese|turkish|arab|kebab|falafel|shawarma|halal)$/,                   /kebab|shawarma|falafel|lebanese|turkish|halal|ฮาลาล/],
  ["Mexican",           /^(mexican|tex-mex|tacos?|burrito)$/,                                                      /mexican|taco|burrito|tex-?mex/],
  ["Burgers",           /^(burger)$/,                                                                              /burger|เบอร์เกอร์/],
  ["Fried chicken",     /^(chicken|fried chicken|wings)$/,                                                         /fried chicken|ไก่ทอด|wings|\bkfc\b/],
  ["Pizza & Italian",   /^(pizza|italian|italian pizza|pasta)$/,                                                   /pizza|pizzeria|พิซซ่า|italian|trattoria|pasta|พาสต้า|spaghetti|สปาเก็ตตี้|lasagn/],
  ["Steak",             /^(steak house|steak|steakhouse)$/,                                                        /steak|สเต็ก/],
  ["Vegetarian",        /^(vegetarian|vegan)$/,                                                                    /vegan|vegetarian|มังสวิรัติ|อาหารเจ|\bเจ\b/],
  ["Breakfast & brunch",/^(breakfast|brunch|diner|sandwich|bagel)$/,                                               /breakfast|brunch|sandwich|bagel|bistro/],
  ["Western",           /^(international|western|american|german|french|russian|european|british|english|australian|mediterranean|greek|spanish|irish|swiss)$/, /western|international|german|french|british|english pub|irish|bistro/],
  ["Juice & smoothies", /^(juice|smoothie)$/,                                                                      /juice|smoothie|น้ำผลไม้|น้ำปั่น/],
  ["Tea & bubble tea",  /^(tea|bubble tea)$/,                                                                      /bubble tea|boba|ชาไข่มุก|ชานม|milk tea/],
  ["Desserts",          /^(ice cream|dessert|frozen yogurt|bingsu|crepe)$/,                                        /ice cream|ไอศกรีม|ไอติม|บิงซู|bingsu|dessert|ของหวาน|crepe|เครป|waffle|วาฟเฟิล|gelato/],
  ["Bakery & cakes",    /^(cake|donut|bakery|pastry|bread)$/,                                                      /bakery|เบเกอรี่|cake|เค้ก|ขนมปัง|donut|โดนัท|pastry|croissant/],
  ["Café & coffee",     /^(coffee shop|coffee|cafe)$/,                                                             /coffee|café|cafe|กาแฟ|คาเฟ่|espresso|roaster/],
  ["Thai",              /^(thai|regional|local|thai;regional|southern thai|northern thai)$/,                       /thai|ไทย|อาหารตามสั่ง|ตามสั่ง|ครัว|ร้านอาหาร|แกง|ผัดไทย|pad thai|tom yum|ต้มยำ|kaphrao|krapow|กะเพรา|khao|ข้าว/],
  ["Asian",             /^(asian|thai;asian|fusion)$/,                                                             /asian|fusion/]
];
// chains: food type and typical spend per person in baht
const FOOD_BRANDS = {
  "Café Amazon":["Café & coffee", 45, 90], "Starbucks":["Café & coffee", 120, 220], "KFC":["Fried chicken", 100, 200], "McDonald's":["Burgers", 100, 200],
  "The Pizza Company":["Pizza & Italian", 200, 400], "MK Restaurants":["BBQ & hotpot", 250, 450], "Burger King":["Burgers", 150, 250], "Subway":["Breakfast & brunch", 120, 200],
  "Pizza Hut":["Pizza & Italian", 200, 400], "Black Canyon":["Café & coffee", 150, 300], "Black Canyon Coffee":["Café & coffee", 150, 300], "Swensen's":["Desserts", 100, 250],
  "The Coffee Club":["Café & coffee", 200, 400], "Dairy Queen":["Desserts", 50, 120], "S&P":["Thai", 150, 300], "Chester's":["Fried chicken", 80, 160], "Chester's Grill":["Fried chicken", 80, 160],
  "Dunkin'":["Bakery & cakes", 40, 120], "Dunkin' Donuts":["Bakery & cakes", 40, 120], "Sizzler":["Steak", 300, 500], "Bonchon Chicken":["Fried chicken", 200, 400],
  "Au Bon Pain":["Bakery & cakes", 150, 300], "Texas Chicken":["Fried chicken", 100, 200], "Mister Donut":["Bakery & cakes", 40, 100], "Punthai Coffee":["Café & coffee", 40, 80],
  "Domino's":["Pizza & Italian", 200, 400], "Doi Chaang":["Café & coffee", 60, 120], "Chao Doi":["Café & coffee", 50, 100], "Mixue Ice Cream & Tea":["Tea & bubble tea", 20, 60],
  "Shabushi":["BBQ & hotpot", 400, 550], "Fuji":["Japanese", 250, 450], "Santa Fé":["Steak", 250, 450], "Taco Bell":["Mexican", 100, 200], "Krispy Kreme":["Bakery & cakes", 40, 120],
  "Auntie Anne's":["Bakery & cakes", 60, 120], "Coffee World":["Café & coffee", 80, 150], "ChaTraMue":["Tea & bubble tea", 40, 80], "Tom N Toms":["Café & coffee", 100, 180],
  "Häagen-Dazs":["Desserts", 150, 300], "Hard Rock Cafe":["Western", 500, 1000], "Bar-B-Q Plaza":["BBQ & hotpot", 300, 500], "Hooters":["Western", 400, 800],
  "Potato Corner":["Fried chicken", 50, 100], "Oishi Ramen":["Noodles", 150, 250], "Inthanin":["Café & coffee", 50, 90], "Yayoi":["Japanese", 200, 350],
  "Haidilao":["BBQ & hotpot", 500, 900], "After You":["Desserts", 150, 300], "Sukishi":["BBQ & hotpot", 350, 550], "Kagonoya":["BBQ & hotpot", 400, 700]
};
const brandOf = it => {
  if (it.br && FOOD_BRANDS[it.br]) return it.br;
  const n = String(it.n || "");
  return Object.keys(FOOD_BRANDS).find(b => b.length > 3 && n.toLowerCase().startsWith(b.toLowerCase())) || null;
};
// cache per place: these run for thousands of map points
function foodType(it){
  if (it._ft !== undefined) return it._ft;
  let label = null;
  const b = brandOf(it);
  if (b) label = FOOD_BRANDS[b][0];
  const cus = (it.cu || []).map(c => String(c).toLowerCase().trim());
  if (!label) for (const [l, cuRe] of FOOD_TYPES){ if (cus.some(c => cuRe.test(c))){ label = l; break; } }
  if (!label){
    const name = `${it.n || ""} ${it.nt || ""}`.toLowerCase();
    for (const [l, , nameRe] of FOOD_TYPES){ if (nameRe.test(name)){ label = l; break; } }
  }
  if (!label){
    if (it.k === "cafe") label = "Café & coffee";
    else if (it.k === "bakery") label = "Bakery & cakes";
    else if (it.k === "dessert") label = "Desserts";
    else if (it.k === "market") label = "Market food";
    else if (it.k === "foodcourt") label = "Food court";
    else if (it.k === "fastfood" && !it.br) label = "Street food";
    else if (/[฀-๿]/.test(it.n || "")) label = "Thai";        // a Thai-only name in Thailand: very likely Thai food
  }
  return (it._ft = label);
}

/* ---------- typical prices ---------- */
// food: per person in baht, by food type (used for restaurants)
const FOOD_TYPE_PRICE = {
  "Thai":[60, 200], "Noodles":[50, 120], "Rice dishes":[50, 100], "Isaan & som tam":[60, 200], "Street food":[40, 100], "Market food":[40, 120], "Food court":[50, 120],
  "Seafood":[250, 700], "BBQ & hotpot":[200, 450], "Japanese":[200, 500], "Korean":[200, 450], "Chinese":[150, 400], "Indian":[200, 450], "Vietnamese":[100, 250],
  "Middle Eastern":[150, 350], "Mexican":[250, 500], "Burgers":[150, 350], "Fried chicken":[100, 250], "Pizza & Italian":[250, 600], "Steak":[300, 800],
  "Vegetarian":[100, 250], "Breakfast & brunch":[150, 350], "Western":[250, 600], "Asian":[120, 300], "Juice & smoothies":[40, 100], "Tea & bubble tea":[40, 100],
  "Desserts":[50, 150], "Bakery & cakes":[40, 150], "Café & coffee":[60, 150]
};
const FOOD_KIND_PRICE = {cafe:[60, 150], bakery:[40, 150], dessert:[50, 150], market:[40, 120], foodcourt:[50, 120], fastfood:[50, 150], restaurant:[100, 300]};
// activities: per person (entry, a session, a ticket). 0 = normally free.
const DO_PRICE = {
  temple:[0, 0, "Most temples are free. The famous ones charge ฿50–500."], worship:[0, 0, "Usually free to visit."], park:[0, 0], beach:[0, 0], viewpoint:[0, 50], peak:[0, 0],
  market:[0, 0, "Free to walk round."], historic:[0, 150], museum:[50, 300], zoo:[300, 1000], themepark:[800, 2000], waterfall:[0, 300, "Waterfalls in national parks charge the park fee."],
  cave:[0, 200], hotspring:[50, 300], nationalpark:[100, 500, "National park fees for foreigners are usually ฿100–500."], dive:[1500, 3500, "One fun dive. Courses cost more."],
  climbing:[800, 2000, "A half-day session."], muaythai:[400, 2500, "Training ฿400–600 a session; fight tickets ฿1,500 and up."], massage:[250, 600, "An hour of Thai massage."],
  cooking:[1000, 2000, "A half-day class with market visit."], bar:[80, 250, "Per drink."], club:[200, 600, "Entry or a drink or two."], culture:[300, 1500]
};
// stays: per night in baht
const STAY_PRICE = {hostel:[250, 600, "A dorm bed."], guesthouse:[400, 1000], hotel:[800, 2000], resort:[1500, 5000], bungalow:[400, 1500], apartment:[700, 1800],
  motel:[400, 800], campsite:[100, 400, "A pitch or tent."], hut:[300, 800]};
const STAY_STARS = {1:[500, 1000], 2:[500, 1000], 3:[1000, 2000], 4:[1800, 4000], 5:[3500, 8000]};

// {lo, hi, cur:"THB", per, est:true, why, note?}  or null when we can't sensibly guess
function estPrice(it){
  if (it._ep !== undefined) return it._ep;
  let out = null;
  const grp = it.g || (it.c === "gaff" ? "stay" : it.c === "munch" ? "food" : it.c === "cool" ? "do" : null);
  if (grp === "food"){
    const b = brandOf(it);
    if (b){ const [, lo, hi] = FOOD_BRANDS[b]; out = {lo, hi, why:`Typical at ${b}`}; }
    else {
      const ft = foodType(it);
      const byKind = FOOD_KIND_PRICE[it.k];
      const byType = it.k === "restaurant" || !byKind ? FOOD_TYPE_PRICE[ft] : null;
      const r = byType || byKind;
      if (r) out = {lo:r[0], hi:r[1], why: byType ? `Typical for ${ft.toLowerCase()} here` : `Typical for a ${(KIND[it.k] || {l:"place"}).l.toLowerCase()} here`};
    }
    if (out) out.per = "per person";
  } else if (grp === "do"){
    const r = DO_PRICE[it.k];
    if (r) out = {lo:r[0], hi:r[1], per:"per person", why:`Typical for a ${(KIND[it.k] || {l:"place"}).l.toLowerCase()}`, note:r[2]};
  } else if (grp === "stay"){
    const r = (it.st && STAY_STARS[it.st]) || STAY_PRICE[it.k];
    if (r) out = {lo:r[0], hi:r[1], per:"a night", why:it.st && STAY_STARS[it.st] ? `Typical for a ${it.st}-star hotel` : `Typical for a ${(KIND[it.k] || {l:"place"}).l.toLowerCase()}`, note:r[2]};
  }
  if (out){ out.cur = "THB"; out.est = true; out.free = out.hi === 0; }
  return (it._ep = out);
}

/* the price we go by: a researched price if there is one (converted to baht), otherwise the estimate */
const toTHB = (x, cur) => cur === "THB" || !cur ? x : toGBP(x, cur) * rate("THB");
function priceInfo(it){
  if (it.p && it.p.length) return {lo:toTHB(it.p[0], it.cur), hi:toTHB(it.p[1] != null ? it.p[1] : it.p[0], it.cur), est:false};
  return estPrice(it);
}
// price bands per section, in baht: [upper limit of £, upper limit of ££]
const BAND_LIMITS = {food:[150, 400], do:[300, 1500], stay:[600, 1800]};
const BAND_LABELS = {
  food:[null, "£ under ฿150", "££ ฿150–400", "£££ ฿400+"],
  do:["Free", "£ under ฿300", "££ ฿300–1,500", "£££ ฿1,500+"],
  stay:[null, "£ under ฿600", "££ ฿600–1,800", "£££ ฿1,800+"]
};
// 0 = free, 1 = £, 2 = ££, 3 = £££, null = no idea
function priceBand(it){
  const grp = it.g || (it.c === "gaff" ? "stay" : it.c === "munch" ? "food" : it.c === "cool" ? "do" : null);
  const lim = BAND_LIMITS[grp]; if (!lim) return null;
  const p = priceInfo(it); if (!p) return null;
  if (p.hi === 0) return 0;
  const mid = (p.lo + p.hi) / 2;
  return mid < lim[0] ? 1 : mid <= lim[1] ? 2 : 3;
}
/* "est. ฿60–200" and "£1–5" for cards and the details sheet */
function estText(e){
  if (!e) return "";
  if (e.free) return "Usually free";
  const f = n => Math.round(n).toLocaleString("en-GB");
  return `est. ${e.lo === e.hi ? "฿" + f(e.lo) : e.lo === 0 ? "free–฿" + f(e.hi) : "฿" + f(e.lo) + "–" + f(e.hi)}`;
}
// whole pounds: an estimate shouldn't look more exact than it is
function estGBP(e){
  if (!e || e.free) return "";
  const lo = toGBP(e.lo, "THB"), hi = toGBP(e.hi, "THB");
  const r = v => v < 1 ? "<£1" : "£" + Math.round(v);
  return lo === hi ? r(lo) : e.lo === 0 ? `up to ${r(hi)}` : (Math.round(lo) === Math.round(hi) ? r(lo) : `${r(lo)}–${Math.round(hi)}`).replace("<£1–", "<£1–£");
}

/* ---------- ratings we know about ---------- */
// researched places carry their own rating (out of 10); Google ratings already looked up on this phone are kept here
const G_RATINGS = new Map();
(function(){ try { for (let i = 0; i < (localStorage.length || 0); i++){ const k = localStorage.key(i); if (k && k.startsWith("gfacts:")){ const v = lsGet(k); if (v && v.r) G_RATINGS.set(k.slice(7), v.r); } } } catch(e){} })();
const knownRating = it => it.r != null ? it.r : G_RATINGS.has(it.id) ? G_RATINGS.get(it.id) * 2 : null;
