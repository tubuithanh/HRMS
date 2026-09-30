import { z } from 'zod';
import { updatePersonSchema } from './person-sub.schema';

export type UpdatePersonInput = z.infer<typeof updatePersonSchema>;
