const { z } = require('zod');

const email = z.string().email().max(254);

const signupSchema = z.object({
  email,
  // bcrypt only uses the first 72 bytes, so cap there
  password: z.string().min(8).max(72),
  name: z.string().trim().min(1).max(80).optional(),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1).max(72),
});

module.exports = { signupSchema, loginSchema };
