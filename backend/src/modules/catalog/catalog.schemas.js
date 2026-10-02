const { z } = require('zod');

const titleSchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().min(1).max(2000),
  year: z.number().int().min(1888).max(2100),
  durationMin: z.number().int().min(1).max(1000).optional(),
  popularity: z.number().int().min(0).optional(),
  posterUrl: z.string().url().optional(),
  videoUrl: z.string().url().optional(),
  genres: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
});

const updateTitleSchema = titleSchema.partial();

const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  genre: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

module.exports = { titleSchema, updateTitleSchema, listQuerySchema };
