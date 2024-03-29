import { createRequire } from "module"
const require = createRequire(
	import.meta.url
)

// Imports
import dotenv, { parse } from "dotenv"
dotenv.config()
import * as math from "mathjs"
import { client, prefix, mostRecentCommand, Button, ActionRow } from "./main.mjs"
import Fuse from 'fuse.js'
import util from "util"
import * as Discord from "discord.js"
import { GoogleSpreadsheet } from "google-spreadsheet"
import albumcover from "album-cover"
import googleImages from 'google-images'
import YouTube from 'simple-youtube-api'
import ColorThief from 'colorthief'
import * as Canvas from 'canvas'
const { createCanvas } = Canvas.default
import MongoClient from 'mongodb'
const Mongo = MongoClient.MongoClient
import express, { response } from 'express'
const app = express()
import * as main from "./main.mjs"

// Initialization
global.channel = {}
global.guild = {}
const doc = new GoogleSpreadsheet(process.env.GOOGLE_SPREADSHEETS_SHEETID)
const gi = new googleImages(process.env.GOOGLE_IMAGES_ENGINEID, process.env.GOOGLE_IMAGES_APIKEY)
const youtube = new YouTube(process.env.YOUTUBE_APIKEY)
doc.useApiKey(process.env.GOOGLE_SPREADSHEETS_APIKEY)
const covers = albumcover(process.env.LASTFM_APIKEY)
let docLoaded = false
const hasMacroInProgress = new Set()
export const prefs = {}

export const refreshPrefs = () => {
	dboUsers.listCollections().toArray(function(err, collections) {
		if (err) console.log(err)

		collections.forEach(async collection => {
			getUser(collection.name).then(user => {
				if (!user.info || !user.info.id) return

				prefs[collection.name] = user.prefs
			})
		})
	})

	return prefs
}

export const addToAll = async (addition, value) => {
	await dboUsers.listCollections().toArray(function(err, collections) {
		if (err) console.error(err)

		collections.forEach(collection => {
			getUser(collection.name).then(async user => {
				if (!user.info || !user.info.id) return
				if ((await dboUsers.collection(collection.name).findOne({
						[addition]: { $exists: true }
					})) !== null) return

				dboUsers.collection(collection.name).updateOne({ "info.id": collection.name }, {
					$set: {
                        [addition]: convertType(value)
					}
				})
			})
		})
	})

	console.log(`Added "${addition}" as "${value}" to all members of the Mason Dimension.`)
}

Mongo.connect(process.env.MONGODB_URL, {
	useUnifiedTopology: true
}, function(err, database) {
	if (err) throw err

	app.listen(3000)
	console.log("Listening on port 3000")
	global.dboUsers = database.db("users")
	global.dboChannels = database.db("channels")

	refreshPrefs()
})

export const info = {
	masdim: {
		id: "427277658766704649"
	},
	mason: {
		id: "264590999479648268",
		color: "0090ff"
	},
	masonbot: {
		id: "483246918349225994",
		color: "e7e7e7"
	}
} // Stores information about things related to Masonbot

export const errorEmbed = (error) => {
	return {
		embed: {
			title: "Error",
			description: error,
			color: "ff0000"
		}
	}
} // Returns a simple embed with the title "Error" and a red color

export const getUser = (userID) => {
	return new Promise((resolve, reject) => {
		dboUsers.collection(userID).find({}).toArray(function(err, result) {
			if (err || result.length !== 1) {
				reject(err)
				return
			}
			resolve(
				result[0]
			)
		})
	}).catch((err) => {
		return null
	})
} // Pulls a user from the database

export const getChannel = (channelID) => {
	return new Promise((resolve, reject) => {
		dboChannels.collection(channelID).find({}).toArray(function(err, result) {
			if (err || result.length !== 1) {
				reject(err)
				return
			}
			resolve(
				result[0]
			)
		})
	}).catch((err) => {
		return null
	})
} // Pulls a channel from the database

export const parseAmount = (amount, balance = 0, isMultiplier = false) => {
	let parsed = amount.toLowerCase().replace(/[,x]/g, "")
	const suffixRegex = /([\d.]+[m|k]+)|[(\d.)]+[m|k]+/g

	balance = parseInt(balance)

	switch (parsed) {
		case "all":
			parsed = balance
			break
		case "random":
			parsed = Math.random() * balance
			break
		case "half":
			parsed = 0.5 * balance
			break
	}

	const suffixHandle = (match, offset, string) => {
		if (match.indexOf("m") > -1) {
			return math.evaluate(match.replace(/[m]/g, "(1000000)"))
		} else if (match.indexOf("k") > -1) {
			return math.evaluate(match.replace(/[k]/g, "(1000)"))
		}
	}

	if (/[\[].+[\]]/gm.test(amount)) {
		let equation = amount.replace(/[x]/g, "").replace(/[\[]|[\]]/g, "").replace(/[$]/g, "(" + balance + ")").replace(/[?]/g, "(" + Math.random() + ")").replace(suffixRegex, suffixHandle)

		parsed = Math.round(math.evaluate(equation))
	}

	parsed = typeof parsed === "string" ? parsed.replace(suffixRegex, suffixHandle) : parsed

	parsed = amount.startsWith("x") ? parseInt(balance - parsed) : parseInt(parsed)

	if (isNaN(parsed)) {
		return {
			amount: parsed,
			error: "NaN",
			message: `Invalid ${isMultiplier ? "multiplier" : "amount"}.`
		}
	} else if (!isMultiplier && parsed > balance) {
		return {
			amount: parsed,
			error: "exceedsBalance",
			message: `Amount exceeds balance.\n${parsed.toLocaleString()} > ${balance.toLocaleString()}`
		}
	} else if (isMultiplier ? parsed < 2 : parsed <= 0) {
		return {
			amount: parsed,
			error: "tooLow",
			message: `${isMultiplier ? "Multiplier" : "Amount"} of ${parsed.toLocaleString()} is too low.`
		}
	} else {
		return parsed
	}
} // Takes a number and the user's balance, and returns an amount, taking into consideration things like "all" or [equations]

export const parseMember = (search) => {
	if (!search) return undefined
	const guild = client.guilds.cache.find(guild => guild.id === global.guild.id)

	if (/(<@|<@!)\d+>/.test(search)) {
		const member = guild.members.cache.find(member => member.user.id === search.match(/\d+/g)[0])

		return member
	} else if (/^\d+$/.test(search)) {
		const member = guild.members.cache.find(member => member.user.id === search)

		return member
	} else {
		const usernames = new Fuse(guild.members.cache.map(m => m.user.username))
		const searched = usernames.search(search)[0]
		if (!searched) return null
		const member = guild.members.cache.find(member => member.user.username === searched.item)

		return member
	}
} // Takes a username (fuzzy search), user ID, or user mention, and returns the member within the guild

export const parseChannel = (search) => {
	const guild = client.guilds.cache.find(guild => guild.id === global.guild.id)

	if (/<#\d+>/.test(search)) {
		const channel = guild.channels.cache.find(channel => channel.id === search.match(/\d+/g))

		return channel
	} else if (/\d+/.test(search)) {
		const channel = guild.channels.cache.find(channel => channel.id === search)

		return channel
	} else {
		const channelNames = new Fuse(guild.channels.cache.map(channel => channel.name))
		const searched = channelNames.search(search)[0]
		const channel = guild.channels.cache.find(channel => channel.name === searched.item)

		return channel
	}
} // Takes a channel name (fuzzy search), channel ID, or channel mention, and returns the channel

export const newRecord = (userCollection) => {
	if (userCollection.currency > userCollection.highestCurrency) {
		dboUsers.collection(userCollection.info.id).updateOne({}, {
			$set: {
				highestCurrency: userCollection.currency,
			},
		})
	}
} // Update's a user's record

export const changeBalance = async (userID, amount) => {
	return new Promise((resolve, reject) => {
		dboUsers.collection(userID).updateOne({}, {
			$inc: {
				currency: Math.round(amount)
			}
		}).then(() => {
			getUser(userID).then(promise => {
				newRecord(promise)
			})
			resolve()
		}).catch(err => {
			reject(err)
		})
	}).catch((err) => {
		return null
	})
} // Updates a user's balance and changes their record if applicable

export const operationFormat = (start, amount) => {
	const sign = amount > 0 ? "+" : "-"
	const absAmount = Math.abs(amount)

	const formatStart = start.toLocaleString()
	const formatAmount = absAmount.toLocaleString()
	const formatEnd = (start + amount).toLocaleString()

	const maxLength = [formatStart.length, formatAmount.length, formatEnd.length].sort((a, b) => a - b).reverse()[0]

	let numSpaces = [maxLength - formatStart.length, maxLength - formatAmount.length, maxLength - formatEnd.length]

	try {
		return `\`\`\`  ${" ".repeat(numSpaces[0])}${formatStart}\n${sign} ${" ".repeat(numSpaces[1])}${formatAmount}\n= ${" ".repeat(numSpaces[2])}${formatEnd}\`\`\``
	} catch (err) {
		console.log(err)

		return undefined
	}
} // Formats an operation as though it were written down back when we were kids in school

export const quoteEmbed = (message, boardObject = false) => {
	const imageRegex = /https:\/\/(cdn|media).discordapp.(com|net)\/attachments\/\d+\/\d+\/.+[.](jpg|jpeg|png)[^ ]*/gm
	const linkVideoRegex = /https:\/\/cdn.discordapp.com\/attachments\/\d+\/\d+\/.+[.](webm|mkv|flv|ogg|avi|mov|wmv|mp4|m4a|flac|mp3|wav|ogg|aiff|alac)/gm
	// const attachmentVideoRegex = /([.](webm|mkv|flv|ogg|avi|mov|wmv|mp4|m4a|flac|mp3|wav|ogg|aiff|alac))$/

	let attachmentsArray = []

	if (message.attachments.size) {
		attachmentsArray = [...message.attachments.map(attachment => attachment.url)]
	}

	if (linkVideoRegex.test(message.content)) {
		attachmentsArray = [...attachmentsArray, ...message.content.match(linkVideoRegex)]
	}

	if (imageRegex.test(message.content)) {
		attachmentsArray = [...attachmentsArray, message.content.match(imageRegex)[0].split(/\s./)]
	}

	const embed = message.embeds[0]

	const quoteEmbed =
		embed ?
		new Discord.MessageEmbed({
			color: message.member.displayHexColor,
			description: embed.description ? `${message.content}\n${embed.description}` : message.content.replace(imageRegex, "").replace(linkVideoRegex, ""),
			...embed.fields && {
				fields: embed.fields
			},
			...embed.title && {
				title: embed.title
			},
			...embed.image && {
				image: {
					url: embed.image.url
				}
			},
			author: {
				name: message.author.username,
				icon_url: message.author.avatarURL({
					dynamic: true
				}),
				url: message.url
			},
			footer: {
				text: (boardObject ? `${boardObject.count}  ${boardObject.emoji}  ${message.id}  |  ` : "") + "#" + message.channel.name
			},
			timestamp: message.createdAt
		}) :
		new Discord.MessageEmbed({
			color: message.member.displayHexColor,
			description: message.content.replace(imageRegex, "").replace(linkVideoRegex, ""),
			author: {
				name: message.author.username,
				icon_url: message.author.avatarURL({
					dynamic: true
				}),
				url: message.url
			},
			footer: {
				text: (boardObject ? `${boardObject.count}  ${boardObject.emoji}  ${message.id}  |  ` : "") + "#" + message.channel.name
			},
			timestamp: message.createdAt
		})

	return {
		quote: quoteEmbed,
		attachments: attachmentsArray
	}
} // Returns an embed with data about a message

export const sudo = (originalMessage, sudoMember, command) => {
	const sudoMessage = originalMessage

	Object.defineProperty(sudoMessage, "member", {
		value: sudoMember
	})
	Object.defineProperty(sudoMessage, "author", {
		value: sudoMember.user
	})
	Object.defineProperty(sudoMessage, "content", {
		value: command
	})
	Object.defineProperty(sudoMessage, "isSudo", {
		value: true
	})
	client.emit("message", sudoMessage)
} // Execute a message as another user

export const genInfo = (level) => {
	return {
		cost: 1000 * (3 ** level),
		limit: 2000 * (2 ** level),
		hourlyAmount: Math.round((1000 * 3 ** (level + 1)) ** 0.6),
		dailyAmount: Math.round((1000 * 3 ** (level + 1) ** 0.75))
	}
} // Returns information on a generator of a given level

export const profileEmbed = (memberCollection) => {
	const guild = client.guilds.cache.find(guild => guild.id === global.guild.id)
	const member = guild.members.cache.find(member => member.user.id === memberCollection.info.id)

	return {
		embed: {
			title: `${memberCollection.currency.toLocaleString()} currency`,
			timestamp: new Date(),
			color: member.displayHexColor,
			description: `\`\`\`\nRecord: ${memberCollection.highestCurrency.toLocaleString()}\nGenerator: ${memberCollection.generatorLevel.toLocaleString()}\`\`\``,
			author: {
				name: member.user.username,
				icon_url: member.user.avatarURL({
					dynamic: true
				})
			}
		}
	}
} // A user's page

export const sleep = (ms) => {
	return new Promise(resolve => setTimeout(resolve, ms))
} // Wait for a certain number of milliseconds

Object.defineProperty(Object.prototype, 'sendFile', {
	value: function(string, extension = "js") {
		const attachment = new Discord.MessageAttachment(Buffer.from(typeof string === "object" ? util.inspect(string) : string, "utf-8"), "file." + extension)

		return this.send(attachment)
	}
}) // Send a message as a file

export const rpsDependencies = {
	rock: {
		style: "blurple",
		label: "Rock",
		id: "Rock"
	},
	paper: {
		style: "blurple",
		label: "Paper",
		id: "Paper"
	},
	scissors: {
		style: "blurple",
		label: "Scissors",
		id: "Scissors"
	},
	rematch: {
		style: "blurple",
		label: "Rematch",
		id: "rematch"
	},
	emojiDict: {
		Rock: "🪨",
		Paper: "📰",
		Scissors: "✂️"
	},
	rpsdict: {
		Rock: 0,
		Paper: 1,
		Scissors: 2
	},
	whoWins: (p1, p2) => {
		let [c1, c2] = [p1.buttonID, p2.buttonID]
		let matrix = [
            [false, p1, p2],
            [p2, false, p1],
            [p1, p2, false]
        ]

		return matrix[rpsDependencies.rpsdict[c2]][rpsDependencies.rpsdict[c1]]
	}
} // Things that rps uses

export const rgbToHex = (array) => {
	let hex = ((1 << 24) + (array[0] << 16) + (array[1] << 8) + array[2]).toString(16).slice(1)
	return hex
} // Takes an array of red, green, and blue values and returns a hex code

Object.defineProperty(Object.prototype, 'moneyInGen', {
	value: function() {
		if (!this.generatorLevel) {
			return null
		} else {
			const moneyInGen = Math.floor(Math.pow((new Date() - this.generatorTime.getTime()) / 60000, 1 + (this.generatorLevel / 8)))
			return moneyInGen > genInfo(this.generatorLevel).limit ? genInfo(this.generatorLevel).limit : moneyInGen
		}
	}
})

export const checkEmbed = async (message, plus) => {
	const userCollection = await getUser(message.author.id)
	const {
		dailyTime,
		hourlyTime,
		currency,
		generatorLevel,
		generatorTime
	} = userCollection,
	moneyInGen = userCollection.moneyInGen()

	const dailyElapsed = new Date() - dailyTime.getTime()
	const hourlyElapsed = new Date() - hourlyTime.getTime()
	const dailyReady = new Date() - dailyTime.getTime() > 86400000
	const hourlyReady = new Date() - hourlyTime.getTime() > 3600000
	const genPercent = math.format(100 * moneyInGen / genInfo(generatorLevel).limit, {
		precision: 2
	})

	return {
		embed: {
			color: info.masonbot.color,
			author: {
				name: `Currency: ${currency.toLocaleString()}`,
				icon_url: message.author.avatarURL({
					dynamic: true,
				}),
			},
			description: ":cyclone: " + `**${moneyInGen.toLocaleString()}/${genInfo(generatorLevel).limit.toLocaleString()}** (${genPercent}%)` +
				" \n" +
				"⠀ ⠀\\➡ " + `\`${msToTime(new Date().getTime() - generatorTime.getTime())}\`` +
				"\n" +
				":hourglass: \\➡ " + (hourlyReady ? "**Ready!**" : `\`${msToTime(3600000 - hourlyElapsed)}\``) +
				"\n" +
				":sunny: \\➡ " + (dailyReady ? "**Ready!**" : `\`${msToTime(86400000 - dailyElapsed)}\``),
			footer: {
				text: `${plus ? "+ " + plus.toLocaleString() : ""}`
			}
		},
		button: [
            new Button({
				style: moneyInGen === genInfo(generatorLevel).limit ? "green" : "red",
				label: "Gen",
				id: "gen",
				disabled: moneyInGen === 0
			}),
            new Button({
				style: hourlyReady ? "green" : "red",
				label: "Hour",
				id: "hourly",
				disabled: !hourlyReady
			}),
            new Button({
				style: dailyReady ? "green" : "red",
				label: "Day",
				id: "daily",
				disabled: !dailyReady
			}),
            new Button({
				style: "blurple",
				label: "Ref",
				id: "refresh"
			})
        ]
	}
}

export const msToTime = (duration) => {
	const milliseconds = parseInt((duration % 1000) / 100),
		seconds = Math.floor((duration / 1000) % 60),
		minutes = Math.floor((duration / (1000 * 60)) % 60),
		hours = Math.floor((duration / (1000 * 60 * 60)) % 24),
		days = Math.floor(duration / (1000 * 60 * 60 * 24))

	return `${" " + days + " days " + hours + " hours " + minutes + " minutes " + seconds + "." + milliseconds + " seconds"}`.replace(/ 0 days/gi, "").replace(/ 0 hours/gi, "").replace(/ 0 minutes/gi, "").replace(/1 hours/gi, "1 hour").replace(/1 minutes/gi, "1 minute").trim()
}

export const convertType = (string) => {
	const replacements = {
		"true": true,
		"false": false,
		"[]": new Array(),
		"{}": new Object()
	}

	return replacements.hasOwnProperty(string) ? replacements[string] : string
}


export class MessageCommand {
	constructor(message) {
		this.message = message
		this.args = message.content.trim().slice(prefix.length).split(/ +/).slice(1)
		global.guild.id = !!message.guild ? message.guild.id : undefined
		global.channel.id = message.channel.id
	}
	async eval() {
		const { message, args } = this
		const code = message.content.split(" ").slice(1).join(" ")

		try {
			if (message.author.id !== "264590999479648268") {
				throw "Eval is only available to the bot owner."
			}
		} catch (err) {
			return message.channel.send(
				errorEmbed(err)
			)
		}

		try {
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
	}
	async bet() {
		const { message, args } = this
		const { currency } = await getUser(message.author.id)
		const amount = parseAmount(args[1], currency)
		const multiplier = !!args[2] ? parseAmount(args[2], currency, true) : 2

		try {
			if (typeof amount === "object") {
				throw amount.message
			} else if (typeof multiplier === "object") {
				throw multiplier.message
			}
		} catch (err) {
			return message.channel.send(
				errorEmbed(err)
			)
		}

		const wonBet = Math.random() < 1 / multiplier

		const finalAmount = wonBet ? amount * (multiplier - 1) : -1 * amount

		message.channel.send({
			embed: {
				author: {
					name: `${wonBet ? "You won!" : "You lost."}`,
					icon_url: message.author.displayAvatarURL({ dynamic: true })
				},
				description: operationFormat(currency, finalAmount),
				color: wonBet ? "00ff00" : "ff0000",
				footer: {
					text: `${amount.toLocaleString()} @ ${multiplier.toLocaleString()} (${math.format(math.evaluate(1/multiplier) * 100, { precision: 3 })}%)`
				}
			}
		}).then(() => {
			changeBalance(message.author.id, finalAmount)
		}).catch(err => {
			console.log(err)
		})
	}
	async pay() {
		const { message, args } = this
		if (!args[2]) return
		const authorCollection = await getUser(message.author.id)
		const amount = parseAmount(args[2], authorCollection.currency)
		const target = parseMember(args[1])
		const targetCollection = !!target ? await getUser(target.user.id) : false

		try {
			if (!target || !targetCollection || !targetCollection.currency) {
				throw "Invalid target."
			} else if (typeof amount === "object") {
				throw amount.message
			}
		} catch (err) {
			return message.channel.send(
				errorEmbed(err)
			)
		}

		message.channel.send({
			embed: {
				color: info.masonbot.color,
				author: {
					name: `${amount.toLocaleString()} currency`,
					icon_url: message.author.avatarURL({
						dynamic: true
					})
				},
				footer: {
					icon_url: target.user.avatarURL({
						dynamic: true
					})
				},
				fields: [{
						name: message.author.username,
						value: operationFormat(authorCollection.currency, -1 * amount),
						inline: true
                    },
					{
						name: target.user.username,
						value: operationFormat(targetCollection.currency, amount),
						inline: true
                    }
                ]
			}
		}).then(async () => {
			await changeBalance(message.author.id, -1 * amount)
			await changeBalance(target.user.id, amount)
		})
	}
	async quote() {
		const { message } = this
		const vals = message.content.split("/").slice(4)
		let quoteMessage

		try {
			quoteMessage = await message.guild.channels.cache.get(vals[1]).messages.fetch(vals[2])
		} catch (err) {
			return message.channel.send(
				errorEmbed("Invalid link.")
			)
		}

		const { quote, attachments } = quoteEmbed(quoteMessage)
		const quoteMention = prefs[quoteMessage.author.id] !== undefined ? prefs[quoteMessage.author.id].quoteMention : false

		await message.channel.send(quoteMention ? quoteMessage.author.toString() : "", quote)

		if (attachments.length > 0) {
			await message.channel.send(attachments.join(" "))
		}

		return message.delete().catch(() => {})
	}
	async sudo() {
		const { message, args } = this
		const member = parseMember(args[0])
		const command = message.content.split(" ").slice(2).join(" ")

		if (message.author.id === info.mason.id) {
			sudo(message, member, command)
		} else {
			return message.channel.send(
				errorEmbed("You're not Mason.")
			)
		}
	}
	async spawnRift() {
		const { message } = this

		message.channel.send({
			embed: {
				color: "5865F2",
				author: {
					name: "A rift!⠀",
					icon_url: message.author.avatarURL({
						dynamic: true
					})
				},
			},
			buttons: [
                new Button({
					style: "blurple",
					label: "Reach inside",
					id: "reach"
				})
            ]
		}).then(async riftMessage => {
			const filter = (button) => button.clicker.user.id === message.author.id
			const collector = await riftMessage.createButtonCollector(filter, {
				max: 1
			})

			const deleteRift = setTimeout(() => {
				riftMessage.delete()
			}, 8000)
			collector.on('collect', async button => {
				await button.reply.defer()
				const userCollection = await getUser(message.author.id)
				const amountInRift = Math.round(genInfo(userCollection.generatorLevel + 1).cost ** 0.7)
				const timeInSeconds = math.format((new Date().getTime() - riftMessage.createdAt.getTime()) / 1000, {
					precision: 4,
				})

				riftMessage.edit({
					embed: {
						color: "5865F2",
						author: {
							name: "There was something inside...",
							icon_url: message.author.avatarURL({
								dynamic: true
							})
						},
						description: `**${amountInRift.toLocaleString()}** currency!`,
						footer: {
							text: `${timeInSeconds} seconds`
						}
					},
					buttons: null
				})

				await changeBalance(message.author.id, amountInRift)

				client.channels.cache.get("845155667602178126").send({
					embed: {
						author: {
							name: `${message.author.username} encountered a rift in #${message.channel.name}`,
							icon_url: message.author.avatarURL({
								dynamic: true
							})
						},
						description: `There was **${amountInRift.toLocaleString()}** currency inside!`,
						footer: {
							text: `${timeInSeconds} seconds`
						},
						color: info.masonbot.color
					}
				})

				clearTimeout(deleteRift)
				setTimeout(() => {
					riftMessage.delete()
				}, 8000)
			})
		})
	}
	async setCurrency() {
		const { message, args } = this
		if (message.author.id !== info.mason.id) return

		const target = parseMember(args[1])
		const targetCollection = await getUser(target.user.id)
		const amount = parseAmount(args[2], targetCollection.currency)

		if (typeof amount === "object") {
			return message.channel.send(amount.message)
		}

		await dboUsers.collection(target.user.id).updateOne({}, {
			$set: {
				currency: amount
			}
		})

		message.channel.send({
			embed: {
				title: `Set ${target.user.username}'s currency to ${amount.toLocaleString()}`,
				color: info.masonbot.color
			}
		})
	}
	async page() {
		const { message, args } = this
		let userCollection

		if (args[1] && parseMember(args[1])) {
			userCollection = await getUser(parseMember(args[1]).user.id)
		} else {
			userCollection = await getUser(message.author.id)
		}

		message.channel.send(profileEmbed(userCollection))
	}
	async top() {
		const { message, args } = this

		const currencyPromises = message.guild.members.cache.map(member => getUser(member.user.id))
		const resolvedCurrency = await Promise.all(currencyPromises)
		const currencyList = resolvedCurrency.filter(user => !!user && !!user.currency)
		const serverBalance = math.evaluate(currencyList.map(member => member.currency).join(" + "))
		const sorted = currencyList.sort((a, b) => (a.currency > b.currency) ? -1 : 1)
		const topCurrencyLength = sorted[0].currency.toLocaleString().length
		const percentage = (user) => (user.currency / serverBalance * 100).toFixed(1)

		message.channel.send({
			embed: {
				color: info.masonbot.color,
				title: `Total: ${serverBalance.toLocaleString()}`,
				description: sorted.map(user => `${user.info.emoji}\`${user.generatorLevel}${" ".repeat((6 - user.generatorLevel.toString().length) + (topCurrencyLength - user.currency.toLocaleString().length))}${user.currency.toLocaleString()}${" ".repeat(8 - percentage(user).length)}${percentage(user)} %\`${user.info.id === message.author.id ? " **<-**" : ""}`).join(`\n`)
			}
		})
	}
	async say() {
		const { message, args } = this
		if (args.length <= 0) return
		const authorCollection = await getUser(message.author.id)

		// Expand on this. Have it be a function that can take something like {randommember.mention} and return that mention, rather than an object that can only take one specific string. Also {randomnumberx-y} where the user can input their own x and y and it will give a random number between the two. Just use regex to match the {} and then handle it from there.

		const sayReplacements = {
			"{currency}": authorCollection.currency.toLocaleString(),
			"{genLevel}": authorCollection.generatorLevel,
			"{randomMember}": message.guild.members.cache.filter(member => !member.user.bot).random().user.username
		}

		let sayResult = message.content.split(" ").slice(1).join(" ")

		for (const replacement in sayReplacements) {
			sayResult = sayResult.replace(new RegExp(replacement, "gmi"), sayReplacements[replacement])
		}

		message.channel.send(sayResult)
		// message.channel.send(message.content.split(" ").slice(1).map(word => sayReplacements.hasOwnProperty(word) ? sayReplacements[word.toLowerCase()]() : word).join(" "))
	}
	async setTopic() {
		const { message, args } = this

		const desiredTopic = args.join(" ")
		const authorCollection = await getUser(message.author.id)
		const usersChannel = client.channels.cache.get(authorCollection.info.channelid)

		try {
			if (!message.guild.me.hasPermission(['MANAGE_CHANNELS'])) {
				throw "I don't have the Manage Channels permission."
			}
		} catch (err) {
			return message.channel.send(
				errorEmbed(err)
			)
		}

		message.delete()

		if (desiredTopic.length === 0) {
			usersChannel.setTopic("")
			return message.channel.send("Clearing topic.")
		} else {
			usersChannel.setTopic(desiredTopic)
			message.channel.send(`Changing your channel topic to \n\`\`\`${desiredTopic}\`\`\`\nThis may take a minute.`)
		}
	}
	async setEmoji() {
		const { message, args } = this

		if (!args[0]) return
		const authorCollection = await getUser(message.author.id)
		const usersChannel = message.guild.channels.cache.find(channel => channel.id === authorCollection.info.channelid)
		const nameFinal = args[0] + usersChannel.name.substring(usersChannel.name.indexOf("-"))

		try {
			if (!message.guild.me.hasPermission(['MANAGE_CHANNELS'])) {
				throw "Bot doesn't have Manage Channels permission."
			} else if (args[0].length > 8) {
				throw "Channel emoji must be 8 characters or fewer. Emojis count as 2 characters."
			}
		} catch (err) {
			return message.channel.send(
				errorEmbed(err)
			)
		}

		await usersChannel.setName(nameFinal)

		message.channel.send({
			embed: {
				color: message.member.displayHexColor,
				title: `Changing channel name to \`${nameFinal}\`. This may take a minute.`
			}
		})
	}
	async setColor() {
		const { message, args } = this

		if (!args[0]) return
		const previousColor = message.member.displayHexColor
		const desiredColor = args[0].replace(/#/g, "").toLowerCase()

		try {
			if (message.guild.me.roles.highest.rawPosition < message.member.roles.highest.rawPosition && !message.guild.me.hasPermission(['MANAGE_ROLES'])) {
				throw "Bot's role is lower than user's role and bot doesn't have Manage Roles permission."
			} else if (message.guild.me.roles.highest.rawPosition < message.member.roles.highest.rawPosition) {
				throw "Bot's role is lower than user's role."
			} else if (!message.guild.me.hasPermission(['MANAGE_ROLES'])) {
				throw "Bot doesn't have Manage Roles permission."
			} else if (!/^[0-9A-F]{6}$/i.test(desiredColor)) {
				throw "Invalid hex code."
			} else if (previousColor == "#" + desiredColor) {
				throw `Role color is already #${desiredColor}.`
			}
		} catch (err) {
			return message.channel.send(
				errorEmbed(err)
			)
		}

		await message.member.roles.highest.setColor(desiredColor)
		message.channel.send({
			embed: {
				color: desiredColor,
				description: `Changed the color of your hoisted role from **${previousColor}** to **#${desiredColor}**`
			}
		})
	}
	async setName() {
		const { message, args } = this

		if (!args[0]) return
		const previousName = message.member.roles.highest.name
		const desiredName = args.join(" ")

		try {
			if (message.guild.me.roles.highest.rawPosition <= message.member.roles.highest.rawPosition && !message.guild.me.hasPermission(['MANAGE_ROLES'])) {
				throw "Bot's role is lower than user's role and bot doesn't have Manage Roles permission."
			} else if (message.guild.me.roles.highest.rawPosition <= message.member.roles.highest.rawPosition) {
				throw "Bot's role is lower than user's role."
			} else if (!message.guild.me.hasPermission(['MANAGE_ROLES'])) {
				throw "Bot doesn't have Manage Roles permission."
			} else if (previousName === desiredName) {
				throw `Role name is already ${desiredName}.`
			} else if (desiredName.length < 2) {
				throw "Role name must be longer than 2 character."
			} else if (desiredName.length > 100) {
				throw "Role name must be shorter than 100 characters."
			}
		} catch (err) {
			return message.channel.send(
				errorEmbed(err)
			)
		}

		await message.member.roles.highest.setName(desiredName)
		message.channel.send({
			embed: {
				color: message.member.displayHexColor,
				description: `Changed the name of your hoisted role from **${previousName}** to **${desiredName}**`,
			}
		})
	}
	async math() {
		const { message, args } = this
		const argString = args.join(" ")
		let answer

		try {
			if (argString.indexOf("|") !== -1 || argString.indexOf("\n") !== -1) {
				answer = argString.split(/[\n|]/gm).map(equation => {
					return math.format(math.evaluate(equation), { precision: 6 })
				}).join("\n")
			} else {
				answer = math.evaluate(argString, { precision: 6 })
			}
		} catch (err) {
			return message.channel.send(
				errorEmbed("Invalid calculation.")
			)
		}

		return message.channel.send({
			embed: {
				title: argString + " =",
				color: info.masonbot.color,
				description: answer.toLocaleString()
			}
		}).catch(e => {
			console.log(e.message)
		})
	}
	async karma() {
		const { message, args } = this
		const target = args.length > 0 ? parseMember(args[0]) : message.member
		const targetCollection = !!target ? await getUser(target.user.id) : null

		if (args[0] === "top") {
			const userCollections = message.guild.members.cache.map(member => getUser(member.user.id))
			const resolvedUsers = await Promise.all(userCollections)
			const resolvedList = resolvedUsers.filter(user => !!user && !!user.info)

			return message.channel.send({
				embed: {
					color: info.masonbot.color,
					description: resolvedList.sort((a, b) => (a.upvotes - a.downvotes > b.upvotes - b.downvotes) ? -1 : 1).map(user => `${user.info.emoji} \`${user.upvotes - user.downvotes}${" ".repeat(6 - (user.upvotes - user.downvotes).toString().length)}🔼${user.upvotes}${" ".repeat(6 - user.upvotes.toString().length)}🔽${user.downvotes}${" ".repeat(4 - user.downvotes.toString().length)}\``).join(`\n`)
				}
			})
		}

		try {
			if (!target) {
				throw "Invalid user."
			} else if (!targetCollection) {
				throw "User is not in database."
			}
		} catch (err) {
			return message.channel.send(
				errorEmbed(err)
			)
		}

		const { upvotes, downvotes } = targetCollection
		const karma = upvotes - downvotes

		return message.channel.send({
			embed: {
				color: target.displayHexColor,
				description: `\`\`\`${upvotes} upvotes\n${downvotes} downvotes\`\`\``,
				author: {
					name: target.user.username,
					icon_url: target.user.avatarURL({
						dynamic: true
					})
				},
				footer: {
					text: `${karma} karma`
				}
			}
		})
	}
	async image() {
		const { message, args } = this
		const images = await gi.search(args.join(" "), {
			page: 1,
		})
		let index = 0

		if (images.length <= 0) {
			return message.channel.send(
				errorEmbed(`No results found for **${args.join(" ")}**`)
			)
		}

		const imageEmbed = (index) => {
			return {
				embed: {
					color: "e7e7e7",
					title: images[index].description,
					description: images[index].parentPage,
					image: {
						url: images[index].url,
					},
					footer: {
						text: `Page ${index + 1}`
					},
					timestamp: message.createdAt
				},
				buttons: [
                    new Button({
						style: "blurple",
						label: "Prev",
						id: "prev",
						disabled: index === 0
					}),
                    new Button({
						style: "blurple",
						label: "Next",
						id: "next",
						disabled: index === 9
					})
                ]
			}
		}

		const imageMessage = await message.channel.send(imageEmbed(index))

		const updateImage = async () => {
			await imageMessage.edit(imageEmbed(index))
		}

		const filter = (button) => button.clicker.user.id === message.author.id
		const collector = await imageMessage.createButtonCollector(filter, {})

		collector.on('collect', async button => {
			index = button.id === "next" ? index + 1 : index - 1

			await updateImage()

			await button.reply.defer()
		})
	}
	async youtube() {
		const { message, args } = this
		let index = 0
		const buttons = (index) => {
			return {
				buttons: [
                    new Button({
						style: "blurple",
						label: "Prev",
						id: "prev",
						disabled: index === 0
					}),
                    new Button({
						style: "blurple",
						label: "Next",
						id: "next",
						disabled: index === 9
					})
                ]
			}
		}

		const videos = await youtube.searchVideos(args.join(" "), 10).catch(err => { return message.channel.send(errorEmbed("Something went wrong.")) })
		const ytMessage = await message.channel.send(`**Video \`${index + 1}\`:** ` + videos[index].url, buttons(index))

		const filter = (button) => button.clicker.user.id === message.author.id
		const collector = await ytMessage.createButtonCollector(filter, {})

		collector.on('collect', async button => {
			index = button.id === "next" ? index + 1 : index - 1

			await ytMessage.edit(`**Video \`${index + 1}\`:** ` + videos[index].url, buttons(index))

			await button.reply.defer()
		})
	}
	async rps() {
		const { rock, paper, scissors, rematch, emojiDict, whoWins } = rpsDependencies
		const { message, args } = this

		const rpsStart = () => {
			message.channel.send({
				embed: {
					title: "A game of rock paper scissors is starting!",
					description: "Press one of the buttons and wait for your opponent.",
					color: info.masonbot.color
				},
				buttons: [
                    new Button(rock), new Button(paper), new Button(scissors)
                ]
			}).then(async message => {
				const rps = []
				const filter = (button) => !rps.map(rps => rps.userID).includes(button.clicker.user.id)
				const collector = await message.createButtonCollector(filter, {
					time: 60000,
					max: 2
				})

				collector.on('collect', async button => {
					rps.push({
						userID: button.clicker.user.id,
						buttonID: button.id
					})

					await button.reply.defer()
				})

				collector.on('end', async collected => {
					message.delete()
					if (rps.length < 2) return

					const firstUser = message.guild.members.cache.get(rps[0].userID)
					const secondUser = message.guild.members.cache.get(rps[1].userID)
					const winner = !!whoWins(rps[0], rps[1]) ? parseMember(whoWins(rps[0], rps[1]).userID) : false

					message.channel.send({
						embed: {
							author: {
								name: !!winner ? winner.user.username + " wins" : "Nobody wins",
								icon_url: !!winner ? winner.user.avatarURL({
									dynamic: true,
								}) : null
							},
							fields: [{
									name: firstUser.user.username,
									value: emojiDict[rps[0].buttonID] + " " + rps[0].buttonID,
									inline: true
                                },
								{
									name: secondUser.user.username,
									value: emojiDict[rps[1].buttonID] + " " + rps[1].buttonID,
									inline: true
                                }
                            ],
							color: !!winner ? winner.displayHexColor : info.masonbot.color
						},
						buttons: [
                            new Button(rematch)
                        ]
					}).then(async resultMessage => {
						const filter = (button) => rps.map(rps => rps.userID).includes(button.clicker.user.id)
						const collector = await resultMessage.createButtonCollector(filter, {})

						setTimeout(() => {
							resultMessage.edit({ embed: resultMessage.embeds[0], buttons: null })
						}, 5000)

						collector.on('collect', async button => {
							resultMessage.edit({ embed: resultMessage.embeds[0], buttons: null })

							rpsStart()

							await button.reply.defer()
						})
					})
				})
			})
		}
		rpsStart(this.message)
	}
	async hex() {
		const { message, args } = this
		const argString = args.join(" ")
		const target = parseMember(args[0])

		let hex, img
		if (/\.(jpeg|jpg|gif|png)$/.test(argString)) {
			img = argString
		} else if (/^[0-9A-F]{6}$/i.test(argString.replace(/#/g, "").toLowerCase())) {
			hex = argString
		} else if (target) {
			img = target.user.avatarURL({
				format: "png",
			})
		} else if (message.attachments.size > 0) {
			img = message.attachments.first().attachment
		} else return message.channel.send(
			errorEmbed("Invalid input.")
		)

		const canvas = createCanvas(1800, 1800)
		const ctx = canvas.getContext('2d')
		if (img) {
			ColorThief.getPalette(img, 9, 5).then(colorsArray => {
				const colors = Array(8 - 0 + 1).fill().map((_, idx) => 0 + idx).map(num => `${rgbToHex(colorsArray[num]) === "18a100" ? "" : "#" + rgbToHex(colorsArray[num])}`)

				ctx.fillStyle = colors[0]
				ctx.fillRect(0, 0, 600, 600)
				ctx.fillStyle = colors[1]
				ctx.fillRect(600, 0, 600, 600)
				ctx.fillStyle = colors[2]
				ctx.fillRect(1200, 0, 600, 600)
				ctx.fillStyle = colors[3]
				ctx.fillRect(0, 600, 600, 600)
				ctx.fillStyle = colors[4]
				ctx.fillRect(600, 600, 600, 600)
				ctx.fillStyle = colors[5]
				ctx.fillRect(1200, 600, 600, 600)
				ctx.fillStyle = colors[6]
				ctx.fillRect(0, 1200, 600, 600)
				ctx.fillStyle = colors[7]
				ctx.fillRect(600, 1200, 600, 600)
				ctx.fillStyle = colors[8]
				ctx.fillRect(1200, 1200, 600, 600)

				const attachment = new Discord.MessageAttachment(canvas.toBuffer(), 'palette.png')
				message.channel.send(
					`**${target ? target.user.username : img}**\n\`\`\`${colors[0]}  ${colors[1]}  ${colors[2]}\n${colors[3]}  ${colors[4]}  ${colors[5]}\n${colors[6]}  ${colors[7]}  ${colors[8]}\`\`\``, attachment
				)
			})
		} else if (hex) {
			ctx.fillStyle = `#` + hex
			ctx.fillRect(0, 0, 1800, 1800)

			ctx.lineWidth = 6.0
			ctx.font = '150px Arial'
			ctx.fillStyle = 'black'
			ctx.strokeStyle = 'white'
			ctx.strokeText(hex, 40, 200)
			ctx.fillText(hex, 40, 200)

			const attachment = new Discord.MessageAttachment(canvas.toBuffer(), 'hex.png')
			message.channel.send(attachment)
		}
	}
	async spreadsheet() {
		const { message, args } = this

		if (!docLoaded || message.content.endsWith("-reload")) {
			await doc.loadInfo()
			docLoaded = true
			if (message.content.endsWith("-reload")) {
				return message.channel.send({
					embed: {
						title: "Reloaded the spreadsheet.",
						description: "m,sp is now up to date.",
						color: "e7e7e7"
					}
				})
			}
		}

		const sheet = doc.sheetsByIndex[0]
		const rows = await sheet.getRows()
		const search = new Fuse(rows.map(row => row._rawData[2])).search(args.join(" ").replace("-reload", ""))
		if (search.length <= 0) return message.channel.send(errorEmbed("Couldn't find that album."))
		const searchedRow = rows.find(row => row._rawData[2] === search[0].item)
		const [dateListened, artist, album, released, numTracks, runtime, avgLength, rating, favTrack] = [...searchedRow._rawData]
		await sheet.loadCells("H" + searchedRow._rowNumber)
		const ratingCell = sheet.getCellByA1("H" + searchedRow._rowNumber)
		const { rgbColor } = ratingCell._rawData.effectiveFormat.backgroundColorStyle
		const ratingColor = rgbToHex([rgbColor.red ? rgbColor.red * 255 : 0, rgbColor.green ? rgbColor.green * 255 : 0, rgbColor.blue ? rgbColor.blue * 255 : 0])

		covers.search({
			artist: artist,
			album: album,
			size: 'large'
		}, function(err, res) {
			if (err) return console.error(err)
			res = res === "No image was found" ? null : res

			message.channel.send({
				embed: {
					title: `${artist} - ${album}`,
					footer: {
						text: `${rating}/10 - Listened on ${dateListened}`
					},
					fields: [{
							name: "Released",
							value: released,
							inline: true
                        },
						{
							name: "Length",
							value: `${runtime} (${numTracks} tracks)`,
							inline: true
                        },
						{
							name: "Favorite track",
							value: favTrack,
							inline: true
                        }
                    ],
					color: ratingColor,
					...res && {
						thumbnail: {
							url: res
						}
					}
				}
			})
		})
	}
	async vs() {
		const { message, args } = this
		if (!args[2]) return

		const target = parseMember(args[1])
		const authorCollection = await getUser(message.author.id)
		const targetCollection = target ? await getUser(target.user.id) : null
		const amount = args[2].toLowerCase() === "max" ? Math.min(authorCollection.currency, targetCollection.currency) : parseAmount(args[2], authorCollection.currency)

		try {
			if (!target || !targetCollection) {
				throw "Invalid member."
			} else if (typeof amount === "object") {
				throw amount.message
			} else if (!authorCollection) {
				throw "Couldn't find you in the database."
			} else if (targetCollection.currency < amount) {
				throw `Amount exceeds target's balance.\n${amount.toLocaleString()} > ${targetCollection.currency.toLocaleString()}`
			} else if (target.user.id === message.author.id) {
				throw "You cannot versus yourself."
			}
		} catch (err) {
			return message.channel.send(
				errorEmbed(err)
			)
		}

		const vsMessage = await message.channel.send({
			embed: {
				description: `Versus of ${amount.toLocaleString()} currency`,
				color: "e7e7e7",
				author: {
					name: `Awaiting confirmation from ${target.user.username}`,
					icon_url: target.user.avatarURL({
						dynamic: true
					})
				}
			},
			buttons: [
                new Button({
					style: "green",
					label: "Accept",
					id: "accept",
				}),
                new Button({
					style: "red",
					label: "Deny",
					id: "deny"
				})
            ]
		})

		const t = setTimeout(() => {
			vsMessage.edit({
				embed: {
					description: `Versus of ${amount.toLocaleString()} currency`,
					color: "e7e7e7",
					author: {
						name: `Confirmation from ${target.user.username} timed out`,
						icon_url: target.user.avatarURL({
							dynamic: true
						})
					}
				},
				buttons: null
			})
		}, 60000)

		const filter = (button) => button.clicker.user.id === target.user.id
		const collector = await vsMessage.createButtonCollector(filter, {
			max: 1
		})

		collector.on('collect', async button => {
			let winner, loser, winnerBalance, loserBalance

			await button.reply.defer()
			clearTimeout(t)

			if (button.id === "accept") {
				if (Math.random() < 0.5) {
					winner = message.member
					winnerBalance = authorCollection.currency
					loser = target
					loserBalance = targetCollection.currency
				} else {
					winner = target
					winnerBalance = targetCollection.currency
					loser = message.member
					loserBalance = authorCollection.currency
				}

				await vsMessage.edit({
					embed: {
						author: {
							name: `${winner.user.username} wins!`,
							icon_url: winner.user.avatarURL({
								dynamic: true
							})
						},
						color: winner.displayHexColor,
						fields: [{
								name: winner.user.username,
								value: operationFormat(winnerBalance, amount),
								inline: true
                            },
							{
								name: loser.user.username,
								value: operationFormat(loserBalance, amount * -1),
								inline: true
                            }
                        ]
					},
					buttons: null
				})

				await changeBalance(winner.user.id, amount)
				await changeBalance(loser.user.id, amount * -1)
			} else if (button.id === "deny") {
				vsMessage.edit({
					embed: {
						description: `Versus of ${amount.toLocaleString()} currency`,
						color: "e7e7e7",
						author: {
							name: `${target.user.username} denied the versus`,
							icon_url: target.user.avatarURL({
								dynamic: true
							})
						}
					},
					buttons: null
				})
			}
		})
	}
	async check() {
		const { message, args } = this
		const [subCmd, terCmd] = [...args]

		if (terCmd === "auto" || terCmd === "a") {
			const authorCollection = await getUser(message.author.id)

			const {
				dailyTime,
				hourlyTime,
				currency,
				generatorLevel,
			} = authorCollection,
			moneyInGen = authorCollection.moneyInGen()

			const dailyReady = new Date() - dailyTime.getTime() > 86400000
			const hourlyReady = new Date() - hourlyTime.getTime() > 3600000

			const successful = {
				hourly: false,
				daily: false,
				generator: false
			}

			const successfulArray = []

			if (hourlyReady) {
				successful.hourly = true
				successfulArray.push("Hourly")

				await changeBalance(message.author.id, genInfo(generatorLevel).hourlyAmount)
				dboUsers.collection(message.author.id).updateMany({}, {
					$set: {
						hourlyTime: new Date()
					}
				})
			}
			if (dailyReady) {
				successful.daily = true
				successfulArray.push("Daily")

				await changeBalance(message.author.id, genInfo(generatorLevel).dailyAmount)
				dboUsers.collection(message.author.id).updateMany({}, {
					$set: {
						dailyTime: new Date()
					}
				})
			}
			if (moneyInGen === genInfo(generatorLevel).limit) {
				successful.generator = true
				successfulArray.push("Generator")

				await changeBalance(message.author.id, moneyInGen)
				dboUsers.collection(message.author.id).updateMany({}, {
					$set: {
						generatorTime: new Date()
					}
				})
			}

			let amountGained = (successful.hourly ? genInfo(generatorLevel).hourlyAmount : 0) + (successful.daily ? genInfo(generatorLevel).dailyAmount : 0) + (successful.generator ? moneyInGen : 0)

			if (successfulArray.length > 0) {
				return message.channel.send({
					embed: {
						author: {
							name: "Auto-check",
							icon_url: message.author.displayAvatarURL({ dynamic: true })
						},
						description: `Collected:\n${successfulArray.map(thing => `- **${thing}**`).join("\n")}\n\n${operationFormat(currency, amountGained)}`,
						color: "e7e7e7"
					}
				})
			} else {
				return message.channel.send({
					embed: {
						color: "e7e7e7",
						author: {
							name: "Nothing to collect.",
							icon_url: message.author.displayAvatarURL({ dynamic: true })
						}
					}
				})
			}
		}

		const checkMsg = await message.channel.send(await checkEmbed(message))

		let filter = (button) => button.clicker.user.id === message.author.id
		const collector = await checkMsg.createButtonCollector(filter, {})

		collector.on('collect', async button => {
			await button.reply.defer()

			const authorCollection = await getUser(message.author.id)

			const {
				dailyTime,
				hourlyTime,
				currency,
				generatorLevel,
			} = authorCollection,
			moneyInGen = authorCollection.moneyInGen()

			const dailyReady = new Date() - dailyTime.getTime() > 86400000
			const hourlyReady = new Date() - hourlyTime.getTime() > 3600000

			dboUsers.collection(message.author.id).find({}).toArray(async function(err, result) {
				switch (button.id) {
					case "gen":
						await changeBalance(message.author.id, moneyInGen)

						await dboUsers.collection(message.author.id).updateMany({}, {
							$set: {
								generatorTime: new Date()
							}
						})

						await checkMsg.edit(await checkEmbed(message, moneyInGen))

						break
					case "hourly":
						if (hourlyReady) {
							await changeBalance(message.author.id, genInfo(generatorLevel).hourlyAmount)

							await dboUsers.collection(message.author.id).updateMany({}, {
								$set: {
									hourlyTime: new Date()
								}
							})

							await checkMsg.edit(await checkEmbed(message, genInfo(generatorLevel).hourlyAmount))
						}

						break
					case "daily":
						if (dailyReady) {
							await changeBalance(message.author.id, genInfo(generatorLevel).dailyAmount)

							await dboUsers.collection(message.author.id).updateMany({}, {
								$set: {
									dailyTime: new Date()
								}
							})

							await checkMsg.edit(await checkEmbed(message, genInfo(generatorLevel).dailyAmount))
						}

						break
					case "refresh":
						await checkMsg.edit(await checkEmbed(message))
						break
				}
			})
		})
	}
	async gen() {
		const { message, args } = this

		if (args[1] === "view" || args[1] === "v") {
			const generatorLevel = parseInt(args[2]) || (await getUser(message.author.id)).generatorLevel + 1

			return message.channel.send({
				embed: {
					title: `Generator ${generatorLevel}`,
					color: info.masonbot.color,
					description: `\`\`\`Price: ${genInfo(generatorLevel).cost.toLocaleString()}\nLimit: ${genInfo(generatorLevel).limit.toLocaleString()}\nHourly Amount: ${genInfo(generatorLevel).hourlyAmount.toLocaleString()}\nDaily Amount: ${genInfo(generatorLevel).dailyAmount.toLocaleString()}\`\`\``
				}
			})
		} else if (args[1] === "upgrade" || args[1] === "u") {
			const authorCollection = await getUser(message.author.id)
			const nextLevel = authorCollection.generatorLevel + 1

			if (authorCollection.currency < genInfo(nextLevel).cost) {
				return message.channel.send(errorEmbed(`You need **${(genInfo(nextLevel).cost - authorCollection.currency).toLocaleString()}** more currency to afford a generator upgrade.`))
			}

			await dboUsers.collection(message.author.id).updateOne({}, {
				$inc: {
					generatorLevel: 1,
					currency: genInfo(nextLevel).cost * -1,
				},
			})

			await message.channel.send({
				embed: {
					color: "00ff00",
					title: `Upgraded generator to level ${nextLevel}`,
				}
			})
		}
	}
	async help() {
		const { message, args } = this
		const helpMain = args[0]
		const helpSub = args[1]
		const response = (name, aliases, usage, description) => message.channel.send({
			embed: {
				author: {
					name: name,
					icon_url: client.user.displayAvatarURL({
						format: "png"
					})
				},
				...aliases && {
					title: aliases
				},
				...description && {
					description: `${usage ? `\`Usage: ${usage}\`\n\n` : ""}\`\`\`${description}\`\`\``
				},
				color: info.masonbot.color
			}
		})

		switch (helpMain) {
			case "say":
				response("Say", "m,say", "m,say <message>", "Returns a message. Takes keywords within {curly brackets}.\n\nFull list:\n{currency}: The user's currency\n{genLevel}: The user's generator level\n{randomMember}: The username of a random member from the server")
				break
			case "math":
			case "m":
				response("Math", "m,math | m,m", "m,m <expression>", "Solves a math expression using the mathjs library.")
				break
			case "karma":
			case "km":
				response("Karma", "m,karma | m,km", "m,km <member>|top", "Shows a user's upvotes/downvotes and karma, or shows the server's karma leaderboard.\n\nReact to a user's message with :upvote: or :downvote: to change their karma.")
				break
			case "hex":
				response("Hex", "m,hex", "m,hex <imageurl|member|hexcode>", "Visualizes a color pallette for an image or member, or a single hex code.")
				break
			case "youtube":
				response("YouTube", "m,yt", "m,yt <search>", "Searches YouTube.")
				break
			case "rps":
				response("RPS", "m,rps", "m,rps <member>", "Invites another user to a game of rock-paper-scissors.")
				break
			case "spreadsheet":
			case "sp":
				response("Spreadsheet", "m,spreadsheet | m,sp", "m,sp <album>", "Shows information about an album from Mason's listening database.\n\n\`\`\`https://docs.google.com/spreadsheets/d/1jVLM0BXu7yDTeYfj_vbnmsgqDvjAih5nzUUSoDo2WgE/edit?usp=sharing\`\`\`")
				break
			case "image":
			case "i":
				response("Image", "m,image | m,i", "m,i <search>", "Searches Google for images.")
				break
			case "macros":
			case "macro":
			case "x":
				response("Macros", "m,x", "\nm,x create <name> <commands>\nm,x view <name> <?member>\nm,x delete <name>\nm,x list <?member>", "Macros allow the user to run a custom, predefined series of commands at any time.\n\nm,x create takes commands separated by newlines:\n\nm,x create example\nm,say Example\nm,c bet 1\n...wait 3000\nm,say {{1}}\n\nThere is a special, macro-exclusive command called \"...wait\" that waits for a certain number of milliseconds before executing the next command.\n\nCommands can have arguments within {{double curly brackets}}. Within the brackets can either be a number (for a specific argument) or {{after<num>}} for all arguments after argument number <num> (i.e. {{after3}}).\nThese arguments are provided when using the command, i.e. !example Cool\n\nMacros are called through your own individual macro prefix, which you can change using m,prefs")
				break
			case "quote":
				response("Quote", "", "<messageurl> 💬 reaction", "Quotes a message, turning it into a nicely-formatted embed. Click the author's name to jump to the message.")
				break
			case "settopic":
			case "st":
				response("Set Topic", "m,settopic | m,st", "m,st <text>", "Changes the topic of a user's channel.")
				break
			case "setcolor":
			case "sc":
				response("Set Color", "m,setcolor | m,sc", "m,sc <hexcode>", "Changes a user's role color.")
				break
			case "setname":
			case "sn":
				response("Set Name", "m,setname | m,sn", "m,sn <text>", "Changes a user's role name.")
				break
			case "setemoji":
			case "se":
				response("Set Emoji", "m,setemoji | m,se", "m,se <text>", "Changes a user's channel emoji. Must be between 2 and 8 characters long. Emojis count as 2 characters.")
				break
			case "help":
			case "h":
				response("Help", "m,help | m,h", "m,h <feature>", "Shows information about a Masonbot feature.")
				break
			case "createchannel":
			case "cc":
				response("Create Channel", "m,cc", "m,cc <channelname>", "Creates a new channel in the Other category.")
				break
			case "top":
				response("Top", "m,c top", "m,c top", "Shows currency information about all members in a server, ordered by currency descending.")
				break
			case "bet":
			case "b":
				response("Bet", "m,c bet | m,c b", "m,c bet <amount> <?multiplier>", "Bets some currency at a certain multiplier (default 2). Multplier is parsed as an amount input type. Higher multipliers mean lower chance to win but higher earnings.")
				break
			case "pay":
				response("Pay", "m,c pay", "m,c pay <member> <amount>", "Sends a user an amount of currency.")
				break
			case "page":
				response("Page", "m,c page | m,c", "m,c page <?member>", "Shows currency-related information about a member, or about the user if no member is given.")
				break
			case "vs":
				response("Versus", "m,c vs", "m,c vs <member> <amount>", "Challenges a member to a versus match. Winner gets the currency, loser loses it.\nVersus is the only command to accept \"max\" as an amount. This wagers the maximum amount of money both parties can afford.")
				break
			case "check":
			case "ch":
				response("Check", "m,c check | m,c ch", "m,c ch", "Checks your hourly, daily, and generator. Gives buttons to collect them.")
				break
			case "gen":
			case "g":
				response("Generator", "m,c gen | m,c g", "m,c gen view <?number> | m,c gen upgrade", "Generators create money over time. You can collect them using m,c ch.\n\nIf you wish to view information about a generator, you can do m,c gen view <level>, or leave <level> blank to default to viewing the next generator. If you want to upgrade, it's m,c gen upgrade.")
				break
			case "raremasonbot":
				response("Rare Masonbot", "", "", "Rare Masonbots have a 1/4096 chance of appearing on any non-bot message. Are you feeling lucky?")
				break
			case "collab":
				response("Collab Channel", "collab", "", "Collab channel will keep track of the story going on.\n\nCommands:\n\ncollab done - Finishes a story and pins it.\ncollab undo - Undoes the last message\nEscape the collab channel rules by starting your message with //")
				break
			case "rift":
				response("Rift", "", "", "Sometimes, a rift in Masondimensional space will form. For some currently unknown reason, there's usually currency on the other side.")
				break
			case "activitycurrency":
				response("Activity Currency", "", "", "Every message, on a cooldown of 60 seconds, will earn the sender currency equal to their generator level to the power of 5.")
				break
			case "pollchannel":
				response("Poll Channel", "", "", "I don't know, I haven't made it yet.")
				break
			case "boards":
				response("Boards", "", "⭐ or 🐀 reaction", "Sends a message to the starboard/ratboard. The embed is derived from the embed for quote (m,h quote).")
				break
			case "pin":
				response("Pin", "", "📌 reaction", "After 3 pushpin reactions, pins the message.")
				break
			case "repeatcommand":
			case ",m":
				response("Repeat Command", ",m", ",m", "Typing ,m will repeat your last command. Any message beginning with the bot's prefix is considered to be a command. Commands are not stored across Masonbot instances, so if it gives you an error, it's probably because Masonbot was recently restarted.")
				break
			case "amount":
				response("Amount Input Type", "", "", "Parses an amount.\n\nAccepts \"all\", \"random\", and \"random\"\nConverts k and m into 1,000 and 1,000,000 respectively\nPutting an x before an amount will return all of a user's balance except that amount\nInterprets text inside of [] as a math expression using the mathjs (like m,m), replacing $ with the user's currency and ? with a random decimal between 0 and 1")
				break
			case "member":
				response("Member Input Type", "", "", "Parses a member.\n\nAccepts user id\nAccepts user mention\nFuzzy searches by username (e.g. \"mas\" will return \"Mason\")")
				break
			case "preferences":
			case "prefs":
			case "pr":
				response("Preferences", "m,pr | m,prefs", "m,pr | m,pr <preference> | m,pr <reference> <value>", "<preference> is fuzzy searched, so it doesn't have to be exact (\"quot\" will be interpreted as \"quoteMention\").\n\nm,pr will show you a list of your preferences.\nm,pr <preference> will show you information about that preference.\nm,pr <preference> <value> will change your preference to the value you input.")
				break
			default:
				message.channel.send({
					embed: {
						color: info.masonbot.color,
						author: {
							name: "Masonbot",
							icon_url: client.user.displayAvatarURL({
								format: "png"
							})
						},
						fields: [{
								name: "Fun",
								value: "\`\`\`say, math, karma, hex, youtube, rps, spreadsheet, image\`\`\`",
								inline: true
                            },
							{
								name: "Functional",
								value: "\`\`\`macros, quote, settopic, setcolor, setname, setemoji, help, createchannel, preferences\`\`\`",
								inline: true
                            },
							{
								name: "Currency",
								value: "\`\`\`top, bet, pay, page, vs, check, gen\`\`\`",
								inline: true
                            },
							{
								name: "Features",
								value: "\`\`\`raremasonbot, collab, rift, activitycurrency, pollchannel, boards, pin, redocommand\`\`\`",
								inline: true
                            },
							{
								name: "Input Types",
								value: "\`\`\`amount, member\`\`\`",
								inline: true
                            }
                        ],
						footer: {
							text: "Type m,h <feature> for further information on that feature."
						}
					}
				})
		}
	}
	async prefs() {
		const { message, args } = this
		const authorCollection = await getUser(message.author.id)
		if (authorCollection.prefs === undefined) return

		if (args.length <= 0) {
			return message.channel.send({
				embed: {
					title: `${message.author.username}'s preferences`,
					description: `\`\`\`${Object.entries(authorCollection.prefs).map(x => x[0] + ": " + x[1]).join("\n")}\`\`\``,
					color: info.masonbot.color
				}
			})
		} else {
			const listOfPreferences = new Fuse(Object.keys(authorCollection.prefs))
			const targetPreference = listOfPreferences.search(args[0]).length > 0 ? listOfPreferences.search(args[0])[0].item : undefined
            if (!prefs[message.author.id].hasOwnProperty(targetPreference)) return message.channel.send(errorEmbed(`Couldn't find that preference.`))
			const newValue = !!args[1] ? convertType(args[1].toLowerCase()) : undefined
			const preferenceQuery = `prefs.${targetPreference}`

			const prefDescriptions = {
				quoteMention: "Whether or not to mention (ping) you when you're quoted.",
				macroPrefix: "The prefix used to execute macros."
			}

			if (args.length <= 1) {
				return message.channel.send({
					embed: {
						title: targetPreference,
						color: info.masonbot.color,
						description: "```" + prefDescriptions[targetPreference] + "```",
						footer: {
							text: `Currently set to: ${prefs[message.author.id][targetPreference]}`
						}
					}
				})
			}

			try {
				if (!targetPreference) {
					throw "That preference doesn't exist."
				} else if (typeof(authorCollection.prefs[targetPreference]) !== typeof(newValue)) {
					throw `Expected type ${typeof(authorCollection.prefs[targetPreference])}, got ${typeof(newValue)}`
				}
			} catch (err) {
				return message.channel.send(
					errorEmbed(err)
				)
			}

			if (targetPreference === "macroPrefix" && [prefix, "m,"].includes(newValue)) {
				return message.channel.send(errorEmbed("Can't set macro prefix to bot's prefix."))
			}

			await dboUsers.collection(message.author.id).updateOne({ "info.id": message.author.id }, {
				$set: {
                    [preferenceQuery]: newValue
				}
			})

			prefs[message.author.id][targetPreference] = newValue

			return message.channel.send({
				embed: {
					color: info.masonbot.color,
					title: `${targetPreference} changed to ${args[1]}`
				}
			})
		}
	}
	async macro() {
		const { message, args } = this
		const authorCollection = await getUser(message.author.id)

		if (message.content.toLowerCase().startsWith(prefs[message.author.id].macroPrefix.toLowerCase())) {
			if (message.isSudo) return message.channel.send(errorEmbed("Can't run macro within another sudo instance."))
			const macroName = message.content.slice(prefs[message.author.id].macroPrefix.length).split(" ")[0]
			if (!macroName) return
			if ((await dboUsers.collection(message.author.id).findOne({
					[`macros.${macroName}`]: { $exists: true }
				})) === null) return message.channel.send(errorEmbed(`Couldn't find a macro named **${macroName}**.`))

			const defaultDelay = 1000
			let random = Math.random()
			const commands = [...authorCollection.macros[macroName].commands, random]

			var promise = Promise.resolve()

			if (hasMacroInProgress.has(message.author.id)) {
				return message.channel.send(errorEmbed("You already have a macro in progress."))
			}

			hasMacroInProgress.add(message.author.id)

			const argumentHandle = (string) => {
				if (typeof string !== "string") return string
                const matches = commands.join("").match(/{{\w+}}/g)
                if (matches === null) return
                let maxArgs = matches.map(arg => arg.replace(/\D+/g, "")).sort((a, b) => a > b ? -1 : 1)[0]

				try {
					const argReplace = (match, offset, string) => {
						let argument = null
						let num = 0
                        let expected = 0

						if (/{{after\d+}}/g.test(match)) {
							num = parseInt(match.replace(/\D+/g, ""))
                            expected = parseInt(maxArgs) + 1

							if (isNaN(num)) throw num
							argument = args.slice(num).join(" ")
						} else if (/{{\d+}}/g.test(match)) {
							num = parseInt(match.replace(/\D+/g, "")) - 1
                            expected = parseInt(maxArgs)
                            
							if (isNaN(num)) throw num
							argument = args[num]
						}

						if (!argument) {
							hasMacroInProgress.delete(message.author.id)
							throw {
                                got: args.length,
                                expected: expected
                            }
						}
						return argument
					}

					return string.replace(/{{\w+}}/g, argReplace)
				} catch (err) {
                    hasMacroInProgress.delete(message.author.id)

                    return err
				}
			}

            let cleanCommands = commands.map(command => argumentHandle(command))
            let errorCommands = cleanCommands.filter(command => typeof command === "object")

            if (errorCommands.length > 0) {
                let mostError = errorCommands.sort((a, b) => a.expected > b.expected ? -1 : 1)[0]

                return message.channel.send(errorEmbed(`Expected **${mostError.expected}** arguments, got **${mostError.got}**.`))
            }

			for (let command of cleanCommands) {
				promise = promise.then(() => {
					if (command === random) {
						hasMacroInProgress.delete(message.author.id)

						dboUsers.collection(message.author.id).updateOne({ "info.id": message.author.id }, {
							$inc: {
                                [`macros.${macroName}.uses`]: 1
							}
						})
					} else {
						sudo(message, message.member, command)

						let delay = command.startsWith("...wait") ? parseInt(command.split(" ")[1]) - defaultDelay : defaultDelay

						if (delay < defaultDelay) {
							delay = defaultDelay
						}

						if (commands.indexOf(command) > commands.length - 2) {
							delay = 0
						}

						return new Promise(function(resolve) {
							setTimeout(resolve, delay)
						})
					}
				})
			}
		} else {
			const subCmd = args[0].toLowerCase()
			if (!subCmd) return

			if (subCmd === "create" || subCmd === "edit") {
				const newlineSplit = message.content.split(/(\r\n|\r|\n)/g)
				const macroName = newlineSplit[0].split(" ")[2]
				if (!macroName) return

				if (subCmd === "create") {
					if ((await dboUsers.collection(message.author.id).findOne({
							[`macros.${macroName}`]: { $exists: true }
						})) !== null) return message.channel.send(errorEmbed(`The macro **${macroName}** already exists.`))
				} else if (subCmd === "edit") {
					if ((await dboUsers.collection(message.author.id).findOne({
							[`macros.${macroName}`]: { $exists: true }
						})) === null) return message.channel.send(errorEmbed(`Couldn't find a macro named **${macroName}**.`))
				}

				const commands = newlineSplit.slice(1).filter(string => string !== "\n")
				if (commands.length > 12 + 1) return message.channel.send(errorEmbed("No more than 12 commands allowed per macro."))
				if (commands.length <= 0) return

				if (commands.map(command => command.startsWith(prefix) || command.startsWith("...wait")).includes(false)) return message.channel.send(errorEmbed(`One or more commands were invalid. Commands must start with ${prefix}`))

				if (commands.filter(command => command.startsWith("...wait")).length > 0) {
					let waits = commands.filter(command => command.startsWith("...wait"))

					waits.forEach(wait => {
						if (!/^...wait \d+$/g.test(wait)) {
							return message.channel.send(errorEmbed("Invalid wait time."))
						} else if (parseInt(/\d+/g.match(wait)) > 60000) {
							return message.channel.send(errorEmbed("Wait time must not exceed 60,000 milliseconds (one minute)."))
						}
					})
				}

				if (subCmd === "create") {
					await dboUsers.collection(message.author.id).updateOne({ "info.id": message.author.id }, {
						$set: {
                            [`macros.${macroName.toLowerCase()}`]: {
								commands: commands,
								created: new Date(),
								uses: 0
							}
						}
					})

					return message.channel.send({
						embed: {
							title: `Created macro "${macroName}"`,
							color: info.masonbot.color,
							description: `\`Commands:\`\n\`\`\`${commands.join('\n')}\`\`\``
						}
					})
				} else if (subCmd === "edit") {
					const macro = authorCollection.macros[macroName]

					await dboUsers.collection(message.author.id).updateOne({ "info.id": message.author.id }, {
						$set: {
                            [`macros.${macroName.toLowerCase()}.commands`]: commands
						}
					})

					return message.channel.send({
						embed: {
							title: `Edited macro "${macroName}"`,
							color: info.masonbot.color,
							description: `\`Changed commands from:\`\n\`\`\`${macro.commands.join("\n")}\`\`\`\n\`to:\`\n\`\`\`${commands.join("\n")}\`\`\``
						}
					})
				}
			} else if (subCmd === "view") {
                if (args.length < 2) return
				const macroName = args[1].toLowerCase()
				const targetMember = parseMember(args[2]) || message.member
				if (!macroName) return
				if ((await dboUsers.collection(targetMember.user.id).findOne({
						[`macros.${macroName}`]: { $exists: true }
					})) === null) return message.channel.send(errorEmbed(`Couldn't find a macro named **${macroName}** ${targetMember.user.id !== message.author.id ? `from **${targetMember.user.username}**` : ""}.`))
				const targetCollection = await getUser(targetMember.user.id)
				const macro = targetCollection.macros[macroName]

				return message.channel.send({
					embed: {
						color: info.masonbot.color,
						title: `Viewing macro "${macroName}"`,
						description: `\`\`\`${macro.commands.join("\n")}\`\`\`\nThis macro has been used **${macro.uses.toLocaleString()}** times.`,
						footer: {
							text: `Created`
						},
						timestamp: macro.created
					}
				})
			} else if (subCmd === "edit") {
				const newlineSplit = message.content.split(/(\r\n|\r|\n)/g)
				const macroName = newlineSplit[0].split(" ")[2]
				if (!macroName) return
				if ((await dboUsers.collection(message.author.id).findOne({
						[`macros.${macroName}`]: { $exists: true }
					})) === null) return message.channel.send(errorEmbed(`Couldn't find a macro named **${macroName}**.`))
				const newCommands = newlineSplit.slice(1).filter(string => string !== "\n")
				if (newCommands.length > 12 + 1) return message.channel.send(errorEmbed("No more than 12 commands allowed per macro."))
				if (newCommands.length <= 0) return

				if (newCommands.map(command => command.startsWith(prefix) || command.startsWith("...")).includes(false)) return message.channel.send(errorEmbed(`One or more commands were invalid. Commands must start with ${prefix}`))

				await dboUsers.collection(message.author.id).updateOne({ "info.id": message.author.id }, {
					$set: {
                        [`macros.${macroName.toLowerCase()}.commands`]: newCommands
					}
				})

				return message.channel.send({
					embed: {
						title: `Edited macro "${macroName}"`,
						color: info.masonbot.color,
						description: `\`Changed commands from:\`\n\`\`\`${macro.commands.join("\n")}\`\`\`\n\`to:\`\n\`\`\`${newCommands.join("\n")}\`\`\``
					}
				})
			} else if (subCmd === "delete") {
				const macroName = args[1].toLowerCase()
				if (!macroName) return
				if ((await dboUsers.collection(message.author.id).findOne({
						[`macros.${macroName}`]: { $exists: true }
					})) === null) return message.channel.send(errorEmbed(`Couldn't find a macro named **${macroName}**.`))

				const confirmationMessage = await message.channel.send({
					embed: {
						color: info.masonbot.color,
						title: `Delete "${macroName}"?`,
						description: `\`Commands:\`\n\`\`\`${authorCollection.macros[macroName].commands.join('\n')}\`\`\``
					},
					buttons: [
                        new Button({
							style: "green",
							label: "Yes",
							id: "yes"
						}),
                        new Button({
							style: "red",
							label: "No",
							id: "no"
						})
                    ]
				})

				const filter = (button) => button.clicker.user.id === message.author.id
				const collector = await confirmationMessage.createButtonCollector(filter, {
					max: 1
				})

				const confirmationTimeout = setTimeout(() => {
					confirmationMessage.delete()
				}, 60000)

				collector.on('collect', async button => {
					await button.reply.defer()
					clearTimeout(confirmationTimeout)

					if (button.id === "yes") {
						await dboUsers.collection(message.author.id).updateOne({ "info.id": message.author.id }, {
							$unset: {
                                [`macros.${macroName}`]: 1
							}
						})

						return confirmationMessage.edit({
							embed: {
								color: info.masonbot.color,
								title: `Deleted macro "${macroName}"`
							},
							buttons: null
						})
					} else {
						confirmationMessage.delete()
					}
				})
			} else if (subCmd === "list") {
				const targetMember = parseMember(args[1]) || message.member
				const targetCollection = await getUser(targetMember.user.id)

				return message.channel.send({
					embed: {
						color: info.masonbot.color,
						title: `${targetMember.user.username}'s macros\nby number of uses`,
						description: targetCollection.macros.length <= 0 ? "`User has no macros`" : `\`\`\`${Object.keys(targetCollection.macros).sort((a, b) => targetCollection.macros[a].uses > targetCollection.macros[b].uses ? -1 : 1).map(key => `(${targetCollection.macros[key].uses}) ${key}`).join("\n")}\`\`\``
					}
				})
			}
		}
	}
}

export class ReactionCommand {
	constructor(reaction, user, removing = false) {
		this.reaction = reaction
		this.message = reaction.message
		this.emoji = reaction.emoji
		this.user = user
		this.removing = removing
		global.guild.id = !!this.message.guild ? this.message.guild.id : undefined
		global.channel.id = this.message.channel.id
	}
	async quote() {
		const { reaction, message, user } = this
		const quoterCollection = await getUser(user.id)

		const quoterChannel = message.guild.channels.cache.find(channel => channel.id === quoterCollection.info.channelid)

		const { quote, attachments } = quoteEmbed(message)
		const quoteMention = prefs[message.author.id] !== undefined ? prefs[message.author.id].quoteMention : false

		await quoterChannel.send(quoteMention ? message.author.toString() : "", quote)

		if (attachments.length > 0) {
			await quoterChannel.send(attachments.join(" "))
		}

		await reaction.users.remove(user)
	}
	async board() {
		const { reaction, message, emoji, user, removing } = this
		let emote, boardChannel

		if (emoji.name === "⭐") {
			emote = "⭐"
			boardChannel = parseChannel("starboard")
		} else if (emoji.name === "🐀") {
			emote = "🐀"
			boardChannel = parseChannel("ratsboard")
		}

		if (user.id === message.author.id) {
			return reaction.users.remove(user)
		}

		if (message.channel === boardChannel) return

		const fetchedMessages = await boardChannel.messages.fetch({
			limit: 100
		})

		const duplicate = fetchedMessages.find(m => {
			try {
				return m.embeds[0].footer.text.indexOf(message.id) !== -1
			} catch {
				return null
			}
		})

		const nextMessage = duplicate ? await message.channel.messages.fetch({ around: duplicate.id, limit: 2 })
			.then(msg => {
				let values = msg.values()
				return values.next().value
			}) : null

		const { quote: boardEmbed, attachments } = quoteEmbed(message, {
			emoji: emote,
			count: reaction.count
		})

		if (removing) {
			if (duplicate) {
				if (reaction.count === 0) {
					duplicate.delete()

					if (nextMessage && nextMessage.embeds[0] && nextMessage.embeds[0].color === null) {
						nextMessage.delete()
					}
				} else {
					duplicate.edit(boardEmbed)
				}
			} else {
				return
			}
		} else {
			if (duplicate) {
				duplicate.edit(boardEmbed)
			} else {
				await boardChannel.send(boardEmbed)
				if (attachments.length > 0) {
					await boardChannel.send(attachments.join(" "))
				}
			}
		}
	}
	async karma() {
		const { reaction, message, emoji, user, removing } = this

		if (message.author.id === user.id) return

		if (emoji.name === "upvote") {
			dboUsers.collection(message.author.id).updateOne({}, {
				$inc: {
					upvotes: removing ? -1 : 1
				}
			})
		} else if (emoji.name === "downvote") {
			if (message.author.id === info.masonbot.id) return

			dboUsers.collection(message.author.id).updateOne({}, {
				$inc: {
					downvotes: removing ? -1 : 1
				}
			})
		}
	}
}