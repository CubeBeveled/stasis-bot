const mineflayer = require("mineflayer");
const { randomInt } = require("crypto");
const { Vec3 } = require("vec3");
const color = require("colors");
const vec3 = require("vec3");
const fs = require("fs");

const {
  searchForBlocks,
  writeListToJSON,
  sleep,
  getRandomBoolean,
} = require("./utils.js");

const stopped = "stopped";
const reconnecting = "reconnecting";
const offline = "offline";
const online = "online";

const actions = {
  idle: undefined,
  following: "following",
  jumping: "jumping"
}

class stasisBot {
  constructor(mcOptions) {

    this.config = require("./config.json");

    if (fs.existsSync("seen.json")) this.seenList = require("./seen.json")
    else {
      fs.writeFileSync("seen.json", "[]");
      this.seenList = [];
    }

    this.mcOptions = mcOptions;
    this.bot = mineflayer.createBot(this.mcOptions);

    this.spawned = 0;
    this.dead = true;
    this.hasBed = true;

    if (fs.existsSync("homes.json")) this.homes = require("./homes.json")
    else {
      fs.writeFileSync("homes.json", "[]");
      this.homes = [];
    }

    this.status = offline;

    this.registerEvents();

    this.currentAction = { action: actions.idle, player: undefined, options: {} };
  }

  async registerEvents() {
    this.bot.on("error", (error) => this.reconnect(color.yellow(`[${this.mcOptions.username}] Error: `) + error.message));
    this.bot.on("end", (reason) => this.reconnect(color.yellow(`[${this.mcOptions.username}] Connection ended: `) + reason));
    this.bot.on("kicked", (reason) => this.reconnect(color.yellow(`[${this.mcOptions.username}] Kicked: `) + reason));

    this.bot.on("entitySpawn", (entity) => {
      if (entity.type == "player" && entity.username !== this.mcOptions.username) {
        console.log(color.gray(`Player ${entity.username} entered render distance.`));

        let found = false;
        for (let i = 0; i < this.seenList.length; i++) {
          if (this.seenList[i].username == entity.username) {
            this.seenList[i].spawnPositions.push({
              time: Date.now(),
              pos: entity.position
            });

            found = true;
          }
        }

        if (!found) this.seenList.push({
          username: entity.username,
          spawnPositions: [{
            time: Date.now(),
            pos: entity.position
          }],
          leavePositions: []
        });

        writeListToJSON("seen.json", this.seenList)
      }
    });

    this.bot.on("entityGone", (entity) => {
      if (entity.type == "player" && entity.username !== this.mcOptions.username) {
        console.log(color.gray(`Player ${entity.username} exited render distance.`));

        let found = false;
        for (let i = 0; i < this.seenList.length; i++) {
          if (this.seenList[i].username == entity.username) {
            this.seenList[i].leavePositions.push({
              time: Date.now(),
              pos: entity.position
            });

            found = true;
          }
        }

        if (!found) this.seenList.push({
          username: entity.username,
          spawnPositions: [],
          leavePositions: [{
            time: Date.now(),
            pos: entity.position
          }]
        });

        writeListToJSON("seen.json", this.seenList)
      }
    });

    this.bot.on("spawn", async () => {
      this.spawned++

      console.log(color.green(`${this.mcOptions.username} spawned (${this.bot._client.socket._host}) [${this.spawned}]`));

      if (this.spawned == 1) {
        await sleep(1000);
        if (this.mcOptions.is6b6t) this.bot.setControlState("forward", true);
      }

      if (this.spawned == 2) {
        this.status = online;
        this.bot.setControlState("forward", false);
        this.slowLoop();

        if (this.config.general.afkMovement) {
          this.randomMovement()
        }

        this.dead = false;
      }

      if (this.spawned > 2) {
        this.dead = false
      }
    });

    this.bot.on("autoeat_started", (item, offhand) => {
      console.log(color.green(`[${this.mcOptions.username}] Eating ${item.name} in ${offhand ? "offhand" : "hand"}`))
    })

    this.bot.on("autoeat_finished", (item, offhand) => {
      console.log(color.green(`[${this.mcOptions.username}] Finished eating ${item.name} in ${offhand ? "offhand" : "hand"}`))
    })

    this.bot.on("chat", async (username, msg) => {
      console.log(color.yellow(`${username}: ${msg}`))

      if (msg.startsWith(this.config.commands.cmdPrefix)) this.cmdHandler(username, msg)
    });

    this.bot.on("blockUpdate", async (oldBlock, newBlock) => {
      if (!this.hasBed && this.bot.entity && this.bot.isABed(newBlock) && this.bot.entity.position.distanceTo(newBlock.position) <= 5) {
        this.bot.lookAt(newBlock.position, true)
        this.bot.activateBlock(newBlock)
        await sleep(500);

        try {
          // wake up
          this.bot._client.write("entity_action", {
            entityId: this.bot.entity.id,
            actionId: 2,
            jumpBoost: 0
          })
        } catch (err) {
          console.log(color.red("Error waking up:"), err)
        }

        this.hasBed = true;
      } else if (this.bot.isABed(oldBlock) && !this.bot.isABed(newBlock)) {
        this.hasBed = false;
      }
    });

    this.bot.on("message", async (msg) => {
      const ansi = msg.toAnsi();
      msg = msg.toString();

      if (!msg.includes("»")) {
        if (msg.includes("login")) {
          this.bot.chat(`/login ${this.mcOptions.password}`)
        }

        if (msg.includes("register")) {
          console.log(color.red(`Username ${this.mcOptions.username} needs to be registered`));
          this.bot.chat(`/register ${this.mcOptions.password} ${this.mcOptions.password}`);
        }

        if (
          msg.includes("6b6t.org is full") ||
          msg.startsWith("Server restarts in 5s") ||
          msg.includes("The main server is down. We will be back soon!")
        ) {
          this.status = online;
          await this.reconnect(msg, 60000);
        }

        console.log(color.yellow(`${ansi}`))

        if (
          msg.toLowerCase().includes("teleport to you") &&
          !msg.toLowerCase().includes("timed") &&
          !msg.toLowerCase().includes("teleported")
        ) {
          let found = false;

          for (const u of this.config.commands.whiterList) {
            if (msg.includes(u) && !found) {
              found = true;
              this.bot.chat(`/tpy ${u}`);
              break;
            }
          }

          if (!found && this.bot.entity) {
            for (const u of this.config.commands.whitelist) {
              if (msg.includes(u)) {
                if (this.config.commands.whitelist) {
                  const position = this.bot.entity.position
                  const radius = this.config.commands.specialBlockRadius;

                  for (let x = position.x - radius; x <= position.x + radius; x++) {
                    for (let y = position.y - radius; y <= position.y + radius; y++) {
                      for (let z = position.z - radius; z <= position.z + radius; z++) {
                        const block = this.bot.world.getBlock(new vec3(x, y, z));

                        if (block.name == this.config.commands.specialBlockName) {
                          found = true;
                          await sleep(500)
                          this.bot.chat(`/tpy ${u}`)
                          await sleep(1000)
                          this.reply(u, `Accepted your tp request`)

                          console.log(color.green(`Accepted ${u}'s tp request`))
                          break;
                        }
                      }
                    }
                  }

                  if (!found) {
                    await sleep(500)
                    this.bot.chat(`/tpn ${u}`)
                    await sleep(1000)
                    this.reply(u, `Bot is not at the base. The special block must be within a ${this.config.commands.specialBlockRadius} block radius.`)
                  }
                } else {
                  await sleep(500)
                  this.bot.chat(`/tpn ${u}`)
                  await sleep(1000)
                  this.reply(u, `Currently we don't have a base.`)

                  console.log(color.green(`Denied ${u}'s tp request`))
                }

                break;
              }
            }
          }
        }
      }
    });

    this.bot.on("whisper", async (username, msg) => {
      console.log(color.magenta(`${this.mcOptions.username} [ WHISPER ]: ${msg}`))

      if (msg.startsWith(this.config.commands.cmdPrefix)) this.cmdHandler(username, msg)
    });

    this.bot.on("playerCollect", async (collector, collected) => {
      await sleep(100);
      const collectedItem = collected.getDroppedItem();

      if (collector.username == this.mcOptions.username && collectedItem) {

        if (collectedItem.name.includes("helmet")) {
          const helmet = this.bot.inventory.items().find(item => item.name.endsWith("helmet"));
          this.bot.equip(helmet, "head");

        } else if (collectedItem.name.includes("chestplate")) {
          const chestplate = this.bot.inventory.items().find(item => item.name.endsWith("chestplate"));
          this.bot.equip(chestplate, "torso");

        } else if (collectedItem.name.includes("legging")) {
          const leggings = this.bot.inventory.items().find(item => item.name.endsWith("leggings"));
          this.bot.equip(leggings, "legs");

        } else if (collectedItem.name.includes("boots")) {
          const boots = this.bot.inventory.items().find(item => item.name.endsWith("boots"));
          this.bot.equip(boots, "feet");
        }

        const totem = this.bot.inventory.items().find(item => item.name.startsWith("totem"));
        const offhandItem = this.bot.inventory.slots[this.bot.getEquipmentDestSlot("off-hand")];

        if (collectedItem.name.startsWith("totem") && (!offhandItem || (offhandItem && !offhandItem.name.startsWith("totem"))))
          this.bot.equip(totem, "off-hand")
            .catch(err => console.error(color.red("Failed to equip totem:"), err.message));
      }
    });

    this.bot.on("physicsTick", () => {
      if (this.dead || !this.bot || this.status !== online) return;

      if (this.config.general.autoJump && this.bot.entity && this.bot.entity.isCollidedHorizontally) {
        this.bot.setControlState("jump", true)
      } else {
        this.bot.setControlState("jump", false)
      }
    })

    this.bot.on("death", () => {
      this.dead = true;
      this.setCurrentAction(actions.idle)
    });
  }

  async slowLoop() {
    if (!this.status == online) {
      return;
    } else if (this.dead || !this.bot) {
      await sleep(5)
      this.slowLoop()
      return;
    }

    const mob = this.bot.nearestEntity(entity => !entity.type == "player" && entity.isValid)

    if (mob) {
      const distance = this.bot.entity.position.distanceTo(mob.position);
      const sword = this.bot.inventory.items().find(item => item.name.toLowerCase().includes("sword"));

      if (distance < 4) {
        if (sword) this.bot.equip(sword, "hand")
        this.bot.lookAt(mob.position.offset(0, mob.height, 0), true)
        this.bot.attack(mob)
      }
    }

    const food = this.bot.inventory.items().find(item =>
      item.name.toLowerCase().includes("golden") ||
      item.name.toLowerCase().includes("apple")
    );

    if (food && this.bot.health < this.config.general.autoEatHealthThreshold && this.config.general.autoEatHealth) {
      this.bot.equip(food, "hand")
      this.bot.activateItem();
    }

    await sleep(500)
    this.slowLoop()
  }

  async followLoop() {
    while (this.currentAction.action == actions.following && !this.dead && this.bot.entity) {
      if (this.bot.entity.position.distanceTo(this.currentAction.player.position) > this.config.commands.follow.distance) {
        this.bot.lookAt(this.currentAction.player.position.offset(0, 0.5, 1), true);

        if (this.bot.entity.position.distanceTo(this.currentAction.player.position) >= this.config.commands.sprintJumpDistance) {
          this.bot.setControlState("jump", true);
          this.bot.setControlState("sprint", true);
          this.bot.setControlState("forward", true);
        } else {
          this.bot.setControlState("jump", false);
          this.bot.setControlState("forward", true)
        }

        await sleep(100)
      } else {
        this.bot.lookAt(this.currentAction.player.position.offset(0, 1.5, 0))
        this.bot.setControlState("jump", false);
        this.bot.setControlState("sprint", false);
        this.bot.setControlState("forward", false);
        await sleep(500)
      }
    }

    if (!this.currentAction.player) this.setCurrentAction(actions.idle);
    this.bot.clearControlStates();
  }

  async reconnect(msg, reconnectDelay = (this.mcOptions.reconnectDelay) + Math.random() * 1000) {
    if (this.status !== reconnecting) {
      this.status = reconnecting;
      this.dead = true;

      console.log(msg);
      if (this.bot) this.bot.end();

      console.log(color.yellow(`[${this.mcOptions.username}] Reconnecting in ${reconnectDelay / 1000}s`))
      await sleep(reconnectDelay)
      console.log(color.green(`[${this.mcOptions.username}] Reconnecting`))

      this.status = offline
      this.spawned = 0;

      this.bot = mineflayer.createBot(this.mcOptions);
      this.registerEvents();
    } else {
      console.log(msg, `Not reconnecting, Status: ${this.status}`);
    }
  }

  async cmdHandler(username, msg) {
    const args = msg.slice(this.config.commands.cmdPrefix.length).trim().split(" ");
    const command = args.shift().toLowerCase();

    console.log(color.gray(`Executing ${command} args:`), args)

    const isInWhitelist = this.config.commands.whitelist.includes(username)
    const isInWhiterList = this.config.commands.whiterList.includes(username)

    if ((isInWhitelist || isInWhiterList) && !this.dead) {
      if (command == "help") {
        const cmds = [
          "follow [username]",
          "stop",
          "stasis <name>",
          "drop [item]",
          "jump",
          "people",
          "kill",
          "setspawn"
        ];

        this.reply(username, `Prefix: "${this.config.commands.cmdPrefix}". Commands: ${cmds.join(", ")}`)
      }

      if (command == "jump") {
        this.setCurrentAction(actions.jumping)
      }

      if (command == "kill") {
        this.reply(username, "Killed myself")
        this.bot.chat("/kill")
      }

      if (command == "people") {
        this.reply(username, "I have seen these people: " + this.seenList.map((s) => s.username).join(", "))
      }

      if (command == "stop") {
        this.reply(username, `Stopped (${this.currentAction.action} ${this.currentAction.player.username})`);
        this.setCurrentAction(actions.idle);
      }

      if (command == "setspawn") {
        const origin = this.bot.entity.position;
        const radius = 5;

        for (let x = origin.x - radius; x <= origin.x + radius; x++) {
          for (let y = origin.y - radius; y <= origin.y + radius; y++) {
            for (let z = origin.z - radius; z <= origin.z + radius; z++) {
              const block = this.bot.world.getBlock(new vec3(x, y, z));

              if (block.name.endsWith("_bed") && this.bot.isABed(block)) {
                this.bot.lookAt(block.position, true);
                await this.bot.activateBlock(block);
                await sleep(500);

                try {
                  // wake up
                  await this.bot._client.write("entity_action", {
                    entityId: this.bot.entity.id,
                    actionId: 2,
                    jumpBoost: 0
                  });
                } catch (err) {
                  console.log(color.red("Error waking up:"), err)
                }
              }
            }
          }
        }
      }

      if (command == "follow") {
        let entity;

        if (args.length == 0) {
          entity = this.bot.players[username];
        } else {
          if (args[0] == this.mcOptions.username) {
            this.reply(username, `I cant follow myself dumbass`)
          } else {
            entity = this.bot.players[args[0]];
          }
        }

        if (entity) {
          if (entity.username !== username) this.reply(args[0], `${username} told me to follow u`);

          entity = entity.entity;

          this.setCurrentPlayer(entity)
          this.setCurrentAction(actions.following)

          if (entity.username !== username) await sleep(3100);
          this.reply(username, `Following ${entity.username}`)
        } else {
          if (args[0] == username) this.reply(username, `You are not in my render distance`)
          else this.reply(username, `${args[0]} is not in my render distance`)
        }
      }


      if (command == "stasis") {
        if (args.length == 0) {
          this.reply(username, `A name arg is required. Usage: ${this.config.commands.cmdPrefix}stasis <sign text | "list">`);
        } else {
          let stasis = new Map()

          const position = this.bot.entity.position;
          const radius = this.config.commands.stasis.radius;

          for (let x = position.x - radius; x <= position.x + radius; x++) {
            for (let y = position.y - radius; y <= position.y + radius; y++) {
              for (let z = position.z - radius; z <= position.z + radius; z++) {
                const block = this.bot.world.getBlock(new vec3(x, y, z));

                if (block.name.endsWith("trapdoor")) {

                  function addStasis(bot, offx, offy, offz) {
                    const sign = bot.world.getBlock(block.position.offset(offx, offy, offz));

                    const name = sign
                      .getSignText()
                      .toString()
                      .replace("\n", "")
                      .replace(",", "")
                      .trim();

                    if (name !== "") stasis.set(name, block)
                  }

                  if (this.bot.world.getBlock(block.position.offset(1, 0, 0)).name.endsWith("sign")) {
                    addStasis(this.bot, 1, 0, 0);

                  } else if (this.bot.world.getBlock(block.position.offset(-1, 0, 0)).name.endsWith("sign")) {
                    addStasis(this.bot, -1, 0, 0);

                  } else if (this.bot.world.getBlock(block.position.offset(0, 0, 1)).name.endsWith("sign")) {
                    addStasis(this.bot, 0, 0, 1);

                  } else if (this.bot.world.getBlock(block.position.offset(0, 0, -1)).name.endsWith("sign")) {
                    addStasis(this.bot, 0, 0, -1);
                  }
                }
              }
            }
          }

          if (args[0] == "list") {
            const stasisList = Array.from(stasis.keys())
            console.log(stasisList);

            this.reply(username, "Available stasis: " + stasisList.join(", "))
            await sleep(1000);
            this.reply(username, `Note: Stasis chambers must be within ${this.config.commands.stasis.radius} blocks of the bot`)
          } else {
            const requestedStasis = stasis.get(args.join(" "));

            if (requestedStasis) {
              await this.bot.activateBlock(requestedStasis);
              await sleep(500);
              await this.bot.activateBlock(requestedStasis);
              this.reply(username, `Activated ${args.join(" ")}`)
            } else {
              this.reply(username, `Stasis chamber with name ${args.join(" ")} not found. (Use ${this.config.commands.cmdPrefix}stasis list to see the list)`);
            }
          }
        }
      }

      if (command == "drop" && !this.dead) {
        const player = this.bot.players[username];

        if (player && player.entity) this.bot.lookAt(player.entity.position);
        await sleep(1000)

        if (args.length == 0) {
          await this.bot.unequip("head");
          await this.bot.unequip("torso");
          await this.bot.unequip("legs");
          await this.bot.unequip("feet");
          await this.bot.unequip("off-hand");

          await sleep(50 + Math.random() * 100);

          for (const item of this.bot.inventory.items()) {
            await this.bot.tossStack(item);
          }
        } else if (args[0]) {
          const headItem = this.bot.inventory.slots[this.bot.getEquipmentDestSlot("head")];
          const chestItem = this.bot.inventory.slots[this.bot.getEquipmentDestSlot("torso")];
          const legItem = this.bot.inventory.slots[this.bot.getEquipmentDestSlot("legs")];
          const feetItem = this.bot.inventory.slots[this.bot.getEquipmentDestSlot("feet")];
          const offhandItem = this.bot.inventory.slots[this.bot.getEquipmentDestSlot("off-hand")];

          let extraItems = [];
          if (headItem) extraItems.push(headItem);
          if (chestItem) extraItems.push(chestItem);
          if (legItem) extraItems.push(legItem);
          if (feetItem) extraItems.push(feetItem);
          if (offhandItem) extraItems.push(offhandItem);

          for (const item of this.bot.inventory.items().concat(extraItems)) {
            if (item.name.includes(args[0])) {
              await this.bot.tossStack(item);
              await sleep(25 + Math.random() * 100);
            }
          }
        }
      }
    }

    if (isInWhiterList) {
      if (command == "tp" && this.dead == false) {
        this.bot.chat(`/tpa ${username}`)
        sleep(1000)
        this.reply(username, "Sent tpa to u")
        console.log(color.green(`Sent tpa to ${username}`))
      }

      if (command == "home" && this.dead == false) {
        if (args && args[0]) {
          this.bot.chat(`/home ${args[0]}`)
          this.reply(username, `Teleported to home with name ${args[0]}`)
        } else {
          this.reply(username, "Usage: home <home>")
        }
      }
    }
  }

  setCurrentAction(newAction) {
    this.currentAction.action = newAction;

    if (this.currentAction.action == actions.jumping && newAction !== actions.jumping) this.bot.setControlState("jump", false);
    if (newAction == actions.jumping) {
      this.bot.setControlState("jump", true);
      this.setCurrentPlayer(undefined);
      this.currentAction.options = {};
    }

    if (newAction == actions.idle) {
      this.setCurrentPlayer(undefined);
      this.currentAction.options = {};
    }

    if (newAction == actions.following) this.followLoop();
  }

  setCurrentPlayer(newPlayer) {
    this.currentAction.player = newPlayer;
  }

  mcSend(msg) {
    console.log(color.yellow(`[${this.mcOptions.username}]`), color.green(`[DC -> MC] ${msg}`))
    if (this.status == online) this.bot.chat(msg)
  }

  reply(username, msg) {
    console.log(color.gray(`Sending "${msg}" to ${username}`));
    this.bot.chat(`/msg ${username} ${msg}`);
  }

  getStorage(radius) {
    const chests = searchForBlocks(this.bot, "chest", radius)
    const shulkers = searchForBlocks(this.bot, "shulker", radius)
    return { chests: chests.length, shulkers: shulkers.length };
  }

  searchForBlock(type, radius) {
    const position = this.bot.entity.position

    for (let x = position.x - radius; x <= position.x + radius; x++) {
      for (let y = position.y - radius; y <= position.y + radius; y++) {
        for (let z = position.z - radius; z <= position.z + radius; z++) {
          const block = this.bot.world.getBlock(new vec3(x, y, z));

          if (block.name == type) {
            return block;
          }
        }
      }
    }
  }

  getFaceVector(pos) {
    if (!this.isBlockAir(pos.offset(1, 0, 0))) {
      return new Vec3(1, 0, 0)
    } else if (!this.isBlockAir(pos.offset(-1, 0, 0))) {
      return new Vec3(-1, 0, 0)
    } else if (!this.isBlockAir(pos.offset(0, 0, 1))) {
      return new Vec3(0, 0, 1)
    } else if (!this.isBlockAir(pos.offset(0, 0, -1))) {
      return new Vec3(0, 0, -1)
    } else if (!this.isBlockAir(pos.offset(0, 1, 0))) {
      return new Vec3(0, 1, 0)
    } else if (!this.isBlockAir(pos.offset(0, -1, 0))) {
      return new Vec3(0, -1, 0)
    } else {
      return new Vec3(0, -1, 0)
    }
  }

  async randomMovement() {
    if (!this.bot || !this.bot.entity) {
      await sleep(10)
      this.randomMovement()
      return;
    } else if (this.status !== online) return;

    this.bot.setControlState("forward", true);
    this.bot.setControlState("sprint", getRandomBoolean());
    this.bot.setControlState("jump", getRandomBoolean());

    this.bot.look(randomInt(90), randomInt(360));

    const moveTime = randomInt(3000);

    await sleep(moveTime)
    if (!this.bot || !this.bot.entity) {
      await sleep(10)
      this.randomMovement()
      return;
    }

    this.bot.setControlState("forward", false);
    this.bot.setControlState("sprint", false);
    this.bot.setControlState("jump", false);
    this.bot.swingArm();

    await sleep(1)
    this.randomMovement()
  }
}

module.exports = stasisBot