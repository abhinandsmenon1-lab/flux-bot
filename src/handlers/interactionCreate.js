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
const { buildHitEmbed, fluxLabel } = require('../utils/embeds');
const { addBalance } = require('../utils/flux');
const db = require('../database');

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

function armExpiry(map, key) {
  setTimeout(() => map.delete(key), SESSION_TTL_MS);
}

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
          .setPlaceholder('Select channel(s) where /hit can be used')
          .setChannelTypes(ChannelType.GuildText)
          .setMinValues(1)
          .setMaxValues(25)
      );
      return interaction.update({ content: '**Step 2/5:** Select the channel(s) where `/hit` can be used.', components: [row] });
    }

    if (interaction.customId === 'cfg_power_roles') {
      session.powerRoles = interaction.values;
      const row = new ActionRowBuilder().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId('cfg_banker_roles')
          .setPlaceholder('Select the Banker role(s)')
          .setMinValues(1)
          .setMaxValues(25)
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
          .setPlaceholder('Select the Power role(s) — can accept/reject hits')
          .setMinValues(1)
          .setMaxValues(25)
      );
      return interaction.update({ content: '**Step 3/5:** Select the Power role(s) that can accept or reject hits.', components: [row] });
    }
  }

  // ---------------------------------------------------------------------
  // HIT SUBMISSION FLOW
  // ---------------------------------------------------------------------
  async function handleUserSelect(interaction) {
    const key = `${interaction.guild.id}:${interaction.user.id}`;
    const session = hitSessions.get(key);
    if (!session) {
      return interaction.reply({ content: 'This hit session has expired. Run `/hit` again.', ephemeral: true });
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

    // --- config: emoji button opens a modal ---
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

    // --- hit flow: milk yes/no ---
    if (id === 'hit_milk_yes' || id === 'hit_milk_no') {
      const key = `${interaction.guild.id}:${interaction.user.id}`;
      const session = hitSessions.get(key);
      if (!session) return interaction.reply({ content: 'This hit session has expired. Run `/hit` again.', ephemeral: true });
      session.milk = id === 'hit_milk_yes' ? 'Yes' : 'No';
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('hit_victim_yes').setLabel('Yes').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('hit_victim_no').setLabel('No').setStyle(ButtonStyle.Danger)
      );
      return interaction.update({ content: '**Step 4/5:** Did the victim join?', components: [row] });
    }

    // --- hit flow: victim joined yes/no ---
    if (id === 'hit_victim_yes' || id === 'hit_victim_no') {
      const key = `${interaction.guild.id}:${interaction.user.id}`;
      const session = hitSessions.get(key);
      if (!session) return interaction.reply({ content: 'This hit session has expired. Run `/hit` again.', ephemeral: true });
      session.victimJoined = id === 'hit_victim_yes' ? 'Yes' : 'No';
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('hit_enter_details').setLabel('Enter Hit Details').setStyle(ButtonStyle.Primary)
      );
      return interaction.update({ content: '**Step 5/5:** Click below to enter the hit details.', components: [row] });
    }

    // --- hit flow: open the description modal ---
    if (id === 'hit_enter_details') {
      const key = `${interaction.guild.id}:${interaction.user.id}`;
      const session = hitSessions.get(key);
      if (!session) return interaction.reply({ content: 'This hit session has expired. Run `/hit` again.', ephemeral: true });

      const modal = new ModalBuilder().setCustomId('hit_details_modal').setTitle('Hit Details');
      const input = new TextInputBuilder()
        .setCustomId('hit_description_input')
        .setLabel('What was the hit?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // --- accept from the main channel embed ---
    if (id.startsWith('hit_accept_')) {
      return handleHitAccept(interaction, id.replace('hit_accept_', ''), false);
    }

    // --- open a private ticket ---
    if (id.startsWith('hit_ticket_')) {
      return handleOpenTicket(interaction, id.replace('hit_ticket_', ''));
    }

    // --- accept from inside a ticket ---
    if (id.startsWith('ticket_accept_')) {
      return handleHitAccept(interaction, id.replace('ticket_accept_', ''), true);
    }

    // --- reject + close ticket ---
    if (id.startsWith('ticket_reject_')) {
      return handleHitReject(interaction, id.replace('ticket_reject_', ''));
    }
  }

  async function handleModal(interaction) {
    if (interaction.customId === 'cfg_emoji_modal') {
      const key = `${interaction.guild.id}:${interaction.user.id}`;
      const session = configSessions.get(key);
      if (!session) return interaction.reply({ content: 'This configuration session has expired. Run `/config` again.', ephemeral: true });

      session.fluxEmoji = interaction.fields.getTextInputValue('flux_emoji_input').trim();
      saveConfig(interaction.guild.id, session);
      configSessions.delete(key);
      return interaction.reply({ content: '✅ Configuration saved successfully!', ephemeral: true });
    }

    if (interaction.customId === 'hit_details_modal') {
      const key = `${interaction.guild.id}:${interaction.user.id}`;
      const session = hitSessions.get(key);
      if (!session) return interaction.reply({ content: 'This hit session has expired. Run `/hit` again.', ephemeral: true });

      session.description = interaction.fields.getTextInputValue('hit_description_input');

      const info = db
        .prepare(
          `INSERT INTO hits (guild_id, channel_id, hitter_id, middleman_id, creator_id, description, milk, victim_joined, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
        )
        .run(
          interaction.guild.id,
          session.channelId,
          session.hitterId,
          session.middlemanId,
          session.creatorId,
          session.description,
          session.milk,
          session.victimJoined
        );

      const hitId = info.lastInsertRowid;
      const hit = db.prepare('SELECT * FROM hits WHERE id = ?').get(hitId);
      const embed = buildHitEmbed(hit);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`hit_accept_${hitId}`).setLabel('Accept').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`hit_ticket_${hitId}`).setLabel('Open Ticket').setStyle(ButtonStyle.Primary)
      );

      const channel = await interaction.guild.channels.fetch(session.channelId);
      const sentMsg = await channel.send({ embeds: [embed], components: [row] });
      db.prepare('UPDATE hits SET message_id = ? WHERE id = ?').run(sentMsg.id, hitId);

      try {
        const hitterUser = await client.users.fetch(session.hitterId);
        await hitterUser.send({ content: 'A hit has been submitted involving you:', embeds: [embed] });
      } catch (e) {
        // DMs closed - ignore
      }

      hitSessions.delete(key);
      return interaction.reply({ content: '✅ Hit submitted!', ephemeral: true });
    }
  }

  // ---------------------------------------------------------------------
  // ACCEPT / REJECT / TICKET LOGIC
  // ---------------------------------------------------------------------
  async function handleHitAccept(interaction, hitId, fromTicket) {
    const config = getConfig(interaction.guild.id);
    if (!isAdmin(interaction.member) && !hasAnyRole(interaction.member, config.powerRoles)) {
      return interaction.reply({ content: 'You do not have permission to accept hits.', ephemeral: true });
    }

    const hit = db.prepare('SELECT * FROM hits WHERE id = ?').get(hitId);
    if (!hit) return interaction.reply({ content: 'Hit not found.', ephemeral: true });
    if (hit.status !== 'pending') return interaction.reply({ content: 'This hit has already been resolved.', ephemeral: true });

    db.prepare('UPDATE hits SET status = ? WHERE id = ?').run('accepted', hitId);
    const updatedHit = db.prepare('SELECT * FROM hits WHERE id = ?').get(hitId);
    const embed = buildHitEmbed(updatedHit);

    // edit the original hit message in the hit channel
    try {
      const channel = await interaction.guild.channels.fetch(hit.channel_id);
      const msg = await channel.messages.fetch(hit.message_id);
      await msg.edit({ embeds: [embed], components: [] });
    } catch (e) {
      // original message may have been deleted - ignore
    }

    const newBal = addBalance(interaction.guild.id, hit.hitter_id, 100);

    try {
      const hitterUser = await client.users.fetch(hit.hitter_id);
      await hitterUser.send({
        content: `✅ Your hit was **accepted**! You received **100 ${fluxLabel(config)}**. New balance: **${newBal}**.`,
        embeds: [embed]
      });
    } catch (e) {
      // DMs closed - ignore
    }

    if (fromTicket) {
      await interaction.update({ content: '✅ Hit accepted. This ticket will close shortly.', components: [] });
      if (hit.ticket_channel_id) {
        setTimeout(async () => {
          try {
            const ticketChannel = await interaction.guild.channels.fetch(hit.ticket_channel_id);
            await ticketChannel.delete();
          } catch (e) {
            // already deleted - ignore
          }
        }, 5000);
      }
    } else {
      await interaction.reply({ content: '✅ Hit accepted.', ephemeral: true });
    }
  }

  async function handleHitReject(interaction, hitId) {
    const config = getConfig(interaction.guild.id);
    if (!isAdmin(interaction.member) && !hasAnyRole(interaction.member, config.powerRoles)) {
      return interaction.reply({ content: 'You do not have permission to reject hits.', ephemeral: true });
    }

    const hit = db.prepare('SELECT * FROM hits WHERE id = ?').get(hitId);
    if (!hit) return interaction.reply({ content: 'Hit not found.', ephemeral: true });
    if (hit.status !== 'pending') return interaction.reply({ content: 'This hit has already been resolved.', ephemeral: true });

    db.prepare('UPDATE hits SET status = ? WHERE id = ?').run('rejected', hitId);
    const updatedHit = db.prepare('SELECT * FROM hits WHERE id = ?').get(hitId);
    const embed = buildHitEmbed(updatedHit);

    try {
      const channel = await interaction.guild.channels.fetch(hit.channel_id);
      const msg = await channel.messages.fetch(hit.message_id);
      await msg.edit({ embeds: [embed], components: [] });
    } catch (e) {
      // original message may have been deleted - ignore
    }

    const newBal = addBalance(interaction.guild.id, hit.hitter_id, -50);

    try {
      const hitterUser = await client.users.fetch(hit.hitter_id);
      await hitterUser.send({
        content: `❌ Your hit was **rejected**. **50 ${fluxLabel(config)}** was deducted. New balance: **${newBal}**.`,
        embeds: [embed]
      });
    } catch (e) {
      // DMs closed - ignore
    }

    await interaction.update({ content: '❌ Hit rejected. This ticket will close shortly.', components: [] });

    if (hit.ticket_channel_id) {
      setTimeout(async () => {
        try {
          const ticketChannel = await interaction.guild.channels.fetch(hit.ticket_channel_id);
          await ticketChannel.delete();
        } catch (e) {
          // already deleted - ignore
        }
      }, 5000);
    }
  }

  async function handleOpenTicket(interaction, hitId) {
    const config = getConfig(interaction.guild.id);
    if (!isAdmin(interaction.member) && !hasAnyRole(interaction.member, config.powerRoles)) {
      return interaction.reply({ content: 'You do not have permission to open a ticket.', ephemeral: true });
    }

    const hit = db.prepare('SELECT * FROM hits WHERE id = ?').get(hitId);
    if (!hit) return interaction.reply({ content: 'Hit not found.', ephemeral: true });
    if (hit.status !== 'pending') return interaction.reply({ content: 'This hit has already been resolved.', ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const overwrites = [
      { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: hit.hitter_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      { id: hit.middleman_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
    ];

    const ticketChannel = await interaction.guild.channels.create({
      name: `hit-ticket-${hitId}`,
      type: ChannelType.GuildText,
      permissionOverwrites: overwrites
    });

    db.prepare('UPDATE hits SET ticket_channel_id = ? WHERE id = ?').run(ticketChannel.id, hitId);
    const updatedHit = db.prepare('SELECT * FROM hits WHERE id = ?').get(hitId);
    const embed = buildHitEmbed(updatedHit);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ticket_accept_${hitId}`).setLabel('Accept Hit').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`ticket_reject_${hitId}`).setLabel('Reject & Close Ticket').setStyle(ButtonStyle.Danger)
    );

    await ticketChannel.send({
      content: `<@${hit.hitter_id}> <@${hit.middleman_id}> <@${interaction.user.id}>`,
      embeds: [embed],
      components: [row]
    });

    await interaction.editReply({ content: `🎫 Ticket opened: ${ticketChannel}` });
  }

  return ctx;
};
