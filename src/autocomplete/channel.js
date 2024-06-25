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
			tickets = tickets.map(ticket => {
				ticket._date = new Date(ticket.createdAt).toLocaleString([locale, 'en-GB'], { dateStyle: 'short' });
				ticket._topic = ticket.topic ? '| ' + decrypt(ticket.topic).replace(/\n/g, ' ').substring(0, 50) : '';
				ticket._category = emoji.hasEmoji(ticket.category.emoji) ? emoji.get(ticket.category.emoji) + ' ' + ticket.category.name : ticket.category.name;
				ticket._name = `${ticket._category} #${ticket.number}`;
				return ticket;
			});
			this.cache.set(cacheKey, tickets, ms('1m'));
		}

		const options = value ? tickets.filter(t => t._name.match(new RegExp(value, 'i'))) : tickets;
		return options
			.slice(0, 25)
			.map(t => ({
				name: `${t._name} (${t._date}) ${t._topic}`,
				value: t.id,
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
