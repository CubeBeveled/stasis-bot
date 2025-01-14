const seen = require("./seen.json");
const fs = require("fs");

const ignoreList = ["player", "THIS_IS_CASE_SENSITIVE"]; // Put the players you want to ignore here

const onlyLast = false; // If the final md file should contain only the last x of the seen list. X is lastCount
const lastCount = 10;

let finalStr = ""
const t = "`";

if (onlyLast) {
  seen.forEach(p => {
    if (!ignoreList.includes(p.username)) {
      finalStr += `\n# ${p.username}\n`;
      finalStr += `## Entered render distance\n`;

      const lenghtSpawn = p.spawnPositions.length - 1;
      const lenghtLeave = p.leavePositions.length - 1;

      if (lenghtSpawn >= lastCount) {
        for (let i = lenghtSpawn - lastCount; i < lenghtSpawn; i++) {
          const pos = p.spawnPositions[i];
          finalStr += `<t:${Math.round(pos.time / 1000)}:f> ${t}${pos.pos.x.toFixed(2)} ${pos.pos.y.toFixed(2)} ${pos.pos.z.toFixed(2)}${t}\n`;
        }
      } else {
        p.spawnPositions.forEach(pos => {
          finalStr += `<t:${Math.round(pos.time / 1000)}:f> ${t}${pos.pos.x.toFixed(2)} ${pos.pos.y.toFixed(2)} ${pos.pos.z.toFixed(2)}${t}\n`;
        });
      }

      finalStr += `## Exited render distance\n`;
      if (lenghtSpawn >= lastCount) {
        for (let i = lenghtLeave - 3; i < lenghtLeave; i++) {
          const pos = p.leavePositions[i];
          finalStr += `<t:${Math.round(pos.time / 1000)}:f> ${t}${pos.pos.x.toFixed(2)} ${pos.pos.y.toFixed(2)} ${pos.pos.z.toFixed(2)}${t}\n`;
        }
      } else {
        p.leavePositions.forEach(pos => {
          finalStr += `<t:${Math.round(pos.time / 1000)}:f> ${t}${pos.pos.x.toFixed(2)} ${pos.pos.y.toFixed(2)} ${pos.pos.z.toFixed(2)}${t}\n`;
        });
      }
    }
  });
} else {
  seen.forEach(p => {
    if (!ignoreList.includes(p.username)) {
      finalStr += `\n# ${p.username}\n`;
      finalStr += `## Entered render distance\n`;

      p.spawnPositions.forEach(pos => {
        finalStr += `<t:${Math.round(pos.time / 1000)}:f> ${t}${pos.pos.x.toFixed(2)} ${pos.pos.y.toFixed(2)} ${pos.pos.z.toFixed(2)}${t}\n`;
      });

      finalStr += `## Exited render distance\n`;

      p.leavePositions.forEach(pos => {
        finalStr += `<t:${Math.round(pos.time / 1000)}:f> ${t}${pos.pos.x.toFixed(2)} ${pos.pos.y.toFixed(2)} ${pos.pos.z.toFixed(2)}${t}\n`;
      });
    }
  });
}

fs.writeFileSync("seenlog.md", finalStr);