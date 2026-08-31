import 'dotenv/config';
import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

const CLIENT_ID = '1543237982918672394';
const TOKEN = process.env.DISCORD_TOKEN;

const commands = [
  new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your current credit balance (or someone else if admin)')
    .addUserOption(opt => 
      opt.setName('user').setDescription('Check another user balance (Admin only)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('deposit')
    .setDescription('[ADMIN ONLY] Add balance to a user')
    .addUserOption(opt => 
      opt.setName('user').setDescription('The user to deposit money for').setRequired(true))
    .addIntegerOption(opt => 
      opt.setName('amount').setDescription('Amount of credits to add').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('withdraw')
    .setDescription('[ADMIN ONLY] Deduct/withdraw balance from a user')
    .addUserOption(opt => 
      opt.setName('user').setDescription('The user to withdraw money from').setRequired(true))
    .addIntegerOption(opt => 
      opt.setName('amount').setDescription('Amount of credits to withdraw').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Play MegaFruit Slots')
    .addIntegerOption(opt => 
      opt.setName('bet').setDescription('Bet amount (min 10)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('plinko')
    .setDescription('Drop a Plinko ball')
    .addIntegerOption(opt => 
      opt.setName('bet').setDescription('Bet amount (min 10)').setRequired(true))
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);
const applicationCommandsRoute = Routes.applicationCommands(CLIENT_ID);
const WRITABLE_COMMAND_FIELDS = [
  'name', 'name_localizations', 'description', 'description_localizations',
  'options', 'default_member_permissions', 'dm_permission', 'nsfw', 'type',
  'integration_types', 'contexts', 'handler',
];

function writableCommand(command) {
  return Object.fromEntries(
    WRITABLE_COMMAND_FIELDS
      .filter((field) => command[field] !== undefined)
      .map((field) => [field, command[field]]),
  );
}

(async () => {
  try {
    console.log('Registering updated slash commands...');
    const existingCommands = await rest.get(applicationCommandsRoute);
    const entryPoint = existingCommands.find((command) => command.type === 4);
    const body = entryPoint
      ? [writableCommand(entryPoint), ...commands]
      : commands;
    if (entryPoint) console.log('Preserving Activity Entry Point command: ' + entryPoint.name);
    await rest.put(applicationCommandsRoute, { body });
    console.log('Slash commands updated successfully!');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
})();
