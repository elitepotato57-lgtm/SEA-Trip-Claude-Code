// npm test: the unit tests and the phone-size browser run, first with every experiment off (the app everyone sees),
// then with every experiment switched on (Tools › Developer › Experiments). Both must pass before anything is merged.
const { spawnSync } = require("child_process");
const path = require("path");
const runs = [["unit.js", {}], ["smoke.js", {}], ["unit.js", {SEA_EXP:"all"}], ["smoke.js", {SEA_EXP:"all"}]];
const only = process.argv[2];        // "off" or "on" to run just one half
for (const [file, extra] of runs){
  const on = extra.SEA_EXP === "all";
  if ((only === "off" && on) || (only === "on" && !on)) continue;
  console.log(`\n===== ${file}, experiments ${on ? "ALL ON" : "off"} =====`);
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], {stdio:"inherit", env:Object.assign({}, process.env, extra)});
  if (r.status !== 0){ console.log(`\n${file} failed with experiments ${on ? "all on" : "off"}`); process.exit(r.status || 1); }
}
console.log("\nEverything passed" + (only ? ` (experiments ${only})` : ", with experiments off and all on"));
