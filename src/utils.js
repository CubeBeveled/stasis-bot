const { randomInt } = require("crypto");
const fs = require("fs");
const vec3 = require("vec3");

const sleep = (toMs) => {
  return new Promise((r) => {
    setTimeout(r, toMs);
  });
};

function searchForBlocks(bot, query, radius) {
  const position = bot.entity.position
  let blocks = []

  for (let x = position.x - radius; x <= position.x + radius; x++) {
    for (let y = position.y - radius; y <= position.y + radius; y++) {
      for (let z = position.z - radius; z <= position.z + radius; z++) {
        const block = bot.blockAt(new vec3(x, y, z));
        if (block && block.name.includes(query)) {
          blocks.push(block)
        }
      }
    }
  }

  return blocks
}

function readJSONList(path, format) {
  console.log("\x1b[32m", `Reading ${path}`)
  const data = fs.readFileSync(path, format);
  return JSON.parse(data);
}

function writeListToJSON(path, list, format = "utf8", indentation = 2) {
  fs.writeFileSync(path, JSON.stringify(list, null, indentation), format);
}

function getRandomBoolean() {
  return randomInt(-1, 1) < 0;
}

module.exports = {
  getRandomBoolean,
  searchForBlocks,
  writeListToJSON,
  readJSONList,
  sleep,
}