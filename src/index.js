const stasisBot = require("./bot");
const config = require("./config.json");

config.bots.forEach((sb) => {
  new stasisBot(sb)
});