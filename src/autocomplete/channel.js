/* eslint-disable no-underscore-dangle */
const { Autocompleter } = require('@eartharoid/dbf');
const emoji = require('node-emoji');
const Cryptr = require('cryptr');
const { decrypt } = new Cryptr(process.env.ENCRYPTION_KEY);
const Keyv = require('keyv');
const ms = require('ms');
const { isStaff } = require('../lib/users');

module.exports = class TicketCompleter extends Autocompleter {
	constructor(client, options) {
		super(client, {
			...options,
			id: 'channel',
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

		if (!tickets) {
			const { locale } = await client.prisma.guild.findUnique({
				select: { locale: true },
				where: { id: guildId },
			});
			tickets = await client.prisma.ticket.findMany({
				include: {
					category: true,
				},
				where: {
					guildId,
					// FIXME: Uncomment before opening a PR
					// open, //commented for debugging purposes (I don't wanna close tickets)
				},
			});
			tickets = tickets.map(ticket => {
				ticket._channelName = ticket.category.channelName
					.replace(/{+\s?(user)?name\s?}+/gi, ticket.createdBy?.username)
					.replace(/{+\s?(nick|display)(name)?\s?}+/gi, ticket.createdBy?.displayName)
					.replace(/{+\s?num(ber)?\s?}+/gi, ticket.number);
				ticket._channelId = ticket.id;
				return ticket;
			});
			// this.cache.set(cacheKey, tickets, ms('1m'));
		}

		const options = value ?
			tickets.filter(
				t => t._channelId.match(new RegExp(value, 'i'))
					|| t._channelName.match(new RegExp(value, 'i'))
			)
			: tickets;

		return options
			.slice(0, 25)
			.map(t => ({
				name: `#${t._channelName} (${t._channelId})`,
				value: t._channelId,
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
