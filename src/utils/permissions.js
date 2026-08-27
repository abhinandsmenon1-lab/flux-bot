const { PermissionFlagsBits } = require('discord.js');

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

function hasAnyRole(member, roleIds) {
  if (!roleIds || roleIds.length === 0) return false;
  return roleIds.some((id) => member.roles.cache.has(id));
}

module.exports = { isAdmin, hasAnyRole };
