// Beginning of initializations
    // Discord init
        import util from "util"
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
        const prefix = "m,"

    // API init
        import { GoogleSpreadsheet } from "google-spreadsheet"
        const doc = new GoogleSpreadsheet(process.env.GOOGLE_SPREADSHEETS_WORK_SHEETID)
        doc.useApiKey(process.env.GOOGLE_SPREADSHEETS_APIKEY)

    // Spreadsheet init
        let initialized = false
        const cachedInfo = {}

        async function initializeBasicSpreadsheetInfo() {
            await doc.loadInfo()
            
            await updateToday()

            initialized = true
        }

        // Misc functions init
        async function updateToday() {
            console.log("updating today")
            const date = new Date()
            const currentDay = date.getDay() === 0 ? 6 : date.getDay() - 1
            const dayOfTheMonth = date.getDate()

            const sheet = doc.sheetsByIndex[0]
            const rows = await sheet.getRows()
            const thisWeekRow = (() => {
                let arrayOfWeeksThatMatch = rows.filter(row => Number(row._rawData[currentDay].split("\n")[0]) === dayOfTheMonth)
                return arrayOfWeeksThatMatch[arrayOfWeeksThatMatch.length - 1]
            })()

            const Today = new WorkDay(thisWeekRow._rawData[currentDay])

            Object.assign(cachedInfo, {
                thisWeekRow: thisWeekRow,
                Today: Today
            })

            return Today
        }

        const msToTime = (duration) => {
            const milliseconds = parseInt((duration % 1000) / 100),
                seconds = Math.floor((duration / 1000) % 60),
                minutes = Math.floor((duration / (1000 * 60)) % 60),
                hours = Math.floor((duration / (1000 * 60 * 60)) % 24),
                days = Math.floor(duration / (1000 * 60 * 60 * 24))
        
            return `${" " + days + " days " + hours + " hours " + minutes + " minutes " + seconds + "." + milliseconds + " seconds"}`.replace(/ 0 days/gi, "").replace(/ 0 hours/gi, "").replace(/ 0 minutes/gi, "").replace(/1 hours/gi, "1 hour").replace(/1 minutes/gi, "1 minute").trim()
        }

        function getMillisecondsUntilTomorrow() {
            const now = new Date()
    
            return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0) - now + 1000 // extra second added to prevent any errors occurring from slight earliness
        }
    
        Object.assign(cachedInfo, {
            getMillisecondsUntilTomorrow: getMillisecondsUntilTomorrow
        })
// End of initializations




// Beginning of class declarations
    class WorkWeek {
        constructor(week) { // array of 7 WorkDays
            this.week = week
        }
    }

    class WorkDay {
        constructor(day) {
            this.day = day
            this.dayOfTheMonth = day.split("\n")[0]
            this.hours = day.split("\n")[1]
        }
    }
// End of class declarations




client.once('ready', async () => {
    await initializeBasicSpreadsheetInfo()
    const { getMillisecondsUntilTomorrow } = cachedInfo

    console.log(`Logged in as ${client.user.tag} at ${new Date().toLocaleString()}`)

    const mason = client.users.cache.get("264590999479648268")

    mason.send("Masonbot is online.").then(message => {
        setTimeout(() => {
            message.delete()
        }, 2000)
    })

    // Scheduled DM
    function beginDailyUpdateCycle(isBeginningOfCycle) {
        console.log("next message scheduled to send in", msToTime(cachedInfo.getMillisecondsUntilTomorrow()))

        if (!isBeginningOfCycle) {
            updateToday().then(updatedToday => {
                mason.send(updatedToday.hours)
            })
        }

        setTimeout(() => {
            beginDailyUpdateCycle(false)
        }, getMillisecondsUntilTomorrow())
    }

    beginDailyUpdateCycle(true)
})




client.on("message", async message => {
    if (message.author.bot) return

    if (!initialized) return message.channel.send("Spreadsheet not yet initialized.")

    if (message.author.id !== "264590999479648268") {
        return client.users.cache.get("264590999479648268").send(`${message.author.username} (${message.author.id}) says:\n${message.content}`)
    }

    const contentArray = message.content.trim().slice(prefix.length).split(/ +/)
    const cmd = contentArray[0].toLowerCase()
    const args = message.content.trim().slice(prefix.length).split(/ +/).slice(1)
    const subCmd = args[0] ? args[0].toLowerCase() : false
    const terCmd = args[1] ? args[1].toLowerCase() : false

    if (cmd === "ev") {
		try {
            const code = message.content.split(" ").slice(1).join(" ")
			const evaled = util.inspect(eval(code))

			if (evaled === "Promise { <pending> }") return

			if (!!evaled && evaled.length > 2000) {
				message.channel.sendFile(evaled)
			} else {
				message.channel.send(evaled)
			}
		} catch (err) {
			message.channel.send(`\`\`\`\n${err}\n\`\`\``)
		}
    } else if (cmd === "today")  {
        message.channel.send(`today is the ${cachedInfo.Today.dayOfTheMonth}th and your hours are: ${cachedInfo.Today.hours}`)
    } else if (cmd === "week") {
        message.channel.send(cachedInfo.thisWeekRow._rawData.map(day => `${day}\n`))
    } else if (cmd === "sch") {
        message.channel.send({embed: {
            color: "e7e7e7",
            title: "Time until scheduled message:",
            description: msToTime(cachedInfo.getMillisecondsUntilTomorrow())
        }})
    }
})

client.login()  