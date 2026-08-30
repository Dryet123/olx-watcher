import { headline, bodyLines } from "../format.js";

export function notifyConsole(ad, searchName) {
  console.log(`\n🔔 [${searchName}] ${headline(ad)}`);
  for (const line of bodyLines(ad)) console.log(`   ${line}`);
  console.log(`   ${ad.url}`);
}
