// Imports

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
import express, { response } from 'express'
import MongoClient from 'mongodb'
const Mongo = MongoClient.MongoClient
const app = express()

// Initialization
import * as lib from "./lib.mjs"
const gotCurrency = new Set()
let talkedRecently = false
disbut(client)
const { MessageButton: Button } = disbut
let dboUsers, dboChannels, persistent
const mostRecentCommand = {}

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag} at ${new Date().toLocaleString()}`)
    client.user.setActivity("for m,", {
        type: 'WATCHING'
    })
    return client.users.cache.get("264590999479648268").send("Masonbot is online.")
})

Mongo.connect(process.env.MONGODB_URL, {
    useUnifiedTopology: true
}, function(err, database) {
    if (err) throw err

    app.listen(3000)
    console.log("Listening on port 3000")
    dboUsers = database.db("users")
    dboChannels = database.db("channels")
})

// OTHER
const prefix = "m,"
const testing = false;

client.on("message", async message => {
    if (testing && message.author.id !== lib.info.mason.id) return

    if (message.content.startsWith(prefix)) {
        mostRecentCommand[message.author.id] = message.content
    }

    if (message.content === ",m") {
        if (!mostRecentCommand[message.author.id]) return message.channel.send(lib.errorEmbed("You haven't sent a command yet."))

        return lib.sudo(message, message.member, mostRecentCommand[message.author.id])
    }

    if (Math.floor(Math.random() * 4096) === 1) {
        await message.react("740160198689292309")
        await message.channel.send({
            embed: {
                author: {
                    name: "A rare Masonbot has appeared!",
                    icon_url: "https://i.imgur.com/6NBJlFX.png"
                }
            },
            color: "000001"
        })
    }

    if (!!dboUsers) {
        if (!gotCurrency.has(message.author.id)) {
            dboUsers.collection(message.author.id).find({}).toArray(function(err, result) {
                if (!result[0]) return
                dboUsers.collection(message.author.id).updateOne({}, {
                    $inc: {
                        currency: Math.round(Math.pow(result[0].generatorLevel, 4)),
                    },
                })
            })
            gotCurrency.add(message.author.id)
        } else {
            let t = setTimeout(() => {
                gotCurrency.delete(message.author.id)
                clearTimeout(t)
            }, 10000)
        }
    }

    if (message.channel.id === "859688768876707870") {
        if (message.author.bot) return

        let { story } = await getChannel("859688768876707870")

        let updatePersistent = async (newStory) => {
            if (persistent) await persistent.delete().catch(() => {})

            persistent = await message.channel.send({
                embed: {
                    description: newStory,
                    color: "e7e7e7",
                    footer: {
                        text: `${newStory.length}/4096 characters`
                    }
                }
            })
        }

        if (message.content === "collab undo") {
            let storyArray = story.split(" ")
            storyArray.pop()
            let undoneStory = storyArray.join(" ")

            dboChannels.collection("859688768876707870").updateOne({}, {
                $set: {
                    story: undoneStory
                }
            })

            message.delete()
            await updatePersistent(undoneStory)
            return
        } else if (message.content === "collab done") {
            message.channel.send({
                embed: {
                    title: "Here's your finished story!",
                    description: story,
                    color: "e7e7e7",
                    footer: {
                        text: `${story.length}/4096 characters`
                    }
                }
            }).then(doneMessage => {
                doneMessage.pin()
                dboChannels.collection("859688768876707870").updateOne({}, {
                    $set: {
                        story: ""
                    }
                })
            })
            return
        }

        if (message.content.indexOf(" ") !== -1 && !message.content.startsWith("//")) return message.delete()

        if (!message.content.startsWith("//")) {
            if (!message.author.bot) {
                dboChannels.collection("859688768876707870").updateOne({}, {
                    $set: {
                        story: /^[\W]$/g.test(message.content) ? story + message.content : story + " " + message.content
                    }
                })
            }

            await updatePersistent(/^[\W]$/g.test(message.content) ? story + message.content : story + " " + message.content)
        }
    }

    const contentArray = message.content.trim().slice(prefix.length).split(/ +/)
    const cmd = contentArray[0].toLowerCase()
    const args = message.content.trim().slice(prefix.length).split(/ +/).slice(1)
    const subCmd = args[0] ? args[0].toLowerCase() : false
    const terCmd = args[1] ? args[1].toLowerCase() : false

    let command = new lib.MessageCommand(message)

    // Features that are too short to make the command handler

    if (message.content.match(/^https?:\/\/(?:(?:canary|cdn|ptb)\.)?discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)$/)) {
        command.quote()
    }

    if (!talkedRecently) {
        talkedRecently = true
        setTimeout(() => {
            talkedRecently = false
        }, 16000)

        if (Math.random() < (1 / 16)) {
            command.spawnRift()
        }
    }

    if (cmd === "cc") {
        message.guild.channels.create(argString, {
                permissionOverwrites: [{
                    id: message.author.id,
                    allow: ["MANAGE_CHANNELS", "MANAGE_ROLES", "MANAGE_MESSAGES"]
                }],
                parent: "739399990967009310"
            })
            .then(channel => {
                message.channel.send(`Successfully created ${channel.toString()}`)
            })
            .catch(err => {
                console.error(err)
                message.react("❌")
            })
    }

    // Main command handler

    if (!message.content.startsWith(prefix)) return

    switch (cmd) {
        case "currency":
        case "c":
            switch (subCmd) {
                case "bet":
                case "b":
                    command.bet()
                    break
                case "pay":
                case "p":
                    command.pay()
                    break
                case "set":
                    command.setCurrency()
                    break
                case "bribe":
                    command.bribe()
                    break
                case "top":
                case "t":
                    command.top()
                    break
                case "versus":
                case "vs":
                    command.vs()
                    break
                case "check":
                case "ch":
                    command.check()
                    break
                case "gen":
                case "g":
                    command.gen()
                    break
                case "page":
                case false:
                    command.page()
            }
            break
        case "eval":
        case "ev":
            command.eval()
            break
        case "sudo":
            command.sudo()
            break
        case "say":
            command.say()
            break
        case "settopic":
        case "st":
            command.setTopic()
            break
        case "setemoji":
        case "se":
            command.setEmoji()
            break
        case "setcolor":
        case "sc":
            command.setColor()
            break
        case "setname":
        case "sn":
            command.setName()
            break
        case "math":
        case "m":
            command.math()
            break
        case "karma":
        case "km":
            command.karma()
            break
        case "image":
        case "i":
            command.image()
            break
        case "yt":
            command.youtube()
            break
        case "rps":
            command.rps()
            break
        case "hex":
            command.hex()
            break
        case "spreadsheet":
        case "sp":
            command.spreadsheet()
            break
        case "help":
        case "h":
            command.help()
            break
    }
})

client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return

    if (reaction.partial) {
        try {
            await reaction.fetch()
            await reaction.users.fetch()
        } catch (error) {
            return console.log(error)
        }
    }

    const message = reaction.message
    const emoji = reaction.emoji

    if (emoji.name === "📌") {
        if (user.id === message.author.id) {
            return reaction.users.remove(user)
        }

        if (reaction.count < 3) return

        return message.pin().catch(() => {})
    }

    let command = new lib.ReactionCommand(reaction, user)

    switch (emoji.name) {
        case "🐃":
            command.quote()
            break
        case "⭐":
        case "🐀":
            command.board()
            break
        case "upvote":
        case "downvote":
            command.karma()
            break

    }
})

client.on('messageReactionRemove', async (reaction, user) => {
    if (reaction.partial) {
        try {
            await reaction.fetch()
            await reaction.users.fetch()
        } catch (error) {
            return console.log(error)
        }
    }

    const message = reaction.message
    const emoji = reaction.emoji

    let command = new lib.ReactionCommand(reaction, user, true)

    switch (emoji.name) {
        case "⭐":
        case "🐀":
            command.board()
            break
        case "upvote":
        case "downvote":
            command.karma()
            break
    }
})

client.login()

export { client, prefix, Button, dboUsers, dboChannels, mostRecentCommand }