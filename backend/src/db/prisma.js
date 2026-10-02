require('../config/env'); // make sure .env is loaded before Prisma reads DATABASE_URL
const { PrismaClient } = require('@prisma/client');

module.exports = new PrismaClient();
