import { Router } from 'express';
import { one, many, tx } from '../db.js';
import { fail, requireAuth, requireVerified } from '../middleware.js';
import { validate, idParam } from '../validate.js';
import { acceptFiles } from '../uploads.js';
import { notify } from '../notify.js';

const router = Router();

