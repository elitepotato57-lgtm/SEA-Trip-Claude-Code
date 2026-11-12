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
  // Indonesian specialities first, so "RM Padang" or "Pempek Candy" aren't filed under something general
  ["Pempek",            /^(pempek|empek-empek|empek empek)$/,                                                      /pempek|empek|tekwan|celimpungan|\blaksan\b|\bburgo\b|model ikan/],
  ["Padang food",       /^(padang|minangkabau|minang)$/,                                                           /padang|minang|rendang|nasi kapau|\bkapau\b/],
  ["Satay",             /^(satay|sate|satai)$/,                                                                    /\bsate\b|\bsatay\b|\bsatai\b/],
  ["BBQ & hotpot",      /^(barbecue|bbq|grill|hot ?pot|shabu|suki|sukiyaki|korean barbecue|yakiniku|thai bbq)$/,  /mookata|moo kata|moo krata|หมูกระทะ|ชาบู|shabu|สุกี้|suki|hot ?pot|ปิ้งย่าง|bbq|barbecue|yakiniku|บาร์บีคิว|เนื้อย่าง/],
  ["Noodles",           /^(noodles?|ramen|pho|udon|soba|khao soi|bakso|mie|meatball)$/,                            /noodle|ก๋วยเตี๋ยว|ก๋วยจั๊บ|บะหมี่|ราเมน|ramen|\bpho\b|เฝอ|ข้าวซอย|khao ?soi|เย็นตาโฟ|udon|เส้น|\bmie\b|\bmi ayam\b|bakmi|bakso|kwetiau|kwetiaw|\bbihun\b/],
  ["Rice dishes",       /^(rice|khao man gai|chicken rice)$/,                                                      /ข้าวมันไก่|ข้าวขาหมู|ข้าวหมูแดง|ข้าวหมูกรอบ|ข้าวแกง|ข้าวผัด|ข้าวต้ม|khao man|chicken rice|ข้าวราด|โจ๊ก|jok/],
  ["Isaan & som tam",   /^(isaan|isan|lao|laotian|som tam|papaya salad)$/,                                         /ส้มตำ|somtam|som ?tam|อีสาน|isaan|isan|ลาบ|ไก่ย่าง|น้ำตก|แจ่วฮ้อน/],
  ["Seafood",           /^(seafood|fish|fish and chips|oyster|crab)$/,                                             /seafood|ซีฟู้ด|อาหารทะเล|กุ้ง|ปูนึ่ง|หอย|ปลาเผา|fish|crab|prawn|oyster|\bikan\b|pindang|\budang\b|kepiting|\blele\b/],
  ["Japanese",          /^(japanese|sushi|ramen;japanese|izakaya|tonkatsu|donburi)$/,                              /sushi|ซูชิ|japanese|ญี่ปุ่น|izakaya|อิซากายะ|tonkatsu|ทงคัตสึ|donburi|yakitori|teppanyaki/],
  ["Korean",            /^(korean)$/,                                                                              /korean|เกาหลี|kimchi|กิมจิ|bibimbap/],
  ["Chinese",           /^(chinese|dim sum|cantonese|szechuan|sichuan|dumpling|peking duck)$/,                     /dim ?sum|ติ่มซำ|chinese|อาหารจีน|เป็ดย่าง|peking|dumpling|เกี๊ยว|xiao long/],
  ["Indian",            /^(indian|curry|pakistani|nepalese|bangladeshi|sri lankan)$/,                              /indian|อินเดีย|tandoor|masala|biryani|curry house|naan/],
  ["Vietnamese",        /^(vietnamese)$/,                                                                          /vietnam|เวียดนาม|banh mi|บั๋นหมี่/],
  ["Middle Eastern",    /^(middle eastern|lebanese|turkish|arab|kebab|falafel|shawarma|halal)$/,                   /kebab|shawarma|falafel|lebanese|turkish|halal|ฮาลาล/],
  ["Mexican",           /^(mexican|tex-mex|tacos?|burrito)$/,                                                      /mexican|taco|burrito|tex-?mex/],
  ["Burgers",           /^(burger)$/,                                                                              /burger|เบอร์เกอร์/],
  ["Fried chicken",     /^(chicken|fried chicken|wings)$/,                                                         /fried chicken|ไก่ทอด|wings|\bkfc\b|ayam goreng|geprek|penyet|\bcfc\b/],
  ["Pizza & Italian",   /^(pizza|italian|italian pizza|pasta)$/,                                                   /pizza|pizzeria|พิซซ่า|italian|trattoria|pasta|พาสต้า|spaghetti|สปาเก็ตตี้|lasagn/],
  ["Steak",             /^(steak house|steak|steakhouse)$/,                                                        /steak|สเต็ก/],
  ["Vegetarian",        /^(vegetarian|vegan)$/,                                                                    /vegan|vegetarian|มังสวิรัติ|อาหารเจ|\bเจ\b/],
  ["Breakfast & brunch",/^(breakfast|brunch|diner|sandwich|bagel)$/,                                               /breakfast|brunch|sandwich|bagel|bistro/],
  ["Western",           /^(international|western|american|german|french|russian|european|british|english|australian|mediterranean|greek|spanish|irish|swiss)$/, /western|international|german|french|british|english pub|irish|bistro/],
  ["Juice & smoothies", /^(juice|smoothie)$/,                                                                      /juice|smoothie|น้ำผลไม้|น้ำปั่น|\bjus\b/],
  ["Tea & bubble tea",  /^(tea|bubble tea)$/,                                                                      /bubble tea|boba|ชาไข่มุก|ชานม|milk tea|\bes teh\b|teh tarik/],
  ["Desserts",          /^(ice cream|dessert|frozen yogurt|bingsu|crepe)$/,                                        /ice cream|ไอศกรีม|ไอติม|บิงซู|bingsu|dessert|ของหวาน|crepe|เครป|waffle|วาฟเฟิล|gelato|es campur|es teler|martabak manis/],
  ["Bakery & cakes",    /^(cake|donut|bakery|pastry|bread)$/,                                                      /bakery|เบเกอรี่|cake|เค้ก|ขนมปัง|donut|โดนัท|pastry|croissant|\broti\b|\bkue\b/],
  ["Café & coffee",     /^(coffee shop|coffee|cafe)$/,                                                             /coffee|café|cafe|กาแฟ|คาเฟ่|espresso|roaster|\bkopi\b|warkop|ngopi/],
  // the everyday local food of each country: only used for places in that country (see foodType)
  ["Indonesian",        /^(indonesian|regional|local|sundanese|javanese|balinese|betawi)$/,                        /warung|rumah makan|\brm\b|\bnasi\b|\bsoto\b|gado|pecel|lalapan|bebek|\bayam\b|indonesian|sambal|lontong|ketoprak|rawon|gudeg|martabak|sunda|seblak|batagor|siomay|\bmasakan\b/],
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
  "Haidilao":["BBQ & hotpot", 500, 900], "After You":["Desserts", 150, 300], "Sukishi":["BBQ & hotpot", 350, 550], "Kagonoya":["BBQ & hotpot", 400, 700],
  // Indonesian chains (prices in rupiah: the fourth value is the currency)
  "Mie Gacoan":["Noodles", 10000, 30000, "IDR"], "Kopi Kenangan":["Café & coffee", 18000, 35000, "IDR"], "Janji Jiwa":["Café & coffee", 18000, 35000, "IDR"],
  "Kopi Janji Jiwa":["Café & coffee", 18000, 35000, "IDR"], "Fore Coffee":["Café & coffee", 25000, 45000, "IDR"], "Point Coffee":["Café & coffee", 10000, 25000, "IDR"],
  "Richeese Factory":["Fried chicken", 25000, 50000, "IDR"], "CFC":["Fried chicken", 25000, 45000, "IDR"], "A&W":["Fried chicken", 30000, 60000, "IDR"],
  "HokBen":["Japanese", 40000, 75000, "IDR"], "Solaria":["Indonesian", 40000, 80000, "IDR"], "J.CO":["Bakery & cakes", 15000, 60000, "IDR"],
  "J.CO Donuts & Coffee":["Bakery & cakes", 15000, 60000, "IDR"], "Es Teh Indonesia":["Tea & bubble tea", 5000, 20000, "IDR"], "Bakmi GM":["Noodles", 40000, 80000, "IDR"],
  "Marugame Udon":["Noodles", 45000, 90000, "IDR"], "Yoshinoya":["Japanese", 40000, 70000, "IDR"], "Wendy's":["Burgers", 35000, 70000, "IDR"],
  "Sederhana":["Padang food", 30000, 70000, "IDR"], "Rumah Makan Sederhana":["Padang food", 30000, 70000, "IDR"], "Pagi Sore":["Padang food", 40000, 90000, "IDR"],
  "Holland Bakery":["Bakery & cakes", 10000, 40000, "IDR"], "Roti O":["Bakery & cakes", 10000, 25000, "IDR"], "Chatime":["Tea & bubble tea", 25000, 45000, "IDR"]
};
// the same global chains cost differently in Indonesia (rupiah per person)
const BRAND_PRICE_ID = {"KFC":[30000, 60000], "McDonald's":[30000, 70000], "Starbucks":[45000, 85000], "Pizza Hut":[60000, 150000], "Domino's":[40000, 100000],
  "Burger King":[40000, 80000], "Mixue Ice Cream & Tea":[5000, 25000], "Subway":[45000, 80000], "Dunkin'":[10000, 40000], "Dunkin' Donuts":[10000, 40000], "Texas Chicken":[30000, 60000]};
const brandOf = it => {
  if (it.br && FOOD_BRANDS[it.br]) return it.br;
  const n = String(it.n || "");
  return Object.keys(FOOD_BRANDS).find(b => b.length > 3 && n.toLowerCase().startsWith(b.toLowerCase())) || null;
};
// each country's everyday food label is only used there ("regional" cuisine means Thai food in Thailand, Indonesian food in Indonesia)
const LOCAL_FOOD = {TH:"Thai", ID:"Indonesian"};
const typeFits = (label, it) => !Object.values(LOCAL_FOOD).includes(label) || LOCAL_FOOD[it.cc || "TH"] === label;
// cache per place: these run for thousands of map points
function foodType(it){
  if (it._ft !== undefined) return it._ft;
  let label = null;
  const b = brandOf(it);
  if (b) label = FOOD_BRANDS[b][0];
  const cus = (it.cu || []).map(c => String(c).toLowerCase().trim());
  if (!label) for (const [l, cuRe] of FOOD_TYPES){ if (typeFits(l, it) && cus.some(c => cuRe.test(c))){ label = l; break; } }
  if (!label){
    const name = `${it.n || ""} ${it.nt || ""}`.toLowerCase();
    for (const [l, , nameRe] of FOOD_TYPES){ if (typeFits(l, it) && nameRe.test(name)){ label = l; break; } }
  }
  if (!label){
    if (it.k === "cafe") label = "Café & coffee";
    else if (it.k === "bakery") label = "Bakery & cakes";
    else if (it.k === "dessert") label = "Desserts";
    else if (it.k === "market") label = "Market food";
    else if (it.k === "foodcourt") label = "Food court";
    else if (it.k === "fastfood" && !it.br) label = "Street food";
    else if ((it.cc || "TH") === "TH" && /[฀-๿]/.test(it.n || "")) label = "Thai";        // a Thai-only name in Thailand: very likely Thai food
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

/* Indonesia (Sumatra), in rupiah. Everyday food and transport there cost less than in Thailand; tourist-priced
   things (national parks, diving) can cost more. Same shape as the Thai tables above. */
const FOOD_TYPE_PRICE_ID = {
  "Indonesian":[15000, 40000], "Padang food":[20000, 50000], "Pempek":[15000, 40000], "Satay":[20000, 50000], "Noodles":[12000, 35000], "Rice dishes":[12000, 30000],
  "Street food":[8000, 25000], "Market food":[8000, 25000], "Food court":[15000, 40000], "Seafood":[50000, 150000], "BBQ & hotpot":[60000, 150000],
  "Japanese":[50000, 120000], "Korean":[50000, 120000], "Chinese":[40000, 100000], "Indian":[40000, 90000], "Vietnamese":[30000, 70000],
  "Middle Eastern":[40000, 90000], "Mexican":[50000, 100000], "Burgers":[30000, 70000], "Fried chicken":[20000, 45000], "Pizza & Italian":[50000, 120000],
  "Steak":[60000, 200000], "Vegetarian":[20000, 50000], "Breakfast & brunch":[35000, 80000], "Western":[50000, 150000], "Asian":[25000, 60000],
  "Juice & smoothies":[8000, 25000], "Tea & bubble tea":[8000, 30000], "Desserts":[10000, 35000], "Bakery & cakes":[8000, 30000], "Café & coffee":[15000, 40000], "Thai":[30000, 70000]
};
const FOOD_KIND_PRICE_ID = {cafe:[15000, 40000], bakery:[8000, 30000], dessert:[10000, 35000], market:[8000, 25000], foodcourt:[15000, 40000], fastfood:[10000, 35000], restaurant:[20000, 60000]};
const DO_PRICE_ID = {
  temple:[0, 0, "Chinese temples and pagodas are usually free; a small donation is welcome."], worship:[0, 0, "Free outside prayer times. Cover shoulders and knees."],
  park:[0, 10000], beach:[0, 15000, "Some beaches charge a small entry or parking fee."], viewpoint:[0, 10000], peak:[0, 0], market:[0, 0, "Free to walk round."],
  historic:[0, 20000], museum:[5000, 25000], zoo:[20000, 75000], themepark:[30000, 150000], waterfall:[5000, 25000, "Usually a small entry or parking fee."],
  cave:[5000, 25000], hotspring:[10000, 40000], nationalpark:[150000, 300000, "National parks charge foreigners more than locals."], dive:[600000, 1200000, "One fun dive."],
  climbing:[100000, 300000], muaythai:[100000, 300000], massage:[80000, 200000, "An hour of massage (pijat)."], cooking:[200000, 500000],
  bar:[30000, 80000, "Per drink. Alcohol is harder to find and dearer than in Thailand."], club:[50000, 150000], culture:[20000, 100000]
};
const STAY_PRICE_ID = {hostel:[80000, 200000, "A dorm bed."], guesthouse:[150000, 350000], hotel:[250000, 700000], resort:[500000, 1500000], bungalow:[150000, 400000],
  apartment:[300000, 700000], motel:[150000, 300000], campsite:[20000, 100000, "A pitch or tent."], hut:[50000, 150000]};
const STAY_STARS_ID = {1:[150000, 300000], 2:[200000, 400000], 3:[350000, 700000], 4:[600000, 1200000], 5:[1200000, 3000000]};
// which tables each country uses (others use Thailand's, converted)
const PRICE_TABLES = {
  TH:{cur:"THB", food:FOOD_TYPE_PRICE, kind:FOOD_KIND_PRICE, do:DO_PRICE, stay:STAY_PRICE, stars:STAY_STARS},
  ID:{cur:"IDR", food:FOOD_TYPE_PRICE_ID, kind:FOOD_KIND_PRICE_ID, do:DO_PRICE_ID, stay:STAY_PRICE_ID, stars:STAY_STARS_ID}
};

// {lo, hi, cur, per, est:true, why, note?}  or null when we can't sensibly guess
function estPrice(it){
  if (it._ep !== undefined) return it._ep;
  let out = null;
  const T = PRICE_TABLES[it.cc] || PRICE_TABLES.TH;
  let cur = T.cur;
  const grp = it.g || (it.c === "gaff" ? "stay" : it.c === "munch" ? "food" : it.c === "cool" ? "do" : null);
  if (grp === "food"){
    const b = brandOf(it);
    if (b){
      const br = FOOD_BRANDS[b];
      if (it.cc === "ID" && BRAND_PRICE_ID[b]){ out = {lo:BRAND_PRICE_ID[b][0], hi:BRAND_PRICE_ID[b][1]}; cur = "IDR"; }
      else { out = {lo:br[1], hi:br[2]}; cur = br[3] || "THB"; }
      out.why = `Typical at ${b}`;
    } else {
      const ft = foodType(it);
      const byKind = T.kind[it.k];
      const byType = it.k === "restaurant" || !byKind ? T.food[ft] : null;
      const r = byType || byKind;
      const ftl = ft && /^(Thai|Indonesian|Japanese|Korean|Chinese|Indian|Vietnamese|Mexican|Western|Asian|Middle Eastern)$/.test(ft) ? ft + " food" : (ft || "").toLowerCase();
      if (r) out = {lo:r[0], hi:r[1], why: byType ? `Typical for ${ftl} here` : `Typical for a ${(KIND[it.k] || {l:"place"}).l.toLowerCase()} here`};
    }
    if (out) out.per = "per person";
  } else if (grp === "do"){
    // Bali's big-name temples charge entry, unlike Sumatra's
    const r = it.cc === "ID" && it.lng >= 114 && it.k === "temple" ? [0, 60000, "Village temples are usually free; the big-name ones charge entry and lend you a sarong."] : T.do[it.k];
    if (r) out = {lo:r[0], hi:r[1], per:"per person", why:`Typical for a ${(KIND[it.k] || {l:"place"}).l.toLowerCase()}`, note:r[2]};
  } else if (grp === "stay"){
    const r = (it.st && T.stars[it.st]) || T.stay[it.k];
    if (r) out = {lo:r[0], hi:r[1], per:"a night", why:it.st && T.stars[it.st] ? `Typical for a ${it.st}-star hotel` : `Typical for a ${(KIND[it.k] || {l:"place"}).l.toLowerCase()}`, note:r[2]};
  }
  // Bali and Lombok are tourist islands: food, stays and things to do cost more than in Sumatra (chains keep their own prices)
  if (out && it.cc === "ID" && it.lng >= 114 && !out.why.startsWith("Typical at ")){
    const f = {food:1.6, do:1.3, stay:1.4}[grp] || 1, r5 = v => Math.round(v * f / 5000) * 5000;
    out.lo = out.lo ? Math.max(5000, r5(out.lo)) : 0; out.hi = out.hi ? Math.max(out.lo, r5(out.hi)) : 0;
    out.why = out.why.replace(/ here$/, "") + " in Bali and Lombok";
  }
  if (out){ out.cur = cur; out.est = true; out.free = out.hi === 0; }
  return (it._ep = out);
}

/* the price we go by: a researched price if there is one, otherwise the estimate. {lo, hi, cur, est} */
function priceInfo(it){
  if (it.p && it.p.length) return {lo:it.p[0], hi:it.p[1] != null ? it.p[1] : it.p[0], cur:it.cur || "THB", est:false};
  return estPrice(it);
}
// price bands per section, in pounds so they mean the same in every country: [upper limit of £, upper limit of ££]
const BAND_GBP = {food:[3.35, 8.95], do:[6.7, 33.5], stay:[13.4, 40.2]};      // = ฿150/400, ฿300/1,500, ฿600/1,800 at about ฿44.8 to £1
// the band labels in the local money of a country, e.g. "£ under ฿150" or "£ under Rp 65,000"
function bandLabels(grp, cc = S.country){
  const lim = BAND_GBP[grp]; if (!lim) return [];
  const cur = (PRICE_TABLES[cc] || {}).cur || (D.countries[cc] || {}).cur || "THB";
  // friendly figures: ฿150, Rp 80,000; the coarser step only when it is within 3% of the real limit
  const nice = v => { const x = v * rate(cur), k = Math.pow(10, Math.max(0, Math.floor(Math.log10(x)) - 1)), c = Math.round(x / (5 * k)) * 5 * k; return Math.abs(c - x) / x <= .03 ? c : Math.round(x / k) * k; };
  const m = v => money(nice(v), cur);
  return [grp === "do" ? "Free" : null, `£ under ${m(lim[0])}`, `££ ${m(lim[0])}–${fmtNum(nice(lim[1]))}`, `£££ ${m(lim[1])}+`];
}
// 0 = free, 1 = £, 2 = ££, 3 = £££, null = no idea
function priceBand(it){
  const grp = it.g || (it.c === "gaff" ? "stay" : it.c === "munch" ? "food" : it.c === "cool" ? "do" : null);
  const lim = BAND_GBP[grp]; if (!lim) return null;
  const p = priceInfo(it); if (!p) return null;
  if (p.hi === 0) return 0;
  const mid = toGBP((p.lo + p.hi) / 2, p.cur);
  return mid < lim[0] ? 1 : mid <= lim[1] ? 2 : 3;
}
/* "est. ฿60–200" or "est. Rp 15,000–40,000", and "£1–5", for cards and the details sheet */
function estText(e){
  if (!e) return "";
  if (e.free) return "Usually free";
  const cur = e.cur || "THB";
  return `est. ${e.lo === e.hi ? money(e.lo, cur) : e.lo === 0 ? "free–" + money(e.hi, cur) : money(e.lo, cur) + "–" + fmtNum(e.hi)}`;
}
// whole pounds: an estimate shouldn't look more exact than it is
function estGBP(e){
  if (!e || e.free) return "";
  const lo = toGBP(e.lo, e.cur || "THB"), hi = toGBP(e.hi, e.cur || "THB");
  const r = v => v < 1 ? "<£1" : "£" + Math.round(v);
  return lo === hi ? r(lo) : e.lo === 0 ? `up to ${r(hi)}` : (Math.round(lo) === Math.round(hi) ? r(lo) : `${r(lo)}–${Math.round(hi)}`).replace("<£1–", "<£1–£");
}

/* ---------- the maximum-price filter, shared by the map and the Gaffs, Munch and Activities lists ----------
   One state per section (ui.pf), so a maximum set in a list is still set on the map and the other way round.
   Amounts are kept in pounds and compared with each place's price converted at the app's exchange rates.
   - a researched price counts by its lowest ("from") figure; a typical estimate by the middle of its range
   - a place with no price and no estimate never passes while a maximum is set (unknown is not cheap, and not free)
   - stays compare like with like: a dorm bed (or a per-person rate) is never compared with a whole room */
const PF_GRP = {gaff:"stay", munch:"food", cool:"do"};
const PF_PRESETS = {gaff:[5, 8, 10, 15, 20], munch:[1, 2, 5, 10], cool:[1, 5, 10]};
const PF_PER = {gaff:"a night", munch:"a dish", cool:"per person"};
const PF_CAP_GBP = 5000;                                 // a custom maximum above this is surely a typo
const newPF = () => ({max:null, amt:"", cur:"GBP", basis:"bed", est:true});
ui.pf = {gaff:newPF(), munch:newPF(), cool:newPF()};
// how a stay's price is counted: "bed" (a dorm bed, or a per-person rate) or "room" (the whole room, villa or pitch)
function stayBasis(it){
  if (it.p && it.p.length){
    const pu = String(it.pu || "");
    if (/dorm|\bbed\b|per person/i.test(pu)) return "bed";
    if (/room|double|twin|villa|bungalow|apartment|cottage|pitch|whole/i.test(pu)) return "room";
    return (it.t || []).includes("Hostel") ? "bed" : "room";
  }
  return it.k === "hostel" ? "bed" : "room";
}
const STAY_BASIS_LABEL = {bed:"dorm bed or per person", room:"private room"};
// food prices that aren't one dish (a 100 g of seafood, an evening's budget) can't be compared with "a dish"
const notPerDish = it => it.p && /100 ?g|per kg|budget|per pack/i.test(it.pu || "");
// the price the filter goes by, in pounds: {gbp, est, basis} or null when nothing is known
function pfPrice(it, cat){
  if (it.p && it.p.length){
    if (cat === "munch" && notPerDish(it)) return null;
    return {gbp:toGBP(it.p[0], it.cur || "THB"), est:false, basis:cat === "gaff" ? stayBasis(it) : null};
  }
  if (it.cur_ && cat === "cool" && /^free\b/i.test(it.cost || "")) return {gbp:0, est:false, basis:null};
  if (it.cur_ && it.verified && it.cost) return null;      // a researched note like "small fee, not listed": unknown, not an estimate
  const e = estPrice(it); if (!e) return null;
  return {gbp:e.free ? 0 : toGBP((e.lo + e.hi) / 2, e.cur || "THB"), est:true, basis:cat === "gaff" ? stayBasis(it) : null};
}
// why a place is left out: "price" (over the maximum), "unknown", "basis" (priced per room while looking at beds), "est" (estimates switched off)
function pfReason(it, cat){
  const f = ui.pf[cat]; if (!f || f.max == null) return null;
  const pr = pfPrice(it, cat);
  if (!pr) return "unknown";
  if (pr.est && !f.est) return "est";
  if (cat === "gaff" && pr.basis !== f.basis) return "basis";
  if (f.max === 0 ? pr.gbp > 0 : pr.gbp > f.max + 1e-9) return "price";
  return null;
}
const passPF = (it, cat) => !pfReason(it, cat);
const pfOn = cat => !!(ui.pf[cat] && ui.pf[cat].max != null);
// "under £5 a night (about ฿220)" in the money of the place you're looking at
function pfSummary(cat, cc = S.country){
  const f = ui.pf[cat]; if (!f || f.max == null) return "";
  if (f.max === 0) return "free";
  const lc = (D.countries[cc] || {}).cur || "THB";
  const local = f.cur !== "GBP" ? money(+f.amt, f.cur) : lc !== "GBP" ? `about ${money(niceRound(f.max * rate(lc), lc), lc)}` : "";
  return `up to ${f.cur === "GBP" ? "£" + fmtNum(f.max) : money(+f.amt, f.cur)} ${PF_PER[cat]}${f.cur === "GBP" && local ? ` (${local})` : f.cur !== "GBP" ? ` (£${fmtNum(f.max)})` : ""}`;
}
// set a maximum from a preset (pounds) or a custom amount in pounds or the local money; returns an error message or ""
function setPF(cat, amount, cur = "GBP"){
  const f = ui.pf[cat];
  if (amount === null || amount === ""){ f.max = null; f.amt = ""; f.cur = "GBP"; return ""; }
  const v = typeof amount === "number" ? amount : parseFloat(String(amount).replace(/[, ]/g, ""));
  if (!isFinite(v) || v < 0) return "Type an amount of 0 or more";
  if (v === 0 && cat !== "cool") return "Type an amount above 0";
  const gbp = cur === "GBP" ? v : toGBP(v, cur);
  if (gbp > PF_CAP_GBP) return `That’s over £${fmtNum(PF_CAP_GBP)}. Check the amount`;
  f.max = Math.round(gbp * 100) / 100; f.amt = String(v); f.cur = cur;
  return "";
}
// the controls: preset buttons, a custom amount, and for stays which kind of price to compare
function pfControls(cat, cc = S.country){
  const f = ui.pf[cat], lc = (D.countries[cc] || {}).cur || "THB";
  const b = (attr, label, on, title) => `<button class="chip" type="button" ${attr} aria-pressed="${on}"${title ? ` aria-label="${esc(title)}"` : ""}>${label}</button>`;
  const custom = f.max != null && f.max !== 0 && !(f.cur === "GBP" && PF_PRESETS[cat].includes(f.max));
  return `<div class="pf" data-pf="${cat}" role="group" aria-label="Maximum price ${PF_PER[cat]}">
    <span class="mf-lab">Max ${PF_PER[cat]}</span>
    ${b('data-pfp=""', "Any", f.max == null, "No maximum")}${cat === "cool" ? b('data-pfp="0"', "Free", f.max === 0, "Free only") : ""}${PF_PRESETS[cat].map(v => b(`data-pfp="${v}"`, `£${v}`, f.max === v && f.cur === "GBP", `Up to £${v} ${PF_PER[cat]}`)).join("")}
    <span class="pf-custom${custom ? " on" : ""}"><input type="text" inputmode="decimal" data-pfamt placeholder="Custom" value="${custom ? esc(f.amt) : ""}" aria-label="Custom maximum ${PF_PER[cat]}" size="6"><select data-pfcur aria-label="Currency of the custom amount">${[...new Set(["GBP", lc])].map(k => `<option value="${k}" ${(custom ? f.cur : "GBP") === k ? "selected" : ""}>${k === "GBP" ? "£" : SYM[k] ? SYM[k].trim() : k}</option>`).join("")}</select><button class="chip" type="button" data-pfset>Set</button></span>
    ${cat === "gaff" ? `<span class="pf-sep"></span>${b('data-pfb="bed"', "Dorm bed", f.basis === "bed", "Compare dorm-bed and per-person prices")}${b('data-pfb="room"', "Private room", f.basis === "room", "Compare whole-room prices")}` : ""}
    <span class="pf-sep"></span>${b("data-pfest", "Include estimates", f.est, "Include typical estimated prices")}
  </div>`;
}
// wire the controls up; onChange runs after every change
function bindPF(root, cat, onChange){
  const el = root.querySelector(`[data-pf="${cat}"]`); if (!el) return;
  const f = ui.pf[cat];
  el.querySelectorAll("[data-pfp]").forEach(x => x.onclick = () => { setPF(cat, x.dataset.pfp === "" ? null : +x.dataset.pfp); onChange(); });
  const amt = el.querySelector("[data-pfamt]"), curSel = el.querySelector("[data-pfcur]");
  const apply = () => { const msg = setPF(cat, amt.value.trim() === "" ? null : amt.value, curSel.value); if (msg){ toast(msg); amt.focus(); amt.setAttribute("aria-invalid", "true"); return; } onChange(); };
  el.querySelector("[data-pfset]").onclick = apply;
  amt.onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); apply(); } };
  el.querySelectorAll("[data-pfb]").forEach(x => x.onclick = () => { f.basis = x.dataset.pfb; onChange(); });
  el.querySelector("[data-pfest]").onclick = () => { f.est = !f.est; onChange(); };
}
// what the filter is doing to a set of places, in words (shown under the controls)
function pfExplain(cat, items){
  const f = ui.pf[cat]; if (!f || f.max == null) return "";
  const n = {unknown:0, basis:0, est:0};
  for (const it of items){ const r = pfReason(it, cat); if (r && r in n) n[r]++; }
  const bits = [];
  if (n.unknown) bits.push(`${n.unknown.toLocaleString("en-GB")} with no known price are hidden`);
  if (n.basis) bits.push(`${n.basis.toLocaleString("en-GB")} priced per ${f.basis === "bed" ? "room" : "bed"} are hidden (switch to ${f.basis === "bed" ? "Private room" : "Dorm bed"})`);
  if (n.est) bits.push(`${n.est.toLocaleString("en-GB")} with only an estimate are hidden`);
  return `Showing places ${pfSummary(cat)}${cat === "gaff" ? `, ${STAY_BASIS_LABEL[f.basis]} prices` : ""}. ${bits.length ? bits.join("; ") + ". " : ""}Prices are researched “from” prices (checked ${D.checked}) or typical estimates (est.), not live prices: confirm before you pay.`;
}

/* ---------- ratings we know about ---------- */
// researched places carry their own rating (out of 10); Google ratings already looked up on this phone are kept here
const G_RATINGS = new Map();
(function(){ try { for (let i = 0; i < (localStorage.length || 0); i++){ const k = localStorage.key(i); if (k && k.startsWith("gfacts:")){ const v = lsGet(k); if (v && v.r) G_RATINGS.set(k.slice(7), v.r); } } } catch(e){} })();
const knownRating = it => it.r != null ? it.r : G_RATINGS.has(it.id) ? G_RATINGS.get(it.id) * 2 : null;
