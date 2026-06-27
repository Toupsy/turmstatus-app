function passwordHashRounds() {
  const configured = Number.parseInt(process.env.BCRYPT_ROUNDS || '', 10);
  if (Number.isInteger(configured) && configured >= 4 && configured <= 15) return configured;
  return process.env.NODE_ENV === 'test' ? 4 : 10;
}

module.exports = { passwordHashRounds };
