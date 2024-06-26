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
			id: 'ticket',
		});

		this.cache = new Keyv();
	}

	/**
	 * @param {string} value
	 * @param {import("discord.js").AutocompleteInteraction} interaction
	 */
	async getOptions(value, interaction, {
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
					archivedUsers: true,
					archivedChannels: true,
					// category: true,
				},
				where: {
					guildId,
					// FIXME: Uncomment before opening a PR
					// open, //commented for debugging purposes (I don't wanna close tickets)
				},
			});
			tickets = tickets.map(ticket => {
				ticket._date = new Date(ticket.createdAt).toLocaleString(['en-CA', locale, 'en-GB'], { dateStyle: 'short' });
				ticket._topic = ticket.topic ? '| ' + decrypt(ticket.topic).replace(/\n/g, ' ').substring(0, 50) : '';
				ticket._category = emoji.hasEmoji(ticket.category.emoji) ? emoji.get(ticket.category.emoji) + ' ' + ticket.category.name : ticket.category.name;
				ticket._channelId = ticket.id;
				ticket._name = `${ticket._category} #${ticket.number}`;
				ticket._users = ticket.archivedUsers?.map(i => i.userId);
				return ticket;
			});
			this.cache.set(cacheKey, tickets, ms('1m'));
		}

		// Just some casual filtering, it isn't scary
		console.log(interaction.options.data)
		const ticket = value;
		const category = interaction.options.getString('category');
		const channel = interaction.options.getString('channel');
		const user = interaction.options.get('user');
		const topic = interaction.options.getString('topic');

		let options = ticket ? tickets.filter(t => t._name.match(new RegExp(ticket, 'i'))) : tickets;
		options = category ? options.filter(t => t._category.match(new RegExp(cateogry, 'i'))) : options;
		options = channel ? options.filter(t => t._channelId.match(new RegExp(channel, 'i'))) : options;
		options = user ? options.filter(t => t._users?.includes(user.value)) : options;
		options = topic ? options.filter(t =>t._topic.match(new RegExp(topic, 'i'))) : options;

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
			await this.getOptions(value, interaction,{
				guildId: interaction.guild.id,
				open: ['add', 'close', 'force-close', 'remove'].includes(command.name),  // false for `new`, `transcript` etc
			}),
		);
	}
};
