/* eslint-disable no-underscore-dangle */
const { Autocompleter } = require('@eartharoid/dbf');
const emoji = require('node-emoji');
const Cryptr = require('cryptr');
const { decrypt } = new Cryptr(process.env.ENCRYPTION_KEY);
const Keyv = require('keyv');
const ms = require('ms');
const { isStaff } = require('../lib/users');

module.exports = class TopicCompleter extends Autocompleter {
	constructor(client, options) {
		super(client, {
			...options,
			id: 'topic',
		});

		this.cache = new Keyv();
	}

	async getOptions(value, {
		guildId,
		open,
	}) {
		/** @type {import("client")} */
		const client = this.client;
		const cacheKey = [guildId, open].join('/');

		let tickets = await this.cache.get(cacheKey);
		let topics = [""];

		if (!tickets) {
			tickets = await client.prisma.ticket.findMany({
				include: {
					category: {
						select: {
							emoji: true,
							name: true,
						},

					},
				},
				where: {
					guildId,
					// FIXME: Uncomment before opening a PR
					// open, //commented for debugging purposes (I don't wanna close tickets)
				},
			});
			topics = tickets.map(ticket => {
				return ticket.topic ? decrypt(ticket.topic).replace(/\n/g, ' ').substring(0, 50) : null;
			});
			// this.cache.set(cacheKey, tickets, ms('1m'));
		}

		const options = value ?
			topics.filter(topic => topic && topic.match(new RegExp(value, 'i'))) :
			topics.filter(topic => topic);

		return options.filter((i, idx, arr) => arr.indexOf(i) == idx)
			.slice(0, 25)
			.map(topic => ({
				name: topic,
				value: topic,
			}));
	}

	/**
	 * @param {string} value
	 * @param {*} command
	 * @param {import("discord.js").AutocompleteInteraction} interaction
	 */
	async run(value, command, interaction) {
		await interaction.respond(
			await this.getOptions(value, {
				guildId: interaction.guild.id,
				open: ['add', 'close', 'force-close', 'remove'].includes(command.name),  // false for `new`, `transcript` etc
			}),
		);
	}
};
