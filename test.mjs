import { createRequire } from "module"
const require = createRequire(
    import.meta.url
)
import dotenv from "dotenv"
dotenv.config()
import Discord, { MessageAttachment } from 'discord.js'
const client = new Discord.Client({
    fetchAllMembers: true,
    sync: true,
    partials: ['MESSAGE', 'CHANNEL', 'REACTION'],
})
const disbut = require("discord-buttons")
disbut(client)
const { MessageButton: Button, MessageActionRow: ActionRow} = disbut
import * as math from "mathjs"
import e from "express"
const path = require("path")

client.once("ready", () => {
    console.log("Ready")
})




let monkeys = ["Dart Monkey", "Boomerang Monkey", "Bomb Shooter", "Tack Shooter", "Ice Monkey", "Glue Gunner", "Sniper Monkey", "Monkey Sub", "Monkey Buccaneer", "Monkey Ace", "Heli Pilot", "Mortar Monkey", "Dartling Gunner", "Wizard Monkey", "Super Monkey", "Ninja Monkey", "Alchemist", "Druid", "Banana Farm", "Spike Factory", "Monkey Village", "Engineer Monkey"]






client.on("message", async message => {
    const prefix = "m,"
    const contentArray = message.content.trim().slice(prefix.length).split(/ +/)
    const cmd = contentArray[0].toLowerCase()
    const args = message.content.trim().slice(prefix.length).split(/ +/).slice(1)
    const subCmd = args[0] ? args[0].toLowerCase() : false
    const terCmd = args[1] ? args[1].toLowerCase() : false
    
    if (message.content.startsWith("m,")) {
        if (cmd === "btd") {
            if (subCmd === "random") {
                message.channel.send({embed: {
                    title: monkeys[Math.floor(Math.random() * monkeys.length)]
                }})
            }
        }            
    }
})

client.login()