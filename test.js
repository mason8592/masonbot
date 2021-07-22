const Discord = require('discord.js')
const client = new Discord.Client({
    fetchAllMembers: true,
    sync: true,
    partials: ['MESSAGE', 'CHANNEL', 'REACTION'],
})

client.once('ready', () => {
    console.log(`Testing as ${client.user.tag} at ${new Date().toLocaleString()}`)
})

client.on("message", async message => {
    if (message.content === "sim") {
        let iterations = 0
        let start = 1000000000
        let amount = start
        let peak = 0;
        let amounts = [start.toLocaleString()]
    
        for (var i = 0; amount >= 1; i++) {
            iterations += 1
    
            if (amount > peak) {
                peak = amount
            }   
    
            amount = amount += (Math.random() > 0.5 ? -1 : 1) * (amount * Math.random())
            amounts.push(parseInt(amount.toFixed(0)).toLocaleString())

            if (amount <= 1) {
                const attachment = new Discord.MessageAttachment(Buffer.from(amounts.join("\n")), "sim.txt")

                message.channel.send(`\`\`\`Ran out in ${iterations} iterations. Peak of ${parseInt(peak.toFixed(0)).toLocaleString()} (${(peak / start).toFixed(2)} times increase)\`\`\``, attachment)
            }
        }     
    }
})

client.login()