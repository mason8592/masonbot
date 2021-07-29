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
const path = require("path")

client.once("ready", () => {
    console.log("Ready")
})

const button = (sound) => {
    return new Button({
        style: "grey",
        label: sound,
        id: sound
    })
} 

client.on("message", async message => {
    if (message.content === "soundboard") {
        message.member.voice.channel.join().then(async connection => {
            let row = new ActionRow()
            .addComponents(button("vineboom"))
            .addComponents(button("steelsting"))
            .addComponents(button("shutup"))
            .addComponents(button("exclamation"))

            let row2 = new ActionRow()
            .addComponents(button("tada"))

            const soundBoard = await message.channel.send("epic soundboard", {components: [row, row2]})

            const filter = (button) => true
            const collector = await soundBoard.createButtonCollector(filter, {})

            collector.on('collect', async button => {
                await button.reply.defer()

                const doIt = () => {
                    let dispatcher = connection.play(`C:/masonbotjs/sounds/${button.id}.mp3`);

                    dispatcher.on("finish", () => {
                        doIt()
                    })    
                }

                doIt()
            })
        }).catch(console.error);
    }
})

client.login()