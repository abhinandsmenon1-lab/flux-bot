const {
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  UserSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits
} = require('discord.js');

const { getConfig, saveConfig } = require('../config');
const { hasAnyRole, isAdmin } = require('../utils/permissions');
const { buildFlopEmbed, fluxLabel } = require('../utils/embeds');
const { addBalance } = require('../utils/flux');
const Flop = require('../models/Flop');

const coinflip = require('../games/coinflip');
const blackjack = require('../games/blackjack');
const mines = require('../games/mines');
const lottery = require('../games/lottery');

module.exports = function registerInteractionHandler(client) {
  const configSessions = new Map();
  const hitSessions = new Map();
  const ctx = { configSessions, hitSessions };

  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction, ctx);
        return;
      }

      if (interaction.isRoleSelectMenu()) return handleRoleSelect(interaction);
      if (interaction.isChannelSelectMenu()) return handleChannelSelect(interaction);
      if (interaction.isUserSelectMenu()) return handleUserSelect(interaction);
      if (interaction.isButton()) return handleButton(interaction);
      if (interaction.isModalSubmit()) return handleModal(interaction);
    } catch (err) {
      console.error(err);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Something went wrong while processing that.', ephemeral: true }).catch(() => {});
      }
    }
  });

  // ---------------------------------------------------------------------
  // CONFIG FLOW
  // ---------------------------------------------------------------------
  async function handleRoleSelect(interaction) {
    const key = `${interaction.guild.id}:${interaction.user.id}`;
    const session = configSessions.get(key);
    if (!session) {
      return interaction.reply({ content: 'This configuration session has expired. Run `/config` again.', ephemeral: true });
    }

    if (interaction.customId === 'cfg_hit_roles') {
      session.hitRoles = interaction.values;
      const row = new ActionRowBuilder().addComponents(
        new ChannelSelectMenuBuilder()
          .setCustomId('cfg_hit_channels')
          .setPlaceholder('Select channel(s) where /flop can be used')
          .setChannelTypes(ChannelType.GuildText)
          .setMinValues(1)
          .setMaxValues(25)
      );
      return interaction.update({ content: '**Step 2/5:** Select the channel(s) where `/flop` can be used.', components: [row] });
    }

    if (interaction.customId === 'cfg_power_roles') {
      session.powerRoles = interaction.values;
      const row = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder().setCustomId('cfg_banker_roles').setPlaceholder('Select the Banker role(s)').setMinValues(1).setMaxValues(25)
      );
      return interaction.update({ content: '**Step 4/5:** Select the Banker role(s) — can add/withdraw Flux.', components: [row] });
    }

    if (interaction.customId === 'cfg_banker_roles') {
      session.bankerRoles = interaction.values;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cfg_emoji_button').setLabel('Set Flux Emoji').setStyle(ButtonStyle.Primary)
      );
      return interaction.update({ content: '**Step 5/5:** Click the button below to set the Flux emoji.', components: [row] });
    }
  }

  async function handleChannelSelect(interaction) {
    const key = `${interaction.guild.id}:${interaction.user.id}`;
    const session = configSessions.get(key);
    if (!session) {
      return interaction.reply({ content: 'This configuration session has expired. Run `/config` again.', ephemeral: true });
    }

    if (interaction.customId === 'cfg_hit_channels') {
      session.hitChannels = interaction.values;
      const row = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('cfg_power_roles')
          .setPlaceholder('Select the Power role(s) — can accept/reject flops')
          .setMinValues(1)
          .setMaxValues(25)
      );
      return interaction.update({ content: '**Step 3/5:** Select the Power role(s) that can accept or reject flops.', components: [row] });
    }
  }

  // ---------------------------------------------------------------------
  // FLOP SUBMISSION FLOW (formerly /hit)
  // ---------------------------------------------------------------------
  async function handleUserSelect(interaction) {
    const key = `${interaction.guild.id}:${interaction.user.id}`;
    const session = hitSessions.get(key);
    if (!session) {
      return interaction.reply({ content: 'This flop session has expired. Run `/flop` again.', ephemeral: true });
    }

    if (interaction.customId === 'hit_select_hitter') {
      session.hitterId = interaction.values[0];
      const row = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder().setCustomId('hit_select_mm').setPlaceholder('Select the Middleman').setMinValues(1).setMaxValues(1)
      );
      return interaction.update({ content: '**Step 2/5:** Who was the Middleman?', components: [row] });
    }

    if (interaction.customId === 'hit_select_mm') {
      session.middlemanId = interaction.values[0];
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('hit_milk_yes').setLabel('Yes').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('hit_milk_no').setLabel('No').setStyle(ButtonStyle.Danger)
      );
      return interaction.update({ content: '**Step 3/5:** Milk?', components: [row] });
    }
  }

  async function handleButton(interaction) {
    const id = interaction.customId;

    if (id === 'cfg_emoji_button') {
      const modal = new ModalBuilder().setCustomId('cfg_emoji_modal').setTitle('Set Flux Emoji');
      const input = new TextInputBuilder()
        .setCustomId('flux_emoji_input')
        .setLabel('Enter the Flux emoji (e.g. 💠 or <:flux:id>)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (id === 'hit_milk_yes' || id === 'hit_milk_no') {
      const key = `${interaction.guild.id}:${interaction.user.id}`;
      const session = hitSessions.get(key);
      if (!session) return interaction.reply({ content: 'This flop session has expired. Run `/flop` again.', ephemeral: true });
      session.milk = id === 'hit_milk_yes' ? 'Yes' : 'No';
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('hit_victim_yes').setLabel('Yes').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('hit_victim_no').setLabel('No').setStyle(ButtonStyle.Danger)
      );
      return interaction.update({ content: '**Step 4/5:** Did the victim join?', components: [row] });
    }

    if (id === 'hit_victim_yes' || id === 'hit_victim_no') {
      const key = `${interaction.guild.id}:${interaction.user.id}`;
      const session = hitSessions.get(key);
      if (!session) return interaction.reply({ content: 'This flop session has expired. Run `/flop` again.', ephemeral: true });
      session.victimJoined = id === 'hit_victim_yes' ? 'Yes' : 'No';
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('hit_enter_details').setLabel('Enter Flop Details').setStyle(ButtonStyle.Primary)
      );
      const imageNote = session.imageUrl ? '\n📷 An image is attached and will be included with the submitted flop.' : '';
      return interaction.update({ content: `**Step 5/5:** Click below to enter the flop details.${imageNote}`, components: [row] });
    }

    if (id === 'hit_enter_details') {
      const key = `${interaction.guild.id}:${interaction.user.id}`;
      const session = hitSessions.get(key);
      if (!session) return interaction.reply({ content: 'This flop session has expired. Run `/flop` again.', ephemeral: true });

      const modal = new ModalBuilder().setCustomId('hit_details_modal').setTitle('Flop Details');
      const input = new TextInputBuilder()
        .setCustomId('hit_description_input')
        .setLabel('What was the hit?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    if (id.startsWith('hit_accept_')) return handleFlopAccept(interaction, id.replace('hit_accept_', ''), false);
    if (id.startsWith('hit_ticket_')) return handleOpenTicket(interaction, id.replace('hit_ticket_', ''));
    if (id.startsWith('ticket_accept_')) return handleFlopAccept(interaction, id.replace('ticket_accept_', ''), true);
    if (id.startsWith('ticket_reject_')) return handleFlopReject(interaction, id.replace('ticket_reject_', ''));

    if (id.startsWith('cf_join_')) return coinflip.handleJoin(interaction, id.replace('cf_join_', ''));
    if (id.startsWith('cf_pickside_')) return coinflip.handlePickSide(interaction, id.replace('cf_pickside_', ''));
    if (id.startsWith('cf_side_')) {
      const rest = id.replace('cf_side_', '');
      const side = rest.endsWith('_heads') ? 'heads' : 'tails';
      const gameId = rest.replace(/_heads$|_tails$/, '');
      return coinflip.handleSideChoice(interaction, gameId, side);
    }
    if (id.startsWith('cf_bet_')) return coinflip.handleBet(interaction, id.replace('cf_bet_', ''));

    if (id.startsWith('bj_hit_')) return blackjack.handleHit(interaction, id.replace('bj_hit_', ''));
    if (id.startsWith('bj_stand_')) return blackjack.handleStand(interaction, id.replace('bj_stand_', ''));
    if (id.startsWith('bj_double_')) return blackjack.handleDouble(interaction, id.replace('bj_double_', ''));

    if (id.startsWith('mn_tile_')) {
      const rest = id.replace('mn_tile_', '');
      const lastUnderscore = rest.lastIndexOf('_');
      const gameId = rest.slice(0, lastUnderscore);
      const idx = parseInt(rest.slice(lastUnderscore + 1), 10);
      return mines.handleTile(interaction, gameId, idx);
    }
    if (id === 'lot_enter') return lottery.handleEnterButton(interaction);
  }

  async function handleModal(interaction) {
    if (interaction.customId === 'cfg_emoji_modal') {
      const key = `${interaction.guild.id}:${interaction.user.id}`;
      const session = configSessions.get(key);
      if (!session) return interaction.reply({ content: 'This configuration session has expired. Run `/config` again.', ephemeral: true });

      session.fluxEmoji = interaction.fields.getTextInputValue('flux_emoji_input').trim();
      await saveConfig(interaction.guild.id, session);
      configSessions.delete(key);
      return interaction.reply({ content: '✅ Configuration saved successfully!', ephemeral: true });
    }

    if (interaction.customId === 'hit_details_modal') {
      const key = `${interaction.guild.id}:${interaction.user.id}`;
      const session = hitSessions.get(key);
      if (!session) return interaction.reply({ content: 'This flop session has expired. Run `/flop` again.', ephemeral: true });

      session.description = interaction.fields.getTextInputValue('hit_description_input');

      const flop = await Flop.create({
        guildId: interaction.guild.id,
        channelId: session.channelId,
        hitterId: session.hitterId,
        middlemanId: session.middlemanId,
        creatorId: session.creatorId,
        description: session.description,
        imageUrl: session.imageUrl || null,
        milk: session.milk,
        victimJoined: session.victimJoined,
        status: 'pending'
      });

      const embed = buildFlopEmbed(flop);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`hit_accept_${flop._id}`).setLabel('Accept').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`hit_ticket_${flop._id}`).setLabel('Open Ticket').setStyle(ButtonStyle.Primary)
      );

      const channel = await interaction.guild.channels.fetch(session.channelId);
      const sentMsg = await channel.send({ embeds: [embed], components: [row] });
      flop.messageId = sentMsg.id;
      await flop.save();

      try {
        const hitterUser = await client.users.fetch(session.hitterId);
        await hitterUser.send({ content: 'A flop has been submitted involving you:', embeds: [embed] });
      } catch (e) {
        // DMs closed - ignore
      }

      hitSessions.delete(key);
      return interaction.reply({ content: '✅ Flop submitted!', ephemeral: true });
    }

    if (interaction.customId === 'lot_enter_modal') {
      return lottery.handleEnterModal(interaction);
    }
  }

  // ---------------------------------------------------------------------
  // ACCEPT / REJECT / TICKET LOGIC
  // ---------------------------------------------------------------------
  async function handleFlopAccept(interaction, flopId, fromTicket) {
    const config = await getConfig(interaction.guild.id);
    if (!isAdmin(interaction.member) && !hasAnyRole(interaction.member, config.powerRoles)) {
      return interaction.reply({ content: 'You do not have permission to accept flops.', ephemeral: true });
    }

    const flop = await Flop.findById(flopId);
    if (!flop) return interaction.reply({ content: 'Flop not found.', ephemeral: true });
    if (flop.status !== 'pending') return interaction.reply({ content: 'This flop has already been resolved.', ephemeral: true });

    flop.status = 'accepted';
    await flop.save();
    const embed = buildFlopEmbed(flop);

    try {
      const channel = await interaction.guild.channels.fetch(flop.channelId);
      const msg = await channel.messages.fetch(flop.messageId);
      await msg.edit({ embeds: [embed], components: [] });
    } catch (e) {
      // original message may have been deleted - ignore
    }

    const newBal = await addBalance(interaction.guild.id, flop.hitterId, 100);

    try {
      const hitterUser = await client.users.fetch(flop.hitterId);
      await hitterUser.send({
        content: `✅ Your flop was **accepted**! You received **100 ${fluxLabel(config)}**. New balance: **${newBal}**.`,
        embeds: [embed]
      });
    } catch (e) {
      // DMs closed - ignore
    }

    if (fromTicket) {
      await interaction.update({ content: '✅ Flop accepted. This ticket will close shortly.', components: [] });
      if (flop.ticketChannelId) {
        setTimeout(async () => {
          try {
            const ticketChannel = await interaction.guild.channels.fetch(flop.ticketChannelId);
            await ticketChannel.delete();
          } catch (e) {
            // already deleted - ignore
          }
        }, 5000);
      }
    } else {
      await interaction.reply({ content: '✅ Flop accepted.', ephemeral: true });
    }
  }

  async function handleFlopReject(interaction, flopId) {
    const config = await getConfig(interaction.guild.id);
    if (!isAdmin(interaction.member) && !hasAnyRole(interaction.member, config.powerRoles)) {
      return interaction.reply({ content: 'You do not have permission to reject flops.', ephemeral: true });
    }

    const flop = await Flop.findById(flopId);
    if (!flop) return interaction.reply({ content: 'Flop not found.', ephemeral: true });
    if (flop.status !== 'pending') return interaction.reply({ content: 'This flop has already been resolved.', ephemeral: true });

    flop.status = 'rejected';
    await flop.save();
    const embed = buildFlopEmbed(flop);

    try {
      const channel = await interaction.guild.channels.fetch(flop.channelId);
      const msg = await channel.messages.fetch(flop.messageId);
      await msg.edit({ embeds: [embed], components: [] });
    } catch (e) {
      // original message may have been deleted - ignore
    }

    const newBal = await addBalance(interaction.guild.id, flop.hitterId, -50);

    try {
      const hitterUser = await client.users.fetch(flop.hitterId);
      await hitterUser.send({
        content: `❌ Your flop was **rejected**. **50 ${fluxLabel(config)}** was deducted. New balance: **${newBal}**.`,
        embeds: [embed]
      });
    } catch (e) {
      // DMs closed - ignore
    }

    await interaction.update({ content: '❌ Flop rejected. This ticket will close shortly.', components: [] });

    if (flop.ticketChannelId) {
      setTimeout(async () => {
        try {
          const ticketChannel = await interaction.guild.channels.fetch(flop.ticketChannelId);
          await ticketChannel.delete();
        } catch (e) {
          // already deleted - ignore
        }
      }, 5000);
    }
  }

  async function handleOpenTicket(interaction, flopId) {
    const config = await getConfig(interaction.guild.id);
    if (!isAdmin(interaction.member) && !hasAnyRole(interaction.member, config.powerRoles)) {
      return interaction.reply({ content: 'You do not have permission to open a ticket.', ephemeral: true });
    }

    const flop = await Flop.findById(flopId);
    if (!flop) return interaction.reply({ content: 'Flop not found.', ephemeral: true });
    if (flop.status !== 'pending') return interaction.reply({ content: 'This flop has already been resolved.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const overwrites = [
      { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: flop.hitterId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      { id: flop.middlemanId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
    ];

    const ticketChannel = await interaction.guild.channels.create({
      name: `flop-ticket-${flop._id}`,
      type: ChannelType.GuildText,
      permissionOverwrites: overwrites
    });

    flop.ticketChannelId = ticketChannel.id;
    await flop.save();
    const embed = buildFlopEmbed(flop);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ticket_accept_${flop._id}`).setLabel('Accept Hit').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`ticket_reject_${flop._id}`).setLabel('Reject & Close Ticket').setStyle(ButtonStyle.Danger)
    );

    await ticketChannel.send({
      content: `<@${flop.hitterId}> <@${flop.middlemanId}> <@${interaction.user.id}>`,
      embeds: [embed],
      components: [row]
    });

    await interaction.editReply({ content: `🎫 Ticket opened: ${ticketChannel}` });
  }

  return ctx;
};
